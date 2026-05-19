/*
  # WC2026 Live Engine Admin Read RPCs

  ## Summary
  Exposes live engine diagnostics to the admin UI for the WC2026 Live Tournament Engine
  readiness dashboard. All functions are read-only, admin-gated, and return honest
  status data — never fabricated live states.

  ## New Functions

  ### `wc2026_get_live_engine_status()`
  Returns a single-row health snapshot of the live engine:
  - last_engine_run_at, last_engine_status, fixtures_processed, duration_ms
  - last_sync_run_at, last_sync_status, matches_updated
  - stale_count (current stale live matches)
  - live_match_state_count (total rows in live_match_states)
  - outcome_count (total rows in live_state_outcomes)
  - pattern_count (total rows in live_state_pattern_memory)

  ### `wc2026_get_live_fixture_status(p_limit int DEFAULT 104)`
  Returns per-WC2026-fixture live readiness:
  - api_football_fixture_id, match_date, stage_code, group_label
  - home_team_name, away_team_name
  - fixture_db_status (from public.matches.status_short if matched, else 'not_started')
  - has_lineups (bool) — lineup rows exist in api_football_fixture_lineups
  - has_events (bool) — event rows exist in api_football_fixture_events
  - has_live_state (bool) — live_match_states row exists for this fixture
  - is_stale (bool) — stale warning exists
  - last_sync_at (timestamptz)

  ### `wc2026_get_live_engine_runs(p_limit int DEFAULT 20)`
  Returns recent live_engine_runs entries for the audit log.

  ### `wc2026_get_result_sync_runs(p_limit int DEFAULT 20)`
  Returns recent result_sync_runs for the sync audit log.

  ## Security
  - All functions: SECURITY DEFINER, locked search_path, admin-role check
  - GRANT EXECUTE to authenticated
*/

-- ─── 1. Live engine status snapshot ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_get_live_engine_status()
RETURNS TABLE (
  last_engine_run_at       timestamptz,
  last_engine_status       text,
  last_engine_processed    int,
  last_engine_duration_ms  numeric,
  last_sync_run_at         timestamptz,
  last_sync_status         text,
  last_sync_matches_updated int,
  stale_count              int,
  live_match_state_count   bigint,
  outcome_count            bigint,
  pattern_count            bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  WITH engine AS (
    SELECT started_at, status, fixtures_processed, duration_ms
    FROM model_lab.live_engine_runs
    ORDER BY started_at DESC
    LIMIT 1
  ),
  sync AS (
    SELECT started_at, status, matches_updated
    FROM public.result_sync_runs
    ORDER BY started_at DESC
    LIMIT 1
  ),
  stale AS (
    SELECT COUNT(*)::int AS cnt
    FROM model_lab.live_match_stale_warnings
    WHERE resolved_at IS NULL
  ),
  states AS (
    SELECT COUNT(*) AS cnt FROM model_lab.live_match_states
  ),
  outcomes AS (
    SELECT COUNT(*) AS cnt FROM model_lab.live_state_outcomes
  ),
  patterns AS (
    SELECT COUNT(*) AS cnt FROM model_lab.live_state_pattern_memory
  )
  SELECT
    engine.started_at,
    coalesce(engine.status, 'unknown')::text,
    coalesce(engine.fixtures_processed, 0)::int,
    coalesce(engine.duration_ms, 0)::numeric,
    sync.started_at,
    coalesce(sync.status, 'unknown')::text,
    coalesce(sync.matches_updated, 0)::int,
    coalesce(stale.cnt, 0)::int,
    coalesce(states.cnt, 0),
    coalesce(outcomes.cnt, 0),
    coalesce(patterns.cnt, 0)
  FROM
    (SELECT 1) AS dummy
    LEFT JOIN engine ON TRUE
    LEFT JOIN sync ON TRUE
    LEFT JOIN stale ON TRUE
    LEFT JOIN states ON TRUE
    LEFT JOIN outcomes ON TRUE
    LEFT JOIN patterns ON TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_live_engine_status() TO authenticated;

-- ─── 2. Per-fixture live readiness ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_get_live_fixture_status(
  p_limit int DEFAULT 104
)
RETURNS TABLE (
  api_football_fixture_id  int,
  match_date               timestamptz,
  stage_code               text,
  group_label              text,
  home_team_name           text,
  away_team_name           text,
  home_api_team_id         int,
  away_api_team_id         int,
  fixture_db_status        text,
  has_lineups              boolean,
  has_events               boolean,
  has_live_state           boolean,
  is_stale                 boolean,
  last_sync_at             timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    f.api_football_fixture_id::int,
    f.match_date::timestamptz,
    f.stage_code::text,
    f.group_label::text,
    coalesce(ht.name, f.home_team_placeholder, '?')::text  AS home_team_name,
    coalesce(at_.name, f.away_team_placeholder, '?')::text AS away_team_name,
    f.home_api_team_id::int,
    f.away_api_team_id::int,
    coalesce(m.status_short, 'not_started')::text          AS fixture_db_status,
    (EXISTS (
      SELECT 1 FROM public.api_football_fixture_lineups lup
      JOIN public.matches mx ON mx.id = lup.match_id
      WHERE mx.api_football_fixture_id = f.api_football_fixture_id
    ))                                                     AS has_lineups,
    (EXISTS (
      SELECT 1 FROM public.api_football_fixture_events ev
      JOIN public.matches mx ON mx.id = ev.match_id
      WHERE mx.api_football_fixture_id = f.api_football_fixture_id
    ))                                                     AS has_events,
    (EXISTS (
      SELECT 1 FROM model_lab.live_match_states ls
      JOIN public.matches mx ON mx.id = ls.fixture_id
      WHERE mx.api_football_fixture_id = f.api_football_fixture_id
    ))                                                     AS has_live_state,
    (EXISTS (
      SELECT 1 FROM model_lab.live_match_stale_warnings sw
      JOIN public.matches mx ON mx.id = sw.fixture_id
      WHERE mx.api_football_fixture_id = f.api_football_fixture_id
        AND sw.resolved_at IS NULL
    ))                                                     AS is_stale,
    m.updated_at                                           AS last_sync_at
  FROM public.wc2026_fixtures f
  LEFT JOIN public.teams ht  ON ht.api_football_team_id = f.home_api_team_id
  LEFT JOIN public.teams at_ ON at_.api_football_team_id = f.away_api_team_id
  LEFT JOIN public.matches m ON m.api_football_fixture_id = f.api_football_fixture_id
  ORDER BY f.match_date ASC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_live_fixture_status(int) TO authenticated;

-- ─── 3. Engine run audit log ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_get_live_engine_runs(
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id                  uuid,
  started_at          timestamptz,
  completed_at        timestamptz,
  status              text,
  fixtures_processed  int,
  fixtures_errored    int,
  duration_ms         numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.started_at,
    r.completed_at,
    r.status::text,
    coalesce(r.fixtures_processed, 0)::int,
    coalesce(r.fixtures_errored, 0)::int,
    coalesce(r.duration_ms, 0)::numeric
  FROM model_lab.live_engine_runs r
  ORDER BY r.started_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_live_engine_runs(int) TO authenticated;

-- ─── 4. Result sync run audit log ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_get_result_sync_runs(
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id                  uuid,
  started_at          timestamptz,
  completed_at        timestamptz,
  status              text,
  matches_seen        int,
  matches_updated     int,
  events_processed    int,
  lineups_processed   int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.started_at,
    r.completed_at,
    coalesce(r.status, 'unknown')::text,
    coalesce(r.matches_seen, 0)::int,
    coalesce(r.matches_updated, 0)::int,
    coalesce(r.events_processed, 0)::int,
    coalesce(r.lineups_processed, 0)::int
  FROM public.result_sync_runs r
  ORDER BY r.started_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_result_sync_runs(int) TO authenticated;
