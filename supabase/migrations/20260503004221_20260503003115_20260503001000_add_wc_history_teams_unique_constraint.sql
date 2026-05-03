/*
  # WC History — Add teams unique constraint for idempotency

  Ensures wc_history.teams has a unique constraint on (edition_year, name_en)
  so wch_upsert_teams_bulk can use ON CONFLICT DO NOTHING safely.
*/
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wc_history_teams_edition_name_uq'
      AND conrelid = 'wc_history.teams'::regclass
  ) THEN
    ALTER TABLE wc_history.teams
      ADD CONSTRAINT wc_history_teams_edition_name_uq
      UNIQUE (edition_year, name_en);
  END IF;
END $$;
