-- Migration — Ajout des liens vers les reçus/attestations HelloAsso
ALTER TABLE public.helloasso_transactions
ADD COLUMN IF NOT EXISTS payment_receipt_url text,
ADD COLUMN IF NOT EXISTS fiscal_receipt_url text;
