/*
  # Create Raw Storage and Ingestion Run Infrastructure

  1. New Tables
    - `ingestion_runs`
      - `id` (uuid, primary key) - unique run identifier
      - `provider_name` (text, not null) - data provider name
      - `ingestion_type` (text, not null) - type of ingestion (full_season, incremental, fixture_detail, etc.)
      - `league_code` (text, nullable) - league code for scoped runs
      - `season_code` (text, nullable) - season code for scoped runs
      - `date_from` (date, nullable) - date range start
      - `date_to` (date, nullable) - date range end
      - `status` (text, not null, default 'started') - run status
      - `started_at` (timestamptz, not null) - when run began
      - `completed_at` (timestamptz, nullable) - when run finished
      - `api_calls_used` (integer, not null, default 0) - API calls consumed
      - `rows_raw` (integer, not null, default 0) - raw rows stored
      - `rows_transformed` (integer, not null, default 0) - rows transformed
      - `rows_failed` (integer, not null, default 0) - rows that failed transform
      - `error_summary` (jsonb, nullable) - structured error details
      - `metadata` (jsonb, not null, default '{}') - additional run context
      - `created_at` (timestamptz, not null)
      - `updated_at` (timestamptz, not null)

    - `api_football_raw_responses`
      - `id` (uuid, primary key) - unique response identifier
      - `endpoint` (text, not null) - API endpoint called
      - `request_params` (jsonb, not null) - request parameters
      - `provider_entity_type` (text, not null) - type of entity in response
      - `provider_entity_id` (text, nullable) - entity ID from provider
      - `response_hash` (text, not null) - SHA-256 of response body
      - `response_json` (jsonb, not null) - full API response body
      - `http_status` (integer, not null) - HTTP response status
      - `fetched_at` (timestamptz, not null) - when response was fetched
      - `season_code` (text, nullable) - season for filtering
      - `league_code` (text, nullable) - league for filtering
      - `fixture_id` (text, nullable) - fixture ID for filtering
      - `ingestion_run_id` (uuid, nullable) - FK to ingestion_runs
      - `transform_status` (text, not null, default 'pending') - transform state
      - `transformed_at` (timestamptz, nullable) - when transformed
      - `transform_error` (text, nullable) - transform error message
      - `retry_count` (integer, not null, default 0) - number of retries
      - `created_at` (timestamptz, not null)

  2. Security
    - Enable RLS on both tables
    - service_role: full access (ALL)
    - authenticated super_admin: SELECT only
    - anon/authenticated: INSERT/UPDATE/DELETE blocked

  3. Indexes
    - ingestion_runs: provider_name, ingestion_type, status, league+season, started_at, metadata GIN
    - api_football_raw_responses: endpoint+type, fixture_id, league+season, transform_status, fetched_at, ingestion_run_id, response_json GIN, request_params GIN

  4. Constraints
    - CHECK constraints on status enums, numeric ranges, date ordering
    - FK from api_football_raw_responses.ingestion_run_id to ingestion_runs.id
    - Unique constraint on raw responses to prevent duplicate storage

  5. Triggers
    - updated_at trigger on ingestion_runs
*/

-- ─────────────────────────────────────────────────
-- TABLE: ingestion_runs (created first for FK target)
-- ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL,
  ingestion_type text NOT NULL,
  league_code text,
  season_code text,
  date_from date,
  date_to date,
  status text NOT NULL DEFAULT 'started',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  api_calls_used integer NOT NULL DEFAULT 0,
  rows_raw integer NOT NULL DEFAULT 0,
  rows_transformed integer NOT NULL DEFAULT 0,
  rows_failed integer NOT NULL DEFAULT 0,
  error_summary jsonb,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_ir_provider_name CHECK (
    provider_name IN (
      'api-football', 'sportmonks', 'football-data-uk',
      'football-data-org', 'flashscore', 'thesportsdb',
      'statsbomb', 'opta', 'wyscout', 'seed'
    )
  ),
  CONSTRAINT chk_ir_status CHECK (
    status IN ('started', 'completed', 'failed', 'partial', 'cancelled')
  ),
  CONSTRAINT chk_ir_api_calls_used CHECK (api_calls_used >= 0),
  CONSTRAINT chk_ir_rows_raw CHECK (rows_raw >= 0),
  CONSTRAINT chk_ir_rows_transformed CHECK (rows_transformed >= 0),
  CONSTRAINT chk_ir_rows_failed CHECK (rows_failed >= 0),
  CONSTRAINT chk_ir_completed_after_started CHECK (
    completed_at IS NULL OR completed_at >= started_at
  )
);

-- Indexes for ingestion_runs
CREATE INDEX IF NOT EXISTS idx_ir_provider_name ON ingestion_runs (provider_name);
CREATE INDEX IF NOT EXISTS idx_ir_ingestion_type ON ingestion_runs (ingestion_type);
CREATE INDEX IF NOT EXISTS idx_ir_status ON ingestion_runs (status);
CREATE INDEX IF NOT EXISTS idx_ir_league_season ON ingestion_runs (league_code, season_code);
CREATE INDEX IF NOT EXISTS idx_ir_started_at ON ingestion_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ir_metadata ON ingestion_runs USING gin (metadata);

-- ─────────────────────────────────────────────────
-- TABLE: api_football_raw_responses
-- ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_football_raw_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  request_params jsonb NOT NULL DEFAULT '{}',
  provider_entity_type text NOT NULL,
  provider_entity_id text,
  response_hash text NOT NULL,
  response_json jsonb NOT NULL,
  http_status integer NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  season_code text,
  league_code text,
  fixture_id text,
  ingestion_run_id uuid REFERENCES ingestion_runs(id),
  transform_status text NOT NULL DEFAULT 'pending',
  transformed_at timestamptz,
  transform_error text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_afr_provider_entity_type CHECK (
    provider_entity_type IN (
      'fixture', 'team', 'league', 'season', 'venue',
      'referee', 'event', 'statistic', 'lineup', 'odds',
      'standing', 'injury', 'coach', 'player', 'request_batch'
    )
  ),
  CONSTRAINT chk_afr_transform_status CHECK (
    transform_status IN ('pending', 'transformed', 'failed', 'skipped')
  ),
  CONSTRAINT chk_afr_response_hash_not_empty CHECK (length(response_hash) > 0),
  CONSTRAINT chk_afr_http_status CHECK (http_status BETWEEN 100 AND 599),
  CONSTRAINT chk_afr_retry_count CHECK (retry_count >= 0)
);

-- Uniqueness: same endpoint + same params + same entity type + same entity id + same response = no duplicate
CREATE UNIQUE INDEX IF NOT EXISTS uq_afr_dedup
  ON api_football_raw_responses (
    endpoint,
    provider_entity_type,
    coalesce(provider_entity_id, ''),
    response_hash
  );

-- Indexes for api_football_raw_responses
CREATE INDEX IF NOT EXISTS idx_afr_endpoint_type ON api_football_raw_responses (endpoint, provider_entity_type);
CREATE INDEX IF NOT EXISTS idx_afr_fixture_id ON api_football_raw_responses (fixture_id) WHERE fixture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_afr_league_season ON api_football_raw_responses (league_code, season_code);
CREATE INDEX IF NOT EXISTS idx_afr_transform_pending ON api_football_raw_responses (transform_status) WHERE transform_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_afr_fetched_at ON api_football_raw_responses (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_afr_ingestion_run ON api_football_raw_responses (ingestion_run_id) WHERE ingestion_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_afr_response_json ON api_football_raw_responses USING gin (response_json);
CREATE INDEX IF NOT EXISTS idx_afr_request_params ON api_football_raw_responses USING gin (request_params);

-- ─────────────────────────────────────────────────
-- RLS: ingestion_runs
-- ─────────────────────────────────────────────────

ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_runs_service_all"
  ON ingestion_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "ingestion_runs_super_admin_read"
  ON ingestion_runs
  FOR SELECT
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "ingestion_runs_authenticated_insert_blocked"
  ON ingestion_runs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "ingestion_runs_authenticated_update_blocked"
  ON ingestion_runs
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "ingestion_runs_authenticated_delete_blocked"
  ON ingestion_runs
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- ─────────────────────────────────────────────────
-- RLS: api_football_raw_responses
-- ─────────────────────────────────────────────────

ALTER TABLE api_football_raw_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "afr_service_all"
  ON api_football_raw_responses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "afr_super_admin_read"
  ON api_football_raw_responses
  FOR SELECT
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "afr_authenticated_insert_blocked"
  ON api_football_raw_responses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "afr_authenticated_update_blocked"
  ON api_football_raw_responses
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "afr_authenticated_delete_blocked"
  ON api_football_raw_responses
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- ─────────────────────────────────────────────────
-- TRIGGER: updated_at on ingestion_runs
-- ─────────────────────────────────────────────────

CREATE TRIGGER set_ingestion_runs_updated_at
  BEFORE UPDATE ON ingestion_runs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
