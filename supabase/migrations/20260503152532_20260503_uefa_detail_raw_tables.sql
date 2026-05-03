/*
  # UEFA Club Competitions — Detail Raw Storage Tables

  Creates raw storage tables for UEFA fixture statistics, events, and lineups.
  Follows the same pattern as domestic league raw tables but scoped to UEFA fixtures
  which live in af_uefa_fixtures (not matches).

  ## New Tables
  - `af_uefa_fixture_statistics_raw` — raw /fixtures/statistics responses keyed by af fixture id
  - `af_uefa_fixture_events_raw`     — raw /fixtures/events responses
  - `af_uefa_fixture_lineups_raw`    — raw /fixtures/lineups responses

  ## Normalized Output Tables
  - `af_uefa_fixture_stats`          — normalized per-team FT stats (mirrors match_stats structure)
  - `af_uefa_fixture_events`         — normalized minute-level events
  - `af_uefa_fixture_lineups`        — normalized formation + XI rows
  - `af_uefa_fixture_lineup_players` — normalized player rows (starter + bench)

  ## Security
  - RLS enabled on all tables
  - service_role: full write access
  - authenticated + admin role: SELECT only
  - anon: no access
*/

-- ── 1. Statistics raw ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.af_uefa_fixture_statistics_raw (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_uefa_fixture_id      uuid REFERENCES public.af_uefa_fixtures(id) ON DELETE CASCADE,
  api_football_fixture_id integer NOT NULL,
  af_league_id            integer NOT NULL,
  af_season               integer NOT NULL,
  endpoint                text NOT NULL,
  response_hash           text UNIQUE,
  response_json           jsonb,
  http_status             integer,
  fetched_at              timestamptz DEFAULT now(),
  transform_status        text NOT NULL DEFAULT 'raw'
                            CHECK (transform_status IN ('raw','normalized','error','skipped')),
  transform_error         text,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.af_uefa_fixture_statistics_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role all uefa stats raw"
  ON public.af_uefa_fixture_statistics_raw FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admin read uefa stats raw"
  ON public.af_uefa_fixture_statistics_raw FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_uefa_stats_raw_fixture
  ON public.af_uefa_fixture_statistics_raw (api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_uefa_stats_raw_status
  ON public.af_uefa_fixture_statistics_raw (transform_status);
CREATE INDEX IF NOT EXISTS idx_uefa_stats_raw_league_season
  ON public.af_uefa_fixture_statistics_raw (af_league_id, af_season);

-- ── 2. Events raw ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.af_uefa_fixture_events_raw (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_uefa_fixture_id      uuid REFERENCES public.af_uefa_fixtures(id) ON DELETE CASCADE,
  api_football_fixture_id integer NOT NULL,
  af_league_id            integer NOT NULL,
  af_season               integer NOT NULL,
  endpoint                text NOT NULL,
  response_hash           text UNIQUE,
  response_json           jsonb,
  http_status             integer,
  fetched_at              timestamptz DEFAULT now(),
  transform_status        text NOT NULL DEFAULT 'raw'
                            CHECK (transform_status IN ('raw','normalized','error','skipped')),
  transform_error         text,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.af_uefa_fixture_events_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role all uefa events raw"
  ON public.af_uefa_fixture_events_raw FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admin read uefa events raw"
  ON public.af_uefa_fixture_events_raw FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_uefa_events_raw_fixture
  ON public.af_uefa_fixture_events_raw (api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_uefa_events_raw_status
  ON public.af_uefa_fixture_events_raw (transform_status);
CREATE INDEX IF NOT EXISTS idx_uefa_events_raw_league_season
  ON public.af_uefa_fixture_events_raw (af_league_id, af_season);

-- ── 3. Lineups raw ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.af_uefa_fixture_lineups_raw (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_uefa_fixture_id      uuid REFERENCES public.af_uefa_fixtures(id) ON DELETE CASCADE,
  api_football_fixture_id integer NOT NULL,
  af_league_id            integer NOT NULL,
  af_season               integer NOT NULL,
  endpoint                text NOT NULL,
  response_hash           text UNIQUE,
  response_json           jsonb,
  http_status             integer,
  fetched_at              timestamptz DEFAULT now(),
  transform_status        text NOT NULL DEFAULT 'raw'
                            CHECK (transform_status IN ('raw','normalized','error','skipped')),
  transform_error         text,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.af_uefa_fixture_lineups_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role all uefa lineups raw"
  ON public.af_uefa_fixture_lineups_raw FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admin read uefa lineups raw"
  ON public.af_uefa_fixture_lineups_raw FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_uefa_lineups_raw_fixture
  ON public.af_uefa_fixture_lineups_raw (api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_uefa_lineups_raw_status
  ON public.af_uefa_fixture_lineups_raw (transform_status);
CREATE INDEX IF NOT EXISTS idx_uefa_lineups_raw_league_season
  ON public.af_uefa_fixture_lineups_raw (af_league_id, af_season);

-- ── 4. Normalized stats output ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.af_uefa_fixture_stats (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_uefa_fixture_id      uuid REFERENCES public.af_uefa_fixtures(id) ON DELETE CASCADE,
  api_football_fixture_id integer NOT NULL,
  af_league_id            integer NOT NULL,
  af_season               integer NOT NULL,
  af_team_id              integer NOT NULL,
  team_name               text,
  half                    text NOT NULL DEFAULT 'FT' CHECK (half IN ('HT','FT')),
  ball_possession         numeric(5,2),
  shots_on_goal           integer,
  shots_off_goal          integer,
  total_shots             integer,
  blocked_shots           integer,
  shots_insidebox         integer,
  shots_outsidebox        integer,
  fouls                   integer,
  corner_kicks            integer,
  offsides                integer,
  yellow_cards            integer,
  red_cards               integer,
  goalkeeper_saves        integer,
  total_passes            integer,
  passes_accurate         integer,
  passes_pct              numeric(5,2),
  expected_goals_provider numeric(6,3),
  goals_prevented         numeric(6,3),
  raw_payload             jsonb,
  created_at              timestamptz DEFAULT now(),
  UNIQUE (api_football_fixture_id, af_team_id, half)
);

ALTER TABLE public.af_uefa_fixture_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role all uefa stats normalized"
  ON public.af_uefa_fixture_stats FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admin read uefa stats normalized"
  ON public.af_uefa_fixture_stats FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_uefa_stats_fixture
  ON public.af_uefa_fixture_stats (api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_uefa_stats_league_season
  ON public.af_uefa_fixture_stats (af_league_id, af_season);

-- ── 5. Normalized events output ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.af_uefa_fixture_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_uefa_fixture_id      uuid REFERENCES public.af_uefa_fixtures(id) ON DELETE CASCADE,
  api_football_fixture_id integer NOT NULL,
  af_league_id            integer NOT NULL,
  af_season               integer NOT NULL,
  af_team_id              integer,
  team_name               text,
  player_name             text,
  assist_player_name      text,
  elapsed                 integer,
  extra_time              integer,
  event_type              text,
  event_detail            text,
  comments                text,
  raw_payload             jsonb,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.af_uefa_fixture_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role all uefa events normalized"
  ON public.af_uefa_fixture_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admin read uefa events normalized"
  ON public.af_uefa_fixture_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_uefa_events_fixture
  ON public.af_uefa_fixture_events (api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_uefa_events_type
  ON public.af_uefa_fixture_events (event_type);
CREATE INDEX IF NOT EXISTS idx_uefa_events_elapsed
  ON public.af_uefa_fixture_events (elapsed);

-- ── 6. Normalized lineups output ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.af_uefa_fixture_lineups (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_uefa_fixture_id      uuid REFERENCES public.af_uefa_fixtures(id) ON DELETE CASCADE,
  api_football_fixture_id integer NOT NULL,
  af_league_id            integer NOT NULL,
  af_season               integer NOT NULL,
  af_team_id              integer NOT NULL,
  team_name               text,
  formation               text,
  coach_name              text,
  raw_payload             jsonb,
  created_at              timestamptz DEFAULT now(),
  UNIQUE (api_football_fixture_id, af_team_id)
);

ALTER TABLE public.af_uefa_fixture_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role all uefa lineups normalized"
  ON public.af_uefa_fixture_lineups FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admin read uefa lineups normalized"
  ON public.af_uefa_fixture_lineups FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_uefa_lineups_fixture
  ON public.af_uefa_fixture_lineups (api_football_fixture_id);

-- ── 7. Normalized lineup players ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.af_uefa_fixture_lineup_players (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id               uuid REFERENCES public.af_uefa_fixture_lineups(id) ON DELETE CASCADE,
  af_uefa_fixture_id      uuid REFERENCES public.af_uefa_fixtures(id) ON DELETE CASCADE,
  api_football_fixture_id integer NOT NULL,
  af_team_id              integer,
  af_player_id            integer,
  player_name             text,
  player_number           integer,
  position                text,
  grid                    text,
  is_starting             boolean NOT NULL DEFAULT false,
  raw_payload             jsonb,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE public.af_uefa_fixture_lineup_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role all uefa lineup players"
  ON public.af_uefa_fixture_lineup_players FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "admin read uefa lineup players"
  ON public.af_uefa_fixture_lineup_players FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE INDEX IF NOT EXISTS idx_uefa_lineup_players_lineup
  ON public.af_uefa_fixture_lineup_players (lineup_id);
CREATE INDEX IF NOT EXISTS idx_uefa_lineup_players_fixture
  ON public.af_uefa_fixture_lineup_players (api_football_fixture_id);
CREATE INDEX IF NOT EXISTS idx_uefa_lineup_players_starting
  ON public.af_uefa_fixture_lineup_players (is_starting);
