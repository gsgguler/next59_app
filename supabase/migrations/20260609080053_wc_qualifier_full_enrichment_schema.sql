
-- ═══════════════════════════════════════════════════════════════════
-- WC 2026 Qualifier Full Enrichment Schema
-- ═══════════════════════════════════════════════════════════════════

-- 1. competitions
CREATE TABLE IF NOT EXISTS wc_qualifier_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_competition_id text NOT NULL,
  provider_season_id text,
  provider_country_id text,
  competition_name text NOT NULL,
  confederation text,
  season_label text,
  coverage_json jsonb,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, provider_competition_id, provider_season_id)
);
ALTER TABLE wc_qualifier_competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_competitions" ON wc_qualifier_competitions FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_competitions" ON wc_qualifier_competitions FOR ALL TO service_role USING (true);

-- 2. fixtures
CREATE TABLE IF NOT EXISTS wc_qualifier_fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_fixture_id text NOT NULL,
  canonical_fixture_key text,
  competition_id uuid REFERENCES wc_qualifier_competitions(id),
  confederation text,
  season_label text,
  round text,
  stage text,
  group_name text,
  fixture_date timestamptz,
  status_short text,
  status_long text,
  elapsed integer,
  venue_id text,
  venue_name text,
  venue_city text,
  referee text,
  home_provider_team_id text,
  away_provider_team_id text,
  home_team_name text,
  away_team_name text,
  home_score integer,
  away_score integer,
  halftime_home_score integer,
  halftime_away_score integer,
  extratime_home_score integer,
  extratime_away_score integer,
  penalty_home_score integer,
  penalty_away_score integer,
  winner_provider_team_id text,
  has_stats boolean DEFAULT false,
  has_events boolean DEFAULT false,
  has_lineups boolean DEFAULT false,
  has_players boolean DEFAULT false,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, provider_fixture_id)
);
ALTER TABLE wc_qualifier_fixtures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_fixtures" ON wc_qualifier_fixtures FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_fixtures" ON wc_qualifier_fixtures FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_wc_qualifier_fixtures_comp ON wc_qualifier_fixtures(competition_id);
CREATE INDEX IF NOT EXISTS idx_wc_qualifier_fixtures_teams ON wc_qualifier_fixtures(home_provider_team_id, away_provider_team_id);
CREATE INDEX IF NOT EXISTS idx_wc_qualifier_fixtures_date ON wc_qualifier_fixtures(fixture_date);

-- 3. team match stats
CREATE TABLE IF NOT EXISTS wc_qualifier_team_match_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_fixture_id text NOT NULL,
  provider_team_id text NOT NULL,
  team_name text,
  side text CHECK (side IN ('home','away')),
  shots_on_goal numeric,
  shots_off_goal numeric,
  total_shots numeric,
  blocked_shots numeric,
  shots_insidebox numeric,
  shots_outsidebox numeric,
  fouls numeric,
  corner_kicks numeric,
  offsides numeric,
  ball_possession_pct numeric,
  yellow_cards numeric,
  red_cards numeric,
  goalkeeper_saves numeric,
  total_passes numeric,
  passes_accurate numeric,
  passes_pct numeric,
  expected_goals numeric,
  provider_xg numeric,
  xg_source text,
  statistics_json jsonb,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, provider_fixture_id, provider_team_id)
);
ALTER TABLE wc_qualifier_team_match_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_team_match_stats" ON wc_qualifier_team_match_stats FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_team_match_stats" ON wc_qualifier_team_match_stats FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_wc_qualifier_tms_fixture ON wc_qualifier_team_match_stats(provider_fixture_id);

-- 4. events
CREATE TABLE IF NOT EXISTS wc_qualifier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_fixture_id text NOT NULL,
  provider_event_id text,
  provider_team_id text,
  team_name text,
  provider_player_id text,
  player_name text,
  provider_assist_id text,
  assist_name text,
  elapsed integer,
  extra integer,
  minute_label text,
  event_type text NOT NULL,
  event_detail text,
  comments text,
  is_goal boolean DEFAULT false,
  is_card boolean DEFAULT false,
  is_red_card boolean DEFAULT false,
  is_substitution boolean DEFAULT false,
  is_penalty boolean DEFAULT false,
  is_var boolean DEFAULT false,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE wc_qualifier_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_events" ON wc_qualifier_events FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_events" ON wc_qualifier_events FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_wc_qualifier_events_fixture ON wc_qualifier_events(provider_fixture_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wc_qualifier_events_dedup
  ON wc_qualifier_events(provider, provider_fixture_id, COALESCE(elapsed,0), COALESCE(extra,0), COALESCE(provider_team_id,''), COALESCE(provider_player_id,''), event_type, COALESCE(event_detail,''));

-- 5. lineups
CREATE TABLE IF NOT EXISTS wc_qualifier_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_fixture_id text NOT NULL,
  provider_team_id text NOT NULL,
  team_name text,
  formation text,
  coach_provider_id text,
  coach_name text,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, provider_fixture_id, provider_team_id)
);
ALTER TABLE wc_qualifier_lineups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_lineups" ON wc_qualifier_lineups FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_lineups" ON wc_qualifier_lineups FOR ALL TO service_role USING (true);

-- 6. lineup players
CREATE TABLE IF NOT EXISTS wc_qualifier_lineup_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_fixture_id text NOT NULL,
  provider_team_id text NOT NULL,
  provider_player_id text,
  player_name text NOT NULL,
  number integer,
  position text,
  grid text,
  is_starting boolean DEFAULT false,
  is_substitute boolean DEFAULT false,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE wc_qualifier_lineup_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_lineup_players" ON wc_qualifier_lineup_players FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_lineup_players" ON wc_qualifier_lineup_players FOR ALL TO service_role USING (true);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wc_qualifier_lp_dedup
  ON wc_qualifier_lineup_players(provider, provider_fixture_id, provider_team_id, COALESCE(provider_player_id,''), player_name, is_starting);

-- 7. player match stats
CREATE TABLE IF NOT EXISTS wc_qualifier_player_match_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_fixture_id text NOT NULL,
  provider_team_id text NOT NULL,
  provider_player_id text NOT NULL,
  player_name text,
  minutes numeric,
  rating numeric,
  captain boolean,
  substitute boolean,
  offsides numeric,
  shots_total numeric,
  shots_on numeric,
  goals_total numeric,
  goals_conceded numeric,
  assists numeric,
  saves numeric,
  passes_total numeric,
  passes_key numeric,
  passes_accuracy_pct numeric,
  tackles_total numeric,
  tackles_blocks numeric,
  tackles_interceptions numeric,
  duels_total numeric,
  duels_won numeric,
  dribbles_attempts numeric,
  dribbles_success numeric,
  dribbles_past numeric,
  fouls_drawn numeric,
  fouls_committed numeric,
  yellow_cards numeric,
  red_cards numeric,
  penalty_won numeric,
  penalty_committed numeric,
  penalty_scored numeric,
  penalty_missed numeric,
  penalty_saved numeric,
  xg numeric,
  xa numeric,
  advanced_stats_json jsonb,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, provider_fixture_id, provider_player_id)
);
ALTER TABLE wc_qualifier_player_match_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_player_match_stats" ON wc_qualifier_player_match_stats FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_player_match_stats" ON wc_qualifier_player_match_stats FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_wc_qualifier_pms_fixture ON wc_qualifier_player_match_stats(provider_fixture_id);

-- 8. standings
CREATE TABLE IF NOT EXISTS wc_qualifier_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  competition_id uuid REFERENCES wc_qualifier_competitions(id),
  provider_team_id text NOT NULL,
  team_name text,
  group_name text,
  rank integer,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  goals_for integer,
  goals_against integer,
  goal_difference integer,
  points integer,
  form text,
  raw_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, competition_id, provider_team_id, group_name)
);
ALTER TABLE wc_qualifier_standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_standings" ON wc_qualifier_standings FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_standings" ON wc_qualifier_standings FOR ALL TO service_role USING (true);

-- 9. team summary (derived)
CREATE TABLE IF NOT EXISTS wc_qualifier_team_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_team_id text NOT NULL,
  canonical_team_id text,
  team_name text NOT NULL,
  confederation text NOT NULL,
  season_scope text,
  matches_played integer DEFAULT 0,
  wins integer DEFAULT 0,
  draws integer DEFAULT 0,
  losses integer DEFAULT 0,
  goals_for integer DEFAULT 0,
  goals_against integer DEFAULT 0,
  goal_difference integer DEFAULT 0,
  points integer DEFAULT 0,
  points_per_match numeric DEFAULT 0,
  win_rate numeric DEFAULT 0,
  draw_rate numeric DEFAULT 0,
  loss_rate numeric DEFAULT 0,
  goals_for_per_match numeric DEFAULT 0,
  goals_against_per_match numeric DEFAULT 0,
  clean_sheets integer DEFAULT 0,
  failed_to_score integer DEFAULT 0,
  avg_possession_pct numeric,
  avg_total_shots numeric,
  avg_shots_on_goal numeric,
  avg_corners numeric,
  avg_fouls numeric,
  avg_yellow_cards numeric,
  avg_red_cards numeric,
  total_xg numeric,
  total_xga numeric,
  xg_per_match numeric,
  xga_per_match numeric,
  xg_difference numeric,
  qualification_rank integer,
  qualification_method text,
  raw_sources_json jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, provider_team_id, confederation)
);
ALTER TABLE wc_qualifier_team_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_team_summary" ON wc_qualifier_team_summary FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_team_summary" ON wc_qualifier_team_summary FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_wc_qualifier_ts_team ON wc_qualifier_team_summary(provider_team_id);
CREATE INDEX IF NOT EXISTS idx_wc_qualifier_ts_canonical ON wc_qualifier_team_summary(canonical_team_id);

-- 10. provider team mappings
CREATE TABLE IF NOT EXISTS wc_qualifier_provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_team_id text NOT NULL,
  canonical_team_name text NOT NULL,
  provider text NOT NULL,
  provider_team_id text NOT NULL,
  provider_team_name text,
  confederation text,
  confidence numeric DEFAULT 1.0,
  mapping_reason text,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, provider_team_id)
);
ALTER TABLE wc_qualifier_provider_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_wc_qualifier_provider_mappings" ON wc_qualifier_provider_mappings FOR SELECT TO anon USING (true);
CREATE POLICY "service_write_wc_qualifier_provider_mappings" ON wc_qualifier_provider_mappings FOR ALL TO service_role USING (true);

-- 11. sync runs
CREATE TABLE IF NOT EXISTS wc_qualifier_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  run_type text NOT NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text DEFAULT 'running',
  competitions_found integer DEFAULT 0,
  fixtures_found integer DEFAULT 0,
  fixtures_processed integer DEFAULT 0,
  statistics_rows integer DEFAULT 0,
  event_rows integer DEFAULT 0,
  lineup_rows integer DEFAULT 0,
  lineup_player_rows integer DEFAULT 0,
  player_stat_rows integer DEFAULT 0,
  standings_rows integer DEFAULT 0,
  errors_count integer DEFAULT 0,
  empty_endpoint_count integer DEFAULT 0,
  notes text,
  raw_summary_json jsonb
);
ALTER TABLE wc_qualifier_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write_wc_qualifier_sync_runs" ON wc_qualifier_sync_runs FOR ALL TO service_role USING (true);
CREATE POLICY "auth_read_wc_qualifier_sync_runs" ON wc_qualifier_sync_runs FOR SELECT TO authenticated USING (true);

-- 12. sync errors
CREATE TABLE IF NOT EXISTS wc_qualifier_sync_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id uuid REFERENCES wc_qualifier_sync_runs(id),
  provider text NOT NULL,
  provider_fixture_id text,
  endpoint text,
  error_type text,
  error_message text,
  status_code integer,
  response_body text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE wc_qualifier_sync_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write_wc_qualifier_sync_errors" ON wc_qualifier_sync_errors FOR ALL TO service_role USING (true);
CREATE POLICY "auth_read_wc_qualifier_sync_errors" ON wc_qualifier_sync_errors FOR SELECT TO authenticated USING (true);

-- Grant anon read on all new tables
GRANT SELECT ON wc_qualifier_competitions TO anon;
GRANT SELECT ON wc_qualifier_fixtures TO anon;
GRANT SELECT ON wc_qualifier_team_match_stats TO anon;
GRANT SELECT ON wc_qualifier_events TO anon;
GRANT SELECT ON wc_qualifier_lineups TO anon;
GRANT SELECT ON wc_qualifier_lineup_players TO anon;
GRANT SELECT ON wc_qualifier_player_match_stats TO anon;
GRANT SELECT ON wc_qualifier_standings TO anon;
GRANT SELECT ON wc_qualifier_team_summary TO anon;
GRANT SELECT ON wc_qualifier_provider_mappings TO anon;
