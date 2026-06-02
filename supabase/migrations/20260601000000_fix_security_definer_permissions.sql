-- ─────────────────────────────────────────────────────────────────────────────
-- Migration — Correction des permissions SECURITY DEFINER (linter Supabase)
-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase accorde EXECUTE à PUBLIC par défaut sur toutes les fonctions.
-- Un REVOKE sur des rôles individuels ne suffit pas : il faut REVOKE FROM PUBLIC,
-- puis re-accorder explicitement aux rôles qui en ont réellement besoin.

-- Fonctions trigger : jamais appelées via l'API REST, accès PUBLIC retiré.
REVOKE EXECUTE ON FUNCTION public.audit_payments_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_orphan_groups()  FROM PUBLIC;

-- is_responsible() : utilisée dans les politiques RLS → authenticated doit conserver EXECUTE.
REVOKE EXECUTE ON FUNCTION public.is_responsible() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_responsible() TO authenticated;

-- reset_season() : appelée par les responsables connectés (garde interne incluse).
REVOKE EXECUTE ON FUNCTION public.reset_season() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reset_season() TO authenticated;
