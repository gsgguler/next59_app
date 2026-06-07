-- Allow public read on WC2026 calibration/scenario/profile tables
-- These tables contain prediction data that should be visible to all visitors

CREATE POLICY "public_read_wc2026_calibration_runs"
  ON wc2026_calibration_runs
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "public_read_wc2026_match_scenario_calibration"
  ON wc2026_match_scenario_calibration
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "public_read_wc2026_team_calibration_profiles"
  ON wc2026_team_calibration_profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);
