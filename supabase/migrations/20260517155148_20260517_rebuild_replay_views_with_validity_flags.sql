/*
  # Rebuild Replay Views — Add Validity and Production Candidate Flags

  ## Purpose
  Drops and recreates the replay views to include is_valid, is_production_candidate,
  invalidated_at, and invalidation_reason. The public views depend on the model_lab
  views so we drop in reverse dependency order.

  ## Changes
  1. DROP public views first (they depend on model_lab views)
  2. DROP model_lab views
  3. Recreate model_lab.v_run_season_metrics with validity columns
  4. Recreate model_lab.v_best_replay_run_per_season with validity + production candidate priority
  5. Recreate public.v_best_replay_run_per_season
  6. Recreate public.v_replay_run_season_metrics
*/

-- Drop public views first (depend on model_lab)
DROP VIEW IF EXISTS public.v_best_replay_run_per_season;
DROP VIEW IF EXISTS public.v_replay_run_season_metrics;

-- Drop model_lab views
DROP VIEW IF EXISTS model_lab.v_best_replay_run_per_season;
DROP VIEW IF EXISTS model_lab.v_run_season_metrics;

-- Step 1: v_run_season_metrics with validity columns
CREATE VIEW model_lab.v_run_season_metrics AS
SELECT
  r.id AS run_id,
  r.run_key,
  r.model_version,
  r.feature_version,
  r.elo_version,
  r.prediction_formula,
  r.scope_competition,
  r.started_at,
  r.completed_at,
  r.is_valid,
  r.is_production_candidate,
  r.invalidated_at,
  r.invalidation_reason,
  p.competition_name,
  p.season_label,
  count(*) AS n_matches,
  round(avg(e.brier_score), 5) AS brier,
  round(avg(e.log_loss), 5) AS log_loss,
  round(avg(e.rps_score), 5) AS rps,
  round(avg(e.was_correct::integer), 4) AS hit_rate,
  round(avg(p.p_draw), 4) AS pred_draw_rate,
  round(avg(CASE WHEN e.actual_result = 'D' THEN 1.0 ELSE 0.0 END), 4) AS actual_draw_rate,
  round(avg(p.p_draw) - avg(CASE WHEN e.actual_result = 'D' THEN 1.0 ELSE 0.0 END), 4) AS draw_gap,
  round(avg(p.p_home), 4) AS pred_home_rate,
  round(avg(CASE WHEN e.actual_result = 'H' THEN 1.0 ELSE 0.0 END), 4) AS actual_home_rate,
  round(avg(p.p_home) - avg(CASE WHEN e.actual_result = 'H' THEN 1.0 ELSE 0.0 END), 4) AS home_gap,
  round(avg(p.p_away), 4) AS pred_away_rate,
  round(avg(CASE WHEN e.actual_result = 'A' THEN 1.0 ELSE 0.0 END), 4) AS actual_away_rate,
  round(avg(p.p_away) - avg(CASE WHEN e.actual_result = 'A' THEN 1.0 ELSE 0.0 END), 4) AS away_gap,
  sum(e.was_overconfident::integer) AS overconfidence_count,
  sum(e.was_upset::integer) AS upset_miss_count
FROM model_lab.replay_prediction_runs r
JOIN model_lab.replay_match_predictions p ON p.run_id = r.id
JOIN model_lab.replay_match_evaluations e ON e.prediction_id = p.id
WHERE r.status = 'done'
GROUP BY
  r.id, r.run_key, r.model_version, r.feature_version, r.elo_version,
  r.prediction_formula, r.scope_competition, r.started_at, r.completed_at,
  r.is_valid, r.is_production_candidate, r.invalidated_at, r.invalidation_reason,
  p.competition_name, p.season_label;

-- Step 2: v_best_replay_run_per_season — only valid runs, production candidates prioritized
CREATE VIEW model_lab.v_best_replay_run_per_season AS
WITH ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY competition_name, season_label
      ORDER BY
        -- Production candidates first
        is_production_candidate DESC,
        -- Then by formula tier (v2+ > v1)
        CASE
          WHEN prediction_formula ~ 'formula_v[2-9]' THEN 0
          WHEN prediction_formula LIKE '%draw_v2%'    THEN 0
          WHEN prediction_formula LIKE '%recalibrated%' THEN 0
          ELSE 1
        END,
        started_at DESC
    ) AS rn
  FROM model_lab.v_run_season_metrics
  WHERE is_valid = true
)
SELECT
  competition_name,
  season_label,
  run_id,
  run_key,
  model_version,
  feature_version,
  elo_version,
  prediction_formula,
  started_at,
  completed_at,
  is_valid,
  is_production_candidate,
  invalidated_at,
  invalidation_reason,
  n_matches,
  brier,
  log_loss,
  rps,
  hit_rate,
  pred_draw_rate,
  actual_draw_rate,
  draw_gap,
  pred_home_rate,
  actual_home_rate,
  home_gap,
  pred_away_rate,
  actual_away_rate,
  away_gap,
  overconfidence_count,
  upset_miss_count
FROM ranked
WHERE rn = 1;

-- Step 3: Public view for best run per season
CREATE VIEW public.v_best_replay_run_per_season AS
SELECT
  competition_name,
  season_label,
  run_id,
  run_key,
  model_version,
  feature_version,
  elo_version,
  prediction_formula,
  started_at,
  completed_at,
  is_valid,
  is_production_candidate,
  invalidated_at,
  invalidation_reason,
  n_matches,
  brier,
  log_loss,
  rps,
  hit_rate,
  pred_draw_rate,
  actual_draw_rate,
  draw_gap,
  pred_home_rate,
  actual_home_rate,
  home_gap,
  pred_away_rate,
  actual_away_rate,
  away_gap,
  overconfidence_count,
  upset_miss_count
FROM model_lab.v_best_replay_run_per_season;

GRANT SELECT ON public.v_best_replay_run_per_season TO authenticated;

-- Step 4: Public view for all valid runs (for toggle comparison)
CREATE VIEW public.v_replay_run_season_metrics AS
SELECT
  competition_name,
  season_label,
  run_id,
  run_key,
  model_version,
  feature_version,
  elo_version,
  prediction_formula,
  started_at,
  completed_at,
  is_valid,
  is_production_candidate,
  invalidated_at,
  invalidation_reason,
  n_matches,
  brier,
  log_loss,
  rps,
  hit_rate,
  pred_draw_rate,
  actual_draw_rate,
  draw_gap,
  pred_home_rate,
  actual_home_rate,
  home_gap,
  pred_away_rate,
  actual_away_rate,
  away_gap,
  overconfidence_count,
  upset_miss_count
FROM model_lab.v_run_season_metrics
WHERE is_valid = true;

GRANT SELECT ON public.v_replay_run_season_metrics TO authenticated;
