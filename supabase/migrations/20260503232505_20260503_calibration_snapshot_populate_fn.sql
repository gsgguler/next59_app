/*
  # Calibration Snapshot — Chunked Populate Function

  ## Problem
  model_lab.v_prematch_feature_matrix_v1 has estimated cost ~434k+ for full-universe SELECT.
  Direct INSERT...SELECT times out even with date-range filters because the inner CTE
  (L10 rolling window) re-scans the full 65k match universe regardless of outer WHERE clause.

  ## Solution
  A PL/pgSQL function that drives population year-by-year. For each year it collects
  match IDs from the lightweight v_calibration_match_universe (cost ~2,261), then inserts
  from v_prematch_feature_matrix_v1 filtered by match_id = ANY(ids_for_year).
  This caps each batch to ~2,500 matches while still computing correct rolling history
  (the L10 window uses match_date < target_match_date with no year constraint on history).

  Called once per calibration run:
    SELECT * FROM model_lab.ml_populate_feature_snapshot_v1();

  Returns per-year summary rows.

  ## Safety
  - Reads only from model_lab views
  - Writes only to model_lab.prematch_feature_matrix_snapshot_v1
  - No public schema writes
  - No raw data modification
*/

CREATE OR REPLACE FUNCTION model_lab.ml_populate_feature_snapshot_v1()
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
  r record;
BEGIN
  -- Clear existing snapshot
  TRUNCATE model_lab.prematch_feature_matrix_snapshot_v1;

  FOR v_year IN 2000..2025 LOOP
    SELECT ARRAY_AGG(match_id) INTO v_year_ids
    FROM model_lab.v_calibration_match_universe
    WHERE EXTRACT(YEAR FROM match_date)::int = v_year;

    CONTINUE WHEN v_year_ids IS NULL OR array_length(v_year_ids, 1) = 0;

    INSERT INTO model_lab.prematch_feature_matrix_snapshot_v1
    SELECT
      match_id, competition_id, competition_name, season_id, season_label,
      match_date, home_team_id, away_team_id, actual_result_1x2,
      actual_home_goals, actual_away_goals, data_quality_tier,
      has_stats, has_events, has_lineups, has_player_features,
      split_label, leakage_check_passed,
      home_matches_played_l5, home_matches_played_l10, home_matches_played_l20,
      home_matches_played_std, home_form_l5, home_form_l10, home_form_l20,
      home_form_std, home_win_rate_l5, home_draw_rate_l5, home_loss_rate_l5,
      home_win_rate_l10, home_draw_rate_l10, home_loss_rate_l10, home_win_rate_l20,
      home_goals_for_avg_l5, home_goals_against_avg_l5, home_goal_diff_avg_l5,
      home_goals_for_avg_l10, home_goals_against_avg_l10, home_goal_diff_avg_l10,
      home_goals_for_avg_l20, home_goals_against_avg_l20, home_goals_for_avg_std,
      home_goals_against_avg_std, home_shots_avg_l5, home_shots_on_goal_avg_l5,
      home_shots_insidebox_avg_l5, home_corners_avg_l5, home_fouls_avg_l5,
      home_yellow_cards_avg_l5, home_possession_avg_l5, home_pass_accuracy_avg_l5,
      home_shots_avg_l10, home_shots_on_goal_avg_l10, home_gk_saves_avg_l10,
      home_attack_index_l5, home_defense_resistance_l5, home_xg_lite_l5,
      home_xg_lite_l10, home_tempo_index_l5, home_shot_quality_l5,
      home_discipline_risk_l5, home_set_piece_threat_l5, home_has_stats_features,
      away_matches_played_l5, away_matches_played_l10, away_matches_played_l20,
      away_matches_played_std, away_form_l5, away_form_l10, away_form_l20,
      away_form_std, away_win_rate_l5, away_draw_rate_l5, away_loss_rate_l5,
      away_win_rate_l10, away_draw_rate_l10, away_loss_rate_l10, away_win_rate_l20,
      away_goals_for_avg_l5, away_goals_against_avg_l5, away_goal_diff_avg_l5,
      away_goals_for_avg_l10, away_goals_against_avg_l10, away_goal_diff_avg_l10,
      away_goals_for_avg_l20, away_goals_against_avg_l20, away_goals_for_avg_std,
      away_goals_against_avg_std, away_shots_avg_l5, away_shots_on_goal_avg_l5,
      away_shots_insidebox_avg_l5, away_corners_avg_l5, away_fouls_avg_l5,
      away_yellow_cards_avg_l5, away_possession_avg_l5, away_pass_accuracy_avg_l5,
      away_shots_avg_l10, away_shots_on_goal_avg_l10, away_gk_saves_avg_l10,
      away_attack_index_l5, away_defense_resistance_l5, away_xg_lite_l5,
      away_xg_lite_l10, away_tempo_index_l5, away_shot_quality_l5,
      away_discipline_risk_l5, away_set_piece_threat_l5, away_has_stats_features,
      home_ev_n_matches, home_ev_goals_0_15, home_ev_goals_16_30, home_ev_goals_31_45,
      home_ev_goals_46_60, home_ev_goals_61_75, home_ev_goals_76_90,
      home_ev_conceded_0_15, home_ev_conceded_76_90, home_ev_cards_early,
      home_ev_cards_late, home_ev_red_cards, home_ev_subs,
      home_ev_late_goal_for_rate, home_ev_late_goal_against_rate,
      home_ev_first_goal_for_rate, home_ev_first_goal_against_rate,
      home_ev_comeback_signal, home_ev_late_pressure,
      away_ev_n_matches, away_ev_goals_0_15, away_ev_goals_16_30, away_ev_goals_31_45,
      away_ev_goals_46_60, away_ev_goals_61_75, away_ev_goals_76_90,
      away_ev_conceded_0_15, away_ev_conceded_76_90, away_ev_cards_early,
      away_ev_cards_late, away_ev_red_cards, away_ev_subs,
      away_ev_late_goal_for_rate, away_ev_late_goal_against_rate,
      away_ev_first_goal_for_rate, away_ev_first_goal_against_rate,
      away_ev_comeback_signal, away_ev_late_pressure,
      home_pl_n_matches, home_pl_squad_rating, home_pl_starter_rating,
      home_pl_goals_per_player, home_pl_assists_per_player, home_pl_shots_total,
      home_pl_shots_on_target, home_pl_passes_key, home_pl_duels_won_rate,
      home_pl_tackles_int, home_pl_cards_yellow, home_pl_cards_red,
      home_pl_fouls_committed, home_pl_fouls_drawn, home_pl_captain_stability,
      away_pl_n_matches, away_pl_squad_rating, away_pl_starter_rating,
      away_pl_goals_per_player, away_pl_assists_per_player, away_pl_shots_total,
      away_pl_shots_on_target, away_pl_passes_key, away_pl_duels_won_rate,
      away_pl_tackles_int, away_pl_cards_yellow, away_pl_cards_red,
      away_pl_fouls_committed, away_pl_fouls_drawn, away_pl_captain_stability,
      diff_form_l5, diff_form_l10, diff_goals_for_l5, diff_goals_against_l5,
      diff_attack_index_l5, diff_defense_resistance_l5, diff_xg_lite_l5,
      diff_tempo_l5, diff_win_rate_l10, diff_goal_diff_l10,
      diff_squad_rating, diff_starter_rating, diff_late_goal_for_rate,
      'prematch_feature_matrix_snapshot_v1'::text,
      now()
    FROM model_lab.v_prematch_feature_matrix_v1
    WHERE match_id = ANY(v_year_ids);

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_cumulative := v_cumulative + v_inserted;

    yr := v_year;
    rows_inserted := v_inserted;
    cumulative_total := v_cumulative;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.ml_populate_feature_snapshot_v1() TO authenticated;
