/*
  # Calibration Phase 5 - Pre-Match Feature Matrix v1

  Creates model_lab.v_prematch_feature_matrix_v1, the full per-match feature
  matrix. Joins match universe with all four leakage-safe feature layers and
  adds differential features plus a leakage_check_passed boolean.

  Walk-Forward Split Labels:
  - train:    match_date before 2023-07-01
  - validate: 2023-07-01 to 2024-07-01
  - holdout:  2024-07-01 to 2025-06-01

  Leakage check: both home and away must have matches_played_l5 > 0.
*/

CREATE OR REPLACE VIEW model_lab.v_prematch_feature_matrix_v1 AS

SELECT
  -- Identity
  u.match_id,
  u.competition_id,
  u.competition_name,
  u.season_id,
  u.season_label,
  u.match_date,
  u.home_team_id,
  u.away_team_id,
  u.actual_result_1x2,
  u.actual_home_goals,
  u.actual_away_goals,
  u.data_quality_tier,
  u.has_stats,
  u.has_events,
  u.has_lineups,
  u.has_player_features,

  -- Walk-forward split label
  CASE
    WHEN u.match_date < '2023-07-01' THEN 'train'
    WHEN u.match_date < '2024-07-01' THEN 'validate'
    ELSE 'holdout'
  END AS split_label,

  -- Leakage check: both teams must have prior match data
  (
    COALESCE(hrf.matches_played_l5, 0) > 0 AND
    COALESCE(arf.matches_played_l5, 0) > 0
  ) AS leakage_check_passed,

  -- Home rolling features
  hrf.matches_played_l5               AS home_matches_played_l5,
  hrf.matches_played_l10              AS home_matches_played_l10,
  hrf.matches_played_l20              AS home_matches_played_l20,
  hrf.matches_played_std              AS home_matches_played_std,
  hrf.points_per_match_l5             AS home_form_l5,
  hrf.points_per_match_l10            AS home_form_l10,
  hrf.points_per_match_l20            AS home_form_l20,
  hrf.points_per_match_std            AS home_form_std,
  hrf.win_rate_l5                     AS home_win_rate_l5,
  hrf.draw_rate_l5                    AS home_draw_rate_l5,
  hrf.loss_rate_l5                    AS home_loss_rate_l5,
  hrf.win_rate_l10                    AS home_win_rate_l10,
  hrf.draw_rate_l10                   AS home_draw_rate_l10,
  hrf.loss_rate_l10                   AS home_loss_rate_l10,
  hrf.win_rate_l20                    AS home_win_rate_l20,
  hrf.goals_for_avg_l5                AS home_goals_for_avg_l5,
  hrf.goals_against_avg_l5            AS home_goals_against_avg_l5,
  hrf.goal_diff_avg_l5                AS home_goal_diff_avg_l5,
  hrf.goals_for_avg_l10               AS home_goals_for_avg_l10,
  hrf.goals_against_avg_l10           AS home_goals_against_avg_l10,
  hrf.goal_diff_avg_l10               AS home_goal_diff_avg_l10,
  hrf.goals_for_avg_l20               AS home_goals_for_avg_l20,
  hrf.goals_against_avg_l20           AS home_goals_against_avg_l20,
  hrf.goals_for_avg_std               AS home_goals_for_avg_std,
  hrf.goals_against_avg_std           AS home_goals_against_avg_std,
  hrf.shots_avg_l5                    AS home_shots_avg_l5,
  hrf.shots_on_goal_avg_l5            AS home_shots_on_goal_avg_l5,
  hrf.shots_insidebox_avg_l5          AS home_shots_insidebox_avg_l5,
  hrf.corners_avg_l5                  AS home_corners_avg_l5,
  hrf.fouls_avg_l5                    AS home_fouls_avg_l5,
  hrf.yellow_cards_avg_l5             AS home_yellow_cards_avg_l5,
  hrf.possession_avg_l5               AS home_possession_avg_l5,
  hrf.pass_accuracy_avg_l5            AS home_pass_accuracy_avg_l5,
  hrf.shots_avg_l10                   AS home_shots_avg_l10,
  hrf.shots_on_goal_avg_l10           AS home_shots_on_goal_avg_l10,
  hrf.goalkeeper_saves_avg_l10        AS home_gk_saves_avg_l10,
  hrf.attack_index_l5                 AS home_attack_index_l5,
  hrf.defense_resistance_index_l5     AS home_defense_resistance_l5,
  hrf.xg_lite_internal_l5             AS home_xg_lite_l5,
  hrf.xg_lite_internal_l10            AS home_xg_lite_l10,
  hrf.tempo_index_l5                  AS home_tempo_index_l5,
  hrf.shot_quality_proxy_l5           AS home_shot_quality_l5,
  hrf.discipline_risk_l5              AS home_discipline_risk_l5,
  hrf.set_piece_threat_l5             AS home_set_piece_threat_l5,
  hrf.has_stats_features              AS home_has_stats_features,

  -- Away rolling features
  arf.matches_played_l5               AS away_matches_played_l5,
  arf.matches_played_l10              AS away_matches_played_l10,
  arf.matches_played_l20              AS away_matches_played_l20,
  arf.matches_played_std              AS away_matches_played_std,
  arf.points_per_match_l5             AS away_form_l5,
  arf.points_per_match_l10            AS away_form_l10,
  arf.points_per_match_l20            AS away_form_l20,
  arf.points_per_match_std            AS away_form_std,
  arf.win_rate_l5                     AS away_win_rate_l5,
  arf.draw_rate_l5                    AS away_draw_rate_l5,
  arf.loss_rate_l5                    AS away_loss_rate_l5,
  arf.win_rate_l10                    AS away_win_rate_l10,
  arf.draw_rate_l10                   AS away_draw_rate_l10,
  arf.loss_rate_l10                   AS away_loss_rate_l10,
  arf.win_rate_l20                    AS away_win_rate_l20,
  arf.goals_for_avg_l5                AS away_goals_for_avg_l5,
  arf.goals_against_avg_l5            AS away_goals_against_avg_l5,
  arf.goal_diff_avg_l5                AS away_goal_diff_avg_l5,
  arf.goals_for_avg_l10               AS away_goals_for_avg_l10,
  arf.goals_against_avg_l10           AS away_goals_against_avg_l10,
  arf.goal_diff_avg_l10               AS away_goal_diff_avg_l10,
  arf.goals_for_avg_l20               AS away_goals_for_avg_l20,
  arf.goals_against_avg_l20           AS away_goals_against_avg_l20,
  arf.goals_for_avg_std               AS away_goals_for_avg_std,
  arf.goals_against_avg_std           AS away_goals_against_avg_std,
  arf.shots_avg_l5                    AS away_shots_avg_l5,
  arf.shots_on_goal_avg_l5            AS away_shots_on_goal_avg_l5,
  arf.shots_insidebox_avg_l5          AS away_shots_insidebox_avg_l5,
  arf.corners_avg_l5                  AS away_corners_avg_l5,
  arf.fouls_avg_l5                    AS away_fouls_avg_l5,
  arf.yellow_cards_avg_l5             AS away_yellow_cards_avg_l5,
  arf.possession_avg_l5               AS away_possession_avg_l5,
  arf.pass_accuracy_avg_l5            AS away_pass_accuracy_avg_l5,
  arf.shots_avg_l10                   AS away_shots_avg_l10,
  arf.shots_on_goal_avg_l10           AS away_shots_on_goal_avg_l10,
  arf.goalkeeper_saves_avg_l10        AS away_gk_saves_avg_l10,
  arf.attack_index_l5                 AS away_attack_index_l5,
  arf.defense_resistance_index_l5     AS away_defense_resistance_l5,
  arf.xg_lite_internal_l5             AS away_xg_lite_l5,
  arf.xg_lite_internal_l10            AS away_xg_lite_l10,
  arf.tempo_index_l5                  AS away_tempo_index_l5,
  arf.shot_quality_proxy_l5           AS away_shot_quality_l5,
  arf.discipline_risk_l5              AS away_discipline_risk_l5,
  arf.set_piece_threat_l5             AS away_set_piece_threat_l5,
  arf.has_stats_features              AS away_has_stats_features,

  -- Home event features
  hef.n_event_matches_l10             AS home_ev_n_matches,
  hef.goals_0_15_avg_l10             AS home_ev_goals_0_15,
  hef.goals_16_30_avg_l10            AS home_ev_goals_16_30,
  hef.goals_31_45_avg_l10            AS home_ev_goals_31_45,
  hef.goals_46_60_avg_l10            AS home_ev_goals_46_60,
  hef.goals_61_75_avg_l10            AS home_ev_goals_61_75,
  hef.goals_76_90_avg_l10            AS home_ev_goals_76_90,
  hef.goals_conceded_0_15_avg_l10    AS home_ev_conceded_0_15,
  hef.goals_conceded_76_90_avg_l10   AS home_ev_conceded_76_90,
  hef.cards_0_15_avg_l10             AS home_ev_cards_early,
  hef.cards_76_90_avg_l10            AS home_ev_cards_late,
  hef.red_cards_avg_l10              AS home_ev_red_cards,
  hef.substitutions_avg_l10          AS home_ev_subs,
  hef.late_goal_for_rate_l10         AS home_ev_late_goal_for_rate,
  hef.late_goal_against_rate_l10     AS home_ev_late_goal_against_rate,
  hef.first_goal_for_rate_l10        AS home_ev_first_goal_for_rate,
  hef.first_goal_against_rate_l10    AS home_ev_first_goal_against_rate,
  hef.comeback_signal_l10            AS home_ev_comeback_signal,
  hef.late_goal_pressure_l10         AS home_ev_late_pressure,

  -- Away event features
  aef.n_event_matches_l10             AS away_ev_n_matches,
  aef.goals_0_15_avg_l10             AS away_ev_goals_0_15,
  aef.goals_16_30_avg_l10            AS away_ev_goals_16_30,
  aef.goals_31_45_avg_l10            AS away_ev_goals_31_45,
  aef.goals_46_60_avg_l10            AS away_ev_goals_46_60,
  aef.goals_61_75_avg_l10            AS away_ev_goals_61_75,
  aef.goals_76_90_avg_l10            AS away_ev_goals_76_90,
  aef.goals_conceded_0_15_avg_l10    AS away_ev_conceded_0_15,
  aef.goals_conceded_76_90_avg_l10   AS away_ev_conceded_76_90,
  aef.cards_0_15_avg_l10             AS away_ev_cards_early,
  aef.cards_76_90_avg_l10            AS away_ev_cards_late,
  aef.red_cards_avg_l10              AS away_ev_red_cards,
  aef.substitutions_avg_l10          AS away_ev_subs,
  aef.late_goal_for_rate_l10         AS away_ev_late_goal_for_rate,
  aef.late_goal_against_rate_l10     AS away_ev_late_goal_against_rate,
  aef.first_goal_for_rate_l10        AS away_ev_first_goal_for_rate,
  aef.first_goal_against_rate_l10    AS away_ev_first_goal_against_rate,
  aef.comeback_signal_l10            AS away_ev_comeback_signal,
  aef.late_goal_pressure_l10         AS away_ev_late_pressure,

  -- Home player features
  hpf.n_player_matches_l10            AS home_pl_n_matches,
  hpf.avg_squad_rating_l10            AS home_pl_squad_rating,
  hpf.avg_starter_rating_l10          AS home_pl_starter_rating,
  hpf.avg_goals_per_player_l10        AS home_pl_goals_per_player,
  hpf.avg_assists_per_player_l10      AS home_pl_assists_per_player,
  hpf.avg_shots_total_l10             AS home_pl_shots_total,
  hpf.avg_shots_on_target_l10         AS home_pl_shots_on_target,
  hpf.avg_passes_key_l10              AS home_pl_passes_key,
  hpf.avg_duels_won_rate_l10          AS home_pl_duels_won_rate,
  hpf.avg_tackles_interceptions_l10   AS home_pl_tackles_int,
  hpf.avg_cards_yellow_l10            AS home_pl_cards_yellow,
  hpf.avg_cards_red_l10               AS home_pl_cards_red,
  hpf.avg_fouls_committed_l10         AS home_pl_fouls_committed,
  hpf.avg_fouls_drawn_l10             AS home_pl_fouls_drawn,
  hpf.captain_stability_l10           AS home_pl_captain_stability,

  -- Away player features
  apf.n_player_matches_l10            AS away_pl_n_matches,
  apf.avg_squad_rating_l10            AS away_pl_squad_rating,
  apf.avg_starter_rating_l10          AS away_pl_starter_rating,
  apf.avg_goals_per_player_l10        AS away_pl_goals_per_player,
  apf.avg_assists_per_player_l10      AS away_pl_assists_per_player,
  apf.avg_shots_total_l10             AS away_pl_shots_total,
  apf.avg_shots_on_target_l10         AS away_pl_shots_on_target,
  apf.avg_passes_key_l10              AS away_pl_passes_key,
  apf.avg_duels_won_rate_l10          AS away_pl_duels_won_rate,
  apf.avg_tackles_interceptions_l10   AS away_pl_tackles_int,
  apf.avg_cards_yellow_l10            AS away_pl_cards_yellow,
  apf.avg_cards_red_l10               AS away_pl_cards_red,
  apf.avg_fouls_committed_l10         AS away_pl_fouls_committed,
  apf.avg_fouls_drawn_l10             AS away_pl_fouls_drawn,
  apf.captain_stability_l10           AS away_pl_captain_stability,

  -- Differential features (home minus away)
  ROUND((COALESCE(hrf.points_per_match_l5,  0) - COALESCE(arf.points_per_match_l5,  0))::numeric, 4) AS diff_form_l5,
  ROUND((COALESCE(hrf.points_per_match_l10, 0) - COALESCE(arf.points_per_match_l10, 0))::numeric, 4) AS diff_form_l10,
  ROUND((COALESCE(hrf.goals_for_avg_l5,     0) - COALESCE(arf.goals_for_avg_l5,     0))::numeric, 4) AS diff_goals_for_l5,
  ROUND((COALESCE(hrf.goals_against_avg_l5, 0) - COALESCE(arf.goals_against_avg_l5, 0))::numeric, 4) AS diff_goals_against_l5,
  ROUND((COALESCE(hrf.attack_index_l5,             0) - COALESCE(arf.attack_index_l5,             0))::numeric, 4) AS diff_attack_index_l5,
  ROUND((COALESCE(hrf.defense_resistance_index_l5, 0) - COALESCE(arf.defense_resistance_index_l5, 0))::numeric, 4) AS diff_defense_resistance_l5,
  ROUND((COALESCE(hrf.xg_lite_internal_l5,  0) - COALESCE(arf.xg_lite_internal_l5,  0))::numeric, 4) AS diff_xg_lite_l5,
  ROUND((COALESCE(hrf.tempo_index_l5,       0) - COALESCE(arf.tempo_index_l5,       0))::numeric, 4) AS diff_tempo_l5,
  ROUND((COALESCE(hrf.win_rate_l10,         0) - COALESCE(arf.win_rate_l10,         0))::numeric, 4) AS diff_win_rate_l10,
  ROUND((COALESCE(hrf.goal_diff_avg_l10,    0) - COALESCE(arf.goal_diff_avg_l10,    0))::numeric, 4) AS diff_goal_diff_l10,
  ROUND((COALESCE(hpf.avg_squad_rating_l10,   0) - COALESCE(apf.avg_squad_rating_l10,   0))::numeric, 4) AS diff_squad_rating,
  ROUND((COALESCE(hpf.avg_starter_rating_l10, 0) - COALESCE(apf.avg_starter_rating_l10, 0))::numeric, 4) AS diff_starter_rating,
  ROUND((COALESCE(hef.late_goal_for_rate_l10, 0) - COALESCE(aef.late_goal_for_rate_l10, 0))::numeric, 4) AS diff_late_goal_for_rate

FROM model_lab.v_calibration_match_universe u

LEFT JOIN model_lab.v_team_pre_match_rolling_features hrf
  ON hrf.target_match_id = u.match_id AND hrf.team_id = u.home_team_id

LEFT JOIN model_lab.v_team_pre_match_rolling_features arf
  ON arf.target_match_id = u.match_id AND arf.team_id = u.away_team_id

LEFT JOIN model_lab.v_team_pre_match_event_features hef
  ON hef.target_match_id = u.match_id AND hef.team_id = u.home_team_id

LEFT JOIN model_lab.v_team_pre_match_event_features aef
  ON aef.target_match_id = u.match_id AND aef.team_id = u.away_team_id

LEFT JOIN model_lab.v_team_pre_match_player_features hpf
  ON hpf.target_match_id = u.match_id AND hpf.team_id = u.home_team_id

LEFT JOIN model_lab.v_team_pre_match_player_features apf
  ON apf.target_match_id = u.match_id AND apf.team_id = u.away_team_id;
