/*
  # Fix v_best_replay_run_per_season priority condition

  ## Problem
  The view used `prediction_formula LIKE '%draw_v2%'` as the V2 priority selector,
  but the actual formula string written by ml_replay_competition_season_v2() is
  'formula_v2_draw_recalibrated' — which does NOT contain the substring 'draw_v2'.
  Result: priority condition never fired, V1 (later started_at) beat V2.

  ## Fix
  Replace the LIKE pattern with one that matches the actual formula values:
    - 'formula_v2_draw_recalibrated' → contains 'v2'
    - Any future v2+ formula → contains 'v2' or 'v3' etc.

  Priority order (unchanged):
    1. prediction_formula contains 'v2' (or higher) → rank 0
    2. latest started_at within same rank → DESC
    3. V1 fallback only when no V2 exists
*/

CREATE OR REPLACE VIEW model_lab.v_best_replay_run_per_season AS
WITH ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY competition_name, season_label
      ORDER BY
        -- formula_v2_draw_recalibrated and any future vN > v1 formula beat V1
        CASE
          WHEN prediction_formula ~ 'formula_v[2-9]' THEN 0
          WHEN prediction_formula LIKE '%draw_v2%'     THEN 0
          WHEN prediction_formula LIKE '%recalibrated%' THEN 0
          ELSE 1
        END,
        started_at DESC
    ) AS rn
  FROM model_lab.v_run_season_metrics
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

-- Recreate the public wrapper to pick up the updated model_lab view
CREATE OR REPLACE VIEW public.v_best_replay_run_per_season AS
SELECT * FROM model_lab.v_best_replay_run_per_season;

GRANT SELECT ON public.v_best_replay_run_per_season TO authenticated;
