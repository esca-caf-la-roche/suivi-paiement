-- Supprimer définitivement l'ancien trigger et l'ancienne fonction sur group_links si encore présents
DROP TRIGGER IF EXISTS trg_delete_orphan_groups ON public.group_links;
DROP FUNCTION IF EXISTS public.delete_orphan_groups();

-- Créer la nouvelle fonction trigger sur helloasso_links
CREATE OR REPLACE FUNCTION public.delete_orphan_groups_on_link_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Supprimer les groupes qui sont associés au lien supprimé et n'ont aucun autre lien associé.
  DELETE FROM public.groups
  WHERE id IN (
    SELECT group_id 
    FROM public.group_links gl1
    WHERE gl1.link_id = OLD.id
      AND NOT EXISTS (
        SELECT 1 
        FROM public.group_links gl2
        WHERE gl2.group_id = gl1.group_id 
          AND gl2.link_id != OLD.id
      )
  );
  RETURN OLD;
END;
$$;

-- Attacher le trigger BEFORE DELETE sur helloasso_links
DROP TRIGGER IF EXISTS trg_delete_orphan_groups_on_link_delete ON public.helloasso_links;
CREATE TRIGGER trg_delete_orphan_groups_on_link_delete
  BEFORE DELETE ON public.helloasso_links
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_orphan_groups_on_link_delete();

-- Rétablir EXECUTE uniquement pour authenticated (recommandation linter)
REVOKE EXECUTE ON FUNCTION public.delete_orphan_groups_on_link_delete() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_orphan_groups_on_link_delete() TO authenticated;
