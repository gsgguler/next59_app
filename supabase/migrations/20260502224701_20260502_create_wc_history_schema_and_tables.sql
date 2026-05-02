/*
  # Create wc_history schema — 15 tables

  ## Summary
  Dedicated schema for all historical FIFA World Cup data, fully isolated from
  domestic league tables (public.matches, public.teams, model_lab, predictions, etc.)

  ## Tables
  1.  ingestion_runs       — audit log for all WC history ingestion jobs
  2.  raw_api_football_responses — raw provider payloads, admin-only
  3.  editions             — one row per World Cup edition (1930–2026)
  4.  teams                — participating teams per edition
  5.  matches              — all historical WC match records
  6.  match_statistics     — per-team statistics per match
  7.  events               — goals, cards, substitutions
  8.  lineups              — team formation/coach per match
  9.  lineup_players       — individual player lineup rows
  10. players              — player biographical data per edition
  11. squads               — squad membership per edition/team
  12. venues               — stadiums per edition
  13. groups               — group standings per edition
  14. source_mappings      — provider ↔ internal entity mappings
  15. data_quality_issues  — audit log for data conflicts

  ## Security
  - RLS enabled on all tables
  - Raw/admin tables: authenticated admin only
  - Normalized tables: admin write, public views for anon read (created separately)
*/

-- ── Schema ────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS wc_history;

-- Grant usage so PostgREST can route through it
GRANT USAGE ON SCHEMA wc_history TO authenticated, anon, service_role;

-- ── 1. ingestion_runs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.ingestion_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider              text NOT NULL,
  run_type              text NOT NULL,
  edition_year          integer,
  endpoint              text,
  run_status            text NOT NULL DEFAULT 'pending',
  api_calls_used        integer DEFAULT 0,
  rows_raw              integer DEFAULT 0,
  rows_transformed      integer DEFAULT 0,
  duplicate_rows_skipped integer DEFAULT 0,
  error_summary         text,
  started_at            timestamptz DEFAULT now(),
  completed_at          timestamptz,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE wc_history.ingestion_runs ENABLE ROW LEVEL SECURITY;

-- ── 2. raw_api_football_responses ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.raw_api_football_responses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id    uuid REFERENCES wc_history.ingestion_runs(id),
  provider            text NOT NULL DEFAULT 'api_football',
  edition_year        integer,
  endpoint            text NOT NULL,
  request_params      jsonb NOT NULL DEFAULT '{}',
  provider_entity_type text NOT NULL,
  response_hash       text NOT NULL,
  response_json       jsonb NOT NULL DEFAULT '{}',
  http_status         integer,
  transform_status    text DEFAULT 'raw',
  fetched_at          timestamptz DEFAULT now(),
  UNIQUE(response_hash)
);
ALTER TABLE wc_history.raw_api_football_responses ENABLE ROW LEVEL SECURITY;

-- ── 3. editions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.editions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year        integer UNIQUE NOT NULL,
  host_country        text,
  host_countries      jsonb DEFAULT '[]',
  start_date          date,
  end_date            date,
  teams_count         integer,
  matches_count       integer,
  source_provider     text,
  source_status       text DEFAULT 'candidate',
  data_quality_status text DEFAULT 'unknown',
  created_at          timestamptz DEFAULT now()
);
ALTER TABLE wc_history.editions ENABLE ROW LEVEL SECURITY;

-- ── 4. teams ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.teams (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year        integer NOT NULL,
  provider_team_id    integer,
  fifa_code           text,
  iso2                text,
  iso3                text,
  name_en             text NOT NULL,
  name_tr             text,
  flag_asset          text,
  confederation       text,
  source_provider     text,
  raw_payload         jsonb DEFAULT '{}',
  data_quality_status text DEFAULT 'unknown',
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wc_history_teams_year_idx ON wc_history.teams(edition_year);
CREATE INDEX IF NOT EXISTS wc_history_teams_provider_idx ON wc_history.teams(provider_team_id);
ALTER TABLE wc_history.teams ENABLE ROW LEVEL SECURITY;

-- ── 5. matches ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year        integer NOT NULL,
  provider_fixture_id integer,
  match_no            integer,
  stage_code          text,
  stage_name_en       text,
  stage_name_tr       text,
  group_name          text,
  match_date          date,
  kickoff_utc         timestamptz,
  home_team_id        uuid REFERENCES wc_history.teams(id),
  away_team_id        uuid REFERENCES wc_history.teams(id),
  home_team_name      text,
  away_team_name      text,
  home_score_ft       integer,
  away_score_ft       integer,
  home_score_ht       integer,
  away_score_ht       integer,
  result              text,
  venue_name          text,
  city                text,
  country             text,
  attendance          integer,
  referee             text,
  match_status        text,
  fixture_status      text DEFAULT 'candidate',
  source_provider     text,
  source_url          text,
  raw_payload         jsonb DEFAULT '{}',
  data_quality_status text DEFAULT 'unknown',
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wc_history_matches_year_idx      ON wc_history.matches(edition_year);
CREATE INDEX IF NOT EXISTS wc_history_matches_provider_idx  ON wc_history.matches(provider_fixture_id);
CREATE INDEX IF NOT EXISTS wc_history_matches_kickoff_idx   ON wc_history.matches(kickoff_utc);
ALTER TABLE wc_history.matches ENABLE ROW LEVEL SECURITY;

-- ── 6. match_statistics ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.match_statistics (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid REFERENCES wc_history.matches(id) ON DELETE CASCADE,
  team_id             uuid REFERENCES wc_history.teams(id),
  provider_team_id    integer,
  stat_name           text,
  stat_value          text,
  stat_numeric        numeric,
  raw_payload         jsonb DEFAULT '{}',
  data_quality_status text DEFAULT 'unknown',
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wc_history_match_stats_match_idx ON wc_history.match_statistics(match_id);
ALTER TABLE wc_history.match_statistics ENABLE ROW LEVEL SECURITY;

-- ── 7. events ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid REFERENCES wc_history.matches(id) ON DELETE CASCADE,
  team_id             uuid REFERENCES wc_history.teams(id),
  provider_event_id   text,
  elapsed             integer,
  extra_time          integer,
  event_type          text,
  event_detail        text,
  player_id           integer,
  player_name         text,
  assist_player_id    integer,
  assist_player_name  text,
  comments            text,
  raw_payload         jsonb DEFAULT '{}',
  data_quality_status text DEFAULT 'unknown',
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wc_history_events_match_idx ON wc_history.events(match_id);
ALTER TABLE wc_history.events ENABLE ROW LEVEL SECURITY;

-- ── 8. lineups ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.lineups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid REFERENCES wc_history.matches(id) ON DELETE CASCADE,
  team_id             uuid REFERENCES wc_history.teams(id),
  formation           text,
  coach_name          text,
  raw_payload         jsonb DEFAULT '{}',
  data_quality_status text DEFAULT 'unknown',
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wc_history_lineups_match_idx ON wc_history.lineups(match_id);
ALTER TABLE wc_history.lineups ENABLE ROW LEVEL SECURITY;

-- ── 9. lineup_players ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.lineup_players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id   uuid REFERENCES wc_history.lineups(id) ON DELETE CASCADE,
  player_id   integer,
  player_name text,
  number      integer,
  position    text,
  grid        text,
  is_starting boolean,
  raw_payload jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wc_history_lineup_players_lineup_idx ON wc_history.lineup_players(lineup_id);
ALTER TABLE wc_history.lineup_players ENABLE ROW LEVEL SECURITY;

-- ── 10. players ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.players (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year        integer NOT NULL,
  provider_player_id  integer,
  player_name         text NOT NULL,
  firstname           text,
  lastname            text,
  nationality         text,
  birth_date          date,
  height              text,
  weight              text,
  photo_url           text,
  raw_payload         jsonb DEFAULT '{}',
  data_quality_status text DEFAULT 'unknown',
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wc_history_players_year_idx     ON wc_history.players(edition_year);
CREATE INDEX IF NOT EXISTS wc_history_players_provider_idx ON wc_history.players(provider_player_id);
ALTER TABLE wc_history.players ENABLE ROW LEVEL SECURITY;

-- ── 11. squads ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.squads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year        integer NOT NULL,
  team_id             uuid REFERENCES wc_history.teams(id),
  provider_team_id    integer,
  player_id           uuid REFERENCES wc_history.players(id),
  provider_player_id  integer,
  player_name         text,
  position            text,
  number              integer,
  squad_status        text DEFAULT 'unknown',
  raw_payload         jsonb DEFAULT '{}',
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wc_history_squads_year_idx    ON wc_history.squads(edition_year);
CREATE INDEX IF NOT EXISTS wc_history_squads_team_idx    ON wc_history.squads(team_id);
ALTER TABLE wc_history.squads ENABLE ROW LEVEL SECURITY;

-- ── 12. venues ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.venues (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year        integer,
  venue_name          text NOT NULL,
  city                text,
  country             text,
  capacity            integer,
  latitude            numeric(10,6),
  longitude           numeric(10,6),
  source_url          text,
  source_provider     text,
  data_quality_status text DEFAULT 'unknown',
  created_at          timestamptz DEFAULT now()
);
ALTER TABLE wc_history.venues ENABLE ROW LEVEL SECURITY;

-- ── 13. groups ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.groups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year   integer NOT NULL,
  group_name     text NOT NULL,
  team_id        uuid REFERENCES wc_history.teams(id),
  position       integer,
  played         integer,
  won            integer,
  drawn          integer,
  lost           integer,
  goals_for      integer,
  goals_against  integer,
  goal_difference integer,
  points         integer,
  raw_payload    jsonb DEFAULT '{}',
  data_quality_status text DEFAULT 'unknown',
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wc_history_groups_year_idx ON wc_history.groups(edition_year);
ALTER TABLE wc_history.groups ENABLE ROW LEVEL SECURITY;

-- ── 14. source_mappings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.source_mappings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year          integer,
  provider              text NOT NULL,
  provider_entity_type  text NOT NULL,
  provider_entity_id    text NOT NULL,
  internal_entity_type  text NOT NULL,
  internal_entity_id    uuid,
  confidence            numeric(6,4),
  mapping_status        text DEFAULT 'candidate',
  raw_payload           jsonb DEFAULT '{}',
  created_at            timestamptz DEFAULT now(),
  UNIQUE(provider, provider_entity_type, provider_entity_id, internal_entity_type)
);
ALTER TABLE wc_history.source_mappings ENABLE ROW LEVEL SECURITY;

-- ── 15. data_quality_issues ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wc_history.data_quality_issues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_year    integer,
  entity_type     text,
  entity_id       uuid,
  issue_type      text,
  severity        text,
  description     text,
  source_provider text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE wc_history.data_quality_issues ENABLE ROW LEVEL SECURITY;
