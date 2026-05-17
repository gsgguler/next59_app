/*
  # Historical Replay Engine — ml_replay_competition_season_v1

  ## Purpose
  Simulate what Next59 would have predicted 2 hours before each historical match,
  using only data that was available at that point in time (no leakage).

  ## Algorithm
  1. Process matches chronologically within competition+season
  2. For each match, read pre-match features from match_feature_matrix_v2
  3. Apply Prediction V1 formula:
     - Base H/A from ELO expected scores (Bradley-Terry logistic)
     - Draw heuristic: BASE_DRAW_RATE=0.252, modulated by ELO closeness
     - Form gap modifier (when form features available)
     - Feature quality compression (tier-based confidence damping)
     - League calibration correction (home bias from L50 rolling window)
     - COVID freeze: do NOT update calibration during 2020-03-01..2021-08-31
  4. Insert predictions and evaluations
  5. Update league_calibration_state and append league_calibration_events after each match

  ## Safety
  - Admin/model_lab schema only
  - No public table writes
  - Idempotent: CONFLICT DO NOTHING on predictions, DELETE+reinsert on run rows

  ## Constants
  - BASE_DRAW_RATE = 0.252
  - DRAW_SENSITIVITY = 0.12
  - CALIBRATION_DAMPING = 0.50
  - COVID_START = 2020-03-01
  - COVID_END = 2021-08-31
  - FALLBACK_TIME = '22:00:00' UTC (for matches missing kickoff time)
  - OVERCONFIDENCE_THRESHOLD = 0.70
  - L50_WINDOW = 50
*/

CREATE OR REPLACE FUNCTION model_lab.ml_replay_competition_season_v1(
  p_competition_name text,
  p_season_label     text,
  p_run_key          text
)
RETURNS TABLE (
  out_run_id          uuid,
  out_total_matches   integer,
  out_processed       integer,
  out_failed          integer,
  out_status          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  -- constants
  c_elo_version       constant text    := 'elo_v2_ha0_k20_global';
  c_feature_version   constant text    := 'features_v2_domestic_2026_05';
  c_model_version     constant text    := 'prediction_v1';
  c_formula           constant text    := 'formula_v1_binary_plus_draw_heuristic';
  c_base_draw         constant numeric := 0.252;
  c_draw_sensitivity  constant numeric := 0.12;
  c_cal_damping       constant numeric := 0.50;
  c_overconf_thresh   constant numeric := 0.70;
  c_l50               constant integer := 50;
  c_covid_start       constant date    := '2020-03-01';
  c_covid_end         constant date    := '2021-08-31';
  c_fallback_time     constant time    := '22:00:00';

  -- run tracking
  v_run_id            uuid;
  v_total             integer := 0;
  v_processed         integer := 0;
  v_failed            integer := 0;

  -- calibration state (loaded/updated per match)
  v_matches_eval      integer := 0;
  v_home_correction   numeric := 0.0;
  v_rolling_brier     numeric := null;
  v_rolling_logloss   numeric := null;
  v_rolling_accuracy  numeric := null;
  v_home_bias         numeric := null;
  v_draw_bias         numeric := null;
  v_away_bias         numeric := null;
  v_fav_bias          numeric := null;
  v_upset_miss_rate   numeric := null;

  -- per-match vars
  v_match             record;
  v_kickoff_utc       timestamptz;
  v_kickoff_constructed boolean;
  v_sim_ts            timestamptz;
  v_is_covid          boolean;

  -- ELO / feature inputs
  v_elo_home          numeric;
  v_elo_away          numeric;
  v_elo_gap           numeric;
  v_form_gap          numeric;
  v_attack_gap        numeric;
  v_defense_gap       numeric;
  v_home_l5_avail     smallint;
  v_away_l5_avail     smallint;
  v_tier              text;

  -- probability computation
  v_raw_p_home        numeric;
  v_raw_p_away        numeric;
  v_elo_win_p         numeric;  -- logistic ELO home win probability
  v_draw_p            numeric;
  v_elo_closeness     numeric;
  v_form_modifier     numeric;
  v_tier_compression  numeric;
  v_p_home            numeric;
  v_p_draw            numeric;
  v_p_away            numeric;
  v_cal_correction    numeric;
  v_confidence        numeric;
  v_confidence_tier   text;

  -- evaluation
  v_actual_result     text;
  v_home_score        integer;
  v_away_score        integer;
  v_outcome_home      numeric;
  v_outcome_draw      numeric;
  v_outcome_away      numeric;
  v_brier             numeric;
  v_logloss           numeric;
  v_rps               numeric;
  v_cal_error         numeric;
  v_was_correct       boolean;
  v_was_overconf      boolean;
  v_was_upset         boolean;
  v_pred_rank         smallint;
  v_max_p             numeric;
  v_pred_result       text;

  -- rolling L50 accumulators
  v_l50_brier_sum     numeric;
  v_l50_logloss_sum   numeric;
  v_l50_corr_sum      integer;
  v_l50_h_act_sum     integer;
  v_l50_d_act_sum     integer;
  v_l50_a_act_sum     integer;
  v_l50_h_pred_sum    numeric;
  v_l50_d_pred_sum    numeric;
  v_l50_a_pred_sum    numeric;
  v_l50_fav_corr      integer;
  v_l50_fav_total     integer;
  v_l50_upset_miss    integer;
  v_l50_n             integer;

  -- existing prediction id
  v_pred_id           uuid;

BEGIN
  -- ── 1. Create or resume run record ─────────────────────────────────────────
  SELECT id INTO v_run_id
  FROM model_lab.replay_prediction_runs
  WHERE run_key = p_run_key;

  IF v_run_id IS NULL THEN
    INSERT INTO model_lab.replay_prediction_runs (
      run_key, model_version, feature_version, elo_version, prediction_formula,
      scope_competition, status, started_at
    ) VALUES (
      p_run_key, c_model_version, c_feature_version, c_elo_version, c_formula,
      p_competition_name, 'running', now()
    )
    RETURNING id INTO v_run_id;
  ELSE
    -- Reset to running if previously failed
    UPDATE model_lab.replay_prediction_runs
    SET status = 'running', started_at = now(), completed_at = null
    WHERE id = v_run_id;
  END IF;

  -- ── 2. Load existing calibration state ─────────────────────────────────────
  SELECT
    matches_evaluated, current_home_correction,
    rolling_brier_l50, rolling_logloss_l50, rolling_accuracy_l50,
    home_bias_l50, draw_bias_l50, away_bias_l50,
    favorite_bias_l50, upset_miss_rate_l50
  INTO
    v_matches_eval, v_home_correction,
    v_rolling_brier, v_rolling_logloss, v_rolling_accuracy,
    v_home_bias, v_draw_bias, v_away_bias,
    v_fav_bias, v_upset_miss_rate
  FROM model_lab.league_calibration_state
  WHERE competition_name = p_competition_name
    AND model_version = c_model_version
    AND elo_version = c_elo_version;

  IF NOT FOUND THEN
    v_matches_eval    := 0;
    v_home_correction := 0.0;
  END IF;

  -- ── 3. Count total matches ──────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_total
  FROM model_lab.match_feature_matrix_v2 f
  WHERE f.competition_name = p_competition_name
    AND f.season_label      = p_season_label
    AND f.elo_version        = c_elo_version;

  UPDATE model_lab.replay_prediction_runs
  SET total_matches = v_total
  WHERE id = v_run_id;

  -- ── 4. Iterate matches chronologically ─────────────────────────────────────
  FOR v_match IN
    SELECT
      f.match_id,
      f.match_date,
      f.pre_match_elo_home,
      f.pre_match_elo_away,
      f.elo_gap_home,
      f.recent_form_points_home_l5,
      f.recent_form_points_away_l5,
      f.form_gap_home,
      f.attack_gap_home,
      f.defense_gap_home,
      f.home_l5_matches_available,
      f.away_l5_matches_available,
      f.has_form_features,
      f.feature_quality_tier,
      f.result_1x2,
      f.home_score_ft,
      f.away_score_ft,
      m.match_time,
      m.id AS matches_pk
    FROM model_lab.match_feature_matrix_v2 f
    JOIN public.matches m ON m.id = f.match_id
    WHERE f.competition_name = p_competition_name
      AND f.season_label      = p_season_label
      AND f.elo_version        = c_elo_version
    ORDER BY f.match_date, f.match_id
  LOOP
    v_total := v_total; -- already set

    BEGIN
      -- ── 4a. Construct kickoff_utc ─────────────────────────────────────────
      IF v_match.match_time IS NOT NULL THEN
        v_kickoff_utc        := (v_match.match_date::text || ' ' || v_match.match_time::text)::timestamptz AT TIME ZONE 'UTC';
        v_kickoff_constructed := false;
      ELSE
        -- Fallback: 22:00 UTC (safe pre-match for any European fixture)
        v_kickoff_utc        := (v_match.match_date::text || ' ' || c_fallback_time::text)::timestamptz AT TIME ZONE 'UTC';
        v_kickoff_constructed := true;
      END IF;
      v_sim_ts := v_kickoff_utc - interval '2 hours';

      -- ── 4b. COVID era check ───────────────────────────────────────────────
      v_is_covid := (v_match.match_date >= c_covid_start AND v_match.match_date <= c_covid_end);

      -- ── 4c. Extract features ──────────────────────────────────────────────
      v_elo_home    := v_match.pre_match_elo_home;
      v_elo_away    := v_match.pre_match_elo_away;
      v_elo_gap     := v_match.elo_gap_home;
      v_form_gap    := COALESCE(v_match.form_gap_home, 0.0);
      v_attack_gap  := COALESCE(v_match.attack_gap_home, 0.0);
      v_defense_gap := COALESCE(v_match.defense_gap_home, 0.0);
      v_home_l5_avail := COALESCE(v_match.home_l5_matches_available, 0);
      v_away_l5_avail := COALESCE(v_match.away_l5_matches_available, 0);
      v_tier        := COALESCE(v_match.feature_quality_tier, 'elo_only');

      -- ── 4d. Base ELO probabilities (logistic, 400-point scale) ───────────
      -- P(home wins) from ELO gap using Bradley-Terry
      v_elo_win_p := 1.0 / (1.0 + power(10.0, -v_elo_gap / 400.0));

      -- ── 4e. Draw heuristic ────────────────────────────────────────────────
      -- Draw probability increases as ELO gap narrows toward 0
      v_elo_closeness := 1.0 - ABS(v_elo_gap) / 400.0;
      v_elo_closeness := GREATEST(0.0, LEAST(1.0, v_elo_closeness));
      v_draw_p := c_base_draw + c_draw_sensitivity * v_elo_closeness;
      -- Cap draw probability
      v_draw_p := LEAST(v_draw_p, 0.38);

      -- ── 4f. Raw home/away split from remaining probability ────────────────
      v_raw_p_home := v_elo_win_p * (1.0 - v_draw_p);
      v_raw_p_away := (1.0 - v_elo_win_p) * (1.0 - v_draw_p);

      -- ── 4g. Form gap modifier (only when form features available) ─────────
      v_form_modifier := 0.0;
      IF v_match.has_form_features AND v_home_l5_avail >= 3 AND v_away_l5_avail >= 3 THEN
        -- Form gap: positive = home team has better recent form
        -- Modest modifier: ±0.03 max from form alone
        v_form_modifier := GREATEST(-0.03, LEAST(0.03, v_form_gap * 0.008));
      END IF;
      v_raw_p_home := v_raw_p_home + v_form_modifier;
      v_raw_p_away := v_raw_p_away - v_form_modifier;

      -- ── 4h. Feature quality compression ──────────────────────────────────
      -- Tier compression: elo_only → compress toward 0.333 (max uncertainty)
      -- elo_form → light compression, elo_form_stats → full confidence
      v_tier_compression := CASE v_tier
        WHEN 'elo_form_stats' THEN 1.00
        WHEN 'elo_form'       THEN 0.90
        WHEN 'elo_only'       THEN 0.75
        ELSE                       0.65
      END;

      -- Compress all three toward equal (0.333) by tier factor
      v_p_home := 0.333 + (v_raw_p_home - 0.333) * v_tier_compression;
      v_p_draw := 0.333 + (v_draw_p      - 0.333) * v_tier_compression;
      v_p_away := 0.333 + (v_raw_p_away  - 0.333) * v_tier_compression;

      -- ── 4i. Apply league calibration correction (home bias) ───────────────
      v_cal_correction := v_home_correction;  -- read from rolling state
      IF NOT v_is_covid AND v_matches_eval >= 10 THEN
        -- Only apply correction after 10 matches of warm-up
        v_p_home := v_p_home - v_cal_correction * c_cal_damping;
        v_p_away := v_p_away + v_cal_correction * c_cal_damping;
      END IF;

      -- ── 4j. Renormalize to sum = 1 ────────────────────────────────────────
      DECLARE
        v_total_p numeric;
      BEGIN
        -- Ensure no negative probabilities
        v_p_home := GREATEST(0.02, v_p_home);
        v_p_draw := GREATEST(0.02, v_p_draw);
        v_p_away := GREATEST(0.02, v_p_away);

        v_total_p := v_p_home + v_p_draw + v_p_away;
        v_p_home  := ROUND(v_p_home / v_total_p, 6);
        v_p_draw  := ROUND(v_p_draw / v_total_p, 6);
        -- Away gets remainder to ensure exact sum=1
        v_p_away  := ROUND(1.0 - v_p_home - v_p_draw, 6);
        v_p_away  := GREATEST(0.02, v_p_away);
        -- Final renorm if away adjustment pushed sum off
        v_total_p := v_p_home + v_p_draw + v_p_away;
        v_p_home  := ROUND(v_p_home / v_total_p, 6);
        v_p_draw  := ROUND(v_p_draw / v_total_p, 6);
        v_p_away  := ROUND(1.0 - v_p_home - v_p_draw, 6);
      END;

      -- ── 4k. Confidence score ──────────────────────────────────────────────
      v_max_p := GREATEST(v_p_home, v_p_draw, v_p_away);
      v_confidence := v_max_p;
      v_confidence_tier := CASE
        WHEN v_confidence >= 0.55 THEN 'high'
        WHEN v_confidence >= 0.45 THEN 'medium'
        ELSE 'low'
      END;

      -- ── 4l. Calibration context ───────────────────────────────────────────
      -- (used for labelling only; freeze logic already handled above)

      -- ── 4m. Insert prediction ─────────────────────────────────────────────
      INSERT INTO model_lab.replay_match_predictions (
        run_id, match_id, competition_name, season_label, match_date,
        kickoff_utc, kickoff_utc_constructed, simulated_prediction_ts,
        model_version, feature_version, elo_version, prediction_formula,
        pre_match_elo_home, pre_match_elo_away, elo_gap_home,
        raw_p_home_elo, raw_p_away_elo,
        league_rolling_brier_l50, league_home_bias_l50, league_cal_correction,
        form_gap_home, attack_gap_home, defense_gap_home,
        home_l5_matches_available, away_l5_matches_available,
        feature_quality_tier,
        p_home, p_draw, p_away,
        confidence_score, confidence_tier,
        calibration_context
      ) VALUES (
        v_run_id, v_match.match_id, p_competition_name, p_season_label, v_match.match_date,
        v_kickoff_utc, v_kickoff_constructed, v_sim_ts,
        c_model_version, c_feature_version, c_elo_version, c_formula,
        v_elo_home, v_elo_away, v_elo_gap,
        v_raw_p_home, v_raw_p_away,
        v_rolling_brier, v_home_bias, v_cal_correction,
        v_form_gap, v_attack_gap, v_defense_gap,
        v_home_l5_avail, v_away_l5_avail,
        v_tier,
        v_p_home, v_p_draw, v_p_away,
        v_confidence, v_confidence_tier,
        CASE WHEN v_is_covid THEN 'covid_era' ELSE 'normal' END
      )
      ON CONFLICT (run_id, match_id) DO UPDATE
        SET p_home = EXCLUDED.p_home,
            p_draw = EXCLUDED.p_draw,
            p_away = EXCLUDED.p_away,
            generated_at = now()
      RETURNING id INTO v_pred_id;

      -- ── 4n. Evaluate against actual result ────────────────────────────────
      v_actual_result := v_match.result_1x2;  -- 'H', 'D', 'A'
      v_home_score    := v_match.home_score_ft;
      v_away_score    := v_match.away_score_ft;

      IF v_actual_result IS NOT NULL THEN
        -- Outcome vectors
        v_outcome_home := CASE v_actual_result WHEN 'H' THEN 1.0 ELSE 0.0 END;
        v_outcome_draw := CASE v_actual_result WHEN 'D' THEN 1.0 ELSE 0.0 END;
        v_outcome_away := CASE v_actual_result WHEN 'A' THEN 1.0 ELSE 0.0 END;

        -- Multi-class Brier score
        v_brier := (
          power(v_p_home - v_outcome_home, 2) +
          power(v_p_draw - v_outcome_draw, 2) +
          power(v_p_away - v_outcome_away, 2)
        ) / 2.0;

        -- Log loss (clip probabilities to avoid log(0))
        v_logloss := -(
          v_outcome_home * ln(GREATEST(v_p_home, 0.001)) +
          v_outcome_draw * ln(GREATEST(v_p_draw, 0.001)) +
          v_outcome_away * ln(GREATEST(v_p_away, 0.001))
        );

        -- RPS (Ranked Probability Score) — cumulative
        DECLARE
          c1_pred numeric := v_p_home;
          c2_pred numeric := v_p_home + v_p_draw;
          c1_out  numeric := v_outcome_home;
          c2_out  numeric := v_outcome_home + v_outcome_draw;
        BEGIN
          v_rps := (power(c1_pred - c1_out, 2) + power(c2_pred - c2_out, 2)) / 2.0;
        END;

        -- Calibration error: predicted P(actual outcome) vs expected
        v_cal_error := CASE v_actual_result
          WHEN 'H' THEN v_p_home - 1.0
          WHEN 'D' THEN v_p_draw - 1.0
          WHEN 'A' THEN v_p_away - 1.0
        END;

        -- Was correct?
        v_pred_result := CASE
          WHEN v_p_home >= v_p_draw AND v_p_home >= v_p_away THEN 'H'
          WHEN v_p_draw >= v_p_home AND v_p_draw >= v_p_away THEN 'D'
          ELSE 'A'
        END;
        v_was_correct := (v_pred_result = v_actual_result);

        -- Was overconfident? (predicted > threshold but wrong)
        v_was_overconf := (v_max_p >= c_overconf_thresh AND NOT v_was_correct);

        -- Was upset? (away win when home strongly favored or draw when both extreme)
        v_was_upset := (
          v_actual_result = 'A' AND v_p_home >= 0.55
        ) OR (
          v_actual_result = 'H' AND v_p_away >= 0.55
        );

        -- Prediction rank (1=correct, 2=second, 3=wrong)
        v_pred_rank := CASE
          WHEN v_pred_result = v_actual_result THEN 1
          WHEN (v_actual_result = 'H' AND v_p_home >= v_p_away) OR
               (v_actual_result = 'A' AND v_p_away >= v_p_home) OR
               (v_actual_result = 'D' AND v_p_draw >= 0.25) THEN 2
          ELSE 3
        END;

        -- Insert evaluation
        INSERT INTO model_lab.replay_match_evaluations (
          prediction_id, run_id, match_id, competition_name, season_label,
          actual_result, home_score_ft, away_score_ft,
          p_home, p_draw, p_away,
          brier_score, log_loss, calibration_error, rps_score,
          was_correct, was_overconfident, was_upset, prediction_rank
        ) VALUES (
          v_pred_id, v_run_id, v_match.match_id, p_competition_name, p_season_label,
          v_actual_result, v_home_score, v_away_score,
          v_p_home, v_p_draw, v_p_away,
          v_brier, v_logloss, v_cal_error, v_rps,
          v_was_correct, v_was_overconf, v_was_upset, v_pred_rank
        )
        ON CONFLICT (prediction_id) DO UPDATE
          SET brier_score = EXCLUDED.brier_score,
              log_loss    = EXCLUDED.log_loss,
              rps_score   = EXCLUDED.rps_score,
              was_correct = EXCLUDED.was_correct,
              evaluated_at = now();

        -- ── 4o. Update rolling L50 calibration ───────────────────────────────
        -- Only update calibration state if NOT in COVID era
        IF NOT v_is_covid THEN
          v_matches_eval := v_matches_eval + 1;

          -- Compute rolling L50 window from last 50 non-covid evaluations
          SELECT
            COUNT(*)                                                    AS n,
            AVG(e.brier_score)                                          AS avg_brier,
            AVG(e.log_loss)                                             AS avg_ll,
            AVG(CASE WHEN e.was_correct THEN 1.0 ELSE 0.0 END)         AS avg_acc,
            AVG(CASE WHEN e.actual_result = 'H' THEN 1.0 ELSE 0.0 END) - AVG(p.p_home)  AS h_bias,
            AVG(CASE WHEN e.actual_result = 'D' THEN 1.0 ELSE 0.0 END) - AVG(p.p_draw)  AS d_bias,
            AVG(CASE WHEN e.actual_result = 'A' THEN 1.0 ELSE 0.0 END) - AVG(p.p_away)  AS a_bias,
            AVG(CASE WHEN (e.actual_result='H' AND p.p_home>=p.p_draw AND p.p_home>=p.p_away)
                      OR  (e.actual_result='A' AND p.p_away>=p.p_home AND p.p_away>=p.p_draw)
                      THEN 1.0 ELSE 0.0 END)                           AS fav_acc,
            AVG(CASE WHEN e.was_upset THEN 1.0 ELSE 0.0 END)           AS upset_miss
          INTO
            v_l50_n,
            v_rolling_brier, v_rolling_logloss, v_rolling_accuracy,
            v_home_bias, v_draw_bias, v_away_bias,
            v_fav_bias, v_upset_miss_rate
          FROM (
            SELECT e2.prediction_id, e2.brier_score, e2.log_loss,
                   e2.was_correct, e2.actual_result, e2.was_upset
            FROM model_lab.replay_match_evaluations e2
            JOIN model_lab.replay_match_predictions p2 ON p2.id = e2.prediction_id
            WHERE e2.run_id = v_run_id
              AND p2.calibration_context = 'normal'
            ORDER BY e2.evaluated_at DESC
            LIMIT c_l50
          ) e
          JOIN model_lab.replay_match_predictions p ON p.id = e.prediction_id;

          -- Update home_correction: home_bias_l50 = actual_home_rate - predicted_home_rate
          -- Positive home_bias means we're under-predicting home wins → increase home prob
          -- We store correction to SUBTRACT from home (to reduce over-prediction)
          -- Convention: correction = -(home_bias) so apply correction reduces over-prediction
          IF v_l50_n >= 10 THEN
            v_home_correction := -COALESCE(v_home_bias, 0.0);
          END IF;

          -- Upsert calibration state
          INSERT INTO model_lab.league_calibration_state (
            competition_name, model_version, elo_version,
            l50_window_size, matches_evaluated, last_match_id, last_match_date,
            rolling_brier_l50, rolling_logloss_l50, rolling_accuracy_l50,
            home_bias_l50, draw_bias_l50, away_bias_l50,
            favorite_bias_l50, upset_miss_rate_l50,
            current_home_correction, updated_at
          ) VALUES (
            p_competition_name, c_model_version, c_elo_version,
            c_l50, v_matches_eval, v_match.match_id, v_match.match_date,
            v_rolling_brier, v_rolling_logloss, v_rolling_accuracy,
            v_home_bias, v_draw_bias, v_away_bias,
            v_fav_bias, v_upset_miss_rate,
            v_home_correction, now()
          )
          ON CONFLICT (competition_name, model_version, elo_version)
          DO UPDATE SET
            matches_evaluated  = EXCLUDED.matches_evaluated,
            last_match_id      = EXCLUDED.last_match_id,
            last_match_date    = EXCLUDED.last_match_date,
            rolling_brier_l50  = EXCLUDED.rolling_brier_l50,
            rolling_logloss_l50 = EXCLUDED.rolling_logloss_l50,
            rolling_accuracy_l50 = EXCLUDED.rolling_accuracy_l50,
            home_bias_l50      = EXCLUDED.home_bias_l50,
            draw_bias_l50      = EXCLUDED.draw_bias_l50,
            away_bias_l50      = EXCLUDED.away_bias_l50,
            favorite_bias_l50  = EXCLUDED.favorite_bias_l50,
            upset_miss_rate_l50 = EXCLUDED.upset_miss_rate_l50,
            current_home_correction = EXCLUDED.current_home_correction,
            updated_at         = EXCLUDED.updated_at;

          -- Append calibration event (snapshot for this match)
          INSERT INTO model_lab.league_calibration_events (
            competition_name, model_version, elo_version,
            match_id, match_date, season_label,
            matches_evaluated,
            rolling_brier_l50, rolling_logloss_l50, rolling_accuracy_l50,
            home_bias_l50, draw_bias_l50, away_bias_l50,
            favorite_bias_l50, upset_miss_rate_l50,
            home_correction_applied,
            p_home, p_draw, p_away, actual_result, brier_score
          ) VALUES (
            p_competition_name, c_model_version, c_elo_version,
            v_match.match_id, v_match.match_date, p_season_label,
            v_matches_eval,
            v_rolling_brier, v_rolling_logloss, v_rolling_accuracy,
            v_home_bias, v_draw_bias, v_away_bias,
            v_fav_bias, v_upset_miss_rate,
            v_cal_correction,
            v_p_home, v_p_draw, v_p_away, v_actual_result, v_brier
          );
        ELSE
          -- COVID era: still append event but with frozen correction
          INSERT INTO model_lab.league_calibration_events (
            competition_name, model_version, elo_version,
            match_id, match_date, season_label,
            matches_evaluated,
            rolling_brier_l50, rolling_logloss_l50, rolling_accuracy_l50,
            home_bias_l50, draw_bias_l50, away_bias_l50,
            favorite_bias_l50, upset_miss_rate_l50,
            home_correction_applied,
            p_home, p_draw, p_away, actual_result, brier_score
          ) VALUES (
            p_competition_name, c_model_version, c_elo_version,
            v_match.match_id, v_match.match_date, p_season_label,
            v_matches_eval,  -- frozen count
            v_rolling_brier, v_rolling_logloss, v_rolling_accuracy,
            v_home_bias, v_draw_bias, v_away_bias,
            v_fav_bias, v_upset_miss_rate,
            v_home_correction,  -- frozen correction
            v_p_home, v_p_draw, v_p_away, v_actual_result, v_brier
          );
        END IF;
      END IF;

      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      -- Continue processing remaining matches
    END;

  END LOOP;

  -- ── 5. Finalize run ─────────────────────────────────────────────────────────
  UPDATE model_lab.replay_prediction_runs
  SET
    status            = CASE WHEN v_failed = 0 THEN 'completed' ELSE 'completed_with_errors' END,
    processed_matches = v_processed,
    failed_matches    = v_failed,
    completed_at      = now()
  WHERE id = v_run_id;

  RETURN QUERY SELECT v_run_id, v_total, v_processed, v_failed,
    CASE WHEN v_failed = 0 THEN 'completed' ELSE 'completed_with_errors' END;
END;
$$;

-- Ensure unique constraint on league_calibration_state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'league_calibration_state_competition_model_elo_key'
  ) THEN
    ALTER TABLE model_lab.league_calibration_state
      ADD CONSTRAINT league_calibration_state_competition_model_elo_key
      UNIQUE (competition_name, model_version, elo_version);
  END IF;
END $$;

-- Ensure unique constraint on replay_match_predictions (run_id, match_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'replay_match_predictions_run_match_key'
  ) THEN
    ALTER TABLE model_lab.replay_match_predictions
      ADD CONSTRAINT replay_match_predictions_run_match_key
      UNIQUE (run_id, match_id);
  END IF;
END $$;

-- Ensure unique constraint on replay_match_evaluations (prediction_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'replay_match_evaluations_prediction_id_key'
  ) THEN
    ALTER TABLE model_lab.replay_match_evaluations
      ADD CONSTRAINT replay_match_evaluations_prediction_id_key
      UNIQUE (prediction_id);
  END IF;
END $$;

-- Grant execute to authenticated (admin RLS enforced at table level)
GRANT EXECUTE ON FUNCTION model_lab.ml_replay_competition_season_v1(text, text, text)
  TO authenticated;

COMMENT ON FUNCTION model_lab.ml_replay_competition_season_v1 IS
  'Replay historical pre-match predictions for one competition-season. Admin/model_lab only. Safe pilot version.';
