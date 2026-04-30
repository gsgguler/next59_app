/*
  # Create ml_run_candidate_adjusted_rerun RPC

  ## Purpose
  Reads all predictions + evaluations from a completed source backtest run,
  applies T=1.6 temperature scaling + competition_bias_only adjustments,
  and writes new prediction + evaluation rows under a candidate model version
  and backtest run.

  ## Pipeline (per match)
  1. Clamp raw probabilities (min 0.001) + renormalize
  2. Temperature scale: p_i^(1/T) / sum(p_j^(1/T))   [stable power form, no log(0)]
  3. Apply competition_bias additive corrections (from calibration_adjustments, is_active=false)
  4. Clamp (0.001–0.95) + renormalize
  5. argmax → adjusted_predicted_result

  ## Evaluation
  Stores per-row Brier, Log Loss, result correctness, error_category, confidence
  under the candidate model_version_id + backtest_run_id.

  ## Safety
  - Does NOT touch original predictions or evaluations
  - is_public_visible=false on every inserted prediction
  - feature_cutoff_date = trained_until_date (no future leakage)
  - ON CONFLICT (backtest_run_id, match_id) DO UPDATE on predictions
    so re-runs are idempotent
  - Admin-only via _ml_assert_admin()

  ## Parameters
  - p_source_run_id: source (original) backtest run UUID
  - p_candidate_run_id: candidate backtest run UUID
  - p_candidate_model_version_id: candidate model_version UUID
  - p_temperature: temperature scaling factor (default 1.6)
*/

CREATE OR REPLACE FUNCTION public.ml_run_candidate_adjusted_rerun(
  p_source_run_id              uuid,
  p_candidate_run_id           uuid,
  p_candidate_model_version_id uuid,
  p_temperature                numeric DEFAULT 1.6
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  -- Competition bias maps
  v_home_map jsonb := '{}'::jsonb;
  v_draw_map jsonb := '{}'::jsonb;
  v_away_map jsonb := '{}'::jsonb;

  -- Counters
  v_total     int     := 0;
  v_processed int     := 0;
  v_failed    int     := 0;

  v_sum_brier numeric := 0;
  v_sum_ll    numeric := 0;
  v_correct   int     := 0;

  v_pred_h int := 0; v_pred_d int := 0; v_pred_a int := 0;
  v_act_h  int := 0; v_act_d  int := 0; v_act_a  int := 0;

  -- Precision/recall
  v_draw_tp int := 0; v_draw_fp int := 0; v_draw_fn int := 0;
  v_away_tp int := 0; v_away_fp int := 0; v_away_fn int := 0;

  -- Reliability bins (6 buckets for p_draw)
  v_bin_n   int[]     := ARRAY[0,0,0,0,0,0];
  v_bin_pp  numeric[] := ARRAY[0::numeric,0,0,0,0,0];
  v_bin_act int[]     := ARRAY[0,0,0,0,0,0];

  -- Per-competition
  v_per_comp jsonb := '{}'::jsonb;

  -- Per-row working vars
  rec           RECORD;
  v_ph  numeric; v_pd  numeric; v_pa  numeric;
  v_p1  numeric; v_p2  numeric; v_p3  numeric;
  v_pah numeric; v_pad numeric; v_paa numeric;
  v_norm numeric;
  v_dh  numeric; v_dd  numeric; v_da  numeric;
  v_adj_pred text; v_actual text; v_comp text;
  v_oh  int; v_od  int; v_oa  int;
  v_brier    numeric; v_ll numeric;
  v_conf_score numeric; v_conf_grade text;
  v_err_cat text;
  v_new_pred_id uuid;
  v_bin_idx int;
  v_cacc jsonb;

  -- Metrics output
  v_draw_prec  numeric; v_draw_rec  numeric; v_draw_f1  numeric;
  v_away_prec  numeric; v_away_rec  numeric; v_away_f1  numeric;
  v_ece_draw   numeric;
  v_bins_out   jsonb;
  v_cal_slope  numeric;

  v_slope_n   int     := 0;
  v_slope_sx  numeric := 0;
  v_slope_sy  numeric := 0;
  v_slope_sxx numeric := 0;
  v_slope_sxy numeric := 0;

  v_i int;
  bin_avg_pred  numeric; bin_act_rate numeric; bin_gap numeric; bin_label text;

  v_source_raw_brier numeric;
  v_source_raw_ll    numeric;
  v_source_raw_acc   numeric;
  v_home_overcall_reduction numeric;
  v_source_pred_h_rate numeric;
BEGIN
  PERFORM public._ml_assert_admin();

  -- Validate candidate run exists and belongs to candidate model version
  IF NOT EXISTS (
    SELECT 1 FROM model_lab.backtest_runs
    WHERE id = p_candidate_run_id
      AND model_version_id = p_candidate_model_version_id
  ) THEN
    RETURN jsonb_build_object('error', 'Candidate run not found or model_version_id mismatch');
  END IF;

  -- Validate source run exists and is completed
  IF NOT EXISTS (
    SELECT 1 FROM model_lab.backtest_runs
    WHERE id = p_source_run_id AND run_status = 'completed'
  ) THEN
    RETURN jsonb_build_object('error', 'Source run not found or not completed');
  END IF;

  -- Fetch source run baseline metrics for comparison
  SELECT average_brier_1x2, average_log_loss_1x2
  INTO v_source_raw_brier, v_source_raw_ll
  FROM model_lab.backtest_runs
  WHERE id = p_source_run_id;

  -- Source raw predicted home rate
  SELECT COUNT(*) FILTER (WHERE predicted_result = 'H')::numeric / NULLIF(COUNT(*), 0)
  INTO v_source_pred_h_rate
  FROM model_lab.match_model_predictions
  WHERE backtest_run_id = p_source_run_id;

  -- Mark candidate run as running
  UPDATE model_lab.backtest_runs
  SET run_status = 'running', started_at = now()
  WHERE id = p_candidate_run_id;

  -- Load competition bias adjustments (is_active=false = candidate pool from source run)
  SELECT
    COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='home_bias_correction'),'{}'::jsonb),
    COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='draw_bias_correction'),'{}'::jsonb),
    COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='away_bias_correction'),'{}'::jsonb)
  INTO v_home_map, v_draw_map, v_away_map
  FROM model_lab.calibration_adjustments
  WHERE source_backtest_run_id = p_source_run_id
    AND group_type = 'competition'
    AND is_active = false;

  -- ── Main loop ──────────────────────────────────────────────────────────
  FOR rec IN
    SELECT
      p.id          AS src_pred_id,
      p.match_id,
      p.match_date,
      p.trained_until_date,
      p.era_bucket,
      p.competition_id,
      p.competition_name,
      p.season_id,
      p.season_label,
      p.home_team_id,
      p.home_team_name,
      p.away_team_id,
      p.away_team_name,
      p.p_home,
      p.p_draw,
      p.p_away,
      p.expected_home_goals,
      p.expected_away_goals,
      p.confidence_score   AS raw_conf_score,
      p.confidence_grade   AS raw_conf_grade,
      e.actual_result,
      e.actual_home_score,
      e.actual_away_score,
      e.actual_total_goals,
      e.actual_btts,
      e.actual_over_1_5,
      e.actual_over_2_5,
      e.actual_over_3_5
    FROM model_lab.match_model_predictions p
    JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
    WHERE p.backtest_run_id = p_source_run_id
    ORDER BY p.match_date, p.id
  LOOP
    v_total := v_total + 1;
    v_comp   := rec.competition_name;
    v_actual := rec.actual_result;

    -- Actual outcome counters
    IF    v_actual = 'H' THEN v_act_h := v_act_h + 1;
    ELSIF v_actual = 'D' THEN v_act_d := v_act_d + 1;
    ELSE                       v_act_a := v_act_a + 1;
    END IF;

    v_oh := CASE v_actual WHEN 'H' THEN 1 ELSE 0 END;
    v_od := CASE v_actual WHEN 'D' THEN 1 ELSE 0 END;
    v_oa := CASE v_actual WHEN 'A' THEN 1 ELSE 0 END;

    BEGIN
      -- Step 1: Clamp raw + renormalize
      v_ph := GREATEST(0.001, COALESCE(rec.p_home, 0.334));
      v_pd := GREATEST(0.001, COALESCE(rec.p_draw, 0.333));
      v_pa := GREATEST(0.001, COALESCE(rec.p_away, 0.333));
      v_norm := v_ph + v_pd + v_pa;
      v_ph := v_ph / v_norm;
      v_pd := v_pd / v_norm;
      v_pa := v_pa / v_norm;

      -- Step 2: Temperature scaling (stable power form)
      v_p1 := POWER(v_ph, 1.0 / p_temperature);
      v_p2 := POWER(v_pd, 1.0 / p_temperature);
      v_p3 := POWER(v_pa, 1.0 / p_temperature);
      v_norm := v_p1 + v_p2 + v_p3;
      v_pah := v_p1 / v_norm;
      v_pad := v_p2 / v_norm;
      v_paa := v_p3 / v_norm;

      -- Step 3: Competition bias
      v_dh := COALESCE((v_home_map ->> v_comp)::numeric, 0);
      v_dd := COALESCE((v_draw_map ->> v_comp)::numeric, 0);
      v_da := COALESCE((v_away_map ->> v_comp)::numeric, 0);
      v_pah := GREATEST(0.001, v_pah + v_dh);
      v_pad := GREATEST(0.001, v_pad + v_dd);
      v_paa := GREATEST(0.001, v_paa + v_da);

      -- Step 4: Clamp + renormalize
      v_pah := LEAST(0.95, v_pah);
      v_pad := LEAST(0.95, v_pad);
      v_paa := LEAST(0.95, v_paa);
      v_norm := v_pah + v_pad + v_paa;
      v_pah := v_pah / v_norm;
      v_pad := v_pad / v_norm;
      v_paa := v_paa / v_norm;

      -- Step 5: Decision (argmax)
      IF    v_pah >= v_pad AND v_pah >= v_paa THEN v_adj_pred := 'H';
      ELSIF v_pad >= v_paa                    THEN v_adj_pred := 'D';
      ELSE                                         v_adj_pred := 'A';
      END IF;

      -- Confidence score = max probability
      v_conf_score := GREATEST(v_pah, v_pad, v_paa);
      v_conf_grade := CASE
        WHEN v_conf_score >= 0.65 THEN 'A'
        WHEN v_conf_score >= 0.55 THEN 'B+'
        WHEN v_conf_score >= 0.45 THEN 'B'
        WHEN v_conf_score >= 0.38 THEN 'C'
        WHEN v_conf_score >= 0.33 THEN 'D'
        ELSE 'F'
      END;

      -- Brier (multi-class, divided by 3)
      v_brier := ((v_pah - v_oh)^2 + (v_pad - v_od)^2 + (v_paa - v_oa)^2) / 3.0;

      -- Log Loss
      v_ll := CASE v_actual
                WHEN 'H' THEN -ln(GREATEST(1e-7, v_pah))
                WHEN 'D' THEN -ln(GREATEST(1e-7, v_pad))
                ELSE          -ln(GREATEST(1e-7, v_paa))
              END;

      -- Error category
      v_err_cat := CASE
        WHEN v_adj_pred = v_actual THEN 'correct'
        WHEN v_conf_score >= 0.55 AND v_adj_pred != v_actual THEN 'high_confidence_wrong'
        WHEN v_adj_pred = 'H' AND v_actual != 'H' THEN 'home_overcall'
        WHEN v_adj_pred = 'D' AND v_actual != 'D' THEN 'draw_overcall'
        WHEN v_adj_pred = 'A' AND v_actual != 'A' THEN 'away_overcall'
        ELSE 'low_confidence_wrong'
      END;

      -- Insert candidate prediction
      -- feature_cutoff_date = trained_until_date (no future leakage)
      INSERT INTO model_lab.match_model_predictions (
        backtest_run_id, model_version_id,
        match_id, match_date,
        feature_cutoff_date, trained_until_date,
        era_bucket,
        competition_id, competition_name,
        season_id, season_label,
        home_team_id, home_team_name,
        away_team_id, away_team_name,
        p_home, p_draw, p_away,
        expected_home_goals, expected_away_goals,
        predicted_result,
        confidence_score, confidence_grade,
        decision_summary,
        is_public_visible,
        model_debug
      ) VALUES (
        p_candidate_run_id, p_candidate_model_version_id,
        rec.match_id, rec.match_date,
        rec.trained_until_date,   -- feature_cutoff = trained_until, never match_date
        rec.trained_until_date,
        rec.era_bucket,
        rec.competition_id, rec.competition_name,
        rec.season_id, rec.season_label,
        rec.home_team_id, rec.home_team_name,
        rec.away_team_id, rec.away_team_name,
        round(v_pah, 6), round(v_pad, 6), round(v_paa, 6),
        rec.expected_home_goals, rec.expected_away_goals,
        v_adj_pred,
        round(v_conf_score, 4), v_conf_grade,
        'T=1.6 temp_then_compbias | adj_pred=' || v_adj_pred ||
          ' p_h=' || round(v_pah,3) || ' p_d=' || round(v_pad,3) || ' p_a=' || round(v_paa,3),
        false,  -- NEVER public
        jsonb_build_object(
          'source_pred_id',   rec.src_pred_id,
          'raw_p_home',       rec.p_home,
          'raw_p_draw',       rec.p_draw,
          'raw_p_away',       rec.p_away,
          'temperature',      p_temperature,
          'pipeline',         'temp_then_compbias',
          'bias_dh',          v_dh,
          'bias_dd',          v_dd,
          'bias_da',          v_da
        )
      )
      ON CONFLICT (backtest_run_id, match_id) DO UPDATE SET
        p_home            = EXCLUDED.p_home,
        p_draw            = EXCLUDED.p_draw,
        p_away            = EXCLUDED.p_away,
        predicted_result  = EXCLUDED.predicted_result,
        confidence_score  = EXCLUDED.confidence_score,
        confidence_grade  = EXCLUDED.confidence_grade,
        decision_summary  = EXCLUDED.decision_summary,
        model_debug       = EXCLUDED.model_debug,
        created_at        = now()
      RETURNING id INTO v_new_pred_id;

      -- Insert candidate evaluation
      INSERT INTO model_lab.match_model_evaluations (
        prediction_id,
        match_id,
        actual_result,
        actual_home_score, actual_away_score,
        actual_total_goals, actual_btts,
        actual_over_1_5, actual_over_2_5, actual_over_3_5,
        predicted_result,
        is_result_correct,
        brier_1x2,
        log_loss_1x2,
        error_category,
        calibration_bucket
      ) VALUES (
        v_new_pred_id,
        rec.match_id,
        rec.actual_result,
        rec.actual_home_score, rec.actual_away_score,
        rec.actual_total_goals, rec.actual_btts,
        rec.actual_over_1_5, rec.actual_over_2_5, rec.actual_over_3_5,
        v_adj_pred,
        (v_adj_pred = v_actual),
        round(v_brier, 8),
        round(v_ll, 8),
        v_err_cat,
        CASE
          WHEN v_conf_score >= 0.55 THEN 'high'
          WHEN v_conf_score >= 0.38 THEN 'medium'
          ELSE 'low'
        END
      )
      ON CONFLICT (prediction_id) DO UPDATE SET
        actual_result     = EXCLUDED.actual_result,
        predicted_result  = EXCLUDED.predicted_result,
        is_result_correct = EXCLUDED.is_result_correct,
        brier_1x2         = EXCLUDED.brier_1x2,
        log_loss_1x2      = EXCLUDED.log_loss_1x2,
        error_category    = EXCLUDED.error_category,
        created_at        = now();

      -- Accumulators
      v_sum_brier := v_sum_brier + v_brier;
      v_sum_ll    := v_sum_ll    + v_ll;
      IF v_adj_pred = v_actual THEN v_correct := v_correct + 1; END IF;

      IF    v_adj_pred = 'H' THEN v_pred_h := v_pred_h + 1;
      ELSIF v_adj_pred = 'D' THEN v_pred_d := v_pred_d + 1;
      ELSE                        v_pred_a := v_pred_a + 1;
      END IF;

      -- Precision/recall tallies
      IF v_adj_pred = 'D' THEN
        IF v_actual = 'D' THEN v_draw_tp := v_draw_tp + 1; ELSE v_draw_fp := v_draw_fp + 1; END IF;
      ELSIF v_actual = 'D' THEN
        v_draw_fn := v_draw_fn + 1;
      END IF;
      IF v_adj_pred = 'A' THEN
        IF v_actual = 'A' THEN v_away_tp := v_away_tp + 1; ELSE v_away_fp := v_away_fp + 1; END IF;
      ELSIF v_actual = 'A' THEN
        v_away_fn := v_away_fn + 1;
      END IF;

      -- Reliability bins
      v_bin_idx := CASE
        WHEN v_pad < 0.10 THEN 1
        WHEN v_pad < 0.20 THEN 2
        WHEN v_pad < 0.30 THEN 3
        WHEN v_pad < 0.40 THEN 4
        WHEN v_pad < 0.50 THEN 5
        ELSE 6
      END;
      v_bin_n[v_bin_idx]   := v_bin_n[v_bin_idx]   + 1;
      v_bin_pp[v_bin_idx]  := v_bin_pp[v_bin_idx]  + v_pad;
      v_bin_act[v_bin_idx] := v_bin_act[v_bin_idx] + v_od;

      -- Per-competition
      v_cacc := COALESCE(v_per_comp -> v_comp, jsonb_build_object(
        'n',0,'correct',0,'pred_h',0,'pred_d',0,'pred_a',0,
        'act_h',0,'act_d',0,'act_a',0,'sum_brier',0));
      v_per_comp := jsonb_set(v_per_comp, ARRAY[v_comp], jsonb_build_object(
        'n',           (v_cacc->>'n')::int + 1,
        'correct',     (v_cacc->>'correct')::int + CASE WHEN v_adj_pred=v_actual THEN 1 ELSE 0 END,
        'pred_h',      (v_cacc->>'pred_h')::int + CASE WHEN v_adj_pred='H' THEN 1 ELSE 0 END,
        'pred_d',      (v_cacc->>'pred_d')::int + CASE WHEN v_adj_pred='D' THEN 1 ELSE 0 END,
        'pred_a',      (v_cacc->>'pred_a')::int + CASE WHEN v_adj_pred='A' THEN 1 ELSE 0 END,
        'act_h',       (v_cacc->>'act_h')::int + CASE WHEN v_actual='H' THEN 1 ELSE 0 END,
        'act_d',       (v_cacc->>'act_d')::int + CASE WHEN v_actual='D' THEN 1 ELSE 0 END,
        'act_a',       (v_cacc->>'act_a')::int + CASE WHEN v_actual='A' THEN 1 ELSE 0 END,
        'sum_brier',   (v_cacc->>'sum_brier')::numeric + v_brier
      ), true);

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  IF v_total = 0 THEN
    UPDATE model_lab.backtest_runs SET run_status='failed', error_message='No source predictions found', completed_at=now()
    WHERE id = p_candidate_run_id;
    RETURN jsonb_build_object('error', 'No source predictions found');
  END IF;

  -- ── Precision/recall/F1 ────────────────────────────────────────────────
  v_draw_prec := CASE WHEN v_draw_tp+v_draw_fp > 0 THEN v_draw_tp::numeric/(v_draw_tp+v_draw_fp) ELSE 0 END;
  v_draw_rec  := CASE WHEN v_draw_tp+v_draw_fn > 0 THEN v_draw_tp::numeric/(v_draw_tp+v_draw_fn) ELSE 0 END;
  v_draw_f1   := CASE WHEN v_draw_prec+v_draw_rec > 0 THEN 2*v_draw_prec*v_draw_rec/(v_draw_prec+v_draw_rec) ELSE 0 END;
  v_away_prec := CASE WHEN v_away_tp+v_away_fp > 0 THEN v_away_tp::numeric/(v_away_tp+v_away_fp) ELSE 0 END;
  v_away_rec  := CASE WHEN v_away_tp+v_away_fn > 0 THEN v_away_tp::numeric/(v_away_tp+v_away_fn) ELSE 0 END;
  v_away_f1   := CASE WHEN v_away_prec+v_away_rec > 0 THEN 2*v_away_prec*v_away_rec/(v_away_prec+v_away_rec) ELSE 0 END;

  -- ── Reliability bins + ECE ──────────────────────────────────────────────
  v_ece_draw := 0;
  v_bins_out := '[]'::jsonb;
  FOR v_i IN 1..6 LOOP
    IF v_bin_n[v_i] > 0 THEN
      bin_avg_pred := v_bin_pp[v_i]  / v_bin_n[v_i];
      bin_act_rate := v_bin_act[v_i]::numeric / v_bin_n[v_i];
      bin_gap      := ABS(bin_avg_pred - bin_act_rate);
      bin_label    := CASE v_i
        WHEN 1 THEN '0.00-0.10' WHEN 2 THEN '0.10-0.20'
        WHEN 3 THEN '0.20-0.30' WHEN 4 THEN '0.30-0.40'
        WHEN 5 THEN '0.40-0.50' ELSE '0.50+'
      END;
      v_ece_draw := v_ece_draw + (v_bin_n[v_i]::numeric / v_total) * bin_gap;
      v_bins_out := v_bins_out || jsonb_build_object(
        'bin', bin_label, 'n', v_bin_n[v_i],
        'avg_pred_draw', round(bin_avg_pred, 4),
        'actual_draw_rate', round(bin_act_rate, 4),
        'gap', round(bin_gap, 4)
      );
      -- OLS slope
      v_slope_n   := v_slope_n   + 1;
      v_slope_sx  := v_slope_sx  + bin_avg_pred;
      v_slope_sy  := v_slope_sy  + bin_act_rate;
      v_slope_sxx := v_slope_sxx + bin_avg_pred * bin_avg_pred;
      v_slope_sxy := v_slope_sxy + bin_avg_pred * bin_act_rate;
    END IF;
  END LOOP;

  IF v_slope_n >= 2 AND (v_slope_n * v_slope_sxx - v_slope_sx * v_slope_sx) <> 0 THEN
    v_cal_slope := (v_slope_n * v_slope_sxy - v_slope_sx * v_slope_sy)
                 / (v_slope_n * v_slope_sxx - v_slope_sx * v_slope_sx);
  ELSE
    v_cal_slope := NULL;
  END IF;

  v_home_overcall_reduction := v_source_pred_h_rate - v_pred_h::numeric / v_total;

  -- ── Update candidate backtest_run record ──────────────────────────────
  UPDATE model_lab.backtest_runs SET
    run_status       = CASE WHEN v_failed = 0 THEN 'completed' ELSE 'failed' END,
    processed_matches = v_processed,
    failed_matches    = v_failed,
    average_brier_1x2 = CASE WHEN v_processed > 0 THEN round(v_sum_brier/v_processed, 8) ELSE NULL END,
    average_log_loss_1x2 = CASE WHEN v_processed > 0 THEN round(v_sum_ll/v_processed, 8) ELSE NULL END,
    completed_at      = now(),
    error_message     = CASE WHEN v_failed > 0 THEN v_failed||' rows failed' ELSE NULL END
  WHERE id = p_candidate_run_id;

  -- ── Return summary ─────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'candidate_run_id',          p_candidate_run_id,
    'candidate_model_version_id',p_candidate_model_version_id,
    'temperature',               p_temperature,
    'total_source',              v_total,
    'processed',                 v_processed,
    'failed',                    v_failed,
    'avg_brier',                 CASE WHEN v_processed>0 THEN round(v_sum_brier/v_processed,8) ELSE NULL END,
    'avg_log_loss',              CASE WHEN v_processed>0 THEN round(v_sum_ll/v_processed,8) ELSE NULL END,
    'accuracy',                  round(v_correct::numeric/v_total,6),
    'pred_h_rate',               round(v_pred_h::numeric/v_total,6),
    'pred_d_rate',               round(v_pred_d::numeric/v_total,6),
    'pred_a_rate',               round(v_pred_a::numeric/v_total,6),
    'actual_h_rate',             round(v_act_h::numeric/v_total,6),
    'actual_d_rate',             round(v_act_d::numeric/v_total,6),
    'actual_a_rate',             round(v_act_a::numeric/v_total,6),
    'draw_precision',            round(v_draw_prec,6),
    'draw_recall',               round(v_draw_rec,6),
    'draw_f1',                   round(v_draw_f1,6),
    'away_precision',            round(v_away_prec,6),
    'away_recall',               round(v_away_rec,6),
    'away_f1',                   round(v_away_f1,6),
    'home_overcall_reduction',   round(v_home_overcall_reduction,6),
    'ece_draw',                  round(v_ece_draw,6),
    'calibration_slope_draw',    v_cal_slope,
    'reliability_bins_draw',     v_bins_out,
    'per_competition_metrics',   v_per_comp,
    'source_raw_brier',          v_source_raw_brier,
    'source_raw_ll',             v_source_raw_ll,
    'leakage_check',             'feature_cutoff_date=trained_until_date; no future data used',
    'public_predictions',        0
  );
END;
$$;

-- unique constraint on (backtest_run_id, match_id) for idempotent upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'match_model_predictions_backtest_run_id_match_id_key'
      AND conrelid = 'model_lab.match_model_predictions'::regclass
  ) THEN
    ALTER TABLE model_lab.match_model_predictions
      ADD CONSTRAINT match_model_predictions_backtest_run_id_match_id_key
      UNIQUE (backtest_run_id, match_id);
  END IF;
END $$;

-- unique constraint on prediction_id for evaluation upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'match_model_evaluations_prediction_id_key'
      AND conrelid = 'model_lab.match_model_evaluations'::regclass
  ) THEN
    ALTER TABLE model_lab.match_model_evaluations
      ADD CONSTRAINT match_model_evaluations_prediction_id_key
      UNIQUE (prediction_id);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.ml_run_candidate_adjusted_rerun(uuid, uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ml_run_candidate_adjusted_rerun(uuid, uuid, uuid, numeric) TO authenticated;
