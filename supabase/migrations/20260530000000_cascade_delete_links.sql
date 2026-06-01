-- Modifier la contrainte de clé étrangère pour supprimer uniquement les inscriptions (registrants) lors de la suppression d'un lien.
-- Les groupes et les sous-liens ne seront PAS supprimés en cascade (comportement par défaut ON DELETE RESTRICT conservé).

-- 1. Pour les inscrits (registrants.helloasso_link_id)
ALTER TABLE public.registrants
  DROP CONSTRAINT registrants_helloasso_link_id_fkey,
  ADD CONSTRAINT registrants_helloasso_link_id_fkey
    FOREIGN KEY (helloasso_link_id)
    REFERENCES public.helloasso_links(id)
    ON DELETE CASCADE;
