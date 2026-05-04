/*
  # Backfill helper RPCs — get_unfetched_* for statistics, events, players

  Three read-only functions that return matches within the 7 production
  leagues / seasons 2020–2024 that have NO corresponding raw row in the
  relevant staging table. Used by backfill orchestrator edge functions to
  drive chunked ingest without re-fetching already-stored fixtures.

  Tables checked:
    - api_football_fixture_statistics_raw  (statistics)
    - api_football_fixture_events_raw      (events)
    - af_fixture_player_stats_raw          (player stats — note different table name)

  All three share the same signature as get_unfetched_lineup_fixtures.
*/

-- ── Statistics ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_unfetched_statistics_fixtures(
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
           FROM   api_football_fixture_statistics_raw r
           WHERE  r.match_id = m.id
         )
  ORDER  BY m.match_date
  OFFSET p_offset
  LIMIT  p_limit;
$$;

-- ── Events ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_unfetched_events_fixtures(
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
           FROM   api_football_fixture_events_raw r
           WHERE  r.match_id = m.id
         )
  ORDER  BY m.match_date
  OFFSET p_offset
  LIMIT  p_limit;
$$;

-- ── Player stats ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_unfetched_playerstats_fixtures(
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
           FROM   af_fixture_player_stats_raw r
           WHERE  r.match_id = m.id
         )
  ORDER  BY m.match_date
  OFFSET p_offset
  LIMIT  p_limit;
$$;

-- ── Combined remaining count (used by auto-stop guard) ───────────────────────
CREATE OR REPLACE FUNCTION public.get_backfill_remaining_counts()
RETURNS TABLE(
  endpoint    text,
  remaining   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT m.id AS match_id
    FROM   matches m
    JOIN   competition_seasons cs ON cs.id = m.competition_season_id
    JOIN   competitions c         ON c.id  = cs.competition_id
    JOIN   seasons s              ON s.id  = cs.season_id
    WHERE  c.api_football_id IN (203, 39, 140, 135, 78, 61, 88)
      AND  s.year BETWEEN 2020 AND 2024
      AND  m.api_football_fixture_id IS NOT NULL
  )
  SELECT 'lineups'::text,
    COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM api_football_fixture_lineups_raw r WHERE r.match_id = s.match_id))
  FROM scope s
  UNION ALL
  SELECT 'statistics'::text,
    COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM api_football_fixture_statistics_raw r WHERE r.match_id = s.match_id))
  FROM scope s
  UNION ALL
  SELECT 'events'::text,
    COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM api_football_fixture_events_raw r WHERE r.match_id = s.match_id))
  FROM scope s
  UNION ALL
  SELECT 'players'::text,
    COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM af_fixture_player_stats_raw r WHERE r.match_id = s.match_id))
  FROM scope s;
$$;
