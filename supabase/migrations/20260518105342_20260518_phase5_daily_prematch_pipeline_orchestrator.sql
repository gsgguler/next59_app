/*
  # Phase 5 — Daily pre-match pipeline orchestrator

  ## Summary
  Creates a single SQL function that runs the full daily pre-match intelligence
  pipeline in the correct order for all upcoming fixtures within a configurable
  window. Designed to be idempotent, retry-safe, and skips matches that already
  have a fresh enriched prediction today.

  ## Pipeline order (per match)
  1. ml_generate_upcoming_features_batch  — compute rolling form for upcoming fixtures
  2. assess_upcoming_match_readiness      — re-score readiness after new features/ELO
  3. generate_full_prematch_package       — prediction + scenario (skipped if fresh today)

  ## Skip logic
  A match is skipped for prediction if it already has a prematch_prediction_drafts
  row generated today with feature_quality_tier != 'elo_only'. This prevents
  duplicate drafts while allowing re-runs to upgrade stale elo_only predictions.

  ## New objects
  - model_lab.run_daily_prematch_pipeline(p_horizon_days int) RETURNS jsonb
  - public.ml_run_daily_prematch_pipeline(p_horizon_days int) — admin-guarded wrapper
  - cron job: 'daily-prematch-pipeline' at 07:00 UTC daily

  ## Security
  SECURITY DEFINER with admin guard on public wrapper.
  No new tables or RLS changes.
*/

-- ── Core orchestrator function ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION model_lab.run_daily_prematch_pipeline(
  p_horizon_days int DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $fn$
DECLARE
  v_from_date     date := CURRENT_DATE;
  v_to_date       date := CURRENT_DATE + p_horizon_days;
  v_feature_batch jsonb;
  v_match         RECORD;
  v_pkg           jsonb;
  v_processed     int  := 0;
  v_skipped       int  := 0;
  v_errors        int  := 0;
  v_results       jsonb[] := ARRAY[]::jsonb[];
  v_has_fresh     boolean;
  v_err           text;
BEGIN
  -- Step 1: batch-generate upcoming feature snapshots for the full horizon
  BEGIN
    v_feature_batch := model_lab.ml_generate_upcoming_feature_snapshot_batch(v_from_date, v_to_date);
  EXCEPTION WHEN OTHERS THEN
    -- Try the batch wrapper name used in Phase 2
    BEGIN
      PERFORM model_lab.ml_generate_upcoming_features_batch_internal(v_from_date, v_to_date);
      v_feature_batch := jsonb_build_object('note', 'batch via internal fn');
    EXCEPTION WHEN OTHERS THEN
      v_feature_batch := jsonb_build_object('error', SQLERRM);
    END;
  END;

  -- Step 2: loop over all upcoming NS/TBD/PST matches in horizon
  FOR v_match IN (
    SELECT
      m.id          AS match_id,
      ht.name       AS home_team,
      at.name       AS away_team,
      m.match_date,
      umr.overall_status
    FROM public.matches m
    JOIN public.teams ht ON ht.id = m.home_team_id
    JOIN public.teams at ON at.id = m.away_team_id
    LEFT JOIN model_lab.upcoming_match_readiness umr ON umr.match_id = m.id
    WHERE m.status_short IN ('NS', 'TBD', 'PST')
      AND m.match_date BETWEEN v_from_date AND v_to_date
    ORDER BY m.match_date ASC
  ) LOOP

    -- 2a: re-assess readiness (always, idempotent)
    BEGIN
      PERFORM model_lab.assess_upcoming_match_readiness(v_match.match_id);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- non-fatal; proceed to prediction
    END;

    -- 2b: skip prediction if match is still fully blocked after reassessment
    SELECT overall_status INTO v_match.overall_status
    FROM model_lab.upcoming_match_readiness
    WHERE match_id = v_match.match_id;

    IF v_match.overall_status = 'blocked' THEN
      v_skipped := v_skipped + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'match_id',   v_match.match_id,
        'home',       v_match.home_team,
        'away',       v_match.away_team,
        'date',       v_match.match_date,
        'action',     'skipped',
        'reason',     'readiness=blocked'
      ));
      CONTINUE;
    END IF;

    -- 2c: skip if fresh enriched prediction already exists today
    SELECT EXISTS (
      SELECT 1 FROM model_lab.prematch_prediction_drafts
      WHERE match_id = v_match.match_id
        AND generated_at >= CURRENT_DATE::timestamptz
        AND feature_quality_tier IS DISTINCT FROM 'elo_only'
    ) INTO v_has_fresh;

    IF v_has_fresh THEN
      v_skipped := v_skipped + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'match_id',   v_match.match_id,
        'home',       v_match.home_team,
        'away',       v_match.away_team,
        'date',       v_match.match_date,
        'action',     'skipped',
        'reason',     'fresh_enriched_draft_exists_today'
      ));
      CONTINUE;
    END IF;

    -- 2d: generate full package (prediction + scenario)
    BEGIN
      v_pkg := model_lab.generate_full_prematch_package(v_match.match_id, NULL::uuid);
      v_processed := v_processed + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'match_id',        v_match.match_id,
        'home',            v_match.home_team,
        'away',            v_match.away_team,
        'date',            v_match.match_date,
        'action',          'generated',
        'feature_tier',    v_pkg->>'feature_tier',
        'confidence_tier', v_pkg->>'confidence_tier',
        'p_home',          v_pkg->>'p_home',
        'p_draw',          v_pkg->>'p_draw',
        'p_away',          v_pkg->>'p_away'
      ));
    EXCEPTION WHEN OTHERS THEN
      v_err    := SQLERRM;
      v_errors := v_errors + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'match_id', v_match.match_id,
        'home',     v_match.home_team,
        'away',     v_match.away_team,
        'date',     v_match.match_date,
        'action',   'error',
        'error',    v_err
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'run_at',         now(),
    'horizon_days',   p_horizon_days,
    'from_date',      v_from_date,
    'to_date',        v_to_date,
    'feature_batch',  v_feature_batch,
    'processed',      v_processed,
    'skipped',        v_skipped,
    'errors',         v_errors,
    'matches',        to_jsonb(v_results)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION model_lab.run_daily_prematch_pipeline(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_lab.run_daily_prematch_pipeline(int) TO service_role;

-- ── Public admin-guarded wrapper ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_run_daily_prematch_pipeline(
  p_horizon_days int DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  RETURN model_lab.run_daily_prematch_pipeline(p_horizon_days);
END;
$fn$;

REVOKE ALL ON FUNCTION public.ml_run_daily_prematch_pipeline(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ml_run_daily_prematch_pipeline(int) TO authenticated;

-- ── Also update feature batch to call the right internal function name ──────
-- The batch function created in Phase 2 is named ml_generate_upcoming_features_batch
-- Alias it so the orchestrator can call it directly from model_lab schema
CREATE OR REPLACE FUNCTION model_lab.ml_generate_upcoming_feature_snapshot_batch(
  p_from_date date DEFAULT CURRENT_DATE,
  p_to_date   date DEFAULT CURRENT_DATE + 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $fn$
DECLARE
  v_match    RECORD;
  v_result   jsonb;
  v_ok       int := 0;
  v_err      int := 0;
BEGIN
  FOR v_match IN (
    SELECT m.id AS match_id
    FROM public.matches m
    WHERE m.status_short IN ('NS', 'TBD', 'PST')
      AND m.match_date BETWEEN p_from_date AND p_to_date
    ORDER BY m.match_date ASC
  ) LOOP
    BEGIN
      PERFORM model_lab.ml_generate_upcoming_feature_snapshot(v_match.match_id);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('processed', v_ok, 'errors', v_err);
END;
$fn$;

REVOKE ALL ON FUNCTION model_lab.ml_generate_upcoming_feature_snapshot_batch(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_lab.ml_generate_upcoming_feature_snapshot_batch(date, date) TO service_role;

-- ── Daily cron job: 07:00 UTC every day ─────────────────────────────────────
SELECT cron.schedule(
  'daily-prematch-pipeline',
  '0 7 * * *',
  $$SELECT model_lab.run_daily_prematch_pipeline(14)$$
);
