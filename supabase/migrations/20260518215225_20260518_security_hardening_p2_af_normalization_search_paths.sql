/*
  # Security Hardening — Phase 2: AF Normalization Function search_path Isolation

  Applies SET search_path = public, shared, pg_temp to all AF pipeline
  SECURITY DEFINER functions that had no search_path set.

  ## What this does
  Prevents schema shadowing in data normalization functions called by
  edge functions and cron jobs. These functions access both public and
  shared schemas — both are included in the path.

  ## What this does NOT do
  - Does not change any function body or logic
  - Does not recreate any function
  - Does not affect any data or ingestion flow

  ## Functions altered (11)
  1.  public.af_normalize_fixture_events()
  2.  public.af_normalize_fixture_lineups()
  3.  public.af_normalize_fixture_player_stats(integer, integer)
  4.  public.af_normalize_fixture_statistics()
  5.  public.af_normalize_fixture_statistics_for_competition(integer, integer)
  6.  public.af_normalize_player_season_stats(integer, integer)
  7.  public.af_normalize_uefa_fixture_events(integer, integer)
  8.  public.af_normalize_uefa_fixture_lineups(integer, integer)
  9.  public.af_normalize_uefa_fixture_statistics(integer, integer)
  10. public.af_run_fixture_mapping()
  11. public.af_run_uefa_team_mapping(integer, integer)
  12. public.af_seed_match_stats_for_competition(integer, integer)
  13. public.get_domestic_fixture_ids(integer, integer, integer, integer)
*/

ALTER FUNCTION public.af_normalize_fixture_events()
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_normalize_fixture_lineups()
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_normalize_fixture_player_stats(integer, integer)
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_normalize_fixture_statistics()
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_normalize_fixture_statistics_for_competition(integer, integer)
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_normalize_player_season_stats(integer, integer)
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_normalize_uefa_fixture_events(integer, integer)
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_normalize_uefa_fixture_lineups(integer, integer)
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_normalize_uefa_fixture_statistics(integer, integer)
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_run_fixture_mapping()
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_run_uefa_team_mapping(integer, integer)
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.af_seed_match_stats_for_competition(integer, integer)
  SET search_path = public, shared, pg_temp;

ALTER FUNCTION public.get_domestic_fixture_ids(integer, integer, integer, integer)
  SET search_path = public, shared, pg_temp;
