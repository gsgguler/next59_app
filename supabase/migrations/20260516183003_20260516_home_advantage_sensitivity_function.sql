
/*
  # Home Advantage Sensitivity Audit Function

  ## Summary
  Creates model_lab.ml_run_ha_sensitivity(), which simulates alternative
  home_advantage values (20, 30, 40, 50, 60) without modifying stored ELO
  snapshots. Uses pre_match_elo_home and pre_match_elo_away columns directly
  from match_feature_matrix_v1 to recompute p_home for each candidate HA value.

  ## Method
  For each candidate HA value h:
    p_home_sim = 1 / (1 + 10^((elo_away - (elo_home + h)) / 400))
  This is the standard ELO win probability formula applied directly to stored
  raw ELO values. No snapshot writes needed.

  ## Metrics per HA candidate
  - avg_predicted_home
  - actual_home_rate
  - binary_brier_home
  - calibration_gap_home

  Computed overall and per competition_name.

  ## Notes
  1. Idempotent: ON CONFLICT DO NOTHING with run_key + home_advantage + competition_name
  2. Only reads from match_feature_matrix_v1
  3. Does NOT rewrite team_elo_snapshots
*/

DROP FUNCTION IF EXISTS model_lab.ml_run_ha_sensitivity(text, text, text);

CREATE OR REPLACE FUNCTION model_lab.ml_run_ha_sensitivity(
  p_run_key         text DEFAULT 'ha_sensitivity_v1_domestic_2026_05',
  p_feature_version text DEFAULT 'features_v1_domestic_2026_05',
  p_elo_version     text DEFAULT 'elo_v1_domestic_2026_05'
)
RETURNS TABLE (
  out_ha           numeric,
  out_competition  text,
  out_brier        numeric,
  out_cal_gap      numeric,
  out_avg_pred     numeric,
  out_actual_rate  numeric,
  out_n            integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_ha numeric;
BEGIN

  -- Clear prior results for this run_key
  DELETE FROM model_lab.home_advantage_sensitivity WHERE run_key = p_run_key;

  -- Loop over candidate HA values
  FOREACH v_ha IN ARRAY ARRAY[20.0, 30.0, 40.0, 50.0, 60.0]
  LOOP

    WITH base AS (
      SELECT
        competition_name,
        -- Recompute p_home using candidate HA from stored raw ELO columns
        1.0 / (1.0 + POWER(10.0,
          (pre_match_elo_away - (pre_match_elo_home + v_ha)) / 400.0
        ))                                                           AS p_sim,
        CASE WHEN result_1x2 = 'H' THEN 1.0 ELSE 0.0 END           AS y_home
      FROM model_lab.match_feature_matrix_v1
      WHERE feature_version  = p_feature_version
        AND elo_version       = p_elo_version
        AND pre_match_elo_home IS NOT NULL
        AND pre_match_elo_away IS NOT NULL
        AND result_1x2 IS NOT NULL
    ),
    -- Clamp p_sim to avoid log(0)
    base_clamped AS (
      SELECT
        competition_name,
        LEAST(GREATEST(p_sim, 1e-7), 1.0 - 1e-7) AS p_home,
        y_home
      FROM base
    ),
    -- Overall
    agg_overall AS (
      SELECT
        '__overall__'::text AS competition_name,
        COUNT(*)::integer   AS n,
        AVG(p_home)         AS avg_pred,
        AVG(y_home)         AS actual_rate,
        AVG(POWER(p_home - y_home, 2)) AS brier
      FROM base_clamped
    ),
    -- Per competition
    agg_comp AS (
      SELECT
        competition_name,
        COUNT(*)::integer   AS n,
        AVG(p_home)         AS avg_pred,
        AVG(y_home)         AS actual_rate,
        AVG(POWER(p_home - y_home, 2)) AS brier
      FROM base_clamped
      GROUP BY competition_name
    ),
    combined AS (
      SELECT * FROM agg_overall
      UNION ALL
      SELECT * FROM agg_comp
    )
    INSERT INTO model_lab.home_advantage_sensitivity
      (run_key, home_advantage, competition_name, sample_size,
       avg_predicted_home, actual_home_rate, binary_brier_home, calibration_gap_home)
    SELECT
      p_run_key,
      v_ha,
      competition_name,
      n,
      ROUND(avg_pred::numeric, 6),
      ROUND(actual_rate::numeric, 6),
      ROUND(brier::numeric, 8),
      ROUND((avg_pred - actual_rate)::numeric, 6)
    FROM combined
    ON CONFLICT (run_key, home_advantage, competition_name) DO NOTHING;

  END LOOP;

  -- Return results for inspection
  RETURN QUERY
    SELECT
      home_advantage,
      competition_name,
      binary_brier_home,
      calibration_gap_home,
      avg_predicted_home,
      actual_home_rate,
      sample_size
    FROM model_lab.home_advantage_sensitivity
    WHERE run_key = p_run_key
    ORDER BY competition_name, home_advantage;

END;
$$;
