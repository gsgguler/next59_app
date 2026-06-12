-- WC2026 API-Football Automation Part 2: Pre-Match Schema Extensions
-- Adds lineup tracking columns to wc2026_fixtures and admin RPCs for pre-match panels

-- ─── Extend wc2026_fixtures with lineup tracking ──────────────────────────────

ALTER TABLE wc2026_fixtures
  ADD COLUMN IF NOT EXISTS lineups_available        boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS lineup_status            text      DEFAULT 'not_checked',
  ADD COLUMN IF NOT EXISTS lineup_announced_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_lineup_check_at     timestamptz,
  ADD COLUMN IF NOT EXISTS home_start_xi_count      int       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_start_xi_count      int       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_sub_count           int       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_sub_count           int       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS home_formation           text,
  ADD COLUMN IF NOT EXISTS away_formation           text,
  ADD COLUMN IF NOT EXISTS coach_home               text,
  ADD COLUMN IF NOT EXISTS coach_away               text,
  ADD COLUMN IF NOT EXISTS lineup_data_quality_score numeric,
  ADD COLUMN IF NOT EXISTS is_closed                boolean   DEFAULT false;

-- ─── Add unique constraint on wc_player_enrichment_profiles if missing ────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wc_player_enrichment_profiles_player_name_team_key'
      AND conrelid = 'wc_player_enrichment_profiles'::regclass
  ) THEN
    ALTER TABLE wc_player_enrichment_profiles
      ADD CONSTRAINT wc_player_enrichment_profiles_player_name_team_key
      UNIQUE (player_name, api_team_id);
  END IF;
END$$;

-- ─── Add unique on wc_player_performance_scores if missing ───────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wc_player_perf_scores_player_fixture_key'
      AND conrelid = 'wc_player_performance_scores'::regclass
  ) THEN
    ALTER TABLE wc_player_performance_scores
      ADD CONSTRAINT wc_player_perf_scores_player_fixture_key
      UNIQUE NULLS NOT DISTINCT (player_id, api_football_fixture_id, season);
  END IF;
END$$;

-- ─── RPC: get pre-match status for upcoming fixtures ─────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_get_prematch_status(p_limit int DEFAULT 20)
RETURNS TABLE (
  api_football_fixture_id bigint,
  fixture_id              uuid,
  match_date              timestamptz,
  home_team_name          text,
  away_team_name          text,
  fixture_status          text,
  lineups_available       boolean,
  lineup_status           text,
  last_lineup_check_at    timestamptz,
  lineup_announced_at     timestamptz,
  home_start_xi_count     int,
  away_start_xi_count     int,
  referee_name            text,
  referee_card_score      numeric,
  referee_confidence      numeric,
  data_quality_score      numeric,
  missing_fields          jsonb,
  has_prediction_input    boolean,
  enrichment_pending_count bigint,
  enrichment_done_count   bigint,
  last_input_generated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.api_football_fixture_id,
    f.id                         AS fixture_id,
    f.match_date,
    f.home_team_name,
    f.away_team_name,
    f.fixture_status,
    COALESCE(f.lineups_available, false),
    COALESCE(f.lineup_status, 'not_checked'),
    f.last_lineup_check_at,
    f.lineup_announced_at,
    COALESCE(f.home_start_xi_count, 0),
    COALESCE(f.away_start_xi_count, 0),
    pi.referee_name,
    rp.referee_card_score,
    rp.confidence                AS referee_confidence,
    pi.data_quality_score,
    pi.missing_fields,
    pi.id IS NOT NULL            AS has_prediction_input,
    COALESCE(ep.pending_count, 0),
    COALESCE(ep.done_count, 0),
    pi.generated_at              AS last_input_generated_at
  FROM wc2026_fixtures f
  LEFT JOIN wc_match_prediction_inputs pi
    ON pi.api_football_fixture_id = f.api_football_fixture_id
  LEFT JOIN wc_referee_profiles rp
    ON lower(trim(rp.name)) = lower(trim(COALESCE(pi.referee_name, '')))
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE lookup_status = 'pending') AS pending_count,
      COUNT(*) FILTER (WHERE lookup_status NOT IN ('pending')) AS done_count
    FROM wc_player_enrichment_profiles ep2
    WHERE ep2.api_team_id IN (f.home_api_team_id, f.away_api_team_id)
  ) ep ON true
  WHERE f.api_football_fixture_id IS NOT NULL
    AND f.fixture_status NOT IN ('FT', 'AET', 'PEN')
  ORDER BY f.match_date ASC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_prematch_status TO authenticated;

-- ─── RPC: get sync runs for a specific job ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_get_sync_runs_by_job(
  p_job_name text,
  p_limit    int DEFAULT 20
)
RETURNS TABLE (
  id               uuid,
  job_name         text,
  status           text,
  started_at       timestamptz,
  finished_at      timestamptz,
  fixtures_processed int,
  api_calls        int,
  error            text,
  meta             jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, job_name, status, started_at, finished_at,
         COALESCE(fixtures_processed, 0), COALESCE(api_calls, 0),
         error, meta
  FROM wc_api_sync_runs
  WHERE job_name = p_job_name
  ORDER BY started_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_sync_runs_by_job TO authenticated;

-- ─── RPC: admin log manual trigger ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_admin_log_manual_trigger(
  p_job_name  text,
  p_triggered_by text DEFAULT 'admin-ui'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO wc_api_sync_runs (job_name, status, meta)
  VALUES (p_job_name, 'triggered', jsonb_build_object('triggered_by', p_triggered_by))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_admin_log_manual_trigger TO authenticated;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_wc2026_fixtures_lineups_available
  ON wc2026_fixtures (lineups_available) WHERE lineups_available = false;

CREATE INDEX IF NOT EXISTS idx_wc_player_enrichment_pending
  ON wc_player_enrichment_profiles (lookup_status) WHERE lookup_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wc_player_perf_player_fixture
  ON wc_player_performance_scores (player_id, api_football_fixture_id);
