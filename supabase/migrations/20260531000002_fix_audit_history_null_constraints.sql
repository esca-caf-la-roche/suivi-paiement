-- ─────────────────────────────────────────────────────────────────────────────
-- Migration — Correction des contraintes de non-nullité pour la réinitialisation des statuts
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Permettre aux colonnes new_status et updated_by d'être NULL dans la table d'audit payments_status_history
ALTER TABLE public.payments_status_history 
  ALTER COLUMN new_status DROP NOT NULL,
  ALTER COLUMN updated_by DROP NOT NULL;

-- 2. Améliorer la fonction trigger d'audit pour enregistrer le responsable connecté
--    qui effectue le reset (auth.uid()) même si NEW.updated_by est envoyé à NULL par le frontend.
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
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.local_status::text END,
    NEW.local_status::text,
    NEW.comment,
    COALESCE(NEW.updated_by, auth.uid()),
    NEW.updated_at
  );
  RETURN NEW;
END;
$$;
