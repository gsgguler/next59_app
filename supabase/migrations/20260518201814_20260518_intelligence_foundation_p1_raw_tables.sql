/*
  # Intelligence Foundation — Phase 1: Raw + Normalized Tables

  Adds four new API-Football enrichment data layers:

  ## New Tables

  ### Standings
  1. `af_standings_raw`
     - Raw API-Football /standings response per league+season
     - Unique on (af_league_id, af_season, response_hash)
  2. `af_standings_normalized`
     - One row per team per league per season
     - Columns: rank, points, goal_difference, form, home/away stats
     - Unique on (af_league_id, af_season, af_team_id)

  ### Injuries
  3. `af_injuries_raw`
     - Raw API-Football /injuries response per league+season or fixture
     - Unique on response_hash
  4. `af_injuries_normalized`
     - One row per injured/suspended player per fixture or league+season window
     - Columns: player_id, player_name, type, reason, expected_return

  ### Team Statistics
  5. `af_team_statistics_raw`
     - Raw API-Football /teams/statistics response per team+league+season
     - Unique on (af_league_id, af_season, af_team_id)
  6. `af_team_statistics_normalized`
     - One row per team per league per season
     - Columns: goals_for_avg, goals_against_avg, clean_sheet_rate, failed_to_score_rate, home/away split

  ### Venues
  7. `af_venues_raw`
     - Raw API-Football /venues response per venue_id
     - Unique on af_venue_id
  8. `af_venues_normalized`
     - One row per venue
     - Columns: name, city, country, capacity, surface, altitude_meters

  ## Security
  - RLS enabled on all 8 tables
  - Admin SELECT via profiles.role = 'admin'
  - service_role INSERT/UPDATE via auth.role() check

  ## Notes
  - All tables in public schema (consistent with existing af_* tables)
  - source_provider always 'api_football'
  - fetched_at defaults to now()
  - transform_status 'raw' by default
*/

-- ============================================================
-- STANDINGS RAW
-- ============================================================

CREATE TABLE IF NOT EXISTS af_standings_raw (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  af_league_id      integer       NOT NULL,
  af_season         integer       NOT NULL,
  endpoint          text          NOT NULL DEFAULT '/standings',
  response_hash     text          UNIQUE,
  response_json     jsonb,
  http_status       integer,
  fetched_at        timestamptz   NOT NULL DEFAULT now(),
  transform_status  text          NOT NULL DEFAULT 'raw',
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_af_standings_raw_league_season
  ON af_standings_raw (af_league_id, af_season);
CREATE INDEX IF NOT EXISTS idx_af_standings_raw_transform
  ON af_standings_raw (transform_status);

ALTER TABLE af_standings_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read standings raw"
  ON af_standings_raw FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert standings raw"
  ON af_standings_raw FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update standings raw"
  ON af_standings_raw FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STANDINGS NORMALIZED
-- ============================================================

CREATE TABLE IF NOT EXISTS af_standings_normalized (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  af_league_id          integer       NOT NULL,
  af_season             integer       NOT NULL,
  af_team_id            integer       NOT NULL,
  team_name             text,
  team_logo             text,
  league_name           text,
  -- Rank
  rank                  integer,
  group_name            text,
  -- Points
  points                integer       DEFAULT 0,
  played                integer       DEFAULT 0,
  wins                  integer       DEFAULT 0,
  draws                 integer       DEFAULT 0,
  losses                integer       DEFAULT 0,
  goals_for             integer       DEFAULT 0,
  goals_against         integer       DEFAULT 0,
  goal_difference       integer       DEFAULT 0,
  -- Form
  form_string           text,           -- e.g. "WWDLW"
  -- Home split
  home_played           integer       DEFAULT 0,
  home_wins             integer       DEFAULT 0,
  home_draws            integer       DEFAULT 0,
  home_losses           integer       DEFAULT 0,
  home_goals_for        integer       DEFAULT 0,
  home_goals_against    integer       DEFAULT 0,
  -- Away split
  away_played           integer       DEFAULT 0,
  away_wins             integer       DEFAULT 0,
  away_draws            integer       DEFAULT 0,
  away_losses           integer       DEFAULT 0,
  away_goals_for        integer       DEFAULT 0,
  away_goals_against    integer       DEFAULT 0,
  -- Status
  status                text,           -- e.g. "same", "up", "down"
  description           text,           -- e.g. "Champions League", "Relegation"
  -- Metadata
  source_provider       text          NOT NULL DEFAULT 'api_football',
  synced_at             timestamptz   NOT NULL DEFAULT now(),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE af_standings_normalized
  ADD CONSTRAINT af_standings_normalized_unique
  UNIQUE (af_league_id, af_season, af_team_id);

CREATE INDEX IF NOT EXISTS idx_af_standings_norm_league_season
  ON af_standings_normalized (af_league_id, af_season);
CREATE INDEX IF NOT EXISTS idx_af_standings_norm_team
  ON af_standings_normalized (af_team_id);

ALTER TABLE af_standings_normalized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read standings normalized"
  ON af_standings_normalized FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert standings normalized"
  ON af_standings_normalized FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update standings normalized"
  ON af_standings_normalized FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- INJURIES RAW
-- ============================================================

CREATE TABLE IF NOT EXISTS af_injuries_raw (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  af_league_id          integer,
  af_season             integer,
  af_fixture_id         integer,
  endpoint              text          NOT NULL DEFAULT '/injuries',
  request_params        jsonb,
  response_hash         text          UNIQUE,
  response_json         jsonb,
  http_status           integer,
  players_count         integer       DEFAULT 0,
  fetched_at            timestamptz   NOT NULL DEFAULT now(),
  transform_status      text          NOT NULL DEFAULT 'raw',
  created_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_af_injuries_raw_league_season
  ON af_injuries_raw (af_league_id, af_season);
CREATE INDEX IF NOT EXISTS idx_af_injuries_raw_fixture
  ON af_injuries_raw (af_fixture_id);
CREATE INDEX IF NOT EXISTS idx_af_injuries_raw_transform
  ON af_injuries_raw (transform_status);

ALTER TABLE af_injuries_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read injuries raw"
  ON af_injuries_raw FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert injuries raw"
  ON af_injuries_raw FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update injuries raw"
  ON af_injuries_raw FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- INJURIES NORMALIZED
-- ============================================================

CREATE TABLE IF NOT EXISTS af_injuries_normalized (
  id                      uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  af_league_id            integer,
  af_season               integer,
  af_fixture_id           integer,
  af_team_id              integer,
  team_name               text,
  af_player_id            integer,
  player_name             text,
  player_photo            text,
  player_type             text,           -- 'injury' or 'suspension'
  player_reason           text,           -- specific type: 'Knee Injury', 'Yellow Card Suspension', etc.
  player_age              integer,
  player_position         text,
  -- Internal linkage (nullable — resolved later if match exists)
  match_id                uuid,
  source_provider         text          NOT NULL DEFAULT 'api_football',
  raw_payload             jsonb,
  fetched_at              timestamptz   NOT NULL DEFAULT now(),
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now()
);

-- Unique per player per fixture (fixture-scoped injuries)
CREATE UNIQUE INDEX IF NOT EXISTS idx_af_injuries_norm_unique_fixture
  ON af_injuries_normalized (af_fixture_id, af_team_id, af_player_id)
  WHERE af_fixture_id IS NOT NULL;

-- Unique per player per league+season window (league-scoped injuries)
CREATE UNIQUE INDEX IF NOT EXISTS idx_af_injuries_norm_unique_league
  ON af_injuries_normalized (af_league_id, af_season, af_team_id, af_player_id)
  WHERE af_fixture_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_af_injuries_norm_league_season
  ON af_injuries_normalized (af_league_id, af_season);
CREATE INDEX IF NOT EXISTS idx_af_injuries_norm_fixture
  ON af_injuries_normalized (af_fixture_id);
CREATE INDEX IF NOT EXISTS idx_af_injuries_norm_team
  ON af_injuries_normalized (af_team_id);

ALTER TABLE af_injuries_normalized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read injuries normalized"
  ON af_injuries_normalized FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert injuries normalized"
  ON af_injuries_normalized FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update injuries normalized"
  ON af_injuries_normalized FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- TEAM STATISTICS RAW
-- ============================================================

CREATE TABLE IF NOT EXISTS af_team_statistics_raw (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  af_league_id      integer       NOT NULL,
  af_season         integer       NOT NULL,
  af_team_id        integer       NOT NULL,
  endpoint          text          NOT NULL DEFAULT '/teams/statistics',
  request_params    jsonb,
  response_hash     text          UNIQUE,
  response_json     jsonb,
  http_status       integer,
  fetched_at        timestamptz   NOT NULL DEFAULT now(),
  transform_status  text          NOT NULL DEFAULT 'raw',
  created_at        timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE af_team_statistics_raw
  ADD CONSTRAINT af_team_statistics_raw_unique
  UNIQUE (af_league_id, af_season, af_team_id);

CREATE INDEX IF NOT EXISTS idx_af_team_stats_raw_league_season
  ON af_team_statistics_raw (af_league_id, af_season);
CREATE INDEX IF NOT EXISTS idx_af_team_stats_raw_team
  ON af_team_statistics_raw (af_team_id);
CREATE INDEX IF NOT EXISTS idx_af_team_stats_raw_transform
  ON af_team_statistics_raw (transform_status);

ALTER TABLE af_team_statistics_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read team stats raw"
  ON af_team_statistics_raw FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert team stats raw"
  ON af_team_statistics_raw FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update team stats raw"
  ON af_team_statistics_raw FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- TEAM STATISTICS NORMALIZED
-- ============================================================

CREATE TABLE IF NOT EXISTS af_team_statistics_normalized (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  af_league_id              integer       NOT NULL,
  af_season                 integer       NOT NULL,
  af_team_id                integer       NOT NULL,
  team_name                 text,
  league_name               text,
  -- Played
  total_played              integer       DEFAULT 0,
  home_played               integer       DEFAULT 0,
  away_played               integer       DEFAULT 0,
  -- Goals scored
  goals_for_total           integer       DEFAULT 0,
  goals_for_avg             numeric(4,2)  DEFAULT 0,
  goals_for_home_avg        numeric(4,2)  DEFAULT 0,
  goals_for_away_avg        numeric(4,2)  DEFAULT 0,
  -- Goals conceded
  goals_against_total       integer       DEFAULT 0,
  goals_against_avg         numeric(4,2)  DEFAULT 0,
  goals_against_home_avg    numeric(4,2)  DEFAULT 0,
  goals_against_away_avg    numeric(4,2)  DEFAULT 0,
  -- Clean sheets
  clean_sheet_total         integer       DEFAULT 0,
  clean_sheet_home          integer       DEFAULT 0,
  clean_sheet_away          integer       DEFAULT 0,
  clean_sheet_rate          numeric(4,3)  DEFAULT 0,
  -- Failed to score
  failed_to_score_total     integer       DEFAULT 0,
  failed_to_score_home      integer       DEFAULT 0,
  failed_to_score_away      integer       DEFAULT 0,
  failed_to_score_rate      numeric(4,3)  DEFAULT 0,
  -- Form (last 5 matches)
  form_string               text,
  -- Biggest
  biggest_win_home          text,
  biggest_win_away          text,
  biggest_loss_home         text,
  biggest_loss_away         text,
  -- Streak
  current_win_streak        integer       DEFAULT 0,
  current_draw_streak       integer       DEFAULT 0,
  current_loss_streak       integer       DEFAULT 0,
  -- Penalties
  penalty_scored_total      integer       DEFAULT 0,
  penalty_missed_total      integer       DEFAULT 0,
  -- Metadata
  source_provider           text          NOT NULL DEFAULT 'api_football',
  synced_at                 timestamptz   NOT NULL DEFAULT now(),
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE af_team_statistics_normalized
  ADD CONSTRAINT af_team_statistics_normalized_unique
  UNIQUE (af_league_id, af_season, af_team_id);

CREATE INDEX IF NOT EXISTS idx_af_team_stats_norm_league_season
  ON af_team_statistics_normalized (af_league_id, af_season);
CREATE INDEX IF NOT EXISTS idx_af_team_stats_norm_team
  ON af_team_statistics_normalized (af_team_id);

ALTER TABLE af_team_statistics_normalized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read team stats normalized"
  ON af_team_statistics_normalized FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert team stats normalized"
  ON af_team_statistics_normalized FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update team stats normalized"
  ON af_team_statistics_normalized FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- VENUES RAW
-- ============================================================

CREATE TABLE IF NOT EXISTS af_venues_raw (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  af_venue_id       integer       UNIQUE NOT NULL,
  endpoint          text          NOT NULL DEFAULT '/venues',
  request_params    jsonb,
  response_hash     text          UNIQUE,
  response_json     jsonb,
  http_status       integer,
  fetched_at        timestamptz   NOT NULL DEFAULT now(),
  transform_status  text          NOT NULL DEFAULT 'raw',
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_af_venues_raw_venue_id
  ON af_venues_raw (af_venue_id);
CREATE INDEX IF NOT EXISTS idx_af_venues_raw_transform
  ON af_venues_raw (transform_status);

ALTER TABLE af_venues_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read venues raw"
  ON af_venues_raw FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert venues raw"
  ON af_venues_raw FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update venues raw"
  ON af_venues_raw FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- VENUES NORMALIZED
-- ============================================================

CREATE TABLE IF NOT EXISTS af_venues_normalized (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  af_venue_id       integer       UNIQUE NOT NULL,
  name              text,
  address           text,
  city              text,
  country           text,
  capacity          integer,
  surface           text,           -- 'grass', 'artificial turf', etc.
  -- Altitude is not provided directly by AF; NULL unless manually seeded
  altitude_meters   integer,
  -- World Cup context flag
  is_wc2026_venue   boolean       NOT NULL DEFAULT false,
  -- Derived warning
  venue_context_warning text,      -- e.g. 'High altitude (2240m) — consider home advantage adjustment'
  -- Image
  image_url         text,
  -- Metadata
  source_provider   text          NOT NULL DEFAULT 'api_football',
  synced_at         timestamptz   NOT NULL DEFAULT now(),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_af_venues_norm_venue_id
  ON af_venues_normalized (af_venue_id);
CREATE INDEX IF NOT EXISTS idx_af_venues_norm_city
  ON af_venues_normalized (city);

ALTER TABLE af_venues_normalized ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read venues normalized"
  ON af_venues_normalized FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert venues normalized"
  ON af_venues_normalized FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update venues normalized"
  ON af_venues_normalized FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ENRICHMENT SYNC LOG (unified audit trail for all 4 sync types)
-- ============================================================

CREATE TABLE IF NOT EXISTS model_lab.enrichment_sync_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type     text        NOT NULL CHECK (sync_type IN ('standings','injuries','team_statistics','venues')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  status        text        NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  leagues_seen  integer     DEFAULT 0,
  rows_inserted integer     DEFAULT 0,
  rows_updated  integer     DEFAULT 0,
  errors_json   jsonb       NOT NULL DEFAULT '[]',
  duration_ms   integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_sync_log_type_started
  ON model_lab.enrichment_sync_log (sync_type, started_at DESC);

ALTER TABLE model_lab.enrichment_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read enrichment sync log"
  ON model_lab.enrichment_sync_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert enrichment sync log"
  ON model_lab.enrichment_sync_log FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update enrichment sync log"
  ON model_lab.enrichment_sync_log FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT USAGE ON SCHEMA model_lab TO authenticated;
GRANT SELECT ON model_lab.enrichment_sync_log TO authenticated;
