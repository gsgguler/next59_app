/*
  # Best Replay Run Per Season View

  ## Purpose
  Calibration Center was showing stale V1 metrics because `kalibrasyon_kuyrugu`
  stores only one snapshot per (competition_name, season_label), written at V1
  run time and never updated by draw_v2 runs.

  This view computes per-run aggregate metrics live from
  `replay_match_predictions + replay_match_evaluations` and selects the
  "best" run per (competition_name, season_label) using the priority:
    1. Latest run whose prediction_formula contains 'draw_v2'
    2. Otherwise the most-recently-started completed run

  ## New View: model_lab.v_best_replay_run_per_season
  - Columns: competition_name, season_label, run_key, run_id,
             model_version, feature_version, elo_version, prediction_formula,
             started_at, completed_at, n_matches,
             brier, log_loss, rps, hit_rate,
             pred_draw_rate, actual_draw_rate, draw_gap,
             pred_home_rate, actual_home_rate, home_gap,
             pred_away_rate, actual_away_rate, away_gap,
             overconfidence_count, upset_miss_count

  ## Public Wrapper View: public.v_best_replay_run_per_season
  Delegates to model_lab view; readable by authenticated users (admin only in practice
  via app-level guard, but SELECT grant is safe as metrics are non-sensitive).

  ## Notes
  - All metric signs: gap = predicted - actual (positive = over-predicting)
  - draw_gap = pred_draw_rate - actual_draw_rate: positive means model over-predicts draws
  - No writes; read-only view
*/

-- ─── Step 1: Per-run aggregate metrics CTE view in model_lab ───────────────

CREATE OR REPLACE VIEW model_lab.v_run_season_metrics AS
SELECT
  r.id                    AS run_id,
  r.run_key,
  r.model_version,
  r.feature_version,
  r.elo_version,
  r.prediction_formula,
  r.scope_competition,
  r.started_at,
  r.completed_at,
  p.competition_name,
  p.season_label,
  COUNT(*)                                                   AS n_matches,
  ROUND(AVG(e.brier_score)::numeric, 5)                      AS brier,
  ROUND(AVG(e.log_loss)::numeric, 5)                         AS log_loss,
  ROUND(AVG(e.rps_score)::numeric, 5)                        AS rps,
  ROUND(AVG(e.was_correct::int)::numeric, 4)                 AS hit_rate,
  -- Draw
  ROUND(AVG(p.p_draw)::numeric, 4)                           AS pred_draw_rate,
  ROUND(AVG(CASE WHEN e.actual_result = 'D' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS actual_draw_rate,
  ROUND((AVG(p.p_draw) - AVG(CASE WHEN e.actual_result = 'D' THEN 1.0 ELSE 0.0 END))::numeric, 4) AS draw_gap,
  -- Home
  ROUND(AVG(p.p_home)::numeric, 4)                           AS pred_home_rate,
  ROUND(AVG(CASE WHEN e.actual_result = 'H' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS actual_home_rate,
  ROUND((AVG(p.p_home) - AVG(CASE WHEN e.actual_result = 'H' THEN 1.0 ELSE 0.0 END))::numeric, 4) AS home_gap,
  -- Away
  ROUND(AVG(p.p_away)::numeric, 4)                           AS pred_away_rate,
  ROUND(AVG(CASE WHEN e.actual_result = 'A' THEN 1.0 ELSE 0.0 END)::numeric, 4) AS actual_away_rate,
  ROUND((AVG(p.p_away) - AVG(CASE WHEN e.actual_result = 'A' THEN 1.0 ELSE 0.0 END))::numeric, 4) AS away_gap,
  -- Quality counters
  SUM(e.was_overconfident::int)                              AS overconfidence_count,
  SUM(e.was_upset::int)                                      AS upset_miss_count
FROM model_lab.replay_prediction_runs r
JOIN model_lab.replay_match_predictions p ON p.run_id = r.id
JOIN model_lab.replay_match_evaluations e ON e.prediction_id = p.id
WHERE r.status = 'done'
GROUP BY
  r.id, r.run_key, r.model_version, r.feature_version,
  r.elo_version, r.prediction_formula, r.scope_competition,
  r.started_at, r.completed_at,
  p.competition_name, p.season_label;

-- ─── Step 2: Best-run selector view ────────────────────────────────────────
-- Priority: draw_v2 formula runs beat V1 runs; within same formula tier, latest wins.

CREATE OR REPLACE VIEW model_lab.v_best_replay_run_per_season AS
WITH ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY competition_name, season_label
      ORDER BY
        -- Prefer draw_v2 formula
        CASE WHEN prediction_formula LIKE '%draw_v2%' THEN 0 ELSE 1 END,
        -- Then latest started_at
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

-- ─── Step 3: Public wrapper ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_best_replay_run_per_season AS
SELECT * FROM model_lab.v_best_replay_run_per_season;

GRANT SELECT ON public.v_best_replay_run_per_season TO authenticated;

-- ─── Step 4: All-runs view for comparison toggle ───────────────────────────
-- Exposes all completed runs per season so UI can offer V1 / draw_v2 toggle.

CREATE OR REPLACE VIEW public.v_replay_run_season_metrics AS
SELECT * FROM model_lab.v_run_season_metrics;

GRANT SELECT ON public.v_replay_run_season_metrics TO authenticated;
