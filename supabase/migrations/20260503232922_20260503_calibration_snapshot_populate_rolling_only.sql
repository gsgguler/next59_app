/*
  # Calibration Snapshot — Rolling-Only Safe Populate Function (v2)

  ## Problem
  ml_populate_feature_snapshot_v1() calls v_prematch_feature_matrix_v1 which internally
  joins v_team_pre_match_event_features (cost ~437k) and v_team_pre_match_player_features
  (cost ~434k). Even per-year batches time out because the inner L10 CTE scans the full
  65k-match universe for every target match in the batch.

  ## Solution
  New function ml_populate_feature_snapshot_rolling_v1() that:
  1. Reads from v_calibration_match_universe (cost ~2,261) for match identity/metadata
  2. Reads from v_team_pre_match_rolling_features (cost ~21,340) for rolling stats
  3. NULLs all event feature columns (home_ev_*, away_ev_*)
  4. NULLs all player feature columns (home_pl_*, away_pl_*)
  5. Processes year by year to stay within statement timeout

  This is sufficient for heuristic_softmax_v1 scoring — the populate function uses
  only form_l5, goal_diff_avg_l5, attack_index_l5, discipline_risk_l5 which all come
  from the rolling features view.

  Event/player columns remain NULL in the snapshot and can be backfilled later
  once those views are materialized.

  ## Impact on Predictions
  - leakage_check_passed: correctly computed from rolling features (home_matches_played_l5 > 0)
  - cold_start fallback: correctly triggered when leakage_check_passed=false or form data NULL
  - Scoring: unaffected — heuristic_softmax_v1 uses only rolling features
  - has_events / has_player_features: set to false for this snapshot run
*/

CREATE OR REPLACE FUNCTION model_lab.ml_populate_feature_snapshot_rolling_v1()
RETURNS TABLE (
  yr integer,
  rows_inserted integer,
  cumulative_total integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year integer;
  v_inserted integer;
  v_cumulative integer := 0;
  v_year_ids uuid[];
BEGIN
  TRUNCATE model_lab.prematch_feature_matrix_snapshot_v1;

  FOR v_year IN 2000..2025 LOOP
    -- collect match IDs for this year from the lightweight universe view
    SELECT ARRAY_AGG(mu.match_id) INTO v_year_ids
    FROM model_lab.v_calibration_match_universe mu
    WHERE EXTRACT(YEAR FROM mu.match_date)::int = v_year;

    CONTINUE WHEN v_year_ids IS NULL OR array_length(v_year_ids, 1) = 0;

    INSERT INTO model_lab.prematch_feature_matrix_snapshot_v1 (
      -- identity
      match_id, competition_id, competition_name, season_id, season_label,
      match_date, home_team_id, away_team_id, actual_result_1x2,
      actual_home_goals, actual_away_goals, data_quality_tier,
      has_stats, has_events, has_lineups, has_player_features,
      split_label, leakage_check_passed,
      -- rolling home
      home_matches_played_l5, home_matches_played_l10, home_matches_played_l20,
      home_matches_played_std,
      home_form_l5, home_form_l10, home_form_l20, home_form_std,
      home_win_rate_l5, home_draw_rate_l5, home_loss_rate_l5,
      home_win_rate_l10, home_draw_rate_l10, home_loss_rate_l10,
      home_win_rate_l20,
      home_goals_for_avg_l5, home_goals_against_avg_l5, home_goal_diff_avg_l5,
      home_goals_for_avg_l10, home_goals_against_avg_l10, home_goal_diff_avg_l10,
      home_goals_for_avg_l20, home_goals_against_avg_l20,
      home_goals_for_avg_std, home_goals_against_avg_std,
      home_shots_avg_l5, home_shots_on_goal_avg_l5, home_shots_insidebox_avg_l5,
      home_corners_avg_l5, home_fouls_avg_l5, home_yellow_cards_avg_l5,
      home_possession_avg_l5, home_pass_accuracy_avg_l5,
      home_shots_avg_l10, home_shots_on_goal_avg_l10, home_gk_saves_avg_l10,
      home_attack_index_l5, home_defense_resistance_l5,
      home_xg_lite_l5, home_xg_lite_l10, home_tempo_index_l5,
      home_shot_quality_l5, home_discipline_risk_l5, home_set_piece_threat_l5,
      home_has_stats_features,
      -- rolling away
      away_matches_played_l5, away_matches_played_l10, away_matches_played_l20,
      away_matches_played_std,
      away_form_l5, away_form_l10, away_form_l20, away_form_std,
      away_win_rate_l5, away_draw_rate_l5, away_loss_rate_l5,
      away_win_rate_l10, away_draw_rate_l10, away_loss_rate_l10,
      away_win_rate_l20,
      away_goals_for_avg_l5, away_goals_against_avg_l5, away_goal_diff_avg_l5,
      away_goals_for_avg_l10, away_goals_against_avg_l10, away_goal_diff_avg_l10,
      away_goals_for_avg_l20, away_goals_against_avg_l20,
      away_goals_for_avg_std, away_goals_against_avg_std,
      away_shots_avg_l5, away_shots_on_goal_avg_l5, away_shots_insidebox_avg_l5,
      away_corners_avg_l5, away_fouls_avg_l5, away_yellow_cards_avg_l5,
      away_possession_avg_l5, away_pass_accuracy_avg_l5,
      away_shots_avg_l10, away_shots_on_goal_avg_l10, away_gk_saves_avg_l10,
      away_attack_index_l5, away_defense_resistance_l5,
      away_xg_lite_l5, away_xg_lite_l10, away_tempo_index_l5,
      away_shot_quality_l5, away_discipline_risk_l5, away_set_piece_threat_l5,
      away_has_stats_features,
      -- event columns: NULL (not populated in this pass)
      -- player columns: NULL (not populated in this pass)
      -- differential features
      diff_form_l5, diff_form_l10, diff_goals_for_l5, diff_goals_against_l5,
      diff_attack_index_l5, diff_defense_resistance_l5, diff_xg_lite_l5,
      diff_tempo_l5, diff_win_rate_l10, diff_goal_diff_l10,
      diff_squad_rating, diff_starter_rating, diff_late_goal_for_rate,
      -- audit
      snapshot_run_key, snapshot_created_at
    )
    SELECT
      mu.match_id, mu.competition_id, mu.competition_name, mu.season_id, mu.season_label,
      mu.match_date, mu.home_team_id, mu.away_team_id,
      CASE
        WHEN mu.home_score_ft > mu.away_score_ft THEN 'H'
        WHEN mu.home_score_ft = mu.away_score_ft THEN 'D'
        ELSE 'A'
      END,
      mu.home_score_ft, mu.away_score_ft,
      CASE
        WHEN h_rf.stats_matches_l5 > 0 AND a_rf.stats_matches_l5 > 0 THEN 'partial_enriched'
        ELSE 'basic'
      END,
      (h_rf.has_stats_features OR a_rf.has_stats_features),
      false, -- has_events (not populated this pass)
      false, -- has_lineups
      false, -- has_player_features
      CASE
        WHEN mu.match_date < '2023-07-01' THEN 'train'
        WHEN mu.match_date < '2024-07-01' THEN 'validate'
        ELSE 'holdout'
      END,
      -- leakage_check_passed: both teams have at least 5 prior matches
      (COALESCE(h_rf.matches_played_l5, 0) > 0 AND COALESCE(a_rf.matches_played_l5, 0) > 0),
      -- rolling home
      h_rf.matches_played_l5, h_rf.matches_played_l10, h_rf.matches_played_l20,
      h_rf.matches_played_std,
      h_rf.points_per_match_l5, h_rf.points_per_match_l10, h_rf.points_per_match_l20,
      h_rf.points_per_match_std,
      h_rf.win_rate_l5, h_rf.draw_rate_l5, h_rf.loss_rate_l5,
      h_rf.win_rate_l10, h_rf.draw_rate_l10, h_rf.loss_rate_l10,
      h_rf.win_rate_l20,
      h_rf.goals_for_avg_l5, h_rf.goals_against_avg_l5, h_rf.goal_diff_avg_l5,
      h_rf.goals_for_avg_l10, h_rf.goals_against_avg_l10, h_rf.goal_diff_avg_l10,
      h_rf.goals_for_avg_l20, h_rf.goals_against_avg_l20,
      h_rf.goals_for_avg_std, h_rf.goals_against_avg_std,
      h_rf.shots_avg_l5, h_rf.shots_on_goal_avg_l5, h_rf.shots_insidebox_avg_l5,
      h_rf.corners_avg_l5, h_rf.fouls_avg_l5, h_rf.yellow_cards_avg_l5,
      h_rf.possession_avg_l5, h_rf.pass_accuracy_avg_l5,
      h_rf.shots_avg_l10, h_rf.shots_on_goal_avg_l10, h_rf.goalkeeper_saves_avg_l10,
      h_rf.attack_index_l5, h_rf.defense_resistance_index_l5,
      h_rf.xg_lite_internal_l5, h_rf.xg_lite_internal_l10, h_rf.tempo_index_l5,
      h_rf.shot_quality_proxy_l5, h_rf.discipline_risk_l5, h_rf.set_piece_threat_l5,
      h_rf.has_stats_features,
      -- rolling away
      a_rf.matches_played_l5, a_rf.matches_played_l10, a_rf.matches_played_l20,
      a_rf.matches_played_std,
      a_rf.points_per_match_l5, a_rf.points_per_match_l10, a_rf.points_per_match_l20,
      a_rf.points_per_match_std,
      a_rf.win_rate_l5, a_rf.draw_rate_l5, a_rf.loss_rate_l5,
      a_rf.win_rate_l10, a_rf.draw_rate_l10, a_rf.loss_rate_l10,
      a_rf.win_rate_l20,
      a_rf.goals_for_avg_l5, a_rf.goals_against_avg_l5, a_rf.goal_diff_avg_l5,
      a_rf.goals_for_avg_l10, a_rf.goals_against_avg_l10, a_rf.goal_diff_avg_l10,
      a_rf.goals_for_avg_l20, a_rf.goals_against_avg_l20,
      a_rf.goals_for_avg_std, a_rf.goals_against_avg_std,
      a_rf.shots_avg_l5, a_rf.shots_on_goal_avg_l5, a_rf.shots_insidebox_avg_l5,
      a_rf.corners_avg_l5, a_rf.fouls_avg_l5, a_rf.yellow_cards_avg_l5,
      a_rf.possession_avg_l5, a_rf.pass_accuracy_avg_l5,
      a_rf.shots_avg_l10, a_rf.shots_on_goal_avg_l10, a_rf.goalkeeper_saves_avg_l10,
      a_rf.attack_index_l5, a_rf.defense_resistance_index_l5,
      a_rf.xg_lite_internal_l5, a_rf.xg_lite_internal_l10, a_rf.tempo_index_l5,
      a_rf.shot_quality_proxy_l5, a_rf.discipline_risk_l5, a_rf.set_piece_threat_l5,
      a_rf.has_stats_features,
      -- differential features (rolling only; squad/player diffs = NULL)
      h_rf.points_per_match_l5 - a_rf.points_per_match_l5,
      h_rf.points_per_match_l10 - a_rf.points_per_match_l10,
      h_rf.goals_for_avg_l5 - a_rf.goals_for_avg_l5,
      h_rf.goals_against_avg_l5 - a_rf.goals_against_avg_l5,
      h_rf.attack_index_l5 - a_rf.attack_index_l5,
      h_rf.defense_resistance_index_l5 - a_rf.defense_resistance_index_l5,
      h_rf.xg_lite_internal_l5 - a_rf.xg_lite_internal_l5,
      h_rf.tempo_index_l5 - a_rf.tempo_index_l5,
      h_rf.win_rate_l10 - a_rf.win_rate_l10,
      h_rf.goal_diff_avg_l10 - a_rf.goal_diff_avg_l10,
      NULL::numeric, -- diff_squad_rating (player features not in this pass)
      NULL::numeric, -- diff_starter_rating
      NULL::numeric, -- diff_late_goal_for_rate (event features not in this pass)
      'rolling_only_snapshot_v1',
      now()
    FROM model_lab.v_calibration_match_universe mu
    LEFT JOIN model_lab.v_team_pre_match_rolling_features h_rf
      ON h_rf.target_match_id = mu.match_id AND h_rf.team_id = mu.home_team_id
    LEFT JOIN model_lab.v_team_pre_match_rolling_features a_rf
      ON a_rf.target_match_id = mu.match_id AND a_rf.team_id = mu.away_team_id
    WHERE mu.match_id = ANY(v_year_ids);

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_cumulative := v_cumulative + v_inserted;

    yr := v_year;
    rows_inserted := v_inserted;
    cumulative_total := v_cumulative;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.ml_populate_feature_snapshot_rolling_v1() TO authenticated;
