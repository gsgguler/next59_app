/*
  # Live Memory Engine — Phase 1: Outcome Tables

  Creates the core memory storage layer for the live intelligence calibration system.

  ## New Tables

  ### model_lab.live_state_outcomes
  One row per (fixture_id, elapsed_minute_bucket) snapshot from completed matches.
  Captures the live state at a given minute alongside the subsequent ground-truth
  outcomes, enabling backward evaluation after FT.

  Columns:
  - fixture_id, match_id (public.matches), elapsed, phase
  - Pressure signals: live_pressure_index_home/away, chaos_score, comeback_pressure_score,
    desperation_level, late_goal_pressure, momentum_direction
  - Score state: home_score, away_score, score_differential, leading_team
  - Computed from events: goal_in_next_5min, goal_in_next_10min, next_goal_team,
    red_card_after_state, comeback_occurred, draw_preserved, late_goal_occurred
  - final_result (H/A/D), was_false_live_confidence (bool)
  - current_live_state, state_confidence, competition_season_id, engine_version

  ### model_lab.live_state_pattern_memory
  Aggregated per (competition_season_id, current_live_state, minute_bucket).
  Persists calibration statistics updated by refresh_live_state_pattern_memory().

  Columns:
  - competition_season_id, current_live_state, minute_bucket (0-14,15-29,30-44,45-59,60-74,75-90,90+)
  - sample_size, low_sample_warning (< 30 samples)
  - goal_follow_rate_5min, goal_follow_rate_10min
  - comeback_rate, chaos_reliability_score, late_goal_rate
  - false_confidence_rate, calibration_score (0–1)
  - strongest_pressure_bucket, updated_at

  ## Security
  - RLS enabled on both tables
  - Admin SELECT (profiles.role = 'admin')
  - service_role INSERT/UPDATE

  ## Notes
  1. live_state_outcomes has UNIQUE on (fixture_id, elapsed) to prevent duplicates
  2. live_state_pattern_memory has UNIQUE on (competition_season_id, current_live_state, minute_bucket)
  3. Minimum sample threshold: 30 rows before pattern is considered reliable
  4. was_false_live_confidence = true when state_confidence = 'high' but outcome contradicts signal
*/

-- ── live_state_outcomes ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.live_state_outcomes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id                uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  api_football_fixture_id   integer,
  competition_season_id     uuid REFERENCES public.competition_seasons(id),

  -- Snapshot context
  elapsed                   integer NOT NULL,
  phase                     text,
  home_score                integer NOT NULL DEFAULT 0,
  away_score                integer NOT NULL DEFAULT 0,
  score_differential        integer GENERATED ALWAYS AS (home_score - away_score) STORED,
  leading_team              text, -- 'home' | 'away' | 'draw'

  -- Live signals at snapshot time
  current_live_state        text NOT NULL,
  state_confidence          text NOT NULL,
  momentum_direction        text,
  live_pressure_index_home  numeric(5,3),
  live_pressure_index_away  numeric(5,3),
  chaos_score               numeric(5,3),
  comeback_pressure_score   numeric(5,3),
  desperation_level         numeric(5,3),
  late_goal_pressure        numeric(5,3),
  data_completeness_score   numeric(5,3),

  -- Ground-truth outcomes (filled after FT)
  goal_in_next_5min         boolean,
  goal_in_next_10min        boolean,
  next_goal_team            text,   -- 'home' | 'away' | null
  red_card_after_state      boolean DEFAULT false,
  comeback_occurred         boolean DEFAULT false,
  draw_preserved            boolean DEFAULT false,
  late_goal_occurred        boolean DEFAULT false,
  final_result              text,   -- H | A | D
  was_false_live_confidence boolean DEFAULT false,

  engine_version            text NOT NULL DEFAULT 'v1',
  evaluated_at              timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (fixture_id, elapsed)
);

ALTER TABLE model_lab.live_state_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read live state outcomes"
  ON model_lab.live_state_outcomes FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role can insert live state outcomes"
  ON model_lab.live_state_outcomes FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update live state outcomes"
  ON model_lab.live_state_outcomes FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lso_fixture_id ON model_lab.live_state_outcomes(fixture_id);
CREATE INDEX IF NOT EXISTS idx_lso_competition_season ON model_lab.live_state_outcomes(competition_season_id);
CREATE INDEX IF NOT EXISTS idx_lso_live_state ON model_lab.live_state_outcomes(current_live_state);
CREATE INDEX IF NOT EXISTS idx_lso_evaluated_at ON model_lab.live_state_outcomes(evaluated_at) WHERE evaluated_at IS NOT NULL;

-- ── live_state_pattern_memory ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.live_state_pattern_memory (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_season_id     uuid REFERENCES public.competition_seasons(id),
  current_live_state        text NOT NULL,
  minute_bucket             text NOT NULL, -- '0-14' | '15-29' | '30-44' | '45-59' | '60-74' | '75-90' | '90+'

  sample_size               integer NOT NULL DEFAULT 0,
  low_sample_warning        boolean NOT NULL DEFAULT true,

  goal_follow_rate_5min     numeric(5,4),
  goal_follow_rate_10min    numeric(5,4),
  comeback_rate             numeric(5,4),
  chaos_reliability_score   numeric(5,4),
  late_goal_rate            numeric(5,4),
  false_confidence_rate     numeric(5,4),
  calibration_score         numeric(5,4),

  strongest_pressure_bucket text, -- 'home_dominant' | 'away_dominant' | 'balanced'

  updated_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (competition_season_id, current_live_state, minute_bucket)
);

ALTER TABLE model_lab.live_state_pattern_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read live state pattern memory"
  ON model_lab.live_state_pattern_memory FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Service role can insert live state pattern memory"
  ON model_lab.live_state_pattern_memory FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update live state pattern memory"
  ON model_lab.live_state_pattern_memory FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lspm_state ON model_lab.live_state_pattern_memory(current_live_state);
CREATE INDEX IF NOT EXISTS idx_lspm_cs ON model_lab.live_state_pattern_memory(competition_season_id);
