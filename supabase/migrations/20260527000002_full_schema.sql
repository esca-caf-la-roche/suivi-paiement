-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002 — Schéma complet : liens, groupes, inscrits, statuts, audit
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- Prérequis : migration 001 (table responsibles + fonction is_responsible())
-- ─────────────────────────────────────────────────────────────────────────────

-- ===========================================================================
-- 1. HELLOASSO_LINKS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helloasso_links (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  url            text        NOT NULL UNIQUE,
  label          text        NOT NULL,
  responsible_id uuid        NOT NULL REFERENCES public.responsibles(id) ON DELETE RESTRICT,
  parent_link_id uuid        REFERENCES public.helloasso_links(id) ON DELETE RESTRICT,
  -- NULL  → lien principal (paiement 1x ou dossier parent 3x)
  -- non-NULL → lien d'échéance 3x rattaché à son parent
  is_installment boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Contrainte : un lien avec parent_link_id doit avoir is_installment = true
ALTER TABLE public.helloasso_links
  ADD CONSTRAINT helloasso_links_installment_check
  CHECK (
    (parent_link_id IS NULL)
    OR
    (parent_link_id IS NOT NULL AND is_installment = true)
  );

-- Contrainte : un lien ne peut pas être son propre parent
ALTER TABLE public.helloasso_links
  ADD CONSTRAINT helloasso_links_no_self_ref
  CHECK (id != parent_link_id);

ALTER TABLE public.helloasso_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "helloasso_links_all_responsibles"
  ON public.helloasso_links
  FOR ALL
  USING (public.is_responsible());


-- ===========================================================================
-- 2. GROUPS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.groups (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name    text NOT NULL,
  link_id uuid NOT NULL REFERENCES public.helloasso_links(id) ON DELETE RESTRICT
  -- Doit pointer vers un lien principal (parent_link_id IS NULL).
  -- Contrainte applicative : vérifiée côté code / trigger si nécessaire.
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_all_responsibles"
  ON public.groups
  FOR ALL
  USING (public.is_responsible());


-- ===========================================================================
-- 3. REGISTRANTS  (cache synchronisé depuis HelloAsso — upsert)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.registrants (
  helloasso_payment_id text        PRIMARY KEY,
  helloasso_link_id    uuid        NOT NULL REFERENCES public.helloasso_links(id) ON DELETE RESTRICT,
  first_name           text        NOT NULL,
  last_name            text        NOT NULL,
  email                text,
  phone                text,
  payer_first_name     text        NOT NULL,
  payer_last_name      text        NOT NULL,
  payer_email          text        NOT NULL,  -- clé de regroupement pour les 3x
  payment_date         timestamptz NOT NULL,
  amount               numeric(10,2) NOT NULL,
  helloasso_status     text        NOT NULL,  -- "Authorized", "Refunded", "Refused", etc.
  synced_at            timestamptz NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS registrants_payer_email_idx
  ON public.registrants(payer_email);

CREATE INDEX IF NOT EXISTS registrants_link_id_idx
  ON public.registrants(helloasso_link_id);

CREATE INDEX IF NOT EXISTS registrants_payment_date_idx
  ON public.registrants(payment_date);

ALTER TABLE public.registrants ENABLE ROW LEVEL SECURITY;

-- La sync se fait via Edge Function (service_role, bypass RLS).
-- Les responsibles peuvent lire pour afficher la liste.
CREATE POLICY "registrants_select_responsibles"
  ON public.registrants
  FOR SELECT
  USING (public.is_responsible());

-- INSERT / UPDATE réservés à service_role (Edge Function)
-- Pas de policy INSERT/UPDATE pour les users normaux → bloqué par RLS.


-- ===========================================================================
-- 4. PAYMENTS_STATUS  (statut local — créé seulement à la 1ʳᵉ action)
-- ===========================================================================
--
-- Pattern "absence = à traiter" :
--   Pas de ligne ici ⇒ statut implicite "À traiter"
--   Une ligne est créée uniquement lors de la première action de l'encadrant.
-- ─────────────────────────────────────────────────────────────────────────────

-- Type énuméré pour les statuts locaux
DO $$ BEGIN
  CREATE TYPE public.payment_status_enum AS ENUM (
    'Traité',
    'En attente',
    'Remboursé',
    'Problème'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.payments_status (
  helloasso_payment_id text                    PRIMARY KEY
    REFERENCES public.registrants(helloasso_payment_id) ON DELETE CASCADE,
  -- dossier_key :
  --   paiements 3x → payer_email || '::' || parent_link_id (du lien rattaché)
  --   paiements 1x → helloasso_payment_id
  -- Calculé et fourni par le frontend avant l'upsert.
  dossier_key          text                    NOT NULL,
  status               public.payment_status_enum NOT NULL,
  comment              text,
  updated_by           uuid                    NOT NULL REFERENCES public.responsibles(id),
  updated_at           timestamptz             NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_status_dossier_key_idx
  ON public.payments_status(dossier_key);

ALTER TABLE public.payments_status ENABLE ROW LEVEL SECURITY;

-- Les deux responsibles peuvent tout faire
CREATE POLICY "payments_status_all_responsibles"
  ON public.payments_status
  FOR ALL
  USING (public.is_responsible());


-- ===========================================================================
-- 5. PAYMENTS_STATUS_HISTORY  (audit — alimenté par trigger)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.payments_status_history (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  helloasso_payment_id text        NOT NULL,
  -- Pas de FK vers registrants : on conserve l'historique même après vidage saison
  old_status           text,       -- NULL = première action sur ce paiement
  new_status           text        NOT NULL,
  comment              text,
  updated_by           uuid        NOT NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_status_history_payment_idx
  ON public.payments_status_history(helloasso_payment_id);

CREATE INDEX IF NOT EXISTS payments_status_history_updated_at_idx
  ON public.payments_status_history(updated_at DESC);

ALTER TABLE public.payments_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_status_history_select_responsibles"
  ON public.payments_status_history
  FOR SELECT
  USING (public.is_responsible());

-- INSERT uniquement via trigger (service_role context) → pas de policy INSERT user


-- ===========================================================================
-- 6. TRIGGER D'AUDIT sur payments_status
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.audit_payments_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payments_status_history (
    helloasso_payment_id,
    old_status,
    new_status,
    comment,
    updated_by,
    updated_at
  ) VALUES (
    NEW.helloasso_payment_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status::text END,
    NEW.status::text,
    NEW.comment,
    NEW.updated_by,
    NEW.updated_at
  );
  RETURN NEW;
END;
$$;

-- Trigger après INSERT ou UPDATE
DROP TRIGGER IF EXISTS trg_audit_payments_status ON public.payments_status;

CREATE TRIGGER trg_audit_payments_status
  AFTER INSERT OR UPDATE ON public.payments_status
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_payments_status();


-- ===========================================================================
-- 7. SEASON_RESETS  (log des réinitialisations — optionnel)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.season_resets (
  id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reset_at timestamptz NOT NULL DEFAULT now(),
  reset_by uuid        NOT NULL REFERENCES public.responsibles(id)
);

ALTER TABLE public.season_resets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "season_resets_all_responsibles"
  ON public.season_resets
  FOR ALL
  USING (public.is_responsible());


-- ===========================================================================
-- 8. FONCTION UTILITAIRE : reset saison
-- ===========================================================================
--
-- À appeler via un RPC depuis le frontend (service_role pas nécessaire ici
-- car la fonction est SECURITY DEFINER et on vérifie l'appelant).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérification : seul un responsible peut déclencher le reset
  IF NOT public.is_responsible() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Vidage des tables de la saison (ordre respectant les FK)
  DELETE FROM public.payments_status_history;
  DELETE FROM public.payments_status;
  DELETE FROM public.registrants;

  -- Log du reset
  INSERT INTO public.season_resets (reset_by)
  VALUES (auth.uid());
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RÉCAPITULATIF DES TABLES CRÉÉES
-- ─────────────────────────────────────────────────────────────────────────────
-- ✓ helloasso_links    — liens HelloAsso (1x et 3x)
-- ✓ groups             — groupes de cours rattachés à un lien
-- ✓ registrants        — cache des paiements HelloAsso (upsert par Edge Function)
-- ✓ payments_status    — statut local posé par les encadrants
-- ✓ payments_status_history — audit automatique via trigger
-- ✓ season_resets      — log des réinitialisations de saison
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS activé sur toutes les tables.
-- Politiques : is_responsible() pour SELECT/INSERT/UPDATE/DELETE
-- Exception : INSERT/UPDATE sur registrants réservé au service_role (Edge Function)
-- ─────────────────────────────────────────────────────────────────────────────
