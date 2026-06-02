-- Suppression de la fonctionnalité reset_season (jamais implémentée côté frontend)
DROP FUNCTION IF EXISTS public.reset_season();
DROP TABLE IF EXISTS public.season_resets;
