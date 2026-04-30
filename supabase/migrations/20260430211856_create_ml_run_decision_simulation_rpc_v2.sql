/*
  # Create ml_run_decision_simulation RPC + replace ml_get_adjustment_simulations

  ## Changes
  1. Creates ml_run_decision_simulation for 5 decision-layer modes.
  2. Drops and recreates ml_get_adjustment_simulations to expose new decision columns.

  ## Security
  Both SECURITY DEFINER + _ml_assert_admin() guard.
*/

-- ─── Decision simulation runner ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ml_run_decision_simulation(
  p_run_id  uuid,
  p_mode    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_home_map jsonb := '{}'::jsonb;
  v_draw_map jsonb := '{}'::jsonb;
  v_away_map jsonb := '{}'::jsonb;

  v_draw_threshold  numeric;
  v_use_adj_probs   boolean := false;
  v_is_scenario     boolean := false;

  v_total       int := 0;
  v_raw_brier   numeric := 0;
  v_adj_brier   numeric := 0;
  v_raw_ll      numeric := 0;
  v_adj_ll      numeric := 0;
  v_raw_correct int := 0;
  v_adj_correct int := 0;

  v_raw_pred_h int := 0; v_raw_pred_d int := 0; v_raw_pred_a int := 0;
  v_adj_pred_h int := 0; v_adj_pred_d int := 0; v_adj_pred_a int := 0;
  v_act_h int := 0;      v_act_d int := 0;      v_act_a int := 0;

  v_actual_draw_total int := 0;
  v_adj_draw_correct  int := 0;

  v_conf_mat        jsonb := '{}'::jsonb;
  v_scenario_counts jsonb := '{}'::jsonb;
  v_per_comp        jsonb := '{}'::jsonb;

  v_notes    text := '';
  v_sim_id   uuid;
  v_applied  jsonb := '[]'::jsonb;

  rec  RECORD;
  v_ph numeric; v_pd numeric; v_pa numeric;
  v_pah numeric; v_pad numeric; v_paa numeric;
  v_norm numeric;
  v_top_p numeric; v_draw_margin numeric;
  v_raw_pred text; v_adj_pred text; v_actual text; v_comp text; v_sc text;
  v_oh int; v_od int; v_oa int;
  v_adj_b numeric; v_adj_l numeric;
  v_conf_key text; v_cacc jsonb;
  v_dh numeric; v_dd numeric; v_da numeric;
BEGIN
  PERFORM public._ml_assert_admin();

  IF p_mode = 'draw_margin_rule_05' THEN v_draw_threshold := 0.05;
  ELSIF p_mode = 'draw_margin_rule_08' THEN v_draw_threshold := 0.08;
  ELSIF p_mode = 'draw_margin_rule_10' THEN v_draw_threshold := 0.10;
  ELSIF p_mode = 'draw_floor_plus_competition_bias' THEN v_draw_threshold := 0.08; v_use_adj_probs := true;
  ELSIF p_mode = 'scenario_class_v1' THEN v_is_scenario := true;
  ELSE RETURN jsonb_build_object('error','Unknown mode: ' || p_mode);
  END IF;

  IF v_use_adj_probs THEN
    SELECT
      COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='home_bias_correction'), '{}'::jsonb),
      COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='draw_bias_correction'), '{}'::jsonb),
      COALESCE(jsonb_object_agg(group_key, adjustment_value) FILTER (WHERE adjustment_type='away_bias_correction'), '{}'::jsonb)
    INTO v_home_map, v_draw_map, v_away_map
    FROM model_lab.calibration_adjustments
    WHERE source_backtest_run_id = p_run_id AND group_type = 'competition' AND is_active = false;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'group_key', group_key, 'adjustment_type', adjustment_type, 'adjustment_value', adjustment_value
    )), '[]'::jsonb)
    INTO v_applied
    FROM model_lab.calibration_adjustments
    WHERE source_backtest_run_id = p_run_id AND group_type = 'competition' AND is_active = false;
  END IF;

  FOR rec IN
    SELECT p.p_home, p.p_draw, p.p_away, p.predicted_result, p.competition_name,
           e.actual_result, e.brier_1x2 AS raw_brier, e.log_loss_1x2 AS raw_ll, e.is_result_correct AS raw_ok
    FROM model_lab.match_model_predictions p
    JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
    WHERE p.backtest_run_id = p_run_id
  LOOP
    v_total  := v_total + 1;
    v_comp   := rec.competition_name;
    v_actual := rec.actual_result;
    v_ph := rec.p_home; v_pd := rec.p_draw; v_pa := rec.p_away;

    IF v_actual='H' THEN v_act_h := v_act_h+1;
    ELSIF v_actual='D' THEN v_act_d := v_act_d+1; v_actual_draw_total := v_actual_draw_total+1;
    ELSE v_act_a := v_act_a+1; END IF;

    v_raw_brier := v_raw_brier + COALESCE(rec.raw_brier,0);
    v_raw_ll    := v_raw_ll    + COALESCE(rec.raw_ll,0);
    IF rec.raw_ok THEN v_raw_correct := v_raw_correct+1; END IF;
    v_raw_pred := rec.predicted_result;
    IF v_raw_pred='H' THEN v_raw_pred_h := v_raw_pred_h+1;
    ELSIF v_raw_pred='D' THEN v_raw_pred_d := v_raw_pred_d+1;
    ELSE v_raw_pred_a := v_raw_pred_a+1; END IF;

    v_oh := CASE v_actual WHEN 'H' THEN 1 ELSE 0 END;
    v_od := CASE v_actual WHEN 'D' THEN 1 ELSE 0 END;
    v_oa := CASE v_actual WHEN 'A' THEN 1 ELSE 0 END;

    IF v_is_scenario THEN
      v_adj_pred := v_raw_pred;
      -- Determine scenario class
      IF v_ph >= v_pa AND v_ph >= v_pd THEN
        IF v_ph - GREATEST(v_pd,v_pa) >= 0.15 THEN v_sc := 'home_control';
        ELSIF ABS(v_ph-v_pd) <= 0.10 THEN v_sc := 'home_lean_draw_risk';
        ELSE v_sc := 'home_lean'; END IF;
      ELSIF v_pa >= v_ph AND v_pa >= v_pd THEN
        IF v_pa - GREATEST(v_ph,v_pd) >= 0.15 THEN v_sc := 'away_control';
        ELSIF ABS(v_pa-v_pd) <= 0.10 THEN v_sc := 'away_lean_draw_risk';
        ELSE v_sc := 'away_lean'; END IF;
      ELSE v_sc := 'draw_lean'; END IF;
      -- Override with balanced/volatile
      IF (GREATEST(v_ph,v_pd,v_pa) - (v_ph+v_pd+v_pa - GREATEST(v_ph,v_pd,v_pa) - LEAST(v_ph,v_pd,v_pa))) < 0.07 THEN
        v_sc := 'balanced';
      END IF;
      IF v_ph BETWEEN 0.25 AND 0.45 AND v_pd BETWEEN 0.25 AND 0.45 AND v_pa BETWEEN 0.25 AND 0.45 THEN
        v_sc := 'volatile';
      END IF;
      v_scenario_counts := jsonb_set(v_scenario_counts, ARRAY[v_sc],
        to_jsonb(COALESCE((v_scenario_counts->>v_sc)::int,0)+1), true);
      v_adj_b := COALESCE(rec.raw_brier,0);
      v_adj_l := COALESCE(rec.raw_ll,0);

    ELSIF v_use_adj_probs THEN
      v_dh := COALESCE((v_home_map->>v_comp)::numeric,0);
      v_dd := COALESCE((v_draw_map->>v_comp)::numeric,0);
      v_da := COALESCE((v_away_map->>v_comp)::numeric,0);
      v_pah:=GREATEST(0.001,v_ph+v_dh); v_pad:=GREATEST(0.001,v_pd+v_dd); v_paa:=GREATEST(0.001,v_pa+v_da);
      v_norm:=v_pah+v_pad+v_paa; v_pah:=v_pah/v_norm; v_pad:=v_pad/v_norm; v_paa:=v_paa/v_norm;
      IF v_pah>=v_pad AND v_pah>=v_paa THEN v_adj_pred:='H';
      ELSIF v_pad>=v_paa THEN v_adj_pred:='D'; ELSE v_adj_pred:='A'; END IF;
      v_top_p := GREATEST(v_pah,v_pad,v_paa);
      IF v_adj_pred IN ('H','A') AND (v_top_p-v_pad) <= v_draw_threshold THEN v_adj_pred:='D'; END IF;
      v_adj_b := ((v_pah-v_oh)^2+(v_pad-v_od)^2+(v_paa-v_oa)^2)/3.0;
      v_adj_l := CASE v_actual WHEN 'H' THEN -ln(GREATEST(1e-7,v_pah)) WHEN 'D' THEN -ln(GREATEST(1e-7,v_pad)) ELSE -ln(GREATEST(1e-7,v_paa)) END;

    ELSE
      IF v_ph>=v_pd AND v_ph>=v_pa THEN v_adj_pred:='H';
      ELSIF v_pd>=v_pa THEN v_adj_pred:='D'; ELSE v_adj_pred:='A'; END IF;
      v_top_p := GREATEST(v_ph,v_pd,v_pa);
      IF v_adj_pred IN ('H','A') AND (v_top_p-v_pd) <= v_draw_threshold THEN v_adj_pred:='D'; END IF;
      v_adj_b := COALESCE(rec.raw_brier,0);
      v_adj_l := COALESCE(rec.raw_ll,0);
    END IF;

    v_adj_brier := v_adj_brier + v_adj_b;
    v_adj_ll    := v_adj_ll    + v_adj_l;
    IF v_adj_pred=v_actual THEN v_adj_correct := v_adj_correct+1; END IF;
    IF v_adj_pred='H' THEN v_adj_pred_h := v_adj_pred_h+1;
    ELSIF v_adj_pred='D' THEN
      v_adj_pred_d := v_adj_pred_d+1;
      IF v_actual='D' THEN v_adj_draw_correct := v_adj_draw_correct+1; END IF;
    ELSE v_adj_pred_a := v_adj_pred_a+1; END IF;

    v_conf_key := v_adj_pred||'_'||v_actual;
    v_conf_mat := jsonb_set(v_conf_mat,ARRAY[v_conf_key],
      to_jsonb(COALESCE((v_conf_mat->>v_conf_key)::int,0)+1),true);

    v_cacc := COALESCE(v_per_comp->v_comp, jsonb_build_object(
      'n',0,'adj_correct',0,'raw_correct',0,
      'adj_pred_h',0,'adj_pred_d',0,'adj_pred_a',0,
      'act_h',0,'act_d',0,'act_a',0,'adj_draw_correct',0,'act_draw',0));
    v_per_comp := jsonb_set(v_per_comp,ARRAY[v_comp],jsonb_build_object(
      'n',           (v_cacc->>'n')::int+1,
      'adj_correct', (v_cacc->>'adj_correct')::int+CASE WHEN v_adj_pred=v_actual THEN 1 ELSE 0 END,
      'raw_correct', (v_cacc->>'raw_correct')::int+CASE WHEN rec.raw_ok THEN 1 ELSE 0 END,
      'adj_pred_h',  (v_cacc->>'adj_pred_h')::int+CASE WHEN v_adj_pred='H' THEN 1 ELSE 0 END,
      'adj_pred_d',  (v_cacc->>'adj_pred_d')::int+CASE WHEN v_adj_pred='D' THEN 1 ELSE 0 END,
      'adj_pred_a',  (v_cacc->>'adj_pred_a')::int+CASE WHEN v_adj_pred='A' THEN 1 ELSE 0 END,
      'act_h',       (v_cacc->>'act_h')::int+CASE WHEN v_actual='H' THEN 1 ELSE 0 END,
      'act_d',       (v_cacc->>'act_d')::int+CASE WHEN v_actual='D' THEN 1 ELSE 0 END,
      'act_a',       (v_cacc->>'act_a')::int+CASE WHEN v_actual='A' THEN 1 ELSE 0 END,
      'adj_draw_correct',(v_cacc->>'adj_draw_correct')::int+CASE WHEN v_adj_pred='D' AND v_actual='D' THEN 1 ELSE 0 END,
      'act_draw',    (v_cacc->>'act_draw')::int+CASE WHEN v_actual='D' THEN 1 ELSE 0 END
    ),true);
  END LOOP;

  IF v_total=0 THEN RETURN jsonb_build_object('error','No predictions found','run_id',p_run_id); END IF;

  IF v_adj_pred_d::numeric/v_total < 0.05 THEN v_notes := v_notes||'RISK: draw-prediction rate still below 5%. '; END IF;
  IF v_adj_pred_h::numeric/v_total > 0.80 THEN v_notes := v_notes||'RISK: home-prediction rate still above 80%. '; END IF;
  IF NOT v_is_scenario AND v_adj_correct < v_raw_correct THEN v_notes := v_notes||'WARNING: accuracy decreased vs raw. '; END IF;
  IF v_actual_draw_total>0 AND (v_adj_draw_correct::numeric/v_actual_draw_total) > 0.15 THEN
    v_notes := v_notes||'GOOD: draw capture rate above 15%. '; END IF;

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
    probability_unchanged, draw_capture_rate, home_overcall_reduction, confusion_matrix_json, notes
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
    jsonb_build_object('mode',p_mode,'draw_threshold',v_draw_threshold,'use_adj_probs',v_use_adj_probs,'is_scenario',v_is_scenario),
    v_scenario_counts,
    NOT v_use_adj_probs AND NOT v_is_scenario,
    CASE WHEN v_actual_draw_total>0 THEN v_adj_draw_correct::numeric/v_actual_draw_total ELSE NULL END,
    v_raw_pred_h::numeric/v_total - v_adj_pred_h::numeric/v_total,
    v_conf_mat, NULLIF(trim(v_notes),'')
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
    probability_unchanged=EXCLUDED.probability_unchanged,
    draw_capture_rate=EXCLUDED.draw_capture_rate, home_overcall_reduction=EXCLUDED.home_overcall_reduction,
    confusion_matrix_json=EXCLUDED.confusion_matrix_json, notes=EXCLUDED.notes, created_at=now()
  RETURNING id INTO v_sim_id;

  RETURN jsonb_build_object(
    'simulation_id',v_sim_id,'simulation_key',p_mode,'sample_size',v_total,
    'raw_accuracy',round(v_raw_correct::numeric/v_total,6),
    'adj_accuracy',round(v_adj_correct::numeric/v_total,6),
    'raw_avg_brier',round(v_raw_brier/v_total,8),
    'adj_avg_brier',round(v_adj_brier/v_total,8),
    'raw_pred_h',round(v_raw_pred_h::numeric/v_total,6),'raw_pred_d',round(v_raw_pred_d::numeric/v_total,6),'raw_pred_a',round(v_raw_pred_a::numeric/v_total,6),
    'adj_pred_h',round(v_adj_pred_h::numeric/v_total,6),'adj_pred_d',round(v_adj_pred_d::numeric/v_total,6),'adj_pred_a',round(v_adj_pred_a::numeric/v_total,6),
    'actual_h',round(v_act_h::numeric/v_total,6),'actual_d',round(v_act_d::numeric/v_total,6),'actual_a',round(v_act_a::numeric/v_total,6),
    'draw_capture_rate',CASE WHEN v_actual_draw_total>0 THEN round(v_adj_draw_correct::numeric/v_actual_draw_total,6) ELSE NULL END,
    'home_overcall_reduction',round(v_raw_pred_h::numeric/v_total-v_adj_pred_h::numeric/v_total,6),
    'probability_unchanged',NOT v_use_adj_probs AND NOT v_is_scenario,
    'scenario_counts',v_scenario_counts,'notes',COALESCE(trim(v_notes),'')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_run_decision_simulation(uuid,text) TO authenticated;


-- ─── Drop and recreate ml_get_adjustment_simulations with new columns ────────
DROP FUNCTION IF EXISTS public.ml_get_adjustment_simulations(uuid);

CREATE FUNCTION public.ml_get_adjustment_simulations(
  p_run_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id                                uuid,
  source_backtest_run_id            uuid,
  simulation_key                    text,
  simulation_status                 text,
  applied_adjustments               jsonb,
  sample_size                       integer,
  raw_avg_brier_1x2                 numeric,
  adjusted_avg_brier_1x2            numeric,
  raw_avg_log_loss_1x2              numeric,
  adjusted_avg_log_loss_1x2         numeric,
  raw_result_accuracy               numeric,
  adjusted_result_accuracy          numeric,
  raw_pred_home_rate                numeric,
  raw_pred_draw_rate                numeric,
  raw_pred_away_rate                numeric,
  adjusted_pred_home_rate           numeric,
  adjusted_pred_draw_rate           numeric,
  adjusted_pred_away_rate           numeric,
  actual_home_rate                  numeric,
  actual_draw_rate                  numeric,
  actual_away_rate                  numeric,
  per_competition_metrics           jsonb,
  per_confidence_metrics            jsonb,
  raw_decision_distribution_json    jsonb,
  adjusted_decision_distribution_json jsonb,
  decision_rule_config              jsonb,
  scenario_class_distribution_json  jsonb,
  probability_unchanged             boolean,
  draw_capture_rate                 numeric,
  home_overcall_reduction           numeric,
  confusion_matrix_json             jsonb,
  notes                             text,
  created_at                        timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
BEGIN
  PERFORM public._ml_assert_admin();
  RETURN QUERY
  SELECT
    s.id, s.source_backtest_run_id, s.simulation_key, s.simulation_status,
    s.applied_adjustments, s.sample_size,
    s.raw_avg_brier_1x2, s.adjusted_avg_brier_1x2,
    s.raw_avg_log_loss_1x2, s.adjusted_avg_log_loss_1x2,
    s.raw_result_accuracy, s.adjusted_result_accuracy,
    s.raw_pred_home_rate, s.raw_pred_draw_rate, s.raw_pred_away_rate,
    s.adjusted_pred_home_rate, s.adjusted_pred_draw_rate, s.adjusted_pred_away_rate,
    s.actual_home_rate, s.actual_draw_rate, s.actual_away_rate,
    s.per_competition_metrics, s.per_confidence_metrics,
    s.raw_decision_distribution_json, s.adjusted_decision_distribution_json,
    s.decision_rule_config, s.scenario_class_distribution_json,
    s.probability_unchanged, s.draw_capture_rate, s.home_overcall_reduction,
    s.confusion_matrix_json, s.notes, s.created_at
  FROM model_lab.calibration_adjustment_simulations s
  WHERE (p_run_id IS NULL OR s.source_backtest_run_id = p_run_id)
  ORDER BY s.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_get_adjustment_simulations(uuid) TO authenticated;
