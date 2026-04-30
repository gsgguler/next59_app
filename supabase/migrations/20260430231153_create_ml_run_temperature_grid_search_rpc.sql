/*
  # Create ml_run_temperature_grid_search RPC

  ## Purpose
  Fine-grained temperature scaling grid search around T=1.5 for source backtest run
  82ee81a3-1af3-471c-b28e-da07cd723bab.

  ## Modes supported (12 total)
  Main order (temp → compbias): T = 1.20, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80
  Reverse order (compbias → temp): T = 1.30, 1.40, 1.50, 1.60, 1.70

  ## Pipeline
  Main:    clamp_raw → temperature_scale → competition_bias → clamp → argmax
  Reverse: clamp_raw → competition_bias → clamp → temperature_scale → clamp → argmax

  ## Formula
  Stable power form: adjusted_p_i = p_i^(1/T) / sum_j(p_j^(1/T))
  Equivalent to softmax(log(p)/T) but avoids log(0).

  ## Stored columns
  All existing calibration_adjustment_simulations columns plus:
  - brier_skill_vs_raw
  - brier_skill_vs_compbias
  - calibration_slope_draw (OLS from reliability bins)

  ## Security
  Admin-only via _ml_assert_admin(). Results stored in model_lab schema.
*/

CREATE OR REPLACE FUNCTION public.ml_run_temperature_grid_search(
  p_run_id   uuid,
  p_mode     text
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

  -- Mode params
  v_temp          numeric := 0;
  v_reverse_order boolean := false;  -- true = compbias first, then temp
  v_pipeline_label text;

  -- Counters
  v_total     int     := 0;
  v_raw_brier numeric := 0;
  v_adj_brier numeric := 0;
  v_raw_ll    numeric := 0;
  v_adj_ll    numeric := 0;
  v_raw_correct  int := 0;
  v_adj_correct  int := 0;

  v_raw_pred_h int := 0; v_raw_pred_d int := 0; v_raw_pred_a int := 0;
  v_adj_pred_h int := 0; v_adj_pred_d int := 0; v_adj_pred_a int := 0;
  v_act_h int := 0; v_act_d int := 0; v_act_a int := 0;

  -- Confusion / precision-recall
  v_conf       jsonb := '{}'::jsonb;
  v_draw_tp int := 0; v_draw_fp int := 0; v_draw_fn int := 0;
  v_away_tp int := 0; v_away_fp int := 0; v_away_fn int := 0;

  -- Reliability bins (6 buckets for p_draw)
  v_bin_n   int[]     := ARRAY[0,0,0,0,0,0];
  v_bin_pp  numeric[] := ARRAY[0::numeric,0,0,0,0,0];
  v_bin_act int[]     := ARRAY[0,0,0,0,0,0];

  -- Per-competition
  v_per_comp      jsonb := '{}'::jsonb;
  v_scenario_counts jsonb := '{}'::jsonb;

  -- Output
  v_notes      text;
  v_sim_id     uuid;
  v_applied    jsonb := '[]'::jsonb;
  v_transform_cfg jsonb;

  -- Per-row working vars
  rec           RECORD;
  v_ph  numeric; v_pd  numeric; v_pa  numeric;  -- raw probs
  v_p1  numeric; v_p2  numeric; v_p3  numeric;  -- after step 1
  v_pah numeric; v_pad numeric; v_paa numeric;  -- final adjusted
  v_norm numeric;
  v_adj_pred text; v_actual text; v_comp text;
  v_oh int; v_od int; v_oa int;
  v_adj_b numeric; v_adj_l numeric;
  v_conf_key text; v_cacc jsonb;
  v_dh numeric; v_dd numeric; v_da numeric;
  v_sc text; v_bin_idx int;

  -- Metrics
  v_draw_prec numeric; v_draw_rec numeric; v_draw_f1 numeric;
  v_away_prec numeric; v_away_rec numeric; v_away_f1 numeric;
  v_ece_draw  numeric;
  v_bins_out  jsonb;
  v_rflags    jsonb := '[]'::jsonb;
  v_verdict   text  := 'neutral';

  -- Skill + slope
  v_compbias_brier_baseline numeric := 0.20738331;
  v_raw_brier_baseline      numeric := 0.21187602;
  v_brier_skill_vs_raw      numeric;
  v_brier_skill_vs_compbias numeric;
  v_cal_slope_draw          numeric;

  -- Slope computation (OLS: sum of x,y,xx,xy over non-empty bins)
  v_slope_n   int     := 0;
  v_slope_sx  numeric := 0;
  v_slope_sy  numeric := 0;
  v_slope_sxx numeric := 0;
  v_slope_sxy numeric := 0;

  -- Loop helpers
  v_i         int;
  bin_avg_pred  numeric; bin_act_rate numeric; bin_gap numeric; bin_label text;
  comp_raw_acc  numeric; comp_adj_acc  numeric;
  comp_key text; comp_val jsonb;
BEGIN
  PERFORM public._ml_assert_admin();

  -- ── Mode dispatch ──────────────────────────────────────────────────────
  IF    p_mode = 'temp_scale_120_plus_competition_bias' THEN v_temp := 1.20; v_reverse_order := false;
  ELSIF p_mode = 'temp_scale_130_plus_competition_bias' THEN v_temp := 1.30; v_reverse_order := false;
  ELSIF p_mode = 'temp_scale_140_plus_competition_bias' THEN v_temp := 1.40; v_reverse_order := false;
  ELSIF p_mode = 'temp_scale_150_plus_competition_bias' THEN v_temp := 1.50; v_reverse_order := false;
  ELSIF p_mode = 'temp_scale_160_plus_competition_bias' THEN v_temp := 1.60; v_reverse_order := false;
  ELSIF p_mode = 'temp_scale_170_plus_competition_bias' THEN v_temp := 1.70; v_reverse_order := false;
  ELSIF p_mode = 'temp_scale_180_plus_competition_bias' THEN v_temp := 1.80; v_reverse_order := false;
  ELSIF p_mode = 'compbias_then_temp_scale_130'         THEN v_temp := 1.30; v_reverse_order := true;
  ELSIF p_mode = 'compbias_then_temp_scale_140'         THEN v_temp := 1.40; v_reverse_order := true;
  ELSIF p_mode = 'compbias_then_temp_scale_150'         THEN v_temp := 1.50; v_reverse_order := true;
  ELSIF p_mode = 'compbias_then_temp_scale_160'         THEN v_temp := 1.60; v_reverse_order := true;
  ELSIF p_mode = 'compbias_then_temp_scale_170'         THEN v_temp := 1.70; v_reverse_order := true;
  ELSE RETURN jsonb_build_object('error', 'Unknown mode: ' || p_mode);
  END IF;

  v_pipeline_label := CASE WHEN v_reverse_order THEN 'compbias_then_temp' ELSE 'temp_then_compbias' END;

  v_transform_cfg := jsonb_build_object(
    'mode',            p_mode,
    'temperature',     v_temp,
    'pipeline_order',  v_pipeline_label,
    'formula',         'stable_power: p_i^(1/T) / sum(p_j^(1/T))',
    'clamp_min',       0.001,
    'clamp_max',       0.95
  );

  -- ── Load competition bias adjustments (is_active=false = candidate pool) ──
  SELECT
    COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='home_bias_correction'),'{}'::jsonb),
    COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='draw_bias_correction'),'{}'::jsonb),
    COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='away_bias_correction'),'{}'::jsonb)
  INTO v_home_map, v_draw_map, v_away_map
  FROM model_lab.calibration_adjustments
  WHERE source_backtest_run_id = p_run_id
    AND group_type = 'competition'
    AND is_active = false;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'group_key',        group_key,
      'adjustment_type',  adjustment_type,
      'adjustment_value', adjustment_value
    )), '[]'::jsonb)
  INTO v_applied
  FROM model_lab.calibration_adjustments
  WHERE source_backtest_run_id = p_run_id
    AND group_type = 'competition'
    AND is_active = false;

  -- ── Main prediction loop ───────────────────────────────────────────────
  FOR rec IN
    SELECT
      p.p_home, p.p_draw, p.p_away,
      p.predicted_result, p.competition_name,
      e.actual_result,
      e.brier_1x2    AS raw_brier,
      e.log_loss_1x2 AS raw_ll,
      e.is_result_correct AS raw_ok
    FROM model_lab.match_model_predictions p
    JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
    WHERE p.backtest_run_id = p_run_id
  LOOP
    v_total  := v_total + 1;
    v_comp   := rec.competition_name;
    v_actual := rec.actual_result;

    -- Raw probs: clamp + renormalize
    v_ph := GREATEST(0.001, rec.p_home);
    v_pd := GREATEST(0.001, rec.p_draw);
    v_pa := GREATEST(0.001, rec.p_away);
    v_norm := v_ph + v_pd + v_pa;
    v_ph := v_ph / v_norm;
    v_pd := v_pd / v_norm;
    v_pa := v_pa / v_norm;

    -- Actual outcome counters
    IF    v_actual = 'H' THEN v_act_h := v_act_h + 1;
    ELSIF v_actual = 'D' THEN v_act_d := v_act_d + 1;
    ELSE                      v_act_a := v_act_a + 1;
    END IF;

    -- Raw-metric accumulators
    v_raw_brier := v_raw_brier + COALESCE(rec.raw_brier, 0);
    v_raw_ll    := v_raw_ll    + COALESCE(rec.raw_ll, 0);
    IF rec.raw_ok THEN v_raw_correct := v_raw_correct + 1; END IF;
    IF    rec.predicted_result = 'H' THEN v_raw_pred_h := v_raw_pred_h + 1;
    ELSIF rec.predicted_result = 'D' THEN v_raw_pred_d := v_raw_pred_d + 1;
    ELSE                                   v_raw_pred_a := v_raw_pred_a + 1;
    END IF;

    -- One-hot indicators
    v_oh := CASE v_actual WHEN 'H' THEN 1 ELSE 0 END;
    v_od := CASE v_actual WHEN 'D' THEN 1 ELSE 0 END;
    v_oa := CASE v_actual WHEN 'A' THEN 1 ELSE 0 END;

    -- ── Apply pipeline ────────────────────────────────────────────────
    IF NOT v_reverse_order THEN
      -- Step 1: Temperature scale raw probs (stable power form)
      v_p1 := POWER(v_ph, 1.0 / v_temp);
      v_p2 := POWER(v_pd, 1.0 / v_temp);
      v_p3 := POWER(v_pa, 1.0 / v_temp);
      v_norm := v_p1 + v_p2 + v_p3;
      v_pah := v_p1 / v_norm;
      v_pad := v_p2 / v_norm;
      v_paa := v_p3 / v_norm;

      -- Step 2: Competition bias
      v_dh := COALESCE((v_home_map ->> v_comp)::numeric, 0);
      v_dd := COALESCE((v_draw_map ->> v_comp)::numeric, 0);
      v_da := COALESCE((v_away_map ->> v_comp)::numeric, 0);
      v_pah := GREATEST(0.001, v_pah + v_dh);
      v_pad := GREATEST(0.001, v_pad + v_dd);
      v_paa := GREATEST(0.001, v_paa + v_da);
    ELSE
      -- Step 1: Competition bias first
      v_dh := COALESCE((v_home_map ->> v_comp)::numeric, 0);
      v_dd := COALESCE((v_draw_map ->> v_comp)::numeric, 0);
      v_da := COALESCE((v_away_map ->> v_comp)::numeric, 0);
      v_pah := GREATEST(0.001, v_ph + v_dh);
      v_pad := GREATEST(0.001, v_pd + v_dd);
      v_paa := GREATEST(0.001, v_pa + v_da);
      -- Clamp + renormalize after bias
      v_pah := LEAST(0.95, v_pah); v_pad := LEAST(0.95, v_pad); v_paa := LEAST(0.95, v_paa);
      v_norm := v_pah + v_pad + v_paa;
      v_pah := v_pah / v_norm; v_pad := v_pad / v_norm; v_paa := v_paa / v_norm;

      -- Step 2: Temperature scale bias-adjusted probs (stable power form)
      v_p1 := POWER(GREATEST(0.001, v_pah), 1.0 / v_temp);
      v_p2 := POWER(GREATEST(0.001, v_pad), 1.0 / v_temp);
      v_p3 := POWER(GREATEST(0.001, v_paa), 1.0 / v_temp);
      v_norm := v_p1 + v_p2 + v_p3;
      v_pah := v_p1 / v_norm;
      v_pad := v_p2 / v_norm;
      v_paa := v_p3 / v_norm;
    END IF;

    -- Final clamp + renormalize
    v_pah := GREATEST(0.001, LEAST(0.95, v_pah));
    v_pad := GREATEST(0.001, LEAST(0.95, v_pad));
    v_paa := GREATEST(0.001, LEAST(0.95, v_paa));
    v_norm := v_pah + v_pad + v_paa;
    v_pah := v_pah / v_norm;
    v_pad := v_pad / v_norm;
    v_paa := v_paa / v_norm;

    -- ── Decision (argmax) ─────────────────────────────────────────────
    IF    v_pah >= v_pad AND v_pah >= v_paa THEN v_adj_pred := 'H';
    ELSIF v_pad >= v_paa                    THEN v_adj_pred := 'D';
    ELSE                                         v_adj_pred := 'A';
    END IF;

    -- ── Adjusted metrics ─────────────────────────────────────────────
    v_adj_b := ((v_pah - v_oh)^2 + (v_pad - v_od)^2 + (v_paa - v_oa)^2) / 3.0;
    v_adj_l := CASE v_actual
                 WHEN 'H' THEN -ln(GREATEST(1e-7, v_pah))
                 WHEN 'D' THEN -ln(GREATEST(1e-7, v_pad))
                 ELSE          -ln(GREATEST(1e-7, v_paa))
               END;
    v_adj_brier := v_adj_brier + v_adj_b;
    v_adj_ll    := v_adj_ll    + v_adj_l;
    IF v_adj_pred = v_actual THEN v_adj_correct := v_adj_correct + 1; END IF;

    IF    v_adj_pred = 'H' THEN v_adj_pred_h := v_adj_pred_h + 1;
    ELSIF v_adj_pred = 'D' THEN v_adj_pred_d := v_adj_pred_d + 1;
    ELSE                        v_adj_pred_a := v_adj_pred_a + 1;
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

    -- Confusion matrix
    v_conf_key := v_adj_pred || '_' || v_actual;
    v_conf := jsonb_set(v_conf, ARRAY[v_conf_key],
                to_jsonb(COALESCE((v_conf ->> v_conf_key)::int, 0) + 1), true);

    -- Reliability bins (p_draw after adjustment)
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

    -- Scenario classification v2
    IF v_pah >= v_pad AND v_pah >= v_paa THEN
      IF    v_pah - GREATEST(v_pad, v_paa) >= 0.15      THEN v_sc := 'home_control';
      ELSIF ABS(v_pah - v_pad) <= 0.10                   THEN v_sc := 'home_lean_draw_risk';
      ELSE                                                     v_sc := 'home_lean';
      END IF;
    ELSIF v_paa >= v_pah AND v_paa >= v_pad THEN
      IF    v_paa - GREATEST(v_pah, v_pad) >= 0.15      THEN v_sc := 'away_control';
      ELSIF ABS(v_paa - v_pad) <= 0.10                   THEN v_sc := 'away_lean_draw_risk';
      ELSE                                                     v_sc := 'away_lean';
      END IF;
    ELSE
      v_sc := 'draw_lean';
    END IF;
    IF (GREATEST(v_pah, v_pad, v_paa) - (v_pah + v_pad + v_paa - GREATEST(v_pah, v_pad, v_paa) - LEAST(v_pah, v_pad, v_paa))) < 0.07 THEN
      v_sc := 'balanced';
    END IF;
    IF v_pah BETWEEN 0.25 AND 0.45 AND v_pad BETWEEN 0.25 AND 0.45 AND v_paa BETWEEN 0.25 AND 0.45 THEN
      v_sc := 'volatile';
    END IF;
    v_scenario_counts := jsonb_set(v_scenario_counts, ARRAY[v_sc],
                           to_jsonb(COALESCE((v_scenario_counts ->> v_sc)::int, 0) + 1), true);

    -- Per-competition accumulation
    v_cacc := COALESCE(v_per_comp -> v_comp, jsonb_build_object(
      'n',0,'adj_correct',0,'raw_correct',0,
      'adj_pred_h',0,'adj_pred_d',0,'adj_pred_a',0,
      'act_h',0,'act_d',0,'act_a',0));
    v_per_comp := jsonb_set(v_per_comp, ARRAY[v_comp], jsonb_build_object(
      'n',           (v_cacc->>'n')::int + 1,
      'adj_correct', (v_cacc->>'adj_correct')::int + CASE WHEN v_adj_pred=v_actual THEN 1 ELSE 0 END,
      'raw_correct', (v_cacc->>'raw_correct')::int + CASE WHEN rec.raw_ok THEN 1 ELSE 0 END,
      'adj_pred_h',  (v_cacc->>'adj_pred_h')::int + CASE WHEN v_adj_pred='H' THEN 1 ELSE 0 END,
      'adj_pred_d',  (v_cacc->>'adj_pred_d')::int + CASE WHEN v_adj_pred='D' THEN 1 ELSE 0 END,
      'adj_pred_a',  (v_cacc->>'adj_pred_a')::int + CASE WHEN v_adj_pred='A' THEN 1 ELSE 0 END,
      'act_h',       (v_cacc->>'act_h')::int + CASE WHEN v_actual='H' THEN 1 ELSE 0 END,
      'act_d',       (v_cacc->>'act_d')::int + CASE WHEN v_actual='D' THEN 1 ELSE 0 END,
      'act_a',       (v_cacc->>'act_a')::int + CASE WHEN v_actual='A' THEN 1 ELSE 0 END
    ), true);
  END LOOP;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('error', 'No predictions found for run_id: ' || p_run_id);
  END IF;

  -- ── Draw / Away precision-recall-F1 ────────────────────────────────────
  v_draw_prec := CASE WHEN v_draw_tp+v_draw_fp > 0 THEN v_draw_tp::numeric/(v_draw_tp+v_draw_fp) ELSE 0 END;
  v_draw_rec  := CASE WHEN v_draw_tp+v_draw_fn > 0 THEN v_draw_tp::numeric/(v_draw_tp+v_draw_fn) ELSE 0 END;
  v_draw_f1   := CASE WHEN v_draw_prec+v_draw_rec > 0 THEN 2*v_draw_prec*v_draw_rec/(v_draw_prec+v_draw_rec) ELSE 0 END;
  v_away_prec := CASE WHEN v_away_tp+v_away_fp > 0 THEN v_away_tp::numeric/(v_away_tp+v_away_fp) ELSE 0 END;
  v_away_rec  := CASE WHEN v_away_tp+v_away_fn > 0 THEN v_away_tp::numeric/(v_away_tp+v_away_fn) ELSE 0 END;
  v_away_f1   := CASE WHEN v_away_prec+v_away_rec > 0 THEN 2*v_away_prec*v_away_rec/(v_away_prec+v_away_rec) ELSE 0 END;

  -- ── Reliability bins + ECE ────────────────────────────────────────────
  v_ece_draw := 0;
  v_bins_out := '[]'::jsonb;
  FOR v_i IN 1..6 LOOP
    IF v_bin_n[v_i] > 0 THEN
      bin_avg_pred := v_bin_pp[v_i]  / v_bin_n[v_i];
      bin_act_rate := v_bin_act[v_i]::numeric / v_bin_n[v_i];
      bin_gap      := ABS(bin_avg_pred - bin_act_rate);
      bin_label    := CASE v_i
        WHEN 1 THEN '0.00-0.10'
        WHEN 2 THEN '0.10-0.20'
        WHEN 3 THEN '0.20-0.30'
        WHEN 4 THEN '0.30-0.40'
        WHEN 5 THEN '0.40-0.50'
        ELSE        '0.50+'
      END;
      v_ece_draw := v_ece_draw + (v_bin_n[v_i]::numeric / v_total) * bin_gap;
      v_bins_out := v_bins_out || jsonb_build_object(
        'bin',              bin_label,
        'n',                v_bin_n[v_i],
        'avg_pred_draw',    round(bin_avg_pred, 4),
        'actual_draw_rate', round(bin_act_rate, 4),
        'gap',              round(bin_gap, 4)
      );

      -- OLS slope accumulators (x = avg_pred_draw, y = actual_draw_rate)
      v_slope_n   := v_slope_n   + 1;
      v_slope_sx  := v_slope_sx  + bin_avg_pred;
      v_slope_sy  := v_slope_sy  + bin_act_rate;
      v_slope_sxx := v_slope_sxx + bin_avg_pred * bin_avg_pred;
      v_slope_sxy := v_slope_sxy + bin_avg_pred * bin_act_rate;
    END IF;
  END LOOP;

  -- OLS calibration slope (requires ≥2 non-empty bins)
  IF v_slope_n >= 2 AND (v_slope_n * v_slope_sxx - v_slope_sx * v_slope_sx) <> 0 THEN
    v_cal_slope_draw := (v_slope_n * v_slope_sxy - v_slope_sx * v_slope_sy)
                      / (v_slope_n * v_slope_sxx - v_slope_sx * v_slope_sx);
  ELSE
    v_cal_slope_draw := NULL;
  END IF;

  -- ── Skill scores ─────────────────────────────────────────────────────
  v_brier_skill_vs_raw      := (v_raw_brier_baseline      - v_adj_brier/v_total) / v_raw_brier_baseline;
  v_brier_skill_vs_compbias := (v_compbias_brier_baseline  - v_adj_brier/v_total) / v_compbias_brier_baseline;

  -- ── Rejection / verdict flags ─────────────────────────────────────────
  -- Hard reject conditions
  IF v_adj_correct::numeric/v_total < v_raw_correct::numeric/v_total - 0.02 THEN
    v_rflags := v_rflags || '["REJECTED: Accuracy drops > 2pp vs raw baseline"]'::jsonb;
  END IF;
  IF v_adj_brier/v_total > v_raw_brier_baseline THEN
    v_rflags := v_rflags || '["REJECTED: Brier worse than raw baseline"]'::jsonb;
  END IF;
  IF v_adj_ll/v_total > v_raw_ll/v_total + 0.025 THEN
    v_rflags := v_rflags || '["REJECTED: Log Loss worsens > 0.025 vs raw"]'::jsonb;
  END IF;
  IF v_adj_pred_a::numeric/v_total < 0.08 THEN
    v_rflags := v_rflags || '["REJECTED: Away rate < 8%"]'::jsonb;
  END IF;
  IF v_draw_prec > 0 AND v_draw_prec < 0.25 THEN
    v_rflags := v_rflags || '["REJECTED: Draw precision < 25%"]'::jsonb;
  END IF;
  IF v_cal_slope_draw IS NOT NULL AND (v_cal_slope_draw < 0.8 OR v_cal_slope_draw > 1.2) THEN
    v_rflags := v_rflags || jsonb_build_array('REJECTED: cal_slope_draw out of [0.8,1.2]: ' || round(v_cal_slope_draw,3));
  END IF;

  -- Risky conditions
  IF v_adj_pred_h::numeric/v_total > 0.80 THEN
    v_rflags := v_rflags || '["RISKY: Home rate > 80%"]'::jsonb;
  END IF;
  IF v_adj_pred_d::numeric/v_total < 0.08 THEN
    v_rflags := v_rflags || '["RISKY: Draw rate < 8%"]'::jsonb;
  END IF;
  IF v_draw_f1 < 0.18 THEN
    v_rflags := v_rflags || '["RISKY: Draw F1 < 0.18"]'::jsonb;
  END IF;
  IF v_brier_skill_vs_compbias < -0.005 THEN
    v_rflags := v_rflags || jsonb_build_array('RISKY: Brier skill vs compbias negative: ' || round(v_brier_skill_vs_compbias,5));
  END IF;
  IF v_cal_slope_draw IS NOT NULL AND (v_cal_slope_draw < 0.9 OR v_cal_slope_draw > 1.1) THEN
    v_rflags := v_rflags || jsonb_build_array('RISKY: cal_slope_draw out of [0.9,1.1]: ' || round(v_cal_slope_draw,3));
  END IF;

  -- Per-competition accuracy drops
  FOR comp_key, comp_val IN SELECT key, value FROM jsonb_each(v_per_comp) LOOP
    comp_raw_acc := CASE WHEN (comp_val->>'n')::int > 0 THEN (comp_val->>'raw_correct')::numeric / (comp_val->>'n')::int ELSE 0 END;
    comp_adj_acc := CASE WHEN (comp_val->>'n')::int > 0 THEN (comp_val->>'adj_correct')::numeric / (comp_val->>'n')::int ELSE 0 END;
    IF comp_raw_acc - comp_adj_acc > 0.05 THEN
      v_rflags := v_rflags || jsonb_build_array('RISKY: ' || comp_key || ' accuracy drops > 5pp');
    END IF;
  END LOOP;

  -- Verdict
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_rflags) f WHERE f LIKE 'REJECTED%') THEN
    v_verdict := 'rejected';
  ELSIF jsonb_array_length(v_rflags) > 0 THEN
    v_verdict := 'risky';
  ELSIF v_adj_brier/v_total <= v_raw_brier_baseline
    AND v_adj_pred_d::numeric/v_total >= 0.08
    AND v_draw_f1 > 0.18
  THEN
    v_verdict := 'promising';
  END IF;

  v_notes := CASE v_verdict WHEN 'promising' THEN 'PROMISING: candidate for adjusted rerun. ' ELSE '' END;
  v_notes := v_notes
    || 'Pipeline=' || v_pipeline_label
    || ' T=' || v_temp
    || ' DrawF1=' || round(v_draw_f1, 3)
    || ' AwayF1=' || round(v_away_f1, 3)
    || CASE WHEN v_cal_slope_draw IS NOT NULL
            THEN ' CalSlope=' || round(v_cal_slope_draw, 3)
            ELSE ' CalSlope=unavailable'
       END;

  -- ── Upsert result row ──────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_adjustment_simulations (
    source_backtest_run_id, simulation_key, simulation_status,
    applied_adjustments, sample_size,
    raw_avg_brier_1x2, adjusted_avg_brier_1x2,
    raw_avg_log_loss_1x2, adjusted_avg_log_loss_1x2,
    raw_result_accuracy, adjusted_result_accuracy,
    raw_pred_home_rate, raw_pred_draw_rate, raw_pred_away_rate,
    adjusted_pred_home_rate, adjusted_pred_draw_rate, adjusted_pred_away_rate,
    actual_home_rate, actual_draw_rate, actual_away_rate,
    per_competition_metrics, per_confidence_metrics,
    raw_decision_distribution_json, adjusted_decision_distribution_json,
    decision_rule_config, scenario_class_distribution_json,
    probability_unchanged,
    draw_capture_rate, home_overcall_reduction, confusion_matrix_json,
    draw_precision, draw_recall, draw_f1,
    away_precision, away_recall, away_f1,
    expected_calibration_error_draw, reliability_bins_draw,
    probability_transform_config, rejection_flags, simulation_verdict,
    brier_skill_vs_raw, brier_skill_vs_compbias, calibration_slope_draw,
    notes
  ) VALUES (
    p_run_id, p_mode, 'completed',
    v_applied, v_total,
    v_raw_brier / v_total, v_adj_brier / v_total,
    v_raw_ll    / v_total, v_adj_ll    / v_total,
    v_raw_correct::numeric / v_total, v_adj_correct::numeric / v_total,
    v_raw_pred_h::numeric / v_total,  v_raw_pred_d::numeric / v_total,  v_raw_pred_a::numeric / v_total,
    v_adj_pred_h::numeric / v_total,  v_adj_pred_d::numeric / v_total,  v_adj_pred_a::numeric / v_total,
    v_act_h::numeric / v_total,       v_act_d::numeric / v_total,       v_act_a::numeric / v_total,
    v_per_comp, '{}'::jsonb,
    jsonb_build_object('H', v_raw_pred_h, 'D', v_raw_pred_d, 'A', v_raw_pred_a),
    jsonb_build_object('H', v_adj_pred_h, 'D', v_adj_pred_d, 'A', v_adj_pred_a),
    v_transform_cfg, v_scenario_counts, false,
    CASE WHEN v_act_d > 0 THEN v_draw_tp::numeric / v_act_d ELSE NULL END,
    v_raw_pred_h::numeric/v_total - v_adj_pred_h::numeric/v_total,
    v_conf,
    round(v_draw_prec, 6), round(v_draw_rec, 6), round(v_draw_f1, 6),
    round(v_away_prec, 6), round(v_away_rec, 6), round(v_away_f1, 6),
    round(v_ece_draw, 6), v_bins_out,
    v_transform_cfg, v_rflags, v_verdict,
    round(v_brier_skill_vs_raw,      8),
    round(v_brier_skill_vs_compbias, 8),
    CASE WHEN v_cal_slope_draw IS NOT NULL THEN round(v_cal_slope_draw, 6) ELSE NULL END,
    NULLIF(trim(v_notes), '')
  )
  ON CONFLICT (source_backtest_run_id, simulation_key) DO UPDATE SET
    adjusted_avg_brier_1x2      = EXCLUDED.adjusted_avg_brier_1x2,
    adjusted_avg_log_loss_1x2   = EXCLUDED.adjusted_avg_log_loss_1x2,
    raw_result_accuracy         = EXCLUDED.raw_result_accuracy,
    adjusted_result_accuracy    = EXCLUDED.adjusted_result_accuracy,
    raw_pred_home_rate          = EXCLUDED.raw_pred_home_rate,
    raw_pred_draw_rate          = EXCLUDED.raw_pred_draw_rate,
    raw_pred_away_rate          = EXCLUDED.raw_pred_away_rate,
    adjusted_pred_home_rate     = EXCLUDED.adjusted_pred_home_rate,
    adjusted_pred_draw_rate     = EXCLUDED.adjusted_pred_draw_rate,
    adjusted_pred_away_rate     = EXCLUDED.adjusted_pred_away_rate,
    actual_home_rate            = EXCLUDED.actual_home_rate,
    actual_draw_rate            = EXCLUDED.actual_draw_rate,
    actual_away_rate            = EXCLUDED.actual_away_rate,
    per_competition_metrics     = EXCLUDED.per_competition_metrics,
    raw_decision_distribution_json  = EXCLUDED.raw_decision_distribution_json,
    adjusted_decision_distribution_json = EXCLUDED.adjusted_decision_distribution_json,
    decision_rule_config        = EXCLUDED.decision_rule_config,
    scenario_class_distribution_json = EXCLUDED.scenario_class_distribution_json,
    draw_capture_rate           = EXCLUDED.draw_capture_rate,
    home_overcall_reduction     = EXCLUDED.home_overcall_reduction,
    confusion_matrix_json       = EXCLUDED.confusion_matrix_json,
    draw_precision              = EXCLUDED.draw_precision,
    draw_recall                 = EXCLUDED.draw_recall,
    draw_f1                     = EXCLUDED.draw_f1,
    away_precision              = EXCLUDED.away_precision,
    away_recall                 = EXCLUDED.away_recall,
    away_f1                     = EXCLUDED.away_f1,
    expected_calibration_error_draw = EXCLUDED.expected_calibration_error_draw,
    reliability_bins_draw       = EXCLUDED.reliability_bins_draw,
    probability_transform_config = EXCLUDED.probability_transform_config,
    rejection_flags             = EXCLUDED.rejection_flags,
    simulation_verdict          = EXCLUDED.simulation_verdict,
    brier_skill_vs_raw          = EXCLUDED.brier_skill_vs_raw,
    brier_skill_vs_compbias     = EXCLUDED.brier_skill_vs_compbias,
    calibration_slope_draw      = EXCLUDED.calibration_slope_draw,
    notes                       = EXCLUDED.notes,
    created_at                  = now()
  RETURNING id INTO v_sim_id;

  RETURN jsonb_build_object(
    'simulation_id',            v_sim_id,
    'simulation_key',           p_mode,
    'pipeline_order',           v_pipeline_label,
    'temperature',              v_temp,
    'sample_size',              v_total,
    'verdict',                  v_verdict,
    'raw_accuracy',             round(v_raw_correct::numeric/v_total, 6),
    'adj_accuracy',             round(v_adj_correct::numeric/v_total, 6),
    'raw_avg_brier',            round(v_raw_brier/v_total, 8),
    'adj_avg_brier',            round(v_adj_brier/v_total, 8),
    'brier_skill_vs_raw',       round(v_brier_skill_vs_raw,      8),
    'brier_skill_vs_compbias',  round(v_brier_skill_vs_compbias, 8),
    'raw_avg_ll',               round(v_raw_ll/v_total, 8),
    'adj_avg_ll',               round(v_adj_ll/v_total, 8),
    'adj_pred_h',               round(v_adj_pred_h::numeric/v_total, 6),
    'adj_pred_d',               round(v_adj_pred_d::numeric/v_total, 6),
    'adj_pred_a',               round(v_adj_pred_a::numeric/v_total, 6),
    'draw_precision',           round(v_draw_prec, 6),
    'draw_recall',              round(v_draw_rec,  6),
    'draw_f1',                  round(v_draw_f1,   6),
    'away_f1',                  round(v_away_f1,   6),
    'draw_capture_rate',        CASE WHEN v_act_d > 0 THEN round(v_draw_tp::numeric/v_act_d, 6) ELSE NULL END,
    'home_overcall_reduction',  round(v_raw_pred_h::numeric/v_total - v_adj_pred_h::numeric/v_total, 6),
    'ece_draw',                 round(v_ece_draw, 6),
    'calibration_slope_draw',   v_cal_slope_draw,
    'rejection_flags',          v_rflags,
    'notes',                    COALESCE(trim(v_notes), '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ml_run_temperature_grid_search(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ml_run_temperature_grid_search(uuid, text) TO authenticated;
