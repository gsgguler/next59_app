/*
# Create WC2026 Live Match Tables

## Purpose
Four tables to support the WC2026 live match pipeline:
1. wc2026_live_match_state — current scoreline, status, elapsed minute per fixture
2. wc2026_live_events — goal, card, substitution events fetched from API-Football
3. wc2026_live_statistics — per-team live statistics (shots, possession, xG, etc.)
4. wc2026_live_5min_scenarios — rule-based live scenario rows for each 5-minute window

## Security
All tables: RLS enabled, anon+authenticated SELECT allowed (public read), service-role only write (enforced by INSERT/UPDATE/DELETE policies requiring service_role).

## Notes
- Uses api_football_fixture_id (bigint) as the primary join key to API-Football
- fixture_id (uuid) is a FK to wc2026_fixtures.id
- wc2026_live_5min_scenarios: unique on (api_football_fixture_id, period_start, period_end, live_minute) to prevent duplicate rows
- is_current on scenarios allows simple .eq('is_current', true) fetch from frontend
*/

-- ── 1. wc2026_live_match_state ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wc2026_live_match_state (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id                uuid NOT NULL REFERENCES wc2026_fixtures(id) ON DELETE CASCADE,
  fixture_key               text NOT NULL,
  api_football_fixture_id   bigint NOT NULL UNIQUE,
  status_short              text,
  status_long               text,
  elapsed_minute            integer,
  period                    integer,
  home_score                integer,
  away_score                integer,
  home_score_ht             integer,
  away_score_ht             integer,
  home_score_et             integer,
  away_score_et             integer,
  home_score_pen            integer,
  away_score_pen            integer,
  raw_fixture_json          jsonb,
  synced_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wc2026_live_match_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_live_match_state" ON wc2026_live_match_state;
CREATE POLICY "public_select_live_match_state" ON wc2026_live_match_state
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "service_insert_live_match_state" ON wc2026_live_match_state;
CREATE POLICY "service_insert_live_match_state" ON wc2026_live_match_state
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service_update_live_match_state" ON wc2026_live_match_state;
CREATE POLICY "service_update_live_match_state" ON wc2026_live_match_state
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_delete_live_match_state" ON wc2026_live_match_state;
CREATE POLICY "service_delete_live_match_state" ON wc2026_live_match_state
  FOR DELETE TO service_role USING (true);

CREATE INDEX IF NOT EXISTS wc2026_live_match_state_fixture_id_idx ON wc2026_live_match_state(fixture_id);
CREATE INDEX IF NOT EXISTS wc2026_live_match_state_af_id_idx ON wc2026_live_match_state(api_football_fixture_id);


-- ── 2. wc2026_live_events ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wc2026_live_events (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id                uuid NOT NULL REFERENCES wc2026_fixtures(id) ON DELETE CASCADE,
  api_football_fixture_id   bigint NOT NULL,
  event_time_elapsed        integer,
  event_time_extra          integer,
  team_name                 text,
  team_api_id               integer,
  player_name               text,
  player_api_id             integer,
  assist_name               text,
  assist_api_id             integer,
  event_type                text,
  event_detail              text,
  event_comments            text,
  raw_event_json            jsonb,
  synced_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wc2026_live_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_live_events" ON wc2026_live_events;
CREATE POLICY "public_select_live_events" ON wc2026_live_events
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "service_insert_live_events" ON wc2026_live_events;
CREATE POLICY "service_insert_live_events" ON wc2026_live_events
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service_update_live_events" ON wc2026_live_events;
CREATE POLICY "service_update_live_events" ON wc2026_live_events
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_delete_live_events" ON wc2026_live_events;
CREATE POLICY "service_delete_live_events" ON wc2026_live_events
  FOR DELETE TO service_role USING (true);

CREATE INDEX IF NOT EXISTS wc2026_live_events_fixture_id_idx ON wc2026_live_events(fixture_id);
CREATE INDEX IF NOT EXISTS wc2026_live_events_af_id_idx ON wc2026_live_events(api_football_fixture_id);
CREATE INDEX IF NOT EXISTS wc2026_live_events_time_idx ON wc2026_live_events(api_football_fixture_id, event_time_elapsed);


-- ── 3. wc2026_live_statistics ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wc2026_live_statistics (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id                uuid NOT NULL REFERENCES wc2026_fixtures(id) ON DELETE CASCADE,
  api_football_fixture_id   bigint NOT NULL,
  team_name                 text,
  team_api_id               integer,
  shots_on_goal             integer,
  shots_off_goal            integer,
  total_shots               integer,
  blocked_shots             integer,
  shots_inside_box          integer,
  shots_outside_box         integer,
  fouls                     integer,
  corner_kicks              integer,
  offsides                  integer,
  ball_possession           numeric(5,2),
  yellow_cards              integer,
  red_cards                 integer,
  goalkeeper_saves          integer,
  total_passes              integer,
  passes_accurate           integer,
  passes_pct                numeric(5,2),
  expected_goals            numeric(6,3),
  raw_statistics_json       jsonb,
  synced_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wc2026_live_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_live_statistics" ON wc2026_live_statistics;
CREATE POLICY "public_select_live_statistics" ON wc2026_live_statistics
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "service_insert_live_statistics" ON wc2026_live_statistics;
CREATE POLICY "service_insert_live_statistics" ON wc2026_live_statistics
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service_update_live_statistics" ON wc2026_live_statistics;
CREATE POLICY "service_update_live_statistics" ON wc2026_live_statistics
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_delete_live_statistics" ON wc2026_live_statistics;
CREATE POLICY "service_delete_live_statistics" ON wc2026_live_statistics
  FOR DELETE TO service_role USING (true);

CREATE INDEX IF NOT EXISTS wc2026_live_statistics_fixture_id_idx ON wc2026_live_statistics(fixture_id);
CREATE INDEX IF NOT EXISTS wc2026_live_statistics_af_id_idx ON wc2026_live_statistics(api_football_fixture_id);


-- ── 4. wc2026_live_5min_scenarios ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wc2026_live_5min_scenarios (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id                uuid NOT NULL REFERENCES wc2026_fixtures(id) ON DELETE CASCADE,
  fixture_key               text NOT NULL,
  api_football_fixture_id   bigint NOT NULL,
  live_minute               integer NOT NULL,
  period_start              integer NOT NULL,
  period_end                integer NOT NULL,
  home_score                integer,
  away_score                integer,
  momentum_side             text,
  goal_risk_home            numeric(5,3),
  goal_risk_away            numeric(5,3),
  card_risk                 numeric(5,3),
  corner_risk               numeric(5,3),
  foul_intensity            numeric(5,3),
  narrative_text            text,
  source_snapshot_json      jsonb,
  is_current                boolean NOT NULL DEFAULT false,
  is_public                 boolean NOT NULL DEFAULT true,
  generated_at              timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (api_football_fixture_id, period_start, period_end, live_minute)
);

ALTER TABLE wc2026_live_5min_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_live_scenarios" ON wc2026_live_5min_scenarios;
CREATE POLICY "public_select_live_scenarios" ON wc2026_live_5min_scenarios
  FOR SELECT TO anon, authenticated USING (is_public = true);

DROP POLICY IF EXISTS "service_insert_live_scenarios" ON wc2026_live_5min_scenarios;
CREATE POLICY "service_insert_live_scenarios" ON wc2026_live_5min_scenarios
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "service_update_live_scenarios" ON wc2026_live_5min_scenarios;
CREATE POLICY "service_update_live_scenarios" ON wc2026_live_5min_scenarios
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_delete_live_scenarios" ON wc2026_live_5min_scenarios;
CREATE POLICY "service_delete_live_scenarios" ON wc2026_live_5min_scenarios
  FOR DELETE TO service_role USING (true);

CREATE INDEX IF NOT EXISTS wc2026_live_5min_scenarios_fixture_id_idx ON wc2026_live_5min_scenarios(fixture_id);
CREATE INDEX IF NOT EXISTS wc2026_live_5min_scenarios_af_id_idx ON wc2026_live_5min_scenarios(api_football_fixture_id);
CREATE INDEX IF NOT EXISTS wc2026_live_5min_scenarios_current_idx ON wc2026_live_5min_scenarios(api_football_fixture_id, is_current) WHERE is_current = true;
