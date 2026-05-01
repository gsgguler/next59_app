/*
  # Fix ml_run_bias_refinement_simulation — Brier Scale

  ## Fix
  Brier 1x2 score is computed as (1/3) * sum of squared differences,
  not the raw sum. Prior version used raw sum (3x too high).
  Also: raw baseline is read from backtest_run average_brier_1x2
  directly from model_lab.backtest_runs rather than simulation rows
  (which have NULL raw_avg_brier_1x2).
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
  v_raw_brier          numeric;
  v_raw_log_loss       numeric;
  v_raw_accuracy       numeric;
  v_raw_pred_home      numeric;
  v_raw_pred_draw      numeric;
  v_raw_pred_away      numeric;
  v_actual_home        numeric;
  v_actual_draw        numeric;
  v_actual_away        numeric;

  rec                  record;

  v_brier_sum          numeric := 0;
  v_log_loss_sum       numeric := 0;
  v_correct            integer := 0;
  v_total              integer := 0;
  v_pred_home_count    integer := 0;
  v_pred_draw_count    integer := 0;
  v_pred_away_count    integer := 0;
  v_actual_home_count  integer := 0;
  v_actual_draw_count  integer := 0;
  v_actual_away_count  integer := 0;
  v_raw_correct        integer := 0;

  v_tp_draw            integer := 0;
  v_fp_draw            integer := 0;
  v_fn_draw            integer := 0;
  v_tp_away            integer := 0;
  v_fp_away            integer := 0;
  v_fn_away            integer := 0;

  v_argmax_changed     integer := 0;
  v_changed_to_draw    integer := 0;
  v_helped             integer := 0;
  v_harmed             integer := 0;

  v_bin_count          integer[6]  := ARRAY[0,0,0,0,0,0];
  v_bin_sum_pred       numeric[6]  := ARRAY[0,0,0,0,0,0];
  v_bin_sum_actual     numeric[6]  := ARRAY[0,0,0,0,0,0];
  v_bin_mean_pred      numeric[6]  := ARRAY[0,0,0,0,0,0];
  v_bin_mean_actual    numeric[6]  := ARRAY[0,0,0,0,0,0];

  v_comp_correct       integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_total         integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_pred_draw     integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_helped        integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_harmed        integer[] := ARRAY[0,0,0,0,0,0,0];
  v_comp_raw_correct   integer[] := ARRAY[0,0,0,0,0,0,0];

  v_ph    numeric;  v_pd    numeric;  v_pa    numeric;
  v_rh    numeric;  v_rd    numeric;  v_ra    numeric;
  v_sum   numeric;
  v_raw_argmax   text;
  v_adj_argmax   text;
  v_actual       text;
  v_comp_name    text;
  v_comp_idx     integer;
  v_bin_idx      integer;
  v_brier_i      numeric;
  v_log_loss_i   numeric;
  v_h_bias  numeric;  v_d_bias  numeric;  v_a_bias  numeric;

  v_sigmoid_cap    numeric;  v_sigmoid_k      numeric;
  v_relative_cap   numeric;
  v_use_sigmoid    boolean;  v_use_relative   boolean;
  v_cb_before_temp boolean;
  v_ligue1_draw_half     boolean;
  v_bundesliga_away_half boolean;
  v_family         text;    v_objective      text;

  v_slope_num   numeric := 0;  v_slope_den   numeric := 0;
  v_cal_slope   numeric;       v_ece_draw    numeric := 0;

  v_adj_brier      numeric;  v_adj_log_loss   numeric;  v_adj_accuracy   numeric;
  v_draw_precision numeric;  v_draw_recall    numeric;  v_draw_f1        numeric;
  v_away_precision numeric;  v_away_recall    numeric;  v_away_f1        numeric;
  v_brier_skill    numeric;

  v_verdict        text;
  v_reject_flags   text[] := ARRAY[]::text[];

  v_comp_names  text[] := ARRAY['Premier League','Bundesliga','Serie A','La Liga','Ligue 1','Eredivisie','Sueper Lig'];
  v_health_arr  jsonb  := '[]'::jsonb;
  v_health_obj  jsonb;
  v_ii          integer;
  v_bl_acc_delta numeric;

BEGIN
  PERFORM _ml_assert_admin();

  -- ── Defaults ────────────────────────────────────────────────────────────
  v_use_sigmoid := false; v_use_relative := false; v_cb_before_temp := false;
  v_ligue1_draw_half := false; v_bundesliga_away_half := false;
  v_sigmoid_cap := 0.10; v_sigmoid_k := 1.0; v_relative_cap := 0.20;
  v_family := 'unknown'; v_objective := 'unknown';

  -- ── Mode → config ────────────────────────────────────────────────────────
  IF    p_mode = 'temp160_sigmoid_cap008_k050' THEN v_use_sigmoid:=true; v_sigmoid_cap:=0.08; v_sigmoid_k:=0.50; v_family:='sigmoid_tuning'; v_objective:='cap=0.08 k=0.50';
  ELSIF p_mode = 'temp160_sigmoid_cap008_k075' THEN v_use_sigmoid:=true; v_sigmoid_cap:=0.08; v_sigmoid_k:=0.75; v_family:='sigmoid_tuning'; v_objective:='cap=0.08 k=0.75';
  ELSIF p_mode = 'temp160_sigmoid_cap009_k050' THEN v_use_sigmoid:=true; v_sigmoid_cap:=0.09; v_sigmoid_k:=0.50; v_family:='sigmoid_tuning'; v_objective:='cap=0.09 k=0.50';
  ELSIF p_mode = 'temp160_sigmoid_cap009_k075' THEN v_use_sigmoid:=true; v_sigmoid_cap:=0.09; v_sigmoid_k:=0.75; v_family:='sigmoid_tuning'; v_objective:='cap=0.09 k=0.75';
  ELSIF p_mode = 'temp160_sigmoid_cap010_k050' THEN v_use_sigmoid:=true; v_sigmoid_cap:=0.10; v_sigmoid_k:=0.50; v_family:='sigmoid_tuning'; v_objective:='cap=0.10 k=0.50';
  ELSIF p_mode = 'temp160_sigmoid_cap010_k075' THEN v_use_sigmoid:=true; v_sigmoid_cap:=0.10; v_sigmoid_k:=0.75; v_family:='sigmoid_tuning'; v_objective:='cap=0.10 k=0.75';
  ELSIF p_mode = 'temp160_dynamic_relative_cap_15pct' THEN v_use_relative:=true; v_relative_cap:=0.15; v_family:='dynamic_relative'; v_objective:='relative ±15% of p_class';
  ELSIF p_mode = 'temp160_dynamic_relative_cap_20pct' THEN v_use_relative:=true; v_relative_cap:=0.20; v_family:='dynamic_relative'; v_objective:='relative ±20% of p_class';
  ELSIF p_mode = 'temp160_dynamic_relative_cap_25pct' THEN v_use_relative:=true; v_relative_cap:=0.25; v_family:='dynamic_relative'; v_objective:='relative ±25% of p_class';
  ELSIF p_mode = 'temp160_sigmoid008_k075_relative20' THEN v_use_sigmoid:=true; v_use_relative:=true; v_sigmoid_cap:=0.08; v_sigmoid_k:=0.75; v_relative_cap:=0.20; v_family:='hybrid'; v_objective:='sigmoid 0.08/0.75 + rel 20%';
  ELSIF p_mode = 'temp160_sigmoid009_k075_relative20' THEN v_use_sigmoid:=true; v_use_relative:=true; v_sigmoid_cap:=0.09; v_sigmoid_k:=0.75; v_relative_cap:=0.20; v_family:='hybrid'; v_objective:='sigmoid 0.09/0.75 + rel 20%';
  ELSIF p_mode = 'temp160_sigmoid010_k075_relative20' THEN v_use_sigmoid:=true; v_use_relative:=true; v_sigmoid_cap:=0.10; v_sigmoid_k:=0.75; v_relative_cap:=0.20; v_family:='hybrid'; v_objective:='sigmoid 0.10/0.75 + rel 20%';
  ELSIF p_mode = 'robust_cb_sigmoid009_k075_then_temp160' THEN v_use_sigmoid:=true; v_cb_before_temp:=true; v_sigmoid_cap:=0.09; v_sigmoid_k:=0.75; v_family:='cb_then_t'; v_objective:='CB sig 0.09/0.75 → T=1.6';
  ELSIF p_mode = 'robust_cb_sigmoid010_k075_then_temp160' THEN v_use_sigmoid:=true; v_cb_before_temp:=true; v_sigmoid_cap:=0.10; v_sigmoid_k:=0.75; v_family:='cb_then_t'; v_objective:='CB sig 0.10/0.75 → T=1.6';
  ELSIF p_mode = 'robust_cb_relative20_then_temp160'       THEN v_use_relative:=true; v_cb_before_temp:=true; v_relative_cap:=0.20; v_family:='cb_then_t'; v_objective:='CB rel 20% → T=1.6';
  ELSIF p_mode = 'temp160_sigmoid010_k075_ligue1_half_draw_bias'      THEN v_use_sigmoid:=true; v_sigmoid_cap:=0.10; v_sigmoid_k:=0.75; v_ligue1_draw_half:=true; v_family:='league_ablation'; v_objective:='sig 0.10/0.75 + L1 draw÷2';
  ELSIF p_mode = 'temp160_sigmoid010_k075_bundesliga_half_away_bias'  THEN v_use_sigmoid:=true; v_sigmoid_cap:=0.10; v_sigmoid_k:=0.75; v_bundesliga_away_half:=true; v_family:='league_ablation'; v_objective:='sig 0.10/0.75 + BL away÷2';
  ELSIF p_mode = 'temp160_sigmoid010_k075_l1_half_draw_bl_half_away' THEN v_use_sigmoid:=true; v_sigmoid_cap:=0.10; v_sigmoid_k:=0.75; v_ligue1_draw_half:=true; v_bundesliga_away_half:=true; v_family:='league_ablation'; v_objective:='sig 0.10/0.75 + L1 draw÷2 + BL away÷2';
  ELSE RETURN jsonb_build_object('error', 'unknown_mode', 'mode', p_mode);
  END IF;

  -- ── Raw baseline from backtest_runs + existing simulation sample stats ───
  SELECT br.average_brier_1x2, br.average_log_loss_1x2
  INTO v_raw_brier, v_raw_log_loss
  FROM model_lab.backtest_runs br
  WHERE br.id = p_run_id;

  -- Raw accuracy and prediction rates from existing simulation rows
  SELECT s.raw_result_accuracy, s.raw_pred_home_rate, s.raw_pred_draw_rate,
         s.raw_pred_away_rate, s.actual_home_rate, s.actual_draw_rate, s.actual_away_rate
  INTO v_raw_accuracy, v_raw_pred_home, v_raw_pred_draw, v_raw_pred_away,
       v_actual_home, v_actual_draw, v_actual_away
  FROM model_lab.calibration_adjustment_simulations s
  WHERE s.source_backtest_run_id = p_run_id
    AND s.raw_result_accuracy IS NOT NULL
  ORDER BY s.created_at ASC
  LIMIT 1;

  -- ── Per-match loop ───────────────────────────────────────────────────────
  FOR rec IN
    SELECT
      mp.p_home            AS rh,
      mp.p_draw            AS rd,
      mp.p_away            AS ra,
      mp.predicted_result  AS raw_pred,
      mp.competition_name  AS comp_name,
      me.actual_result     AS actual_result
    FROM   model_lab.match_model_predictions mp
    JOIN   model_lab.match_model_evaluations  me ON me.prediction_id = mp.id
    WHERE  mp.backtest_run_id = p_run_id
      AND  mp.p_home   IS NOT NULL
      AND  mp.p_draw   IS NOT NULL
      AND  mp.p_away   IS NOT NULL
      AND  me.actual_result IS NOT NULL
  LOOP
    v_rh        := rec.rh;
    v_rd        := rec.rd;
    v_ra        := rec.ra;
    v_comp_name := rec.comp_name;
    v_actual    := rec.actual_result;
    v_raw_argmax := rec.raw_pred;

    IF v_actual = 'H' THEN v_actual_home_count := v_actual_home_count + 1;
    ELSIF v_actual = 'D' THEN v_actual_draw_count := v_actual_draw_count + 1;
    ELSE v_actual_away_count := v_actual_away_count + 1;
    END IF;
    IF v_raw_argmax = v_actual THEN v_raw_correct := v_raw_correct + 1; END IF;

    -- ── Bias lookup (competition_name → group_key) ──────────────────────
    SELECT
      COALESCE(SUM(CASE WHEN ca.adjustment_type='home_bias_correction' THEN ca.adjustment_value ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN ca.adjustment_type='draw_bias_correction' THEN ca.adjustment_value ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN ca.adjustment_type='away_bias_correction' THEN ca.adjustment_value ELSE 0 END), 0)
    INTO v_h_bias, v_d_bias, v_a_bias
    FROM model_lab.calibration_adjustments ca
    WHERE ca.group_type = 'competition'
      AND ca.group_key   = v_comp_name
      AND ca.is_active   = false;

    IF v_ligue1_draw_half     AND v_comp_name = 'Ligue 1'    THEN v_d_bias := v_d_bias * 0.5; END IF;
    IF v_bundesliga_away_half AND v_comp_name = 'Bundesliga' THEN v_a_bias := v_a_bias * 0.5; END IF;

    -- ── Pipeline ────────────────────────────────────────────────────────
    -- NOTE: p_home/p_draw/p_away are RAW model outputs (pre-temperature).
    -- The backtest run stores raw probs. Temperature scaling and bias are
    -- both applied here in simulation.
    IF v_cb_before_temp THEN
      -- Compress bias on raw probs
      IF v_use_sigmoid THEN
        v_h_bias := v_sigmoid_cap * tanh(v_h_bias * v_sigmoid_k / v_sigmoid_cap);
        v_d_bias := v_sigmoid_cap * tanh(v_d_bias * v_sigmoid_k / v_sigmoid_cap);
        v_a_bias := v_sigmoid_cap * tanh(v_a_bias * v_sigmoid_k / v_sigmoid_cap);
      ELSIF v_use_relative THEN
        v_h_bias := GREATEST(-v_relative_cap * v_rh, LEAST(v_relative_cap * v_rh, v_h_bias));
        v_d_bias := GREATEST(-v_relative_cap * v_rd, LEAST(v_relative_cap * v_rd, v_d_bias));
        v_a_bias := GREATEST(-v_relative_cap * v_ra, LEAST(v_relative_cap * v_ra, v_a_bias));
      END IF;
      v_ph  := GREATEST(0.001, v_rh + v_h_bias);
      v_pd  := GREATEST(0.001, v_rd + v_d_bias);
      v_pa  := GREATEST(0.001, v_ra + v_a_bias);
      v_sum := v_ph + v_pd + v_pa;
      v_ph  := v_ph/v_sum; v_pd := v_pd/v_sum; v_pa := v_pa/v_sum;
      -- Then T=1.6
      v_ph  := power(v_ph, 1.0/1.6);
      v_pd  := power(v_pd, 1.0/1.6);
      v_pa  := power(v_pa, 1.0/1.6);
      v_sum := v_ph + v_pd + v_pa;
      v_ph  := v_ph/v_sum; v_pd := v_pd/v_sum; v_pa := v_pa/v_sum;
    ELSE
      -- T=1.6 first on raw probs
      v_ph  := power(GREATEST(v_rh, 0.001), 1.0/1.6);
      v_pd  := power(GREATEST(v_rd, 0.001), 1.0/1.6);
      v_pa  := power(GREATEST(v_ra, 0.001), 1.0/1.6);
      v_sum := v_ph + v_pd + v_pa;
      v_ph  := v_ph/v_sum; v_pd := v_pd/v_sum; v_pa := v_pa/v_sum;
      -- Compress bias on T-scaled probs
      IF v_use_sigmoid THEN
        v_h_bias := v_sigmoid_cap * tanh(v_h_bias * v_sigmoid_k / v_sigmoid_cap);
        v_d_bias := v_sigmoid_cap * tanh(v_d_bias * v_sigmoid_k / v_sigmoid_cap);
        v_a_bias := v_sigmoid_cap * tanh(v_a_bias * v_sigmoid_k / v_sigmoid_cap);
      END IF;
      IF v_use_relative THEN
        v_h_bias := GREATEST(-v_relative_cap * v_ph, LEAST(v_relative_cap * v_ph, v_h_bias));
        v_d_bias := GREATEST(-v_relative_cap * v_pd, LEAST(v_relative_cap * v_pd, v_d_bias));
        v_a_bias := GREATEST(-v_relative_cap * v_pa, LEAST(v_relative_cap * v_pa, v_a_bias));
      END IF;
      v_ph  := GREATEST(0.001, v_ph + v_h_bias);
      v_pd  := GREATEST(0.001, v_pd + v_d_bias);
      v_pa  := GREATEST(0.001, v_pa + v_a_bias);
      v_sum := v_ph + v_pd + v_pa;
      v_ph  := v_ph/v_sum; v_pd := v_pd/v_sum; v_pa := v_pa/v_sum;
    END IF;

    -- Argmax
    IF    v_ph >= v_pd AND v_ph >= v_pa THEN v_adj_argmax := 'H';
    ELSIF v_pd >= v_ph AND v_pd >= v_pa THEN v_adj_argmax := 'D';
    ELSE                                     v_adj_argmax := 'A';
    END IF;

    IF    v_adj_argmax = 'H' THEN v_pred_home_count := v_pred_home_count + 1;
    ELSIF v_adj_argmax = 'D' THEN v_pred_draw_count := v_pred_draw_count + 1;
    ELSE                          v_pred_away_count := v_pred_away_count + 1;
    END IF;

    -- Brier (normalized: divide by 3)
    IF    v_actual = 'H' THEN v_brier_i := ((v_ph-1)^2 + v_pd^2 + v_pa^2) / 3.0;
    ELSIF v_actual = 'D' THEN v_brier_i := (v_ph^2 + (v_pd-1)^2 + v_pa^2) / 3.0;
    ELSE                       v_brier_i := (v_ph^2 + v_pd^2 + (v_pa-1)^2) / 3.0;
    END IF;
    v_brier_sum := v_brier_sum + v_brier_i;

    -- Log loss
    IF    v_actual = 'H' THEN v_log_loss_i := -ln(GREATEST(v_ph, 1e-9));
    ELSIF v_actual = 'D' THEN v_log_loss_i := -ln(GREATEST(v_pd, 1e-9));
    ELSE                       v_log_loss_i := -ln(GREATEST(v_pa, 1e-9));
    END IF;
    v_log_loss_sum := v_log_loss_sum + v_log_loss_i;

    IF v_adj_argmax = v_actual THEN v_correct := v_correct + 1; END IF;
    v_total := v_total + 1;

    -- F1 draw
    IF    v_adj_argmax='D' AND v_actual='D'  THEN v_tp_draw := v_tp_draw + 1;
    ELSIF v_adj_argmax='D' AND v_actual<>'D' THEN v_fp_draw := v_fp_draw + 1;
    ELSIF v_adj_argmax<>'D' AND v_actual='D' THEN v_fn_draw := v_fn_draw + 1;
    END IF;
    -- F1 away
    IF    v_adj_argmax='A' AND v_actual='A'  THEN v_tp_away := v_tp_away + 1;
    ELSIF v_adj_argmax='A' AND v_actual<>'A' THEN v_fp_away := v_fp_away + 1;
    ELSIF v_adj_argmax<>'A' AND v_actual='A' THEN v_fn_away := v_fn_away + 1;
    END IF;

    -- Argmax stability
    IF v_adj_argmax <> v_raw_argmax THEN
      v_argmax_changed := v_argmax_changed + 1;
      IF v_adj_argmax = 'D' THEN v_changed_to_draw := v_changed_to_draw + 1; END IF;
      IF v_raw_argmax = v_actual AND v_adj_argmax <> v_actual THEN v_harmed := v_harmed + 1;
      ELSIF v_raw_argmax <> v_actual AND v_adj_argmax = v_actual THEN v_helped := v_helped + 1;
      END IF;
    END IF;

    -- Calibration bin
    IF    v_pd < 0.10 THEN v_bin_idx := 1;
    ELSIF v_pd < 0.20 THEN v_bin_idx := 2;
    ELSIF v_pd < 0.30 THEN v_bin_idx := 3;
    ELSIF v_pd < 0.40 THEN v_bin_idx := 4;
    ELSIF v_pd < 0.50 THEN v_bin_idx := 5;
    ELSE                   v_bin_idx := 6;
    END IF;
    v_bin_count[v_bin_idx]      := v_bin_count[v_bin_idx] + 1;
    v_bin_sum_pred[v_bin_idx]   := v_bin_sum_pred[v_bin_idx] + v_pd;
    v_bin_sum_actual[v_bin_idx] := v_bin_sum_actual[v_bin_idx] + CASE WHEN v_actual='D' THEN 1.0 ELSE 0.0 END;

    -- Per-competition
    v_comp_idx := NULL;
    IF    v_comp_name='Premier League' THEN v_comp_idx:=1;
    ELSIF v_comp_name='Bundesliga'     THEN v_comp_idx:=2;
    ELSIF v_comp_name='Serie A'        THEN v_comp_idx:=3;
    ELSIF v_comp_name='La Liga'        THEN v_comp_idx:=4;
    ELSIF v_comp_name='Ligue 1'        THEN v_comp_idx:=5;
    ELSIF v_comp_name='Eredivisie'     THEN v_comp_idx:=6;
    ELSIF v_comp_name='Sueper Lig'     THEN v_comp_idx:=7;
    END IF;

    IF v_comp_idx IS NOT NULL THEN
      v_comp_total[v_comp_idx] := v_comp_total[v_comp_idx] + 1;
      IF v_adj_argmax='D' THEN v_comp_pred_draw[v_comp_idx] := v_comp_pred_draw[v_comp_idx]+1; END IF;
      IF v_adj_argmax=v_actual THEN v_comp_correct[v_comp_idx] := v_comp_correct[v_comp_idx]+1; END IF;
      IF v_raw_argmax=v_actual AND v_adj_argmax<>v_actual THEN v_comp_harmed[v_comp_idx]:=v_comp_harmed[v_comp_idx]+1; END IF;
      IF v_raw_argmax<>v_actual AND v_adj_argmax=v_actual THEN v_comp_helped[v_comp_idx]:=v_comp_helped[v_comp_idx]+1; END IF;
      IF v_raw_argmax=v_actual THEN v_comp_raw_correct[v_comp_idx]:=v_comp_raw_correct[v_comp_idx]+1; END IF;
    END IF;

  END LOOP;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('error','no_predictions_found','run_id',p_run_id);
  END IF;

  -- ── Aggregates ───────────────────────────────────────────────────────────
  v_adj_brier    := v_brier_sum / v_total;
  v_adj_log_loss := v_log_loss_sum / v_total;
  v_adj_accuracy := (v_correct::numeric / v_total) * 100.0;

  -- Use computed raw accuracy if not loaded from DB
  IF v_raw_accuracy IS NULL THEN
    v_raw_accuracy := (v_raw_correct::numeric / v_total) * 100.0;
  END IF;
  IF v_actual_home IS NULL THEN
    v_actual_home := v_actual_home_count::numeric / v_total;
    v_actual_draw := v_actual_draw_count::numeric / v_total;
    v_actual_away := v_actual_away_count::numeric / v_total;
  END IF;

  IF (v_tp_draw+v_fp_draw)>0 THEN v_draw_precision:=v_tp_draw::numeric/(v_tp_draw+v_fp_draw); ELSE v_draw_precision:=0; END IF;
  IF (v_tp_draw+v_fn_draw)>0 THEN v_draw_recall   :=v_tp_draw::numeric/(v_tp_draw+v_fn_draw);  ELSE v_draw_recall   :=0; END IF;
  IF (v_draw_precision+v_draw_recall)>0 THEN v_draw_f1:=2*v_draw_precision*v_draw_recall/(v_draw_precision+v_draw_recall)*100.0; ELSE v_draw_f1:=0; END IF;

  IF (v_tp_away+v_fp_away)>0 THEN v_away_precision:=v_tp_away::numeric/(v_tp_away+v_fp_away); ELSE v_away_precision:=0; END IF;
  IF (v_tp_away+v_fn_away)>0 THEN v_away_recall   :=v_tp_away::numeric/(v_tp_away+v_fn_away);  ELSE v_away_recall   :=0; END IF;
  IF (v_away_precision+v_away_recall)>0 THEN v_away_f1:=2*v_away_precision*v_away_recall/(v_away_precision+v_away_recall)*100.0; ELSE v_away_f1:=0; END IF;

  IF v_raw_brier > 0 THEN v_brier_skill:=(v_raw_brier - v_adj_brier)/v_raw_brier; ELSE v_brier_skill:=0; END IF;

  FOR v_ii IN 1..6 LOOP
    IF v_bin_count[v_ii]>0 THEN
      v_bin_mean_pred[v_ii]  := v_bin_sum_pred[v_ii]  / v_bin_count[v_ii];
      v_bin_mean_actual[v_ii]:= v_bin_sum_actual[v_ii]/ v_bin_count[v_ii];
      v_slope_num := v_slope_num + v_bin_count[v_ii]*(v_bin_mean_pred[v_ii]-0.25)*(v_bin_mean_actual[v_ii]-0.25);
      v_slope_den := v_slope_den + v_bin_count[v_ii]*(v_bin_mean_pred[v_ii]-0.25)^2;
      v_ece_draw  := v_ece_draw  + (v_bin_count[v_ii]::numeric/v_total)*abs(v_bin_mean_pred[v_ii]-v_bin_mean_actual[v_ii]);
    END IF;
  END LOOP;
  IF v_slope_den>0 THEN v_cal_slope:=v_slope_num/v_slope_den; ELSE v_cal_slope:=NULL; END IF;

  FOR v_ii IN 1..7 LOOP
    IF v_comp_total[v_ii]>0 THEN
      v_health_obj := jsonb_build_object(
        'competition',    v_comp_names[v_ii],
        'total',          v_comp_total[v_ii],
        'accuracy',       round((v_comp_correct[v_ii]::numeric    / v_comp_total[v_ii])*100.0,2),
        'raw_accuracy',   round((v_comp_raw_correct[v_ii]::numeric / v_comp_total[v_ii])*100.0,2),
        'accuracy_delta', round(((v_comp_correct[v_ii]-v_comp_raw_correct[v_ii])::numeric / v_comp_total[v_ii])*100.0,2),
        'pred_draw_rate', round((v_comp_pred_draw[v_ii]::numeric  / v_comp_total[v_ii])*100.0,2),
        'helped',         v_comp_helped[v_ii],
        'harmed',         v_comp_harmed[v_ii],
        'net',            v_comp_helped[v_ii]-v_comp_harmed[v_ii]
      );
      v_health_arr := v_health_arr || jsonb_build_array(v_health_obj);
    END IF;
  END LOOP;

  -- ── Rejection gates ──────────────────────────────────────────────────────
  IF v_raw_brier IS NOT NULL AND v_adj_brier > v_raw_brier + 0.001 THEN
    v_reject_flags := array_append(v_reject_flags, 'brier_degraded');
  END IF;
  IF v_adj_accuracy < v_raw_accuracy - 0.5 THEN
    v_reject_flags := array_append(v_reject_flags, 'accuracy_degraded');
  END IF;
  IF v_draw_f1 < 15.0 THEN
    v_reject_flags := array_append(v_reject_flags, 'draw_f1_too_low');
  END IF;
  IF v_cal_slope IS NOT NULL AND (v_cal_slope < 0.80 OR v_cal_slope > 1.20) THEN
    v_reject_flags := array_append(v_reject_flags, 'cal_slope_out_of_range');
  END IF;
  IF (v_pred_draw_count::numeric/v_total) < 0.05 THEN
    v_reject_flags := array_append(v_reject_flags, 'pred_draw_rate_too_low');
  END IF;
  IF v_comp_total[5]>0 AND (v_comp_pred_draw[5]::numeric/v_comp_total[5]) > 0.60 THEN
    v_reject_flags := array_append(v_reject_flags, 'ligue1_draw_overcall');
  END IF;
  IF v_comp_total[2]>0 THEN
    v_bl_acc_delta := ((v_comp_correct[2]-v_comp_raw_correct[2])::numeric / v_comp_total[2])*100.0;
    IF v_bl_acc_delta < -2.0 THEN
      v_reject_flags := array_append(v_reject_flags, 'bundesliga_accuracy_drop');
    END IF;
  END IF;

  IF array_length(v_reject_flags,1) IS NULL THEN v_verdict:='PASS'; ELSE v_verdict:='REJECT'; END IF;

  -- ── Upsert ────────────────────────────────────────────────────────────────
  INSERT INTO model_lab.calibration_adjustment_simulations (
    source_backtest_run_id, simulation_key, simulation_status, adjustment_source,
    sample_size, raw_avg_brier_1x2, adjusted_avg_brier_1x2,
    raw_avg_log_loss_1x2, adjusted_avg_log_loss_1x2,
    raw_result_accuracy, adjusted_result_accuracy,
    raw_pred_home_rate, raw_pred_draw_rate, raw_pred_away_rate,
    adjusted_pred_home_rate, adjusted_pred_draw_rate, adjusted_pred_away_rate,
    actual_home_rate, actual_draw_rate, actual_away_rate,
    draw_precision, draw_recall, draw_f1, away_precision, away_recall, away_f1,
    expected_calibration_error_draw, reliability_bins_draw, calibration_slope_draw,
    brier_skill_vs_raw, simulation_verdict, rejection_flags,
    argmax_stability_json, per_competition_health_json,
    simulation_family, family_objective, sigmoid_k, relative_cap_pct,
    pipeline_order, bias_transform_config
  )
  VALUES (
    p_run_id, p_mode, 'completed', 'ml_run_bias_refinement_simulation',
    v_total, v_raw_brier, v_adj_brier,
    v_raw_log_loss, v_adj_log_loss,
    v_raw_accuracy, v_adj_accuracy,
    v_raw_pred_home, v_raw_pred_draw, v_raw_pred_away,
    (v_pred_home_count::numeric/v_total),
    (v_pred_draw_count::numeric/v_total),
    (v_pred_away_count::numeric/v_total),
    v_actual_home, v_actual_draw, v_actual_away,
    v_draw_precision*100.0, v_draw_recall*100.0, v_draw_f1,
    v_away_precision*100.0, v_away_recall*100.0, v_away_f1,
    v_ece_draw,
    jsonb_build_object('bins', jsonb_build_array(
      jsonb_build_object('range','0-10%',  'n',v_bin_count[1],'mean_pred',round(v_bin_mean_pred[1],4),'mean_actual',round(v_bin_mean_actual[1],4)),
      jsonb_build_object('range','10-20%', 'n',v_bin_count[2],'mean_pred',round(v_bin_mean_pred[2],4),'mean_actual',round(v_bin_mean_actual[2],4)),
      jsonb_build_object('range','20-30%', 'n',v_bin_count[3],'mean_pred',round(v_bin_mean_pred[3],4),'mean_actual',round(v_bin_mean_actual[3],4)),
      jsonb_build_object('range','30-40%', 'n',v_bin_count[4],'mean_pred',round(v_bin_mean_pred[4],4),'mean_actual',round(v_bin_mean_actual[4],4)),
      jsonb_build_object('range','40-50%', 'n',v_bin_count[5],'mean_pred',round(v_bin_mean_pred[5],4),'mean_actual',round(v_bin_mean_actual[5],4)),
      jsonb_build_object('range','50%+',   'n',v_bin_count[6],'mean_pred',round(v_bin_mean_pred[6],4),'mean_actual',round(v_bin_mean_actual[6],4))
    )),
    v_cal_slope, v_brier_skill, v_verdict,
    to_jsonb(v_reject_flags),
    jsonb_build_object(
      'changed_rate',         round((v_argmax_changed::numeric /v_total)*100.0,2),
      'changed_to_draw_rate', round((v_changed_to_draw::numeric/v_total)*100.0,2),
      'helped', v_helped, 'harmed', v_harmed,
      'net_accuracy_impact', v_helped - v_harmed
    ),
    v_health_arr,
    v_family, v_objective, v_sigmoid_k, v_relative_cap,
    CASE WHEN v_cb_before_temp THEN 'CB→T' ELSE 'T→CB' END,
    jsonb_build_object(
      'sigmoid_cap', v_sigmoid_cap, 'sigmoid_k', v_sigmoid_k,
      'relative_cap_pct', v_relative_cap,
      'use_sigmoid', v_use_sigmoid, 'use_relative', v_use_relative,
      'cb_before_temp', v_cb_before_temp,
      'ligue1_draw_half', v_ligue1_draw_half,
      'bundesliga_away_half', v_bundesliga_away_half
    )
  )
  ON CONFLICT (source_backtest_run_id, simulation_key) DO UPDATE SET
    simulation_status         = EXCLUDED.simulation_status,
    raw_avg_brier_1x2         = EXCLUDED.raw_avg_brier_1x2,
    adjusted_avg_brier_1x2    = EXCLUDED.adjusted_avg_brier_1x2,
    raw_avg_log_loss_1x2      = EXCLUDED.raw_avg_log_loss_1x2,
    adjusted_avg_log_loss_1x2 = EXCLUDED.adjusted_avg_log_loss_1x2,
    raw_result_accuracy       = EXCLUDED.raw_result_accuracy,
    adjusted_result_accuracy  = EXCLUDED.adjusted_result_accuracy,
    adjusted_pred_home_rate   = EXCLUDED.adjusted_pred_home_rate,
    adjusted_pred_draw_rate   = EXCLUDED.adjusted_pred_draw_rate,
    adjusted_pred_away_rate   = EXCLUDED.adjusted_pred_away_rate,
    draw_precision            = EXCLUDED.draw_precision,
    draw_recall               = EXCLUDED.draw_recall,
    draw_f1                   = EXCLUDED.draw_f1,
    away_precision            = EXCLUDED.away_precision,
    away_recall               = EXCLUDED.away_recall,
    away_f1                   = EXCLUDED.away_f1,
    expected_calibration_error_draw = EXCLUDED.expected_calibration_error_draw,
    reliability_bins_draw     = EXCLUDED.reliability_bins_draw,
    calibration_slope_draw    = EXCLUDED.calibration_slope_draw,
    brier_skill_vs_raw        = EXCLUDED.brier_skill_vs_raw,
    simulation_verdict        = EXCLUDED.simulation_verdict,
    rejection_flags           = EXCLUDED.rejection_flags,
    argmax_stability_json     = EXCLUDED.argmax_stability_json,
    per_competition_health_json = EXCLUDED.per_competition_health_json,
    simulation_family         = EXCLUDED.simulation_family,
    family_objective          = EXCLUDED.family_objective,
    sigmoid_k                 = EXCLUDED.sigmoid_k,
    relative_cap_pct          = EXCLUDED.relative_cap_pct,
    pipeline_order            = EXCLUDED.pipeline_order,
    bias_transform_config     = EXCLUDED.bias_transform_config;

  RETURN jsonb_build_object(
    'mode', p_mode, 'verdict', v_verdict, 'n', v_total,
    'brier', round(v_adj_brier, 8), 'raw_brier', round(v_raw_brier, 8),
    'accuracy', round(v_adj_accuracy, 4), 'raw_accuracy', round(v_raw_accuracy, 4),
    'draw_f1', round(v_draw_f1, 2), 'cal_slope', round(COALESCE(v_cal_slope, -1), 4),
    'pred_draw_pct', round((v_pred_draw_count::numeric/v_total)*100.0, 2),
    'reject_flags', to_jsonb(v_reject_flags),
    'helped', v_helped, 'harmed', v_harmed
  );
END;
$$;
