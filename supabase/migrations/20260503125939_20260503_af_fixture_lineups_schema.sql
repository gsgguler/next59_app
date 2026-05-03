/*
  # API-Football Fixture Lineups Schema

  ## Purpose
  Store pre-match formation, starting XI, bench, coach and player position data
  for the 90-minute scenario engine.

  ## New Tables

  ### api_football_fixture_lineups_raw
  - Raw JSON from /fixtures/lineups?fixture={id}
  - Idempotent via response_hash unique constraint
  - Admin-only read, service_role write

  ### api_football_fixture_lineups
  - One row per team per fixture: formation, coach, team identity
  - Team resolved via af_norm_name() against fixture mapping

  ### api_football_fixture_lineup_players
  - One row per player per fixture per team
  - is_starting=true for start XI, false for bench
  - grid stores positional grid string (e.g. "1:1") when available

  ## Security
  - RLS enabled on all three tables
  - No anon reads or writes
  - service_role write, admin read
*/

-- RAW STORAGE
CREATE TABLE IF NOT EXISTS api_football_fixture_lineups_raw (
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

CREATE INDEX IF NOT EXISTS idx_af_lineups_raw_match_id
  ON api_football_fixture_lineups_raw(match_id);
CREATE INDEX IF NOT EXISTS idx_af_lineups_raw_fixture_id
  ON api_football_fixture_lineups_raw(api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_af_lineups_raw_transform_status
  ON api_football_fixture_lineups_raw(transform_status);

ALTER TABLE api_football_fixture_lineups_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read fixture lineups raw"
  ON api_football_fixture_lineups_raw FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Service role can insert fixture lineups raw"
  ON api_football_fixture_lineups_raw FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update fixture lineups raw"
  ON api_football_fixture_lineups_raw FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

-- NORMALIZED LINEUPS (one row per team per fixture)
CREATE TABLE IF NOT EXISTS api_football_fixture_lineups (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                  uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  api_football_fixture_id   integer NOT NULL,
  team_id                   uuid REFERENCES teams(id) ON DELETE SET NULL,
  api_football_team_id      integer,
  team_name                 text,
  formation                 text,
  coach_id                  integer,
  coach_name                text,
  raw_payload               jsonb,
  created_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_af_fixture_lineups_match_id
  ON api_football_fixture_lineups(match_id);
CREATE INDEX IF NOT EXISTS idx_af_fixture_lineups_team_id
  ON api_football_fixture_lineups(team_id);

ALTER TABLE api_football_fixture_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read fixture lineups"
  ON api_football_fixture_lineups FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Service role can insert fixture lineups"
  ON api_football_fixture_lineups FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update fixture lineups"
  ON api_football_fixture_lineups FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can delete fixture lineups"
  ON api_football_fixture_lineups FOR DELETE
  TO service_role USING (true);

-- NORMALIZED LINEUP PLAYERS (one row per player per fixture per team)
CREATE TABLE IF NOT EXISTS api_football_fixture_lineup_players (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id                 uuid NOT NULL REFERENCES api_football_fixture_lineups(id) ON DELETE CASCADE,
  match_id                  uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id                   uuid REFERENCES teams(id) ON DELETE SET NULL,
  api_football_fixture_id   integer NOT NULL,
  api_football_player_id    integer,
  player_name               text,
  player_number             integer,
  position                  text,
  grid                      text,
  is_starting               boolean NOT NULL DEFAULT false,
  raw_payload               jsonb,
  created_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_af_lineup_players_lineup_id
  ON api_football_fixture_lineup_players(lineup_id);
CREATE INDEX IF NOT EXISTS idx_af_lineup_players_match_id
  ON api_football_fixture_lineup_players(match_id);
CREATE INDEX IF NOT EXISTS idx_af_lineup_players_team_id
  ON api_football_fixture_lineup_players(team_id);
CREATE INDEX IF NOT EXISTS idx_af_lineup_players_is_starting
  ON api_football_fixture_lineup_players(is_starting);

ALTER TABLE api_football_fixture_lineup_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read lineup players"
  ON api_football_fixture_lineup_players FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Service role can insert lineup players"
  ON api_football_fixture_lineup_players FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update lineup players"
  ON api_football_fixture_lineup_players FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can delete lineup players"
  ON api_football_fixture_lineup_players FOR DELETE
  TO service_role USING (true);
