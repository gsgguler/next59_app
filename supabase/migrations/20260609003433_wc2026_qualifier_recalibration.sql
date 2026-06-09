-- Add qualifier_form_factor column to calibration profiles
ALTER TABLE wc2026_team_calibration_profiles
  ADD COLUMN IF NOT EXISTS qualifier_form_factor numeric(6,4);

-- Recalibrate: compute qualifier_form_factor and update injury_adjusted_strength_index
-- Formula: clamp(1.0 + (win_rate - 0.55) * 0.04, 0.97, 1.03)
-- Applied to ALL rows for the 16 UEFA WC2026 qualified teams
UPDATE wc2026_team_calibration_profiles p
SET
  qualifier_form_factor = GREATEST(0.97, LEAST(1.03,
    1.0 + (q.win_rate::numeric - 0.55) * 0.04
  )),
  injury_adjusted_strength_index = ROUND(
    p.wc2026_team_strength_index * GREATEST(0.97, LEAST(1.03,
      1.0 + (q.win_rate::numeric - 0.55) * 0.04
    )), 4
  )
FROM wc2026_uefa_qualifier_team_stats q
WHERE q.api_football_team_id = p.api_football_team_id
  AND q.wc2026_qualified = true;
