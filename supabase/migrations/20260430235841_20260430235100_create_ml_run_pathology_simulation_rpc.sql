/*
  # Create ml_run_pathology_simulation RPC

  ## Summary
  New RPC function public.ml_run_pathology_simulation(p_run_id uuid, p_mode text)
  runs one of 13 robust bias simulation modes targeting the Ligue 1 draw overcall
  and Bundesliga accuracy-drop pathologies identified in the T=1.6 candidate rerun.

  ## Supported Modes (13)
  1.  temp160_compbias_cap_005
  2.  temp160_compbias_cap_008
  3.  temp160_compbias_cap_010
  4.  temp160_compbias_sigmoid_cap_008
  5.  temp160_compbias_sigmoid_cap_010
  6.  temp160_compbias_multiplier_prior
  7.  temp160_compbias_multiplier_prior_cap015
  8.  temp160_compbias_entropy_scaled_additive
  9.  temp160_compbias_entropy_scaled_sigmoid
  10. temp160_compbias_no_ligue1_draw_bias
  11. temp160_compbias_no_bundesliga_bias
  12. temp160_compbias_cap008_no_ligue1_draw_bias
  13. temp160_compbias_multiplier_no_ligue1_draw_bias

  ## Rejection Thresholds (updated for pathology sims)
  - Brier worse than raw baseline (0.21187602)
  - Calibration slope outside [0.8, 1.2]
  - Accuracy drop > 2pp vs source (46.22%)
  - Away rate < 8%
  - Draw precision < 25%
  - Ligue 1 pred draw pct > 40%  (new pathology gate)
  - Bundesliga acc delta < -2pp   (new pathology gate)
  Risky: argmax changed rate > 45%

  ## Security
  Calls _ml_assert_admin() — admin only. Upserts on (source_backtest_run_id, simulation_key).
*/

CREATE OR REPLACE FUNCTION public.ml_run_pathology_simulation(
  p_run_id  uuid,
  p_mode    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_total        int     := 0;
  v_correct      int     := 0;
  v_pred_h       int     := 0;
  v_pred_d       int     := 0;
  v_pred_a       int     := 0;
  v_tp_draw      int     := 0;
  v_fp_draw      int     := 0;
  v_fn_draw      int     := 0;
  v_brier_sum    numeric := 0;
  v_ll_sum       numeric := 0;
  v_l1_n         int     := 0;
  v_l1_correct   int     := 0;
  v_l1_pred_d    int     := 0;
  v_l1_changed   int     := 0;
  v_l1_helped    int     := 0;
  v_l1_harmed    int     := 0;
  v_bl_n         int     := 0;
  v_bl_correct   int     := 0;
  v_bl_pred_d    int     := 0;
  v_bl_changed   int     := 0;
  v_bl_helped    int     := 0;
  v_bl_harmed    int     := 0;
  v_changed      int     := 0;
  v_changed_to_d int     := 0;
  v_helped       int     := 0;
  v_harmed       int     := 0;
  v_dec_n        int     := 0;
  v_dec_correct  int     := 0;
  v_dec_brier    numeric := 0;
  v_con_n        int     := 0;
  v_con_correct  int     := 0;
  v_con_brier    numeric := 0;
  v_clo_n        int     := 0;
  v_clo_correct  int     := 0;
  v_clo_brier    numeric := 0;
  v_bin_pred_sum numeric[6] := ARRAY[0,0,0,0,0,0];
  v_bin_act_sum  numeric[6] := ARRAY[0,0,0,0,0,0];
  v_bin_count    int[6]     := ARRAY[0,0,0,0,0,0];
  v_sim_id       uuid;
  v_reject_flags text[]  := ARRAY[]::text[];
  v_risky_flags  text[]  := ARRAY[]::text[];
  v_result       jsonb;
  -- Baselines (hardcoded from source run 82ee81a3)
  c_raw_brier constant numeric := 0.21187602;
  c_cb_brier  constant numeric := 0.20738331;
  c_src_acc   constant numeric := 46.22;
  c_bl_src_acc constant numeric := 48.08;
BEGIN
  PERFORM _ml_assert_admin();

  IF p_mode NOT IN (
    'temp160_compbias_cap_005',
    'temp160_compbias_cap_008',
    'temp160_compbias_cap_010',
    'temp160_compbias_sigmoid_cap_008',
    'temp160_compbias_sigmoid_cap_010',
    'temp160_compbias_multiplier_prior',
    'temp160_compbias_multiplier_prior_cap015',
    'temp160_compbias_entropy_scaled_additive',
    'temp160_compbias_entropy_scaled_sigmoid',
    'temp160_compbias_no_ligue1_draw_bias',
    'temp160_compbias_no_bundesliga_bias',
    'temp160_compbias_cap008_no_ligue1_draw_bias',
    'temp160_compbias_multiplier_no_ligue1_draw_bias'
  ) THEN
    RETURN jsonb_build_object('error', 'unknown_mode', 'mode', p_mode);
  END IF;

  -- ─── Per-match loop ───────────────────────────────────────────────────
  DECLARE
    r            RECORD;
    rph          numeric;
    rpd          numeric;
    rpa          numeric;
    tph          numeric;
    tpd          numeric;
    tpa          numeric;
    tsum         numeric;
    dh           numeric;
    dd           numeric;
    da           numeric;
    tdh          numeric;
    tdd          numeric;
    tda          numeric;
    fph          numeric;
    fpd          numeric;
    fpa          numeric;
    fsum         numeric;
    margin       numeric;
    bias_scale   numeric;
    final_pred   text;
    is_correct   boolean;
    yh           numeric;
    yd           numeric;
    ya           numeric;
    brier_val    numeric;
    ll_val       numeric;
    bin_idx      int;
    use_mult     boolean;
    s1 numeric; s2 numeric; s3 numeric; stmp numeric;
  BEGIN
    FOR r IN
      SELECT
        p.p_home, p.p_draw, p.p_away,
        p.predicted_result AS src_pred,
        p.competition_name,
        e.actual_result,
        e.is_result_correct AS src_correct
      FROM model_lab.match_model_predictions p
      JOIN model_lab.match_model_evaluations e ON e.prediction_id = p.id
      WHERE p.backtest_run_id = p_run_id
    LOOP
      rph := GREATEST(r.p_home::numeric, 0.001);
      rpd := GREATEST(r.p_draw::numeric, 0.001);
      rpa := GREATEST(r.p_away::numeric, 0.001);

      -- T=1.6 stable power form
      tph := power(rph, 1.0/1.6);
      tpd := power(rpd, 1.0/1.6);
      tpa := power(rpa, 1.0/1.6);
      tsum := tph + tpd + tpa;
      tph := tph / tsum; tpd := tpd / tsum; tpa := tpa / tsum;

      -- Load competition bias deltas
      dh := 0; dd := 0; da := 0;
      SELECT
        COALESCE(MAX(adjustment_value) FILTER (WHERE adjustment_type='home_bias_correction'), 0),
        COALESCE(MAX(adjustment_value) FILTER (WHERE adjustment_type='draw_bias_correction'), 0),
        COALESCE(MAX(adjustment_value) FILTER (WHERE adjustment_type='away_bias_correction'), 0)
      INTO dh, dd, da
      FROM model_lab.calibration_adjustments
      WHERE source_backtest_run_id = p_run_id
        AND group_type = 'competition'
        AND group_key = r.competition_name
        AND is_active = false;

      -- Ablations
      IF p_mode IN ('temp160_compbias_no_ligue1_draw_bias',
                    'temp160_compbias_cap008_no_ligue1_draw_bias',
                    'temp160_compbias_multiplier_no_ligue1_draw_bias')
         AND r.competition_name = 'Ligue 1' THEN
        dd := 0;
      END IF;
      IF p_mode = 'temp160_compbias_no_bundesliga_bias'
         AND r.competition_name = 'Bundesliga' THEN
        dh := 0; dd := 0; da := 0;
      END IF;

      -- Margin (top - second, from post-T probs)
      s1 := tph; s2 := tpd; s3 := tpa;
      IF s1 < s2 THEN stmp := s1; s1 := s2; s2 := stmp; END IF;
      IF s1 < s3 THEN stmp := s1; s1 := s3; s3 := stmp; END IF;
      IF s2 < s3 THEN stmp := s2; s2 := s3; s3 := stmp; END IF;
      margin := s1 - s2;

      use_mult := false;

      IF p_mode = 'temp160_compbias_cap_005' THEN
        tdh := GREATEST(-0.05, LEAST(0.05, dh));
        tdd := GREATEST(-0.05, LEAST(0.05, dd));
        tda := GREATEST(-0.05, LEAST(0.05, da));

      ELSIF p_mode IN ('temp160_compbias_cap_008',
                       'temp160_compbias_cap008_no_ligue1_draw_bias') THEN
        tdh := GREATEST(-0.08, LEAST(0.08, dh));
        tdd := GREATEST(-0.08, LEAST(0.08, dd));
        tda := GREATEST(-0.08, LEAST(0.08, da));

      ELSIF p_mode = 'temp160_compbias_cap_010' THEN
        tdh := GREATEST(-0.10, LEAST(0.10, dh));
        tdd := GREATEST(-0.10, LEAST(0.10, dd));
        tda := GREATEST(-0.10, LEAST(0.10, da));

      ELSIF p_mode = 'temp160_compbias_sigmoid_cap_008' THEN
        tdh := 0.08 * tanh(dh / 0.08);
        tdd := 0.08 * tanh(dd / 0.08);
        tda := 0.08 * tanh(da / 0.08);

      ELSIF p_mode = 'temp160_compbias_sigmoid_cap_010' THEN
        tdh := 0.10 * tanh(dh / 0.10);
        tdd := 0.10 * tanh(dd / 0.10);
        tda := 0.10 * tanh(da / 0.10);

      ELSIF p_mode IN ('temp160_compbias_multiplier_prior',
                       'temp160_compbias_multiplier_no_ligue1_draw_bias') THEN
        dh  := GREATEST(-0.25, LEAST(0.25, dh));
        dd  := GREATEST(-0.25, LEAST(0.25, dd));
        da  := GREATEST(-0.25, LEAST(0.25, da));
        use_mult := true;
        tdh := 0; tdd := 0; tda := 0; -- not used in mult path

      ELSIF p_mode = 'temp160_compbias_multiplier_prior_cap015' THEN
        dh  := GREATEST(-0.15, LEAST(0.15, dh));
        dd  := GREATEST(-0.15, LEAST(0.15, dd));
        da  := GREATEST(-0.15, LEAST(0.15, da));
        use_mult := true;
        tdh := 0; tdd := 0; tda := 0;

      ELSIF p_mode = 'temp160_compbias_entropy_scaled_additive' THEN
        bias_scale := LEAST(1.0, GREATEST(0.25, margin / 0.25));
        tdh := dh * bias_scale;
        tdd := dd * bias_scale;
        tda := da * bias_scale;

      ELSIF p_mode = 'temp160_compbias_entropy_scaled_sigmoid' THEN
        bias_scale := LEAST(1.0, GREATEST(0.25, margin / 0.25));
        tdh := 0.08 * tanh(dh / 0.08) * bias_scale;
        tdd := 0.08 * tanh(dd / 0.08) * bias_scale;
        tda := 0.08 * tanh(da / 0.08) * bias_scale;

      ELSE
        -- Ablation modes — straight additive (ablated values already set)
        tdh := dh; tdd := dd; tda := da;
      END IF;

      IF use_mult THEN
        fph := GREATEST(0.001, tph * (1.0 + dh));
        fpd := GREATEST(0.001, tpd * (1.0 + dd));
        fpa := GREATEST(0.001, tpa * (1.0 + da));
      ELSE
        fph := GREATEST(0.001, tph + tdh);
        fpd := GREATEST(0.001, tpd + tdd);
        fpa := GREATEST(0.001, tpa + tda);
      END IF;
      fsum := fph + fpd + fpa;
      fph := fph / fsum; fpd := fpd / fsum; fpa := fpa / fsum;

      IF fph >= fpd AND fph >= fpa THEN final_pred := 'H';
      ELSIF fpd >= fph AND fpd >= fpa THEN final_pred := 'D';
      ELSE final_pred := 'A';
      END IF;
      is_correct := (final_pred = r.actual_result);

      -- Accumulators
      v_total := v_total + 1;
      IF is_correct THEN v_correct := v_correct + 1; END IF;
      IF final_pred = 'H' THEN v_pred_h := v_pred_h + 1;
      ELSIF final_pred = 'D' THEN v_pred_d := v_pred_d + 1;
      ELSE v_pred_a := v_pred_a + 1; END IF;

      IF final_pred = 'D' THEN
        IF r.actual_result = 'D' THEN v_tp_draw := v_tp_draw + 1;
        ELSE v_fp_draw := v_fp_draw + 1; END IF;
      END IF;
      IF r.actual_result = 'D' AND final_pred <> 'D' THEN v_fn_draw := v_fn_draw + 1; END IF;

      yh := CASE WHEN r.actual_result='H' THEN 1.0 ELSE 0.0 END;
      yd := CASE WHEN r.actual_result='D' THEN 1.0 ELSE 0.0 END;
      ya := CASE WHEN r.actual_result='A' THEN 1.0 ELSE 0.0 END;
      brier_val := ((fph-yh)^2 + (fpd-yd)^2 + (fpa-ya)^2) / 3.0;
      ll_val := -(yh*ln(GREATEST(fph,0.0001)) + yd*ln(GREATEST(fpd,0.0001)) + ya*ln(GREATEST(fpa,0.0001)));
      v_brier_sum := v_brier_sum + brier_val;
      v_ll_sum    := v_ll_sum    + ll_val;

      -- Argmax stability vs source
      IF final_pred <> r.src_pred THEN
        v_changed := v_changed + 1;
        IF final_pred = 'D' THEN v_changed_to_d := v_changed_to_d + 1; END IF;
        IF is_correct AND NOT r.src_correct THEN v_helped := v_helped + 1; END IF;
        IF NOT is_correct AND r.src_correct THEN v_harmed := v_harmed + 1; END IF;
      END IF;

      IF r.competition_name = 'Ligue 1' THEN
        v_l1_n := v_l1_n + 1;
        IF is_correct THEN v_l1_correct := v_l1_correct + 1; END IF;
        IF final_pred = 'D' THEN v_l1_pred_d := v_l1_pred_d + 1; END IF;
        IF final_pred <> r.src_pred THEN
          v_l1_changed := v_l1_changed + 1;
          IF is_correct AND NOT r.src_correct THEN v_l1_helped := v_l1_helped + 1; END IF;
          IF NOT is_correct AND r.src_correct THEN v_l1_harmed := v_l1_harmed + 1; END IF;
        END IF;
      END IF;

      IF r.competition_name = 'Bundesliga' THEN
        v_bl_n := v_bl_n + 1;
        IF is_correct THEN v_bl_correct := v_bl_correct + 1; END IF;
        IF final_pred = 'D' THEN v_bl_pred_d := v_bl_pred_d + 1; END IF;
        IF final_pred <> r.src_pred THEN
          v_bl_changed := v_bl_changed + 1;
          IF is_correct AND NOT r.src_correct THEN v_bl_helped := v_bl_helped + 1; END IF;
          IF NOT is_correct AND r.src_correct THEN v_bl_harmed := v_bl_harmed + 1; END IF;
        END IF;
      END IF;

      IF margin > 0.20 THEN
        v_dec_n := v_dec_n + 1;
        IF is_correct THEN v_dec_correct := v_dec_correct + 1; END IF;
        v_dec_brier := v_dec_brier + brier_val;
      ELSIF margin >= 0.10 THEN
        v_con_n := v_con_n + 1;
        IF is_correct THEN v_con_correct := v_con_correct + 1; END IF;
        v_con_brier := v_con_brier + brier_val;
      ELSE
        v_clo_n := v_clo_n + 1;
        IF is_correct THEN v_clo_correct := v_clo_correct + 1; END IF;
        v_clo_brier := v_clo_brier + brier_val;
      END IF;

      bin_idx := CASE
        WHEN fpd < 0.10 THEN 1 WHEN fpd < 0.20 THEN 2 WHEN fpd < 0.30 THEN 3
        WHEN fpd < 0.40 THEN 4 WHEN fpd < 0.50 THEN 5 ELSE 6 END;
      v_bin_pred_sum[bin_idx] := v_bin_pred_sum[bin_idx] + fpd;
      v_bin_act_sum[bin_idx]  := v_bin_act_sum[bin_idx]  + yd;
      v_bin_count[bin_idx]    := v_bin_count[bin_idx]    + 1;

    END LOOP;
  END;

  -- ─── Derived metrics + upsert ────────────────────────────────────────
  DECLARE
    v_brier      numeric;
    v_ll         numeric;
    v_acc        numeric;
    v_draw_prec  numeric;
    v_draw_rec   numeric;
    v_draw_f1    numeric;
    v_skill_raw  numeric;
    v_skill_cb   numeric;
    v_l1_pct     numeric;
    v_bl_acc     numeric;
    v_bl_delta   numeric;
    n_bins       int     := 0;
    sx           numeric := 0;
    sy           numeric := 0;
    sxy          numeric := 0;
    sxx          numeric := 0;
    xmean        numeric;
    ymean        numeric;
    slope        numeric := NULL;
    bxi          numeric;
    byi          numeric;
    i            int;
    verdict_text text;
    p_notes      jsonb;
  BEGIN
    v_brier := v_brier_sum / NULLIF(v_total, 0);
    v_ll    := v_ll_sum    / NULLIF(v_total, 0);
    v_acc   := 100.0 * v_correct / NULLIF(v_total, 0);
    v_draw_prec := 100.0 * v_tp_draw / NULLIF(v_tp_draw + v_fp_draw, 0);
    v_draw_rec  := 100.0 * v_tp_draw / NULLIF(v_tp_draw + v_fn_draw, 0);
    v_draw_f1   := CASE WHEN (v_draw_prec + v_draw_rec) > 0
                        THEN 2.0 * v_draw_prec * v_draw_rec / (v_draw_prec + v_draw_rec)
                        ELSE 0 END;
    v_skill_raw := CASE WHEN c_raw_brier > 0 THEN (c_raw_brier - v_brier) / c_raw_brier ELSE 0 END;
    v_skill_cb  := CASE WHEN c_cb_brier  > 0 THEN (c_cb_brier  - v_brier) / c_cb_brier  ELSE 0 END;
    v_l1_pct    := 100.0 * v_l1_pred_d / NULLIF(v_l1_n, 0);
    v_bl_acc    := 100.0 * v_bl_correct / NULLIF(v_bl_n, 0);
    v_bl_delta  := v_bl_acc - c_bl_src_acc;

    -- OLS draw calibration slope
    FOR i IN 1..6 LOOP
      IF v_bin_count[i] > 0 THEN
        n_bins := n_bins + 1;
        bxi := v_bin_pred_sum[i] / v_bin_count[i];
        byi := v_bin_act_sum[i]  / v_bin_count[i];
        sx  := sx  + bxi;
        sy  := sy  + byi;
        sxy := sxy + bxi * byi;
        sxx := sxx + bxi * bxi;
      END IF;
    END LOOP;
    IF n_bins >= 2 THEN
      xmean := sx / n_bins; ymean := sy / n_bins;
      IF (sxx - n_bins * xmean * xmean) <> 0 THEN
        slope := (sxy - n_bins * xmean * ymean) / (sxx - n_bins * xmean * xmean);
      END IF;
    END IF;

    -- Verdict
    IF v_brier > c_raw_brier THEN
      v_reject_flags := v_reject_flags || 'brier_worse_than_raw';
    END IF;
    IF slope IS NOT NULL AND (slope < 0.8 OR slope > 1.2) THEN
      v_reject_flags := v_reject_flags || 'cal_slope_out_of_range';
    END IF;
    IF v_acc < (c_src_acc - 2.0) THEN
      v_reject_flags := v_reject_flags || 'accuracy_drop_over_2pp';
    END IF;
    IF (100.0 * v_pred_a / NULLIF(v_total,0)) < 8.0 THEN
      v_reject_flags := v_reject_flags || 'away_rate_below_8pct';
    END IF;
    IF v_draw_prec < 25.0 THEN
      v_reject_flags := v_reject_flags || 'draw_precision_below_25pct';
    END IF;
    IF v_l1_pct > 40.0 THEN
      v_reject_flags := v_reject_flags || 'ligue1_pred_draw_over_40pct';
    END IF;
    IF v_bl_delta < -2.0 THEN
      v_reject_flags := v_reject_flags || 'bundesliga_acc_drop_over_2pp';
    END IF;
    IF (100.0 * v_changed / NULLIF(v_total,0)) > 45.0 THEN
      v_risky_flags := v_risky_flags || 'argmax_changed_rate_over_45pct';
    END IF;

    IF array_length(v_reject_flags, 1) > 0 THEN
      verdict_text := 'REJECT';
    ELSIF array_length(v_risky_flags, 1) > 0 THEN
      verdict_text := 'RISKY';
    ELSIF v_brier < c_cb_brier AND v_draw_f1 > 15.0
          AND v_l1_pct <= 40.0 AND v_bl_delta >= -2.0 THEN
      verdict_text := 'PROMISING';
    ELSE
      verdict_text := 'NEUTRAL';
    END IF;

    p_notes := jsonb_build_object(
      'ligue1_pred_draw_pct', ROUND(v_l1_pct::numeric, 2),
      'ligue1_n',             v_l1_n,
      'ligue1_changed',       v_l1_changed,
      'ligue1_helped',        v_l1_helped,
      'ligue1_harmed',        v_l1_harmed,
      'bundesliga_acc',       ROUND(v_bl_acc::numeric, 2),
      'bundesliga_acc_delta', ROUND(v_bl_delta::numeric, 2),
      'bundesliga_n',         v_bl_n,
      'bundesliga_changed',   v_bl_changed,
      'bundesliga_helped',    v_bl_helped,
      'bundesliga_harmed',    v_bl_harmed,
      'reject_flags',         to_jsonb(v_reject_flags),
      'risky_flags',          to_jsonb(v_risky_flags)
    );

    INSERT INTO model_lab.calibration_adjustment_simulations (
      source_backtest_run_id, simulation_key, verdict, notes,
      brier_adjusted, log_loss_adjusted, accuracy_adjusted,
      predicted_home_rate, predicted_draw_rate, predicted_away_rate,
      draw_precision, draw_recall, draw_f1,
      brier_skill_vs_raw, brier_skill_vs_compbias, calibration_slope_draw,
      pathology_focus, bias_transform_config, pathology_notes,
      argmax_stability_json, margin_bucket_metrics, reliability_bins
    )
    VALUES (
      p_run_id, p_mode, verdict_text, 'Pathology simulation: ' || p_mode,
      ROUND(v_brier::numeric, 8), ROUND(v_ll::numeric, 8), ROUND(v_acc::numeric, 4),
      ROUND((100.0*v_pred_h/NULLIF(v_total,0))::numeric, 2),
      ROUND((100.0*v_pred_d/NULLIF(v_total,0))::numeric, 2),
      ROUND((100.0*v_pred_a/NULLIF(v_total,0))::numeric, 2),
      ROUND(v_draw_prec::numeric, 2),
      ROUND(v_draw_rec::numeric, 2),
      ROUND(v_draw_f1::numeric, 2),
      ROUND(v_skill_raw::numeric, 8),
      ROUND(v_skill_cb::numeric, 8),
      ROUND(slope::numeric, 6),
      CASE
        WHEN p_mode LIKE '%no_ligue1%' THEN 'ligue1_draw_overcall'
        WHEN p_mode LIKE '%no_bundesliga%' THEN 'bundesliga_accuracy_drop'
        ELSE 'global_bias_robustness'
      END,
      jsonb_build_object('mode', p_mode, 'temperature', 1.6, 'bias_type',
        CASE
          WHEN p_mode LIKE '%multiplier%'     THEN 'multiplicative'
          WHEN p_mode LIKE '%sigmoid%'        THEN 'sigmoid_tanh'
          WHEN p_mode LIKE '%entropy_scaled%' THEN 'entropy_scaled'
          WHEN p_mode LIKE '%cap_005%'        THEN 'additive_cap_005'
          WHEN p_mode LIKE '%cap_008%'        THEN 'additive_cap_008'
          WHEN p_mode LIKE '%cap_010%'        THEN 'additive_cap_010'
          ELSE 'additive_ablation'
        END),
      p_notes,
      jsonb_build_object('global', jsonb_build_object(
        'total', v_total,
        'changed', v_changed,
        'changed_rate', ROUND((100.0*v_changed/NULLIF(v_total,0))::numeric, 2),
        'changed_to_draw', v_changed_to_d,
        'helped', v_helped,
        'harmed', v_harmed
      )),
      jsonb_build_object(
        'decisive',  jsonb_build_object('n',v_dec_n, 'acc',ROUND((100.0*v_dec_correct/NULLIF(v_dec_n,0))::numeric,2), 'avg_brier',ROUND((v_dec_brier/NULLIF(v_dec_n,0))::numeric,6)),
        'contested', jsonb_build_object('n',v_con_n, 'acc',ROUND((100.0*v_con_correct/NULLIF(v_con_n,0))::numeric,2), 'avg_brier',ROUND((v_con_brier/NULLIF(v_con_n,0))::numeric,6)),
        'close',     jsonb_build_object('n',v_clo_n, 'acc',ROUND((100.0*v_clo_correct/NULLIF(v_clo_n,0))::numeric,2), 'avg_brier',ROUND((v_clo_brier/NULLIF(v_clo_n,0))::numeric,6))
      ),
      jsonb_build_array(
        jsonb_build_object('bin','0-0.10',   'count',v_bin_count[1],'avg_pred',CASE WHEN v_bin_count[1]>0 THEN ROUND((v_bin_pred_sum[1]/v_bin_count[1])::numeric,4) END,'actual_rate',CASE WHEN v_bin_count[1]>0 THEN ROUND((v_bin_act_sum[1]/v_bin_count[1])::numeric,4) END),
        jsonb_build_object('bin','0.10-0.20','count',v_bin_count[2],'avg_pred',CASE WHEN v_bin_count[2]>0 THEN ROUND((v_bin_pred_sum[2]/v_bin_count[2])::numeric,4) END,'actual_rate',CASE WHEN v_bin_count[2]>0 THEN ROUND((v_bin_act_sum[2]/v_bin_count[2])::numeric,4) END),
        jsonb_build_object('bin','0.20-0.30','count',v_bin_count[3],'avg_pred',CASE WHEN v_bin_count[3]>0 THEN ROUND((v_bin_pred_sum[3]/v_bin_count[3])::numeric,4) END,'actual_rate',CASE WHEN v_bin_count[3]>0 THEN ROUND((v_bin_act_sum[3]/v_bin_count[3])::numeric,4) END),
        jsonb_build_object('bin','0.30-0.40','count',v_bin_count[4],'avg_pred',CASE WHEN v_bin_count[4]>0 THEN ROUND((v_bin_pred_sum[4]/v_bin_count[4])::numeric,4) END,'actual_rate',CASE WHEN v_bin_count[4]>0 THEN ROUND((v_bin_act_sum[4]/v_bin_count[4])::numeric,4) END),
        jsonb_build_object('bin','0.40-0.50','count',v_bin_count[5],'avg_pred',CASE WHEN v_bin_count[5]>0 THEN ROUND((v_bin_pred_sum[5]/v_bin_count[5])::numeric,4) END,'actual_rate',CASE WHEN v_bin_count[5]>0 THEN ROUND((v_bin_act_sum[5]/v_bin_count[5])::numeric,4) END),
        jsonb_build_object('bin','0.50+',    'count',v_bin_count[6],'avg_pred',CASE WHEN v_bin_count[6]>0 THEN ROUND((v_bin_pred_sum[6]/v_bin_count[6])::numeric,4) END,'actual_rate',CASE WHEN v_bin_count[6]>0 THEN ROUND((v_bin_act_sum[6]/v_bin_count[6])::numeric,4) END)
      )
    )
    ON CONFLICT (source_backtest_run_id, simulation_key)
    DO UPDATE SET
      verdict                 = EXCLUDED.verdict,
      notes                   = EXCLUDED.notes,
      brier_adjusted          = EXCLUDED.brier_adjusted,
      log_loss_adjusted       = EXCLUDED.log_loss_adjusted,
      accuracy_adjusted       = EXCLUDED.accuracy_adjusted,
      predicted_home_rate     = EXCLUDED.predicted_home_rate,
      predicted_draw_rate     = EXCLUDED.predicted_draw_rate,
      predicted_away_rate     = EXCLUDED.predicted_away_rate,
      draw_precision          = EXCLUDED.draw_precision,
      draw_recall             = EXCLUDED.draw_recall,
      draw_f1                 = EXCLUDED.draw_f1,
      brier_skill_vs_raw      = EXCLUDED.brier_skill_vs_raw,
      brier_skill_vs_compbias = EXCLUDED.brier_skill_vs_compbias,
      calibration_slope_draw  = EXCLUDED.calibration_slope_draw,
      pathology_focus         = EXCLUDED.pathology_focus,
      bias_transform_config   = EXCLUDED.bias_transform_config,
      pathology_notes         = EXCLUDED.pathology_notes,
      argmax_stability_json   = EXCLUDED.argmax_stability_json,
      margin_bucket_metrics   = EXCLUDED.margin_bucket_metrics,
      reliability_bins        = EXCLUDED.reliability_bins
    RETURNING id INTO v_sim_id;

    v_result := jsonb_build_object(
      'mode',                p_mode,
      'sim_id',              v_sim_id,
      'total',               v_total,
      'verdict',             verdict_text,
      'brier',               ROUND(v_brier::numeric, 8),
      'accuracy',            ROUND(v_acc::numeric, 2),
      'pred_draw_pct',       ROUND((100.0*v_pred_d/NULLIF(v_total,0))::numeric, 2),
      'draw_f1',             ROUND(v_draw_f1::numeric, 2),
      'skill_vs_raw',        ROUND(v_skill_raw::numeric, 6),
      'skill_vs_cb',         ROUND(v_skill_cb::numeric, 6),
      'cal_slope',           slope,
      'ligue1_pred_draw_pct',ROUND(v_l1_pct::numeric, 2),
      'bl_acc_delta',        ROUND(v_bl_delta::numeric, 2),
      'argmax_changed_rate', ROUND((100.0*v_changed/NULLIF(v_total,0))::numeric, 2),
      'reject_flags',        to_jsonb(v_reject_flags),
      'risky_flags',         to_jsonb(v_risky_flags)
    );
  END;

  RETURN v_result;
END;
$$;
