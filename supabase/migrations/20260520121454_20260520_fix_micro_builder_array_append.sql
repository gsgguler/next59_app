/*
  Fix: replace text[] || 'literal' with array_append() in build_live_micro_windows
  PL/pgSQL interprets `text[] || 'string'` as array-to-array concat requiring array literal syntax.
  Using array_append(arr, 'value') is unambiguous.
*/

CREATE OR REPLACE FUNCTION model_lab.build_live_micro_windows(p_fixture_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_engine_version  text := 'micro_v1';
  v_run_id          uuid;
  v_windows_created integer := 0;
  v_windows_updated integer := 0;
  v_errors          text[]  := ARRAY[]::text[];
  v_warnings        text[]  := ARRAY[]::text[];

  v_home_shots_total   integer := NULL;
  v_away_shots_total   integer := NULL;
  v_home_poss_total    numeric := NULL;
  v_away_poss_total    numeric := NULL;
  v_has_stats          boolean := false;
  v_home_team_id       integer := NULL;
  v_away_team_id       integer := NULL;
  v_w_start            integer;
  v_w_end              integer;
  v_home_score         integer := 0;
  v_away_score         integer := 0;
  v_home_reds          integer := 0;
  v_away_reds          integer := 0;
  v_ev_count           integer;
  v_g_home             integer;
  v_g_away             integer;
  v_c_home             integer;
  v_c_away             integer;
  v_rc_home            integer;
  v_rc_away            integer;
  v_s_home             integer;
  v_s_away             integer;
  v_corner_h           integer;
  v_corner_a           integer;
  v_pressure_home      numeric;
  v_pressure_away      numeric;
  v_pressure_delta     numeric;
  v_momentum           text;
  v_tactical_inst      numeric;
  v_fatigue_wave       numeric;
  v_chaos              numeric;
  v_comeback           numeric;
  v_draw_pres          numeric;
  v_late_goal_risk     numeric;
  v_micro_state        text;
  v_confidence         numeric;
  v_source_qual        text;
  v_shots_h_win        integer;
  v_shots_a_win        integer;
  v_poss_h_win         numeric;
  v_poss_a_win         numeric;
  v_reasoning          jsonb;
  v_triggered          text[];
  v_missing            text[];
  v_penalties          text[];
  v_existing_id        uuid;
  v_total_windows      integer := 19;
BEGIN
  INSERT INTO model_lab.live_micro_window_runs(fixture_id, scope, engine_version)
  VALUES (p_fixture_id, 'single', v_engine_version)
  RETURNING id INTO v_run_id;

  WITH team_counts AS (
    SELECT api_football_team_id AS tid, COUNT(*) AS cnt
    FROM public.api_football_fixture_events
    WHERE api_football_fixture_id = p_fixture_id
      AND api_football_team_id IS NOT NULL
    GROUP BY api_football_team_id
    ORDER BY cnt DESC
  )
  SELECT
    (SELECT tid FROM team_counts LIMIT 1),
    (SELECT tid FROM team_counts ORDER BY cnt ASC LIMIT 1)
  INTO v_home_team_id, v_away_team_id;

  IF v_home_team_id = v_away_team_id THEN v_away_team_id := NULL; END IF;

  BEGIN
    SELECT
      MAX(CASE WHEN team_id = v_home_team_id AND stat_type = 'Shots on Goal'
          THEN (stat_value)::integer END),
      MAX(CASE WHEN team_id = v_away_team_id AND stat_type = 'Shots on Goal'
          THEN (stat_value)::integer END),
      MAX(CASE WHEN team_id = v_home_team_id AND stat_type = 'Ball Possession'
          THEN regexp_replace(stat_value, '[^0-9.]', '', 'g')::numeric END),
      MAX(CASE WHEN team_id = v_away_team_id AND stat_type = 'Ball Possession'
          THEN regexp_replace(stat_value, '[^0-9.]', '', 'g')::numeric END)
    INTO v_home_shots_total, v_away_shots_total, v_home_poss_total, v_away_poss_total
    FROM (
      SELECT
        (team_block -> 'team' ->> 'id')::integer           AS team_id,
        (stat_obj ->> 'type')                              AS stat_type,
        (stat_obj ->> 'value')                             AS stat_value
      FROM public.api_football_fixture_statistics_raw,
        jsonb_array_elements(response_json -> 'response') AS team_block,
        jsonb_array_elements(team_block -> 'statistics')  AS stat_obj
      WHERE api_football_fixture_id = p_fixture_id
    ) parsed
    WHERE stat_value IS NOT NULL AND stat_value <> 'null';

    v_has_stats := (v_home_shots_total IS NOT NULL OR v_home_poss_total IS NOT NULL);
  EXCEPTION WHEN OTHERS THEN
    v_has_stats := false;
    v_warnings := array_append(v_warnings, 'stats_extraction_failed: ' || SQLERRM);
  END;

  FOR v_w_start IN SELECT generate_series(0, 90, 5) LOOP
    v_w_end := v_w_start + 5;
    v_triggered := ARRAY[]::text[];
    v_missing    := ARRAY[]::text[];
    v_penalties  := ARRAY[]::text[];

    SELECT
      COUNT(*)::integer,
      COUNT(*) FILTER (WHERE event_type='Goal'
        AND api_football_team_id = v_home_team_id)::integer,
      COUNT(*) FILTER (WHERE event_type='Goal'
        AND api_football_team_id = v_away_team_id)::integer,
      COUNT(*) FILTER (WHERE event_type='Card'
        AND event_detail NOT ILIKE '%red%'
        AND api_football_team_id = v_home_team_id)::integer,
      COUNT(*) FILTER (WHERE event_type='Card'
        AND event_detail NOT ILIKE '%red%'
        AND api_football_team_id = v_away_team_id)::integer,
      COUNT(*) FILTER (WHERE event_type='Card'
        AND event_detail ILIKE '%red%'
        AND api_football_team_id = v_home_team_id)::integer,
      COUNT(*) FILTER (WHERE event_type='Card'
        AND event_detail ILIKE '%red%'
        AND api_football_team_id = v_away_team_id)::integer,
      COUNT(*) FILTER (WHERE event_type='subst'
        AND api_football_team_id = v_home_team_id)::integer,
      COUNT(*) FILTER (WHERE event_type='subst'
        AND api_football_team_id = v_away_team_id)::integer,
      COUNT(*) FILTER (WHERE event_type='Var'
        AND api_football_team_id = v_home_team_id)::integer,
      COUNT(*) FILTER (WHERE event_type='Var'
        AND api_football_team_id = v_away_team_id)::integer
    INTO
      v_ev_count, v_g_home, v_g_away,
      v_c_home, v_c_away, v_rc_home, v_rc_away,
      v_s_home, v_s_away, v_corner_h, v_corner_a
    FROM public.api_football_fixture_events
    WHERE api_football_fixture_id = p_fixture_id
      AND elapsed >= v_w_start
      AND elapsed < v_w_end;

    v_home_score := v_home_score + COALESCE(v_g_home, 0);
    v_away_score := v_away_score + COALESCE(v_g_away, 0);
    v_home_reds  := v_home_reds  + COALESCE(v_rc_home, 0);
    v_away_reds  := v_away_reds  + COALESCE(v_rc_away, 0);

    IF v_has_stats THEN
      v_shots_h_win := COALESCE(v_home_shots_total, 0) / v_total_windows;
      v_shots_a_win := COALESCE(v_away_shots_total, 0) / v_total_windows;
      v_poss_h_win  := COALESCE(v_home_poss_total, 50);
      v_poss_a_win  := COALESCE(v_away_poss_total, 50);
    ELSE
      v_shots_h_win := NULL;
      v_shots_a_win := NULL;
      v_poss_h_win  := NULL;
      v_poss_a_win  := NULL;
    END IF;

    v_pressure_home := LEAST(1.0,
      (COALESCE(v_g_home,0) * 0.25)
      + (COALESCE(v_c_home,0) * 0.06)
      + (COALESCE(v_rc_away,0) * 0.15)
      + (COALESCE(v_s_home,0) * 0.08)
      + (CASE WHEN v_ev_count >= 4 THEN 0.10 ELSE 0 END)
      + (CASE WHEN v_home_poss_total IS NOT NULL THEN (v_home_poss_total - 50.0) / 200.0 ELSE 0 END)
      + (GREATEST(0, COALESCE(v_away_reds,0) - COALESCE(v_home_reds,0)) * 0.08)
    );
    v_pressure_away := LEAST(1.0,
      (COALESCE(v_g_away,0) * 0.25)
      + (COALESCE(v_c_away,0) * 0.06)
      + (COALESCE(v_rc_home,0) * 0.15)
      + (COALESCE(v_s_away,0) * 0.08)
      + (CASE WHEN v_ev_count >= 4 THEN 0.10 ELSE 0 END)
      + (CASE WHEN v_away_poss_total IS NOT NULL THEN (v_away_poss_total - 50.0) / 200.0 ELSE 0 END)
      + (GREATEST(0, COALESCE(v_home_reds,0) - COALESCE(v_away_reds,0)) * 0.08)
    );
    v_pressure_delta := v_pressure_home - v_pressure_away;

    v_momentum := CASE
      WHEN v_pressure_delta >  0.15 THEN 'home'
      WHEN v_pressure_delta < -0.15 THEN 'away'
      ELSE 'neutral'
    END;

    v_tactical_inst := LEAST(1.0,
      ((COALESCE(v_c_home,0) + COALESCE(v_c_away,0)) * 0.08)
      + ((COALESCE(v_rc_home,0) + COALESCE(v_rc_away,0)) * 0.25)
      + ((COALESCE(v_s_home,0) + COALESCE(v_s_away,0)) * 0.12)
    );

    v_fatigue_wave := CASE
      WHEN v_w_start < 60 THEN 0.0
      WHEN v_w_start < 70 THEN 0.20
      WHEN v_w_start < 80 THEN 0.40
      WHEN v_w_start < 85 THEN 0.60
      ELSE 0.75
    END;
    v_fatigue_wave := LEAST(1.0,
      v_fatigue_wave + (COALESCE(v_s_home,0) + COALESCE(v_s_away,0)) * 0.05
    );

    v_chaos := LEAST(1.0,
      ((COALESCE(v_g_home,0) + COALESCE(v_g_away,0)) * 0.30)
      + ((COALESCE(v_c_home,0) + COALESCE(v_c_away,0)) * 0.06)
      + ((COALESCE(v_rc_home,0) + COALESCE(v_rc_away,0)) * 0.20)
      + ((COALESCE(v_s_home,0) + COALESCE(v_s_away,0)) * 0.05)
      + v_tactical_inst * 0.20
    );

    v_comeback := 0.0;
    IF v_home_score < v_away_score AND v_w_start >= 60 THEN
      v_comeback := LEAST(1.0,
        v_pressure_home * 0.6
        + (v_away_score - v_home_score) * 0.15
        + (CASE WHEN v_w_start >= 75 THEN 0.20 ELSE 0 END)
      );
    ELSIF v_away_score < v_home_score AND v_w_start >= 60 THEN
      v_comeback := LEAST(1.0,
        v_pressure_away * 0.6
        + (v_home_score - v_away_score) * 0.15
        + (CASE WHEN v_w_start >= 75 THEN 0.20 ELSE 0 END)
      );
    END IF;

    v_draw_pres := CASE
      WHEN v_home_score = v_away_score AND v_w_start >= 70 THEN
        LEAST(1.0, 0.40 + v_fatigue_wave * 0.30
          + (CASE WHEN v_w_start >= 85 THEN 0.20 ELSE 0 END))
      WHEN v_home_score = v_away_score AND v_w_start >= 60 THEN 0.20
      ELSE 0.0
    END;

    v_late_goal_risk := CASE
      WHEN v_w_start >= 80 AND ABS(v_home_score - v_away_score) <= 1 THEN
        LEAST(1.0, 0.40 + v_comeback * 0.30 + v_chaos * 0.20)
      WHEN v_w_start >= 75 AND ABS(v_home_score - v_away_score) <= 1 THEN
        LEAST(1.0, 0.25 + v_comeback * 0.20)
      WHEN v_w_start >= 85 THEN 0.35
      ELSE 0.0
    END;

    -- State machine with array_append (fixes malformed array literal error)
    IF v_home_team_id IS NULL OR (v_ev_count = 0 AND v_w_start < 90) THEN
      v_micro_state := 'data_insufficient';
      IF v_home_team_id IS NULL THEN
        v_triggered := array_append(v_triggered, 'no_team_id');
        v_missing   := array_append(v_missing,   'home_team_id_unresolved');
      ELSE
        v_triggered := array_append(v_triggered, 'no_events_in_window');
        v_missing   := array_append(v_missing,   'empty_event_window');
      END IF;
    ELSIF ABS(v_home_score - v_away_score) >= 3 AND v_w_start >= 60 THEN
      v_micro_state := 'game_killed';
      v_triggered := array_append(v_triggered, 'large_lead_late');
    ELSIF v_home_score < v_away_score AND v_comeback > 0.45 AND v_w_start >= 70 THEN
      v_micro_state := 'comeback_push_home';
      v_triggered := array_append(v_triggered, 'comeback_push_home');
    ELSIF v_away_score < v_home_score AND v_comeback > 0.45 AND v_w_start >= 70 THEN
      v_micro_state := 'comeback_push_away';
      v_triggered := array_append(v_triggered, 'comeback_push_away');
    ELSIF v_w_start >= 80 AND v_pressure_home > 0.50 AND v_home_score <= v_away_score THEN
      v_micro_state := 'late_pressure_home';
      v_triggered := array_append(v_triggered, 'late_high_pressure_home');
    ELSIF v_w_start >= 80 AND v_pressure_away > 0.50 AND v_away_score <= v_home_score THEN
      v_micro_state := 'late_pressure_away';
      v_triggered := array_append(v_triggered, 'late_high_pressure_away');
    ELSIF v_home_score = v_away_score AND v_w_start >= 80 AND v_chaos < 0.20 THEN
      v_micro_state := 'draw_lock';
      v_triggered := array_append(v_triggered, 'late_draw_low_chaos');
    ELSIF v_chaos > 0.60 THEN
      v_micro_state := 'chaos_phase';
      v_triggered := array_append(v_triggered, 'chaos_threshold_exceeded');
    ELSIF v_fatigue_wave > 0.50 AND v_ev_count <= 1 AND v_chaos < 0.20 THEN
      v_micro_state := 'fatigue_drop';
      v_triggered := array_append(v_triggered, 'high_fatigue_sparse_events');
    ELSIF v_pressure_delta > 0.35 THEN
      v_micro_state := 'home_pressure';
      v_triggered := array_append(v_triggered, 'pressure_asymmetry_home');
    ELSIF v_pressure_delta < -0.35 THEN
      v_micro_state := 'away_pressure';
      v_triggered := array_append(v_triggered, 'pressure_asymmetry_away');
    ELSIF (v_g_home + v_g_away) >= 2 THEN
      v_micro_state := 'transition_swing';
      v_triggered := array_append(v_triggered, 'multi_goal_window');
    ELSIF (v_g_home + v_g_away) = 1 AND v_tactical_inst > 0.30 THEN
      v_micro_state := 'transition_swing';
      v_triggered := array_append(v_triggered, 'goal_plus_disruption');
    ELSIF ABS(v_home_score - v_away_score) >= 2 AND v_chaos < 0.15 THEN
      v_micro_state := 'calm_control';
      v_triggered := array_append(v_triggered, 'comfortable_lead_low_chaos');
    ELSIF ABS(v_pressure_delta) <= 0.15 AND v_ev_count >= 2 THEN
      v_micro_state := 'balanced_contest';
      v_triggered := array_append(v_triggered, 'balanced_pressure');
    ELSE
      v_micro_state := 'balanced_contest';
      v_triggered := array_append(v_triggered, 'default_balanced');
    END IF;

    v_confidence := 0.75;
    IF v_home_team_id IS NULL THEN
      v_confidence := v_confidence - 0.30;
      v_penalties := array_append(v_penalties, 'no_team_id:-0.30');
    END IF;
    IF NOT v_has_stats THEN
      v_confidence := v_confidence - 0.10;
      v_penalties := array_append(v_penalties, 'no_stats:-0.10');
    END IF;
    IF v_ev_count = 0 THEN
      v_confidence := v_confidence - 0.30;
      v_penalties := array_append(v_penalties, 'no_events:-0.30');
    ELSIF v_ev_count <= 1 THEN
      v_confidence := v_confidence - 0.10;
      v_penalties := array_append(v_penalties, 'sparse_events:-0.10');
    END IF;
    IF v_w_start >= 75 AND v_ev_count >= 3 THEN
      v_confidence := v_confidence + 0.10;
    END IF;
    v_confidence := GREATEST(0.0, LEAST(1.0, v_confidence));

    v_source_qual := CASE
      WHEN v_ev_count = 0 THEN 'insufficient'
      WHEN v_has_stats    THEN 'event_stats'
      ELSE 'event_only'
    END;

    IF NOT v_has_stats    THEN v_missing := array_append(v_missing, 'fixture_statistics_unavailable'); END IF;
    IF v_home_team_id IS NULL THEN v_missing := array_append(v_missing, 'home_team_id_unknown'); END IF;
    IF v_away_team_id IS NULL THEN v_missing := array_append(v_missing, 'away_team_id_unknown'); END IF;

    v_reasoning := jsonb_build_object(
      'window',        format('%s-%s', v_w_start, v_w_end),
      'score',         format('%s-%s', v_home_score, v_away_score),
      'triggered_rules',              to_jsonb(v_triggered),
      'missing_inputs',               to_jsonb(v_missing),
      'confidence_penalties',         to_jsonb(v_penalties),
      'pressure_formula_components',  jsonb_build_object(
        'goals_home', v_g_home, 'goals_away', v_g_away,
        'cards_home', v_c_home, 'cards_away', v_c_away,
        'red_cards_home', v_rc_home, 'red_cards_away', v_rc_away,
        'subs_home', v_s_home, 'subs_away', v_s_away,
        'cumulative_reds_home', v_home_reds, 'cumulative_reds_away', v_away_reds,
        'event_count', v_ev_count, 'has_stats', v_has_stats
      ),
      'scores_computed', jsonb_build_object(
        'pressure_home', v_pressure_home, 'pressure_away', v_pressure_away,
        'pressure_delta', v_pressure_delta,
        'tactical_inst', v_tactical_inst, 'fatigue_wave', v_fatigue_wave,
        'chaos', v_chaos, 'comeback', v_comeback,
        'draw_pres', v_draw_pres, 'late_goal_risk', v_late_goal_risk
      )
    );

    SELECT id INTO v_existing_id
    FROM model_lab.live_micro_windows
    WHERE fixture_id = p_fixture_id
      AND window_start_minute = v_w_start
      AND engine_version = v_engine_version;

    IF v_existing_id IS NOT NULL THEN
      UPDATE model_lab.live_micro_windows SET
        home_score=v_home_score, away_score=v_away_score,
        events_count=v_ev_count, goals_home=v_g_home, goals_away=v_g_away,
        shots_home=v_shots_h_win, shots_away=v_shots_a_win,
        corners_home=COALESCE(v_corner_h,0), corners_away=COALESCE(v_corner_a,0),
        cards_home=COALESCE(v_c_home,0), cards_away=COALESCE(v_c_away,0),
        red_cards_home=COALESCE(v_rc_home,0), red_cards_away=COALESCE(v_rc_away,0),
        substitutions_home=COALESCE(v_s_home,0), substitutions_away=COALESCE(v_s_away,0),
        possession_home=v_poss_h_win, possession_away=v_poss_a_win,
        pressure_home=v_pressure_home, pressure_away=v_pressure_away,
        pressure_delta=v_pressure_delta, momentum_direction=v_momentum,
        tactical_instability_score=v_tactical_inst, fatigue_wave_score=v_fatigue_wave,
        chaos_score=v_chaos, comeback_pressure_score=v_comeback,
        draw_preservation_score=v_draw_pres, late_goal_risk=v_late_goal_risk,
        micro_state=v_micro_state, confidence=v_confidence,
        source_quality=v_source_qual, calculated_at=now(), reasoning_json=v_reasoning
      WHERE id = v_existing_id;
      v_windows_updated := v_windows_updated + 1;
    ELSE
      INSERT INTO model_lab.live_micro_windows(
        fixture_id, window_start_minute, window_end_minute,
        home_score, away_score, events_count, goals_home, goals_away,
        shots_home, shots_away, corners_home, corners_away,
        cards_home, cards_away, red_cards_home, red_cards_away,
        substitutions_home, substitutions_away, possession_home, possession_away,
        pressure_home, pressure_away, pressure_delta, momentum_direction,
        tactical_instability_score, fatigue_wave_score, chaos_score,
        comeback_pressure_score, draw_preservation_score, late_goal_risk,
        micro_state, confidence, source_quality, engine_version, reasoning_json
      ) VALUES (
        p_fixture_id, v_w_start, v_w_end,
        v_home_score, v_away_score, v_ev_count,
        COALESCE(v_g_home,0), COALESCE(v_g_away,0),
        v_shots_h_win, v_shots_a_win,
        COALESCE(v_corner_h,0), COALESCE(v_corner_a,0),
        COALESCE(v_c_home,0), COALESCE(v_c_away,0),
        COALESCE(v_rc_home,0), COALESCE(v_rc_away,0),
        COALESCE(v_s_home,0), COALESCE(v_s_away,0),
        v_poss_h_win, v_poss_a_win,
        v_pressure_home, v_pressure_away, v_pressure_delta, v_momentum,
        v_tactical_inst, v_fatigue_wave, v_chaos, v_comeback,
        v_draw_pres, v_late_goal_risk,
        v_micro_state, v_confidence, v_source_qual, v_engine_version, v_reasoning
      );
      v_windows_created := v_windows_created + 1;
    END IF;

  END LOOP;

  UPDATE model_lab.live_micro_window_runs SET
    completed_at=now(),
    status=CASE WHEN array_length(v_errors,1) > 0 THEN 'completed_with_errors' ELSE 'completed' END,
    windows_created=v_windows_created,
    windows_updated=v_windows_updated,
    fixtures_processed=1,
    errors_json   = CASE WHEN array_length(v_errors,1)   > 0 THEN to_jsonb(v_errors)   ELSE NULL END,
    warnings_json = CASE WHEN array_length(v_warnings,1) > 0 THEN to_jsonb(v_warnings) ELSE NULL END
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'fixture_id',      p_fixture_id,
    'windows_created', v_windows_created,
    'windows_updated', v_windows_updated,
    'has_stats',       v_has_stats,
    'home_team_id',    v_home_team_id,
    'away_team_id',    v_away_team_id,
    'errors',          to_jsonb(v_errors),
    'warnings',        to_jsonb(v_warnings),
    'run_id',          v_run_id
  );

EXCEPTION WHEN OTHERS THEN
  IF v_run_id IS NOT NULL THEN
    UPDATE model_lab.live_micro_window_runs SET
      completed_at=now(), status='failed',
      errors_json=jsonb_build_array(SQLERRM)
    WHERE id = v_run_id;
  END IF;
  RETURN jsonb_build_object('error', SQLERRM, 'fixture_id', p_fixture_id);
END;
$$;
