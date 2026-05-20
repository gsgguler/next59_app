/*
  Live Micro-Simulation — Outcome Learning V1: Evaluator

  model_lab.evaluate_live_micro_window_outcomes(p_fixture_id bigint)
  - Only evaluates completed matches (has 90+ minute events or 19 windows)
  - Reads events AFTER each window's end_minute to compute outcome labels
  - No future leakage during window construction
  - Deterministic and idempotent (UPSERT on micro_window_id + engine_version)
  - Returns compact JSON
*/

CREATE OR REPLACE FUNCTION model_lab.evaluate_live_micro_window_outcomes(
  p_fixture_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_engine_version  text := 'micro_v1';
  v_evaluated       integer := 0;
  v_skipped         integer := 0;
  v_errors          jsonb := '[]'::jsonb;
  v_has_90min_event boolean;
  v_home_team_id    integer;
  v_away_team_id    integer;
  v_final_home_goals integer;
  v_final_away_goals integer;
  v_final_result    text;
  r                 record;
  v_err             text;

  -- per-window outcome vars
  v_next5_goal      boolean;
  v_next10_goal     boolean;
  v_next15_goal     boolean;
  v_next_goal_team  text;
  v_against_pres    boolean;
  v_red_within_10   boolean;
  v_sub_within_10   boolean;
  v_comeback        boolean;
  v_draw_preserved  boolean;
  v_late_goal       boolean;
  v_false_pressure  boolean;
  v_false_chaos     boolean;
  v_false_late_goal boolean;
  v_reasoning       jsonb;

  -- next-goal minute
  v_next_goal_minute integer;
  v_next_goal_tid    integer;
  v_score_at_window_home integer;
  v_score_at_window_away integer;
BEGIN
  -- Verify match is complete: has events at minute >= 88
  SELECT EXISTS (
    SELECT 1 FROM public.api_football_fixture_events
    WHERE api_football_fixture_id = p_fixture_id AND elapsed >= 88
  ) INTO v_has_90min_event;

  IF NOT v_has_90min_event THEN
    RETURN jsonb_build_object(
      'fixture_id', p_fixture_id,
      'status', 'skipped_not_complete',
      'evaluated', 0
    );
  END IF;

  -- Resolve team IDs (same logic as builder)
  WITH team_counts AS (
    SELECT api_football_team_id AS tid, COUNT(*) AS cnt
    FROM public.api_football_fixture_events
    WHERE api_football_fixture_id = p_fixture_id
      AND api_football_team_id IS NOT NULL
    GROUP BY api_football_team_id ORDER BY cnt DESC
  )
  SELECT
    (SELECT tid FROM team_counts LIMIT 1),
    (SELECT tid FROM team_counts ORDER BY cnt ASC LIMIT 1)
  INTO v_home_team_id, v_away_team_id;

  IF v_home_team_id = v_away_team_id THEN v_away_team_id := NULL; END IF;

  -- Final score
  SELECT
    COUNT(*) FILTER (WHERE event_type='Goal' AND api_football_team_id = v_home_team_id),
    COUNT(*) FILTER (WHERE event_type='Goal' AND api_football_team_id = v_away_team_id)
  INTO v_final_home_goals, v_final_away_goals
  FROM public.api_football_fixture_events
  WHERE api_football_fixture_id = p_fixture_id;

  v_final_result := CASE
    WHEN v_final_home_goals > v_final_away_goals THEN 'home_win'
    WHEN v_final_away_goals > v_final_home_goals THEN 'away_win'
    ELSE 'draw'
  END;

  -- Loop each window
  FOR r IN
    SELECT id, window_start_minute, window_end_minute,
           micro_state, pressure_delta, chaos_score, late_goal_risk,
           comeback_pressure_score, draw_preservation_score,
           confidence, source_quality
    FROM model_lab.live_micro_windows
    WHERE fixture_id = p_fixture_id
      AND engine_version = v_engine_version
    ORDER BY window_start_minute
  LOOP
    BEGIN
      -- Score state at start of this window (cumulative goals before window)
      SELECT
        COUNT(*) FILTER (WHERE event_type='Goal' AND api_football_team_id = v_home_team_id AND elapsed < r.window_start_minute),
        COUNT(*) FILTER (WHERE event_type='Goal' AND api_football_team_id = v_away_team_id AND elapsed < r.window_start_minute)
      INTO v_score_at_window_home, v_score_at_window_away
      FROM public.api_football_fixture_events
      WHERE api_football_fixture_id = p_fixture_id;

      -- Next goal after window
      SELECT elapsed, api_football_team_id
      INTO v_next_goal_minute, v_next_goal_tid
      FROM public.api_football_fixture_events
      WHERE api_football_fixture_id = p_fixture_id
        AND event_type = 'Goal'
        AND elapsed >= r.window_end_minute
      ORDER BY elapsed ASC
      LIMIT 1;

      v_next5_goal  := (v_next_goal_minute IS NOT NULL AND v_next_goal_minute < r.window_end_minute + 5);
      v_next10_goal := (v_next_goal_minute IS NOT NULL AND v_next_goal_minute < r.window_end_minute + 10);
      v_next15_goal := (v_next_goal_minute IS NOT NULL AND v_next_goal_minute < r.window_end_minute + 15);

      v_next_goal_team := CASE
        WHEN v_next_goal_tid = v_home_team_id THEN 'home'
        WHEN v_next_goal_tid = v_away_team_id THEN 'away'
        ELSE NULL
      END;

      -- Goal against pressure direction
      v_against_pres := false;
      IF v_next_goal_team IS NOT NULL THEN
        IF r.pressure_delta > 0.15 AND v_next_goal_team = 'away' THEN
          v_against_pres := true;
        ELSIF r.pressure_delta < -0.15 AND v_next_goal_team = 'home' THEN
          v_against_pres := true;
        END IF;
      END IF;

      -- Red card within 10
      v_red_within_10 := EXISTS (
        SELECT 1 FROM public.api_football_fixture_events
        WHERE api_football_fixture_id = p_fixture_id
          AND event_type = 'Card'
          AND event_detail ILIKE '%red%'
          AND elapsed >= r.window_end_minute
          AND elapsed < r.window_end_minute + 10
      );

      -- Substitution within 10
      v_sub_within_10 := EXISTS (
        SELECT 1 FROM public.api_football_fixture_events
        WHERE api_football_fixture_id = p_fixture_id
          AND event_type = 'subst'
          AND elapsed >= r.window_end_minute
          AND elapsed < r.window_end_minute + 10
      );

      -- Comeback: trailing team at window start actually wins/draws at FT
      v_comeback := false;
      IF v_score_at_window_home < v_score_at_window_away AND v_final_result IN ('home_win','draw') THEN
        v_comeback := true;
      ELSIF v_score_at_window_away < v_score_at_window_home AND v_final_result IN ('away_win','draw') THEN
        v_comeback := true;
      END IF;

      -- Draw preserved: level at window start, draw at FT
      v_draw_preserved := (
        v_score_at_window_home = v_score_at_window_away
        AND v_final_result = 'draw'
      );

      -- Late goal after window (goal at minute >= 75 after this window)
      v_late_goal := (
        v_next_goal_minute IS NOT NULL
        AND v_next_goal_minute >= GREATEST(75, r.window_end_minute)
      );

      -- False pressure signal: strong pressure but next goal goes against it
      v_false_pressure := (
        ABS(COALESCE(r.pressure_delta, 0)) > 0.25
        AND v_against_pres = true
      );

      -- False chaos signal: high chaos but no goal/red in next 10 min
      v_false_chaos := (
        COALESCE(r.chaos_score, 0) > 0.50
        AND NOT v_next10_goal
        AND NOT v_red_within_10
      );

      -- False late goal signal: high late_goal_risk but no goal >= 75 after window
      v_false_late_goal := (
        COALESCE(r.late_goal_risk, 0) > 0.40
        AND r.window_start_minute >= 70
        AND NOT v_late_goal
      );

      v_reasoning := jsonb_build_object(
        'final_score',    format('%s-%s', v_final_home_goals, v_final_away_goals),
        'final_result',   v_final_result,
        'score_at_window', format('%s-%s', v_score_at_window_home, v_score_at_window_away),
        'next_goal_minute', v_next_goal_minute,
        'next_goal_team',   v_next_goal_team
      );

      INSERT INTO model_lab.live_micro_window_outcomes (
        micro_window_id, fixture_id, window_start_minute, window_end_minute,
        micro_state, pressure_delta, chaos_score, late_goal_risk,
        comeback_pressure_score, draw_preservation_score,
        confidence, source_quality,
        next_goal_within_5, next_goal_within_10, next_goal_within_15,
        next_goal_team, goal_against_pressure_dir,
        red_card_within_10, substitution_within_10,
        comeback_occurred, draw_preserved, late_goal_after_window,
        final_result,
        was_false_pressure_signal, was_false_chaos_signal, was_false_late_goal_signal,
        engine_version, reasoning_json
      ) VALUES (
        r.id, p_fixture_id, r.window_start_minute, r.window_end_minute,
        r.micro_state, r.pressure_delta, r.chaos_score, r.late_goal_risk,
        r.comeback_pressure_score, r.draw_preservation_score,
        r.confidence, r.source_quality,
        v_next5_goal, v_next10_goal, v_next15_goal,
        v_next_goal_team, v_against_pres,
        v_red_within_10, v_sub_within_10,
        v_comeback, v_draw_preserved, v_late_goal,
        v_final_result,
        v_false_pressure, v_false_chaos, v_false_late_goal,
        v_engine_version, v_reasoning
      )
      ON CONFLICT (micro_window_id, engine_version)
      DO UPDATE SET
        next_goal_within_5          = EXCLUDED.next_goal_within_5,
        next_goal_within_10         = EXCLUDED.next_goal_within_10,
        next_goal_within_15         = EXCLUDED.next_goal_within_15,
        next_goal_team              = EXCLUDED.next_goal_team,
        goal_against_pressure_dir   = EXCLUDED.goal_against_pressure_dir,
        red_card_within_10          = EXCLUDED.red_card_within_10,
        substitution_within_10      = EXCLUDED.substitution_within_10,
        comeback_occurred           = EXCLUDED.comeback_occurred,
        draw_preserved              = EXCLUDED.draw_preserved,
        late_goal_after_window      = EXCLUDED.late_goal_after_window,
        final_result                = EXCLUDED.final_result,
        was_false_pressure_signal   = EXCLUDED.was_false_pressure_signal,
        was_false_chaos_signal      = EXCLUDED.was_false_chaos_signal,
        was_false_late_goal_signal  = EXCLUDED.was_false_late_goal_signal,
        evaluated_at                = now(),
        reasoning_json              = EXCLUDED.reasoning_json;

      v_evaluated := v_evaluated + 1;

    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_errors := v_errors || jsonb_build_object(
        'window_start', r.window_start_minute, 'error', LEFT(v_err, 200)
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'fixture_id',      p_fixture_id,
    'evaluated',       v_evaluated,
    'skipped',         v_skipped,
    'final_result',    v_final_result,
    'errors',          v_errors
  );
END;
$$;

-- Public admin wrapper
CREATE OR REPLACE FUNCTION public.admin_evaluate_micro_outcomes(p_fixture_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN model_lab.evaluate_live_micro_window_outcomes(p_fixture_id);
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.evaluate_live_micro_window_outcomes(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_evaluate_micro_outcomes(bigint) TO authenticated;
