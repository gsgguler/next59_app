/*
  Live Micro-Simulation — Outcome Learning V1: Tables

  1. model_lab.live_micro_window_outcomes
     Per-window outcome labels evaluated after match FT.
     Unique on (micro_window_id, engine_version).

  2. model_lab.live_micro_pattern_memory
     Aggregated pattern memory keyed by state/bucket combos.
     Replaces and extends live_state_pattern_memory for micro-sim use.

  Security: admin-only read via profiles.role = 'admin'.
*/

-- ── Table 1: per-window outcomes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.live_micro_window_outcomes (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  micro_window_id             uuid NOT NULL REFERENCES model_lab.live_micro_windows(id) ON DELETE CASCADE,
  fixture_id                  integer NOT NULL,
  window_start_minute         integer NOT NULL,
  window_end_minute           integer NOT NULL,
  micro_state                 text NOT NULL,
  pressure_delta              numeric(5,4),
  chaos_score                 numeric(5,4),
  late_goal_risk              numeric(5,4),
  comeback_pressure_score     numeric(5,4),
  draw_preservation_score     numeric(5,4),
  confidence                  numeric(3,2),
  source_quality              text,

  -- Outcome labels
  next_goal_within_5          boolean,
  next_goal_within_10         boolean,
  next_goal_within_15         boolean,
  next_goal_team              text,          -- 'home' | 'away' | null
  goal_against_pressure_dir   boolean,       -- goal favoured opponent
  red_card_within_10          boolean,
  substitution_within_10      boolean,
  comeback_occurred           boolean,
  draw_preserved              boolean,
  late_goal_after_window      boolean,       -- goal minute >= 75 after this window
  final_result                text,          -- 'home_win' | 'away_win' | 'draw'
  was_false_pressure_signal   boolean,
  was_false_chaos_signal      boolean,
  was_false_late_goal_signal  boolean,

  evaluated_at                timestamptz NOT NULL DEFAULT now(),
  engine_version              text NOT NULL DEFAULT 'micro_v1',
  reasoning_json              jsonb,

  UNIQUE (micro_window_id, engine_version)
);

ALTER TABLE model_lab.live_micro_window_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read outcomes"
  ON model_lab.live_micro_window_outcomes FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Service role can insert outcomes"
  ON model_lab.live_micro_window_outcomes FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Service role can update outcomes"
  ON model_lab.live_micro_window_outcomes FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_lmwo_fixture ON model_lab.live_micro_window_outcomes(fixture_id);
CREATE INDEX IF NOT EXISTS idx_lmwo_state ON model_lab.live_micro_window_outcomes(micro_state);
CREATE INDEX IF NOT EXISTS idx_lmwo_window ON model_lab.live_micro_window_outcomes(micro_window_id);

-- ── Table 2: aggregated pattern memory ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_lab.live_micro_pattern_memory (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  micro_state             text NOT NULL,
  minute_bucket           text NOT NULL,  -- '0-15','15-30','30-45','45-60','60-75','75-90'
  score_state             text NOT NULL,  -- 'home_leading','away_leading','level'
  pressure_bucket         text NOT NULL,  -- 'high_home','high_away','balanced'
  source_quality_bucket   text NOT NULL,  -- 'insufficient','event_only','event_stats'

  sample_size             integer NOT NULL DEFAULT 0,
  low_sample_warning      boolean NOT NULL DEFAULT true,

  goal_within_10_rate     numeric(5,4),
  late_goal_rate          numeric(5,4),
  comeback_rate           numeric(5,4),
  draw_preservation_rate  numeric(5,4),
  false_pressure_rate     numeric(5,4),
  false_chaos_rate        numeric(5,4),
  false_late_goal_rate    numeric(5,4),
  reliability_score       numeric(5,4),
  confidence_adjustment   numeric(4,3),   -- additive to window confidence

  updated_at              timestamptz NOT NULL DEFAULT now(),
  metadata_json           jsonb,

  UNIQUE (micro_state, minute_bucket, score_state, pressure_bucket, source_quality_bucket)
);

ALTER TABLE model_lab.live_micro_pattern_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read pattern memory"
  ON model_lab.live_micro_pattern_memory FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Service role can write pattern memory"
  ON model_lab.live_micro_pattern_memory FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Service role can update pattern memory"
  ON model_lab.live_micro_pattern_memory FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_lmpm_state_bucket
  ON model_lab.live_micro_pattern_memory(micro_state, minute_bucket);

GRANT SELECT, INSERT, UPDATE ON model_lab.live_micro_window_outcomes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON model_lab.live_micro_pattern_memory TO authenticated;
