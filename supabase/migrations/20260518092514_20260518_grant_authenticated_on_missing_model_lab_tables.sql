/*
  # Grant authenticated role access to missing model_lab tables

  ## Purpose
  30 model_lab tables and views are queried by admin frontend pages via
  `.schema('model_lab').from(...)` but have no GRANT to the `authenticated`
  role, causing 404 "relation not found in schema cache" errors for every
  admin user.

  ## Changes
  - GRANT SELECT, INSERT, UPDATE on all 30 affected tables/views to authenticated
  - No RLS changes — existing RLS policies remain the final access gate
  - service_role already has full access (granted in prior migration)

  ## Affected objects
  admin_generation_jobs, calibration_adjustment_simulations,
  calibration_metric_results, calibration_metric_runs,
  calibration_predictions_v1, calibration_probability_buckets,
  elo_optimization_results, elo_optimization_runs,
  feature_snapshot_batch_runs, home_advantage_sensitivity,
  kalibrasyon_kuyrugu, league_calibration_events, league_draw_priors,
  match_story_drafts, match_story_publications,
  prematch_feature_matrix_snapshot_v1, replay_match_predictions,
  replay_prediction_runs, v_best_replay_run_per_season,
  v_calibration_match_universe, v_domestic_calibration_universe,
  v_prematch_feature_matrix_v1, v_run_season_metrics,
  v_team_match_history, v_team_pre_match_event_features,
  v_team_pre_match_player_features, v_team_pre_match_rolling_features,
  walk_forward_folds, walk_forward_metrics, walk_forward_runs

  ## Security
  Grants only add table visibility; RLS policies still restrict row-level access.
  Views are read-only by nature (SELECT only).
*/

-- Tables: SELECT + INSERT + UPDATE for admin workflows
GRANT SELECT, INSERT, UPDATE ON model_lab.admin_generation_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.calibration_adjustment_simulations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.calibration_metric_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.calibration_metric_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.calibration_predictions_v1 TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.calibration_probability_buckets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.elo_optimization_results TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.elo_optimization_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.feature_snapshot_batch_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.home_advantage_sensitivity TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.kalibrasyon_kuyrugu TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.league_calibration_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.league_draw_priors TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.match_story_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.match_story_publications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.prematch_feature_matrix_snapshot_v1 TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.replay_match_predictions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.replay_prediction_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.walk_forward_folds TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.walk_forward_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.walk_forward_runs TO authenticated;

-- Views: SELECT only (views cannot have INSERT/UPDATE unless they are updatable)
GRANT SELECT ON model_lab.v_best_replay_run_per_season TO authenticated;
GRANT SELECT ON model_lab.v_calibration_match_universe TO authenticated;
GRANT SELECT ON model_lab.v_domestic_calibration_universe TO authenticated;
GRANT SELECT ON model_lab.v_prematch_feature_matrix_v1 TO authenticated;
GRANT SELECT ON model_lab.v_run_season_metrics TO authenticated;
GRANT SELECT ON model_lab.v_team_match_history TO authenticated;
GRANT SELECT ON model_lab.v_team_pre_match_event_features TO authenticated;
GRANT SELECT ON model_lab.v_team_pre_match_player_features TO authenticated;
GRANT SELECT ON model_lab.v_team_pre_match_rolling_features TO authenticated;
