-- Création de la table waiting_students
CREATE TABLE IF NOT EXISTS public.waiting_students (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text        NOT NULL,
  last_name  text        NOT NULL,
  email      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Activation de RLS
ALTER TABLE public.waiting_students ENABLE ROW LEVEL SECURITY;

-- Politique de sécurité RLS
CREATE POLICY "waiting_students_all_responsibles"
  ON public.waiting_students
  FOR ALL
  USING (public.is_responsible());

-- Modification de la fonction reset_season pour inclure le vidage de la table waiting_students
-- et corriger les références aux tables après la refonte relationnelle (dossiers et transactions)
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

  -- Vidage des tables de la saison
  DELETE FROM public.payments_status_history;
  DELETE FROM public.helloasso_transactions;
  DELETE FROM public.dossiers;
  DELETE FROM public.approved_students;
  DELETE FROM public.waiting_students;

  -- Log du reset
  INSERT INTO public.season_resets (reset_by)
  VALUES (auth.uid());
END;
$$;
