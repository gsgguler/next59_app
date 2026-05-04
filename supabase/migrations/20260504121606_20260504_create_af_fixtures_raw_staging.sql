/*
  # Create shared.af_fixtures_raw staging table

  Stores full fixture responses from API-Football /fixtures endpoint,
  scoped to the 6 target leagues (D1/F1/I1/N1/SP1/T1) for seasons 2020–2024.

  ## Tables
  - `shared.af_fixtures_raw` — one row per fixture_id; stores raw JSONB response
    - fixture_id: API-Football's numeric fixture identifier
    - league_id: AF league ID (78/61/135/88/140/203)
    - season: start year of season (2020–2024)
    - raw_response: full JSONB object for this fixture from the /fixtures response
    - is_processed: set to true after referee backfill applied to matches table
    - canonical_match_id: FK to public.matches.id once matched

  ## Indexes
  - (league_id, season) — for batch processing per league-season pair
  - (is_processed) — for processing queue queries

  ## Security
  - RLS enabled; service_role bypasses; no public access needed
*/

CREATE TABLE IF NOT EXISTS shared.af_fixtures_raw (
  id              BIGSERIAL PRIMARY KEY,
  fixture_id      INTEGER UNIQUE NOT NULL,
  league_id       INTEGER NOT NULL,
  season          INTEGER NOT NULL,
  raw_response    JSONB NOT NULL,
  ingested_at     TIMESTAMPTZ DEFAULT NOW(),
  is_processed    BOOLEAN DEFAULT FALSE,
  canonical_match_id UUID
);

CREATE INDEX IF NOT EXISTS idx_af_fixtures_raw_league_season
  ON shared.af_fixtures_raw(league_id, season);

CREATE INDEX IF NOT EXISTS idx_af_fixtures_raw_unprocessed
  ON shared.af_fixtures_raw(is_processed)
  WHERE is_processed = FALSE;

ALTER TABLE shared.af_fixtures_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to af_fixtures_raw"
  ON shared.af_fixtures_raw
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert af_fixtures_raw"
  ON shared.af_fixtures_raw
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update af_fixtures_raw"
  ON shared.af_fixtures_raw
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
