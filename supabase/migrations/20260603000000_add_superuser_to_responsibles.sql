-- Migration : ajouter la colonne is_superuser à la table responsibles
ALTER TABLE public.responsibles ADD COLUMN is_superuser boolean NOT NULL DEFAULT false;

-- Définir j.duheron@caflarochebonneville.fr comme super-utilisateur
UPDATE public.responsibles SET is_superuser = true WHERE id = 'ca7f6e2e-20df-4d92-95de-c9e4dcad75ab';
