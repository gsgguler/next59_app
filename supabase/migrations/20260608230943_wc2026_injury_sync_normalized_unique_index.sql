
-- Partial unique index on af_injuries_normalized for WC2026 injury sync re-run safety.
-- Only dedups rows inserted by the wc2026_injury_sync pass where player id is known.
CREATE UNIQUE INDEX IF NOT EXISTS af_injuries_normalized_wc2026_team_player_unique
  ON af_injuries_normalized (af_team_id, af_player_id)
  WHERE source_provider = 'wc2026_injury_sync' AND af_player_id IS NOT NULL;
