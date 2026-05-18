/*
  # Live Memory Engine — Phase 4: Calibration Feature Columns

  Extends model_lab.live_match_states with memory-informed confidence modifiers.
  These are NOT predictions — they are pattern-based reliability signals derived
  from historical live state outcomes.

  ## New Columns on live_match_states

  - historically_high_goal_pressure  boolean: pattern memory shows >30% goal-follow rate for this state+bucket
  - unreliable_chaos_signal          boolean: chaos_score high but false_confidence_rate > 40% for this state
  - strong_comeback_state            boolean: comeback_rate > 25% for this state+bucket
  - low_reliability_state            boolean: calibration_score < 0.2 OR low_sample_warning = true
  - historically_false_signal        boolean: false_confidence_rate > 35% for this state+bucket
  - pattern_sample_size              integer: how many historical snapshots back this calibration
  - calibration_tag                  text: compact label ('reliable' | 'low_sample' | 'noisy' | 'false_signal')

  ## New Admin RPC Functions

  ### public.admin_get_live_pattern_memory_summary()
  Returns per-state summary for Daily Monitor (Phase 6).

  ### public.admin_get_live_state_outcomes_sample(p_limit int)
  Returns recent outcome rows with evaluation for monitoring.

  ## Notes
  - Column additions are additive only (no data loss)
  - Pattern enrichment applied by run_live_match_engine() in Phase 7
*/

-- ── Extend live_match_states ──────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='model_lab' AND table_name='live_match_states'
    AND column_name='historically_high_goal_pressure') THEN
    ALTER TABLE model_lab.live_match_states
      ADD COLUMN historically_high_goal_pressure boolean,
      ADD COLUMN unreliable_chaos_signal          boolean,
      ADD COLUMN strong_comeback_state            boolean,
      ADD COLUMN low_reliability_state            boolean,
      ADD COLUMN historically_false_signal        boolean,
      ADD COLUMN pattern_sample_size              integer,
      ADD COLUMN calibration_tag                  text;
  END IF;
END $$;

-- ── Same columns for live_match_state_history (so history retains snapshot) ───

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='model_lab' AND table_name='live_match_state_history'
    AND column_name='historically_high_goal_pressure') THEN
    ALTER TABLE model_lab.live_match_state_history
      ADD COLUMN historically_high_goal_pressure boolean,
      ADD COLUMN unreliable_chaos_signal          boolean,
      ADD COLUMN strong_comeback_state            boolean,
      ADD COLUMN low_reliability_state            boolean,
      ADD COLUMN historically_false_signal        boolean,
      ADD COLUMN pattern_sample_size              integer,
      ADD COLUMN calibration_tag                  text;
  END IF;
END $$;

-- ── Admin RPC: live pattern memory summary ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_live_pattern_memory_summary()
RETURNS TABLE(
  current_live_state        text,
  minute_bucket             text,
  competition_season_id     uuid,
  sample_size               integer,
  low_sample_warning        boolean,
  goal_follow_rate_5min     numeric,
  goal_follow_rate_10min    numeric,
  comeback_rate             numeric,
  false_confidence_rate     numeric,
  calibration_score         numeric,
  chaos_reliability_score   numeric,
  late_goal_rate            numeric,
  strongest_pressure_bucket text,
  updated_at                timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT
    pm.current_live_state,
    pm.minute_bucket,
    pm.competition_season_id,
    pm.sample_size,
    pm.low_sample_warning,
    pm.goal_follow_rate_5min,
    pm.goal_follow_rate_10min,
    pm.comeback_rate,
    pm.false_confidence_rate,
    pm.calibration_score,
    pm.chaos_reliability_score,
    pm.late_goal_rate,
    pm.strongest_pressure_bucket,
    pm.updated_at
  FROM model_lab.live_state_pattern_memory pm
  ORDER BY pm.sample_size DESC NULLS LAST, pm.current_live_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_live_pattern_memory_summary() TO authenticated;

-- ── Admin RPC: live state outcomes sample ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_live_state_outcomes_sample(
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  fixture_id                uuid,
  api_football_fixture_id   integer,
  elapsed                   integer,
  current_live_state        text,
  state_confidence          text,
  chaos_score               numeric,
  late_goal_pressure        numeric,
  desperation_level         numeric,
  goal_in_next_5min         boolean,
  goal_in_next_10min        boolean,
  comeback_occurred         boolean,
  was_false_live_confidence boolean,
  final_result              text,
  evaluated_at              timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT
    lso.fixture_id,
    lso.api_football_fixture_id,
    lso.elapsed,
    lso.current_live_state,
    lso.state_confidence,
    lso.chaos_score,
    lso.late_goal_pressure,
    lso.desperation_level,
    lso.goal_in_next_5min,
    lso.goal_in_next_10min,
    lso.comeback_occurred,
    lso.was_false_live_confidence,
    lso.final_result,
    lso.evaluated_at
  FROM model_lab.live_state_outcomes lso
  WHERE lso.evaluated_at IS NOT NULL
  ORDER BY lso.evaluated_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_live_state_outcomes_sample(integer) TO authenticated;

COMMENT ON FUNCTION public.admin_get_live_pattern_memory_summary IS
  'Returns aggregated live state pattern memory for admin Daily Monitor.';
COMMENT ON FUNCTION public.admin_get_live_state_outcomes_sample IS
  'Returns recent evaluated live state outcome rows for admin inspection.';
