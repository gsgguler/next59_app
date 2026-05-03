/*
  # Player Enrichment Foundation

  Creates the raw-first player data enrichment layer for domestic 7 leagues + UEFA.

  ## New Tables

  1. `af_player_profiles` — canonical player profiles keyed by api_football player id
  2. `af_player_season_stats_raw` — raw /players?league+season payloads per player/league/season
  3. `af_player_season_stats` — normalized season aggregates (appearances, goals, assists, etc.)
  4. `af_fixture_player_stats_raw` — raw /fixtures/players payloads per fixture (domestic only)
  5. `af_fixture_player_stats` — normalized per-player per-fixture stats
  6. `af_player_identity_mappings` — api_football_player_id → internal identity, with confidence

  ## Key Design Decisions

  - Primary key for all player identity is `api_football_player_id` (integer from provider)
  - `players` table (existing) uses internal UUIDs — cross-reference via `af_player_profiles.internal_player_id`
  - `/fixtures/players` only works for domestic leagues; UEFA uses `/players?league+season`
  - `match_id` nullable (null for UEFA which uses `af_uefa_fixture_id`)
  - `af_uefa_fixture_id` nullable (null for domestic)
  - Response hash ensures idempotent re-fetch safety

  ## Security
  - All raw tables: admin-only read, service_role write, no anon access
  - Normalized tables: admin-only read initially; can be opened per feature layer later
  - No public exposure of raw payloads
*/

-- ── 1. af_player_profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_player_profiles (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_player_id    integer NOT NULL,
  internal_player_id        uuid REFERENCES players(id) ON DELETE SET NULL,
  player_name               text,
  firstname                 text,
  lastname                  text,
  age                       integer,
  birth_date                date,
  birth_place               text,
  birth_country             text,
  nationality               text,
  height                    text,
  weight                    text,
  injured                   boolean DEFAULT false,
  photo_url                 text,
  raw_payload               jsonb,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),
  CONSTRAINT af_player_profiles_af_id_unique UNIQUE (api_football_player_id)
);

ALTER TABLE af_player_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read af_player_profiles"
  ON af_player_profiles FOR SELECT
  TO authenticated
  USING ((SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Service role insert af_player_profiles"
  ON af_player_profiles FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update af_player_profiles"
  ON af_player_profiles FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_af_player_profiles_af_id ON af_player_profiles (api_football_player_id);

-- ── 2. af_player_season_stats_raw ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_player_season_stats_raw (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                  text DEFAULT 'api_football',
  competition_type          text NOT NULL, -- domestic_league | uefa_club
  league_id                 integer NOT NULL,
  season                    integer NOT NULL,
  page_number               integer NOT NULL DEFAULT 1,
  api_football_player_id    integer,
  endpoint                  text,
  request_params            jsonb,
  response_hash             text UNIQUE,
  response_json             jsonb,
  http_status               integer,
  players_in_page           integer DEFAULT 0,
  fetched_at                timestamptz DEFAULT now(),
  transform_status          text DEFAULT 'raw'
);

ALTER TABLE af_player_season_stats_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read af_player_season_stats_raw"
  ON af_player_season_stats_raw FOR SELECT
  TO authenticated
  USING ((SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Service role insert af_player_season_stats_raw"
  ON af_player_season_stats_raw FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update af_player_season_stats_raw"
  ON af_player_season_stats_raw FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_af_pssr_league_season ON af_player_season_stats_raw (league_id, season, transform_status);

-- ── 3. af_player_season_stats ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_player_season_stats (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_player_id    integer NOT NULL,
  player_name               text,
  competition_type          text NOT NULL,
  league_id                 integer NOT NULL,
  season                    integer NOT NULL,
  api_football_team_id      integer,
  team_name                 text,
  -- games
  appearances               integer,
  lineups                   integer,
  minutes                   integer,
  position                  text,
  rating                    numeric(4,2),
  captain                   boolean,
  -- substitutes
  subs_in                   integer,
  subs_out                  integer,
  subs_bench                integer,
  -- shots
  shots_total               integer,
  shots_on                  integer,
  -- goals
  goals_total               integer,
  goals_conceded            integer,
  assists                   integer,
  saves                     integer,
  -- passes
  passes_total              integer,
  passes_key                integer,
  passes_accuracy           integer,
  -- tackles
  tackles_total             integer,
  tackles_blocks            integer,
  tackles_interceptions     integer,
  -- duels
  duels_total               integer,
  duels_won                 integer,
  -- dribbles
  dribbles_attempts         integer,
  dribbles_success          integer,
  dribbles_past             integer,
  -- fouls
  fouls_drawn               integer,
  fouls_committed           integer,
  -- cards
  cards_yellow              integer,
  cards_yellow_red          integer,
  cards_red                 integer,
  -- penalty
  penalty_won               integer,
  penalty_committed         integer,
  penalty_scored            integer,
  penalty_missed            integer,
  penalty_saved             integer,
  raw_payload               jsonb,
  created_at                timestamptz DEFAULT now(),
  CONSTRAINT af_pss_unique UNIQUE (api_football_player_id, league_id, season, api_football_team_id)
);

ALTER TABLE af_player_season_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read af_player_season_stats"
  ON af_player_season_stats FOR SELECT
  TO authenticated
  USING ((SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Service role insert af_player_season_stats"
  ON af_player_season_stats FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update af_player_season_stats"
  ON af_player_season_stats FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_af_pss_player ON af_player_season_stats (api_football_player_id);
CREATE INDEX IF NOT EXISTS idx_af_pss_league_season ON af_player_season_stats (league_id, season);

-- ── 4. af_fixture_player_stats_raw ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_fixture_player_stats_raw (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_type          text NOT NULL,
  match_id                  uuid REFERENCES matches(id) ON DELETE SET NULL,
  af_uefa_fixture_id        uuid REFERENCES af_uefa_fixtures(id) ON DELETE SET NULL,
  api_football_fixture_id   integer NOT NULL,
  endpoint                  text,
  request_params            jsonb,
  response_hash             text UNIQUE,
  response_json             jsonb,
  http_status               integer,
  players_count             integer DEFAULT 0,
  fetched_at                timestamptz DEFAULT now(),
  transform_status          text DEFAULT 'raw'
);

ALTER TABLE af_fixture_player_stats_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read af_fixture_player_stats_raw"
  ON af_fixture_player_stats_raw FOR SELECT
  TO authenticated
  USING ((SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Service role insert af_fixture_player_stats_raw"
  ON af_fixture_player_stats_raw FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update af_fixture_player_stats_raw"
  ON af_fixture_player_stats_raw FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_af_fpsr_fixture ON af_fixture_player_stats_raw (api_football_fixture_id, transform_status);

-- ── 5. af_fixture_player_stats ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_fixture_player_stats (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_type          text NOT NULL,
  match_id                  uuid REFERENCES matches(id) ON DELETE SET NULL,
  af_uefa_fixture_id        uuid REFERENCES af_uefa_fixtures(id) ON DELETE SET NULL,
  api_football_fixture_id   integer NOT NULL,
  api_football_team_id      integer,
  team_name                 text,
  api_football_player_id    integer,
  player_name               text,
  -- games
  minutes                   integer,
  number                    integer,
  position                  text,
  rating                    numeric(4,2),
  captain                   boolean DEFAULT false,
  substitute                boolean DEFAULT false,
  -- offsides
  offsides                  integer,
  -- shots
  shots_total               integer,
  shots_on                  integer,
  -- goals
  goals_total               integer,
  goals_conceded            integer,
  assists                   integer,
  saves                     integer,
  -- passes
  passes_total              integer,
  passes_key                integer,
  passes_accuracy           integer,
  -- tackles
  tackles_total             integer,
  tackles_blocks            integer,
  tackles_interceptions     integer,
  -- duels
  duels_total               integer,
  duels_won                 integer,
  -- dribbles
  dribbles_attempts         integer,
  dribbles_success          integer,
  -- fouls
  fouls_drawn               integer,
  fouls_committed           integer,
  -- cards
  cards_yellow              integer,
  cards_red                 integer,
  -- penalty
  penalty_won               integer,
  penalty_committed         integer,
  penalty_scored            integer,
  penalty_missed            integer,
  penalty_saved             integer,
  raw_payload               jsonb,
  created_at                timestamptz DEFAULT now(),
  CONSTRAINT af_fps_unique UNIQUE (api_football_fixture_id, api_football_team_id, api_football_player_id)
);

ALTER TABLE af_fixture_player_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read af_fixture_player_stats"
  ON af_fixture_player_stats FOR SELECT
  TO authenticated
  USING ((SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Service role insert af_fixture_player_stats"
  ON af_fixture_player_stats FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update af_fixture_player_stats"
  ON af_fixture_player_stats FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_af_fps_fixture ON af_fixture_player_stats (api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_af_fps_player ON af_fixture_player_stats (api_football_player_id);

-- ── 6. af_player_identity_mappings ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS af_player_identity_mappings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_player_id    integer NOT NULL,
  internal_player_id        uuid REFERENCES players(id) ON DELETE SET NULL,
  player_name               text,
  normalized_player_name    text,
  nationality               text,
  birth_date                date,
  mapping_status            text DEFAULT 'provider_verified',
  confidence                numeric(3,2) DEFAULT 1.0,
  created_at                timestamptz DEFAULT now(),
  CONSTRAINT af_pim_unique UNIQUE (api_football_player_id)
);

ALTER TABLE af_player_identity_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read af_player_identity_mappings"
  ON af_player_identity_mappings FOR SELECT
  TO authenticated
  USING ((SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Service role insert af_player_identity_mappings"
  ON af_player_identity_mappings FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update af_player_identity_mappings"
  ON af_player_identity_mappings FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_af_pim_af_id ON af_player_identity_mappings (api_football_player_id);
