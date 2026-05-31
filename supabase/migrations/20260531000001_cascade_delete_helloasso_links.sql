-- ─────────────────────────────────────────────────────────────────────────────
-- Migration — Suppression en cascade HelloAsso et nettoyage des groupes orphelins
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Modification de la clé étrangère pour dossiers -> helloasso_links en ON DELETE CASCADE
ALTER TABLE public.dossiers
  DROP CONSTRAINT IF EXISTS dossiers_helloasso_link_id_fkey,
  ADD CONSTRAINT dossiers_helloasso_link_id_fkey
    FOREIGN KEY (helloasso_link_id)
    REFERENCES public.helloasso_links(id)
    ON DELETE CASCADE;

-- 2. Création de la fonction trigger pour supprimer les groupes devenus orphelins (sans liens)
CREATE OR REPLACE FUNCTION public.delete_orphan_groups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifier s'il reste d'autres associations pour ce groupe dans group_links
  IF NOT EXISTS (
    SELECT 1 FROM public.group_links WHERE group_id = OLD.group_id
  ) THEN
    -- Si plus aucun lien n'est associé, supprimer le groupe
    DELETE FROM public.groups WHERE id = OLD.group_id;
  END IF;
  RETURN OLD;
END;
$$;

-- 3. Attachement du trigger AFTER DELETE sur group_links
DROP TRIGGER IF EXISTS trg_delete_orphan_groups ON public.group_links;
CREATE TRIGGER trg_delete_orphan_groups
  AFTER DELETE ON public.group_links
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_orphan_groups();
