/*
  # API-Football Fixture Events Schema

  ## Purpose
  Store minute-level fixture events (goals, cards, substitutions, VAR, etc.)
  for use in the 90-minute scenario engine.

  ## New Tables

  ### api_football_fixture_events_raw
  - Raw JSON responses from /fixtures/events?fixture={id}
  - Idempotent via response_hash unique constraint
  - Admin-only read, service_role write

  ### api_football_fixture_events
  - Normalized event rows: one row per event per fixture
  - Elapsed and extra_time stored separately (not as "90+3" string)
  - Admin-only access for now (no anon exposure)

  ## Security
  - RLS enabled on both tables
  - No anon writes or reads
  - No raw payload public exposure
*/

-- RAW STORAGE TABLE
CREATE TABLE IF NOT EXISTS api_football_fixture_events_raw (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                  uuid REFERENCES matches(id) ON DELETE SET NULL,
  api_football_fixture_id   integer NOT NULL,
  endpoint                  text,
  response_hash             text UNIQUE,
  response_json             jsonb,
  http_status               integer,
  fetched_at                timestamptz DEFAULT now(),
  transform_status          text DEFAULT 'raw'
);

CREATE INDEX IF NOT EXISTS idx_af_events_raw_match_id
  ON api_football_fixture_events_raw(match_id);
CREATE INDEX IF NOT EXISTS idx_af_events_raw_fixture_id
  ON api_football_fixture_events_raw(api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_af_events_raw_transform_status
  ON api_football_fixture_events_raw(transform_status);

ALTER TABLE api_football_fixture_events_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read fixture events raw"
  ON api_football_fixture_events_raw FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert fixture events raw"
  ON api_football_fixture_events_raw FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update fixture events raw"
  ON api_football_fixture_events_raw FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- NORMALIZED EVENTS TABLE
CREATE TABLE IF NOT EXISTS api_football_fixture_events (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                  uuid REFERENCES matches(id) ON DELETE SET NULL,
  api_football_fixture_id   integer NOT NULL,
  team_id                   uuid REFERENCES teams(id) ON DELETE SET NULL,
  api_football_team_id      integer,
  team_name                 text,
  player_id                 integer,
  player_name               text,
  assist_player_id          integer,
  assist_player_name        text,
  elapsed                   integer,
  extra_time                integer,
  event_type                text,
  event_detail              text,
  comments                  text,
  raw_payload               jsonb,
  created_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_af_fixture_events_match_id
  ON api_football_fixture_events(match_id);
CREATE INDEX IF NOT EXISTS idx_af_fixture_events_fixture_id
  ON api_football_fixture_events(api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_af_fixture_events_event_type
  ON api_football_fixture_events(event_type);
CREATE INDEX IF NOT EXISTS idx_af_fixture_events_elapsed
  ON api_football_fixture_events(elapsed);

ALTER TABLE api_football_fixture_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read fixture events"
  ON api_football_fixture_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert fixture events"
  ON api_football_fixture_events FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update fixture events"
  ON api_football_fixture_events FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete fixture events"
  ON api_football_fixture_events FOR DELETE
  TO service_role
  USING (true);
