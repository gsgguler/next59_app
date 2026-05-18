/*
  # Live Memory Engine — Phase 3: Pattern Aggregation Function

  Creates model_lab.refresh_live_state_pattern_memory()

  ## Purpose
  Aggregates live_state_outcomes by (competition_season_id, current_live_state, minute_bucket)
  to produce calibration statistics that power Phase 5 (live engine self-awareness).

  ## Aggregation Logic
  For each (competition_season_id, state, minute_bucket) grouping:
  - goal_follow_rate_5min   = rows where goal_in_next_5min = true / total
  - goal_follow_rate_10min  = rows where goal_in_next_10min = true / total
  - comeback_rate           = rows where comeback_occurred = true / rows where trailing
  - chaos_reliability_score = 1 - false_confidence_rate  (1 = fully reliable, 0 = all false signals)
  - late_goal_rate          = rows where late_goal_occurred = true / total
  - false_confidence_rate   = rows where was_false_live_confidence = true / total
  - calibration_score       = harmonic mean of (1 - false_confidence_rate) and goal reliability

  ## Minute Buckets
  0-14, 15-29, 30-44, 45-59, 60-74, 75-90, 90+

  ## Minimum Sample Threshold
  low_sample_warning = true when sample_size < 30

  ## Notes
  - Runs as UPSERT into live_state_pattern_memory
  - Also aggregates a NULL competition_season_id row for cross-league patterns
  - Returns row counts for monitoring
*/

CREATE OR REPLACE FUNCTION model_lab.refresh_live_state_pattern_memory()
RETURNS TABLE(states_refreshed integer, rows_upserted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_states_refreshed integer := 0;
  v_rows_upserted    integer := 0;
BEGIN

  -- Per-competition aggregation
  WITH base AS (
    SELECT
      competition_season_id,
      current_live_state,
      CASE
        WHEN elapsed < 15  THEN '0-14'
        WHEN elapsed < 30  THEN '15-29'
        WHEN elapsed < 45  THEN '30-44'
        WHEN elapsed < 60  THEN '45-59'
        WHEN elapsed < 75  THEN '60-74'
        WHEN elapsed <= 90 THEN '75-90'
        ELSE '90+'
      END AS minute_bucket,
      COUNT(*) AS n,
      ROUND(COUNT(*) FILTER (WHERE goal_in_next_5min  = true)::numeric / NULLIF(COUNT(*),0), 4) AS gf5,
      ROUND(COUNT(*) FILTER (WHERE goal_in_next_10min = true)::numeric / NULLIF(COUNT(*),0), 4) AS gf10,
      -- comeback: only meaningful where trailing
      ROUND(
        COUNT(*) FILTER (WHERE comeback_occurred = true AND leading_team != 'draw')::numeric
        / NULLIF(COUNT(*) FILTER (WHERE leading_team != 'draw'), 0), 4
      ) AS comeback,
      ROUND(COUNT(*) FILTER (WHERE late_goal_occurred  = true)::numeric / NULLIF(COUNT(*),0), 4) AS late_goal,
      ROUND(COUNT(*) FILTER (WHERE was_false_live_confidence = true)::numeric / NULLIF(COUNT(*),0), 4) AS false_conf,
      -- strongest pressure bucket
      CASE
        WHEN COUNT(*) FILTER (WHERE live_pressure_index_home > 0.6) >
             COUNT(*) FILTER (WHERE live_pressure_index_away > 0.6) THEN 'home_dominant'
        WHEN COUNT(*) FILTER (WHERE live_pressure_index_away > 0.6) >
             COUNT(*) FILTER (WHERE live_pressure_index_home > 0.6) THEN 'away_dominant'
        ELSE 'balanced'
      END AS pressure_bucket
    FROM model_lab.live_state_outcomes
    WHERE evaluated_at IS NOT NULL
    GROUP BY competition_season_id, current_live_state, minute_bucket
  ),
  -- Cross-league aggregate (competition_season_id = NULL)
  global_base AS (
    SELECT
      NULL::uuid AS competition_season_id,
      current_live_state,
      CASE
        WHEN elapsed < 15  THEN '0-14'
        WHEN elapsed < 30  THEN '15-29'
        WHEN elapsed < 45  THEN '30-44'
        WHEN elapsed < 60  THEN '45-59'
        WHEN elapsed < 75  THEN '60-74'
        WHEN elapsed <= 90 THEN '75-90'
        ELSE '90+'
      END AS minute_bucket,
      COUNT(*) AS n,
      ROUND(COUNT(*) FILTER (WHERE goal_in_next_5min  = true)::numeric / NULLIF(COUNT(*),0), 4) AS gf5,
      ROUND(COUNT(*) FILTER (WHERE goal_in_next_10min = true)::numeric / NULLIF(COUNT(*),0), 4) AS gf10,
      ROUND(
        COUNT(*) FILTER (WHERE comeback_occurred = true AND leading_team != 'draw')::numeric
        / NULLIF(COUNT(*) FILTER (WHERE leading_team != 'draw'), 0), 4
      ) AS comeback,
      ROUND(COUNT(*) FILTER (WHERE late_goal_occurred  = true)::numeric / NULLIF(COUNT(*),0), 4) AS late_goal,
      ROUND(COUNT(*) FILTER (WHERE was_false_live_confidence = true)::numeric / NULLIF(COUNT(*),0), 4) AS false_conf,
      CASE
        WHEN COUNT(*) FILTER (WHERE live_pressure_index_home > 0.6) >
             COUNT(*) FILTER (WHERE live_pressure_index_away > 0.6) THEN 'home_dominant'
        WHEN COUNT(*) FILTER (WHERE live_pressure_index_away > 0.6) >
             COUNT(*) FILTER (WHERE live_pressure_index_home > 0.6) THEN 'away_dominant'
        ELSE 'balanced'
      END AS pressure_bucket
    FROM model_lab.live_state_outcomes
    WHERE evaluated_at IS NOT NULL
    GROUP BY current_live_state, minute_bucket
  ),
  combined AS (
    SELECT * FROM base
    UNION ALL
    SELECT * FROM global_base
  )
  INSERT INTO model_lab.live_state_pattern_memory (
    competition_season_id,
    current_live_state,
    minute_bucket,
    sample_size,
    low_sample_warning,
    goal_follow_rate_5min,
    goal_follow_rate_10min,
    comeback_rate,
    chaos_reliability_score,
    late_goal_rate,
    false_confidence_rate,
    calibration_score,
    strongest_pressure_bucket,
    updated_at
  )
  SELECT
    competition_season_id,
    current_live_state,
    minute_bucket,
    n::integer,
    (n < 30),
    gf5,
    gf10,
    comeback,
    -- chaos reliability = 1 - false confidence
    ROUND(1.0 - COALESCE(false_conf, 0), 4),
    late_goal,
    false_conf,
    -- calibration_score = harmonic mean of reliability and goal-follow-10min
    CASE
      WHEN COALESCE(gf10, 0) + (1.0 - COALESCE(false_conf, 0)) > 0
      THEN ROUND(
        2.0 * (1.0 - COALESCE(false_conf, 0)) * COALESCE(gf10, 0)
        / NULLIF((1.0 - COALESCE(false_conf, 0)) + COALESCE(gf10, 0), 0), 4
      )
      ELSE 0.0
    END,
    pressure_bucket,
    now()
  FROM combined
  ON CONFLICT (competition_season_id, current_live_state, minute_bucket) DO UPDATE SET
    sample_size               = EXCLUDED.sample_size,
    low_sample_warning        = EXCLUDED.low_sample_warning,
    goal_follow_rate_5min     = EXCLUDED.goal_follow_rate_5min,
    goal_follow_rate_10min    = EXCLUDED.goal_follow_rate_10min,
    comeback_rate             = EXCLUDED.comeback_rate,
    chaos_reliability_score   = EXCLUDED.chaos_reliability_score,
    late_goal_rate            = EXCLUDED.late_goal_rate,
    false_confidence_rate     = EXCLUDED.false_confidence_rate,
    calibration_score         = EXCLUDED.calibration_score,
    strongest_pressure_bucket = EXCLUDED.strongest_pressure_bucket,
    updated_at                = now();

  GET DIAGNOSTICS v_rows_upserted = ROW_COUNT;

  SELECT COUNT(DISTINCT current_live_state) INTO v_states_refreshed
  FROM model_lab.live_state_pattern_memory;

  RETURN QUERY SELECT v_states_refreshed, v_rows_upserted;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.refresh_live_state_pattern_memory() TO service_role;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.admin_refresh_live_pattern_memory()
RETURNS TABLE(states_refreshed integer, rows_upserted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM model_lab.refresh_live_state_pattern_memory();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_refresh_live_pattern_memory() TO authenticated;

-- Schedule daily pattern memory refresh (2 AM UTC)
SELECT cron.schedule(
  'live-pattern-memory-daily-2am',
  '0 2 * * *',
  $$SELECT model_lab.refresh_live_state_pattern_memory()$$
);

COMMENT ON FUNCTION model_lab.refresh_live_state_pattern_memory IS
  'Aggregate live_state_outcomes into pattern_memory. Idempotent, upsert-based. Minimum 30 samples for reliable output.';
