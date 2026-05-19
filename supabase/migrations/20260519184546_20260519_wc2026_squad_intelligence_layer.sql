/*
  # WC2026 Squad Intelligence Layer

  ## Purpose
  Safe, incremental data foundation for World Cup 2026 squad/player intelligence.
  Completely isolated from domestic league pipelines and model_lab calibration.

  ## New Tables

  ### wc2026_team_pool
  - One row per national team entering the WC2026 pipeline
  - Tracks overall squad data status, provider fetch health, stale warnings
  - overall_status: pending | partial | complete | stale | error

  ### wc2026_player_pool
  - Canonical eligible player registry per national team
  - Tracks availability: available | injured | suspended | unknown
  - mapping_confidence: none | low | medium | high
  - data_status: probable | confirmed | unavailable | stale | manual_review

  ### wc2026_probable_squads
  - Per-team per-fetch snapshot of current squad list (23–26 players)
  - squad_type: provisional | final | withdrawn_update
  - status: probable | confirmed | unavailable | stale | manual_review
  - valid_until: staleness boundary

  ### wc2026_probable_lineups
  - Per-fixture probable XI + substitutes
  - formation, player slots keyed by position slot
  - status: probable | confirmed | unavailable | stale | manual_review
  - source: api_football | manual | inferred

  ### wc2026_player_performance_snapshots
  - Club-season performance snapshot per player at snapshot_date
  - Used for pre-tournament form assessment only
  - Does NOT feed model_lab or domestic calibration

  ### wc2026_provider_fetch_logs
  - Audit log for every provider fetch attempt for WC2026 data
  - Records endpoint, status, rows_received, error details
  - Enables stale detection and retry orchestration

  ## Security
  - RLS enabled on all tables
  - Admin-only SELECT via authenticated role check
  - INSERT/UPDATE only via service_role
  - anon revoked on all tables

  ## Isolation Guarantee
  - No FKs to league player tables, model_lab, or team_strength_ratings
  - Separate from wc_history schema
  - References only wc2026_player_profiles (existing) and wc2026_fixtures (existing) by provider ID
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: admin access predicate (reused across all policies)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_team_pool
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_team_pool (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_team_id      integer     UNIQUE NOT NULL,
  team_name                 text        NOT NULL,
  fifa_code                 text,                        -- 3-letter FIFA code e.g. "TUR"
  iso2                      text,                        -- 2-letter ISO e.g. "tr"
  confederation             text,                        -- UEFA, CONMEBOL, CAF, etc.

  -- Squad data status
  squad_status              text        NOT NULL DEFAULT 'pending',
    -- pending | partial | complete | stale | error
  squad_player_count        integer     NOT NULL DEFAULT 0,
  squad_last_fetched_at     timestamptz,
  squad_valid_until         timestamptz,
  squad_source              text        NOT NULL DEFAULT 'api_football',

  -- Lineup data status
  lineup_status             text        NOT NULL DEFAULT 'pending',
    -- pending | probable | confirmed | unavailable | stale
  lineup_last_fetched_at    timestamptz,
  lineup_valid_until        timestamptz,

  -- Performance snapshot status
  perf_snapshot_status      text        NOT NULL DEFAULT 'pending',
  perf_snapshot_date        date,

  -- Overall
  overall_status            text        NOT NULL DEFAULT 'pending',
    -- pending | partial | complete | stale | error
  stale_warning             boolean     NOT NULL DEFAULT false,
  missing_warning           boolean     NOT NULL DEFAULT false,
  notes                     text,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_team_pool_overall_status
  ON public.wc2026_team_pool (overall_status);

ALTER TABLE public.wc2026_team_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select wc2026_team_pool"
  ON public.wc2026_team_pool FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Service insert wc2026_team_pool"
  ON public.wc2026_team_pool FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service update wc2026_team_pool"
  ON public.wc2026_team_pool FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.wc2026_team_pool FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_player_pool
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_player_pool (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_team_id        integer     NOT NULL,
  api_football_player_id      integer,                   -- null if unresolved
  wc2026_player_profile_id    uuid        REFERENCES public.wc2026_player_profiles(id) ON DELETE SET NULL,
  player_name                 text        NOT NULL,
  position                    text,                      -- Goalkeeper | Defender | Midfielder | Attacker
  shirt_number                integer,
  nationality                 text,
  club_team_name              text,                      -- current club at time of snapshot
  club_league                 text,                      -- league of current club

  -- Availability
  availability_status         text        NOT NULL DEFAULT 'unknown',
    -- available | injured | suspended | unknown
  injury_detail               text,                      -- free text if available from provider
  suspension_detail           text,

  -- Data provenance
  data_status                 text        NOT NULL DEFAULT 'probable',
    -- probable | confirmed | unavailable | stale | manual_review
  mapping_confidence          text        NOT NULL DEFAULT 'none',
    -- none | low | medium | high
  provider                    text        NOT NULL DEFAULT 'api_football',
  source_endpoint             text,
  fetched_at                  timestamptz NOT NULL DEFAULT now(),
  valid_until                 timestamptz,

  raw_payload                 jsonb       NOT NULL DEFAULT '{}',
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_player_pool_team_id
  ON public.wc2026_player_pool (api_football_team_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_player_pool_player_id
  ON public.wc2026_player_pool (api_football_player_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_player_pool_data_status
  ON public.wc2026_player_pool (data_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wc2026_player_pool_team_player
  ON public.wc2026_player_pool (api_football_team_id, api_football_player_id)
  WHERE api_football_player_id IS NOT NULL;

ALTER TABLE public.wc2026_player_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select wc2026_player_pool"
  ON public.wc2026_player_pool FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Service insert wc2026_player_pool"
  ON public.wc2026_player_pool FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service update wc2026_player_pool"
  ON public.wc2026_player_pool FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.wc2026_player_pool FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_probable_squads
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_probable_squads (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_team_id      integer     NOT NULL,
  team_name                 text        NOT NULL,

  -- Squad snapshot metadata
  squad_type                text        NOT NULL DEFAULT 'provisional',
    -- provisional | final | withdrawn_update
  player_count              integer     NOT NULL DEFAULT 0,
  goalkeeper_count          integer     NOT NULL DEFAULT 0,
  defender_count            integer     NOT NULL DEFAULT 0,
  midfielder_count          integer     NOT NULL DEFAULT 0,
  attacker_count            integer     NOT NULL DEFAULT 0,

  -- Provenance + status
  status                    text        NOT NULL DEFAULT 'probable',
    -- probable | confirmed | unavailable | stale | manual_review
  confidence_level          text        NOT NULL DEFAULT 'low',
    -- low | medium | high
  provider                  text        NOT NULL DEFAULT 'api_football',
  source_endpoint           text        NOT NULL DEFAULT '/players/squads',
  fetched_at                timestamptz NOT NULL DEFAULT now(),
  valid_until               timestamptz,

  -- Player list stored as ordered jsonb array
  -- Each element: {player_id, name, position, shirt_number, mapping_confidence}
  players_json              jsonb       NOT NULL DEFAULT '[]',
  raw_payload               jsonb       NOT NULL DEFAULT '{}',
  notes                     text,

  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_probable_squads_team_id
  ON public.wc2026_probable_squads (api_football_team_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_probable_squads_status
  ON public.wc2026_probable_squads (status);

CREATE INDEX IF NOT EXISTS idx_wc2026_probable_squads_fetched_at
  ON public.wc2026_probable_squads (fetched_at DESC);

ALTER TABLE public.wc2026_probable_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select wc2026_probable_squads"
  ON public.wc2026_probable_squads FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Service insert wc2026_probable_squads"
  ON public.wc2026_probable_squads FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service update wc2026_probable_squads"
  ON public.wc2026_probable_squads FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.wc2026_probable_squads FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_probable_lineups
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_probable_lineups (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_fixture_id     integer     NOT NULL,
  api_football_team_id        integer     NOT NULL,
  team_name                   text        NOT NULL,
  is_home_team                boolean,

  -- Formation
  formation                   text,                      -- e.g. "4-3-3", null if unknown

  -- Starting XI (11 slots, ordered)
  starting_xi_json            jsonb       NOT NULL DEFAULT '[]',
    -- [{slot, player_id, player_name, position, shirt_number, mapping_confidence}]

  -- Substitutes
  substitutes_json            jsonb       NOT NULL DEFAULT '[]',
    -- same structure as starting_xi_json

  -- Counts
  starting_count              integer     NOT NULL DEFAULT 0,
  substitute_count            integer     NOT NULL DEFAULT 0,

  -- Provenance + status
  status                      text        NOT NULL DEFAULT 'probable',
    -- probable | confirmed | unavailable | stale | manual_review
  confidence_level            text        NOT NULL DEFAULT 'low',
    -- low | medium | high
  provider                    text        NOT NULL DEFAULT 'api_football',
  source_endpoint             text        NOT NULL DEFAULT '/fixtures/lineups',
  fetched_at                  timestamptz NOT NULL DEFAULT now(),
  valid_until                 timestamptz,
  -- How close to kickoff this was captured
  hours_before_kickoff        numeric,

  raw_payload                 jsonb       NOT NULL DEFAULT '{}',
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_probable_lineups_fixture_id
  ON public.wc2026_probable_lineups (api_football_fixture_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_probable_lineups_team_id
  ON public.wc2026_probable_lineups (api_football_team_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_probable_lineups_status
  ON public.wc2026_probable_lineups (status);

-- One lineup record per fixture+team+fetch (allow multiple fetches per match as status improves)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wc2026_probable_lineups_fixture_team_fetch
  ON public.wc2026_probable_lineups (api_football_fixture_id, api_football_team_id, fetched_at);

ALTER TABLE public.wc2026_probable_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select wc2026_probable_lineups"
  ON public.wc2026_probable_lineups FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Service insert wc2026_probable_lineups"
  ON public.wc2026_probable_lineups FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service update wc2026_probable_lineups"
  ON public.wc2026_probable_lineups FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.wc2026_probable_lineups FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_player_performance_snapshots
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_player_performance_snapshots (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_player_id      integer,
  wc2026_player_profile_id    uuid        REFERENCES public.wc2026_player_profiles(id) ON DELETE SET NULL,
  api_football_team_id        integer     NOT NULL,   -- national team
  player_name                 text        NOT NULL,
  snapshot_date               date        NOT NULL,
  season_label                text,                   -- e.g. "2025-2026"
  club_team_name              text,
  club_league                 text,

  -- Key performance metrics (all nullable — only populated if provider returns them)
  appearances                 integer,
  minutes_played              integer,
  goals                       integer,
  assists                     integer,
  yellow_cards                integer,
  red_cards                   integer,

  -- Advanced metrics (nullable — only if provider supports)
  rating                      numeric(4,2),           -- e.g. 7.42
  shots_total                 integer,
  shots_on_target             integer,
  passes_accuracy             numeric(5,2),           -- percentage
  dribbles_success            integer,
  tackles                     integer,
  interceptions               integer,
  duels_won                   integer,

  -- National team specific
  national_team_caps          integer,
  national_team_goals         integer,

  -- Provenance + status
  data_status                 text        NOT NULL DEFAULT 'probable',
    -- probable | confirmed | unavailable | stale | manual_review
  mapping_confidence          text        NOT NULL DEFAULT 'none',
    -- none | low | medium | high
  provider                    text        NOT NULL DEFAULT 'api_football',
  source_endpoint             text,
  fetched_at                  timestamptz NOT NULL DEFAULT now(),
  valid_until                 timestamptz,

  raw_payload                 jsonb       NOT NULL DEFAULT '{}',
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_perf_snapshots_player_id
  ON public.wc2026_player_performance_snapshots (api_football_player_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_perf_snapshots_team_id
  ON public.wc2026_player_performance_snapshots (api_football_team_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_perf_snapshots_date
  ON public.wc2026_player_performance_snapshots (snapshot_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wc2026_perf_snapshot_player_team_date
  ON public.wc2026_player_performance_snapshots (api_football_player_id, api_football_team_id, snapshot_date)
  WHERE api_football_player_id IS NOT NULL;

ALTER TABLE public.wc2026_player_performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select wc2026_player_performance_snapshots"
  ON public.wc2026_player_performance_snapshots FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Service insert wc2026_player_performance_snapshots"
  ON public.wc2026_player_performance_snapshots FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service update wc2026_player_performance_snapshots"
  ON public.wc2026_player_performance_snapshots FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.wc2026_player_performance_snapshots FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_provider_fetch_logs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_provider_fetch_logs (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                  text        NOT NULL DEFAULT 'api_football',
  endpoint                  text        NOT NULL,
  request_params            jsonb       NOT NULL DEFAULT '{}',
  http_status               integer,
  rows_received             integer     NOT NULL DEFAULT 0,
  rows_inserted             integer     NOT NULL DEFAULT 0,
  rows_updated              integer     NOT NULL DEFAULT 0,
  rows_skipped              integer     NOT NULL DEFAULT 0,
  fetch_status              text        NOT NULL DEFAULT 'pending',
    -- pending | success | partial | error | rate_limited
  error_detail              text,
  api_football_team_id      integer,    -- if fetch was scoped to a team
  api_football_fixture_id   integer,    -- if fetch was scoped to a fixture
  data_type                 text        NOT NULL DEFAULT 'squad',
    -- squad | lineup | player_stats | fixtures | injuries
  triggered_by              text        NOT NULL DEFAULT 'manual',
    -- manual | cron | edge_function
  fetched_at                timestamptz NOT NULL DEFAULT now(),
  duration_ms               integer
);

CREATE INDEX IF NOT EXISTS idx_wc2026_fetch_logs_provider_endpoint
  ON public.wc2026_provider_fetch_logs (provider, endpoint);

CREATE INDEX IF NOT EXISTS idx_wc2026_fetch_logs_fetched_at
  ON public.wc2026_provider_fetch_logs (fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_wc2026_fetch_logs_fetch_status
  ON public.wc2026_provider_fetch_logs (fetch_status);

CREATE INDEX IF NOT EXISTS idx_wc2026_fetch_logs_team_id
  ON public.wc2026_provider_fetch_logs (api_football_team_id)
  WHERE api_football_team_id IS NOT NULL;

ALTER TABLE public.wc2026_provider_fetch_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select wc2026_provider_fetch_logs"
  ON public.wc2026_provider_fetch_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Service insert wc2026_provider_fetch_logs"
  ON public.wc2026_provider_fetch_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service update wc2026_provider_fetch_logs"
  ON public.wc2026_provider_fetch_logs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.wc2026_provider_fetch_logs FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper RPC: get wc2026 team pool overview (admin only)
-- Returns one row per team with current status across all data dimensions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_get_team_pool_overview()
RETURNS TABLE (
  api_football_team_id      integer,
  team_name                 text,
  fifa_code                 text,
  confederation             text,
  squad_status              text,
  squad_player_count        integer,
  squad_last_fetched_at     timestamptz,
  squad_valid_until         timestamptz,
  lineup_status             text,
  lineup_last_fetched_at    timestamptz,
  perf_snapshot_status      text,
  perf_snapshot_date        date,
  overall_status            text,
  stale_warning             boolean,
  missing_warning           boolean,
  probable_squad_count      bigint,
  player_pool_count         bigint,
  last_fetch_status         text,
  last_fetch_at             timestamptz,
  notes                     text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tp.api_football_team_id,
    tp.team_name,
    tp.fifa_code,
    tp.confederation,
    tp.squad_status,
    tp.squad_player_count,
    tp.squad_last_fetched_at,
    tp.squad_valid_until,
    tp.lineup_status,
    tp.lineup_last_fetched_at,
    tp.perf_snapshot_status,
    tp.perf_snapshot_date,
    tp.overall_status,
    tp.stale_warning,
    tp.missing_warning,
    COALESCE(sq.cnt, 0) AS probable_squad_count,
    COALESCE(pp.cnt, 0) AS player_pool_count,
    fl.fetch_status      AS last_fetch_status,
    fl.fetched_at        AS last_fetch_at,
    tp.notes
  FROM public.wc2026_team_pool tp
  LEFT JOIN (
    SELECT api_football_team_id, COUNT(*) AS cnt
    FROM public.wc2026_probable_squads
    GROUP BY api_football_team_id
  ) sq ON sq.api_football_team_id = tp.api_football_team_id
  LEFT JOIN (
    SELECT api_football_team_id, COUNT(*) AS cnt
    FROM public.wc2026_player_pool
    GROUP BY api_football_team_id
  ) pp ON pp.api_football_team_id = tp.api_football_team_id
  LEFT JOIN LATERAL (
    SELECT fetch_status, fetched_at
    FROM public.wc2026_provider_fetch_logs
    WHERE api_football_team_id = tp.api_football_team_id
    ORDER BY fetched_at DESC
    LIMIT 1
  ) fl ON true
  ORDER BY tp.team_name;
$$;

REVOKE ALL ON FUNCTION public.wc2026_get_team_pool_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.wc2026_get_team_pool_overview() TO authenticated;
