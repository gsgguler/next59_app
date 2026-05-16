
/*
  # Calibration Metrics V1 — Computation Function

  ## Summary
  Creates model_lab.ml_run_calibration_metrics_v1(), a set-based function that
  reads exclusively from model_lab.match_feature_matrix_v1 and computes the
  full calibration metric suite for the ELO V1 baseline model.

  ## Draw Probability Derivation
  ELO produces p_home + p_away = 1 (binary). To derive a 3-way 1X2 distribution
  we apply Harville draw compression:
    draw_weight = 0.30  (empirically ~26% draw rate in domestic football)
    raw_p_home  = expected_home_elo * (1 - draw_weight)
    raw_p_draw  = draw_weight
    raw_p_away  = expected_away_elo * (1 - draw_weight)
  Then renormalize so the three sum to exactly 1.
  This is a known limitation — draw probability is approximated, not modelled.

  ## Metrics Computed
  Binary (home vs not-home):
    - binary_brier_home     : mean((p_home - actual_home)^2)
    - binary_log_loss_home  : mean(-actual*ln(p) - (1-actual)*ln(1-p))
    - home_hit_rate         : accuracy when argmax = 'home'
    - avg_expected_home     : mean(p_home)
    - actual_home_rate      : mean(actual_home indicator)
    - calibration_gap_home  : avg_expected_home - actual_home_rate

  3-way 1X2 (if draw approximation used):
    - multiclass_brier_1x2  : mean((pH-yH)^2 + (pD-yD)^2 + (pA-yA)^2)
    - multiclass_log_loss_1x2
    - hit_rate_1x2          : accuracy of argmax(pH,pD,pA) vs result_1x2

  ## Slices
  Metrics computed for:
    1. Overall (competition_name = '__overall__', season_label = NULL, tier = '__all__')
    2. Per competition_name
    3. Per feature_quality_tier
    4. Per competition_name × feature_quality_tier

  ## Bucketed Calibration
  Decile probability buckets computed for:
    1. Overall
    2. Per competition_name

  ## Idempotency
  - On re-run with same p_run_key: deletes existing results/buckets, re-inserts fresh
  - Run record updated with new created_at and match_count

  ## Notes
  1. p_draw approximation is flagged in notes — not a true draw model
  2. Log loss is clamped: p clamped to [1e-7, 1-1e-7] to avoid infinities
  3. All computation is set-based, no row-by-row loops
  4. Only reads from model_lab.match_feature_matrix_v1
*/

-- Drop if exists (return type may differ from earlier stub)
DROP FUNCTION IF EXISTS model_lab.ml_run_calibration_metrics_v1(text, text, text);

CREATE OR REPLACE FUNCTION model_lab.ml_run_calibration_metrics_v1(
  p_run_key         text DEFAULT 'calibration_metrics_v1_domestic_2026_05',
  p_feature_version text DEFAULT 'features_v1_domestic_2026_05',
  p_elo_version     text DEFAULT 'elo_v1_domestic_2026_05'
)
RETURNS TABLE (
  out_slice           text,
  out_metric_name     text,
  out_metric_value    numeric,
  out_sample_size     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_run_id      uuid;
  v_match_count integer;
  v_draw_weight numeric := 0.30;
BEGIN

  -- --------------------------------------------------------
  -- 0. Count matches for this version pair
  -- --------------------------------------------------------
  SELECT COUNT(*) INTO v_match_count
  FROM model_lab.match_feature_matrix_v1
  WHERE feature_version = p_feature_version
    AND elo_version      = p_elo_version;

  -- --------------------------------------------------------
  -- 1. Upsert run record
  -- --------------------------------------------------------
  INSERT INTO model_lab.calibration_metric_runs
    (run_key, model_version, feature_version, elo_version, match_count, notes)
  VALUES (
    p_run_key, 'elo_v1',
    p_feature_version, p_elo_version,
    v_match_count,
    'ELO baseline; draw prob approximated via Harville compression (draw_weight=0.30)'
  )
  ON CONFLICT (run_key) DO UPDATE
    SET created_at   = now(),
        match_count  = EXCLUDED.match_count,
        notes        = EXCLUDED.notes
  RETURNING id INTO v_run_id;

  -- --------------------------------------------------------
  -- 2. Clear previous results for this run
  -- --------------------------------------------------------
  DELETE FROM model_lab.calibration_metric_results   WHERE run_id = v_run_id;
  DELETE FROM model_lab.calibration_probability_buckets WHERE run_id = v_run_id;

  -- --------------------------------------------------------
  -- 3. Build working dataset (set-based, no loops)
  --    Derive 3-way probabilities via Harville draw compression
  -- --------------------------------------------------------
  -- Metrics INSERT helper: uses a single CTE per slice family

  -- === SLICE FAMILY A: Overall + per-competition + per-tier ===
  WITH base AS (
    SELECT
      competition_name,
      feature_quality_tier,
      result_1x2,
      expected_home_elo                             AS p_h_raw,
      expected_away_elo                             AS p_a_raw,
      -- Harville draw compression
      LEAST(GREATEST(expected_home_elo * (1.0 - v_draw_weight), 1e-7), 1.0 - 1e-7) AS p_home,
      LEAST(GREATEST(v_draw_weight,                              1e-7), 1.0 - 1e-7) AS p_draw_raw,
      LEAST(GREATEST(expected_away_elo * (1.0 - v_draw_weight), 1e-7), 1.0 - 1e-7) AS p_away,
      -- Binary outcome indicators
      CASE WHEN result_1x2 = 'H' THEN 1.0 ELSE 0.0 END AS y_home,
      CASE WHEN result_1x2 = 'D' THEN 1.0 ELSE 0.0 END AS y_draw,
      CASE WHEN result_1x2 = 'A' THEN 1.0 ELSE 0.0 END AS y_away
    FROM model_lab.match_feature_matrix_v1
    WHERE feature_version = p_feature_version
      AND elo_version      = p_elo_version
      AND expected_home_elo IS NOT NULL
      AND expected_away_elo IS NOT NULL
      AND result_1x2 IS NOT NULL
  ),
  -- Renormalize 3-way probabilities so they sum to 1
  base_norm AS (
    SELECT
      competition_name,
      feature_quality_tier,
      result_1x2,
      y_home, y_draw, y_away,
      p_home / (p_home + p_draw_raw + p_away)     AS ph,
      p_draw_raw / (p_home + p_draw_raw + p_away) AS pd,
      p_away / (p_home + p_draw_raw + p_away)     AS pa,
      p_h_raw, p_a_raw
    FROM base
  ),
  -- Binary p_home (raw ELO, before draw compression) clamped
  base_binary AS (
    SELECT
      competition_name,
      feature_quality_tier,
      y_home,
      LEAST(GREATEST(p_h_raw, 1e-7), 1.0 - 1e-7)  AS p_home_bin
    FROM base_norm
  ),
  -- ---- OVERALL slice ----
  overall_metrics AS (
    SELECT
      '__overall__'::text  AS competition_name,
      NULL::text           AS season_label,
      '__all__'::text      AS feature_quality_tier,
      COUNT(*)::integer    AS n,
      -- binary
      AVG(POWER(p_home_bin - y_home, 2))                                        AS binary_brier,
      AVG(-(y_home * LN(p_home_bin) + (1-y_home) * LN(1-p_home_bin)))          AS binary_log_loss,
      AVG(CASE WHEN p_home_bin >= 0.5 AND y_home = 1 THEN 1.0
               WHEN p_home_bin <  0.5 AND y_home = 0 THEN 1.0
               ELSE 0.0 END)                                                    AS home_hit_rate,
      AVG(p_home_bin)                                                            AS avg_exp_home,
      AVG(y_home)                                                                AS actual_home_rate
    FROM base_binary
  ),
  -- ---- PER COMPETITION slice ----
  comp_metrics AS (
    SELECT
      competition_name,
      NULL::text          AS season_label,
      '__all__'::text     AS feature_quality_tier,
      COUNT(*)::integer   AS n,
      AVG(POWER(p_home_bin - y_home, 2))                                        AS binary_brier,
      AVG(-(y_home * LN(p_home_bin) + (1-y_home) * LN(1-p_home_bin)))          AS binary_log_loss,
      AVG(CASE WHEN p_home_bin >= 0.5 AND y_home = 1 THEN 1.0
               WHEN p_home_bin <  0.5 AND y_home = 0 THEN 1.0
               ELSE 0.0 END)                                                    AS home_hit_rate,
      AVG(p_home_bin)                                                            AS avg_exp_home,
      AVG(y_home)                                                                AS actual_home_rate
    FROM base_binary
    GROUP BY competition_name
  ),
  -- ---- PER QUALITY TIER slice ----
  tier_metrics AS (
    SELECT
      '__overall__'::text       AS competition_name,
      NULL::text                AS season_label,
      feature_quality_tier,
      COUNT(*)::integer         AS n,
      AVG(POWER(p_home_bin - y_home, 2))                                        AS binary_brier,
      AVG(-(y_home * LN(p_home_bin) + (1-y_home) * LN(1-p_home_bin)))          AS binary_log_loss,
      AVG(CASE WHEN p_home_bin >= 0.5 AND y_home = 1 THEN 1.0
               WHEN p_home_bin <  0.5 AND y_home = 0 THEN 1.0
               ELSE 0.0 END)                                                    AS home_hit_rate,
      AVG(p_home_bin)                                                            AS avg_exp_home,
      AVG(y_home)                                                                AS actual_home_rate
    FROM base_binary
    GROUP BY feature_quality_tier
  ),
  -- ---- 3-WAY OVERALL ----
  overall_3way AS (
    SELECT
      COUNT(*)::integer AS n,
      -- Multiclass Brier: mean of sum of squared errors across 3 outcomes
      AVG(POWER(ph - y_home, 2) + POWER(pd - y_draw, 2) + POWER(pa - y_away, 2)) AS mc_brier,
      AVG(-(y_home * LN(ph) + y_draw * LN(pd) + y_away * LN(pa)))                AS mc_log_loss,
      AVG(CASE
            WHEN ph >= pd AND ph >= pa AND y_home = 1 THEN 1.0
            WHEN pd >= ph AND pd >= pa AND y_draw = 1 THEN 1.0
            WHEN pa >= ph AND pa >= pd AND y_away = 1 THEN 1.0
            ELSE 0.0
          END)                                                                     AS hit_rate_1x2
    FROM base_norm
  ),
  -- ---- 3-WAY PER COMPETITION ----
  comp_3way AS (
    SELECT
      competition_name,
      COUNT(*)::integer AS n,
      AVG(POWER(ph - y_home, 2) + POWER(pd - y_draw, 2) + POWER(pa - y_away, 2)) AS mc_brier,
      AVG(-(y_home * LN(ph) + y_draw * LN(pd) + y_away * LN(pa)))                AS mc_log_loss,
      AVG(CASE
            WHEN ph >= pd AND ph >= pa AND y_home = 1 THEN 1.0
            WHEN pd >= ph AND pd >= pa AND y_draw = 1 THEN 1.0
            WHEN pa >= ph AND pa >= pd AND y_away = 1 THEN 1.0
            ELSE 0.0
          END)                                                                     AS hit_rate_1x2
    FROM base_norm
    GROUP BY competition_name
  ),
  -- ---- COMBINED: unpivot all metrics to (competition, season, tier, metric_name, value, n) ----
  all_slices AS (
    -- Overall binary
    SELECT competition_name, season_label, feature_quality_tier, n,
           'binary_brier_home'    AS metric_name, binary_brier        AS metric_value FROM overall_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'binary_log_loss_home', binary_log_loss                                     FROM overall_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'home_hit_rate',        home_hit_rate                                       FROM overall_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'avg_expected_home',    avg_exp_home                                        FROM overall_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'actual_home_rate',     actual_home_rate                                    FROM overall_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'calibration_gap_home', avg_exp_home - actual_home_rate                     FROM overall_metrics
    -- Overall 3-way
    UNION ALL
    SELECT '__overall__', NULL, '__all__', n,
           'multiclass_brier_1x2',    mc_brier     FROM overall_3way
    UNION ALL
    SELECT '__overall__', NULL, '__all__', n,
           'multiclass_log_loss_1x2', mc_log_loss  FROM overall_3way
    UNION ALL
    SELECT '__overall__', NULL, '__all__', n,
           'hit_rate_1x2',            hit_rate_1x2 FROM overall_3way
    -- Per-competition binary
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'binary_brier_home',     binary_brier         FROM comp_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'binary_log_loss_home',  binary_log_loss       FROM comp_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'home_hit_rate',         home_hit_rate         FROM comp_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'avg_expected_home',     avg_exp_home          FROM comp_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'actual_home_rate',      actual_home_rate      FROM comp_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'calibration_gap_home',  avg_exp_home - actual_home_rate FROM comp_metrics
    -- Per-competition 3-way
    UNION ALL
    SELECT competition_name, NULL, '__all__', n,
           'multiclass_brier_1x2',    mc_brier     FROM comp_3way
    UNION ALL
    SELECT competition_name, NULL, '__all__', n,
           'multiclass_log_loss_1x2', mc_log_loss  FROM comp_3way
    UNION ALL
    SELECT competition_name, NULL, '__all__', n,
           'hit_rate_1x2',            hit_rate_1x2 FROM comp_3way
    -- Per-tier binary
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'binary_brier_home',     binary_brier         FROM tier_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'binary_log_loss_home',  binary_log_loss       FROM tier_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'home_hit_rate',         home_hit_rate         FROM tier_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'avg_expected_home',     avg_exp_home          FROM tier_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'actual_home_rate',      actual_home_rate      FROM tier_metrics
    UNION ALL
    SELECT competition_name, season_label, feature_quality_tier, n,
           'calibration_gap_home',  avg_exp_home - actual_home_rate FROM tier_metrics
  )
  INSERT INTO model_lab.calibration_metric_results
    (run_id, competition_name, season_label, feature_quality_tier, metric_name, metric_value, sample_size)
  SELECT
    v_run_id,
    competition_name,
    season_label,
    feature_quality_tier,
    metric_name,
    ROUND(metric_value::numeric, 8),
    n
  FROM all_slices
  WHERE metric_value IS NOT NULL
  ON CONFLICT (run_id, competition_name, season_label, feature_quality_tier, metric_name)
    DO NOTHING;

  -- --------------------------------------------------------
  -- 4. Bucketed calibration — overall + per competition
  -- --------------------------------------------------------
  WITH base_bin AS (
    SELECT
      competition_name,
      feature_quality_tier,
      LEAST(GREATEST(expected_home_elo, 1e-7), 1.0 - 1e-7)           AS p_home,
      CASE WHEN result_1x2 = 'H' THEN 1.0 ELSE 0.0 END               AS y_home,
      -- Assign to bucket
      CASE
        WHEN expected_home_elo <  0.10 THEN '0.00-0.10'
        WHEN expected_home_elo <  0.20 THEN '0.10-0.20'
        WHEN expected_home_elo <  0.30 THEN '0.20-0.30'
        WHEN expected_home_elo <  0.40 THEN '0.30-0.40'
        WHEN expected_home_elo <  0.50 THEN '0.40-0.50'
        WHEN expected_home_elo <  0.60 THEN '0.50-0.60'
        WHEN expected_home_elo <  0.70 THEN '0.60-0.70'
        WHEN expected_home_elo <  0.80 THEN '0.70-0.80'
        WHEN expected_home_elo <  0.90 THEN '0.80-0.90'
        ELSE                                '0.90-1.00'
      END                                                              AS bucket,
      CASE
        WHEN expected_home_elo <  0.10 THEN 0.00
        WHEN expected_home_elo <  0.20 THEN 0.10
        WHEN expected_home_elo <  0.30 THEN 0.20
        WHEN expected_home_elo <  0.40 THEN 0.30
        WHEN expected_home_elo <  0.50 THEN 0.40
        WHEN expected_home_elo <  0.60 THEN 0.50
        WHEN expected_home_elo <  0.70 THEN 0.60
        WHEN expected_home_elo <  0.80 THEN 0.70
        WHEN expected_home_elo <  0.90 THEN 0.80
        ELSE                                0.90
      END                                                              AS bkt_min,
      CASE
        WHEN expected_home_elo <  0.10 THEN 0.10
        WHEN expected_home_elo <  0.20 THEN 0.20
        WHEN expected_home_elo <  0.30 THEN 0.30
        WHEN expected_home_elo <  0.40 THEN 0.40
        WHEN expected_home_elo <  0.50 THEN 0.50
        WHEN expected_home_elo <  0.60 THEN 0.60
        WHEN expected_home_elo <  0.70 THEN 0.70
        WHEN expected_home_elo <  0.80 THEN 0.80
        WHEN expected_home_elo <  0.90 THEN 0.90
        ELSE                                1.00
      END                                                              AS bkt_max
    FROM model_lab.match_feature_matrix_v1
    WHERE feature_version = p_feature_version
      AND elo_version      = p_elo_version
      AND expected_home_elo IS NOT NULL
      AND result_1x2 IS NOT NULL
  ),
  -- Overall buckets
  buckets_overall AS (
    SELECT
      '__overall__'::text   AS competition_name,
      '__all__'::text       AS feature_quality_tier,
      bucket, bkt_min, bkt_max,
      COUNT(*)::integer                                     AS n,
      ROUND(AVG(p_home)::numeric, 6)                        AS avg_pred,
      ROUND(AVG(y_home)::numeric, 6)                        AS actual_rate
    FROM base_bin
    GROUP BY bucket, bkt_min, bkt_max
  ),
  -- Per-competition buckets
  buckets_comp AS (
    SELECT
      competition_name,
      '__all__'::text       AS feature_quality_tier,
      bucket, bkt_min, bkt_max,
      COUNT(*)::integer                                     AS n,
      ROUND(AVG(p_home)::numeric, 6)                        AS avg_pred,
      ROUND(AVG(y_home)::numeric, 6)                        AS actual_rate
    FROM base_bin
    GROUP BY competition_name, bucket, bkt_min, bkt_max
  ),
  all_buckets AS (
    SELECT * FROM buckets_overall
    UNION ALL
    SELECT * FROM buckets_comp
  )
  INSERT INTO model_lab.calibration_probability_buckets
    (run_id, competition_name, feature_quality_tier,
     probability_bucket, bucket_min, bucket_max,
     sample_size, avg_predicted_probability, actual_home_rate, calibration_gap)
  SELECT
    v_run_id,
    competition_name,
    feature_quality_tier,
    bucket,
    bkt_min,
    bkt_max,
    n,
    avg_pred,
    actual_rate,
    ROUND((avg_pred - actual_rate)::numeric, 6)
  FROM all_buckets
  WHERE n > 0
  ON CONFLICT (run_id, competition_name, feature_quality_tier, probability_bucket)
    DO NOTHING;

  -- --------------------------------------------------------
  -- 5. Return summary rows for immediate inspection
  -- --------------------------------------------------------
  RETURN QUERY
    SELECT
      (competition_name || ' | tier=' || feature_quality_tier)::text AS out_slice,
      metric_name::text                                               AS out_metric_name,
      metric_value::numeric                                           AS out_metric_value,
      sample_size::integer                                            AS out_sample_size
    FROM model_lab.calibration_metric_results
    WHERE run_id = v_run_id
      AND metric_name IN (
        'binary_brier_home', 'binary_log_loss_home', 'home_hit_rate',
        'calibration_gap_home', 'multiclass_brier_1x2', 'hit_rate_1x2'
      )
    ORDER BY competition_name, feature_quality_tier, metric_name;

END;
$$;
