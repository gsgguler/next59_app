-- ─── Part 3: Live tracking, finalization, and quota fields ───────────────────

-- Extend wc2026_fixtures with live/finalization tracking
ALTER TABLE wc2026_fixtures
  ADD COLUMN IF NOT EXISTS is_live                boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS elapsed               integer,
  ADD COLUMN IF NOT EXISTS home_score            integer,
  ADD COLUMN IF NOT EXISTS away_score            integer,
  ADD COLUMN IF NOT EXISTS home_score_ht         integer,
  ADD COLUMN IF NOT EXISTS away_score_ht         integer,
  ADD COLUMN IF NOT EXISTS final_home_score      integer,
  ADD COLUMN IF NOT EXISTS final_away_score      integer,
  ADD COLUMN IF NOT EXISTS winner                text,
  ADD COLUMN IF NOT EXISTS referee_name          text,
  ADD COLUMN IF NOT EXISTS finished_at           timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at             timestamptz,
  ADD COLUMN IF NOT EXISTS data_finalized_at     timestamptz,
  ADD COLUMN IF NOT EXISTS admin_review_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS closure_status        text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS finalization_status   text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_live_poll_at     timestamptz,
  ADD COLUMN IF NOT EXISTS live_poll_count       integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_daily_sync_at    timestamptz;

-- API quota snapshots
CREATE TABLE IF NOT EXISTS wc_api_quota_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at          timestamptz NOT NULL DEFAULT now(),
  requests_remaining  integer,
  requests_limit      integer,
  requests_used       integer,
  is_low              boolean DEFAULT false,
  is_critical         boolean DEFAULT false,
  meta                jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE wc_api_quota_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_quota_snapshots" ON wc_api_quota_snapshots FOR SELECT TO anon USING (true);
CREATE POLICY "insert_quota_snapshots" ON wc_api_quota_snapshots FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "update_quota_snapshots" ON wc_api_quota_snapshots FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "delete_quota_snapshots" ON wc_api_quota_snapshots FOR DELETE TO service_role USING (true);

CREATE INDEX IF NOT EXISTS idx_wc_api_quota_snapshots_checked_at ON wc_api_quota_snapshots (checked_at DESC);

-- ─── Indexes for Part 3 ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wc2026_fixtures_is_live ON wc2026_fixtures (is_live) WHERE is_live = true;
CREATE INDEX IF NOT EXISTS idx_wc2026_fixtures_closure_status ON wc2026_fixtures (closure_status);
CREATE INDEX IF NOT EXISTS idx_wc2026_fixtures_finalization_status ON wc2026_fixtures (finalization_status);

-- ─── RPC: admin sync dashboard summary ───────────────────────────────────────
CREATE OR REPLACE FUNCTION wc2026_get_sync_dashboard()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'fixtures', jsonb_build_object(
      'total',       COUNT(*),
      'is_live',     COUNT(*) FILTER (WHERE is_live = true),
      'closed',      COUNT(*) FILTER (WHERE is_closed = true),
      'open',        COUNT(*) FILTER (WHERE is_closed = false AND fixture_status NOT IN ('FT','AET','PEN')),
      'finalized',   COUNT(*) FILTER (WHERE finalization_status = 'finalized'),
      'needs_review',COUNT(*) FILTER (WHERE admin_review_required = true)
    ),
    'lineups', jsonb_build_object(
      'announced',   COUNT(*) FILTER (WHERE lineups_available = true),
      'pending',     COUNT(*) FILTER (WHERE lineups_available = false AND is_closed = false)
    ),
    'enrichment', jsonb_build_object(
      'players_pending', (SELECT COUNT(*) FROM wc_player_enrichment_profiles WHERE lookup_status = 'pending'),
      'players_found',   (SELECT COUNT(*) FROM wc_player_enrichment_profiles WHERE lookup_status LIKE 'found%'),
      'players_missing', (SELECT COUNT(*) FROM wc_player_enrichment_profiles WHERE lookup_status = 'missing')
    ),
    'quota', (
      SELECT jsonb_build_object(
        'requests_remaining', requests_remaining,
        'requests_limit',     requests_limit,
        'requests_used',      requests_used,
        'is_low',             is_low,
        'is_critical',        is_critical,
        'checked_at',         checked_at
      )
      FROM wc_api_quota_snapshots
      ORDER BY checked_at DESC
      LIMIT 1
    ),
    'sync_runs', (
      SELECT jsonb_agg(r ORDER BY r.started_at DESC)
      FROM (
        SELECT DISTINCT ON (job_name)
          job_name, status, started_at, finished_at,
          fixtures_processed, api_calls, error
        FROM wc_api_sync_runs
        ORDER BY job_name, started_at DESC
      ) r
    )
  )
  INTO v_result
  FROM wc2026_fixtures;

  RETURN v_result;
END;
$$;

-- ─── RPC: get live fixtures ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION wc2026_get_live_fixtures()
RETURNS TABLE (
  id                      uuid,
  api_football_fixture_id bigint,
  home_team_name          text,
  away_team_name          text,
  home_score              integer,
  away_score              integer,
  elapsed                 integer,
  fixture_status          text,
  is_live                 boolean,
  last_live_poll_at       timestamptz,
  live_poll_count         integer
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, api_football_fixture_id, home_team_name, away_team_name,
         home_score, away_score, elapsed, fixture_status, is_live,
         last_live_poll_at, live_poll_count
  FROM wc2026_fixtures
  WHERE is_live = true
  ORDER BY match_date;
$$;

-- ─── RPC: get finalization queue status ──────────────────────────────────────
CREATE OR REPLACE FUNCTION wc2026_get_finalization_queue(p_limit int DEFAULT 20)
RETURNS TABLE (
  queue_id                uuid,
  api_football_fixture_id bigint,
  status                  text,
  attempts                integer,
  last_error              text,
  created_at              timestamptz,
  home_team_name          text,
  away_team_name          text,
  fixture_status          text,
  final_home_score        integer,
  final_away_score        integer,
  is_closed               boolean
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT q.id, q.api_football_fixture_id, q.status, q.attempts, q.last_error, q.created_at,
         f.home_team_name, f.away_team_name, f.fixture_status, f.final_home_score, f.final_away_score, f.is_closed
  FROM wc_fixture_finalization_queue q
  LEFT JOIN wc2026_fixtures f ON f.api_football_fixture_id = q.api_football_fixture_id
  ORDER BY q.created_at DESC
  LIMIT p_limit;
$$;
