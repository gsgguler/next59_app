/*
  # Live Memory — Phase 2: Deduplication Guard for live_match_state_history

  ## Summary
  Fixes duplicate rows in model_lab.live_match_state_history caused by compute_live_match_state()
  doing a plain INSERT with no conflict handling. A single test fixture accumulated 20 identical rows
  (fixture_id, elapsed=47, engine_version=v1).

  ## Changes

  ### 1. Deduplicate existing rows
  - For each (fixture_id, elapsed, engine_version) group, keep the row with the EARLIEST snapshot_at
  - Delete all other duplicates (exact same fixture_id + elapsed + engine_version)

  ### 2. Unique index
  - CREATE UNIQUE INDEX CONCURRENTLY live_match_state_history_fixture_elapsed_version_idx
    ON model_lab.live_match_state_history (fixture_id, elapsed, engine_version)

  ### 3. Patch compute_live_match_state history INSERT → upsert
  - Replace INSERT with INSERT ... ON CONFLICT (fixture_id, elapsed, engine_version) DO UPDATE
  - Updates all mutable signal columns; preserves snapshot_at on conflict (no time travel)

  ## Important Notes
  - Only deletes rows that have an exact duplicate triple (fixture_id, elapsed, engine_version)
  - Historical data outside that triple is untouched
  - The unique index prevents future duplicates at the DB level
*/

-- ─── Step 1: Delete duplicates — keep earliest per (fixture_id, elapsed, engine_version) ──

DELETE FROM model_lab.live_match_state_history
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY fixture_id, elapsed, engine_version
        ORDER BY snapshot_at ASC, id ASC
      ) AS rn
    FROM model_lab.live_match_state_history
  ) ranked
  WHERE rn > 1
);

-- ─── Step 2: Add unique index ────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS live_match_state_history_fixture_elapsed_version_idx
  ON model_lab.live_match_state_history (fixture_id, elapsed, engine_version);

-- ─── Step 3: Patch compute_live_match_state — replace history INSERT with upsert ────────

CREATE OR REPLACE FUNCTION model_lab.compute_live_match_state(p_fixture_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public, pg_temp
AS $$
DECLARE
v_match             public.matches%ROWTYPE;
v_elapsed           integer;
v_home_score        integer;
v_away_score        integer;
v_diff              integer;
v_phase             text;

v_home_yellow       integer := 0;
v_away_yellow       integer := 0;
v_home_red          integer := 0;
v_away_red          integer := 0;
v_home_subs         integer := 0;
v_away_subs         integer := 0;
v_total_goals       integer := 0;
v_goals_last15      integer := 0;
v_cards_last15      integer := 0;
v_subs_last15       integer := 0;
v_last_event_elap   integer;
v_events_count      integer := 0;
v_events_available  boolean := false;
v_home_subs_last20  integer := 0;
v_away_subs_last20  integer := 0;

v_home_poss         numeric(5,2) := 50;
v_away_poss         numeric(5,2) := 50;
v_home_shots        integer := 0;
v_away_shots        integer := 0;
v_home_corners      integer := 0;
v_away_corners      integer := 0;
v_stats_count       integer := 0;
v_stats_available   boolean := false;

v_lineups_available boolean := false;

v_pressure_home     numeric(4,3);
v_pressure_away     numeric(4,3);
v_momentum_score    numeric(4,3);
v_momentum_dir      text;
v_chaos             numeric(4,3);
v_desperation       numeric(4,3);
v_late_goal_press   numeric(4,3);
v_comeback_press    numeric(4,3);
v_draw_stability    numeric(4,3);
v_tact_instability  numeric(4,3);
v_data_completeness numeric(4,3);

v_state             text := 'balanced';
v_confidence        text := 'low';

v_triggered_rules   jsonb := '[]'::jsonb;
v_thresholds        jsonb := '{}'::jsonb;
v_inputs            jsonb := '{}'::jsonb;
v_reasoning         jsonb;

v_af_fixture_id     integer;

v_deficit           integer;
v_late_factor       numeric;
v_subs_deficit_factor numeric;
v_trailing_subs_last20 integer;
v_late_factor2      numeric;

v_home_af_id        integer;
v_away_af_id        integer;

BEGIN
-- ─── 1. Load match ───────────────────────────────────────────────────────
SELECT * INTO v_match FROM public.matches WHERE id = p_fixture_id;
IF NOT FOUND THEN
  RETURN jsonb_build_object('error', 'match_not_found', 'fixture_id', p_fixture_id);
END IF;

v_elapsed       := COALESCE(v_match.status_elapsed, 0);
IF v_match.status_short = 'HT' THEN
  v_home_score := COALESCE(v_match.home_score_ht, 0);
  v_away_score := COALESCE(v_match.away_score_ht, 0);
ELSE
  v_home_score := COALESCE(v_match.home_score_ft, 0);
  v_away_score := COALESCE(v_match.away_score_ft, 0);
END IF;

v_diff          := v_home_score - v_away_score;
v_phase         := COALESCE(v_match.status_short, 'NS');
v_af_fixture_id := v_match.api_football_fixture_id;
v_total_goals   := v_home_score + v_away_score;

-- Resolve AF team IDs
SELECT api_football_id INTO v_home_af_id FROM public.teams WHERE id = v_match.home_team_id LIMIT 1;
SELECT api_football_id INTO v_away_af_id FROM public.teams WHERE id = v_match.away_team_id LIMIT 1;

-- ─── 2. Load events ──────────────────────────────────────────────────────
IF v_af_fixture_id IS NOT NULL THEN
  SELECT
    COUNT(*) FILTER (WHERE e.event_type = 'Card' AND e.event_detail ILIKE '%Yellow%' AND e.api_football_team_id = v_home_af_id),
    COUNT(*) FILTER (WHERE e.event_type = 'Card' AND e.event_detail ILIKE '%Yellow%' AND e.api_football_team_id = v_away_af_id),
    COUNT(*) FILTER (WHERE e.event_type = 'Card' AND e.event_detail ILIKE '%Red%'    AND e.api_football_team_id = v_home_af_id),
    COUNT(*) FILTER (WHERE e.event_type = 'Card' AND e.event_detail ILIKE '%Red%'    AND e.api_football_team_id = v_away_af_id),
    COUNT(*) FILTER (WHERE e.event_type = 'subst' AND e.api_football_team_id = v_home_af_id),
    COUNT(*) FILTER (WHERE e.event_type = 'subst' AND e.api_football_team_id = v_away_af_id),
    COUNT(*) FILTER (WHERE e.event_type = 'Goal'  AND e.elapsed >= (v_elapsed - 15) AND e.elapsed <= v_elapsed),
    COUNT(*) FILTER (WHERE e.event_type = 'Card'  AND e.elapsed >= (v_elapsed - 15) AND e.elapsed <= v_elapsed),
    COUNT(*) FILTER (WHERE e.event_type = 'subst' AND e.elapsed >= (v_elapsed - 15) AND e.elapsed <= v_elapsed),
    COUNT(*) FILTER (WHERE e.event_type = 'subst' AND e.api_football_team_id = v_home_af_id AND e.elapsed >= (v_elapsed - 20)),
    COUNT(*) FILTER (WHERE e.event_type = 'subst' AND e.api_football_team_id = v_away_af_id AND e.elapsed >= (v_elapsed - 20)),
    MAX(e.elapsed),
    COUNT(*)
  INTO
    v_home_yellow, v_away_yellow,
    v_home_red, v_away_red,
    v_home_subs, v_away_subs,
    v_goals_last15, v_cards_last15, v_subs_last15,
    v_home_subs_last20, v_away_subs_last20,
    v_last_event_elap,
    v_events_count
  FROM public.api_football_fixture_events e
  WHERE e.api_football_fixture_id = v_af_fixture_id;

  v_events_available := (v_events_count > 0);
END IF;

-- ─── 3. Load stats (best-effort — no error if missing) ───────────────────
IF v_af_fixture_id IS NOT NULL AND v_home_af_id IS NOT NULL THEN
  SELECT
    COALESCE(MAX(s.ball_possession) FILTER (WHERE s.half = 'FT'), MAX(s.ball_possession) FILTER (WHERE s.half = 'HT'), 50),
    COALESCE(MAX(s.shots_on_goal)   FILTER (WHERE s.half = 'FT'), MAX(s.shots_on_goal)   FILTER (WHERE s.half = 'HT'), 0),
    COALESCE(MAX(s.corner_kicks)    FILTER (WHERE s.half = 'FT'), MAX(s.corner_kicks)    FILTER (WHERE s.half = 'HT'), 0),
    COUNT(*)
  INTO v_home_poss, v_home_shots, v_home_corners, v_stats_count
  FROM af_uefa_fixture_stats s
  WHERE s.api_football_fixture_id = v_af_fixture_id
    AND s.af_team_id = v_home_af_id;
END IF;

IF v_af_fixture_id IS NOT NULL AND v_away_af_id IS NOT NULL THEN
  SELECT
    COALESCE(MAX(s.ball_possession) FILTER (WHERE s.half = 'FT'), MAX(s.ball_possession) FILTER (WHERE s.half = 'HT'), 50),
    COALESCE(MAX(s.shots_on_goal)   FILTER (WHERE s.half = 'FT'), MAX(s.shots_on_goal)   FILTER (WHERE s.half = 'HT'), 0),
    COALESCE(MAX(s.corner_kicks)    FILTER (WHERE s.half = 'FT'), MAX(s.corner_kicks)    FILTER (WHERE s.half = 'HT'), 0)
  INTO v_away_poss, v_away_shots, v_away_corners
  FROM af_uefa_fixture_stats s
  WHERE s.api_football_fixture_id = v_af_fixture_id
    AND s.af_team_id = v_away_af_id;
END IF;

v_stats_available := (v_stats_count > 0);

-- ─── 4. Lineups availability ──────────────────────────────────────────────
IF v_af_fixture_id IS NOT NULL THEN
  SELECT EXISTS(
    SELECT 1 FROM public.api_football_fixture_lineups
    WHERE api_football_fixture_id = v_af_fixture_id LIMIT 1
  ) INTO v_lineups_available;
END IF;

-- ─── 5. Compute signals ───────────────────────────────────────────────────

v_data_completeness := (
  (CASE WHEN v_events_available  THEN 0.4 ELSE 0 END) +
  (CASE WHEN v_stats_available   THEN 0.4 ELSE 0 END) +
  (CASE WHEN v_lineups_available THEN 0.2 ELSE 0 END)
);

IF v_data_completeness >= 0.8 AND v_elapsed >= 20 THEN
  v_confidence := 'high';
ELSIF v_data_completeness >= 0.4 OR v_elapsed >= 10 THEN
  v_confidence := 'medium';
ELSE
  v_confidence := 'low';
END IF;

IF v_phase IN ('2H', 'ET', 'BT') AND v_elapsed > 75 THEN
  v_late_goal_press := LEAST(1.0, GREATEST(0.0, (v_elapsed - 75.0) / 20.0))::numeric(4,3);
ELSE
  v_late_goal_press := 0;
END IF;

v_pressure_home := LEAST(1.0, GREATEST(0.0,
  (v_home_shots * 0.4 + v_home_corners * 0.15 + v_home_poss * 0.01 + v_home_subs * 0.1) / 1.1
))::numeric(4,3);

v_pressure_away := LEAST(1.0, GREATEST(0.0,
  (v_away_shots * 0.4 + v_away_corners * 0.15 + v_away_poss * 0.01 + v_away_subs * 0.1) / 1.1
))::numeric(4,3);

IF v_pressure_home > v_pressure_away + 0.15 THEN
  v_momentum_dir := 'home';
ELSIF v_pressure_away > v_pressure_home + 0.15 THEN
  v_momentum_dir := 'away';
ELSIF v_goals_last15 >= 2 OR v_cards_last15 >= 3 THEN
  v_momentum_dir := 'chaotic';
ELSE
  v_momentum_dir := 'neutral';
END IF;

v_momentum_score := LEAST(1.0, GREATEST(-1.0,
  (v_home_poss - v_away_poss) * 0.005 +
  (v_home_shots - v_away_shots) * 0.05 +
  (v_goals_last15 * CASE WHEN v_diff > 0 THEN 0.1 ELSE -0.1 END)
))::numeric(4,3);

v_chaos := LEAST(1.0, GREATEST(0.0,
  v_total_goals * 0.12 +
  (v_home_red + v_away_red) * 0.25 +
  v_goals_last15 * 0.25 +
  v_cards_last15 * 0.08 +
  v_subs_last15  * 0.04
))::numeric(4,3);

v_tact_instability := LEAST(1.0, GREATEST(0.0,
  (v_home_red + v_away_red) * 0.3 +
  v_chaos * 0.4 +
  v_subs_last15 * 0.06
))::numeric(4,3);

v_deficit := ABS(v_diff);
v_late_factor := LEAST(1.0, GREATEST(0.0, (v_elapsed - 60.0) / 30.0));
IF v_diff < 0 THEN
  v_subs_deficit_factor := LEAST(1.0, v_home_subs * 0.25);
ELSIF v_diff > 0 THEN
  v_subs_deficit_factor := LEAST(1.0, v_away_subs * 0.25);
ELSE
  v_subs_deficit_factor := 0;
END IF;
v_desperation := LEAST(1.0, GREATEST(0.0,
  v_deficit * 0.25 * v_late_factor + v_subs_deficit_factor * 0.25 + v_late_goal_press * 0.2
))::numeric(4,3);

IF ABS(v_diff) = 1 AND v_elapsed >= 70 THEN
  v_late_factor2 := LEAST(1.0, GREATEST(0.0, (v_elapsed - 70.0) / 20.0));
  v_trailing_subs_last20 := CASE WHEN v_diff < 0 THEN v_home_subs_last20 ELSE v_away_subs_last20 END;
  v_comeback_press := LEAST(1.0, GREATEST(0.0,
    0.4 + v_late_factor2 * 0.4 + LEAST(0.2, v_trailing_subs_last20 * 0.1)
  ))::numeric(4,3);
ELSE
  v_comeback_press := 0;
END IF;

IF v_diff = 0 THEN
  v_draw_stability := LEAST(1.0, GREATEST(0.0, 1.0 - v_chaos))::numeric(4,3);
ELSE
  v_draw_stability := 0;
END IF;

-- ─── 6. State classification ─────────────────────────────────────────────
IF v_total_goals >= 3 OR (v_home_red + v_away_red) >= 2 THEN
  v_state := 'chaos_phase';
  v_triggered_rules := v_triggered_rules || '["chaos: total_goals>=3 OR red_cards>=2"]'::jsonb;
ELSIF v_diff < -1 AND v_elapsed >= 70 THEN
  v_state := 'desperation_home';
  v_triggered_rules := v_triggered_rules || '["home trailing >=2, elapsed>=70"]'::jsonb;
ELSIF v_diff > 1 AND v_elapsed >= 70 THEN
  v_state := 'desperation_away';
  v_triggered_rules := v_triggered_rules || '["away trailing >=2, elapsed>=70"]'::jsonb;
ELSIF v_diff < 0 AND ABS(v_diff) = 1 AND v_elapsed >= 75 AND v_home_subs_last20 >= 1 THEN
  v_state := 'comeback_mode_home';
  v_triggered_rules := v_triggered_rules || '["home trailing 1, elapsed>=75, sub in last 20"]'::jsonb;
ELSIF v_diff > 0 AND ABS(v_diff) = 1 AND v_elapsed >= 75 AND v_away_subs_last20 >= 1 THEN
  v_state := 'comeback_mode_away';
  v_triggered_rules := v_triggered_rules || '["away trailing 1, elapsed>=75, sub in last 20"]'::jsonb;
ELSIF v_diff < 0 AND v_elapsed >= 80 THEN
  v_state := 'late_pressure_home';
  v_triggered_rules := v_triggered_rules || '["home trailing, elapsed>=80"]'::jsonb;
ELSIF v_diff > 0 AND v_elapsed >= 80 THEN
  v_state := 'late_pressure_away';
  v_triggered_rules := v_triggered_rules || '["away trailing, elapsed>=80"]'::jsonb;
ELSIF ABS(v_diff) >= 3 THEN
  v_state := 'game_killed';
  v_triggered_rules := v_triggered_rules || '["score differential >=3"]'::jsonb;
ELSIF v_home_poss >= 60 AND v_home_shots >= 5 AND v_diff <= 0 THEN
  v_state := 'high_press_home';
  v_triggered_rules := v_triggered_rules || '["home poss>=60%, shots>=5, not leading"]'::jsonb;
ELSIF v_away_poss >= 60 AND v_away_shots >= 5 AND v_diff >= 0 THEN
  v_state := 'high_press_away';
  v_triggered_rules := v_triggered_rules || '["away poss>=60%, shots>=5, not leading"]'::jsonb;
ELSIF v_away_poss >= 60 AND v_home_poss <= 30 AND v_diff > 0 THEN
  v_state := 'low_block_home';
  v_triggered_rules := v_triggered_rules || '["home defending: away poss>=60, home poss<=30, home leading"]'::jsonb;
ELSIF v_home_poss >= 60 AND v_away_poss <= 30 AND v_diff < 0 THEN
  v_state := 'low_block_away';
  v_triggered_rules := v_triggered_rules || '["away defending: home poss>=60, away poss<=30, away leading"]'::jsonb;
ELSIF (v_home_yellow + v_away_yellow) >= 4 OR ABS(v_home_poss - v_away_poss) < 10 THEN
  v_state := 'transition_heavy';
  v_triggered_rules := v_triggered_rules || '["yellows>=4 OR possession differential<10%"]'::jsonb;
ELSE
  v_state := 'balanced';
  v_triggered_rules := v_triggered_rules || '["no higher-priority rule triggered"]'::jsonb;
END IF;

-- ─── 7. Reasoning JSON ───────────────────────────────────────────────────
v_inputs := jsonb_build_object(
  'elapsed', v_elapsed, 'phase', v_phase,
  'home_score', v_home_score, 'away_score', v_away_score,
  'home_poss', v_home_poss, 'away_poss', v_away_poss,
  'home_shots_on_goal', v_home_shots, 'away_shots_on_goal', v_away_shots,
  'home_corners', v_home_corners, 'away_corners', v_away_corners,
  'home_yellow', v_home_yellow, 'away_yellow', v_away_yellow,
  'home_red', v_home_red, 'away_red', v_away_red,
  'home_subs', v_home_subs, 'away_subs', v_away_subs,
  'goals_last_15min', v_goals_last15, 'cards_last_15min', v_cards_last15,
  'subs_last_15min', v_subs_last15,
  'home_subs_last20', v_home_subs_last20, 'away_subs_last20', v_away_subs_last20
);

v_thresholds := jsonb_build_object(
  'chaos_goal_threshold', 3, 'chaos_red_threshold', 2,
  'desperation_deficit', 2, 'desperation_elapsed', 70,
  'comeback_deficit', 1, 'comeback_elapsed', 75,
  'late_pressure_elapsed', 80, 'game_killed_deficit', 3,
  'high_press_poss_min', 60, 'high_press_shots_min', 5,
  'low_block_poss_max', 30, 'transition_yellows_min', 4
);

v_reasoning := jsonb_build_object(
  'triggered_rules', v_triggered_rules,
  'thresholds', v_thresholds,
  'observable_inputs', v_inputs,
  'computed_at', now()::text,
  'data_sources', jsonb_build_object(
    'events_available', v_events_available,
    'stats_available', v_stats_available,
    'lineups_available', v_lineups_available,
    'data_completeness', v_data_completeness
  )
);

-- ─── 8. Upsert live_match_states ─────────────────────────────────────────
INSERT INTO model_lab.live_match_states (
  fixture_id, api_football_fixture_id,
  status_short, elapsed, home_score, away_score, score_differential,
  home_score_ht, away_score_ht, phase,
  live_pressure_index_home, live_pressure_index_away, pressure_dominance,
  momentum_direction, momentum_score,
  tactical_instability_score, comeback_pressure_score, desperation_level,
  draw_stability_score, chaos_score, late_goal_pressure,
  current_live_state, state_confidence, state_reasoning_json,
  events_available, stats_available, lineups_available, data_completeness_score,
  home_yellow_cards, away_yellow_cards, home_red_cards, away_red_cards,
  home_subs_used, away_subs_used, total_goals_scored,
  goals_last_15min, cards_last_15min, subs_last_15min,
  home_possession, away_possession,
  home_shots_on_goal, away_shots_on_goal,
  home_corners, away_corners,
  engine_version, computed_at, last_event_elapsed, stale_warning
)
VALUES (
  p_fixture_id, v_af_fixture_id,
  v_phase, v_elapsed, v_home_score, v_away_score, v_diff,
  v_match.home_score_ht, v_match.away_score_ht, v_phase,
  v_pressure_home, v_pressure_away,
  CASE WHEN v_pressure_home > v_pressure_away + 0.1 THEN 'home'
       WHEN v_pressure_away > v_pressure_home + 0.1 THEN 'away'
       ELSE 'neutral' END,
  v_momentum_dir, v_momentum_score,
  v_tact_instability, v_comeback_press, v_desperation,
  v_draw_stability, v_chaos, v_late_goal_press,
  v_state, v_confidence, v_reasoning,
  v_events_available, v_stats_available, v_lineups_available, v_data_completeness,
  v_home_yellow, v_away_yellow, v_home_red, v_away_red,
  v_home_subs, v_away_subs, v_total_goals,
  v_goals_last15, v_cards_last15, v_subs_last15,
  v_home_poss, v_away_poss,
  v_home_shots, v_away_shots,
  v_home_corners, v_away_corners,
  'v1', now(), v_last_event_elap, false
)
ON CONFLICT (fixture_id) DO UPDATE SET
  api_football_fixture_id   = EXCLUDED.api_football_fixture_id,
  status_short              = EXCLUDED.status_short,
  elapsed                   = EXCLUDED.elapsed,
  home_score                = EXCLUDED.home_score,
  away_score                = EXCLUDED.away_score,
  score_differential        = EXCLUDED.score_differential,
  home_score_ht             = EXCLUDED.home_score_ht,
  away_score_ht             = EXCLUDED.away_score_ht,
  phase                     = EXCLUDED.phase,
  live_pressure_index_home  = EXCLUDED.live_pressure_index_home,
  live_pressure_index_away  = EXCLUDED.live_pressure_index_away,
  pressure_dominance        = EXCLUDED.pressure_dominance,
  momentum_direction        = EXCLUDED.momentum_direction,
  momentum_score            = EXCLUDED.momentum_score,
  tactical_instability_score= EXCLUDED.tactical_instability_score,
  comeback_pressure_score   = EXCLUDED.comeback_pressure_score,
  desperation_level         = EXCLUDED.desperation_level,
  draw_stability_score      = EXCLUDED.draw_stability_score,
  chaos_score               = EXCLUDED.chaos_score,
  late_goal_pressure        = EXCLUDED.late_goal_pressure,
  current_live_state        = EXCLUDED.current_live_state,
  state_confidence          = EXCLUDED.state_confidence,
  state_reasoning_json      = EXCLUDED.state_reasoning_json,
  events_available          = EXCLUDED.events_available,
  stats_available           = EXCLUDED.stats_available,
  lineups_available         = EXCLUDED.lineups_available,
  data_completeness_score   = EXCLUDED.data_completeness_score,
  home_yellow_cards         = EXCLUDED.home_yellow_cards,
  away_yellow_cards         = EXCLUDED.away_yellow_cards,
  home_red_cards            = EXCLUDED.home_red_cards,
  away_red_cards            = EXCLUDED.away_red_cards,
  home_subs_used            = EXCLUDED.home_subs_used,
  away_subs_used            = EXCLUDED.away_subs_used,
  total_goals_scored        = EXCLUDED.total_goals_scored,
  goals_last_15min          = EXCLUDED.goals_last_15min,
  cards_last_15min          = EXCLUDED.cards_last_15min,
  subs_last_15min           = EXCLUDED.subs_last_15min,
  home_possession           = EXCLUDED.home_possession,
  away_possession           = EXCLUDED.away_possession,
  home_shots_on_goal        = EXCLUDED.home_shots_on_goal,
  away_shots_on_goal        = EXCLUDED.away_shots_on_goal,
  home_corners              = EXCLUDED.home_corners,
  away_corners              = EXCLUDED.away_corners,
  engine_version            = EXCLUDED.engine_version,
  computed_at               = EXCLUDED.computed_at,
  last_event_elapsed        = EXCLUDED.last_event_elapsed,
  stale_warning             = EXCLUDED.stale_warning;

-- ─── 9. Upsert history — ON CONFLICT skips duplicate snapshots ───────────
INSERT INTO model_lab.live_match_state_history (
  fixture_id, api_football_fixture_id,
  elapsed, phase, snapshot_at,
  home_score, away_score,
  current_live_state, state_confidence, momentum_direction,
  live_pressure_index_home, live_pressure_index_away,
  chaos_score, comeback_pressure_score, desperation_level, late_goal_pressure,
  home_yellow_cards, away_yellow_cards, home_red_cards, away_red_cards,
  home_subs_used, away_subs_used,
  goals_last_15min, cards_last_15min,
  state_reasoning_json, engine_version
)
VALUES (
  p_fixture_id, v_af_fixture_id,
  v_elapsed, v_phase, now(),
  v_home_score, v_away_score,
  v_state, v_confidence, v_momentum_dir,
  v_pressure_home, v_pressure_away,
  v_chaos, v_comeback_press, v_desperation, v_late_goal_press,
  v_home_yellow, v_away_yellow, v_home_red, v_away_red,
  v_home_subs, v_away_subs,
  v_goals_last15, v_cards_last15,
  v_reasoning, 'v1'
)
ON CONFLICT (fixture_id, elapsed, engine_version) DO UPDATE SET
  snapshot_at               = LEAST(model_lab.live_match_state_history.snapshot_at, EXCLUDED.snapshot_at),
  current_live_state        = EXCLUDED.current_live_state,
  state_confidence          = EXCLUDED.state_confidence,
  momentum_direction        = EXCLUDED.momentum_direction,
  live_pressure_index_home  = EXCLUDED.live_pressure_index_home,
  live_pressure_index_away  = EXCLUDED.live_pressure_index_away,
  chaos_score               = EXCLUDED.chaos_score,
  comeback_pressure_score   = EXCLUDED.comeback_pressure_score,
  desperation_level         = EXCLUDED.desperation_level,
  late_goal_pressure        = EXCLUDED.late_goal_pressure,
  home_yellow_cards         = EXCLUDED.home_yellow_cards,
  away_yellow_cards         = EXCLUDED.away_yellow_cards,
  home_red_cards            = EXCLUDED.home_red_cards,
  away_red_cards            = EXCLUDED.away_red_cards,
  home_subs_used            = EXCLUDED.home_subs_used,
  away_subs_used            = EXCLUDED.away_subs_used,
  goals_last_15min          = EXCLUDED.goals_last_15min,
  cards_last_15min          = EXCLUDED.cards_last_15min,
  state_reasoning_json      = EXCLUDED.state_reasoning_json;

RETURN jsonb_build_object(
  'fixture_id', p_fixture_id,
  'state', v_state,
  'confidence', v_confidence,
  'elapsed', v_elapsed,
  'score', v_home_score || '-' || v_away_score,
  'chaos', v_chaos,
  'desperation', v_desperation,
  'late_goal_pressure', v_late_goal_press,
  'data_completeness', v_data_completeness
);
END;
$$;
