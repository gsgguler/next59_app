/*
  # Operational Loop Orchestrator — Production V1

  Creates a reliable, observable, reversible automated daily intelligence loop.
  Wraps the existing run_daily_prematch_pipeline with:
  - Provider freshness checks
  - Result sync monitoring
  - Calibration drift refresh
  - Unified operational_loop_runs log
  - Public invoke wrapper for cron
  - Two cron schedules: daily 08:00 UTC + every 6h matchday refresh

  Tables: model_lab.operational_loop_runs
  Functions: model_lab.run_daily_operational_loop, public.invoke_daily_operational_loop
  Cron: operational-loop-daily (0 8 * * *), operational-loop-matchday (0 per 6 * * *)

  Safety: no auto-publication, each step isolated, append-only log.
*/

-- ─── 1. operational_loop_runs table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.operational_loop_runs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_key                text        NOT NULL DEFAULT 'daily',
  trigger_source          text        NOT NULL DEFAULT 'cron',
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  status                  text        NOT NULL DEFAULT 'running',
  providers_checked       integer     NOT NULL DEFAULT 0,
  providers_stale         integer     NOT NULL DEFAULT 0,
  pipeline_run_id         uuid,
  fixtures_seen           integer     NOT NULL DEFAULT 0,
  readiness_processed     integer     NOT NULL DEFAULT 0,
  features_generated      integer     NOT NULL DEFAULT 0,
  predictions_generated   integer     NOT NULL DEFAULT 0,
  brain_packages_generated integer    NOT NULL DEFAULT 0,
  scenarios_generated     integer     NOT NULL DEFAULT 0,
  stories_generated       integer     NOT NULL DEFAULT 0,
  skipped_existing        integer     NOT NULL DEFAULT 0,
  blocked_count           integer     NOT NULL DEFAULT 0,
  live_matches_processed  integer     NOT NULL DEFAULT 0,
  evaluations_generated   integer     NOT NULL DEFAULT 0,
  calibration_updates     integer     NOT NULL DEFAULT 0,
  warnings_json           jsonb       NOT NULL DEFAULT '[]',
  errors_json             jsonb       NOT NULL DEFAULT '[]',
  error_count             integer     NOT NULL DEFAULT 0,
  CONSTRAINT chk_loop_status CHECK (status IN ('running','completed','failed'))
);

ALTER TABLE model_lab.operational_loop_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read operational loop runs"
  ON model_lab.operational_loop_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

GRANT SELECT ON model_lab.operational_loop_runs TO authenticated;
GRANT INSERT, UPDATE ON model_lab.operational_loop_runs TO service_role;

CREATE INDEX IF NOT EXISTS idx_op_loop_runs_started
  ON model_lab.operational_loop_runs (started_at DESC);

-- ─── 2. Main orchestrator function ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION model_lab.run_daily_operational_loop(
  p_trigger_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'model_lab', 'public', 'shared'
AS $$
DECLARE
  v_loop_id            uuid;
  v_warnings           jsonb[] := ARRAY[]::jsonb[];
  v_errors             jsonb[] := ARRAY[]::jsonb[];
  v_error_count        int     := 0;
  v_providers_checked  int     := 0;
  v_providers_stale    int     := 0;
  v_feed               RECORD;
  v_pipeline_result    jsonb;
  v_pipeline_run_id    uuid;
  v_fixtures_seen      int     := 0;
  v_predictions        int     := 0;
  v_brains             int     := 0;
  v_scenarios          int     := 0;
  v_stories            int     := 0;
  v_skipped            int     := 0;
  v_blocked            int     := 0;
  v_live_processed     int     := 0;
  v_evaluations        int     := 0;
  v_calibration_upd    int     := 0;
  v_err                text;
  v_pipeline_errors    int;
BEGIN
  INSERT INTO model_lab.operational_loop_runs (loop_key, trigger_source, status)
  VALUES ('daily', p_trigger_source, 'running')
  RETURNING id INTO v_loop_id;

  -- Step A: provider freshness snapshot
  BEGIN
    FOR v_feed IN (
      SELECT
        feed_key,
        feed_label,
        last_success_at,
        stale_hours_threshold,
        CASE
          WHEN last_success_at IS NULL THEN true
          WHEN last_success_at < now() - (stale_hours_threshold || ' hours')::interval THEN true
          ELSE false
        END AS is_stale
      FROM public.admin_get_provider_health()
    ) LOOP
      v_providers_checked := v_providers_checked + 1;
      IF v_feed.is_stale THEN
        v_providers_stale := v_providers_stale + 1;
        v_warnings := array_append(v_warnings, jsonb_build_object(
          'step', 'provider_check',
          'feed', v_feed.feed_key,
          'label', v_feed.feed_label,
          'last_success_at', v_feed.last_success_at,
          'stale_threshold_hours', v_feed.stale_hours_threshold
        ));
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_errors := array_append(v_errors, jsonb_build_object('step','provider_check','error',SQLERRM));
  END;

  -- Steps B-G: delegate to existing daily prematch pipeline
  BEGIN
    v_pipeline_result := model_lab.run_daily_prematch_pipeline(14);
    v_fixtures_seen := COALESCE((v_pipeline_result->>'fixtures_seen')::int, 0);
    v_predictions   := COALESCE((v_pipeline_result->>'generated_predictions')::int, 0);
    v_brains        := COALESCE((v_pipeline_result->>'generated_brains')::int, 0);
    v_scenarios     := COALESCE((v_pipeline_result->>'generated_scenarios')::int, 0);
    v_stories       := COALESCE((v_pipeline_result->>'generated_stories')::int, 0);
    v_skipped       := COALESCE((v_pipeline_result->>'skipped')::int, 0);
    v_blocked       := COALESCE((v_pipeline_result->>'blocked')::int, 0);
    v_pipeline_errors := COALESCE((v_pipeline_result->>'errors')::int, 0);
    IF v_pipeline_errors > 0 THEN
      v_error_count := v_error_count + v_pipeline_errors;
      v_errors := array_append(v_errors, jsonb_build_object(
        'step', 'pipeline',
        'error_count', v_pipeline_errors,
        'detail', v_pipeline_result->'errors'
      ));
    END IF;
    SELECT id INTO v_pipeline_run_id
    FROM model_lab.prematch_pipeline_runs
    ORDER BY started_at DESC LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    v_errors := array_append(v_errors, jsonb_build_object('step','pipeline','error',SQLERRM));
  END;

  -- Step H: result sync check (existing 15min cron handles actual HTTP; we log counts)
  BEGIN
    SELECT COUNT(*) INTO v_live_processed
    FROM model_lab.result_sync_runs
    WHERE started_at >= now() - interval '1 hour'
      AND status IN ('ok','success','completed');
  EXCEPTION WHEN OTHERS THEN
    v_warnings := array_append(v_warnings, jsonb_build_object('step','result_sync_check','warning',SQLERRM));
  END;

  -- Step I: evaluation count today
  BEGIN
    SELECT COUNT(*) INTO v_evaluations
    FROM model_lab.prematch_prediction_evaluations
    WHERE evaluated_at >= CURRENT_DATE::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_warnings := array_append(v_warnings, jsonb_build_object('step','evaluation_check','warning',SQLERRM));
  END;

  -- Step J: calibration summary refresh (non-fatal)
  BEGIN
    PERFORM public.ml_compute_calibration_summary();
    v_calibration_upd := 1;
  EXCEPTION WHEN OTHERS THEN
    v_calibration_upd := 0;
    v_warnings := array_append(v_warnings, jsonb_build_object('step','calibration_refresh','warning',SQLERRM));
  END;

  -- Step K: finalize log
  UPDATE model_lab.operational_loop_runs SET
    completed_at             = now(),
    status                   = 'completed',
    providers_checked        = v_providers_checked,
    providers_stale          = v_providers_stale,
    pipeline_run_id          = v_pipeline_run_id,
    fixtures_seen            = v_fixtures_seen,
    readiness_processed      = v_fixtures_seen,
    features_generated       = v_predictions,
    predictions_generated    = v_predictions,
    brain_packages_generated = v_brains,
    scenarios_generated      = v_scenarios,
    stories_generated        = v_stories,
    skipped_existing         = v_skipped,
    blocked_count            = v_blocked,
    live_matches_processed   = v_live_processed,
    evaluations_generated    = v_evaluations,
    calibration_updates      = v_calibration_upd,
    warnings_json            = to_jsonb(v_warnings),
    errors_json              = to_jsonb(v_errors),
    error_count              = v_error_count
  WHERE id = v_loop_id;

  RETURN jsonb_build_object(
    'loop_id',               v_loop_id,
    'trigger_source',        p_trigger_source,
    'providers_checked',     v_providers_checked,
    'providers_stale',       v_providers_stale,
    'fixtures_seen',         v_fixtures_seen,
    'predictions_generated', v_predictions,
    'brains_generated',      v_brains,
    'stories_generated',     v_stories,
    'skipped_existing',      v_skipped,
    'blocked',               v_blocked,
    'live_synced_1h',        v_live_processed,
    'evaluations_today',     v_evaluations,
    'calibration_updated',   v_calibration_upd > 0,
    'error_count',           v_error_count,
    'warning_count',         COALESCE(array_length(v_warnings, 1), 0)
  );

EXCEPTION WHEN OTHERS THEN
  UPDATE model_lab.operational_loop_runs SET
    completed_at = now(),
    status       = 'failed',
    error_count  = 1,
    errors_json  = jsonb_build_array(jsonb_build_object('step','orchestrator','error',SQLERRM))
  WHERE id = v_loop_id;
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.run_daily_operational_loop(text) TO authenticated;

-- ─── 3. Public wrapper ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.invoke_daily_operational_loop(
  p_trigger_source text DEFAULT 'cron'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'model_lab'
AS $$
BEGIN
  RETURN model_lab.run_daily_operational_loop(p_trigger_source);
END;
$$;

GRANT EXECUTE ON FUNCTION public.invoke_daily_operational_loop(text) TO authenticated;

-- ─── 4. Admin read RPC ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_operational_loop_runs(
  p_limit int DEFAULT 20
)
RETURNS SETOF model_lab.operational_loop_runs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'model_lab', 'public'
AS $$
  SELECT * FROM model_lab.operational_loop_runs
  ORDER BY started_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_operational_loop_runs(int) TO authenticated;

-- ─── 5. Cron jobs (idempotent: cron.schedule upserts by name) ───────────────

SELECT cron.schedule(
  'operational-loop-daily',
  '0 8 * * *',
  $$SELECT public.invoke_daily_operational_loop('cron')$$
);

SELECT cron.schedule(
  'operational-loop-matchday',
  '0 */6 * * *',
  $$SELECT public.invoke_daily_operational_loop('cron_matchday')$$
);
