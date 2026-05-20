/*
  # Live Micro-Simulation Engine V1 — Tables

  ## Summary
  Creates the storage layer for the 5-minute window micro-simulation engine.
  Windows are computed deterministically from event streams. No LLM, no fake xG.

  ## New Tables
  - `model_lab.live_micro_windows` — one row per fixture per 5-min window per engine version
  - `model_lab.live_micro_window_runs` — run log for each batch/live invocation

  ## Security
  - RLS enabled; admin-only read via profiles.role check
  - No public write or read

  ## Notes
  1. UNIQUE on (fixture_id, window_start_minute, engine_version) — fully idempotent upserts
  2. `source_quality` enum: event_only | event_stats | event_stats_lineups | insufficient
  3. `micro_state` values defined in state machine function
*/

-- ─────────────────────────────────────────────
-- live_micro_windows
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.live_micro_windows (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fixture identification
  fixture_id                integer NOT NULL,           -- api_football_fixture_id
  match_id                  uuid,                       -- canonical match UUID (nullable)

  -- Window bounds
  window_start_minute       integer NOT NULL,
  window_end_minute         integer NOT NULL,

  -- Score at end of window
  home_score                integer NOT NULL DEFAULT 0,
  away_score                integer NOT NULL DEFAULT 0,

  -- Event counts in this window
  events_count              integer NOT NULL DEFAULT 0,
  goals_home                integer NOT NULL DEFAULT 0,
  goals_away                integer NOT NULL DEFAULT 0,
  shots_home                integer DEFAULT 0,
  shots_away                integer DEFAULT 0,
  corners_home              integer NOT NULL DEFAULT 0,
  corners_away              integer NOT NULL DEFAULT 0,
  cards_home                integer NOT NULL DEFAULT 0,
  cards_away                integer NOT NULL DEFAULT 0,
  red_cards_home            integer NOT NULL DEFAULT 0,
  red_cards_away            integer NOT NULL DEFAULT 0,
  substitutions_home        integer NOT NULL DEFAULT 0,
  substitutions_away        integer NOT NULL DEFAULT 0,

  -- Cumulative possession (end-of-match stats allocated proportionally when available)
  possession_home           numeric(5,2),
  possession_away           numeric(5,2),

  -- Derived pressure scores (0.0–1.0)
  pressure_home             numeric(5,4) NOT NULL DEFAULT 0,
  pressure_away             numeric(5,4) NOT NULL DEFAULT 0,
  pressure_delta            numeric(5,4) NOT NULL DEFAULT 0,  -- home − away

  -- Momentum direction: home | away | neutral
  momentum_direction        text NOT NULL DEFAULT 'neutral',

  -- Composite scores (0.0–1.0)
  tactical_instability_score  numeric(5,4) NOT NULL DEFAULT 0,
  fatigue_wave_score          numeric(5,4) NOT NULL DEFAULT 0,
  chaos_score                 numeric(5,4) NOT NULL DEFAULT 0,
  comeback_pressure_score     numeric(5,4) NOT NULL DEFAULT 0,
  draw_preservation_score     numeric(5,4) NOT NULL DEFAULT 0,
  late_goal_risk              numeric(5,4) NOT NULL DEFAULT 0,

  -- State classification
  micro_state               text NOT NULL DEFAULT 'data_insufficient',
  confidence                numeric(3,2) NOT NULL DEFAULT 0,  -- 0.0–1.0

  -- Data quality
  source_quality            text NOT NULL DEFAULT 'event_only',
  -- event_only | event_stats | event_stats_lineups | insufficient

  -- Metadata
  calculated_at             timestamptz NOT NULL DEFAULT now(),
  engine_version            text NOT NULL DEFAULT 'micro_v1',

  -- Full reasoning log
  reasoning_json            jsonb,

  UNIQUE (fixture_id, window_start_minute, engine_version)
);

CREATE INDEX IF NOT EXISTS idx_live_micro_windows_fixture
  ON model_lab.live_micro_windows(fixture_id, window_start_minute);

CREATE INDEX IF NOT EXISTS idx_live_micro_windows_state
  ON model_lab.live_micro_windows(micro_state, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_micro_windows_match
  ON model_lab.live_micro_windows(match_id) WHERE match_id IS NOT NULL;

ALTER TABLE model_lab.live_micro_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read micro windows"
  ON model_lab.live_micro_windows FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ─────────────────────────────────────────────
-- live_micro_window_runs
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.live_micro_window_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  status           text NOT NULL DEFAULT 'running',  -- running|completed|failed
  fixture_id       integer,   -- NULL = batch run
  scope            text NOT NULL DEFAULT 'single',   -- single|batch|live
  windows_created  integer NOT NULL DEFAULT 0,
  windows_updated  integer NOT NULL DEFAULT 0,
  fixtures_processed integer NOT NULL DEFAULT 0,
  errors_json      jsonb,
  warnings_json    jsonb,
  engine_version   text NOT NULL DEFAULT 'micro_v1'
);

CREATE INDEX IF NOT EXISTS idx_micro_window_runs_started
  ON model_lab.live_micro_window_runs(started_at DESC);

ALTER TABLE model_lab.live_micro_window_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read micro window runs"
  ON model_lab.live_micro_window_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Grant service role write
GRANT ALL ON model_lab.live_micro_windows TO service_role;
GRANT ALL ON model_lab.live_micro_window_runs TO service_role;
GRANT SELECT ON model_lab.live_micro_windows TO authenticated;
GRANT SELECT ON model_lab.live_micro_window_runs TO authenticated;
