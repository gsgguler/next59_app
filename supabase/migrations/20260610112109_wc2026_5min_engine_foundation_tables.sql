
-- ============================================================
-- WC2026 5-MIN MATCH FLOW ENGINE — FOUNDATION TABLES
-- Phase 4: Safe additive schema migration
-- All tables use CREATE TABLE IF NOT EXISTS
-- All RLS enabled; public SELECT only on safe tables
-- ============================================================

-- ============================================================
-- A) wc2026_squads
-- Provider-sourced squad + player registry for WC2026
-- ============================================================
CREATE TABLE IF NOT EXISTS wc2026_squads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id          uuid REFERENCES wc2026_fixtures(id) ON DELETE SET NULL,
  canonical_team_id   uuid NULL,
  team_name           text NOT NULL,
  provider            text NOT NULL DEFAULT 'api_football',
  provider_team_id    bigint,
  provider_player_id  bigint,
  player_name         text,
  position            text,
  shirt_number        integer,
  club_name           text,
  date_of_birth       date,
  squad_status        text NOT NULL DEFAULT 'unknown'
                        CHECK (squad_status IN ('provisional','final','lineup','bench','unavailable','unknown')),
  source_url          text,
  source_raw_json     jsonb,
  source_confidence   numeric(4,3) DEFAULT 0.5,
  last_checked_at     timestamptz DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_squads_team_name
  ON wc2026_squads (team_name);
CREATE INDEX IF NOT EXISTS idx_wc2026_squads_provider_player
  ON wc2026_squads (provider, provider_player_id);
CREATE INDEX IF NOT EXISTS idx_wc2026_squads_canonical_team
  ON wc2026_squads (canonical_team_id);
CREATE INDEX IF NOT EXISTS idx_wc2026_squads_fixture
  ON wc2026_squads (fixture_id);
CREATE INDEX IF NOT EXISTS idx_wc2026_squads_squad_status
  ON wc2026_squads (squad_status);

ALTER TABLE wc2026_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wc2026_squads_select_public"
  ON wc2026_squads FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "wc2026_squads_write_service"
  ON wc2026_squads FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- B) wc2026_lineup_checks
-- Scheduled / executed provider lineup check log
-- ============================================================
CREATE TABLE IF NOT EXISTS wc2026_lineup_checks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id          uuid NOT NULL REFERENCES wc2026_fixtures(id) ON DELETE CASCADE,
  check_type          text NOT NULL
                        CHECK (check_type IN ('six_hours','three_hours','fortyfive_minutes','fifteen_minutes','manual','provider_push')),
  scheduled_for       timestamptz NOT NULL,
  executed_at         timestamptz,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','running','done','failed','skipped')),
  provider            text NOT NULL DEFAULT 'api_football',
  changes_detected    boolean DEFAULT false,
  raw_summary_json    jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_lineup_checks_fixture
  ON wc2026_lineup_checks (fixture_id);
CREATE INDEX IF NOT EXISTS idx_wc2026_lineup_checks_scheduled
  ON wc2026_lineup_checks (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wc2026_lineup_checks_status
  ON wc2026_lineup_checks (status, scheduled_for);

ALTER TABLE wc2026_lineup_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wc2026_lineup_checks_select_auth"
  ON wc2026_lineup_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "wc2026_lineup_checks_write_service"
  ON wc2026_lineup_checks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- C) wc2026_lineups
-- Confirmed/provisional lineup per fixture and team
-- ============================================================
CREATE TABLE IF NOT EXISTS wc2026_lineups (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id            uuid NOT NULL REFERENCES wc2026_fixtures(id) ON DELETE CASCADE,
  team_id               uuid,
  team_name             text NOT NULL,
  provider              text NOT NULL DEFAULT 'api_football',
  provider_fixture_id   bigint,
  provider_team_id      bigint,
  formation             text,
  coach_name            text,
  lineup_status         text NOT NULL DEFAULT 'predicted'
                          CHECK (lineup_status IN ('predicted','provisional','confirmed')),
  confirmed_at          timestamptz,
  raw_json              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, team_name, provider)
);

CREATE INDEX IF NOT EXISTS idx_wc2026_lineups_fixture
  ON wc2026_lineups (fixture_id);
CREATE INDEX IF NOT EXISTS idx_wc2026_lineups_provider_fixture
  ON wc2026_lineups (provider, provider_fixture_id);
CREATE INDEX IF NOT EXISTS idx_wc2026_lineups_status
  ON wc2026_lineups (lineup_status);

ALTER TABLE wc2026_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wc2026_lineups_select_public"
  ON wc2026_lineups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "wc2026_lineups_write_service"
  ON wc2026_lineups FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- D) wc2026_lineup_players
-- Individual player entries per lineup
-- ============================================================
CREATE TABLE IF NOT EXISTS wc2026_lineup_players (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id          uuid NOT NULL REFERENCES wc2026_fixtures(id) ON DELETE CASCADE,
  lineup_id           uuid REFERENCES wc2026_lineups(id) ON DELETE CASCADE,
  team_id             uuid,
  team_name           text,
  provider_player_id  bigint,
  player_name         text NOT NULL,
  position            text,
  shirt_number        integer,
  is_starting         boolean NOT NULL DEFAULT false,
  is_substitute       boolean NOT NULL DEFAULT false,
  is_unavailable      boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'unknown'
                        CHECK (status IN ('starting','bench','unavailable','unknown')),
  raw_json            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_lineup_players_fixture
  ON wc2026_lineup_players (fixture_id);
CREATE INDEX IF NOT EXISTS idx_wc2026_lineup_players_lineup
  ON wc2026_lineup_players (lineup_id);
CREATE INDEX IF NOT EXISTS idx_wc2026_lineup_players_provider_player
  ON wc2026_lineup_players (provider_player_id);
CREATE INDEX IF NOT EXISTS idx_wc2026_lineup_players_team
  ON wc2026_lineup_players (team_id, fixture_id);

ALTER TABLE wc2026_lineup_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wc2026_lineup_players_select_public"
  ON wc2026_lineup_players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "wc2026_lineup_players_write_service"
  ON wc2026_lineup_players FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- E) player_recent_match_logs
-- Per-match performance logs for WC2026 squad players
-- ============================================================
CREATE TABLE IF NOT EXISTS player_recent_match_logs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                text NOT NULL DEFAULT 'api_football',
  provider_player_id      bigint NOT NULL,
  player_name             text NOT NULL,
  provider_team_id        bigint,
  team_name               text,
  provider_fixture_id     bigint,
  competition_name        text,
  season                  text,
  match_date              date,
  opponent                text,
  is_national_team_match  boolean DEFAULT false,
  is_club_match           boolean DEFAULT true,
  minutes_played          integer,
  started                 boolean,
  position                text,
  goals                   integer DEFAULT 0,
  assists                 integer DEFAULT 0,
  shots_total             integer DEFAULT 0,
  shots_on_target         integer DEFAULT 0,
  xg                      numeric(5,3),
  xa                      numeric(5,3),
  fouls_committed         integer DEFAULT 0,
  fouls_drawn             integer DEFAULT 0,
  yellow_cards            integer DEFAULT 0,
  red_cards               integer DEFAULT 0,
  offsides                integer DEFAULT 0,
  corners_won             integer,
  tackles_total           integer,
  interceptions           integer,
  dribbles_success        integer,
  duels_won               integer,
  rating                  numeric(4,2),
  raw_json                jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_player_id, provider_fixture_id)
);

CREATE INDEX IF NOT EXISTS idx_player_logs_provider_player
  ON player_recent_match_logs (provider, provider_player_id);
CREATE INDEX IF NOT EXISTS idx_player_logs_match_date
  ON player_recent_match_logs (match_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_logs_provider_fixture
  ON player_recent_match_logs (provider, provider_fixture_id);
CREATE INDEX IF NOT EXISTS idx_player_logs_national
  ON player_recent_match_logs (is_national_team_match, provider_player_id);

ALTER TABLE player_recent_match_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_logs_select_auth"
  ON player_recent_match_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "player_logs_write_service"
  ON player_recent_match_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- F) player_event_minute_profiles
-- 5-minute bucket aggregates for each player
-- ============================================================
CREATE TABLE IF NOT EXISTS player_event_minute_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider              text NOT NULL DEFAULT 'api_football',
  provider_player_id    bigint NOT NULL,
  player_name           text NOT NULL,
  canonical_player_id   uuid,
  team_id               uuid,
  club_name             text,
  position              text,
  -- Each bucket is a jsonb containing:
  -- { goal_count, assist_count, shot_count, shot_on_target_count,
  --   foul_committed_count, foul_drawn_count, yellow_card_count,
  --   red_card_count, offside_count, substitution_in_count,
  --   substitution_out_count, minutes_observed, rate_per_90, confidence }
  bucket_0_5    jsonb NOT NULL DEFAULT '{}',
  bucket_5_10   jsonb NOT NULL DEFAULT '{}',
  bucket_10_15  jsonb NOT NULL DEFAULT '{}',
  bucket_15_20  jsonb NOT NULL DEFAULT '{}',
  bucket_20_25  jsonb NOT NULL DEFAULT '{}',
  bucket_25_30  jsonb NOT NULL DEFAULT '{}',
  bucket_30_35  jsonb NOT NULL DEFAULT '{}',
  bucket_35_40  jsonb NOT NULL DEFAULT '{}',
  bucket_40_45  jsonb NOT NULL DEFAULT '{}',
  bucket_45_50  jsonb NOT NULL DEFAULT '{}',
  bucket_50_55  jsonb NOT NULL DEFAULT '{}',
  bucket_55_60  jsonb NOT NULL DEFAULT '{}',
  bucket_60_65  jsonb NOT NULL DEFAULT '{}',
  bucket_65_70  jsonb NOT NULL DEFAULT '{}',
  bucket_70_75  jsonb NOT NULL DEFAULT '{}',
  bucket_75_80  jsonb NOT NULL DEFAULT '{}',
  bucket_80_85  jsonb NOT NULL DEFAULT '{}',
  bucket_85_90  jsonb NOT NULL DEFAULT '{}',
  sample_matches    integer DEFAULT 0,
  data_confidence   numeric(4,3) DEFAULT 0.0,
  provider_sources  jsonb DEFAULT '[]',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_profiles_provider_player
  ON player_event_minute_profiles (provider, provider_player_id);
CREATE INDEX IF NOT EXISTS idx_player_profiles_team
  ON player_event_minute_profiles (team_id);
CREATE INDEX IF NOT EXISTS idx_player_profiles_confidence
  ON player_event_minute_profiles (data_confidence DESC);

ALTER TABLE player_event_minute_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_profiles_select_auth"
  ON player_event_minute_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "player_profiles_write_service"
  ON player_event_minute_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- G) team_minute_profiles
-- 5-minute bucket rate aggregates per team per scope
-- ============================================================
CREATE TABLE IF NOT EXISTS team_minute_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               uuid,
  team_name             text NOT NULL,
  source_scope          text NOT NULL
                          CHECK (source_scope IN ('wc_history','qualifiers','recent','combined')),
  bucket_label          text NOT NULL,  -- '0-5', '5-10', ... '85-90'
  goals_for_rate        numeric(6,4),
  goals_against_rate    numeric(6,4),
  shots_rate            numeric(6,4),
  shots_on_target_rate  numeric(6,4),
  corners_rate          numeric(6,4),
  fouls_rate            numeric(6,4),
  yellow_cards_rate     numeric(6,4),
  red_cards_rate        numeric(6,4),
  offsides_rate         numeric(6,4),
  substitutions_rate    numeric(6,4),
  possession_avg        numeric(5,2),
  xg_for_rate           numeric(6,4),
  xg_against_rate       numeric(6,4),
  sample_matches        integer DEFAULT 0,
  data_confidence       numeric(4,3) DEFAULT 0.0,
  raw_sources_json      jsonb DEFAULT '{}',
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_name, source_scope, bucket_label)
);

CREATE INDEX IF NOT EXISTS idx_team_minute_profiles_team
  ON team_minute_profiles (team_id, source_scope);
CREATE INDEX IF NOT EXISTS idx_team_minute_profiles_name_scope
  ON team_minute_profiles (team_name, source_scope);
CREATE INDEX IF NOT EXISTS idx_team_minute_profiles_bucket
  ON team_minute_profiles (bucket_label);

ALTER TABLE team_minute_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_minute_profiles_select_public"
  ON team_minute_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "team_minute_profiles_write_service"
  ON team_minute_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- H) wc2026_venue_psychology_factors
-- Crowd/host-nation psychological environment per fixture
-- ============================================================
CREATE TABLE IF NOT EXISTS wc2026_venue_psychology_factors (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id                  uuid NOT NULL REFERENCES wc2026_fixtures(id) ON DELETE CASCADE,
  venue_name                  text,
  venue_city                  text,
  venue_country               text,
  home_team_id                uuid,
  away_team_id                uuid,
  home_team_name              text NOT NULL,
  away_team_name              text NOT NULL,
  home_team_country           text,
  away_team_country           text,
  is_home_team_host_country   boolean NOT NULL DEFAULT false,
  is_away_team_host_country   boolean NOT NULL DEFAULT false,
  -- Scoring: 0.0 = no support, 0.5 = neutral, 0.75 = moderate, 0.9 = strong, 1.0 = extreme host
  home_crowd_support_score    numeric(4,3) NOT NULL DEFAULT 0.5,
  away_crowd_support_score    numeric(4,3) NOT NULL DEFAULT 0.5,
  home_morale_lift_score      numeric(4,3) NOT NULL DEFAULT 0.5,
  away_morale_lift_score      numeric(4,3) NOT NULL DEFAULT 0.5,
  -- Pressure against: 0.0 = none, 0.5 = standard away, 0.75 = strong, 0.9 = extreme
  home_pressure_against_score numeric(4,3) NOT NULL DEFAULT 0.25,
  away_pressure_against_score numeric(4,3) NOT NULL DEFAULT 0.5,
  host_affinity_notes         text,
  assumptions_json            jsonb DEFAULT '{}',
  confidence                  numeric(4,3) DEFAULT 0.8,
  source_snapshot_json        jsonb DEFAULT '{}',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_psych_fixture
  ON wc2026_venue_psychology_factors (fixture_id);
CREATE INDEX IF NOT EXISTS idx_venue_psych_host_home
  ON wc2026_venue_psychology_factors (is_home_team_host_country, is_away_team_host_country);

ALTER TABLE wc2026_venue_psychology_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_psych_select_public"
  ON wc2026_venue_psychology_factors FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "venue_psych_write_service"
  ON wc2026_venue_psychology_factors FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Grant schema usage to anon and authenticated for new tables
-- ============================================================
GRANT SELECT ON wc2026_squads TO anon, authenticated;
GRANT SELECT ON wc2026_lineup_checks TO authenticated;
GRANT SELECT ON wc2026_lineups TO anon, authenticated;
GRANT SELECT ON wc2026_lineup_players TO anon, authenticated;
GRANT SELECT ON player_recent_match_logs TO authenticated;
GRANT SELECT ON player_event_minute_profiles TO authenticated;
GRANT SELECT ON team_minute_profiles TO anon, authenticated;
GRANT SELECT ON wc2026_venue_psychology_factors TO anon, authenticated;
