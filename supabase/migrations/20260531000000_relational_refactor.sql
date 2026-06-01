-- ─────────────────────────────────────────────────────────────────────────────
-- Migration — Refonte relationnelle HelloAsso (Dossiers et Transactions)
-- ─────────────────────────────────────────────────────────────────────────────

-- ===========================================================================
-- 1. CRÉATION DE LA TABLE DOSSIERS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.dossiers (
  id                   text        PRIMARY KEY, -- ID du premier paiement HelloAsso de la commande
  helloasso_link_id    uuid        NOT NULL REFERENCES public.helloasso_links(id) ON DELETE RESTRICT,
  first_name           text        NOT NULL,
  last_name            text        NOT NULL,
  email                text,
  phone                text,
  payer_first_name     text        NOT NULL,
  payer_last_name      text        NOT NULL,
  payer_email          text        NOT NULL,
  total_amount         numeric(10,2) NOT NULL,
  local_status         public.payment_status_enum, -- NULL = À traiter
  comment              text,
  updated_by           uuid        REFERENCES public.responsibles(id),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Index pour accélérer les recherches et jointures
CREATE INDEX IF NOT EXISTS dossiers_payer_email_idx ON public.dossiers(payer_email);
CREATE INDEX IF NOT EXISTS dossiers_helloasso_link_id_idx ON public.dossiers(helloasso_link_id);

-- Activation de RLS
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dossiers_all_responsibles"
  ON public.dossiers
  FOR ALL
  USING (public.is_responsible());


-- ===========================================================================
-- 2. CRÉATION DE LA TABLE TRANSACTIONS
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.helloasso_transactions (
  helloasso_payment_id text        PRIMARY KEY,
  dossier_id           text        NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  amount               numeric(10,2) NOT NULL,
  payment_date         timestamptz NOT NULL,
  helloasso_status     text        NOT NULL, -- "Authorized", "Refunded", "Refused", etc.
  synced_at            timestamptz NOT NULL DEFAULT now()
);

-- Index pour accélérer les jointures
CREATE INDEX IF NOT EXISTS helloasso_transactions_dossier_id_idx ON public.helloasso_transactions(dossier_id);
CREATE INDEX IF NOT EXISTS helloasso_transactions_payment_date_idx ON public.helloasso_transactions(payment_date);

-- Activation de RLS
ALTER TABLE public.helloasso_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "helloasso_transactions_select_responsibles"
  ON public.helloasso_transactions
  FOR SELECT
  USING (public.is_responsible());


-- ===========================================================================
-- 3. MIGRATION DES DONNÉES EXISTANTES
-- ===========================================================================

-- A. Migration des dossiers
WITH first_payments AS (
  SELECT DISTINCT ON (COALESCE(helloasso_order_id, helloasso_payment_id))
    COALESCE(helloasso_order_id, helloasso_payment_id) as dossier_id,
    helloasso_link_id,
    first_name,
    last_name,
    email,
    phone,
    payer_first_name,
    payer_last_name,
    payer_email,
    amount,
    payment_date
  FROM public.registrants
  ORDER BY COALESCE(helloasso_order_id, helloasso_payment_id), payment_date ASC
),
dossier_statuses AS (
  SELECT DISTINCT ON (COALESCE(r.helloasso_order_id, r.helloasso_payment_id))
    COALESCE(r.helloasso_order_id, r.helloasso_payment_id) as dossier_id,
    ps.status,
    ps.comment,
    ps.updated_by,
    ps.updated_at
  FROM public.payments_status ps
  JOIN public.registrants r ON r.helloasso_payment_id = ps.helloasso_payment_id
  ORDER BY COALESCE(r.helloasso_order_id, r.helloasso_payment_id), ps.updated_at DESC
)
INSERT INTO public.dossiers (
  id,
  helloasso_link_id,
  first_name,
  last_name,
  email,
  phone,
  payer_first_name,
  payer_last_name,
  payer_email,
  total_amount,
  local_status,
  comment,
  updated_by,
  updated_at
)
SELECT 
  fp.dossier_id,
  fp.helloasso_link_id,
  fp.first_name,
  fp.last_name,
  fp.email,
  fp.phone,
  fp.payer_first_name,
  fp.payer_last_name,
  fp.payer_email,
  -- Calcul du montant prévu
  CASE 
    WHEN hl.is_installment THEN fp.amount * 3 
    ELSE fp.amount 
  END as total_amount,
  ds.status,
  ds.comment,
  ds.updated_by,
  COALESCE(ds.updated_at, fp.payment_date)
FROM first_payments fp
JOIN public.helloasso_links hl ON hl.id = fp.helloasso_link_id
LEFT JOIN dossier_statuses ds ON ds.dossier_id = fp.dossier_id
ON CONFLICT (id) DO NOTHING;

-- B. Migration des transactions
INSERT INTO public.helloasso_transactions (
  helloasso_payment_id,
  dossier_id,
  amount,
  payment_date,
  helloasso_status,
  synced_at
)
SELECT 
  helloasso_payment_id,
  COALESCE(helloasso_order_id, helloasso_payment_id) as dossier_id,
  amount,
  payment_date,
  helloasso_status,
  synced_at
FROM public.registrants
ON CONFLICT (helloasso_payment_id) DO NOTHING;


-- ===========================================================================
-- 4. MISE À JOUR DU SYSTÈME D'AUDIT & RPC
-- ===========================================================================

-- A. Fonction RPC de reset saison
CREATE OR REPLACE FUNCTION public.reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Seul un responsible peut déclencher le reset
  IF NOT public.is_responsible() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Vidage des tables de la saison
  DELETE FROM public.payments_status_history;
  DELETE FROM public.helloasso_transactions;
  DELETE FROM public.dossiers;

  -- Log du reset
  INSERT INTO public.season_resets (reset_by)
  VALUES (auth.uid());
END;
$$;

-- B. Trigger d'audit mis à jour
CREATE OR REPLACE FUNCTION public.audit_payments_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payments_status_history (
    helloasso_payment_id, -- stocke le dossier_id (ID du premier paiement)
    old_status,
    new_status,
    comment,
    updated_by,
    updated_at
  ) VALUES (
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.local_status::text END,
    NEW.local_status::text,
    NEW.comment,
    NEW.updated_by,
    NEW.updated_at
  );
  RETURN NEW;
END;
$$;

-- C. Assignation du trigger à la table dossiers
DROP TRIGGER IF EXISTS trg_audit_payments_status ON public.payments_status;
DROP TRIGGER IF EXISTS trg_audit_payments_status ON public.dossiers;

CREATE TRIGGER trg_audit_payments_status
  AFTER UPDATE OF local_status, comment ON public.dossiers
  FOR EACH ROW
  WHEN (OLD.local_status IS DISTINCT FROM NEW.local_status OR OLD.comment IS DISTINCT FROM NEW.comment)
  EXECUTE FUNCTION public.audit_payments_status();


-- ===========================================================================
-- 5. NETTOYAGE DES ANCIENNES TABLES
-- ===========================================================================
DROP TABLE IF EXISTS public.payments_status;
DROP TABLE IF EXISTS public.registrants;
