/*
  # Live Memory Engine — Phase 5: Engine Self-Awareness (v3)

  Both run_live_match_engine() and run_live_match_engine_public() currently
  return jsonb. We recreate them with jsonb return type for consistency,
  adding the enrichment call after each fixture computation.
*/

-- ── Enrichment function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION model_lab.enrich_live_state_with_calibration(
  p_fixture_id          uuid,
  p_competition_season  uuid,
  p_current_live_state  text,
  p_elapsed             integer,
  p_chaos_score         numeric,
  p_state_confidence    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_pm                  RECORD;
  v_minute_bucket       text;
  v_high_goal_press     boolean := false;
  v_unreliable_chaos    boolean := false;
  v_strong_comeback     boolean := false;
  v_low_reliability     boolean := false;
  v_false_signal        boolean := false;
  v_pattern_n           integer := 0;
  v_calibration_tag     text := 'no_memory';
  v_new_confidence      text := p_state_confidence;
BEGIN
  v_minute_bucket := CASE
    WHEN p_elapsed < 15  THEN '0-14'
    WHEN p_elapsed < 30  THEN '15-29'
    WHEN p_elapsed < 45  THEN '30-44'
    WHEN p_elapsed < 60  THEN '45-59'
    WHEN p_elapsed < 75  THEN '60-74'
    WHEN p_elapsed <= 90 THEN '75-90'
    ELSE '90+'
  END;

  -- Prefer competition-specific; fall back to global NULL row
  SELECT * INTO v_pm
  FROM model_lab.live_state_pattern_memory
  WHERE current_live_state = p_current_live_state
    AND minute_bucket = v_minute_bucket
    AND (competition_season_id = p_competition_season OR competition_season_id IS NULL)
  ORDER BY (competition_season_id IS NULL) ASC
  LIMIT 1;

  IF FOUND THEN
    v_pattern_n       := v_pm.sample_size;
    v_high_goal_press := COALESCE(v_pm.goal_follow_rate_10min, 0) > 0.30;
    v_unreliable_chaos:= (COALESCE(p_chaos_score, 0) > 0.40 AND COALESCE(v_pm.false_confidence_rate, 0) > 0.40);
    v_strong_comeback := COALESCE(v_pm.comeback_rate, 0) > 0.25;
    v_low_reliability := (COALESCE(v_pm.calibration_score, 1) < 0.20 OR v_pm.low_sample_warning = true);
    v_false_signal    := COALESCE(v_pm.false_confidence_rate, 0) > 0.35;

    v_calibration_tag := CASE
      WHEN v_low_reliability AND v_pm.low_sample_warning THEN 'low_sample'
      WHEN v_false_signal                                  THEN 'false_signal'
      WHEN v_low_reliability                               THEN 'noisy'
      WHEN v_high_goal_press AND v_strong_comeback         THEN 'reliable_high'
      WHEN v_high_goal_press                               THEN 'reliable'
      ELSE 'neutral'
    END;

    IF v_low_reliability AND p_state_confidence = 'high' THEN
      v_new_confidence := 'medium';
    ELSIF v_false_signal AND p_state_confidence = 'high' THEN
      v_new_confidence := 'medium';
    ELSIF v_false_signal AND p_state_confidence = 'medium' THEN
      v_new_confidence := 'low';
    END IF;
  END IF;

  UPDATE model_lab.live_match_states
  SET
    historically_high_goal_pressure = v_high_goal_press,
    unreliable_chaos_signal         = v_unreliable_chaos,
    strong_comeback_state           = v_strong_comeback,
    low_reliability_state           = v_low_reliability,
    historically_false_signal       = v_false_signal,
    pattern_sample_size             = v_pattern_n,
    calibration_tag                 = v_calibration_tag,
    state_confidence                = v_new_confidence,
    state_reasoning_json            = COALESCE(state_reasoning_json, '{}'::jsonb)
      || jsonb_build_object(
          'calibration_tag', v_calibration_tag,
          'pattern_sample_size', v_pattern_n,
          'confidence_downgraded', (v_new_confidence != p_state_confidence),
          'minute_bucket', v_minute_bucket
         )
  WHERE fixture_id = p_fixture_id;

END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.enrich_live_state_with_calibration(uuid, uuid, text, integer, numeric, text) TO service_role;

-- ── Drop and recreate orchestrator (jsonb return type preserved) ──────────────

DROP FUNCTION IF EXISTS model_lab.run_live_match_engine();

CREATE OR REPLACE FUNCTION model_lab.run_live_match_engine()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_run_id          uuid;
  v_fixture_id      uuid;
  v_processed       integer := 0;
  v_errored         integer := 0;
  v_states          jsonb := '{}'::jsonb;
  v_state_val       text;
  v_conf_val        text;
  v_chaos_val       numeric;
  v_elapsed_val     integer;
  v_cs_id           uuid;
  v_started_at      timestamptz := now();
  v_live_match_ids  uuid[];
BEGIN
  INSERT INTO model_lab.live_engine_runs (started_at, status, engine_version)
  VALUES (v_started_at, 'running', 'v1')
  RETURNING id INTO v_run_id;

  SELECT ARRAY_AGG(id) INTO v_live_match_ids
  FROM public.matches
  WHERE status_short IN ('1H','HT','2H','ET','BT','P','LIVE','INT','SUSP')
    AND api_football_fixture_id IS NOT NULL;

  IF v_live_match_ids IS NULL THEN
    v_live_match_ids := ARRAY[]::uuid[];
  END IF;

  FOREACH v_fixture_id IN ARRAY v_live_match_ids LOOP
    BEGIN
      PERFORM model_lab.compute_live_match_state(v_fixture_id);
      v_processed := v_processed + 1;

      SELECT
        lms.current_live_state,
        lms.state_confidence,
        lms.chaos_score,
        lms.elapsed,
        m.competition_season_id
      INTO v_state_val, v_conf_val, v_chaos_val, v_elapsed_val, v_cs_id
      FROM model_lab.live_match_states lms
      JOIN public.matches m ON m.id = lms.fixture_id
      WHERE lms.fixture_id = v_fixture_id;

      IF v_state_val IS NOT NULL THEN
        PERFORM model_lab.enrich_live_state_with_calibration(
          v_fixture_id, v_cs_id, v_state_val,
          COALESCE(v_elapsed_val, 0),
          v_chaos_val, v_conf_val
        );

        v_states := v_states || jsonb_build_object(
          v_state_val,
          COALESCE((v_states ->> v_state_val)::integer, 0) + 1
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errored := v_errored + 1;
    END;
  END LOOP;

  UPDATE model_lab.live_match_states
  SET stale_warning = true
  WHERE computed_at < now() - interval '8 minutes'
    AND fixture_id = ANY(v_live_match_ids);

  UPDATE model_lab.live_engine_runs SET
    completed_at       = now(),
    status             = CASE WHEN v_errored > 0 AND v_processed = 0 THEN 'error' ELSE 'completed' END,
    live_matches_found = array_length(v_live_match_ids, 1),
    fixtures_processed = v_processed,
    fixtures_errored   = v_errored,
    states_classified  = v_states,
    duration_ms        = EXTRACT(EPOCH FROM (now() - v_started_at)) * 1000
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'errored', v_errored,
    'states', v_states,
    'run_id', v_run_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.run_live_match_engine() TO service_role;

-- ── Recreate public wrapper (same jsonb return) ───────────────────────────────

DROP FUNCTION IF EXISTS public.run_live_match_engine_public();

CREATE OR REPLACE FUNCTION public.run_live_match_engine_public()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN model_lab.run_live_match_engine();
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_live_match_engine_public() TO service_role;

-- ── Schedule populate outcomes every 30 min ───────────────────────────────────
SELECT cron.schedule(
  'live-outcome-populate-30min',
  '*/30 * * * *',
  $$SELECT model_lab.populate_live_state_outcomes(NULL, 100)$$
);
