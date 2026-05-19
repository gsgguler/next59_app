/*
  # WC2026 Match Scenario Dashboard RPCs

  ## Summary
  Creates two helper RPCs for the admin scenario dashboard:

  1. `wc2026_get_fixture_scenario_status` — returns every fixture with its
     latest scenario calibration row (if any), home/away calibration
     availability, and a per-fixture readiness status.  TBD knockout
     fixtures (null home/away team) are returned with status = 'tbd'
     and no crash.

  2. `wc2026_run_batch_scenarios` — runs `wc2026_compute_match_scenario`
     for up to `p_limit` named (non-TBD) fixtures that do NOT already
     have a scenario, writing audit results to wc2026_calibration_runs.
     Default limit is 3 for safe test runs; set to 999 to process all.

  ## Security
  Both functions are SECURITY DEFINER, search_path locked, granted to
  authenticated role only (admin check enforced at UI layer via RLS on
  wc2026_team_calibration_profiles).
*/

-- ─── 1. wc2026_get_fixture_scenario_status ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_get_fixture_scenario_status()
RETURNS TABLE (
  api_football_fixture_id   bigint,
  match_date                timestamptz,
  stage_code                text,
  group_label               text,
  home_team_name            text,
  away_team_name            text,
  home_team_placeholder     text,
  away_team_placeholder     text,
  home_api_team_id          integer,
  away_api_team_id          integer,
  is_tbd                    boolean,
  -- scenario calibration (latest row, null if not yet computed)
  scenario_id               uuid,
  home_win_probability      numeric,
  draw_probability          numeric,
  away_win_probability      numeric,
  predicted_score_home      integer,
  predicted_score_away      integer,
  first_15_tempo            text,
  first_half_pressure       numeric,
  second_half_fatigue       numeric,
  late_goal_probability     numeric,
  comeback_probability      numeric,
  wc2026_late_goal_risk     numeric,
  wc2026_chaos_probability  numeric,
  wc2026_fatigue_risk       numeric,
  wc2026_scenario_confidence numeric,
  scenario_confidence       text,
  missing_data_warnings     jsonb,
  calibrated_at             timestamptz,
  -- team calibration availability
  home_calib_confidence     text,
  away_calib_confidence     text,
  home_calib_missing        boolean,
  away_calib_missing        boolean,
  -- derived status
  fixture_status            text   -- 'tbd' | 'pending' | 'calibrated' | 'missing_teams'
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest_scenarios AS (
    SELECT DISTINCT ON (api_football_fixture_id)
      id,
      api_football_fixture_id,
      home_win_probability,
      draw_probability,
      away_win_probability,
      predicted_score_home,
      predicted_score_away,
      first_15_tempo,
      first_15_pressure,
      second_half_fatigue_factor,
      late_goal_probability,
      comeback_probability,
      wc2026_late_goal_risk,
      wc2026_chaos_probability,
      wc2026_fatigue_risk,
      wc2026_scenario_confidence,
      calibration_confidence,
      missing_data_warnings,
      calibrated_at
    FROM public.wc2026_match_scenario_calibration
    ORDER BY api_football_fixture_id, calibrated_at DESC
  ),

  team_calibrations AS (
    SELECT DISTINCT ON (api_football_team_id)
      api_football_team_id,
      team_name,
      calibration_confidence
    FROM public.wc2026_team_calibration_profiles
    ORDER BY api_football_team_id, calibrated_at DESC
  )

  SELECT
    f.api_football_fixture_id::bigint,
    f.match_date,
    f.stage_code,
    f.group_label,
    f.home_team_name,
    f.away_team_name,
    f.home_team_placeholder,
    f.away_team_placeholder,
    f.home_api_team_id,
    f.away_api_team_id,

    -- is TBD if either team name is null
    (f.home_team_name IS NULL OR f.away_team_name IS NULL) AS is_tbd,

    -- scenario columns (null if not yet computed)
    s.id                             AS scenario_id,
    s.home_win_probability,
    s.draw_probability,
    s.away_win_probability,
    s.predicted_score_home,
    s.predicted_score_away,
    s.first_15_tempo,
    s.first_15_pressure              AS first_half_pressure,
    s.second_half_fatigue_factor     AS second_half_fatigue,
    s.late_goal_probability,
    s.comeback_probability,
    s.wc2026_late_goal_risk,
    s.wc2026_chaos_probability,
    s.wc2026_fatigue_risk,
    s.wc2026_scenario_confidence,
    s.calibration_confidence         AS scenario_confidence,
    s.missing_data_warnings,
    s.calibrated_at,

    -- team calibration availability
    hc.calibration_confidence        AS home_calib_confidence,
    ac.calibration_confidence        AS away_calib_confidence,
    (hc.api_football_team_id IS NULL) AS home_calib_missing,
    (ac.api_football_team_id IS NULL) AS away_calib_missing,

    -- fixture status
    CASE
      WHEN f.home_team_name IS NULL OR f.away_team_name IS NULL THEN 'tbd'
      WHEN s.id IS NOT NULL                                      THEN 'calibrated'
      WHEN hc.api_football_team_id IS NULL
        OR ac.api_football_team_id IS NULL                       THEN 'missing_teams'
      ELSE 'pending'
    END AS fixture_status

  FROM public.wc2026_fixtures f
  LEFT JOIN latest_scenarios s
         ON s.api_football_fixture_id = f.api_football_fixture_id
  LEFT JOIN team_calibrations hc
         ON hc.api_football_team_id = f.home_api_team_id
  LEFT JOIN team_calibrations ac
         ON ac.api_football_team_id = f.away_api_team_id
  ORDER BY f.match_date ASC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_fixture_scenario_status() TO authenticated;


-- ─── 2. wc2026_run_batch_scenarios ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_run_batch_scenarios(
  p_limit        integer DEFAULT 3,
  p_triggered_by text    DEFAULT 'admin_ui'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id        uuid := gen_random_uuid();
  v_fixture       record;
  v_processed     integer := 0;
  v_created       integer := 0;
  v_skipped_tbd   integer := 0;
  v_errors        integer := 0;
  v_error_msgs    text[]  := ARRAY[]::text[];
  v_result_id     uuid;
BEGIN
  -- Insert run record
  INSERT INTO public.wc2026_calibration_runs (
    id, run_type, triggered_by, run_status, teams_processed, teams_updated, teams_skipped, started_at
  ) VALUES (
    v_run_id, 'scenario_batch', p_triggered_by, 'running', 0, 0, 0, now()
  );

  -- Loop over named, not-yet-calibrated fixtures up to limit
  FOR v_fixture IN
    SELECT f.api_football_fixture_id
    FROM public.wc2026_fixtures f
    WHERE f.home_team_name IS NOT NULL
      AND f.away_team_name IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.wc2026_match_scenario_calibration sc
        WHERE sc.api_football_fixture_id = f.api_football_fixture_id
      )
    ORDER BY f.match_date ASC NULLS LAST
    LIMIT p_limit
  LOOP
    v_processed := v_processed + 1;
    BEGIN
      SELECT public.wc2026_compute_match_scenario(
        v_fixture.api_football_fixture_id::integer,
        v_run_id
      ) INTO v_result_id;

      IF v_result_id IS NOT NULL THEN
        v_created := v_created + 1;
      ELSE
        v_errors := v_errors + 1;
        v_error_msgs := v_error_msgs || ('fixture ' || v_fixture.api_football_fixture_id || ' returned null');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      v_error_msgs := v_error_msgs || ('fixture ' || v_fixture.api_football_fixture_id || ': ' || SQLERRM);
    END;
  END LOOP;

  -- Update run record
  UPDATE public.wc2026_calibration_runs
  SET
    run_status     = CASE WHEN v_errors = 0 THEN 'completed' WHEN v_created > 0 THEN 'partial' ELSE 'failed' END,
    teams_processed = v_processed,
    teams_updated   = v_created,
    teams_skipped   = v_skipped_tbd,
    completed_at    = now(),
    error_summary   = CASE WHEN array_length(v_error_msgs, 1) > 0
                           THEN array_to_string(v_error_msgs[1:3], '; ')
                           ELSE NULL END
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id',         v_run_id,
    'processed',      v_processed,
    'created',        v_created,
    'errors',         v_errors,
    'status',         CASE WHEN v_errors = 0 THEN 'completed' WHEN v_created > 0 THEN 'partial' ELSE 'failed' END,
    'error_messages', to_jsonb(v_error_msgs)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_run_batch_scenarios(integer, text) TO authenticated;
