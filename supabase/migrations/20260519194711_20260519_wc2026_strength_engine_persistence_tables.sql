/*
  # WC2026 Strength Engine Persistence Tables

  ## Purpose
  Create the two tables that wc2026-strength-engine writes to.
  These tables were referenced in the edge function but never created.

  ## Tables Created

  1. `public.api_football_raw_responses`
     - Raw API response store for api-football calls
     - Matches the exact column set the engine inserts (including season_code, league_code)
     - Deduplicates on response_hash to prevent duplicate storage

  2. `public.team_strength_ratings`
     - Per-team strength/ELO ratings by provider + scope + version
     - Upserts on (team_id, provider_name, rating_scope, rating_version)
     - Stores form_score, attack_score, defense_score, venue_score, confidence_score

  ## Security
  - RLS enabled on both tables
  - Service role and admin-role users only (no public reads on raw data)
  - Authenticated admin read policy for monitoring

  ## Notes
  - Does NOT touch wc2026_api_football_raw_responses (separate WC2026-scoped table)
  - team_id references public.teams (UUID FK)
  - ingestion_run_id references public.ingestion_runs (UUID FK, nullable)
*/

-- ── 1. api_football_raw_responses ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.api_football_raw_responses (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint             text        NOT NULL,
  request_params       jsonb       NOT NULL DEFAULT '{}',
  provider_entity_type text        NOT NULL,
  provider_entity_id   text,
  response_hash        text        NOT NULL,
  response_json        jsonb       NOT NULL,
  http_status          integer,
  season_code          text,
  league_code          text,
  transform_status     text        NOT NULL DEFAULT 'pending',
  ingestion_run_id     uuid        REFERENCES public.ingestion_runs(id) ON DELETE SET NULL,
  fetched_at           timestamptz NOT NULL DEFAULT now()
);

-- Unique on hash to deduplicate identical responses
CREATE UNIQUE INDEX IF NOT EXISTS api_football_raw_responses_hash_key
  ON public.api_football_raw_responses (response_hash);

CREATE INDEX IF NOT EXISTS api_football_raw_responses_endpoint_idx
  ON public.api_football_raw_responses (endpoint, fetched_at DESC);

CREATE INDEX IF NOT EXISTS api_football_raw_responses_entity_idx
  ON public.api_football_raw_responses (provider_entity_type, provider_entity_id);

ALTER TABLE public.api_football_raw_responses ENABLE ROW LEVEL SECURITY;

-- Admins can read (for monitoring)
CREATE POLICY "Admin users can read raw responses"
  ON public.api_football_raw_responses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ── 2. team_strength_ratings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_strength_ratings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  provider_name     text        NOT NULL,
  rating_scope      text        NOT NULL,  -- e.g. 'national_team_recent'
  rating_version    text        NOT NULL,  -- e.g. 'wc2026_v1'
  elo_rating        numeric(8,2),
  form_score        numeric(6,3),
  attack_score      numeric(6,3),
  defense_score     numeric(6,3),
  market_score      numeric(6,3),
  venue_score       numeric(6,3) DEFAULT 0,
  match_count       integer      DEFAULT 0,
  confidence_score  numeric(5,3),
  last_match_at     timestamptz,
  data_window_start date,
  data_window_end   date,
  metadata          jsonb        DEFAULT '{}',
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  created_at        timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT team_strength_ratings_unique
    UNIQUE (team_id, provider_name, rating_scope, rating_version)
);

CREATE INDEX IF NOT EXISTS team_strength_ratings_team_idx
  ON public.team_strength_ratings (team_id, rating_version);

CREATE INDEX IF NOT EXISTS team_strength_ratings_scope_idx
  ON public.team_strength_ratings (rating_scope, rating_version, updated_at DESC);

ALTER TABLE public.team_strength_ratings ENABLE ROW LEVEL SECURITY;

-- Admins can read
CREATE POLICY "Admin users can read strength ratings"
  ON public.team_strength_ratings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
