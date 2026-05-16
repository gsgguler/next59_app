
/*
  # ELO V2 — COVID-Aware + Decay Evaluation Functions

  ## Summary
  Two lightweight evaluation functions using stored V1 ELO columns.

  1. ml_run_covid_aware_grid(): Tests era-stratified HA values.
     Uses per-match date logic to apply a reduced HA during COVID era.
     Candidates: global_ha x covid_ha combinations.

  2. ml_run_decay_eval(): Tests recency decay by weighting recent seasons'
     prediction errors more heavily in the Brier score, simulating what a
     decay-trained model would emphasize.
     Uses stored match_date to compute season recency weight.

  ## COVID Era Definition
  - pre_covid:  match_date < 2020-03-01
  - covid:      2020-03-01 <= match_date <= 2021-05-31 (empty stadium period)
  - post_covid: match_date > 2021-05-31

  ## Decay Evaluation Logic
  Rather than rerunning ELO with decay (which requires full iteration),
  decay evaluation computes:
  - Brier weighted by recency weight = 1 + decay_factor * seasons_from_end
  - This shows whether recent seasons are better/worse calibrated than older ones
  - If weighted Brier < unweighted, decay-training would likely help

  ## Notes
  - All reads from team_elo_snapshots elo_v1_domestic_2026_05
  - No rolling views, no feature matrix
  - Stores results in elo_optimization_runs + elo_optimization_results
*/

-- ============================================================
-- FUNCTION 1: COVID-aware HA grid
-- ============================================================
DROP FUNCTION IF EXISTS model_lab.ml_run_covid_aware_grid();

CREATE OR REPLACE FUNCTION model_lab.ml_run_covid_aware_grid()
RETURNS TABLE (
  out_version      text,
  out_global_ha    numeric,
  out_covid_ha     numeric,
  out_brier        numeric,
  out_cal_gap      numeric,
  out_covid_brier  numeric,
  out_covid_gap    numeric,
  out_n_total      integer,
  out_n_covid      integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_global_ha  numeric;
  v_covid_ha   numeric;
  v_vkey       text;
  v_run_id     uuid;
  v_n          integer;
BEGIN
  -- Test the most promising global HAs (0, 10, 20) × covid HAs (0, 5, 10)
  FOR v_global_ha IN SELECT unnest(ARRAY[0.0, 10.0, 20.0])
  LOOP
    FOR v_covid_ha IN SELECT unnest(ARRAY[0.0, 5.0, 10.0])
    LOOP
      -- Skip redundant: covid_ha >= global_ha when global is already low
      CONTINUE WHEN v_covid_ha > v_global_ha AND v_global_ha > 0;

      v_vkey := format('elo_v2_ha%s_covid%s_k20_covidaware',
                       v_global_ha::integer, v_covid_ha::integer);

      SELECT COUNT(*) INTO v_n
      FROM model_lab.team_elo_snapshots
      WHERE elo_version = 'elo_v1_domestic_2026_05'
        AND result_1x2 IS NOT NULL;

      INSERT INTO model_lab.elo_optimization_runs
        (version_key, home_advantage, k_factor, decay_mode, era_mode,
         covid_ha_override, match_count, notes)
      VALUES (
        v_vkey, v_global_ha, 20.0, 'none', 'covid_aware', v_covid_ha, v_n,
        format('COVID-aware: global_ha=%s covid_ha=%s k=20', v_global_ha, v_covid_ha)
      )
      ON CONFLICT (version_key) DO UPDATE
        SET match_count = EXCLUDED.match_count, created_at = now()
      RETURNING id INTO v_run_id;

      DELETE FROM model_lab.elo_optimization_results WHERE run_id = v_run_id;

      WITH src AS (
        SELECT
          competition_name,
          match_date,
          -- Apply era-aware HA
          LEAST(GREATEST(
            1.0 / (1.0 + POWER(10.0, (
              pre_match_elo_away - (
                pre_match_elo_home + CASE
                  WHEN match_date BETWEEN '2020-03-01' AND '2021-05-31' THEN v_covid_ha
                  ELSE v_global_ha
                END
              )
            ) / 400.0)),
            1e-7), 1.0 - 1e-7)                                     AS p_home,
          CASE WHEN result_1x2 = 'H' THEN 1.0 ELSE 0.0 END         AS y_home,
          CASE WHEN match_date BETWEEN '2020-03-01' AND '2021-05-31'
               THEN 'covid' ELSE 'non_covid' END                    AS era
        FROM model_lab.team_elo_snapshots
        WHERE elo_version = 'elo_v1_domestic_2026_05'
          AND pre_match_elo_home IS NOT NULL
          AND result_1x2 IS NOT NULL
      ),
      overall AS (
        SELECT '__overall__' AS cn, COUNT(*)::integer AS n,
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
      all_s AS (SELECT * FROM overall UNION ALL SELECT * FROM by_comp),
      up AS (
        SELECT cn,n,'binary_brier_home' AS m, brier AS v FROM all_s UNION ALL
        SELECT cn,n,'binary_log_loss_home', ll FROM all_s UNION ALL
        SELECT cn,n,'home_hit_rate', hr FROM all_s UNION ALL
        SELECT cn,n,'avg_expected_home', ap FROM all_s UNION ALL
        SELECT cn,n,'actual_home_rate', ar FROM all_s UNION ALL
        SELECT cn,n,'calibration_gap_home', ap-ar FROM all_s
      )
      INSERT INTO model_lab.elo_optimization_results
        (run_id, competition_name, metric_name, metric_value, sample_size)
      SELECT v_run_id, cn, m, ROUND(v::numeric,8), n
      FROM up WHERE v IS NOT NULL
      ON CONFLICT (run_id, competition_name, metric_name) DO NOTHING;

      -- Return: overall + covid-era breakdown
      RETURN QUERY
        SELECT
          v_vkey::text,
          v_global_ha,
          v_covid_ha,
          (SELECT ROUND(AVG(POWER(p_home-y_home,2))::numeric,8)
           FROM (SELECT
             LEAST(GREATEST(1.0/(1.0+POWER(10.0,(pre_match_elo_away-(pre_match_elo_home+
               CASE WHEN match_date BETWEEN '2020-03-01' AND '2021-05-31'
                    THEN v_covid_ha ELSE v_global_ha END))/400.0)),1e-7),0.999999) AS p_home,
             CASE WHEN result_1x2='H' THEN 1.0 ELSE 0.0 END AS y_home
           FROM model_lab.team_elo_snapshots
           WHERE elo_version='elo_v1_domestic_2026_05' AND pre_match_elo_home IS NOT NULL AND result_1x2 IS NOT NULL
           ) q),
          (SELECT ROUND((AVG(p_home)-AVG(y_home))::numeric,6)
           FROM (SELECT
             LEAST(GREATEST(1.0/(1.0+POWER(10.0,(pre_match_elo_away-(pre_match_elo_home+
               CASE WHEN match_date BETWEEN '2020-03-01' AND '2021-05-31'
                    THEN v_covid_ha ELSE v_global_ha END))/400.0)),1e-7),0.999999) AS p_home,
             CASE WHEN result_1x2='H' THEN 1.0 ELSE 0.0 END AS y_home
           FROM model_lab.team_elo_snapshots
           WHERE elo_version='elo_v1_domestic_2026_05' AND pre_match_elo_home IS NOT NULL AND result_1x2 IS NOT NULL
           ) q),
          -- COVID-era only metrics
          (SELECT ROUND(AVG(POWER(p_home-y_home,2))::numeric,8)
           FROM (SELECT
             LEAST(GREATEST(1.0/(1.0+POWER(10.0,(pre_match_elo_away-(pre_match_elo_home+v_covid_ha))/400.0)),1e-7),0.999999) AS p_home,
             CASE WHEN result_1x2='H' THEN 1.0 ELSE 0.0 END AS y_home
           FROM model_lab.team_elo_snapshots
           WHERE elo_version='elo_v1_domestic_2026_05'
             AND match_date BETWEEN '2020-03-01' AND '2021-05-31'
             AND pre_match_elo_home IS NOT NULL AND result_1x2 IS NOT NULL
           ) q),
          (SELECT ROUND((AVG(p_home)-AVG(y_home))::numeric,6)
           FROM (SELECT
             LEAST(GREATEST(1.0/(1.0+POWER(10.0,(pre_match_elo_away-(pre_match_elo_home+v_covid_ha))/400.0)),1e-7),0.999999) AS p_home,
             CASE WHEN result_1x2='H' THEN 1.0 ELSE 0.0 END AS y_home
           FROM model_lab.team_elo_snapshots
           WHERE elo_version='elo_v1_domestic_2026_05'
             AND match_date BETWEEN '2020-03-01' AND '2021-05-31'
             AND pre_match_elo_home IS NOT NULL AND result_1x2 IS NOT NULL
           ) q),
          v_n::integer,
          (SELECT COUNT(*)::integer FROM model_lab.team_elo_snapshots
           WHERE elo_version='elo_v1_domestic_2026_05'
             AND match_date BETWEEN '2020-03-01' AND '2021-05-31');

    END LOOP;
  END LOOP;
END;
$$;

-- ============================================================
-- FUNCTION 2: Recency decay evaluation
-- ============================================================
DROP FUNCTION IF EXISTS model_lab.ml_run_decay_eval();

CREATE OR REPLACE FUNCTION model_lab.ml_run_decay_eval()
RETURNS TABLE (
  out_decay_mode       text,
  out_version_key      text,
  out_brier_unweighted numeric,
  out_brier_weighted   numeric,
  out_recent_brier     numeric,
  out_old_brier        numeric,
  out_recent_cal_gap   numeric,
  out_old_cal_gap      numeric,
  out_n                integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_mode   text;
  v_vkey   text;
  v_run_id uuid;
  v_n      integer;
BEGIN
  -- Register decay mode variants in optimization_runs
  FOREACH v_mode IN ARRAY ARRAY['none','linear_decay','exponential_decay']
  LOOP
    v_vkey := format('elo_v2_ha20_k20_%s', v_mode);

    SELECT COUNT(*) INTO v_n
    FROM model_lab.team_elo_snapshots
    WHERE elo_version = 'elo_v1_domestic_2026_05' AND result_1x2 IS NOT NULL;

    INSERT INTO model_lab.elo_optimization_runs
      (version_key, home_advantage, k_factor, decay_mode, era_mode, match_count, notes)
    VALUES (
      v_vkey, 20.0, 20.0, v_mode, 'global', v_n,
      format('Decay eval: ha=20 k=20 decay=%s — recency-weighted Brier from V1 ELO', v_mode)
    )
    ON CONFLICT (version_key) DO UPDATE
      SET match_count = EXCLUDED.match_count, created_at = now()
    RETURNING id INTO v_run_id;

    DELETE FROM model_lab.elo_optimization_results WHERE run_id = v_run_id;

    -- Store overall metrics (same as HA=20 baseline)
    WITH src AS (
      SELECT
        competition_name,
        match_date,
        EXTRACT(year FROM match_date)::integer AS match_year,
        LEAST(GREATEST(
          1.0/(1.0+POWER(10.0,(pre_match_elo_away-(pre_match_elo_home+20.0))/400.0)),
          1e-7), 0.999999)                                          AS p_home,
        CASE WHEN result_1x2='H' THEN 1.0 ELSE 0.0 END            AS y_home
      FROM model_lab.team_elo_snapshots
      WHERE elo_version = 'elo_v1_domestic_2026_05'
        AND pre_match_elo_home IS NOT NULL AND result_1x2 IS NOT NULL
    ),
    all_s AS (
      SELECT '__overall__' AS cn, COUNT(*)::integer AS n,
        AVG(POWER(p_home-y_home,2)) AS brier,
        AVG(-(y_home*LN(p_home)+(1-y_home)*LN(1-p_home))) AS ll,
        AVG(CASE WHEN p_home>=0.5 AND y_home=1 THEN 1.0
                 WHEN p_home< 0.5 AND y_home=0 THEN 1.0 ELSE 0.0 END) AS hr,
        AVG(p_home) AS ap, AVG(y_home) AS ar
      FROM src
    ),
    up AS (
      SELECT cn,n,'binary_brier_home' AS m,brier AS v FROM all_s UNION ALL
      SELECT cn,n,'binary_log_loss_home',ll FROM all_s UNION ALL
      SELECT cn,n,'home_hit_rate',hr FROM all_s UNION ALL
      SELECT cn,n,'avg_expected_home',ap FROM all_s UNION ALL
      SELECT cn,n,'actual_home_rate',ar FROM all_s UNION ALL
      SELECT cn,n,'calibration_gap_home',ap-ar FROM all_s
    )
    INSERT INTO model_lab.elo_optimization_results
      (run_id, competition_name, metric_name, metric_value, sample_size)
    SELECT v_run_id, cn, m, ROUND(v::numeric,8), n
    FROM up WHERE v IS NOT NULL
    ON CONFLICT (run_id, competition_name, metric_name) DO NOTHING;

    -- Return decay-stratified metrics
    RETURN QUERY
      WITH base AS (
        SELECT
          match_date,
          LEAST(GREATEST(
            1.0/(1.0+POWER(10.0,(pre_match_elo_away-(pre_match_elo_home+20.0))/400.0)),
            1e-7), 0.999999)                                        AS p_home,
          CASE WHEN result_1x2='H' THEN 1.0 ELSE 0.0 END          AS y_home,
          -- Recency weight: recent seasons get higher weight
          CASE v_mode
            WHEN 'none'              THEN 1.0
            WHEN 'linear_decay'      THEN
              GREATEST(0.5, 1.0 + (EXTRACT(year FROM match_date) - 2000.0) * 0.04)
            WHEN 'exponential_decay' THEN
              POWER(1.03, EXTRACT(year FROM match_date) - 2000.0)
          END                                                       AS w
        FROM model_lab.team_elo_snapshots
        WHERE elo_version = 'elo_v1_domestic_2026_05'
          AND pre_match_elo_home IS NOT NULL AND result_1x2 IS NOT NULL
      )
      SELECT
        v_mode::text,
        v_vkey::text,
        ROUND(AVG(POWER(p_home-y_home,2))::numeric, 8),
        ROUND((SUM(w*POWER(p_home-y_home,2))/SUM(w))::numeric, 8),
        -- Recent: post-2020
        ROUND(AVG(CASE WHEN match_date > '2020-01-01' THEN POWER(p_home-y_home,2) END)::numeric, 8),
        -- Old: pre-2010
        ROUND(AVG(CASE WHEN match_date < '2010-01-01' THEN POWER(p_home-y_home,2) END)::numeric, 8),
        -- Recent cal gap
        ROUND(AVG(CASE WHEN match_date > '2020-01-01' THEN p_home - y_home END)::numeric, 6),
        -- Old cal gap
        ROUND(AVG(CASE WHEN match_date < '2010-01-01' THEN p_home - y_home END)::numeric, 6),
        COUNT(*)::integer
      FROM base;

  END LOOP;
END;
$$;
