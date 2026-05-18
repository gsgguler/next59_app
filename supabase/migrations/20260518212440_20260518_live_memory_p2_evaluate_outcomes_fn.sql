/*
  # Live Memory Engine — Phase 2: Outcome Evaluation Function

  Creates model_lab.populate_live_state_outcomes(p_fixture_id uuid)

  ## Purpose
  Replays a completed match by reconstructing what the live engine would have
  seen at each elapsed minute (5-minute buckets), then computes ground-truth
  outcome labels for each snapshot using only events AFTER that minute.

  ## Rules
  1. Deterministic — same input always produces same output
  2. Replay-based — events replayed chronologically
  3. No future leakage during state construction (pre-snapshot window only)
  4. Evaluation only after match is FT/AET/PEN
  5. Append-safe — uses ON CONFLICT DO UPDATE to remain idempotent
  6. Only processes elapsed minutes where at least one goal or card event exists
     within the match window (min 1-90+), generating one outcome row per 5-min bucket

  ## Live State Classification (simplified replay)
  Uses pre-snapshot goals, cards, and score state to classify the live state at
  each minute. Does not re-run the full engine (no stats data available for
  historical snapshots). State is inferred from score differential and event density.

  ## Signal Reconstruction from Events Alone
  - goals_before: goals scored up to (and including) elapsed minute
  - goals_after_5: goals scored in [elapsed+1, elapsed+5]
  - goals_after_10: goals scored in [elapsed+1, elapsed+10]
  - red_card_after: red card event in [elapsed+1, elapsed+20]
  - comeback: trailing team at elapsed equalizes or takes lead by FT
  - was_false_high_confidence: state was HIGH_CHAOS/LATE_PRESSURE/DESPERATION
    but no goal followed within 10 minutes

  ## Function signature
  model_lab.populate_live_state_outcomes(p_fixture_id uuid DEFAULT NULL)
  - NULL = process all completed matches not yet fully evaluated
  - UUID = process specific match

  ## Notes
  - Minute buckets: every 5 minutes from 0 to 95
  - Only inserts rows where events exist to infer the state meaningfully
  - elapsed stored as the bucket start (0, 5, 10, ..., 90)
*/

CREATE OR REPLACE FUNCTION model_lab.populate_live_state_outcomes(
  p_fixture_id uuid DEFAULT NULL,
  p_limit      integer DEFAULT 50
)
RETURNS TABLE(
  processed_fixtures integer,
  outcomes_inserted  integer,
  outcomes_updated   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_fixture        RECORD;
  v_home_af_id     integer;
  v_away_af_id     integer;
  v_processed      integer := 0;
  v_inserted       integer := 0;
  v_updated        integer := 0;
  v_minute_bucket  integer;
  v_home_score_at  integer;
  v_away_score_at  integer;
  v_goals_before   integer;
  v_reds_before    integer;
  v_cards_before   integer;
  v_home_goals_before integer;
  v_away_goals_before integer;
  v_goals_next5    integer;
  v_goals_next10   integer;
  v_next_goal_team text;
  v_red_after      boolean;
  v_late_goal      boolean;
  v_comeback       boolean;
  v_draw_preserved boolean;
  v_false_conf     boolean;
  v_inferred_state text;
  v_inferred_conf  text;
  v_chaos_approx   numeric;
  v_desperation    numeric;
  v_late_pressure  numeric;
  v_comeback_score numeric;
  v_leading_team   text;
  v_diff           integer;
  v_goals_last15   integer;
  v_cards_last15   integer;
  v_final_result   text;
BEGIN

  FOR v_fixture IN
    SELECT
      m.id,
      m.api_football_fixture_id,
      m.competition_season_id,
      m.result,
      COALESCE(m.home_score_ft, 0) AS home_score_ft,
      COALESCE(m.away_score_ft, 0) AS away_score_ft,
      m.home_team_id,
      m.away_team_id
    FROM public.matches m
    WHERE m.status_short IN ('FT','AET','PEN')
      AND m.result IS NOT NULL
      AND m.api_football_fixture_id IS NOT NULL
      AND (p_fixture_id IS NULL OR m.id = p_fixture_id)
      -- Only replay if not fully evaluated yet
      AND NOT EXISTS (
        SELECT 1 FROM model_lab.live_state_outcomes lso
        WHERE lso.fixture_id = m.id
          AND lso.evaluated_at IS NOT NULL
        HAVING COUNT(*) >= 5
      )
      -- Must have events to replay
      AND EXISTS (
        SELECT 1 FROM public.api_football_fixture_events e
        WHERE e.match_id = m.id
          AND e.event_type = 'Goal'
      )
    LIMIT p_limit
  LOOP
    v_processed := v_processed + 1;
    v_final_result := v_fixture.result;

    -- Resolve team AF IDs
    SELECT api_football_id INTO v_home_af_id
    FROM public.teams WHERE id = v_fixture.home_team_id LIMIT 1;

    SELECT api_football_id INTO v_away_af_id
    FROM public.teams WHERE id = v_fixture.away_team_id LIMIT 1;

    -- Iterate 5-minute buckets 0..90
    FOR v_minute_bucket IN 0..18 LOOP
      DECLARE
        v_elapsed integer := v_minute_bucket * 5;
        v_elapsed_end integer := (v_minute_bucket * 5) + 4;
        v_window_end integer := LEAST(v_elapsed, 95);
      BEGIN

        -- ── Score at this elapsed ──────────────────────────────────────────
        SELECT
          COUNT(*) FILTER (WHERE api_football_team_id = v_home_af_id) AS home_g,
          COUNT(*) FILTER (WHERE api_football_team_id = v_away_af_id) AS away_g
        INTO v_home_goals_before, v_away_goals_before
        FROM public.api_football_fixture_events
        WHERE match_id = v_fixture.id
          AND event_type = 'Goal'
          AND event_detail NOT IN ('Missed Penalty','Own Goal')
          AND elapsed <= v_elapsed;

        -- Own goals count for opponent
        DECLARE
          v_own_home integer := 0;
          v_own_away integer := 0;
        BEGIN
          SELECT
            COUNT(*) FILTER (WHERE api_football_team_id = v_away_af_id) AS own_for_home,
            COUNT(*) FILTER (WHERE api_football_team_id = v_home_af_id) AS own_for_away
          INTO v_own_home, v_own_away
          FROM public.api_football_fixture_events
          WHERE match_id = v_fixture.id
            AND event_type = 'Goal'
            AND event_detail = 'Own Goal'
            AND elapsed <= v_elapsed;

          v_home_score_at := COALESCE(v_home_goals_before,0) + COALESCE(v_own_home,0);
          v_away_score_at := COALESCE(v_away_goals_before,0) + COALESCE(v_own_away,0);
        END;

        -- Skip minute 0 rows when no events yet (no signal)
        IF v_elapsed < 10 AND v_home_score_at = 0 AND v_away_score_at = 0 THEN
          CONTINUE;
        END IF;

        -- ── Signals at elapsed ────────────────────────────────────────────

        SELECT COUNT(*) INTO v_goals_before
        FROM public.api_football_fixture_events
        WHERE match_id = v_fixture.id AND event_type = 'Goal' AND elapsed <= v_elapsed;

        SELECT COUNT(*) INTO v_reds_before
        FROM public.api_football_fixture_events
        WHERE match_id = v_fixture.id
          AND event_type = 'Card' AND event_detail ILIKE '%Red%'
          AND elapsed <= v_elapsed;

        SELECT COUNT(*) INTO v_cards_before
        FROM public.api_football_fixture_events
        WHERE match_id = v_fixture.id AND event_type = 'Card' AND elapsed <= v_elapsed;

        -- goals in last 15 minutes window
        SELECT COUNT(*) INTO v_goals_last15
        FROM public.api_football_fixture_events
        WHERE match_id = v_fixture.id AND event_type = 'Goal'
          AND elapsed > GREATEST(0, v_elapsed - 15) AND elapsed <= v_elapsed;

        SELECT COUNT(*) INTO v_cards_last15
        FROM public.api_football_fixture_events
        WHERE match_id = v_fixture.id AND event_type = 'Card'
          AND elapsed > GREATEST(0, v_elapsed - 15) AND elapsed <= v_elapsed;

        -- ── Ground-truth outcomes (future only) ───────────────────────────

        SELECT COUNT(*) INTO v_goals_next5
        FROM public.api_football_fixture_events
        WHERE match_id = v_fixture.id AND event_type = 'Goal'
          AND elapsed > v_elapsed AND elapsed <= v_elapsed + 5;

        SELECT COUNT(*) INTO v_goals_next10
        FROM public.api_football_fixture_events
        WHERE match_id = v_fixture.id AND event_type = 'Goal'
          AND elapsed > v_elapsed AND elapsed <= v_elapsed + 10;

        -- Next goal team
        v_next_goal_team := NULL;
        DECLARE
          v_next_goal_af_team integer;
        BEGIN
          SELECT api_football_team_id INTO v_next_goal_af_team
          FROM public.api_football_fixture_events
          WHERE match_id = v_fixture.id AND event_type = 'Goal'
            AND event_detail NOT IN ('Missed Penalty')
            AND elapsed > v_elapsed
          ORDER BY elapsed ASC LIMIT 1;

          IF v_next_goal_af_team = v_home_af_id THEN
            v_next_goal_team := 'home';
          ELSIF v_next_goal_af_team = v_away_af_id THEN
            v_next_goal_team := 'away';
          END IF;
        END;

        -- Red card within 20 minutes after
        SELECT EXISTS(
          SELECT 1 FROM public.api_football_fixture_events
          WHERE match_id = v_fixture.id AND event_type = 'Card'
            AND event_detail ILIKE '%Red%'
            AND elapsed > v_elapsed AND elapsed <= v_elapsed + 20
        ) INTO v_red_after;

        -- Comeback: trailing team at snapshot equalizes or leads by FT
        v_comeback := false;
        v_diff := v_home_score_at - v_away_score_at;
        IF v_diff > 0 THEN
          -- home leading → away comeback
          v_comeback := (v_fixture.away_score_ft >= v_fixture.home_score_ft);
        ELSIF v_diff < 0 THEN
          -- away leading → home comeback
          v_comeback := (v_fixture.home_score_ft >= v_fixture.away_score_ft);
        END IF;

        -- Late goal: goal scored after minute 75
        SELECT EXISTS(
          SELECT 1 FROM public.api_football_fixture_events
          WHERE match_id = v_fixture.id AND event_type = 'Goal'
            AND elapsed > 75
        ) INTO v_late_goal;

        -- Draw preserved: score was draw at snapshot and FT was draw
        v_draw_preserved := (v_diff = 0 AND v_fixture.result = 'D');

        -- ── Infer live state from events (deterministic, no LLM) ──────────

        v_diff := v_home_score_at - v_away_score_at;

        -- Chaos approx: goals*0.12 + reds*0.25 + goals_last15*0.25 + cards_last15*0.08
        v_chaos_approx := LEAST(1.0, v_goals_before * 0.12 + v_reds_before * 0.25
          + v_goals_last15 * 0.25 + v_cards_last15 * 0.08);

        -- Desperation: trailing by 2+ after min 60
        v_desperation := CASE
          WHEN v_elapsed >= 60 AND ABS(v_diff) >= 2 THEN LEAST(1.0, (v_elapsed - 60.0) / 30.0 * ABS(v_diff) * 0.4)
          ELSE 0.0
        END;

        -- Late goal pressure: min 75+ in 2H
        v_late_pressure := CASE
          WHEN v_elapsed >= 75 THEN LEAST(1.0, (v_elapsed - 75.0) / 20.0)
          ELSE 0.0
        END;

        -- Comeback score
        v_comeback_score := CASE
          WHEN ABS(v_diff) >= 2 THEN LEAST(1.0, ABS(v_diff) * 0.4 + v_elapsed * 0.003)
          WHEN ABS(v_diff) = 1 THEN LEAST(1.0, 0.3 + v_elapsed * 0.002)
          ELSE 0.0
        END;

        -- Leading team
        v_leading_team := CASE
          WHEN v_diff > 0 THEN 'home'
          WHEN v_diff < 0 THEN 'away'
          ELSE 'draw'
        END;

        -- State classification (simplified, event-based)
        v_inferred_state := CASE
          WHEN v_reds_before >= 2 OR v_chaos_approx >= 0.7 THEN 'chaotic_collapse'
          WHEN v_reds_before >= 1 AND v_elapsed >= 45 THEN 'tactical_instability'
          WHEN ABS(v_diff) >= 3 THEN 'dominant_control'
          WHEN v_elapsed >= 75 AND ABS(v_diff) >= 2 AND v_late_pressure > 0.5 THEN 'late_desperation'
          WHEN v_elapsed >= 75 AND ABS(v_diff) = 1 THEN 'late_pressure_high'
          WHEN v_elapsed >= 75 AND v_diff = 0 THEN 'late_pressure_draw'
          WHEN ABS(v_diff) >= 2 AND v_elapsed >= 60 THEN 'comeback_pressure'
          WHEN v_goals_last15 >= 2 THEN 'high_tempo_open'
          WHEN v_diff = 0 AND v_elapsed >= 60 THEN 'stalemate_pressure'
          WHEN ABS(v_diff) = 1 AND v_elapsed >= 45 THEN 'narrow_lead_defence'
          WHEN v_goals_before = 0 AND v_elapsed >= 30 THEN 'cautious_opening'
          WHEN v_goals_last15 >= 1 THEN 'transition_heavy'
          ELSE 'balanced_contest'
        END;

        v_inferred_conf := CASE
          WHEN v_goals_before = 0 AND v_elapsed < 30 THEN 'low'
          WHEN v_chaos_approx >= 0.5 OR v_late_pressure >= 0.7 OR v_desperation >= 0.6 THEN 'high'
          ELSE 'medium'
        END;

        -- False confidence: high confidence but no goal followed within 10 min
        v_false_conf := (
          v_inferred_conf = 'high'
          AND v_inferred_state IN ('late_desperation','late_pressure_high','comeback_pressure','chaotic_collapse')
          AND v_goals_next10 = 0
        );

        -- ── Upsert outcome row ─────────────────────────────────────────────

        INSERT INTO model_lab.live_state_outcomes (
          fixture_id, api_football_fixture_id, competition_season_id,
          elapsed, phase, home_score, away_score, leading_team,
          current_live_state, state_confidence,
          momentum_direction,
          live_pressure_index_home, live_pressure_index_away,
          chaos_score, comeback_pressure_score, desperation_level, late_goal_pressure,
          data_completeness_score,
          goal_in_next_5min, goal_in_next_10min, next_goal_team,
          red_card_after_state, comeback_occurred, draw_preserved,
          late_goal_occurred, final_result, was_false_live_confidence,
          engine_version, evaluated_at
        ) VALUES (
          v_fixture.id, v_fixture.api_football_fixture_id, v_fixture.competition_season_id,
          v_elapsed,
          CASE WHEN v_elapsed <= 45 THEN '1H' ELSE '2H' END,
          v_home_score_at, v_away_score_at, v_leading_team,
          v_inferred_state, v_inferred_conf,
          CASE WHEN v_goals_last15 > 0 THEN 'volatile'
               WHEN v_diff > 0 THEN 'home_dominant'
               WHEN v_diff < 0 THEN 'away_dominant'
               ELSE 'neutral' END,
          -- pressure approximations from events (no stats available for FT history)
          NULL, NULL,
          v_chaos_approx, v_comeback_score, v_desperation, v_late_pressure,
          0.4, -- events-only completeness
          (v_goals_next5 > 0), (v_goals_next10 > 0), v_next_goal_team,
          v_red_after, v_comeback, v_draw_preserved,
          v_late_goal, v_final_result, v_false_conf,
          'v1', now()
        )
        ON CONFLICT (fixture_id, elapsed) DO UPDATE SET
          goal_in_next_5min         = EXCLUDED.goal_in_next_5min,
          goal_in_next_10min        = EXCLUDED.goal_in_next_10min,
          next_goal_team            = EXCLUDED.next_goal_team,
          red_card_after_state      = EXCLUDED.red_card_after_state,
          comeback_occurred         = EXCLUDED.comeback_occurred,
          draw_preserved            = EXCLUDED.draw_preserved,
          late_goal_occurred        = EXCLUDED.late_goal_occurred,
          final_result              = EXCLUDED.final_result,
          was_false_live_confidence = EXCLUDED.was_false_live_confidence,
          evaluated_at              = EXCLUDED.evaluated_at;

        -- Count insert vs update by checking affected rows
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated > 0 THEN
          v_inserted := v_inserted + 1;
        END IF;

      END; -- inner DECLARE block
    END LOOP; -- minute buckets

  END LOOP; -- fixtures

  RETURN QUERY SELECT v_processed, v_inserted, 0;
END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.populate_live_state_outcomes(uuid, integer) TO service_role;

-- ── Public wrapper ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_populate_live_outcomes(
  p_fixture_id uuid DEFAULT NULL,
  p_limit      integer DEFAULT 50
)
RETURNS TABLE(processed_fixtures integer, outcomes_inserted integer, outcomes_updated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM model_lab.populate_live_state_outcomes(p_fixture_id, p_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_populate_live_outcomes(uuid, integer) TO authenticated;

COMMENT ON FUNCTION model_lab.populate_live_state_outcomes IS
  'Replay completed matches to populate live_state_outcomes. Deterministic, idempotent, event-based only.';
