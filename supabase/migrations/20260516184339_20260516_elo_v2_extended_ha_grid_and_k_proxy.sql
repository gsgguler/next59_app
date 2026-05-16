
/*
  # ELO V2 Optimization — Extended HA Grid + K-factor Proxy Evaluation

  ## Summary
  Two functions:

  1. ml_run_ha_grid_v2(): Extends the HA sensitivity to include HA=0, 10, 15
     in addition to 20-60, using direct ELO recomputation from stored columns.
     Registers results in elo_optimization_results.
     Uses run_key pattern matching elo_v2_haNN_k20_global.

  2. ml_analyze_k_factor_proxy(): Measures ELO rating variance and convergence
     speed as a proxy for K-factor sensitivity.
     Higher K → faster convergence but more variance (noisier probabilities).
     Returns per-K-factor statistics to inform the optimal K range
     without needing full reruns.

  ## Notes
  - HA grid uses p_home = 1/(1+10^((elo_away-(elo_home+HA))/400))
    recomputed from pre_match_elo_home/away stored in V1 snapshots
  - K-factor proxy uses elo_delta_home distribution from V1 as baseline,
    then scales by K_candidate/K_v1 to estimate volatility at each K
  - Both functions are lightweight — no PL/pgSQL loops over 66k rows
*/

-- ============================================================
-- FUNCTION 1: Extended HA grid evaluation
-- ============================================================
DROP FUNCTION IF EXISTS model_lab.ml_run_ha_grid_v2();

CREATE OR REPLACE FUNCTION model_lab.ml_run_ha_grid_v2()
RETURNS TABLE (
  out_ha       numeric,
  out_version  text,
  out_brier    numeric,
  out_cal_gap  numeric,
  out_n        integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_ha      numeric;
  v_vkey    text;
  v_run_id  uuid;
  v_n       integer;
BEGIN
  FOREACH v_ha IN ARRAY ARRAY[0.0, 10.0, 15.0, 20.0, 30.0, 40.0, 50.0, 60.0]
  LOOP
    v_vkey := format('elo_v2_ha%s_k20_global', v_ha::integer);

    SELECT COUNT(*) INTO v_n
    FROM model_lab.team_elo_snapshots
    WHERE elo_version = 'elo_v1_domestic_2026_05'
      AND result_1x2 IS NOT NULL
      AND pre_match_elo_home IS NOT NULL;

    INSERT INTO model_lab.elo_optimization_runs
      (version_key, home_advantage, k_factor, decay_mode, era_mode, match_count, notes)
    VALUES (
      v_vkey, v_ha, 20.0, 'none', 'global', v_n,
      format('HA grid eval: ha=%s k=20 — recomputed from V1 ELO columns', v_ha)
    )
    ON CONFLICT (version_key) DO UPDATE
      SET match_count = EXCLUDED.match_count,
          notes       = EXCLUDED.notes,
          created_at  = now()
    RETURNING id INTO v_run_id;

    DELETE FROM model_lab.elo_optimization_results WHERE run_id = v_run_id;

    -- Evaluate: recompute p_home at this HA using V1 pre_match ELO values
    WITH src AS (
      SELECT
        competition_name,
        LEAST(GREATEST(
          1.0 / (1.0 + POWER(10.0, (pre_match_elo_away - (pre_match_elo_home + v_ha)) / 400.0)),
          1e-7), 1.0 - 1e-7)                                        AS p_home,
        CASE WHEN result_1x2 = 'H' THEN 1.0 ELSE 0.0 END           AS y_home
      FROM model_lab.team_elo_snapshots
      WHERE elo_version = 'elo_v1_domestic_2026_05'
        AND pre_match_elo_home IS NOT NULL
        AND pre_match_elo_away IS NOT NULL
        AND result_1x2 IS NOT NULL
    ),
    overall AS (
      SELECT '__overall__'::text AS cn, COUNT(*)::integer AS n,
        AVG(POWER(p_home-y_home,2)) AS brier,
        AVG(-(y_home*LN(p_home)+(1-y_home)*LN(1-p_home))) AS ll,
        AVG(CASE WHEN p_home>=0.5 AND y_home=1 THEN 1.0
                 WHEN p_home< 0.5 AND y_home=0 THEN 1.0 ELSE 0.0 END) AS hr,
        AVG(p_home) AS ap, AVG(y_home) AS ar
      FROM src
    ),
    by_comp AS (
      SELECT competition_name AS cn, COUNT(*)::integer AS n,
        AVG(POWER(p_home-y_home,2)) AS brier,
        AVG(-(y_home*LN(p_home)+(1-y_home)*LN(1-p_home))) AS ll,
        AVG(CASE WHEN p_home>=0.5 AND y_home=1 THEN 1.0
                 WHEN p_home< 0.5 AND y_home=0 THEN 1.0 ELSE 0.0 END) AS hr,
        AVG(p_home) AS ap, AVG(y_home) AS ar
      FROM src GROUP BY competition_name
    ),
    all_slices AS (SELECT * FROM overall UNION ALL SELECT * FROM by_comp),
    unpivoted AS (
      SELECT cn, n, 'binary_brier_home'    AS m, brier    AS v FROM all_slices UNION ALL
      SELECT cn, n, 'binary_log_loss_home',        ll              FROM all_slices UNION ALL
      SELECT cn, n, 'home_hit_rate',               hr              FROM all_slices UNION ALL
      SELECT cn, n, 'avg_expected_home',           ap              FROM all_slices UNION ALL
      SELECT cn, n, 'actual_home_rate',            ar              FROM all_slices UNION ALL
      SELECT cn, n, 'calibration_gap_home',        ap - ar         FROM all_slices
    )
    INSERT INTO model_lab.elo_optimization_results
      (run_id, competition_name, metric_name, metric_value, sample_size)
    SELECT v_run_id, cn, m, ROUND(v::numeric,8), n
    FROM unpivoted WHERE v IS NOT NULL
    ON CONFLICT (run_id, competition_name, metric_name) DO NOTHING;

    RETURN QUERY
      SELECT v_ha, v_vkey,
        MAX(CASE WHEN metric_name='binary_brier_home'    THEN metric_value END)::numeric,
        MAX(CASE WHEN metric_name='calibration_gap_home' THEN metric_value END)::numeric,
        MAX(sample_size)::integer
      FROM model_lab.elo_optimization_results
      WHERE run_id = v_run_id AND competition_name = '__overall__'
      GROUP BY v_ha, v_vkey;

  END LOOP;
END;
$$;

-- ============================================================
-- FUNCTION 2: K-factor proxy analysis
-- ============================================================
DROP FUNCTION IF EXISTS model_lab.ml_analyze_k_factor_proxy();

CREATE OR REPLACE FUNCTION model_lab.ml_analyze_k_factor_proxy()
RETURNS TABLE (
  out_k_factor          numeric,
  out_version_key       text,
  out_avg_delta_abs     numeric,
  out_stddev_delta      numeric,
  out_p90_delta_abs     numeric,
  out_avg_elo_spread    numeric,
  out_brier_estimate    numeric,
  out_notes             text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
  WITH v1_base AS (
    SELECT
      ABS(elo_delta_home)                AS abs_delta,
      elo_delta_home,
      pre_match_elo_home,
      pre_match_elo_away,
      result_1x2,
      k_factor                           AS v1_k
    FROM model_lab.team_elo_snapshots
    WHERE elo_version = 'elo_v1_domestic_2026_05'
      AND elo_delta_home IS NOT NULL
  ),
  -- For each candidate K, scale deltas proportionally: delta_k = delta_v1 * (k/v1_k)
  -- Use scaled p_home via original ELO spread (HA=20 baseline)
  k_candidates AS (
    SELECT unnest(ARRAY[20.0, 30.0, 40.0]) AS k_cand
  ),
  scaled AS (
    SELECT
      kc.k_cand,
      b.abs_delta * (kc.k_cand / b.v1_k)              AS scaled_abs_delta,
      b.elo_delta_home * (kc.k_cand / b.v1_k)         AS scaled_delta,
      b.pre_match_elo_home,
      b.pre_match_elo_away,
      b.result_1x2
    FROM v1_base b CROSS JOIN k_candidates kc
  ),
  -- Brier estimate: use stored expected_home from V1 (HA=20 recomputed)
  brier_est AS (
    SELECT
      kc.k_cand,
      AVG(POWER(
        LEAST(GREATEST(
          1.0/(1.0+POWER(10.0,(b.pre_match_elo_away-(b.pre_match_elo_home+20.0))/400.0)),
          1e-7),0.999999)
        - CASE WHEN b.result_1x2='H' THEN 1.0 ELSE 0.0 END, 2
      )) AS brier
    FROM v1_base b CROSS JOIN k_candidates kc
    GROUP BY kc.k_cand
  ),
  stats AS (
    SELECT
      s.k_cand,
      AVG(s.scaled_abs_delta)                          AS avg_abs,
      STDDEV(s.scaled_delta)                           AS sd,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY s.scaled_abs_delta) AS p90,
      AVG(ABS(s.pre_match_elo_home - s.pre_match_elo_away))           AS avg_spread
    FROM scaled s
    GROUP BY s.k_cand
  )
  SELECT
    s.k_cand,
    format('elo_v2_ha20_k%s_global', s.k_cand::integer)::text,
    ROUND(s.avg_abs::numeric, 4),
    ROUND(s.sd::numeric, 4),
    ROUND(s.p90::numeric, 4),
    ROUND(s.avg_spread::numeric, 4),
    ROUND(b.brier::numeric, 6),
    CASE
      WHEN s.k_cand = 20 THEN 'baseline (V1); stable convergence'
      WHEN s.k_cand = 30 THEN '+50% volatility; faster adaptation to form changes'
      WHEN s.k_cand = 40 THEN '+100% volatility; high noise risk in short seasons'
    END::text
  FROM stats s
  JOIN brier_est b ON b.k_cand = s.k_cand
  ORDER BY s.k_cand;
$$;
