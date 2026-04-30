/*
  # Create ml_run_draw_floor_simulation RPC

  ## Purpose
  Runs draw-floor + temperature calibration simulations on an existing backtest run.
  Supports 12 simulation modes. Never mutates original predictions/evaluations.

  ## Probability pipeline for each prediction
  1. Optionally apply temperature scaling: softmax(log(p) / T)
  2. Optionally apply competition_bias_only adjustments (additive, scale=1.0)
  3. Optionally apply asymmetric draw floor redistribution
  4. Clamp [0.001, 0.95], renormalise

  ## Asymmetric draw floor redistribution
  If p_draw < floor:
    draw_delta = floor - p_draw
    Rule A (protect away): p_away < 0.15 → 85% from home, 15% from away (never below 0.05)
    Rule B (home dominant): p_home > 0.60 AND p_away >= 0.15 → 70% from home, 30% from away
    Rule C (otherwise): proportional from home and away

  ## Rejection criteria stored in rejection_flags
  - Brier worsens > +0.015
  - Log Loss worsens > +0.025
  - Accuracy drops > 2pp
  - Predicted away rate < 8%
  - Draw precision < 25%
  - Predicted home rate > 80%
  - Predicted draw rate < 12%

  ## Security
  SECURITY DEFINER + _ml_assert_admin()
*/

CREATE OR REPLACE FUNCTION public.ml_run_draw_floor_simulation(
  p_run_id uuid,
  p_mode   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  -- competition bias maps
  v_home_map jsonb := '{}'::jsonb;
  v_draw_map jsonb := '{}'::jsonb;
  v_away_map jsonb := '{}'::jsonb;
  -- competition actual draw rates for dynamic floor modes
  v_comp_draw_rate jsonb := '{}'::jsonb;

  -- mode parameters
  v_temp          numeric := 0;      -- 0 = no temp scaling
  v_use_comp_bias boolean := true;   -- all modes use competition_bias
  v_draw_floor    numeric := 0;      -- 0 = no hard floor
  v_dynamic_floor boolean := false;
  v_dynamic_pct   numeric := 0;
  v_dynamic_min   numeric := 0;
  v_dynamic_max   numeric := 0;

  -- global metric accumulators
  v_total       int := 0;
  v_raw_brier   numeric := 0;
  v_adj_brier   numeric := 0;
  v_raw_ll      numeric := 0;
  v_adj_ll      numeric := 0;
  v_raw_correct int := 0;
  v_adj_correct int := 0;

  v_raw_pred_h int:=0; v_raw_pred_d int:=0; v_raw_pred_a int:=0;
  v_adj_pred_h int:=0; v_adj_pred_d int:=0; v_adj_pred_a int:=0;
  v_act_h int:=0; v_act_d int:=0; v_act_a int:=0;

  -- confusion matrix: adj_pred × actual
  v_conf jsonb := '{}'::jsonb;

  -- draw/away precision-recall
  v_draw_tp int:=0; v_draw_fp int:=0; v_draw_fn int:=0;
  v_away_tp int:=0; v_away_fp int:=0; v_away_fn int:=0;

  -- reliability bins for draw (6 bins: 0-.10, .10-.20, ..., .50+)
  v_bin_n    int[6]     := '{0,0,0,0,0,0}';
  v_bin_pp   numeric[6] := '{0,0,0,0,0,0}';
  v_bin_act  int[6]     := '{0,0,0,0,0,0}';

  -- per-competition
  v_per_comp jsonb := '{}'::jsonb;

  -- scenario class
  v_scenario_counts jsonb := '{}'::jsonb;

  v_notes   text := '';
  v_sim_id  uuid;
  v_applied jsonb := '[]'::jsonb;

  rec RECORD;
  v_ph numeric; v_pd numeric; v_pa numeric;
  v_pah numeric; v_pad numeric; v_paa numeric;
  v_norm numeric;
  v_adj_pred text; v_actual text; v_comp text;
  v_oh int; v_od int; v_oa int;
  v_adj_b numeric; v_adj_l numeric;
  v_conf_key text;
  v_cacc jsonb;
  v_dh numeric; v_dd numeric; v_da numeric;
  v_logph numeric; v_logpd numeric; v_logpa numeric;
  v_floor numeric;
  v_draw_delta numeric;
  v_sc text;
  v_bin_idx int;

  -- per-class final metrics
  v_draw_prec numeric; v_draw_rec numeric; v_draw_f1 numeric;
  v_away_prec numeric; v_away_rec numeric; v_away_f1 numeric;
  v_ece_draw  numeric;

  -- reliability bin output
  v_bins_out jsonb;
  v_rflags   jsonb := '[]'::jsonb;
  v_verdict  text  := 'neutral';
  v_transform_cfg jsonb;
BEGIN
  PERFORM public._ml_assert_admin();

  -- ── Resolve mode parameters ────────────────────────────────────────────────
  IF p_mode = 'draw_floor_12_plus_competition_bias' THEN
    v_draw_floor := 0.12;
  ELSIF p_mode = 'draw_floor_15_plus_competition_bias' THEN
    v_draw_floor := 0.15;
  ELSIF p_mode = 'draw_floor_18_plus_competition_bias' THEN
    v_draw_floor := 0.18;
  ELSIF p_mode = 'draw_floor_22_plus_competition_bias' THEN
    v_draw_floor := 0.22;
  ELSIF p_mode = 'dynamic_draw_floor_60pct_by_competition' THEN
    v_dynamic_floor := true; v_dynamic_pct := 0.60; v_dynamic_min := 0.10; v_dynamic_max := 0.18;
  ELSIF p_mode = 'dynamic_draw_floor_70pct_by_competition' THEN
    v_dynamic_floor := true; v_dynamic_pct := 0.70; v_dynamic_min := 0.12; v_dynamic_max := 0.22;
  ELSIF p_mode = 'temp_scale_15_plus_competition_bias' THEN
    v_temp := 1.5;
  ELSIF p_mode = 'temp_scale_20_plus_competition_bias' THEN
    v_temp := 2.0;
  ELSIF p_mode = 'temp_scale_15_plus_draw_floor_15' THEN
    v_temp := 1.5; v_draw_floor := 0.15;
  ELSIF p_mode = 'temp_scale_20_plus_draw_floor_15' THEN
    v_temp := 2.0; v_draw_floor := 0.15;
  ELSIF p_mode = 'temp_scale_15_plus_dynamic_draw_floor_70pct' THEN
    v_temp := 1.5; v_dynamic_floor := true; v_dynamic_pct := 0.70; v_dynamic_min := 0.12; v_dynamic_max := 0.22;
  ELSIF p_mode = 'temp_scale_20_plus_dynamic_draw_floor_70pct' THEN
    v_temp := 2.0; v_dynamic_floor := true; v_dynamic_pct := 0.70; v_dynamic_min := 0.12; v_dynamic_max := 0.22;
  ELSE
    RETURN jsonb_build_object('error', 'Unknown mode: ' || p_mode);
  END IF;

  v_transform_cfg := jsonb_build_object(
    'mode', p_mode,
    'temperature', v_temp,
    'use_competition_bias', v_use_comp_bias,
    'draw_floor', v_draw_floor,
    'dynamic_floor', v_dynamic_floor,
    'dynamic_pct', v_dynamic_pct,
    'dynamic_min', v_dynamic_min,
    'dynamic_max', v_dynamic_max
  );

  -- ── Load competition bias maps ─────────────────────────────────────────────
  SELECT
    COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='home_bias_correction'), '{}'::jsonb),
    COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='draw_bias_correction'), '{}'::jsonb),
    COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='away_bias_correction'), '{}'::jsonb)
  INTO v_home_map, v_draw_map, v_away_map
  FROM model_lab.calibration_adjustments
  WHERE source_backtest_run_id = p_run_id AND group_type='competition' AND is_active=false;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'group_key', group_key, 'adjustment_type', adjustment_type, 'adjustment_value', adjustment_value
  )), '[]'::jsonb)
  INTO v_applied
  FROM model_lab.calibration_adjustments
  WHERE source_backtest_run_id = p_run_id AND group_type='competition' AND is_active=false;

  -- ── Load per-competition actual draw rates for dynamic floor ───────────────
  IF v_dynamic_floor THEN
    SELECT COALESCE(jsonb_object_agg(
      p.competition_name,
      round(COUNT(*) FILTER (WHERE e.actual_result='D')::numeric / COUNT(*), 4)
    ), '{}'::jsonb)
    INTO v_comp_draw_rate
    FROM model_lab.match_model_predictions p
    JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
    WHERE p.backtest_run_id = p_run_id
    GROUP BY p.competition_name;
  END IF;

  -- ── Main prediction loop ───────────────────────────────────────────────────
  FOR rec IN
    SELECT p.p_home, p.p_draw, p.p_away, p.predicted_result, p.competition_name,
           e.actual_result, e.brier_1x2 AS raw_brier, e.log_loss_1x2 AS raw_ll,
           e.is_result_correct AS raw_ok
    FROM model_lab.match_model_predictions p
    JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
    WHERE p.backtest_run_id = p_run_id
  LOOP
    v_total  := v_total + 1;
    v_comp   := rec.competition_name;
    v_actual := rec.actual_result;
    v_ph := rec.p_home; v_pd := rec.p_draw; v_pa := rec.p_away;

    IF v_actual='H' THEN v_act_h:=v_act_h+1;
    ELSIF v_actual='D' THEN v_act_d:=v_act_d+1;
    ELSE v_act_a:=v_act_a+1; END IF;

    v_raw_brier := v_raw_brier + COALESCE(rec.raw_brier, 0);
    v_raw_ll    := v_raw_ll    + COALESCE(rec.raw_ll, 0);
    IF rec.raw_ok THEN v_raw_correct := v_raw_correct + 1; END IF;
    IF rec.predicted_result='H' THEN v_raw_pred_h:=v_raw_pred_h+1;
    ELSIF rec.predicted_result='D' THEN v_raw_pred_d:=v_raw_pred_d+1;
    ELSE v_raw_pred_a:=v_raw_pred_a+1; END IF;

    v_oh := CASE v_actual WHEN 'H' THEN 1 ELSE 0 END;
    v_od := CASE v_actual WHEN 'D' THEN 1 ELSE 0 END;
    v_oa := CASE v_actual WHEN 'A' THEN 1 ELSE 0 END;

    -- Step 1: Temperature scaling (on original probs, before bias correction)
    IF v_temp > 0 THEN
      v_logph := ln(GREATEST(1e-9, v_ph));
      v_logpd := ln(GREATEST(1e-9, v_pd));
      v_logpa := ln(GREATEST(1e-9, v_pa));
      v_pah := exp(v_logph / v_temp);
      v_pad := exp(v_logpd / v_temp);
      v_paa := exp(v_logpa / v_temp);
      v_norm := v_pah + v_pad + v_paa;
      v_pah := v_pah/v_norm; v_pad := v_pad/v_norm; v_paa := v_paa/v_norm;
    ELSE
      v_pah := v_ph; v_pad := v_pd; v_paa := v_pa;
    END IF;

    -- Step 2: Competition bias correction
    v_dh := COALESCE((v_home_map->>v_comp)::numeric, 0);
    v_dd := COALESCE((v_draw_map->>v_comp)::numeric, 0);
    v_da := COALESCE((v_away_map->>v_comp)::numeric, 0);
    v_pah := GREATEST(0.001, v_pah + v_dh);
    v_pad := GREATEST(0.001, v_pad + v_dd);
    v_paa := GREATEST(0.001, v_paa + v_da);
    v_norm := v_pah + v_pad + v_paa;
    v_pah := LEAST(0.95, v_pah/v_norm);
    v_pad := LEAST(0.95, v_pad/v_norm);
    v_paa := LEAST(0.95, v_paa/v_norm);
    -- re-normalise after clamping max
    v_norm := v_pah + v_pad + v_paa;
    v_pah := v_pah/v_norm; v_pad := v_pad/v_norm; v_paa := v_paa/v_norm;

    -- Step 3: Draw floor
    IF v_dynamic_floor THEN
      v_floor := GREATEST(v_dynamic_min, LEAST(v_dynamic_max,
        COALESCE((v_comp_draw_rate->>v_comp)::numeric, 0.25) * v_dynamic_pct));
    ELSE
      v_floor := v_draw_floor;
    END IF;

    IF v_floor > 0 AND v_pad < v_floor THEN
      v_draw_delta := v_floor - v_pad;
      -- Asymmetric redistribution
      IF v_paa < 0.15 THEN
        -- Rule A: protect away
        v_pah := v_pah - (0.85 * v_draw_delta);
        v_paa := GREATEST(0.05, v_paa - (0.15 * v_draw_delta));
      ELSIF v_pah > 0.60 THEN
        -- Rule B: high home dominance
        v_pah := v_pah - (0.70 * v_draw_delta);
        v_paa := v_paa - (0.30 * v_draw_delta);
      ELSE
        -- Rule C: proportional
        v_norm := v_pah + v_paa;
        IF v_norm > 0 THEN
          v_pah := v_pah - v_draw_delta * (v_pah / v_norm);
          v_paa := v_paa - v_draw_delta * (v_paa / v_norm);
        END IF;
      END IF;
      v_pad := v_floor;
    END IF;

    -- Final clamp + renormalise
    v_pah := GREATEST(0.001, LEAST(0.95, v_pah));
    v_pad := GREATEST(0.001, LEAST(0.95, v_pad));
    v_paa := GREATEST(0.001, LEAST(0.95, v_paa));
    v_norm := v_pah + v_pad + v_paa;
    v_pah := v_pah/v_norm; v_pad := v_pad/v_norm; v_paa := v_paa/v_norm;

    -- Decision
    IF v_pah >= v_pad AND v_pah >= v_paa THEN v_adj_pred := 'H';
    ELSIF v_pad >= v_paa THEN v_adj_pred := 'D';
    ELSE v_adj_pred := 'A'; END IF;

    -- Brier / Log Loss
    v_adj_b := ((v_pah-v_oh)^2 + (v_pad-v_od)^2 + (v_paa-v_oa)^2) / 3.0;
    v_adj_l := CASE v_actual
      WHEN 'H' THEN -ln(GREATEST(1e-7, v_pah))
      WHEN 'D' THEN -ln(GREATEST(1e-7, v_pad))
      ELSE          -ln(GREATEST(1e-7, v_paa))
    END;
    v_adj_brier := v_adj_brier + v_adj_b;
    v_adj_ll    := v_adj_ll    + v_adj_l;
    IF v_adj_pred = v_actual THEN v_adj_correct := v_adj_correct + 1; END IF;

    IF v_adj_pred='H' THEN v_adj_pred_h:=v_adj_pred_h+1;
    ELSIF v_adj_pred='D' THEN v_adj_pred_d:=v_adj_pred_d+1;
    ELSE v_adj_pred_a:=v_adj_pred_a+1; END IF;

    -- Draw precision/recall
    IF v_adj_pred='D' THEN
      IF v_actual='D' THEN v_draw_tp:=v_draw_tp+1; ELSE v_draw_fp:=v_draw_fp+1; END IF;
    ELSIF v_actual='D' THEN v_draw_fn:=v_draw_fn+1; END IF;

    -- Away precision/recall
    IF v_adj_pred='A' THEN
      IF v_actual='A' THEN v_away_tp:=v_away_tp+1; ELSE v_away_fp:=v_away_fp+1; END IF;
    ELSIF v_actual='A' THEN v_away_fn:=v_away_fn+1; END IF;

    -- Confusion matrix
    v_conf_key := v_adj_pred||'_'||v_actual;
    v_conf := jsonb_set(v_conf, ARRAY[v_conf_key],
      to_jsonb(COALESCE((v_conf->>v_conf_key)::int,0)+1), true);

    -- Reliability bin for draw (based on v_pad)
    v_bin_idx := CASE
      WHEN v_pad < 0.10 THEN 1
      WHEN v_pad < 0.20 THEN 2
      WHEN v_pad < 0.30 THEN 3
      WHEN v_pad < 0.40 THEN 4
      WHEN v_pad < 0.50 THEN 5
      ELSE 6
    END;
    v_bin_n[v_bin_idx]   := v_bin_n[v_bin_idx] + 1;
    v_bin_pp[v_bin_idx]  := v_bin_pp[v_bin_idx] + v_pad;
    v_bin_act[v_bin_idx] := v_bin_act[v_bin_idx] + v_od;

    -- Scenario class v2
    IF v_pah >= v_pad AND v_pah >= v_paa THEN
      IF v_pah - GREATEST(v_pad,v_paa) >= 0.15 THEN v_sc := 'home_control';
      ELSIF ABS(v_pah-v_pad) <= 0.10 THEN v_sc := 'home_lean_draw_risk';
      ELSE v_sc := 'home_lean'; END IF;
    ELSIF v_paa >= v_pah AND v_paa >= v_pad THEN
      IF v_paa - GREATEST(v_pah,v_pad) >= 0.15 THEN v_sc := 'away_control';
      ELSIF ABS(v_paa-v_pad) <= 0.10 THEN v_sc := 'away_lean_draw_risk';
      ELSE v_sc := 'away_lean'; END IF;
    ELSE v_sc := 'draw_lean'; END IF;
    IF (GREATEST(v_pah,v_pad,v_paa) - (v_pah+v_pad+v_paa - GREATEST(v_pah,v_pad,v_paa) - LEAST(v_pah,v_pad,v_paa))) < 0.07 THEN
      v_sc := 'balanced';
    END IF;
    IF v_pah BETWEEN 0.25 AND 0.45 AND v_pad BETWEEN 0.25 AND 0.45 AND v_paa BETWEEN 0.25 AND 0.45 THEN
      v_sc := 'volatile';
    END IF;
    v_scenario_counts := jsonb_set(v_scenario_counts, ARRAY[v_sc],
      to_jsonb(COALESCE((v_scenario_counts->>v_sc)::int,0)+1), true);

    -- Per-competition
    v_cacc := COALESCE(v_per_comp->v_comp, jsonb_build_object(
      'n',0,'adj_correct',0,'raw_correct',0,
      'adj_pred_h',0,'adj_pred_d',0,'adj_pred_a',0,
      'act_h',0,'act_d',0,'act_a',0));
    v_per_comp := jsonb_set(v_per_comp, ARRAY[v_comp], jsonb_build_object(
      'n',           (v_cacc->>'n')::int+1,
      'adj_correct', (v_cacc->>'adj_correct')::int+CASE WHEN v_adj_pred=v_actual THEN 1 ELSE 0 END,
      'raw_correct', (v_cacc->>'raw_correct')::int+CASE WHEN rec.raw_ok THEN 1 ELSE 0 END,
      'adj_pred_h',  (v_cacc->>'adj_pred_h')::int+CASE WHEN v_adj_pred='H' THEN 1 ELSE 0 END,
      'adj_pred_d',  (v_cacc->>'adj_pred_d')::int+CASE WHEN v_adj_pred='D' THEN 1 ELSE 0 END,
      'adj_pred_a',  (v_cacc->>'adj_pred_a')::int+CASE WHEN v_adj_pred='A' THEN 1 ELSE 0 END,
      'act_h',       (v_cacc->>'act_h')::int+CASE WHEN v_actual='H' THEN 1 ELSE 0 END,
      'act_d',       (v_cacc->>'act_d')::int+CASE WHEN v_actual='D' THEN 1 ELSE 0 END,
      'act_a',       (v_cacc->>'act_a')::int+CASE WHEN v_actual='A' THEN 1 ELSE 0 END
    ), true);
  END LOOP;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('error','No predictions found','run_id',p_run_id);
  END IF;

  -- ── Compute draw/away precision, recall, F1 ───────────────────────────────
  v_draw_prec := CASE WHEN v_draw_tp+v_draw_fp > 0 THEN v_draw_tp::numeric/(v_draw_tp+v_draw_fp) ELSE 0 END;
  v_draw_rec  := CASE WHEN v_draw_tp+v_draw_fn > 0 THEN v_draw_tp::numeric/(v_draw_tp+v_draw_fn) ELSE 0 END;
  v_draw_f1   := CASE WHEN v_draw_prec+v_draw_rec > 0 THEN 2*v_draw_prec*v_draw_rec/(v_draw_prec+v_draw_rec) ELSE 0 END;
  v_away_prec := CASE WHEN v_away_tp+v_away_fp > 0 THEN v_away_tp::numeric/(v_away_tp+v_away_fp) ELSE 0 END;
  v_away_rec  := CASE WHEN v_away_tp+v_away_fn > 0 THEN v_away_tp::numeric/(v_away_tp+v_away_fn) ELSE 0 END;
  v_away_f1   := CASE WHEN v_away_prec+v_away_rec > 0 THEN 2*v_away_prec*v_away_rec/(v_away_prec+v_away_rec) ELSE 0 END;

  -- ── Reliability bins for draw ─────────────────────────────────────────────
  v_ece_draw := 0;
  v_bins_out := '[]'::jsonb;
  FOR i IN 1..6 LOOP
    IF v_bin_n[i] > 0 THEN
      DECLARE
        bin_avg_pred numeric := v_bin_pp[i] / v_bin_n[i];
        bin_act_rate numeric := v_bin_act[i]::numeric / v_bin_n[i];
        bin_gap      numeric := ABS(bin_avg_pred - bin_act_rate);
        bin_label    text    := CASE i WHEN 1 THEN '0.00-0.10' WHEN 2 THEN '0.10-0.20'
                                       WHEN 3 THEN '0.20-0.30' WHEN 4 THEN '0.30-0.40'
                                       WHEN 5 THEN '0.40-0.50' ELSE '0.50+' END;
      BEGIN
        v_ece_draw := v_ece_draw + (v_bin_n[i]::numeric/v_total) * bin_gap;
        v_bins_out := v_bins_out || jsonb_build_object(
          'bin', bin_label,
          'n', v_bin_n[i],
          'avg_pred_draw', round(bin_avg_pred, 4),
          'actual_draw_rate', round(bin_act_rate, 4),
          'gap', round(bin_gap, 4)
        );
      END;
    END IF;
  END LOOP;

  -- ── Rejection flags ───────────────────────────────────────────────────────
  IF v_adj_brier/v_total > v_raw_brier/v_total + 0.015 THEN
    v_rflags := v_rflags || '["REJECTED: Brier worsens by > 0.015"]'::jsonb;
  END IF;
  IF v_adj_ll/v_total > v_raw_ll/v_total + 0.025 THEN
    v_rflags := v_rflags || '["REJECTED: Log Loss worsens by > 0.025"]'::jsonb;
  END IF;
  IF v_raw_correct::numeric/v_total - v_adj_correct::numeric/v_total > 0.02 THEN
    v_rflags := v_rflags || '["REJECTED: Accuracy drops > 2pp"]'::jsonb;
  END IF;
  IF v_adj_pred_a::numeric/v_total < 0.08 THEN
    v_rflags := v_rflags || '["REJECTED: Predicted away rate < 8%"]'::jsonb;
  END IF;
  IF v_draw_prec < 0.25 THEN
    v_rflags := v_rflags || '["REJECTED: Draw precision < 25%"]'::jsonb;
  END IF;
  IF v_adj_pred_h::numeric/v_total > 0.80 THEN
    v_rflags := v_rflags || '["RISKY: Predicted home rate still > 80%"]'::jsonb;
  END IF;
  IF v_adj_pred_d::numeric/v_total < 0.12 THEN
    v_rflags := v_rflags || '["RISKY: Predicted draw rate still < 12%"]'::jsonb;
  END IF;

  -- Check competition accuracy drops
  DECLARE comp_rec RECORD; BEGIN
    FOR comp_rec IN SELECT key, value FROM jsonb_each(v_per_comp) LOOP
      DECLARE
        raw_acc numeric := CASE WHEN (comp_rec.value->>'n')::int > 0
          THEN (comp_rec.value->>'raw_correct')::numeric / (comp_rec.value->>'n')::int ELSE 0 END;
        adj_acc numeric := CASE WHEN (comp_rec.value->>'n')::int > 0
          THEN (comp_rec.value->>'adj_correct')::numeric / (comp_rec.value->>'n')::int ELSE 0 END;
      BEGIN
        IF raw_acc - adj_acc > 0.05 THEN
          v_rflags := v_rflags || jsonb_build_array('RISKY: ' || comp_rec.key || ' accuracy drops > 5pp');
        END IF;
      END;
    END LOOP;
  END;

  -- Verdict
  IF jsonb_array_length(v_rflags) = 0 AND
     v_adj_brier/v_total <= v_raw_brier/v_total + 0.002 AND
     v_adj_pred_d::numeric/v_total >= 0.12 AND
     v_draw_f1 > 0.20 THEN
    v_verdict := 'promising';
  ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_rflags) f WHERE f LIKE 'REJECTED%') THEN
    v_verdict := 'rejected';
  ELSIF jsonb_array_length(v_rflags) > 0 THEN
    v_verdict := 'risky';
  END IF;

  -- Notes
  IF v_verdict = 'promising' THEN v_notes := 'PROMISING: candidate for adjusted rerun. '; END IF;
  IF v_draw_prec > 0 THEN v_notes := v_notes || 'Draw F1=' || round(v_draw_f1,3) || '. '; END IF;

  -- ── Upsert ────────────────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_adjustment_simulations (
    source_backtest_run_id, simulation_key, simulation_status, applied_adjustments, sample_size,
    raw_avg_brier_1x2, adjusted_avg_brier_1x2, raw_avg_log_loss_1x2, adjusted_avg_log_loss_1x2,
    raw_result_accuracy, adjusted_result_accuracy,
    raw_pred_home_rate, raw_pred_draw_rate, raw_pred_away_rate,
    adjusted_pred_home_rate, adjusted_pred_draw_rate, adjusted_pred_away_rate,
    actual_home_rate, actual_draw_rate, actual_away_rate,
    per_competition_metrics, per_confidence_metrics,
    raw_decision_distribution_json, adjusted_decision_distribution_json,
    decision_rule_config, scenario_class_distribution_json,
    probability_unchanged, draw_capture_rate, home_overcall_reduction, confusion_matrix_json,
    -- new columns
    draw_precision, draw_recall, draw_f1,
    away_precision, away_recall, away_f1,
    expected_calibration_error_draw, reliability_bins_draw,
    probability_transform_config, rejection_flags, simulation_verdict,
    notes
  ) VALUES (
    p_run_id, p_mode, 'completed', v_applied, v_total,
    v_raw_brier/v_total, v_adj_brier/v_total, v_raw_ll/v_total, v_adj_ll/v_total,
    v_raw_correct::numeric/v_total, v_adj_correct::numeric/v_total,
    v_raw_pred_h::numeric/v_total, v_raw_pred_d::numeric/v_total, v_raw_pred_a::numeric/v_total,
    v_adj_pred_h::numeric/v_total, v_adj_pred_d::numeric/v_total, v_adj_pred_a::numeric/v_total,
    v_act_h::numeric/v_total, v_act_d::numeric/v_total, v_act_a::numeric/v_total,
    v_per_comp, '{}'::jsonb,
    jsonb_build_object('H',v_raw_pred_h,'D',v_raw_pred_d,'A',v_raw_pred_a),
    jsonb_build_object('H',v_adj_pred_h,'D',v_adj_pred_d,'A',v_adj_pred_a),
    v_transform_cfg, v_scenario_counts,
    false,
    CASE WHEN v_act_d>0 THEN v_draw_tp::numeric/v_act_d ELSE NULL END,
    v_raw_pred_h::numeric/v_total - v_adj_pred_h::numeric/v_total,
    v_conf,
    round(v_draw_prec,6), round(v_draw_rec,6), round(v_draw_f1,6),
    round(v_away_prec,6), round(v_away_rec,6), round(v_away_f1,6),
    round(v_ece_draw,6), v_bins_out,
    v_transform_cfg, v_rflags, v_verdict,
    NULLIF(trim(v_notes),'')
  )
  ON CONFLICT (source_backtest_run_id, simulation_key) DO UPDATE SET
    applied_adjustments=EXCLUDED.applied_adjustments, sample_size=EXCLUDED.sample_size,
    raw_avg_brier_1x2=EXCLUDED.raw_avg_brier_1x2, adjusted_avg_brier_1x2=EXCLUDED.adjusted_avg_brier_1x2,
    raw_avg_log_loss_1x2=EXCLUDED.raw_avg_log_loss_1x2, adjusted_avg_log_loss_1x2=EXCLUDED.adjusted_avg_log_loss_1x2,
    raw_result_accuracy=EXCLUDED.raw_result_accuracy, adjusted_result_accuracy=EXCLUDED.adjusted_result_accuracy,
    raw_pred_home_rate=EXCLUDED.raw_pred_home_rate, raw_pred_draw_rate=EXCLUDED.raw_pred_draw_rate, raw_pred_away_rate=EXCLUDED.raw_pred_away_rate,
    adjusted_pred_home_rate=EXCLUDED.adjusted_pred_home_rate, adjusted_pred_draw_rate=EXCLUDED.adjusted_pred_draw_rate, adjusted_pred_away_rate=EXCLUDED.adjusted_pred_away_rate,
    actual_home_rate=EXCLUDED.actual_home_rate, actual_draw_rate=EXCLUDED.actual_draw_rate, actual_away_rate=EXCLUDED.actual_away_rate,
    per_competition_metrics=EXCLUDED.per_competition_metrics,
    raw_decision_distribution_json=EXCLUDED.raw_decision_distribution_json,
    adjusted_decision_distribution_json=EXCLUDED.adjusted_decision_distribution_json,
    decision_rule_config=EXCLUDED.decision_rule_config,
    scenario_class_distribution_json=EXCLUDED.scenario_class_distribution_json,
    draw_capture_rate=EXCLUDED.draw_capture_rate, home_overcall_reduction=EXCLUDED.home_overcall_reduction,
    confusion_matrix_json=EXCLUDED.confusion_matrix_json,
    draw_precision=EXCLUDED.draw_precision, draw_recall=EXCLUDED.draw_recall, draw_f1=EXCLUDED.draw_f1,
    away_precision=EXCLUDED.away_precision, away_recall=EXCLUDED.away_recall, away_f1=EXCLUDED.away_f1,
    expected_calibration_error_draw=EXCLUDED.expected_calibration_error_draw,
    reliability_bins_draw=EXCLUDED.reliability_bins_draw,
    probability_transform_config=EXCLUDED.probability_transform_config,
    rejection_flags=EXCLUDED.rejection_flags, simulation_verdict=EXCLUDED.simulation_verdict,
    notes=EXCLUDED.notes, created_at=now()
  RETURNING id INTO v_sim_id;

  RETURN jsonb_build_object(
    'simulation_id', v_sim_id, 'simulation_key', p_mode, 'sample_size', v_total,
    'verdict', v_verdict,
    'raw_accuracy', round(v_raw_correct::numeric/v_total,6),
    'adj_accuracy', round(v_adj_correct::numeric/v_total,6),
    'raw_avg_brier', round(v_raw_brier/v_total,8),
    'adj_avg_brier', round(v_adj_brier/v_total,8),
    'raw_avg_log_loss', round(v_raw_ll/v_total,8),
    'adj_avg_log_loss', round(v_adj_ll/v_total,8),
    'adj_pred_h', round(v_adj_pred_h::numeric/v_total,6),
    'adj_pred_d', round(v_adj_pred_d::numeric/v_total,6),
    'adj_pred_a', round(v_adj_pred_a::numeric/v_total,6),
    'draw_precision', round(v_draw_prec,6), 'draw_recall', round(v_draw_rec,6), 'draw_f1', round(v_draw_f1,6),
    'away_f1', round(v_away_f1,6),
    'draw_capture_rate', CASE WHEN v_act_d>0 THEN round(v_draw_tp::numeric/v_act_d,6) ELSE NULL END,
    'home_overcall_reduction', round(v_raw_pred_h::numeric/v_total - v_adj_pred_h::numeric/v_total,6),
    'ece_draw', round(v_ece_draw,6),
    'rejection_flags', v_rflags,
    'notes', COALESCE(trim(v_notes),'')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_run_draw_floor_simulation(uuid,text) TO authenticated;
