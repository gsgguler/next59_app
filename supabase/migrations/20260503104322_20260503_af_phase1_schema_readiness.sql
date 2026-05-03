/*
  # API-Football Phase 1 — Schema Readiness

  1. Stamp competitions.api_football_id for 7 target leagues
  2. Create api_football_fixture_probe_raw — admin-only raw storage
  3. Create af_fixture_mappings — dedicated mapping table replacing unsuitable provider_mappings
  4. Index on af_fixture_mappings for idempotency and lookup speed

  All tables: RLS enabled, no anon access, service_role write only.
*/

-- ── 1. Stamp competitions.api_football_id ─────────────────────────────────────

UPDATE public.competitions SET api_football_id = 39  WHERE name = 'Premier League';
UPDATE public.competitions SET api_football_id = 140 WHERE name = 'La Liga';
UPDATE public.competitions SET api_football_id = 135 WHERE name = 'Serie A';
UPDATE public.competitions SET api_football_id = 78  WHERE name = 'Bundesliga';
UPDATE public.competitions SET api_football_id = 61  WHERE name = 'Ligue 1';
UPDATE public.competitions SET api_football_id = 88  WHERE name = 'Eredivisie';
UPDATE public.competitions SET api_football_id = 203 WHERE name = 'Sueper Lig';

-- ── 2. Raw fixture probe storage ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.api_football_fixture_probe_raw (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint       text NOT NULL,
  request_params jsonb NOT NULL,
  league_id      integer NOT NULL,
  season         integer NOT NULL,
  response_hash  text UNIQUE,
  response_json  jsonb,
  http_status    integer,
  fetched_at     timestamptz DEFAULT now(),
  transform_status text DEFAULT 'raw',
  error_message  text
);

ALTER TABLE public.api_football_fixture_probe_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role write only raw"
  ON public.api_football_fixture_probe_raw
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role select raw"
  ON public.api_football_fixture_probe_raw
  FOR SELECT TO service_role
  USING (true);

CREATE INDEX IF NOT EXISTS idx_af_raw_league_season
  ON public.api_football_fixture_probe_raw (league_id, season);

-- ── 3. Dedicated fixture mapping table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.af_fixture_mappings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  af_fixture_id           integer NOT NULL,
  af_league_id            integer NOT NULL,
  af_season               integer NOT NULL,
  af_date                 date,
  af_home_team            text,
  af_away_team            text,
  mapping_status          text NOT NULL DEFAULT 'verified'
                            CHECK (mapping_status IN ('verified','candidate','needs_review','not_found')),
  confidence              numeric(4,3) DEFAULT 1.0,
  match_reason            text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),

  -- Idempotency: one fixture maps to at most one match (when verified)
  CONSTRAINT af_fixture_mappings_af_fixture_id_unique UNIQUE (af_fixture_id),
  -- One match maps to at most one verified fixture
  CONSTRAINT af_fixture_mappings_match_id_unique UNIQUE (match_id)
);

ALTER TABLE public.af_fixture_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role all on mappings"
  ON public.af_fixture_mappings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_af_mappings_league_season
  ON public.af_fixture_mappings (af_league_id, af_season);

CREATE INDEX IF NOT EXISTS idx_af_mappings_status
  ON public.af_fixture_mappings (mapping_status);

CREATE INDEX IF NOT EXISTS idx_af_mappings_match_id
  ON public.af_fixture_mappings (match_id);

-- ── 4. Index on matches.api_football_fixture_id (partial, where not null) ────

CREATE INDEX IF NOT EXISTS idx_matches_af_fixture_id_notnull
  ON public.matches (api_football_fixture_id)
  WHERE api_football_fixture_id IS NOT NULL;
