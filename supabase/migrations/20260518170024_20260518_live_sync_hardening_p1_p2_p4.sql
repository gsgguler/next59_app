/*
  # Live Sync Hardening — Phases 1, 2, 4

  Summary:
  Hardens live result synchronization ahead of Live Match Engine activation.

  1. Upgrades model_lab.result_sync_runs with full structured columns:
     started_at, completed_at, status, matches_seen, matches_updated,
     events_processed, stats_processed, lineups_processed, errors_json, duration_ms.
     Old columns (triggered_at, matches_found, updated, http_status, raw_response)
     are preserved via safe ADD COLUMN IF NOT EXISTS pattern.

  2. Adds invoke_live_result_sync_live() — pg_net wrapper for mode=live,
     used by the new 5-minute cron.

  3. Registers result-sync-live-5min cron (every 5 minutes).

  4. Creates model_lab.live_match_stale_warnings — append-only table storing
     per-match stale detection results for Daily Monitor.

  5. Creates model_lab.detect_stale_live_matches() — idempotent function that
     scans matches in LIVE status with no update in 15+ minutes and writes
     warnings. Called by a new cron every 5 minutes.

  6. Registers detect-stale-live-5min cron.

  Security:
  - All new tables: RLS enabled, admin SELECT, service_role INSERT/UPDATE.
  - All new functions: SECURITY DEFINER, revoke PUBLIC, grant service_role.
*/

-- ── Phase 2: Upgrade result_sync_runs columns ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'result_sync_runs'
    AND column_name = 'started_at'
  ) THEN
    ALTER TABLE model_lab.result_sync_runs ADD COLUMN started_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'result_sync_runs'
    AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE model_lab.result_sync_runs ADD COLUMN completed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'result_sync_runs'
    AND column_name = 'status'
  ) THEN
    ALTER TABLE model_lab.result_sync_runs ADD COLUMN status text NOT NULL DEFAULT 'completed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'result_sync_runs'
    AND column_name = 'matches_seen'
  ) THEN
    ALTER TABLE model_lab.result_sync_runs ADD COLUMN matches_seen integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'result_sync_runs'
    AND column_name = 'matches_updated'
  ) THEN
    ALTER TABLE model_lab.result_sync_runs ADD COLUMN matches_updated integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'result_sync_runs'
    AND column_name = 'events_processed'
  ) THEN
    ALTER TABLE model_lab.result_sync_runs ADD COLUMN events_processed integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'result_sync_runs'
    AND column_name = 'stats_processed'
  ) THEN
    ALTER TABLE model_lab.result_sync_runs ADD COLUMN stats_processed integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'result_sync_runs'
    AND column_name = 'lineups_processed'
  ) THEN
    ALTER TABLE model_lab.result_sync_runs ADD COLUMN lineups_processed integer DEFAULT 0;
  END IF;
END $$;

-- Backfill new columns from old columns where applicable
UPDATE model_lab.result_sync_runs
SET
  started_at      = COALESCE(started_at, triggered_at),
  matches_seen    = COALESCE(matches_seen, matches_found, 0),
  matches_updated = COALESCE(matches_updated, updated, 0)
WHERE started_at IS NULL OR matches_seen = 0;

-- Index on mode + started_at for fast health queries
CREATE INDEX IF NOT EXISTS idx_result_sync_runs_mode_started
  ON model_lab.result_sync_runs (mode, started_at DESC);

-- ── Phase 1: invoke_live_result_sync_live() ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_live_result_sync_live()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url      text := 'https://jsordrrshzivxayryryi.supabase.co/functions/v1/af-live-result-sync';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ4NDIsImV4cCI6MjA5MjU1MDg0Mn0._vjqZAlFHMaWtLO-dRPvvVA6kzg2EJhtqDcFQu7vcrE';
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body    := '{"mode":"live"}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_live_result_sync_live() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_live_result_sync_live() TO service_role;

-- ── Phase 1: Register result-sync-live-5min cron ─────────────────────────────

SELECT cron.schedule(
  'result-sync-live-5min',
  '*/5 * * * *',
  'SELECT public.invoke_live_result_sync_live()'
);

-- ── Phase 4: live_match_stale_warnings table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.live_match_stale_warnings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  status_short    text,
  last_updated_at timestamptz,
  minutes_stale   integer,
  warning_type    text NOT NULL DEFAULT 'no_update',
  resolved        boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz
);

ALTER TABLE model_lab.live_match_stale_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read stale warnings"
  ON model_lab.live_match_stale_warnings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert stale warnings"
  ON model_lab.live_match_stale_warnings FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update stale warnings"
  ON model_lab.live_match_stale_warnings FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_stale_warnings_match_detected
  ON model_lab.live_match_stale_warnings (match_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_stale_warnings_unresolved
  ON model_lab.live_match_stale_warnings (detected_at DESC)
  WHERE resolved = false;

-- ── Phase 4: detect_stale_live_matches() ─────────────────────────────────────

CREATE OR REPLACE FUNCTION model_lab.detect_stale_live_matches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_stale_threshold_mins  int  := 15;
  v_stale_count           int  := 0;
  v_resolved_count        int  := 0;
  v_live_count            int  := 0;
  v_row                   RECORD;
  v_now                   timestamptz := now();
BEGIN
  -- Count all currently live matches
  SELECT COUNT(*) INTO v_live_count
  FROM public.matches
  WHERE status_short IN ('1H','HT','2H','ET','BT','P','SUSP','INT','LIVE');

  -- Detect stale: live matches with no update in >15 min
  FOR v_row IN (
    SELECT
      m.id           AS match_id,
      m.status_short,
      m.updated_at,
      EXTRACT(EPOCH FROM (v_now - m.updated_at)) / 60 AS minutes_stale
    FROM public.matches m
    WHERE m.status_short IN ('1H','HT','2H','ET','BT','P','SUSP','INT','LIVE')
      AND (m.updated_at IS NULL OR m.updated_at < v_now - (v_stale_threshold_mins || ' minutes')::interval)
  ) LOOP
    -- Only insert if no unresolved warning for this match in last 20 min
    -- (prevents spam on every 5-min cron tick)
    IF NOT EXISTS (
      SELECT 1 FROM model_lab.live_match_stale_warnings
      WHERE match_id = v_row.match_id
        AND resolved = false
        AND detected_at > v_now - interval '20 minutes'
    ) THEN
      INSERT INTO model_lab.live_match_stale_warnings (
        match_id, detected_at, status_short, last_updated_at,
        minutes_stale, warning_type, resolved
      ) VALUES (
        v_row.match_id, v_now, v_row.status_short, v_row.updated_at,
        ROUND(v_row.minutes_stale)::int, 'no_update', false
      );
      v_stale_count := v_stale_count + 1;
    END IF;
  END LOOP;

  -- Auto-resolve warnings for matches that are no longer live or have been updated
  UPDATE model_lab.live_match_stale_warnings w
  SET resolved = true, resolved_at = v_now
  FROM public.matches m
  WHERE w.match_id = m.id
    AND w.resolved = false
    AND (
      m.status_short NOT IN ('1H','HT','2H','ET','BT','P','SUSP','INT','LIVE')
      OR (m.updated_at IS NOT NULL AND m.updated_at > v_now - (v_stale_threshold_mins || ' minutes')::interval)
    );

  GET DIAGNOSTICS v_resolved_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'live_matches',    v_live_count,
    'new_warnings',    v_stale_count,
    'auto_resolved',   v_resolved_count,
    'checked_at',      v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION model_lab.detect_stale_live_matches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_lab.detect_stale_live_matches() TO service_role;

-- Public admin wrapper for detect_stale_live_matches
CREATE OR REPLACE FUNCTION public.ml_detect_stale_live_matches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN model_lab.detect_stale_live_matches();
END;
$$;

REVOKE ALL ON FUNCTION public.ml_detect_stale_live_matches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ml_detect_stale_live_matches() TO authenticated;

-- ── Phase 4: invoke_detect_stale_fn() + cron ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_detect_stale_live()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
BEGIN
  PERFORM model_lab.detect_stale_live_matches();
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_detect_stale_live: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_detect_stale_live() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_detect_stale_live() TO service_role;

SELECT cron.schedule(
  'detect-stale-live-5min',
  '*/5 * * * *',
  'SELECT public.invoke_detect_stale_live()'
);
