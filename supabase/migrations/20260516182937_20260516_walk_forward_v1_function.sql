
/*
  # Walk-Forward Validation V1 — Computation Function

  ## Summary
  Creates model_lab.ml_run_walk_forward_v1(), a set-based function that
  executes temporal walk-forward validation for the ELO V1 baseline.

  Reads exclusively from model_lab.match_feature_matrix_v1.
  No rolling views, no live joins.

  ## Fold Design
  Expanding training window, annual test folds:
    fold_2016: train 2000–2015, test 2016
    fold_2017: train 2000–2016, test 2017
    ...
    fold_2025: train 2000–2024, test 2025

  Season start year = LEFT(season_label, 4)::integer
  (e.g. '2016-2017' → 2016)

  ## Implementation
  Uses a PL/pgSQL loop over test years 2016..2025.
  Each iteration:
    1. Computes train/test match counts
    2. Inserts fold record
    3. Runs set-based INSERT for overall + per-competition + per-tier metrics
       using only test-year rows, no train-set joins needed
       (ELO probabilities already stored in feature matrix — no retraining)

  ## Notes
  1. "Training" is notional — ELO is pre-computed on full history in snapshots.
     Walk-forward here measures out-of-sample prediction quality by year.
  2. All probability computations use stored expected_home_elo (clamped).
  3. Idempotent: deletes prior fold/metric rows if run_key exists, re-inserts.
*/

DROP FUNCTION IF EXISTS model_lab.ml_run_walk_forward_v1(text, text, text);

CREATE OR REPLACE FUNCTION model_lab.ml_run_walk_forward_v1(
  p_run_key         text DEFAULT 'walk_forward_v1_domestic_2026_05',
  p_feature_version text DEFAULT 'features_v1_domestic_2026_05',
  p_elo_version     text DEFAULT 'elo_v1_domestic_2026_05'
)
RETURNS TABLE (
  out_fold        text,
  out_slice       text,
  out_metric      text,
  out_value       numeric,
  out_n           integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_run_id      uuid;
  v_fold_id     uuid;
  v_test_year   integer;
  v_train_n     integer;
  v_test_n      integer;
BEGIN

  -- --------------------------------------------------------
  -- 1. Upsert run record; clear prior folds/metrics
  -- --------------------------------------------------------
  INSERT INTO model_lab.walk_forward_runs
    (run_key, model_version, feature_version, elo_version, notes)
  VALUES (
    p_run_key, 'elo_v1', p_feature_version, p_elo_version,
    'Expanding-window walk-forward; ELO baseline; test years 2016–2025'
  )
  ON CONFLICT (run_key) DO UPDATE
    SET created_at = now(),
        notes      = EXCLUDED.notes
  RETURNING id INTO v_run_id;

  -- Cascade deletes metrics via FK
  DELETE FROM model_lab.walk_forward_folds WHERE run_id = v_run_id;

  -- --------------------------------------------------------
  -- 2. Loop over test years 2016 → 2025
  -- --------------------------------------------------------
  FOR v_test_year IN 2016..2025 LOOP

    -- Count train rows: season_start_year < test_year
    SELECT COUNT(*) INTO v_train_n
    FROM model_lab.match_feature_matrix_v1
    WHERE feature_version = p_feature_version
      AND elo_version      = p_elo_version
      AND LEFT(season_label, 4)::integer < v_test_year;

    -- Count test rows: season_start_year = test_year
    SELECT COUNT(*) INTO v_test_n
    FROM model_lab.match_feature_matrix_v1
    WHERE feature_version = p_feature_version
      AND elo_version      = p_elo_version
      AND LEFT(season_label, 4)::integer = v_test_year;

    -- Insert fold record
    INSERT INTO model_lab.walk_forward_folds
      (run_id, fold_key, train_start_year, train_end_year, test_year,
       train_match_count, test_match_count)
    VALUES (
      v_run_id,
      'fold_' || v_test_year,
      2000, v_test_year - 1, v_test_year,
      v_train_n, v_test_n
    )
    RETURNING id INTO v_fold_id;

    -- Skip metric computation if no test rows (shouldn't happen)
    CONTINUE WHEN v_test_n = 0;

    -- ----------------------------------------------------
    -- Compute and insert metrics for this fold (set-based)
    -- ----------------------------------------------------
    WITH test_base AS (
      SELECT
        competition_name,
        feature_quality_tier,
        LEAST(GREATEST(expected_home_elo, 1e-7), 1.0 - 1e-7) AS p_home,
        CASE WHEN result_1x2 = 'H' THEN 1.0 ELSE 0.0 END     AS y_home
      FROM model_lab.match_feature_matrix_v1
      WHERE feature_version = p_feature_version
        AND elo_version      = p_elo_version
        AND LEFT(season_label, 4)::integer = v_test_year
        AND expected_home_elo IS NOT NULL
        AND result_1x2 IS NOT NULL
    ),
    -- Overall slice
    overall AS (
      SELECT
        '__overall__'::text AS competition_name,
        '__all__'::text     AS feature_quality_tier,
        COUNT(*)::integer   AS n,
        AVG(POWER(p_home - y_home, 2))                                     AS brier,
        AVG(-(y_home * LN(p_home) + (1-y_home) * LN(1-p_home)))           AS log_loss,
        AVG(CASE WHEN p_home >= 0.5 AND y_home = 1 THEN 1.0
                 WHEN p_home <  0.5 AND y_home = 0 THEN 1.0
                 ELSE 0.0 END)                                              AS hit_rate,
        AVG(p_home)                                                         AS avg_pred,
        AVG(y_home)                                                         AS actual_rate
      FROM test_base
    ),
    -- Per-competition slice
    by_comp AS (
      SELECT
        competition_name,
        '__all__'::text     AS feature_quality_tier,
        COUNT(*)::integer   AS n,
        AVG(POWER(p_home - y_home, 2))                                     AS brier,
        AVG(-(y_home * LN(p_home) + (1-y_home) * LN(1-p_home)))           AS log_loss,
        AVG(CASE WHEN p_home >= 0.5 AND y_home = 1 THEN 1.0
                 WHEN p_home <  0.5 AND y_home = 0 THEN 1.0
                 ELSE 0.0 END)                                              AS hit_rate,
        AVG(p_home)                                                         AS avg_pred,
        AVG(y_home)                                                         AS actual_rate
      FROM test_base
      GROUP BY competition_name
    ),
    -- Per quality tier
    by_tier AS (
      SELECT
        '__overall__'::text AS competition_name,
        feature_quality_tier,
        COUNT(*)::integer   AS n,
        AVG(POWER(p_home - y_home, 2))                                     AS brier,
        AVG(-(y_home * LN(p_home) + (1-y_home) * LN(1-p_home)))           AS log_loss,
        AVG(CASE WHEN p_home >= 0.5 AND y_home = 1 THEN 1.0
                 WHEN p_home <  0.5 AND y_home = 0 THEN 1.0
                 ELSE 0.0 END)                                              AS hit_rate,
        AVG(p_home)                                                         AS avg_pred,
        AVG(y_home)                                                         AS actual_rate
      FROM test_base
      GROUP BY feature_quality_tier
    ),
    all_slices AS (
      SELECT competition_name, feature_quality_tier, n, 'binary_brier_home'     AS m, brier        AS v FROM overall
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'binary_log_loss_home',  log_loss          FROM overall
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'home_hit_rate',         hit_rate          FROM overall
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'avg_expected_home',     avg_pred          FROM overall
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'actual_home_rate',      actual_rate       FROM overall
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'calibration_gap_home',  avg_pred - actual_rate FROM overall
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'binary_brier_home',     brier             FROM by_comp
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'binary_log_loss_home',  log_loss          FROM by_comp
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'home_hit_rate',         hit_rate          FROM by_comp
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'avg_expected_home',     avg_pred          FROM by_comp
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'actual_home_rate',      actual_rate       FROM by_comp
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'calibration_gap_home',  avg_pred - actual_rate FROM by_comp
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'binary_brier_home',     brier             FROM by_tier
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'binary_log_loss_home',  log_loss          FROM by_tier
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'home_hit_rate',         hit_rate          FROM by_tier
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'avg_expected_home',     avg_pred          FROM by_tier
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'actual_home_rate',      actual_rate       FROM by_tier
      UNION ALL
      SELECT competition_name, feature_quality_tier, n, 'calibration_gap_home',  avg_pred - actual_rate FROM by_tier
    )
    INSERT INTO model_lab.walk_forward_metrics
      (fold_id, competition_name, feature_quality_tier, metric_name, metric_value, sample_size)
    SELECT
      v_fold_id,
      competition_name,
      feature_quality_tier,
      m,
      ROUND(v::numeric, 8),
      n
    FROM all_slices
    WHERE v IS NOT NULL
    ON CONFLICT (fold_id, competition_name, feature_quality_tier, metric_name)
      DO NOTHING;

  END LOOP;

  -- --------------------------------------------------------
  -- 3. Return summary for immediate inspection
  -- --------------------------------------------------------
  RETURN QUERY
    SELECT
      f.fold_key::text                                        AS out_fold,
      (m.competition_name || '|' || m.feature_quality_tier)::text AS out_slice,
      m.metric_name::text                                     AS out_metric,
      m.metric_value::numeric                                 AS out_value,
      m.sample_size::integer                                  AS out_n
    FROM model_lab.walk_forward_folds f
    JOIN model_lab.walk_forward_metrics m ON m.fold_id = f.id
    WHERE f.run_id = v_run_id
      AND m.competition_name = '__overall__'
      AND m.feature_quality_tier = '__all__'
      AND m.metric_name IN (
        'binary_brier_home', 'home_hit_rate',
        'calibration_gap_home', 'actual_home_rate'
      )
    ORDER BY f.test_year, m.metric_name;

END;
$$;
