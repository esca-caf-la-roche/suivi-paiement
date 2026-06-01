-- Migration pour passer d'une relation 1:N à N:M (group_links)
-- et supprimer la notion de parent_link_id.

-- 1. Création de la table de liaison
CREATE TABLE IF NOT EXISTS public.group_links (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  link_id  uuid NOT NULL REFERENCES public.helloasso_links(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, link_id)
);

ALTER TABLE public.group_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_links_all_responsibles"
  ON public.group_links
  FOR ALL
  USING (public.is_responsible());

-- 2. Migrer les données existantes de groups.link_id vers group_links
INSERT INTO public.group_links (group_id, link_id)
SELECT id, link_id FROM public.groups WHERE link_id IS NOT NULL;

-- 3. Migrer les données existantes des sous-liens (parent_link_id) vers le même groupe que leur parent
INSERT INTO public.group_links (group_id, link_id)
SELECT gl.group_id, hl.id
FROM public.helloasso_links hl
JOIN public.group_links gl ON gl.link_id = hl.parent_link_id
WHERE hl.parent_link_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Nettoyage des anciennes colonnes
ALTER TABLE public.groups DROP COLUMN link_id;
ALTER TABLE public.helloasso_links DROP COLUMN parent_link_id;
