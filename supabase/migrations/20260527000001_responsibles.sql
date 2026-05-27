-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001 — Table responsibles + RLS
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table responsibles (1:1 avec auth.users)
CREATE TABLE IF NOT EXISTS public.responsibles (
  id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL
);

-- 2. Activer RLS
ALTER TABLE public.responsibles ENABLE ROW LEVEL SECURITY;

-- 3. Fonction helper SECURITY DEFINER
--    (évite la récursion infinie dans les politiques des autres tables)
CREATE OR REPLACE FUNCTION public.is_responsible()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.responsibles WHERE id = auth.uid()
  );
$$;

-- 4. Politiques RLS sur responsibles
--    SELECT : chaque utilisateur peut lire sa propre ligne
CREATE POLICY "responsibles_select"
  ON public.responsibles
  FOR SELECT
  USING (auth.uid() = id);

--    UPDATE : chaque utilisateur peut modifier sa propre ligne
CREATE POLICY "responsibles_update"
  ON public.responsibles
  FOR UPDATE
  USING (auth.uid() = id);

-- Note : INSERT est réservé à l'admin (service_role via console Supabase).
-- Les comptes de Patrick et Stéphane sont créés manuellement.

-- ─────────────────────────────────────────────────────────────────────────────
-- APRÈS avoir exécuté cette migration :
-- 1. Supabase Dashboard → Authentication → Users → "Invite user"
--    Inviter patrick@... et stephane@... (ou leurs vraies adresses)
-- 2. Récupérer leurs UUID dans la colonne "id"
-- 3. Exécuter dans SQL Editor :
--
--    INSERT INTO public.responsibles (id, name) VALUES
--      ('<uuid-patrick>', 'Patrick C'),
--      ('<uuid-stephane>', 'Stéphane M');
-- ─────────────────────────────────────────────────────────────────────────────
