-- Ajout de la colonne requires_approval sur la table groups
ALTER TABLE public.groups 
  ADD COLUMN requires_approval boolean NOT NULL DEFAULT false;
