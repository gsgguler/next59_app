/*
  # v4.3-W1-D1 Step 5: Fix match_odds Provenance Gap

  Pre-check confirmed:
  - public.odds_providers is empty (0 rows)
  - public.match_odds has 1,201,988 rows all with provider_id = NULL
  - public.odds_providers.code has no unique constraint

  Fix:
  1. Insert football-data.co.uk into public.odds_providers (idempotent via DO block)
  2. Backfill match_odds.provider_id
  3. Create audit.ingestion_runs table
  4. Insert retroactive ingestion run record
*/

-- 1. Seed odds_providers idempotently
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.odds_providers WHERE code = 'football_data_uk') THEN
    INSERT INTO public.odds_providers (id, name, code, api_football_bookmaker_id)
    VALUES (uuid_generate_v4(), 'football-data.co.uk', 'football_data_uk', NULL);
  END IF;
END $$;

-- 2. Backfill all NULL provider_id rows
UPDATE public.match_odds
SET provider_id = (SELECT id FROM public.odds_providers WHERE code = 'football_data_uk')
WHERE provider_id IS NULL;

-- 3. Create audit.ingestion_runs
CREATE TABLE IF NOT EXISTS audit.ingestion_runs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id    UUID NOT NULL REFERENCES audit.data_providers(id),
  run_type       TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  completed_at   TIMESTAMPTZ,
  status         TEXT CHECK (status IN ('running','completed','failed','partial')),
  rows_inserted  BIGINT,
  rows_updated   BIGINT,
  rows_skipped   BIGINT,
  error_message  TEXT,
  metadata       JSONB,
  notes          TEXT
);

ALTER TABLE audit.ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ingestion_runs"
  ON audit.ingestion_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 4. Retroactive run record for the 2026-04-28 FD bulk load
INSERT INTO audit.ingestion_runs
  (provider_id, run_type, started_at, completed_at, status, rows_inserted, notes)
VALUES (
  (SELECT id FROM audit.data_providers WHERE code = 'football_data_uk'),
  'historical_backfill',
  '2026-04-28T00:00:00Z',
  '2026-04-28T23:59:59Z',
  'completed',
  (SELECT COUNT(*) FROM public.match_odds),
  'Retroactively logged after data_sources audit 2026-05-04. Original ingestion did not write run record. Covers all match_odds rows now tagged provider_id = football_data_uk.'
);
