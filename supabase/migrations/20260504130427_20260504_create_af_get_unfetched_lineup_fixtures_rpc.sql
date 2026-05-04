/*
  # RPC: get_unfetched_lineup_fixtures

  Returns match_id + api_football_fixture_id for matches that have NO row
  in api_football_fixture_lineups_raw, scoped to the 7 production leagues
  and seasons 2020–2024. Used by af-lineup-backfill edge function to drive
  chunked ingest without re-fetching already-stored fixtures.

  Parameters:
    p_af_league_id  – API-Football league id (e.g. 39)
    p_season_year   – Season year (e.g. 2023)
    p_offset        – Pagination offset
    p_limit         – Chunk size (default 50)
*/

CREATE OR REPLACE FUNCTION public.get_unfetched_lineup_fixtures(
  p_af_league_id  integer,
  p_season_year   integer,
  p_offset        integer DEFAULT 0,
  p_limit         integer DEFAULT 50
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
  WHERE  c.api_football_id         = p_af_league_id
    AND  s.year                    = p_season_year
    AND  m.api_football_fixture_id IS NOT NULL
    AND  NOT EXISTS (
           SELECT 1
           FROM   api_football_fixture_lineups_raw r
           WHERE  r.match_id = m.id
         )
  ORDER  BY m.match_date
  OFFSET p_offset
  LIMIT  p_limit;
$$;
