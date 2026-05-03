/*
  # Add transform_error column to player raw tables
  Required by normalization functions for error tracking.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'af_fixture_player_stats_raw' AND column_name = 'transform_error'
  ) THEN
    ALTER TABLE af_fixture_player_stats_raw ADD COLUMN transform_error text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'af_player_season_stats_raw' AND column_name = 'transform_error'
  ) THEN
    ALTER TABLE af_player_season_stats_raw ADD COLUMN transform_error text;
  END IF;
END $$;
