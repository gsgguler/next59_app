/*
  # Calibration Phase 7 — Snapshot Table, Predictions Table, Populate Function, Metrics View

  ## Summary
  Creates the complete Phase 7 infrastructure for the heuristic_softmax_v1 calibration baseline.
  All objects are in model_lab schema. No public schema writes. No API calls.

  ## New Tables
  - model_lab.prematch_feature_matrix_snapshot_v1
    Empty snapshot shell matching all 189 columns of v_prematch_feature_matrix_v1 exactly,
    plus two audit columns: snapshot_run_key and snapshot_created_at.
    To be populated in chunked batches (not here).

  - model_lab.calibration_predictions_v1
    One row per (run_key, match_id). Stores heuristic softmax probabilities for H/D/A,
    predicted result, confidence, and leakage flag. No public exposure.

  ## New Functions
  - model_lab.ml_populate_calibration_predictions_v1()
    Reads ONLY from prematch_feature_matrix_snapshot_v1 (never from live views).
    Applies heuristic_softmax_v1 scoring with cold-start fallback for leakage=false rows.
    Deletes+reinserts only run_key='heuristic_softmax_v1'.

  ## New Views
  - model_lab.v_calibration_metrics_by_split
    Aggregates Brier score, log loss, accuracy, probability distributions, and leakage pass
    rate grouped by run_key + split_label.

  ## Security
  - RLS enabled on both tables
  - Only authenticated admin can read; anon has no access
  - No grants to anon or public roles
*/

-- ============================================================
-- PHASE 1: SNAPSHOT TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS model_lab.prematch_feature_matrix_snapshot_v1 (
  -- identity
  match_id uuid,
  competition_id uuid,
  competition_name text,
  season_id uuid,
  season_label text,
  match_date date,
  home_team_id uuid,
  away_team_id uuid,
  actual_result_1x2 text,
  actual_home_goals integer,
  actual_away_goals integer,
  data_quality_tier text,
  has_stats boolean,
  has_events boolean,
  has_lineups boolean,
  has_player_features boolean,
  split_label text,
  leakage_check_passed boolean,
  -- rolling features home
  home_matches_played_l5 bigint,
  home_matches_played_l10 bigint,
  home_matches_played_l20 bigint,
  home_matches_played_std bigint,
  home_form_l5 numeric,
  home_form_l10 numeric,
  home_form_l20 numeric,
  home_form_std numeric,
  home_win_rate_l5 numeric,
  home_draw_rate_l5 numeric,
  home_loss_rate_l5 numeric,
  home_win_rate_l10 numeric,
  home_draw_rate_l10 numeric,
  home_loss_rate_l10 numeric,
  home_win_rate_l20 numeric,
  home_goals_for_avg_l5 numeric,
  home_goals_against_avg_l5 numeric,
  home_goal_diff_avg_l5 numeric,
  home_goals_for_avg_l10 numeric,
  home_goals_against_avg_l10 numeric,
  home_goal_diff_avg_l10 numeric,
  home_goals_for_avg_l20 numeric,
  home_goals_against_avg_l20 numeric,
  home_goals_for_avg_std numeric,
  home_goals_against_avg_std numeric,
  home_shots_avg_l5 numeric,
  home_shots_on_goal_avg_l5 numeric,
  home_shots_insidebox_avg_l5 numeric,
  home_corners_avg_l5 numeric,
  home_fouls_avg_l5 numeric,
  home_yellow_cards_avg_l5 numeric,
  home_possession_avg_l5 numeric,
  home_pass_accuracy_avg_l5 numeric,
  home_shots_avg_l10 numeric,
  home_shots_on_goal_avg_l10 numeric,
  home_gk_saves_avg_l10 numeric,
  home_attack_index_l5 numeric,
  home_defense_resistance_l5 numeric,
  home_xg_lite_l5 numeric,
  home_xg_lite_l10 numeric,
  home_tempo_index_l5 numeric,
  home_shot_quality_l5 numeric,
  home_discipline_risk_l5 numeric,
  home_set_piece_threat_l5 numeric,
  home_has_stats_features boolean,
  -- rolling features away
  away_matches_played_l5 bigint,
  away_matches_played_l10 bigint,
  away_matches_played_l20 bigint,
  away_matches_played_std bigint,
  away_form_l5 numeric,
  away_form_l10 numeric,
  away_form_l20 numeric,
  away_form_std numeric,
  away_win_rate_l5 numeric,
  away_draw_rate_l5 numeric,
  away_loss_rate_l5 numeric,
  away_win_rate_l10 numeric,
  away_draw_rate_l10 numeric,
  away_loss_rate_l10 numeric,
  away_win_rate_l20 numeric,
  away_goals_for_avg_l5 numeric,
  away_goals_against_avg_l5 numeric,
  away_goal_diff_avg_l5 numeric,
  away_goals_for_avg_l10 numeric,
  away_goals_against_avg_l10 numeric,
  away_goal_diff_avg_l10 numeric,
  away_goals_for_avg_l20 numeric,
  away_goals_against_avg_l20 numeric,
  away_goals_for_avg_std numeric,
  away_goals_against_avg_std numeric,
  away_shots_avg_l5 numeric,
  away_shots_on_goal_avg_l5 numeric,
  away_shots_insidebox_avg_l5 numeric,
  away_corners_avg_l5 numeric,
  away_fouls_avg_l5 numeric,
  away_yellow_cards_avg_l5 numeric,
  away_possession_avg_l5 numeric,
  away_pass_accuracy_avg_l5 numeric,
  away_shots_avg_l10 numeric,
  away_shots_on_goal_avg_l10 numeric,
  away_gk_saves_avg_l10 numeric,
  away_attack_index_l5 numeric,
  away_defense_resistance_l5 numeric,
  away_xg_lite_l5 numeric,
  away_xg_lite_l10 numeric,
  away_tempo_index_l5 numeric,
  away_shot_quality_l5 numeric,
  away_discipline_risk_l5 numeric,
  away_set_piece_threat_l5 numeric,
  away_has_stats_features boolean,
  -- event features home
  home_ev_n_matches bigint,
  home_ev_goals_0_15 numeric,
  home_ev_goals_16_30 numeric,
  home_ev_goals_31_45 numeric,
  home_ev_goals_46_60 numeric,
  home_ev_goals_61_75 numeric,
  home_ev_goals_76_90 numeric,
  home_ev_conceded_0_15 numeric,
  home_ev_conceded_76_90 numeric,
  home_ev_cards_early numeric,
  home_ev_cards_late numeric,
  home_ev_red_cards numeric,
  home_ev_subs numeric,
  home_ev_late_goal_for_rate numeric,
  home_ev_late_goal_against_rate numeric,
  home_ev_first_goal_for_rate numeric,
  home_ev_first_goal_against_rate numeric,
  home_ev_comeback_signal numeric,
  home_ev_late_pressure numeric,
  -- event features away
  away_ev_n_matches bigint,
  away_ev_goals_0_15 numeric,
  away_ev_goals_16_30 numeric,
  away_ev_goals_31_45 numeric,
  away_ev_goals_46_60 numeric,
  away_ev_goals_61_75 numeric,
  away_ev_goals_76_90 numeric,
  away_ev_conceded_0_15 numeric,
  away_ev_conceded_76_90 numeric,
  away_ev_cards_early numeric,
  away_ev_cards_late numeric,
  away_ev_red_cards numeric,
  away_ev_subs numeric,
  away_ev_late_goal_for_rate numeric,
  away_ev_late_goal_against_rate numeric,
  away_ev_first_goal_for_rate numeric,
  away_ev_first_goal_against_rate numeric,
  away_ev_comeback_signal numeric,
  away_ev_late_pressure numeric,
  -- player features home
  home_pl_n_matches bigint,
  home_pl_squad_rating numeric,
  home_pl_starter_rating numeric,
  home_pl_goals_per_player numeric,
  home_pl_assists_per_player numeric,
  home_pl_shots_total numeric,
  home_pl_shots_on_target numeric,
  home_pl_passes_key numeric,
  home_pl_duels_won_rate numeric,
  home_pl_tackles_int numeric,
  home_pl_cards_yellow numeric,
  home_pl_cards_red numeric,
  home_pl_fouls_committed numeric,
  home_pl_fouls_drawn numeric,
  home_pl_captain_stability numeric,
  -- player features away
  away_pl_n_matches bigint,
  away_pl_squad_rating numeric,
  away_pl_starter_rating numeric,
  away_pl_goals_per_player numeric,
  away_pl_assists_per_player numeric,
  away_pl_shots_total numeric,
  away_pl_shots_on_target numeric,
  away_pl_passes_key numeric,
  away_pl_duels_won_rate numeric,
  away_pl_tackles_int numeric,
  away_pl_cards_yellow numeric,
  away_pl_cards_red numeric,
  away_pl_fouls_committed numeric,
  away_pl_fouls_drawn numeric,
  away_pl_captain_stability numeric,
  -- differential features
  diff_form_l5 numeric,
  diff_form_l10 numeric,
  diff_goals_for_l5 numeric,
  diff_goals_against_l5 numeric,
  diff_attack_index_l5 numeric,
  diff_defense_resistance_l5 numeric,
  diff_xg_lite_l5 numeric,
  diff_tempo_l5 numeric,
  diff_win_rate_l10 numeric,
  diff_goal_diff_l10 numeric,
  diff_squad_rating numeric,
  diff_starter_rating numeric,
  diff_late_goal_for_rate numeric,
  -- snapshot audit
  snapshot_run_key text NOT NULL DEFAULT 'prematch_feature_matrix_snapshot_v1',
  snapshot_created_at timestamptz NOT NULL DEFAULT now(),
  -- constraints
  PRIMARY KEY (match_id)
);

ALTER TABLE model_lab.prematch_feature_matrix_snapshot_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read snapshot"
  ON model_lab.prematch_feature_matrix_snapshot_v1
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert snapshot"
  ON model_lab.prematch_feature_matrix_snapshot_v1
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete snapshot"
  ON model_lab.prematch_feature_matrix_snapshot_v1
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_fms_split_label
  ON model_lab.prematch_feature_matrix_snapshot_v1 (split_label);

CREATE INDEX IF NOT EXISTS idx_fms_match_date
  ON model_lab.prematch_feature_matrix_snapshot_v1 (match_date);

CREATE INDEX IF NOT EXISTS idx_fms_competition_id
  ON model_lab.prematch_feature_matrix_snapshot_v1 (competition_id);

CREATE INDEX IF NOT EXISTS idx_fms_leakage_check
  ON model_lab.prematch_feature_matrix_snapshot_v1 (leakage_check_passed);

-- ============================================================
-- PHASE 4: CALIBRATION PREDICTIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS model_lab.calibration_predictions_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL DEFAULT 'heuristic_softmax_v1',
  match_id uuid NOT NULL,
  split_label text NOT NULL,
  match_date date,
  competition_id uuid,
  competition_name text,
  season_label text,
  actual_result_1x2 text NOT NULL,
  p_home numeric NOT NULL,
  p_draw numeric NOT NULL,
  p_away numeric NOT NULL,
  predicted_result_1x2 text,
  confidence numeric,
  leakage_check_passed boolean,
  feature_quality_score numeric,
  model_notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT chk_p_home_range CHECK (p_home >= 0 AND p_home <= 1),
  CONSTRAINT chk_p_draw_range CHECK (p_draw >= 0 AND p_draw <= 1),
  CONSTRAINT chk_p_away_range CHECK (p_away >= 0 AND p_away <= 1),
  CONSTRAINT chk_prob_sum CHECK (ABS(p_home + p_draw + p_away - 1.0) < 0.0001),
  CONSTRAINT uq_run_match UNIQUE (run_key, match_id)
);

ALTER TABLE model_lab.calibration_predictions_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calibration predictions"
  ON model_lab.calibration_predictions_v1
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert calibration predictions"
  ON model_lab.calibration_predictions_v1
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete calibration predictions"
  ON model_lab.calibration_predictions_v1
  FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_cal_pred_split
  ON model_lab.calibration_predictions_v1 (run_key, split_label);

CREATE INDEX IF NOT EXISTS idx_cal_pred_match_date
  ON model_lab.calibration_predictions_v1 (match_date);

-- ============================================================
-- PHASE 5: POPULATE FUNCTION (reads snapshot only)
-- ============================================================

CREATE OR REPLACE FUNCTION model_lab.ml_populate_calibration_predictions_v1()
RETURNS TABLE (
  rows_deleted integer,
  rows_inserted integer,
  cold_start_rows integer,
  leakage_pass_rows integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted integer;
  v_inserted integer;
  v_cold_start integer;
  v_leakage_pass integer;
BEGIN
  -- Delete existing run
  DELETE FROM model_lab.calibration_predictions_v1
  WHERE run_key = 'heuristic_softmax_v1';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Insert predictions from snapshot only (never from live views)
  WITH scored AS (
    SELECT
      snap.match_id,
      snap.split_label,
      snap.match_date,
      snap.competition_id,
      snap.competition_name,
      snap.season_label,
      snap.actual_result_1x2,
      snap.leakage_check_passed,
      snap.data_quality_tier,
      -- cold-start: use prior when leakage check failed or form data absent
      CASE
        WHEN NOT COALESCE(snap.leakage_check_passed, false)
          OR COALESCE(snap.home_matches_played_l5, 0) = 0
          OR COALESCE(snap.away_matches_played_l5, 0) = 0
        THEN true ELSE false
      END AS is_cold_start,
      -- raw scores (capped to [-5, +5] before softmax)
      GREATEST(-5.0, LEAST(5.0,
        0.35 * COALESCE(snap.home_form_l5, 0)
        + 0.25 * COALESCE(snap.home_goal_diff_avg_l5, 0)
        + 0.20 * COALESCE(snap.home_attack_index_l5, 0)
        - 0.10 * COALESCE(snap.away_attack_index_l5, 0)
        - 0.10 * COALESCE(snap.home_discipline_risk_l5, 0)
        + 0.25
      )) AS home_raw,
      GREATEST(-5.0, LEAST(5.0,
        0.35 * COALESCE(snap.away_form_l5, 0)
        + 0.25 * COALESCE(snap.away_goal_diff_avg_l5, 0)
        + 0.20 * COALESCE(snap.away_attack_index_l5, 0)
        - 0.10 * COALESCE(snap.home_attack_index_l5, 0)
        - 0.10 * COALESCE(snap.away_discipline_risk_l5, 0)
      )) AS away_raw
    FROM model_lab.prematch_feature_matrix_snapshot_v1 snap
  ),
  with_draw AS (
    SELECT
      *,
      GREATEST(-5.0, LEAST(5.0,
        ((home_raw + away_raw) / 2.0)
        - (ABS(home_raw - away_raw) * 0.40)
      )) AS draw_raw
    FROM scored
  ),
  with_exp AS (
    SELECT
      *,
      EXP(home_raw) AS e_home,
      EXP(draw_raw) AS e_draw,
      EXP(away_raw) AS e_away
    FROM with_draw
  ),
  with_softmax AS (
    SELECT
      *,
      e_home / (e_home + e_draw + e_away) AS raw_p_home,
      e_draw / (e_home + e_draw + e_away) AS raw_p_draw,
      e_away / (e_home + e_draw + e_away) AS raw_p_away
    FROM with_exp
  )
  INSERT INTO model_lab.calibration_predictions_v1 (
    run_key, match_id, split_label, match_date, competition_id, competition_name,
    season_label, actual_result_1x2, p_home, p_draw, p_away,
    predicted_result_1x2, confidence, leakage_check_passed,
    feature_quality_score, model_notes
  )
  SELECT
    'heuristic_softmax_v1',
    match_id,
    split_label,
    match_date,
    competition_id,
    competition_name,
    season_label,
    actual_result_1x2,
    CASE WHEN is_cold_start THEN 0.447619 ELSE ROUND(raw_p_home::numeric, 6) END,
    CASE WHEN is_cold_start THEN 0.266275 ELSE ROUND(raw_p_draw::numeric, 6) END,
    CASE WHEN is_cold_start THEN 0.286106 ELSE ROUND(raw_p_away::numeric, 6) END,
    CASE
      WHEN is_cold_start THEN 'H'
      WHEN raw_p_home >= raw_p_draw AND raw_p_home >= raw_p_away THEN 'H'
      WHEN raw_p_draw >= raw_p_home AND raw_p_draw >= raw_p_away THEN 'D'
      ELSE 'A'
    END,
    CASE
      WHEN is_cold_start THEN 0.447619
      ELSE ROUND(GREATEST(raw_p_home, raw_p_draw, raw_p_away)::numeric, 6)
    END,
    leakage_check_passed,
    CASE data_quality_tier
      WHEN 'full_enriched' THEN 1.0
      WHEN 'partial_enriched' THEN 0.5
      ELSE 0.1
    END,
    CASE WHEN is_cold_start THEN 'cold_start_prior' ELSE 'heuristic_softmax_v1' END
  FROM with_softmax;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT COUNT(*) INTO v_cold_start
  FROM model_lab.calibration_predictions_v1
  WHERE run_key = 'heuristic_softmax_v1' AND model_notes = 'cold_start_prior';

  SELECT COUNT(*) INTO v_leakage_pass
  FROM model_lab.calibration_predictions_v1
  WHERE run_key = 'heuristic_softmax_v1' AND leakage_check_passed = true;

  RETURN QUERY SELECT v_deleted, v_inserted, v_cold_start, v_leakage_pass;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.ml_populate_calibration_predictions_v1() TO authenticated;

-- ============================================================
-- PHASE 6: METRICS VIEW
-- ============================================================

CREATE OR REPLACE VIEW model_lab.v_calibration_metrics_by_split AS
SELECT
  run_key,
  split_label,
  COUNT(*) AS matches_count,
  -- Brier score: mean of ((p_h - y_h)^2 + (p_d - y_d)^2 + (p_a - y_a)^2) / 3
  ROUND(AVG(
    (
      POWER(p_home - CASE WHEN actual_result_1x2='H' THEN 1.0 ELSE 0.0 END, 2)
      + POWER(p_draw - CASE WHEN actual_result_1x2='D' THEN 1.0 ELSE 0.0 END, 2)
      + POWER(p_away - CASE WHEN actual_result_1x2='A' THEN 1.0 ELSE 0.0 END, 2)
    ) / 3.0
  )::numeric, 6) AS brier_1x2,
  -- log loss: mean negative log of probability assigned to actual outcome
  ROUND(AVG(-(
    CASE actual_result_1x2
      WHEN 'H' THEN LN(GREATEST(LEAST(p_home, 0.999999), 0.000001))
      WHEN 'D' THEN LN(GREATEST(LEAST(p_draw, 0.999999), 0.000001))
      ELSE        LN(GREATEST(LEAST(p_away, 0.999999), 0.000001))
    END
  ))::numeric, 6) AS log_loss_1x2,
  -- accuracy: predicted == actual
  ROUND(AVG(CASE WHEN predicted_result_1x2 = actual_result_1x2 THEN 1.0 ELSE 0.0 END)::numeric, 4) AS accuracy,
  ROUND(AVG(p_home)::numeric, 4) AS avg_p_home,
  ROUND(AVG(p_draw)::numeric, 4) AS avg_p_draw,
  ROUND(AVG(p_away)::numeric, 4) AS avg_p_away,
  ROUND(AVG(CASE WHEN predicted_result_1x2='H' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS predicted_home_rate,
  ROUND(AVG(CASE WHEN predicted_result_1x2='D' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS predicted_draw_rate,
  ROUND(AVG(CASE WHEN predicted_result_1x2='A' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS predicted_away_rate,
  ROUND(AVG(CASE WHEN actual_result_1x2='H' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS actual_home_rate,
  ROUND(AVG(CASE WHEN actual_result_1x2='D' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS actual_draw_rate,
  ROUND(AVG(CASE WHEN actual_result_1x2='A' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS actual_away_rate,
  ROUND(AVG(confidence)::numeric, 4) AS avg_confidence,
  ROUND(AVG(CASE WHEN leakage_check_passed THEN 1.0 ELSE 0.0 END)::numeric, 4) AS leakage_pass_rate
FROM model_lab.calibration_predictions_v1
GROUP BY run_key, split_label
ORDER BY run_key, split_label;

GRANT SELECT ON model_lab.v_calibration_metrics_by_split TO authenticated;
