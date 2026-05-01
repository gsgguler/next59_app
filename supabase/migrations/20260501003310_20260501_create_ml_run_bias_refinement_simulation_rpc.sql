/*
  # Create ml_run_bias_refinement_simulation RPC

  ## Summary
  Creates a new RPC function supporting 17 simulation modes across 5 families,
  targeting the sigmoid slope and Bundesliga pathology issues identified in prior analysis.

  ## Families
  - Family A (6 modes): Sigmoid cap k tuning, T→CB pipeline
  - Family B (3 modes): Dynamic relative clipping, T→CB pipeline
  - Family C (3 modes): Hybrid sigmoid + relative clipping, T→CB pipeline
  - Family D (3 modes): Robust CB→T pipeline order
  - Family E (3 modes): League-specific ablations using best hybrid config

  ## Acceptance Thresholds
  - global_brier < raw_brier + 0.001 (must not degrade)
  - global_accuracy >= raw_accuracy - 0.5pp
  - draw_f1 >= 15.0 (not zero draw prediction)
  - cal_slope_draw in [0.80, 1.20]
  - pred_draw_rate >= 0.05 (at least 5%)
  - ligue1_pred_draw_rate < 0.60 (not pathological)
  - bundesliga_accuracy_delta >= -2.0pp

  ## Notes
  - Uses SECURITY DEFINER with admin guard
  - Idempotent via ON CONFLICT upsert
  - Per-competition breakdown for all 7 leagues
  - Argmax stability computed per mode
*/

CREATE OR REPLACE FUNCTION public.ml_run_bias_refinement_simulation(
  p_run_id  uuid,
  p_mode    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  -- raw run metrics
  v_raw_brier          numeric;
  v_raw_log_loss       numeric;
  v_raw_accuracy       numeric;
  v_raw_pred_home      numeric;
  v_raw_pred_draw      numeric;
  v_raw_pred_away      numeric;
  v_actual_home        numeric;
  v_actual_draw        numeric;
  v_actual_away        numeric;
  v_sample_size        integer;

  -- per-match processing
  rec                  record;

  -- adjusted accumulators
  v_brier_sum          numeric := 0;
  v_log_loss_sum       numeric := 0;
  v_correct            integer := 0;
  v_total              integer := 0;

  v_pred_home_count    integer := 0;
  v_pred_draw_count    integer := 0;
  v_pred_away_count    integer := 0;

  -- per-class classification for F1
  v_tp_draw            integer := 0;
  v_fp_draw            integer := 0;
  v_fn_draw            integer := 0;
  v_tp_away            integer := 0;
  v_fp_away            integer := 0;
  v_fn_away            integer := 0;

  -- argmax stability
  v_argmax_changed     integer := 0;
  v_changed_to_draw    integer := 0;
  v_helped             integer := 0;
  v_harmed             integer := 0;

  -- calibration bins for draw (6 bins: 0-10%, 10-20%, 20-30%, 30-40%, 40-50%, 50%+)
  v_bin_mean_pred      numeric[6] := ARRAY[0,0,0,0,0,0];
  v_bin_mean_actual    numeric[6] := ARRAY[0,0,0,0,0,0];
  v_bin_count          integer[6] := ARRAY[0,0,0,0,0,0];
  v_bin_sum_pred       numeric[6] := ARRAY[0,0,0,0,0,0];
  v_bin_sum_actual     numeric[6] := ARRAY[0,0,0,0,0,0];

  -- per-competition health (7 leagues)
  -- EPL, Bundesliga, SerieA, LaLiga, Ligue1, EreDiv, Championship
  v_comp_correct       integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_total         integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_pred_draw     integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_helped        integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_harmed        integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_raw_correct   integer[] := ARRAY[0,0,0,0,0,0,0];

  -- per-match computed values
  v_ph                 numeric;  -- adjusted p_home
  v_pd                 numeric;  -- adjusted p_draw
  v_pa                 numeric;  -- adjusted p_away
  v_rh                 numeric;  -- raw p_home
  v_rd                 numeric;  -- raw p_draw
  v_ra                 numeric;  -- raw p_away
  v_sum                numeric;
  v_raw_argmax         text;
  v_adj_argmax         text;
  v_actual             text;
  v_brier_i            numeric;
  v_log_loss_i         numeric;
  v_bin_idx            integer;
  v_comp_idx           integer;

  -- bias values per competition
  v_h_bias             numeric;
  v_d_bias             numeric;
  v_a_bias             numeric;
  v_comp_id            text;

  -- mode config
  v_sigmoid_cap        numeric;  -- e.g. 0.08, 0.09, 0.10
  v_sigmoid_k          numeric;  -- e.g. 0.50, 0.75 (multiplier for slope)
  v_relative_cap       numeric;  -- e.g. 0.15, 0.20, 0.25
  v_use_sigmoid        boolean;
  v_use_relative       boolean;
  v_cb_before_temp     boolean;  -- true = CB→T, false = T→CB
  v_ligue1_draw_half   boolean;
  v_bundesliga_away_half boolean;
  v_family             text;
  v_objective          text;

  -- calibration slope
  v_slope_num          numeric := 0;
  v_slope_den          numeric := 0;
  v_calibration_slope  numeric;
  v_ece_draw           numeric := 0;

  -- final metrics
  v_adj_brier          numeric;
  v_adj_log_loss       numeric;
  v_adj_accuracy       numeric;
  v_draw_precision     numeric;
  v_draw_recall        numeric;
  v_draw_f1            numeric;
  v_away_precision     numeric;
  v_away_recall        numeric;
  v_away_f1            numeric;
  v_brier_skill_raw    numeric;

  -- verdict
  v_verdict            text;
  v_reject_flags       text[] := ARRAY[]::text[];

  -- per-competition results
  v_comp_names         text[] := ARRAY['EPL','Bundesliga','SerieA','LaLiga','Ligue1','Eredivisie','Championship'];
  v_comp_api_ids       text[] := ARRAY['39','78','135','140','61','88','40'];

  v_health_json        jsonb;
  v_health_arr         jsonb := '[]'::jsonb;

  v_i                  integer;

BEGIN
  PERFORM _ml_assert_admin();

  -- ── Parse mode into config ──────────────────────────────────────────────
  v_use_sigmoid        := false;
  v_use_relative       := false;
  v_cb_before_temp     := false;
  v_ligue1_draw_half   := false;
  v_bundesliga_away_half := false;
  v_sigmoid_cap        := 0.10;
  v_sigmoid_k          := 1.0;
  v_relative_cap       := 0.20;
  v_family             := 'unknown';
  v_objective          := 'unknown';

  -- Family A: Sigmoid cap k tuning, T→CB
  IF p_mode = 'temp160_sigmoid_cap008_k050' THEN
    v_use_sigmoid := true; v_sigmoid_cap := 0.08; v_sigmoid_k := 0.50;
    v_family := 'sigmoid_tuning'; v_objective := 'Sigmoid cap=0.08 k=0.50: tighter slope prevents draw overcorrection';
  ELSIF p_mode = 'temp160_sigmoid_cap008_k075' THEN
    v_use_sigmoid := true; v_sigmoid_cap := 0.08; v_sigmoid_k := 0.75;
    v_family := 'sigmoid_tuning'; v_objective := 'Sigmoid cap=0.08 k=0.75: moderate slope at lower cap';
  ELSIF p_mode = 'temp160_sigmoid_cap009_k050' THEN
    v_use_sigmoid := true; v_sigmoid_cap := 0.09; v_sigmoid_k := 0.50;
    v_family := 'sigmoid_tuning'; v_objective := 'Sigmoid cap=0.09 k=0.50: intermediate cap with low slope';
  ELSIF p_mode = 'temp160_sigmoid_cap009_k075' THEN
    v_use_sigmoid := true; v_sigmoid_cap := 0.09; v_sigmoid_k := 0.75;
    v_family := 'sigmoid_tuning'; v_objective := 'Sigmoid cap=0.09 k=0.75: intermediate cap moderate slope';
  ELSIF p_mode = 'temp160_sigmoid_cap010_k050' THEN
    v_use_sigmoid := true; v_sigmoid_cap := 0.10; v_sigmoid_k := 0.50;
    v_family := 'sigmoid_tuning'; v_objective := 'Sigmoid cap=0.10 k=0.50: prior best cap with reduced slope';
  ELSIF p_mode = 'temp160_sigmoid_cap010_k075' THEN
    v_use_sigmoid := true; v_sigmoid_cap := 0.10; v_sigmoid_k := 0.75;
    v_family := 'sigmoid_tuning'; v_objective := 'Sigmoid cap=0.10 k=0.75: prior best cap with moderate slope';

  -- Family B: Dynamic relative clipping, T→CB
  ELSIF p_mode = 'temp160_dynamic_relative_cap_15pct' THEN
    v_use_relative := true; v_relative_cap := 0.15;
    v_family := 'dynamic_relative'; v_objective := 'Relative cap ±15% of p_class: strict dynamic ceiling';
  ELSIF p_mode = 'temp160_dynamic_relative_cap_20pct' THEN
    v_use_relative := true; v_relative_cap := 0.20;
    v_family := 'dynamic_relative'; v_objective := 'Relative cap ±20% of p_class: moderate dynamic ceiling';
  ELSIF p_mode = 'temp160_dynamic_relative_cap_25pct' THEN
    v_use_relative := true; v_relative_cap := 0.25;
    v_family := 'dynamic_relative'; v_objective := 'Relative cap ±25% of p_class: permissive dynamic ceiling';

  -- Family C: Hybrid sigmoid + relative
  ELSIF p_mode = 'temp160_sigmoid008_k075_relative20' THEN
    v_use_sigmoid := true; v_use_relative := true; v_sigmoid_cap := 0.08; v_sigmoid_k := 0.75; v_relative_cap := 0.20;
    v_family := 'hybrid'; v_objective := 'Sigmoid cap=0.08 k=0.75 then relative ±20%: two-stage compression';
  ELSIF p_mode = 'temp160_sigmoid009_k075_relative20' THEN
    v_use_sigmoid := true; v_use_relative := true; v_sigmoid_cap := 0.09; v_sigmoid_k := 0.75; v_relative_cap := 0.20;
    v_family := 'hybrid'; v_objective := 'Sigmoid cap=0.09 k=0.75 then relative ±20%: two-stage compression';
  ELSIF p_mode = 'temp160_sigmoid010_k075_relative20' THEN
    v_use_sigmoid := true; v_use_relative := true; v_sigmoid_cap := 0.10; v_sigmoid_k := 0.75; v_relative_cap := 0.20;
    v_family := 'hybrid'; v_objective := 'Sigmoid cap=0.10 k=0.75 then relative ±20%: two-stage compression';

  -- Family D: Robust CB→T pipeline
  ELSIF p_mode = 'robust_cb_sigmoid009_k075_then_temp160' THEN
    v_use_sigmoid := true; v_cb_before_temp := true; v_sigmoid_cap := 0.09; v_sigmoid_k := 0.75;
    v_family := 'cb_then_t'; v_objective := 'CB sigmoid=0.09/k=0.75 first, then T=1.6: bias on raw probs';
  ELSIF p_mode = 'robust_cb_sigmoid010_k075_then_temp160' THEN
    v_use_sigmoid := true; v_cb_before_temp := true; v_sigmoid_cap := 0.10; v_sigmoid_k := 0.75;
    v_family := 'cb_then_t'; v_objective := 'CB sigmoid=0.10/k=0.75 first, then T=1.6: bias on raw probs';
  ELSIF p_mode = 'robust_cb_relative20_then_temp160' THEN
    v_use_relative := true; v_cb_before_temp := true; v_relative_cap := 0.20;
    v_family := 'cb_then_t'; v_objective := 'CB relative ±20% first, then T=1.6: dynamic cap on raw probs';

  -- Family E: League ablations using best hybrid
  ELSIF p_mode = 'temp160_sigmoid010_k075_ligue1_half_draw_bias' THEN
    v_use_sigmoid := true; v_sigmoid_cap := 0.10; v_sigmoid_k := 0.75; v_ligue1_draw_half := true;
    v_family := 'league_ablation'; v_objective := 'Sigmoid=0.10/k=0.75 + Ligue1 draw bias halved: ablate L1 overcall';
  ELSIF p_mode = 'temp160_sigmoid010_k075_bundesliga_half_away_bias' THEN
    v_use_sigmoid := true; v_sigmoid_cap := 0.10; v_sigmoid_k := 0.75; v_bundesliga_away_half := true;
    v_family := 'league_ablation'; v_objective := 'Sigmoid=0.10/k=0.75 + Bundesliga away bias halved: ablate BL harm';
  ELSIF p_mode = 'temp160_sigmoid010_k075_l1_half_draw_bl_half_away' THEN
    v_use_sigmoid := true; v_sigmoid_cap := 0.10; v_sigmoid_k := 0.75;
    v_ligue1_draw_half := true; v_bundesliga_away_half := true;
    v_family := 'league_ablation'; v_objective := 'Sigmoid=0.10/k=0.75 + L1 half draw + BL half away: dual ablation';
  ELSE
    RETURN jsonb_build_object('error', 'unknown_mode', 'mode', p_mode);
  END IF;

  -- ── Load raw metrics from source run ───────────────────────────────────
  SELECT
    s.raw_avg_brier_1x2,
    s.raw_avg_log_loss_1x2,
    s.raw_result_accuracy,
    s.raw_pred_home_rate,
    s.raw_pred_draw_rate,
    s.raw_pred_away_rate,
    s.actual_home_rate,
    s.actual_draw_rate,
    s.actual_away_rate,
    s.sample_size
  INTO
    v_raw_brier, v_raw_log_loss, v_raw_accuracy,
    v_raw_pred_home, v_raw_pred_draw, v_raw_pred_away,
    v_actual_home, v_actual_draw, v_actual_away,
    v_sample_size
  FROM model_lab.calibration_adjustment_simulations s
  WHERE s.source_backtest_run_id = p_run_id
    AND s.simulation_key = 'temp160_compbias_sigmoid_cap_010'
  LIMIT 1;

  IF v_raw_brier IS NULL THEN
    -- fallback: read from compbias_then_temp_scale_160
    SELECT
      s.raw_avg_brier_1x2,
      s.raw_avg_log_loss_1x2,
      s.raw_result_accuracy,
      s.raw_pred_home_rate,
      s.raw_pred_draw_rate,
      s.raw_pred_away_rate,
      s.actual_home_rate,
      s.actual_draw_rate,
      s.actual_away_rate,
      s.sample_size
    INTO
      v_raw_brier, v_raw_log_loss, v_raw_accuracy,
      v_raw_pred_home, v_raw_pred_draw, v_raw_pred_away,
      v_actual_home, v_actual_draw, v_actual_away,
      v_sample_size
    FROM model_lab.calibration_adjustment_simulations s
    WHERE s.source_backtest_run_id = p_run_id
    ORDER BY s.created_at ASC
    LIMIT 1;
  END IF;

  -- ── Per-match simulation loop ──────────────────────────────────────────
  FOR rec IN
    SELECT
      mp.id           AS pred_id,
      mp.match_id,
      mp.prob_home_win AS rh,
      mp.prob_draw     AS rd,
      mp.prob_away_win AS ra,
      mp.predicted_result AS raw_pred,
      m.result         AS actual_result,
      m.competition_id::text AS comp_id
    FROM match_model_predictions mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.backtest_run_id = p_run_id
      AND mp.prob_home_win IS NOT NULL
      AND mp.prob_draw IS NOT NULL
      AND mp.prob_away_win IS NOT NULL
      AND m.result IS NOT NULL
  LOOP
    v_rh := rec.rh;
    v_rd := rec.rd;
    v_ra := rec.ra;
    v_comp_id := rec.comp_id;
    v_actual := rec.actual_result;
    v_raw_argmax := rec.raw_pred;

    -- ── Determine competition bias values ─────────────────────────────
    SELECT
      COALESCE(SUM(CASE WHEN adjustment_type = 'home_bias_correction' THEN adjustment_value ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN adjustment_type = 'draw_bias_correction' THEN adjustment_value ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN adjustment_type = 'away_bias_correction' THEN adjustment_value ELSE 0 END), 0)
    INTO v_h_bias, v_d_bias, v_a_bias
    FROM model_lab.calibration_adjustments
    WHERE group_type = 'competition'
      AND group_value = v_comp_id
      AND is_active = false;

    -- Apply league ablations
    IF v_ligue1_draw_half AND v_comp_id = '61' THEN
      v_d_bias := v_d_bias * 0.5;
    END IF;
    IF v_bundesliga_away_half AND v_comp_id = '78' THEN
      v_a_bias := v_a_bias * 0.5;
    END IF;

    -- ── Apply pipeline ──────────────────────────────────────────────
    IF v_cb_before_temp THEN
      -- CB→T: apply bias to raw probs first, then temperature scale
      -- 1. Compress bias via sigmoid or relative
      IF v_use_sigmoid THEN
        v_h_bias := v_sigmoid_cap * tanh(v_h_bias * v_sigmoid_k / v_sigmoid_cap);
        v_d_bias := v_sigmoid_cap * tanh(v_d_bias * v_sigmoid_k / v_sigmoid_cap);
        v_a_bias := v_sigmoid_cap * tanh(v_a_bias * v_sigmoid_k / v_sigmoid_cap);
      ELSIF v_use_relative THEN
        v_h_bias := GREATEST(-v_relative_cap * v_rh, LEAST(v_relative_cap * v_rh, v_h_bias));
        v_d_bias := GREATEST(-v_relative_cap * v_rd, LEAST(v_relative_cap * v_rd, v_d_bias));
        v_a_bias := GREATEST(-v_relative_cap * v_ra, LEAST(v_relative_cap * v_ra, v_a_bias));
      END IF;
      -- 2. Add bias to raw probs
      v_ph := GREATEST(0.001, v_rh + v_h_bias);
      v_pd := GREATEST(0.001, v_rd + v_d_bias);
      v_pa := GREATEST(0.001, v_ra + v_a_bias);
      -- 3. Normalize
      v_sum := v_ph + v_pd + v_pa;
      v_ph := v_ph / v_sum;
      v_pd := v_pd / v_sum;
      v_pa := v_pa / v_sum;
      -- 4. Temperature scale T=1.6 (stable power form)
      v_ph := power(v_ph, 1.0/1.6);
      v_pd := power(v_pd, 1.0/1.6);
      v_pa := power(v_pa, 1.0/1.6);
      v_sum := v_ph + v_pd + v_pa;
      v_ph := v_ph / v_sum;
      v_pd := v_pd / v_sum;
      v_pa := v_pa / v_sum;
    ELSE
      -- T→CB: temperature scale first, then apply compressed bias
      -- 1. Temperature scale the raw probs
      v_ph := power(GREATEST(v_rh, 0.001), 1.0/1.6);
      v_pd := power(GREATEST(v_rd, 0.001), 1.0/1.6);
      v_pa := power(GREATEST(v_ra, 0.001), 1.0/1.6);
      v_sum := v_ph + v_pd + v_pa;
      v_ph := v_ph / v_sum;
      v_pd := v_pd / v_sum;
      v_pa := v_pa / v_sum;
      -- 2. Compress bias
      IF v_use_sigmoid THEN
        v_h_bias := v_sigmoid_cap * tanh(v_h_bias * v_sigmoid_k / v_sigmoid_cap);
        v_d_bias := v_sigmoid_cap * tanh(v_d_bias * v_sigmoid_k / v_sigmoid_cap);
        v_a_bias := v_sigmoid_cap * tanh(v_a_bias * v_sigmoid_k / v_sigmoid_cap);
      END IF;
      IF v_use_relative THEN
        -- Apply relative cap AFTER any sigmoid (for hybrid: sigmoid then relative)
        v_h_bias := GREATEST(-v_relative_cap * v_ph, LEAST(v_relative_cap * v_ph, v_h_bias));
        v_d_bias := GREATEST(-v_relative_cap * v_pd, LEAST(v_relative_cap * v_pd, v_d_bias));
        v_a_bias := GREATEST(-v_relative_cap * v_pa, LEAST(v_relative_cap * v_pa, v_a_bias));
      END IF;
      -- 3. Add bias to temp-scaled probs
      v_ph := GREATEST(0.001, v_ph + v_h_bias);
      v_pd := GREATEST(0.001, v_pd + v_d_bias);
      v_pa := GREATEST(0.001, v_pa + v_a_bias);
      -- 4. Normalize
      v_sum := v_ph + v_pd + v_pa;
      v_ph := v_ph / v_sum;
      v_pd := v_pd / v_sum;
      v_pa := v_pa / v_sum;
    END IF;

    -- ── Argmax ──────────────────────────────────────────────────────
    IF v_ph >= v_pd AND v_ph >= v_pa THEN
      v_adj_argmax := 'H';
    ELSIF v_pd >= v_ph AND v_pd >= v_pa THEN
      v_adj_argmax := 'D';
    ELSE
      v_adj_argmax := 'A';
    END IF;

    -- ── Accumulators ─────────────────────────────────────────────
    IF v_adj_argmax = 'H' THEN v_pred_home_count := v_pred_home_count + 1;
    ELSIF v_adj_argmax = 'D' THEN v_pred_draw_count := v_pred_draw_count + 1;
    ELSE v_pred_away_count := v_pred_away_count + 1;
    END IF;

    -- Brier
    v_brier_i := 0;
    IF v_actual = 'H' THEN
      v_brier_i := (v_ph - 1)^2 + (v_pd - 0)^2 + (v_pa - 0)^2;
    ELSIF v_actual = 'D' THEN
      v_brier_i := (v_ph - 0)^2 + (v_pd - 1)^2 + (v_pa - 0)^2;
    ELSE
      v_brier_i := (v_ph - 0)^2 + (v_pd - 0)^2 + (v_pa - 1)^2;
    END IF;
    v_brier_sum := v_brier_sum + v_brier_i;

    -- Log loss
    IF v_actual = 'H' THEN
      v_log_loss_i := -ln(GREATEST(v_ph, 1e-9));
    ELSIF v_actual = 'D' THEN
      v_log_loss_i := -ln(GREATEST(v_pd, 1e-9));
    ELSE
      v_log_loss_i := -ln(GREATEST(v_pa, 1e-9));
    END IF;
    v_log_loss_sum := v_log_loss_sum + v_log_loss_i;

    -- Accuracy
    IF v_adj_argmax = v_actual THEN v_correct := v_correct + 1; END IF;
    v_total := v_total + 1;

    -- F1 components (draw)
    IF v_adj_argmax = 'D' AND v_actual = 'D' THEN v_tp_draw := v_tp_draw + 1;
    ELSIF v_adj_argmax = 'D' AND v_actual <> 'D' THEN v_fp_draw := v_fp_draw + 1;
    ELSIF v_adj_argmax <> 'D' AND v_actual = 'D' THEN v_fn_draw := v_fn_draw + 1;
    END IF;

    -- F1 components (away)
    IF v_adj_argmax = 'A' AND v_actual = 'A' THEN v_tp_away := v_tp_away + 1;
    ELSIF v_adj_argmax = 'A' AND v_actual <> 'A' THEN v_fp_away := v_fp_away + 1;
    ELSIF v_adj_argmax <> 'A' AND v_actual = 'A' THEN v_fn_away := v_fn_away + 1;
    END IF;

    -- Argmax stability
    IF v_adj_argmax <> v_raw_argmax THEN
      v_argmax_changed := v_argmax_changed + 1;
      IF v_adj_argmax = 'D' THEN v_changed_to_draw := v_changed_to_draw + 1; END IF;
      IF v_raw_argmax = v_actual AND v_adj_argmax <> v_actual THEN
        v_harmed := v_harmed + 1;
      ELSIF v_raw_argmax <> v_actual AND v_adj_argmax = v_actual THEN
        v_helped := v_helped + 1;
      END IF;
    END IF;

    -- Calibration bins for draw
    IF v_pd < 0.10 THEN v_bin_idx := 1;
    ELSIF v_pd < 0.20 THEN v_bin_idx := 2;
    ELSIF v_pd < 0.30 THEN v_bin_idx := 3;
    ELSIF v_pd < 0.40 THEN v_bin_idx := 4;
    ELSIF v_pd < 0.50 THEN v_bin_idx := 5;
    ELSE v_bin_idx := 6;
    END IF;
    v_bin_count[v_bin_idx]      := v_bin_count[v_bin_idx] + 1;
    v_bin_sum_pred[v_bin_idx]   := v_bin_sum_pred[v_bin_idx] + v_pd;
    v_bin_sum_actual[v_bin_idx] := v_bin_sum_actual[v_bin_idx] + CASE WHEN v_actual = 'D' THEN 1.0 ELSE 0.0 END;

    -- Per-competition health
    v_comp_idx := NULL;
    IF v_comp_id = '39'  THEN v_comp_idx := 1;
    ELSIF v_comp_id = '78'  THEN v_comp_idx := 2;
    ELSIF v_comp_id = '135' THEN v_comp_idx := 3;
    ELSIF v_comp_id = '140' THEN v_comp_idx := 4;
    ELSIF v_comp_id = '61'  THEN v_comp_idx := 5;
    ELSIF v_comp_id = '88'  THEN v_comp_idx := 6;
    ELSIF v_comp_id = '40'  THEN v_comp_idx := 7;
    END IF;

    IF v_comp_idx IS NOT NULL THEN
      v_comp_total[v_comp_idx] := v_comp_total[v_comp_idx] + 1;
      IF v_adj_argmax = 'D' THEN v_comp_pred_draw[v_comp_idx] := v_comp_pred_draw[v_comp_idx] + 1; END IF;
      IF v_adj_argmax = v_actual THEN v_comp_correct[v_comp_idx] := v_comp_correct[v_comp_idx] + 1; END IF;
      IF v_raw_argmax = v_actual AND v_adj_argmax <> v_actual THEN v_comp_harmed[v_comp_idx] := v_comp_harmed[v_comp_idx] + 1; END IF;
      IF v_raw_argmax <> v_actual AND v_adj_argmax = v_actual THEN v_comp_helped[v_comp_idx] := v_comp_helped[v_comp_idx] + 1; END IF;
      IF v_raw_argmax = v_actual THEN v_comp_raw_correct[v_comp_idx] := v_comp_raw_correct[v_comp_idx] + 1; END IF;
    END IF;

  END LOOP;

  -- ── Compute final metrics ──────────────────────────────────────────────
  IF v_total = 0 THEN
    RETURN jsonb_build_object('error', 'no_predictions_found', 'run_id', p_run_id);
  END IF;

  v_adj_brier     := v_brier_sum / v_total;
  v_adj_log_loss  := v_log_loss_sum / v_total;
  v_adj_accuracy  := (v_correct::numeric / v_total) * 100.0;

  -- F1 draw
  IF (v_tp_draw + v_fp_draw) > 0 THEN
    v_draw_precision := v_tp_draw::numeric / (v_tp_draw + v_fp_draw);
  ELSE v_draw_precision := 0; END IF;
  IF (v_tp_draw + v_fn_draw) > 0 THEN
    v_draw_recall := v_tp_draw::numeric / (v_tp_draw + v_fn_draw);
  ELSE v_draw_recall := 0; END IF;
  IF (v_draw_precision + v_draw_recall) > 0 THEN
    v_draw_f1 := 2 * v_draw_precision * v_draw_recall / (v_draw_precision + v_draw_recall) * 100.0;
  ELSE v_draw_f1 := 0; END IF;

  -- F1 away
  IF (v_tp_away + v_fp_away) > 0 THEN
    v_away_precision := v_tp_away::numeric / (v_tp_away + v_fp_away);
  ELSE v_away_precision := 0; END IF;
  IF (v_tp_away + v_fn_away) > 0 THEN
    v_away_recall := v_tp_away::numeric / (v_tp_away + v_fn_away);
  ELSE v_away_recall := 0; END IF;
  IF (v_away_precision + v_away_recall) > 0 THEN
    v_away_f1 := 2 * v_away_precision * v_away_recall / (v_away_precision + v_away_recall) * 100.0;
  ELSE v_away_f1 := 0; END IF;

  -- Brier skill vs raw
  IF v_raw_brier > 0 THEN
    v_brier_skill_raw := (v_raw_brier - v_adj_brier) / v_raw_brier;
  ELSE v_brier_skill_raw := 0; END IF;

  -- Calibration bins
  FOR v_i IN 1..6 LOOP
    IF v_bin_count[v_i] > 0 THEN
      v_bin_mean_pred[v_i]   := v_bin_sum_pred[v_i] / v_bin_count[v_i];
      v_bin_mean_actual[v_i] := v_bin_sum_actual[v_i] / v_bin_count[v_i];
    END IF;
  END LOOP;

  -- OLS calibration slope (weighted)
  FOR v_i IN 1..6 LOOP
    IF v_bin_count[v_i] > 0 THEN
      v_slope_num := v_slope_num + v_bin_count[v_i] * (v_bin_mean_pred[v_i] - 0.25) * (v_bin_mean_actual[v_i] - 0.25);
      v_slope_den := v_slope_den + v_bin_count[v_i] * (v_bin_mean_pred[v_i] - 0.25)^2;
    END IF;
  END LOOP;
  IF v_slope_den > 0 THEN
    v_calibration_slope := v_slope_num / v_slope_den;
  ELSE v_calibration_slope := NULL; END IF;

  -- ECE draw
  FOR v_i IN 1..6 LOOP
    IF v_bin_count[v_i] > 0 THEN
      v_ece_draw := v_ece_draw + (v_bin_count[v_i]::numeric / v_total) * abs(v_bin_mean_pred[v_i] - v_bin_mean_actual[v_i]);
    END IF;
  END LOOP;

  -- Per-competition health JSON
  FOR v_i IN 1..7 LOOP
    IF v_comp_total[v_i] > 0 THEN
      v_health_json := jsonb_build_object(
        'competition', v_comp_names[v_i],
        'competition_id', v_comp_api_ids[v_i],
        'total', v_comp_total[v_i],
        'accuracy', round((v_comp_correct[v_i]::numeric / v_comp_total[v_i]) * 100.0, 2),
        'raw_accuracy', round((v_comp_raw_correct[v_i]::numeric / v_comp_total[v_i]) * 100.0, 2),
        'accuracy_delta', round(((v_comp_correct[v_i]::numeric - v_comp_raw_correct[v_i]::numeric) / v_comp_total[v_i]) * 100.0, 2),
        'pred_draw_rate', round((v_comp_pred_draw[v_i]::numeric / v_comp_total[v_i]) * 100.0, 2),
        'helped', v_comp_helped[v_i],
        'harmed', v_comp_harmed[v_i],
        'net_impact', v_comp_helped[v_i] - v_comp_harmed[v_i]
      );
      v_health_arr := v_health_arr || jsonb_build_array(v_health_json);
    END IF;
  END LOOP;

  -- ── Rejection logic ───────────────────────────────────────────────────
  IF v_adj_brier > v_raw_brier + 0.001 THEN
    v_reject_flags := array_append(v_reject_flags, 'brier_degraded');
  END IF;
  IF v_adj_accuracy < v_raw_accuracy - 0.5 THEN
    v_reject_flags := array_append(v_reject_flags, 'accuracy_degraded');
  END IF;
  IF v_draw_f1 < 15.0 THEN
    v_reject_flags := array_append(v_reject_flags, 'draw_f1_too_low');
  END IF;
  IF v_calibration_slope IS NOT NULL AND (v_calibration_slope < 0.80 OR v_calibration_slope > 1.20) THEN
    v_reject_flags := array_append(v_reject_flags, 'cal_slope_out_of_range');
  END IF;
  IF (v_pred_draw_count::numeric / v_total) < 0.05 THEN
    v_reject_flags := array_append(v_reject_flags, 'pred_draw_rate_too_low');
  END IF;
  -- Ligue1 pathology check
  IF v_comp_total[5] > 0 AND (v_comp_pred_draw[5]::numeric / v_comp_total[5]) > 0.60 THEN
    v_reject_flags := array_append(v_reject_flags, 'ligue1_draw_overcall');
  END IF;
  -- Bundesliga accuracy drop
  IF v_comp_total[2] > 0 THEN
    DECLARE
      v_bl_acc_delta numeric;
    BEGIN
      v_bl_acc_delta := ((v_comp_correct[2]::numeric - v_comp_raw_correct[2]::numeric) / v_comp_total[2]) * 100.0;
      IF v_bl_acc_delta < -2.0 THEN
        v_reject_flags := array_append(v_reject_flags, 'bundesliga_accuracy_drop');
      END IF;
    END;
  END IF;

  IF array_length(v_reject_flags, 1) IS NULL THEN
    v_verdict := 'PASS';
  ELSE
    v_verdict := 'REJECT';
  END IF;

  -- ── Upsert result ────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_adjustment_simulations (
    source_backtest_run_id,
    simulation_key,
    simulation_status,
    adjustment_source,
    sample_size,
    raw_avg_brier_1x2,
    adjusted_avg_brier_1x2,
    raw_avg_log_loss_1x2,
    adjusted_avg_log_loss_1x2,
    raw_result_accuracy,
    adjusted_result_accuracy,
    raw_pred_home_rate,
    raw_pred_draw_rate,
    raw_pred_away_rate,
    adjusted_pred_home_rate,
    adjusted_pred_draw_rate,
    adjusted_pred_away_rate,
    actual_home_rate,
    actual_draw_rate,
    actual_away_rate,
    draw_precision,
    draw_recall,
    draw_f1,
    away_precision,
    away_recall,
    away_f1,
    expected_calibration_error_draw,
    reliability_bins_draw,
    calibration_slope_draw,
    brier_skill_vs_raw,
    simulation_verdict,
    rejection_flags,
    argmax_stability_json,
    per_competition_health_json,
    simulation_family,
    family_objective,
    sigmoid_k,
    relative_cap_pct,
    pipeline_order,
    bias_transform_config
  )
  VALUES (
    p_run_id,
    p_mode,
    'completed',
    'ml_run_bias_refinement_simulation',
    v_total,
    v_raw_brier,
    v_adj_brier,
    v_raw_log_loss,
    v_adj_log_loss,
    v_raw_accuracy,
    v_adj_accuracy,
    v_raw_pred_home,
    v_raw_pred_draw,
    v_raw_pred_away,
    (v_pred_home_count::numeric / v_total),
    (v_pred_draw_count::numeric / v_total),
    (v_pred_away_count::numeric / v_total),
    v_actual_home,
    v_actual_draw,
    v_actual_away,
    v_draw_precision * 100.0,
    v_draw_recall * 100.0,
    v_draw_f1,
    v_away_precision * 100.0,
    v_away_recall * 100.0,
    v_away_f1,
    v_ece_draw,
    jsonb_build_object(
      'bins', jsonb_build_array(
        jsonb_build_object('range','0-10%','n',v_bin_count[1],'mean_pred',round(v_bin_mean_pred[1],4),'mean_actual',round(v_bin_mean_actual[1],4)),
        jsonb_build_object('range','10-20%','n',v_bin_count[2],'mean_pred',round(v_bin_mean_pred[2],4),'mean_actual',round(v_bin_mean_actual[2],4)),
        jsonb_build_object('range','20-30%','n',v_bin_count[3],'mean_pred',round(v_bin_mean_pred[3],4),'mean_actual',round(v_bin_mean_actual[3],4)),
        jsonb_build_object('range','30-40%','n',v_bin_count[4],'mean_pred',round(v_bin_mean_pred[4],4),'mean_actual',round(v_bin_mean_actual[4],4)),
        jsonb_build_object('range','40-50%','n',v_bin_count[5],'mean_pred',round(v_bin_mean_pred[5],4),'mean_actual',round(v_bin_mean_actual[5],4)),
        jsonb_build_object('range','50%+','n',v_bin_count[6],'mean_pred',round(v_bin_mean_pred[6],4),'mean_actual',round(v_bin_mean_actual[6],4))
      )
    ),
    v_calibration_slope,
    v_brier_skill_raw,
    v_verdict,
    to_jsonb(v_reject_flags),
    jsonb_build_object(
      'changed_rate', round((v_argmax_changed::numeric / v_total) * 100.0, 2),
      'changed_to_draw_rate', round((v_changed_to_draw::numeric / v_total) * 100.0, 2),
      'helped', v_helped,
      'harmed', v_harmed,
      'net_accuracy_impact', v_helped - v_harmed
    ),
    v_health_arr,
    v_family,
    v_objective,
    v_sigmoid_k,
    v_relative_cap,
    CASE WHEN v_cb_before_temp THEN 'CB→T' ELSE 'T→CB' END,
    jsonb_build_object(
      'sigmoid_cap', v_sigmoid_cap,
      'sigmoid_k', v_sigmoid_k,
      'relative_cap_pct', v_relative_cap,
      'use_sigmoid', v_use_sigmoid,
      'use_relative', v_use_relative,
      'cb_before_temp', v_cb_before_temp,
      'ligue1_draw_half', v_ligue1_draw_half,
      'bundesliga_away_half', v_bundesliga_away_half
    )
  )
  ON CONFLICT (source_backtest_run_id, simulation_key) DO UPDATE SET
    simulation_status        = EXCLUDED.simulation_status,
    adjusted_avg_brier_1x2  = EXCLUDED.adjusted_avg_brier_1x2,
    adjusted_avg_log_loss_1x2 = EXCLUDED.adjusted_avg_log_loss_1x2,
    adjusted_result_accuracy = EXCLUDED.adjusted_result_accuracy,
    adjusted_pred_home_rate  = EXCLUDED.adjusted_pred_home_rate,
    adjusted_pred_draw_rate  = EXCLUDED.adjusted_pred_draw_rate,
    adjusted_pred_away_rate  = EXCLUDED.adjusted_pred_away_rate,
    draw_precision           = EXCLUDED.draw_precision,
    draw_recall              = EXCLUDED.draw_recall,
    draw_f1                  = EXCLUDED.draw_f1,
    away_precision           = EXCLUDED.away_precision,
    away_recall              = EXCLUDED.away_recall,
    away_f1                  = EXCLUDED.away_f1,
    expected_calibration_error_draw = EXCLUDED.expected_calibration_error_draw,
    reliability_bins_draw    = EXCLUDED.reliability_bins_draw,
    calibration_slope_draw   = EXCLUDED.calibration_slope_draw,
    brier_skill_vs_raw       = EXCLUDED.brier_skill_vs_raw,
    simulation_verdict       = EXCLUDED.simulation_verdict,
    rejection_flags          = EXCLUDED.rejection_flags,
    argmax_stability_json    = EXCLUDED.argmax_stability_json,
    per_competition_health_json = EXCLUDED.per_competition_health_json,
    simulation_family        = EXCLUDED.simulation_family,
    family_objective         = EXCLUDED.family_objective,
    sigmoid_k                = EXCLUDED.sigmoid_k,
    relative_cap_pct         = EXCLUDED.relative_cap_pct,
    pipeline_order           = EXCLUDED.pipeline_order,
    bias_transform_config    = EXCLUDED.bias_transform_config;

  RETURN jsonb_build_object(
    'mode', p_mode,
    'verdict', v_verdict,
    'sample_size', v_total,
    'brier', round(v_adj_brier, 8),
    'accuracy', round(v_adj_accuracy, 4),
    'draw_f1', round(v_draw_f1, 2),
    'cal_slope', round(COALESCE(v_calibration_slope, -1), 4),
    'pred_draw_rate', round((v_pred_draw_count::numeric / v_total) * 100.0, 2),
    'reject_flags', to_jsonb(v_reject_flags),
    'helped', v_helped,
    'harmed', v_harmed
  );
END;
$$;
