-- Supprimer le trigger qui supprime automatiquement les groupes devenus orphelins.
-- Ce trigger causait des suppressions involontaires de groupes lors des mises à jour de liens dans le frontend.
DROP TRIGGER IF EXISTS trg_delete_orphan_groups ON public.group_links;
