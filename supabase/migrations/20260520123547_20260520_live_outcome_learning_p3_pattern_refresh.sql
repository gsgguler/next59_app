/*
  Live Micro-Simulation — Outcome Learning V1: Pattern Memory Refresh + Replay Batch

  Phase 4: refresh_live_micro_pattern_memory()
    - Aggregates outcomes by state × minute_bucket × score_state × pressure_bucket × source_quality
    - Computes all rates from live_micro_window_outcomes
    - Conservative reliability: low sample (< 20) sets low_sample_warning, conservative confidence_adjustment
    - UPSERT on unique key

  Phase 5: run_live_micro_outcome_learning_batch(p_limit)
    - Finds completed fixtures with windows but unevaluated outcomes
    - Evaluates each, then refreshes pattern memory
    - Per-fixture isolation, idempotent
*/

-- ── Phase 4: Pattern memory refresh ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION model_lab.refresh_live_micro_pattern_memory()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_upserted integer := 0;
  v_start    timestamptz := now();
BEGIN
  WITH aggregated AS (
    SELECT
      o.micro_state,
      -- 15-min bucket
      CASE
        WHEN o.window_start_minute < 15 THEN '0-15'
        WHEN o.window_start_minute < 30 THEN '15-30'
        WHEN o.window_start_minute < 45 THEN '30-45'
        WHEN o.window_start_minute < 60 THEN '45-60'
        WHEN o.window_start_minute < 75 THEN '60-75'
        ELSE '75-90'
      END AS minute_bucket,
      -- score state
      CASE
        WHEN o.comeback_pressure_score IS NOT NULL AND o.comeback_pressure_score > 0.3 THEN 'trailing'
        WHEN o.draw_preservation_score IS NOT NULL AND o.draw_preservation_score > 0.2 THEN 'level'
        ELSE 'leading'
      END AS score_state,
      -- pressure bucket
      CASE
        WHEN COALESCE(o.pressure_delta, 0) > 0.20 THEN 'high_home'
        WHEN COALESCE(o.pressure_delta, 0) < -0.20 THEN 'high_away'
        ELSE 'balanced'
      END AS pressure_bucket,
      -- source quality bucket
      COALESCE(o.source_quality, 'event_only') AS source_quality_bucket,

      -- outcome flags
      o.next_goal_within_10,
      o.late_goal_after_window,
      o.comeback_occurred,
      o.draw_preserved,
      o.was_false_pressure_signal,
      o.was_false_chaos_signal,
      o.was_false_late_goal_signal
    FROM model_lab.live_micro_window_outcomes o
    WHERE o.engine_version = 'micro_v1'
  ),
  stats AS (
    SELECT
      micro_state, minute_bucket, score_state, pressure_bucket, source_quality_bucket,
      COUNT(*)                                                   AS sample_size,
      ROUND(AVG(CASE WHEN next_goal_within_10     THEN 1.0 ELSE 0.0 END)::numeric, 4) AS goal_within_10_rate,
      ROUND(AVG(CASE WHEN late_goal_after_window  THEN 1.0 ELSE 0.0 END)::numeric, 4) AS late_goal_rate,
      ROUND(AVG(CASE WHEN comeback_occurred       THEN 1.0 ELSE 0.0 END)::numeric, 4) AS comeback_rate,
      ROUND(AVG(CASE WHEN draw_preserved          THEN 1.0 ELSE 0.0 END)::numeric, 4) AS draw_preservation_rate,
      ROUND(AVG(CASE WHEN was_false_pressure_signal THEN 1.0 ELSE 0.0 END)::numeric, 4) AS false_pressure_rate,
      ROUND(AVG(CASE WHEN was_false_chaos_signal    THEN 1.0 ELSE 0.0 END)::numeric, 4) AS false_chaos_rate,
      ROUND(AVG(CASE WHEN was_false_late_goal_signal THEN 1.0 ELSE 0.0 END)::numeric, 4) AS false_late_goal_rate
    FROM aggregated
    GROUP BY micro_state, minute_bucket, score_state, pressure_bucket, source_quality_bucket
  )
  INSERT INTO model_lab.live_micro_pattern_memory (
    micro_state, minute_bucket, score_state, pressure_bucket, source_quality_bucket,
    sample_size, low_sample_warning,
    goal_within_10_rate, late_goal_rate, comeback_rate, draw_preservation_rate,
    false_pressure_rate, false_chaos_rate, false_late_goal_rate,
    reliability_score, confidence_adjustment,
    updated_at, metadata_json
  )
  SELECT
    s.micro_state, s.minute_bucket, s.score_state, s.pressure_bucket, s.source_quality_bucket,
    s.sample_size,
    (s.sample_size < 20) AS low_sample_warning,
    s.goal_within_10_rate, s.late_goal_rate, s.comeback_rate, s.draw_preservation_rate,
    s.false_pressure_rate, s.false_chaos_rate, s.false_late_goal_rate,
    -- Reliability score: penalize for low sample and high false rates
    GREATEST(0, LEAST(1.0,
      1.0
      - (CASE WHEN s.sample_size < 5  THEN 0.50
              WHEN s.sample_size < 10 THEN 0.30
              WHEN s.sample_size < 20 THEN 0.15
              ELSE 0.0 END)
      - COALESCE(s.false_pressure_rate, 0) * 0.25
      - COALESCE(s.false_chaos_rate,    0) * 0.20
      - COALESCE(s.false_late_goal_rate,0) * 0.20
    )) AS reliability_score,
    -- Confidence adjustment: conservative; only ±0.10 max
    GREATEST(-0.10, LEAST(0.10,
      CASE WHEN s.sample_size < 10 THEN 0.0
           WHEN COALESCE(s.false_pressure_rate,0) > 0.5 THEN -0.08
           WHEN COALESCE(s.false_chaos_rate,0)    > 0.5 THEN -0.06
           WHEN COALESCE(s.goal_within_10_rate,0) > 0.6 THEN  0.07
           WHEN COALESCE(s.late_goal_rate,0)       > 0.5 THEN  0.05
           ELSE 0.0 END
    )) AS confidence_adjustment,
    now(),
    jsonb_build_object('computed_at', now(), 'engine_version', 'micro_v1')
  FROM stats s
  ON CONFLICT (micro_state, minute_bucket, score_state, pressure_bucket, source_quality_bucket)
  DO UPDATE SET
    sample_size             = EXCLUDED.sample_size,
    low_sample_warning      = EXCLUDED.low_sample_warning,
    goal_within_10_rate     = EXCLUDED.goal_within_10_rate,
    late_goal_rate          = EXCLUDED.late_goal_rate,
    comeback_rate           = EXCLUDED.comeback_rate,
    draw_preservation_rate  = EXCLUDED.draw_preservation_rate,
    false_pressure_rate     = EXCLUDED.false_pressure_rate,
    false_chaos_rate        = EXCLUDED.false_chaos_rate,
    false_late_goal_rate    = EXCLUDED.false_late_goal_rate,
    reliability_score       = EXCLUDED.reliability_score,
    confidence_adjustment   = EXCLUDED.confidence_adjustment,
    updated_at              = now(),
    metadata_json           = EXCLUDED.metadata_json;

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'pattern_rows_upserted', v_upserted,
    'duration_ms', EXTRACT(EPOCH FROM (now() - v_start)) * 1000
  );
END;
$$;

-- ── Phase 5: Outcome learning batch ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION model_lab.run_live_micro_outcome_learning_batch(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_limit       integer := LEAST(GREATEST(p_limit, 1), 200);
  v_processed   integer := 0;
  v_evaluated   integer := 0;
  v_errors      jsonb := '[]'::jsonb;
  v_result      jsonb;
  v_err_msg     text;
  v_pm_result   jsonb;
  r             record;
BEGIN
  -- Find completed fixtures: have windows, have 88+ min events, not fully evaluated
  FOR r IN
    SELECT DISTINCT w.fixture_id
    FROM model_lab.live_micro_windows w
    WHERE w.engine_version = 'micro_v1'
      -- has late-game events (proxy for complete match)
      AND EXISTS (
        SELECT 1 FROM public.api_football_fixture_events e
        WHERE e.api_football_fixture_id = w.fixture_id
          AND e.elapsed >= 88
      )
      -- not yet evaluated (no outcome row for window at minute 85)
      AND NOT EXISTS (
        SELECT 1 FROM model_lab.live_micro_window_outcomes o
        JOIN model_lab.live_micro_windows w2
          ON w2.id = o.micro_window_id
        WHERE w2.fixture_id = w.fixture_id
          AND w2.window_start_minute = 85
          AND o.engine_version = 'micro_v1'
      )
    ORDER BY w.fixture_id
    LIMIT v_limit
  LOOP
    BEGIN
      v_result := model_lab.evaluate_live_micro_window_outcomes(r.fixture_id);
      v_evaluated := v_evaluated + COALESCE((v_result->>'evaluated')::integer, 0);
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM;
      v_errors := v_errors || jsonb_build_object(
        'fixture_id', r.fixture_id,
        'error', LEFT(v_err_msg, 200)
      );
    END;
  END LOOP;

  -- Refresh pattern memory after batch
  v_pm_result := model_lab.refresh_live_micro_pattern_memory();

  RETURN jsonb_build_object(
    'fixtures_processed',    v_processed,
    'outcome_rows_created',  v_evaluated,
    'errors',                v_errors,
    'pattern_memory',        v_pm_result,
    'engine_version',        'micro_v1'
  );
END;
$$;

-- Public admin wrappers
CREATE OR REPLACE FUNCTION public.admin_refresh_micro_pattern_memory()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN model_lab.refresh_live_micro_pattern_memory();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_run_micro_outcome_learning_batch(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN model_lab.run_live_micro_outcome_learning_batch(p_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.refresh_live_micro_pattern_memory() TO authenticated;
GRANT EXECUTE ON FUNCTION model_lab.run_live_micro_outcome_learning_batch(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refresh_micro_pattern_memory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_micro_outcome_learning_batch(integer) TO authenticated;
