/*
  # Add is_processed flag to staging_football_data_uk_raw

  1. Modified Tables
    - `staging_football_data_uk_raw`
      - `is_processed` (boolean, default false) — tracks whether a staging row
        has been successfully transformed into the final matches + actual_outcomes tables

  2. Index
    - Partial index on (is_processed) WHERE is_processed = false for fast
      filtering of unprocessed rows

  3. Notes
    - Existing rows get is_processed = false so they can be picked up by the
      transform function on next run
    - No data is deleted or modified beyond the new column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staging_football_data_uk_raw'
      AND column_name = 'is_processed'
  ) THEN
    ALTER TABLE staging_football_data_uk_raw
      ADD COLUMN is_processed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staging_fd_uk_unprocessed
  ON staging_football_data_uk_raw (is_processed)
  WHERE is_processed = false;
