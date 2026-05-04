/*
  # Fix get_unfetched_* RPCs — make p_af_league_id and p_season_year optional

  Root cause: edge function backfill orchestrators call these RPCs without
  league_id/season params (auto-mode: process all scoped fixtures). The
  original signatures had NOT NULL params → always returned 0 rows.

  Fix: default both to NULL. When NULL, scope falls back to all 7 production
  leagues × seasons 2020–2024. When provided, filter as before.

  Also: scope filter moved to competition join rather than equality to allow
  NULL passthrough cleanly.
*/

CREATE OR REPLACE FUNCTION public.get_unfetched_lineup_fixtures(
  p_af_league_id integer DEFAULT NULL,
  p_season_year  integer DEFAULT NULL,
  p_offset       integer DEFAULT 0,
  p_limit        integer DEFAULT 50
)
RETURNS TABLE(match_id uuid, api_football_fixture_id integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id AS match_id, m.api_football_fixture_id
  FROM   matches m
  JOIN   competition_seasons cs ON cs.id = m.competition_season_id
  JOIN   competitions c         ON c.id  = cs.competition_id
  JOIN   seasons s              ON s.id  = cs.season_id
  WHERE  m.api_football_fixture_id IS NOT NULL
    AND  c.api_football_id IN (203,39,140,135,78,61,88)
    AND  s.year BETWEEN 2020 AND 2024
    AND  (p_af_league_id IS NULL OR c.api_football_id = p_af_league_id)
    AND  (p_season_year  IS NULL OR s.year            = p_season_year)
    AND  NOT EXISTS (
           SELECT 1 FROM api_football_fixture_lineups_raw r
           WHERE  r.match_id = m.id
         )
  ORDER  BY m.match_date
  OFFSET p_offset
  LIMIT  p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_unfetched_statistics_fixtures(
  p_af_league_id integer DEFAULT NULL,
  p_season_year  integer DEFAULT NULL,
  p_offset       integer DEFAULT 0,
  p_limit        integer DEFAULT 50
)
RETURNS TABLE(match_id uuid, api_football_fixture_id integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id AS match_id, m.api_football_fixture_id
  FROM   matches m
  JOIN   competition_seasons cs ON cs.id = m.competition_season_id
  JOIN   competitions c         ON c.id  = cs.competition_id
  JOIN   seasons s              ON s.id  = cs.season_id
  WHERE  m.api_football_fixture_id IS NOT NULL
    AND  c.api_football_id IN (203,39,140,135,78,61,88)
    AND  s.year BETWEEN 2020 AND 2024
    AND  (p_af_league_id IS NULL OR c.api_football_id = p_af_league_id)
    AND  (p_season_year  IS NULL OR s.year            = p_season_year)
    AND  NOT EXISTS (
           SELECT 1 FROM api_football_fixture_statistics_raw r
           WHERE  r.match_id = m.id
         )
  ORDER  BY m.match_date
  OFFSET p_offset
  LIMIT  p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_unfetched_events_fixtures(
  p_af_league_id integer DEFAULT NULL,
  p_season_year  integer DEFAULT NULL,
  p_offset       integer DEFAULT 0,
  p_limit        integer DEFAULT 50
)
RETURNS TABLE(match_id uuid, api_football_fixture_id integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id AS match_id, m.api_football_fixture_id
  FROM   matches m
  JOIN   competition_seasons cs ON cs.id = m.competition_season_id
  JOIN   competitions c         ON c.id  = cs.competition_id
  JOIN   seasons s              ON s.id  = cs.season_id
  WHERE  m.api_football_fixture_id IS NOT NULL
    AND  c.api_football_id IN (203,39,140,135,78,61,88)
    AND  s.year BETWEEN 2020 AND 2024
    AND  (p_af_league_id IS NULL OR c.api_football_id = p_af_league_id)
    AND  (p_season_year  IS NULL OR s.year            = p_season_year)
    AND  NOT EXISTS (
           SELECT 1 FROM api_football_fixture_events_raw r
           WHERE  r.match_id = m.id
         )
  ORDER  BY m.match_date
  OFFSET p_offset
  LIMIT  p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_unfetched_playerstats_fixtures(
  p_af_league_id integer DEFAULT NULL,
  p_season_year  integer DEFAULT NULL,
  p_offset       integer DEFAULT 0,
  p_limit        integer DEFAULT 50
)
RETURNS TABLE(match_id uuid, api_football_fixture_id integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id AS match_id, m.api_football_fixture_id
  FROM   matches m
  JOIN   competition_seasons cs ON cs.id = m.competition_season_id
  JOIN   competitions c         ON c.id  = cs.competition_id
  JOIN   seasons s              ON s.id  = cs.season_id
  WHERE  m.api_football_fixture_id IS NOT NULL
    AND  c.api_football_id IN (203,39,140,135,78,61,88)
    AND  s.year BETWEEN 2020 AND 2024
    AND  (p_af_league_id IS NULL OR c.api_football_id = p_af_league_id)
    AND  (p_season_year  IS NULL OR s.year            = p_season_year)
    AND  NOT EXISTS (
           SELECT 1 FROM af_fixture_player_stats_raw r
           WHERE  r.match_id = m.id
         )
  ORDER  BY m.match_date
  OFFSET p_offset
  LIMIT  p_limit;
$$;
