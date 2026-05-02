/*
  # WC2026 Raw Storage + Ingestion Run Tables

  ## Purpose
  The existing `ingestion_runs` table has an incompatible schema
  (columns: source_id, run_type, target_league_code — NOT provider_name / ingestion_type).
  The `api_football_raw_responses` table does not exist in this DB.

  Rather than modifying the existing ingestion system, we create WC2026-specific
  isolated tables that the wc2026-raw-probe function writes to exclusively.

  This keeps WC2026 ingestion fully separate from all other ingestion systems.

  ## New Tables

  ### wc2026_ingestion_runs
  - Tracks each wc2026-raw-probe execution
  - provider_name, ingestion_type, run_status, api_calls_used, rows_raw/transformed
  - Admin read, service_role write, no anon access

  ### wc2026_api_football_raw_responses
  - Stores raw API-Football responses for WC2026 endpoints only
  - Deduplicated by response_hash (SHA-256)
  - provider_entity_type: wc2026_fixtures | wc2026_teams | wc2026_players | fixture | team | league
  - Admin read, service_role write, no anon access

  ## Isolation Guarantee
  - No foreign keys to domestic league tables
  - No connection to model_lab, predictions, or team_strength_ratings
  - Completely separate from existing ingestion_runs / staging tables
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_ingestion_runs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_ingestion_runs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name    text        NOT NULL DEFAULT 'api_football',
  ingestion_type   text        NOT NULL,                          -- e.g. wc2026_full_probe, wc2026_players_only
  run_status       text        NOT NULL DEFAULT 'pending',        -- pending | running | completed | completed_with_errors | failed
  api_calls_used   integer     NOT NULL DEFAULT 0,
  rows_raw         integer     NOT NULL DEFAULT 0,
  rows_transformed integer     NOT NULL DEFAULT 0,
  error_summary    text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wc2026_ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read wc2026_ingestion_runs"
  ON public.wc2026_ingestion_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Service role insert wc2026_ingestion_runs"
  ON public.wc2026_ingestion_runs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update wc2026_ingestion_runs"
  ON public.wc2026_ingestion_runs FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.wc2026_ingestion_runs FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_api_football_raw_responses
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_api_football_raw_responses (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint              text        NOT NULL,                     -- e.g. /fixtures, /teams, /players
  request_params        jsonb       NOT NULL DEFAULT '{}',        -- query params used
  provider_entity_type  text        NOT NULL,                     -- wc2026_fixtures | wc2026_teams | wc2026_players | fixture | team | league
  provider_entity_id    text,                                     -- api-football entity id (nullable for bulk)
  response_hash         text        NOT NULL,                     -- SHA-256 of response_json for dedup
  response_json         jsonb       NOT NULL DEFAULT '{}',
  http_status           integer,
  transform_status      text        NOT NULL DEFAULT 'raw',       -- raw | skipped | transformed | failed
  ingestion_run_id      uuid        REFERENCES public.wc2026_ingestion_runs(id) ON DELETE SET NULL,
  fetched_at            timestamptz NOT NULL DEFAULT now()
);

-- Deduplication: same response content must not be stored twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_wc2026_raw_response_hash
  ON public.wc2026_api_football_raw_responses (response_hash);

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_wc2026_raw_entity_type
  ON public.wc2026_api_football_raw_responses (provider_entity_type);

CREATE INDEX IF NOT EXISTS idx_wc2026_raw_run_id
  ON public.wc2026_api_football_raw_responses (ingestion_run_id);

ALTER TABLE public.wc2026_api_football_raw_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read wc2026_api_football_raw_responses"
  ON public.wc2026_api_football_raw_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Service role insert wc2026_api_football_raw_responses"
  ON public.wc2026_api_football_raw_responses FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update wc2026_api_football_raw_responses"
  ON public.wc2026_api_football_raw_responses FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.wc2026_api_football_raw_responses FROM anon;
