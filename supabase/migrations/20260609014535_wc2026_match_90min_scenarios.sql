-- 90-minute narrative scenario layer for WC2026 fixtures
CREATE TABLE IF NOT EXISTS wc2026_match_90min_scenarios (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id             bigint NOT NULL,      -- api_football_fixture_id
  calibration_run_id     uuid NOT NULL,
  home_team_name         text NOT NULL,
  away_team_name         text NOT NULL,
  predicted_score        text NOT NULL,        -- e.g. "1-0"
  home_win_probability   numeric(5,3) NOT NULL,
  draw_probability       numeric(5,3) NOT NULL,
  away_win_probability   numeric(5,3) NOT NULL,
  strength_diff          numeric(8,2),
  tempo_profile          text,
  first_15_story         text,
  minutes_15_30_story    text,
  minutes_30_45_story    text,
  minutes_45_60_story    text,
  minutes_60_75_story    text,
  minutes_75_90_story    text,
  key_match_triggers     jsonb DEFAULT '[]',
  tactical_notes         jsonb DEFAULT '{}',
  risk_notes             jsonb DEFAULT '{}',
  confidence_label       text,
  formula_version        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, calibration_run_id)
);

ALTER TABLE wc2026_match_90min_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_90min_scenarios" ON wc2026_match_90min_scenarios
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_90min_scenarios_fixture
  ON wc2026_match_90min_scenarios (fixture_id);
CREATE INDEX IF NOT EXISTS idx_90min_scenarios_run
  ON wc2026_match_90min_scenarios (calibration_run_id);
