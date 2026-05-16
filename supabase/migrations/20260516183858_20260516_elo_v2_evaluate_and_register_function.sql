
/*
  # ELO V2 — Evaluation & Registration Function

  ## Summary
  Creates model_lab.ml_evaluate_elo_version(), which:
  1. Registers a parameter config in elo_optimization_runs
  2. Computes binary calibration metrics directly from team_elo_snapshots
     (no feature matrix needed — lightweight evaluation loop)
  3. Stores results in elo_optimization_results

  ## Metrics computed
  - binary_brier_home
  - binary_log_loss_home
  - home_hit_rate
  - avg_expected_home
  - actual_home_rate
  - calibration_gap_home

  ## Slices
  - Overall (__overall__)
  - Per competition_name

  ## Notes
  - Idempotent: clears prior results for same version_key before re-inserting
  - Source: team_elo_snapshots only — no rolling views, no feature matrix
*/

DROP FUNCTION IF EXISTS model_lab.ml_evaluate_elo_version(text, numeric, numeric, text, text, numeric);

CREATE OR REPLACE FUNCTION model_lab.ml_evaluate_elo_version(
  p_version_key    text,
  p_home_advantage numeric DEFAULT 20.0,
  p_k_factor       numeric DEFAULT 20.0,
  p_decay_mode     text    DEFAULT 'none',
  p_era_mode       text    DEFAULT 'global',
  p_covid_ha       numeric DEFAULT 5.0
)
RETURNS TABLE (
  out_competition  text,
  out_brier        numeric,
  out_log_loss     numeric,
  out_hit_rate     numeric,
  out_cal_gap      numeric,
  out_n            integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_run_id   uuid;
  v_n        integer;
BEGIN

  -- Count snapshots for this version
  SELECT COUNT(*) INTO v_n
  FROM model_lab.team_elo_snapshots
  WHERE elo_version = p_version_key;

  -- Register / update run record
  INSERT INTO model_lab.elo_optimization_runs
    (version_key, home_advantage, k_factor, decay_mode, era_mode,
     covid_ha_override, match_count, notes)
  VALUES (
    p_version_key, p_home_advantage, p_k_factor, p_decay_mode, p_era_mode,
    CASE WHEN p_era_mode = 'covid_aware' THEN p_covid_ha ELSE NULL END,
    v_n,
    format('ha=%s k=%s decay=%s era=%s', p_home_advantage, p_k_factor, p_decay_mode, p_era_mode)
  )
  ON CONFLICT (version_key) DO UPDATE
    SET match_count = EXCLUDED.match_count,
        notes       = EXCLUDED.notes,
        created_at  = now()
  RETURNING id INTO v_run_id;

  -- Clear prior results
  DELETE FROM model_lab.elo_optimization_results WHERE run_id = v_run_id;

  -- Compute and insert metrics
  WITH src AS (
    SELECT
      competition_name,
      LEAST(GREATEST(expected_home, 1e-7), 1.0 - 1e-7) AS p_home,
      CASE WHEN result_1x2 = 'H' THEN 1.0 ELSE 0.0 END  AS y_home
    FROM model_lab.team_elo_snapshots
    WHERE elo_version = p_version_key
      AND expected_home IS NOT NULL
      AND result_1x2   IS NOT NULL
  ),
  overall AS (
    SELECT
      '__overall__'::text AS competition_name,
      COUNT(*)::integer   AS n,
      AVG(POWER(p_home - y_home, 2))                                 AS brier,
      AVG(-(y_home*LN(p_home) + (1-y_home)*LN(1-p_home)))           AS log_loss,
      AVG(CASE WHEN p_home >= 0.5 AND y_home=1 THEN 1.0
               WHEN p_home <  0.5 AND y_home=0 THEN 1.0
               ELSE 0.0 END)                                         AS hit_rate,
      AVG(p_home)                                                    AS avg_pred,
      AVG(y_home)                                                    AS actual_rate
    FROM src
  ),
  by_comp AS (
    SELECT
      competition_name,
      COUNT(*)::integer   AS n,
      AVG(POWER(p_home - y_home, 2))                                 AS brier,
      AVG(-(y_home*LN(p_home) + (1-y_home)*LN(1-p_home)))           AS log_loss,
      AVG(CASE WHEN p_home >= 0.5 AND y_home=1 THEN 1.0
               WHEN p_home <  0.5 AND y_home=0 THEN 1.0
               ELSE 0.0 END)                                         AS hit_rate,
      AVG(p_home)                                                    AS avg_pred,
      AVG(y_home)                                                    AS actual_rate
    FROM src
    GROUP BY competition_name
  ),
  combined AS (
    SELECT * FROM overall UNION ALL SELECT * FROM by_comp
  ),
  unpivoted AS (
    SELECT competition_name, n, 'binary_brier_home'    AS m, brier               AS v FROM combined
    UNION ALL
    SELECT competition_name, n, 'binary_log_loss_home', log_loss                     FROM combined
    UNION ALL
    SELECT competition_name, n, 'home_hit_rate',        hit_rate                     FROM combined
    UNION ALL
    SELECT competition_name, n, 'avg_expected_home',    avg_pred                     FROM combined
    UNION ALL
    SELECT competition_name, n, 'actual_home_rate',     actual_rate                  FROM combined
    UNION ALL
    SELECT competition_name, n, 'calibration_gap_home', avg_pred - actual_rate       FROM combined
  )
  INSERT INTO model_lab.elo_optimization_results
    (run_id, competition_name, metric_name, metric_value, sample_size)
  SELECT v_run_id, competition_name, m, ROUND(v::numeric,8), n
  FROM unpivoted
  WHERE v IS NOT NULL
  ON CONFLICT (run_id, competition_name, metric_name) DO NOTHING;

  -- Return summary
  RETURN QUERY
    SELECT
      r.competition_name::text,
      MAX(CASE WHEN r.metric_name='binary_brier_home'    THEN r.metric_value END)::numeric,
      MAX(CASE WHEN r.metric_name='binary_log_loss_home' THEN r.metric_value END)::numeric,
      MAX(CASE WHEN r.metric_name='home_hit_rate'        THEN r.metric_value END)::numeric,
      MAX(CASE WHEN r.metric_name='calibration_gap_home' THEN r.metric_value END)::numeric,
      MAX(r.sample_size)::integer
    FROM model_lab.elo_optimization_results r
    WHERE r.run_id = v_run_id
    GROUP BY r.competition_name
    ORDER BY r.competition_name;

END;
$$;
