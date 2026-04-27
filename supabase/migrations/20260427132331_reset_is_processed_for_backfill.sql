/*
  # Reset is_processed for full backfill

  1. Modified Tables
    - `staging_football_data_uk_raw`
      - Resets `is_processed` to false for ALL rows so the updated
        transform-fd-to-final function can re-process them with the
        new columns (referee, shots, fouls, closing odds, asian handicap, etc.)

  2. Notes
    - This is safe because the transform function uses UPSERT (ON CONFLICT)
      so existing matches and outcomes will be updated in place, not duplicated
    - Only rows with valid data (home_team IS NOT NULL) will be picked up
    - After this migration, call the transform-fd-to-final edge function
      with batch_size=500 repeatedly until all rows are processed
*/

UPDATE staging_football_data_uk_raw
SET is_processed = false
WHERE is_processed = true;
