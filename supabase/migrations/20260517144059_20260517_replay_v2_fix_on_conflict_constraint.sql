/*
  # Fix ml_replay_competition_season_v2 ON CONFLICT clause

  The replay_match_predictions table has two UNIQUE constraints on (run_id, match_id):
    - replay_match_predictions_run_id_match_id_key
    - replay_match_predictions_run_match_key

  PostgreSQL raises an error when ON CONFLICT (col, col) is used and two identical
  UNIQUE constraints exist. Fix: use ON CONFLICT ON CONSTRAINT with the canonical name,
  and drop the duplicate constraint to prevent future ambiguity.

  Also fixes replay_match_evaluations which has the same issue (prediction_id unique
  referenced by ON CONFLICT (prediction_id) — single constraint, OK, but named explicitly
  for clarity).
*/

-- Drop the duplicate constraint (keep run_id_match_id_key, drop run_match_key)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'model_lab'
      AND table_name = 'replay_match_predictions'
      AND constraint_name = 'replay_match_predictions_run_match_key'
  ) THEN
    ALTER TABLE model_lab.replay_match_predictions
      DROP CONSTRAINT replay_match_predictions_run_match_key;
  END IF;
END $$;

-- Re-create v2 with explicit ON CONSTRAINT references
CREATE OR REPLACE FUNCTION model_lab.ml_replay_competition_season_v2(
  p_run_key          text,
  p_competition_name text,
  p_season_label     text
)
RETURNS TABLE(run_id uuid, total_matches integer, processed_matches integer,
              failed_matches integer, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public, extensions
AS $$
DECLARE
  c_elo_version       constant text    := 'elo_v2_ha0_k20_global';
  c_feature_version   constant text    := 'features_v2_domestic_2026_05';
  c_model_version     constant text    := 'prediction_v1';
  c_formula           constant text    := 'formula_v2_draw_recalibrated';
  c_draw_sensitivity  constant numeric := 0.08;
  c_draw_min          constant numeric := 0.10;
  c_draw_max          constant numeric := 0.32;
  c_cal_damping       constant numeric := 0.50;
  c_overconf_thresh   constant numeric := 0.70;
  c_l50               constant integer := 50;
  c_covid_start       constant date    := '2020-03-01';
  c_covid_end         constant date    := '2021-08-31';

  v_run_id            uuid;
  v_total             integer := 0;
  v_processed         integer := 0;
  v_failed            integer := 0;

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

  v_league_draw_prior numeric := 0.250;

  v_match             record;
  v_kickoff_utc       timestamptz;
  v_kickoff_constructed boolean;
  v_sim_ts            timestamptz;
  v_is_covid          boolean;

  v_elo_home          numeric;
  v_elo_away          numeric;
  v_elo_gap           numeric;
  v_form_gap          numeric;
  v_attack_gap        numeric;
  v_defense_gap       numeric;
  v_home_l5_avail     smallint;
  v_away_l5_avail     smallint;
  v_tier              text;

  v_raw_p_home        numeric;
  v_raw_p_away        numeric;
  v_elo_win_p         numeric;
  v_draw_p            numeric;
  v_closeness         numeric;
  v_draw_raw          numeric;
  v_form_modifier     numeric;
  v_tier_compression  numeric;
  v_p_home            numeric;
  v_p_draw            numeric;
  v_p_away            numeric;
  v_total_p           numeric;
  v_cal_correction    numeric;
  v_confidence        numeric;
  v_confidence_tier   text;

  v_actual_result     text;
  v_home_score        integer;
  v_away_score        integer;
  v_outcome_home      numeric;
  v_outcome_draw      numeric;
  v_outcome_away      numeric;
  v_brier             numeric;
  v_logloss           numeric;
  v_rps               numeric;
  v_c1_pred           numeric;
  v_c2_pred           numeric;
  v_c1_out            numeric;
  v_c2_out            numeric;
  v_cal_error         numeric;
  v_was_correct       boolean;
  v_was_overconf      boolean;
  v_was_upset         boolean;
  v_pred_rank         smallint;
  v_max_p             numeric;
  v_pred_result       text;
  v_l50_n             integer;

  v_pred_id           uuid;

BEGIN
  -- 1. Create or resume run record
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
    UPDATE model_lab.replay_prediction_runs
    SET status = 'running', started_at = now(), completed_at = null
    WHERE id = v_run_id;
  END IF;

  -- 2. Load league-specific draw prior
  SELECT overall_draw_rate INTO v_league_draw_prior
  FROM model_lab.league_draw_priors
  WHERE competition_name = p_competition_name;

  IF v_league_draw_prior IS NULL THEN
    v_league_draw_prior := 0.250;
  END IF;

  -- 3. Load existing calibration state
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
    AND elo_version   = c_elo_version;

  IF NOT FOUND THEN
    v_matches_eval    := 0;
    v_home_correction := 0.0;
  END IF;

  -- 4. Count total matches
  SELECT COUNT(*) INTO v_total
  FROM model_lab.match_feature_matrix_v2 f
  WHERE f.competition_name = p_competition_name
    AND f.season_label      = p_season_label
    AND f.elo_version        = c_elo_version;

  UPDATE model_lab.replay_prediction_runs
  SET total_matches = v_total
  WHERE id = v_run_id;

  -- 5. Iterate matches chronologically
  FOR v_match IN
    SELECT
      f.match_id,
      f.match_date,
      f.pre_match_elo_home,
      f.pre_match_elo_away,
      f.elo_gap_home,
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
      m.match_time
    FROM model_lab.match_feature_matrix_v2 f
    JOIN public.matches m ON m.id = f.match_id
    WHERE f.competition_name = p_competition_name
      AND f.season_label      = p_season_label
      AND f.elo_version        = c_elo_version
    ORDER BY f.match_date, f.match_id
  LOOP
  BEGIN
    IF v_match.match_time IS NOT NULL THEN
      v_kickoff_utc         := (v_match.match_date::text || ' ' || v_match.match_time::text)::timestamptz AT TIME ZONE 'UTC';
      v_kickoff_constructed := false;
    ELSE
      v_kickoff_utc         := (v_match.match_date::text || ' 22:00:00')::timestamptz AT TIME ZONE 'UTC';
      v_kickoff_constructed := true;
    END IF;
    v_sim_ts := v_kickoff_utc - interval '2 hours';

    v_is_covid := (v_match.match_date >= c_covid_start AND v_match.match_date <= c_covid_end);

    v_elo_home    := v_match.pre_match_elo_home;
    v_elo_away    := v_match.pre_match_elo_away;
    v_elo_gap     := v_match.elo_gap_home;
    v_form_gap    := COALESCE(v_match.form_gap_home, 0.0);
    v_attack_gap  := COALESCE(v_match.attack_gap_home, 0.0);
    v_defense_gap := COALESCE(v_match.defense_gap_home, 0.0);
    v_home_l5_avail := COALESCE(v_match.home_l5_matches_available, 0);
    v_away_l5_avail := COALESCE(v_match.away_l5_matches_available, 0);
    v_tier        := COALESCE(v_match.feature_quality_tier, 'elo_only');

    -- Bradley-Terry ELO win probability
    v_elo_win_p := 1.0 / (1.0 + power(10.0, -v_elo_gap / 400.0));

    -- V2 draw heuristic: league-specific prior + sensitivity on closeness
    v_closeness := 1.0 - ABS(v_elo_win_p - 0.5) * 2.0;
    v_draw_raw  := v_league_draw_prior + c_draw_sensitivity * (v_closeness - 0.5);
    v_draw_p    := GREATEST(c_draw_min, LEAST(c_draw_max, v_draw_raw));

    v_raw_p_home := v_elo_win_p * (1.0 - v_draw_p);
    v_raw_p_away := (1.0 - v_elo_win_p) * (1.0 - v_draw_p);

    v_form_modifier := 0.0;
    IF v_match.has_form_features AND v_home_l5_avail >= 3 AND v_away_l5_avail >= 3 THEN
      v_form_modifier := GREATEST(-0.03, LEAST(0.03, v_form_gap * 0.008));
    END IF;
    v_raw_p_home := v_raw_p_home + v_form_modifier;
    v_raw_p_away := v_raw_p_away - v_form_modifier;

    v_tier_compression := CASE v_tier
      WHEN 'elo_form_stats' THEN 1.00
      WHEN 'elo_form'       THEN 0.90
      WHEN 'elo_only'       THEN 0.75
      ELSE                       0.65
    END;
    v_p_home := 0.333 + (v_raw_p_home - 0.333) * v_tier_compression;
    v_p_draw := 0.333 + (v_draw_p      - 0.333) * v_tier_compression;
    v_p_away := 0.333 + (v_raw_p_away  - 0.333) * v_tier_compression;

    v_cal_correction := v_home_correction;
    IF NOT v_is_covid AND v_matches_eval >= 10 THEN
      v_p_home := v_p_home - v_cal_correction * c_cal_damping;
      v_p_away := v_p_away + v_cal_correction * c_cal_damping;
    END IF;

    v_p_home := GREATEST(0.02, v_p_home);
    v_p_draw := GREATEST(0.02, v_p_draw);
    v_p_away := GREATEST(0.02, v_p_away);
    v_total_p := v_p_home + v_p_draw + v_p_away;
    v_p_home  := ROUND(v_p_home / v_total_p, 6);
    v_p_draw  := ROUND(v_p_draw / v_total_p, 6);
    v_p_away  := ROUND(1.0 - v_p_home - v_p_draw, 6);
    v_p_away  := GREATEST(0.02, v_p_away);
    v_total_p := v_p_home + v_p_draw + v_p_away;
    v_p_home  := ROUND(v_p_home / v_total_p, 6);
    v_p_draw  := ROUND(v_p_draw / v_total_p, 6);
    v_p_away  := ROUND(1.0 - v_p_home - v_p_draw, 6);

    v_max_p := GREATEST(v_p_home, v_p_draw, v_p_away);
    v_confidence := v_max_p;
    v_confidence_tier := CASE
      WHEN v_confidence >= 0.55 THEN 'high'
      WHEN v_confidence >= 0.45 THEN 'medium'
      ELSE 'low'
    END;

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
    ON CONFLICT ON CONSTRAINT replay_match_predictions_run_id_match_id_key
    DO UPDATE SET
      p_home = EXCLUDED.p_home,
      p_draw = EXCLUDED.p_draw,
      p_away = EXCLUDED.p_away,
      generated_at = now()
    RETURNING id INTO v_pred_id;

    v_actual_result := v_match.result_1x2;
    v_home_score    := v_match.home_score_ft;
    v_away_score    := v_match.away_score_ft;

    IF v_actual_result IS NOT NULL THEN
      v_outcome_home := CASE v_actual_result WHEN 'H' THEN 1.0 ELSE 0.0 END;
      v_outcome_draw := CASE v_actual_result WHEN 'D' THEN 1.0 ELSE 0.0 END;
      v_outcome_away := CASE v_actual_result WHEN 'A' THEN 1.0 ELSE 0.0 END;

      v_brier := (
        power(v_p_home - v_outcome_home, 2) +
        power(v_p_draw - v_outcome_draw, 2) +
        power(v_p_away - v_outcome_away, 2)
      ) / 2.0;

      v_logloss := -(
        v_outcome_home * ln(GREATEST(v_p_home, 0.001)) +
        v_outcome_draw * ln(GREATEST(v_p_draw, 0.001)) +
        v_outcome_away * ln(GREATEST(v_p_away, 0.001))
      );

      v_c1_pred := v_p_home;
      v_c2_pred := v_p_home + v_p_draw;
      v_c1_out  := v_outcome_home;
      v_c2_out  := v_outcome_home + v_outcome_draw;
      v_rps := (power(v_c1_pred - v_c1_out, 2) + power(v_c2_pred - v_c2_out, 2)) / 2.0;

      v_cal_error := CASE v_actual_result
        WHEN 'H' THEN v_p_home - 1.0
        WHEN 'D' THEN v_p_draw - 1.0
        WHEN 'A' THEN v_p_away - 1.0
      END;

      v_pred_result := CASE
        WHEN v_p_home >= v_p_draw AND v_p_home >= v_p_away THEN 'H'
        WHEN v_p_draw >= v_p_home AND v_p_draw >= v_p_away THEN 'D'
        ELSE 'A'
      END;
      v_was_correct  := (v_pred_result = v_actual_result);
      v_was_overconf := (v_max_p >= c_overconf_thresh AND NOT v_was_correct);
      v_was_upset    := (v_actual_result = 'A' AND v_p_home >= 0.55)
                     OR (v_actual_result = 'H' AND v_p_away >= 0.55);

      v_pred_rank := CASE
        WHEN v_pred_result = v_actual_result THEN 1
        WHEN (v_actual_result = 'H' AND v_p_home >= v_p_away)
          OR (v_actual_result = 'A' AND v_p_away >= v_p_home)
          OR (v_actual_result = 'D' AND v_p_draw >= 0.25) THEN 2
        ELSE 3
      END;

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
      ON CONFLICT ON CONSTRAINT replay_match_evaluations_prediction_id_key
      DO UPDATE SET
        brier_score  = EXCLUDED.brier_score,
        log_loss     = EXCLUDED.log_loss,
        rps_score    = EXCLUDED.rps_score,
        was_correct  = EXCLUDED.was_correct,
        evaluated_at = now();

      IF NOT v_is_covid THEN
        v_matches_eval := v_matches_eval + 1;

        SELECT
          COUNT(*)::integer,
          AVG(e.brier_score),
          AVG(e.log_loss),
          AVG(CASE WHEN e.was_correct THEN 1.0 ELSE 0.0 END),
          AVG(CASE WHEN e.actual_result='H' THEN 1.0 ELSE 0.0 END) - AVG(p2.p_home),
          AVG(CASE WHEN e.actual_result='D' THEN 1.0 ELSE 0.0 END) - AVG(p2.p_draw),
          AVG(CASE WHEN e.actual_result='A' THEN 1.0 ELSE 0.0 END) - AVG(p2.p_away),
          AVG(CASE WHEN (e.actual_result='H' AND p2.p_home>=p2.p_draw AND p2.p_home>=p2.p_away)
               OR  (e.actual_result='A' AND p2.p_away>=p2.p_home AND p2.p_away>=p2.p_draw)
               THEN 1.0 ELSE 0.0 END),
          AVG(CASE WHEN e.was_upset THEN 1.0 ELSE 0.0 END)
        INTO
          v_l50_n, v_rolling_brier, v_rolling_logloss, v_rolling_accuracy,
          v_home_bias, v_draw_bias, v_away_bias, v_fav_bias, v_upset_miss_rate
        FROM (
          SELECT e2.prediction_id, e2.brier_score, e2.log_loss,
                 e2.was_correct, e2.actual_result, e2.was_upset
          FROM model_lab.replay_match_evaluations e2
          JOIN model_lab.replay_match_predictions p3 ON p3.id = e2.prediction_id
          WHERE e2.run_id = v_run_id
            AND p3.calibration_context = 'normal'
          ORDER BY e2.evaluated_at DESC
          LIMIT c_l50
        ) e
        JOIN model_lab.replay_match_predictions p2 ON p2.id = e.prediction_id;

        IF v_l50_n >= 10 THEN
          v_home_correction := -COALESCE(v_home_bias, 0.0);
        END IF;

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
          matches_evaluated    = EXCLUDED.matches_evaluated,
          last_match_id        = EXCLUDED.last_match_id,
          last_match_date      = EXCLUDED.last_match_date,
          rolling_brier_l50    = EXCLUDED.rolling_brier_l50,
          rolling_logloss_l50  = EXCLUDED.rolling_logloss_l50,
          rolling_accuracy_l50 = EXCLUDED.rolling_accuracy_l50,
          home_bias_l50        = EXCLUDED.home_bias_l50,
          draw_bias_l50        = EXCLUDED.draw_bias_l50,
          away_bias_l50        = EXCLUDED.away_bias_l50,
          favorite_bias_l50    = EXCLUDED.favorite_bias_l50,
          upset_miss_rate_l50  = EXCLUDED.upset_miss_rate_l50,
          current_home_correction = EXCLUDED.current_home_correction,
          updated_at           = EXCLUDED.updated_at;

        INSERT INTO model_lab.league_calibration_events (
          competition_name, model_version, elo_version,
          match_id, match_date, season_label, matches_evaluated,
          rolling_brier_l50, rolling_logloss_l50, rolling_accuracy_l50,
          home_bias_l50, draw_bias_l50, away_bias_l50,
          favorite_bias_l50, upset_miss_rate_l50,
          home_correction_applied,
          p_home, p_draw, p_away, actual_result, brier_score
        ) VALUES (
          p_competition_name, c_model_version, c_elo_version,
          v_match.match_id, v_match.match_date, p_season_label, v_matches_eval,
          v_rolling_brier, v_rolling_logloss, v_rolling_accuracy,
          v_home_bias, v_draw_bias, v_away_bias,
          v_fav_bias, v_upset_miss_rate,
          v_cal_correction,
          v_p_home, v_p_draw, v_p_away, v_actual_result, v_brier
        );

      ELSE
        INSERT INTO model_lab.league_calibration_events (
          competition_name, model_version, elo_version,
          match_id, match_date, season_label, matches_evaluated,
          rolling_brier_l50, rolling_logloss_l50, rolling_accuracy_l50,
          home_bias_l50, draw_bias_l50, away_bias_l50,
          favorite_bias_l50, upset_miss_rate_l50,
          home_correction_applied,
          p_home, p_draw, p_away, actual_result, brier_score
        ) VALUES (
          p_competition_name, c_model_version, c_elo_version,
          v_match.match_id, v_match.match_date, p_season_label, v_matches_eval,
          v_rolling_brier, v_rolling_logloss, v_rolling_accuracy,
          v_home_bias, v_draw_bias, v_away_bias,
          v_fav_bias, v_upset_miss_rate,
          v_home_correction,
          v_p_home, v_p_draw, v_p_away, v_actual_result, v_brier
        );
      END IF;
    END IF;

    v_processed := v_processed + 1;

  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
  END;
  END LOOP;

  UPDATE model_lab.replay_prediction_runs
  SET
    status            = CASE WHEN v_failed = 0 THEN 'done' ELSE 'failed' END,
    processed_matches = v_processed,
    failed_matches    = v_failed,
    completed_at      = now()
  WHERE id = v_run_id;

  RETURN QUERY SELECT v_run_id, v_total, v_processed, v_failed,
    CASE WHEN v_failed = 0 THEN 'done' ELSE 'failed' END;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.ml_replay_competition_season_v2(text, text, text) TO authenticated;
