ALTER TABLE wc2026_team_calibration_profiles
  ADD COLUMN IF NOT EXISTS squad_depth_score        numeric,
  ADD COLUMN IF NOT EXISTS availability_ratio        numeric,
  ADD COLUMN IF NOT EXISTS unavailable_player_count  integer,
  ADD COLUMN IF NOT EXISTS availability_risk_score   numeric,
  ADD COLUMN IF NOT EXISTS injury_adjusted_strength_index numeric;
