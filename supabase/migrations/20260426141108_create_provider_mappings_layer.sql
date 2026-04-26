/*
  # Create Provider Mappings Layer

  Universal provider identity layer making Next59 provider-agnostic.
  Internal UUIDs remain the only canonical identity. All provider-specific
  IDs are external mappings stored in provider_mappings.

  1. New Tables
    - `provider_mappings`
      - `id` (uuid, PK) — row identifier
      - `entity_type` (text, NOT NULL) — competition, team, match, player, stadium, coach, referee, competition_season
      - `internal_entity_id` (uuid, NOT NULL) — references the internal canonical ID
      - `provider_name` (text, NOT NULL) — api-football, sportmonks, football-data-uk, etc.
      - `provider_entity_id` (text, NOT NULL) — the provider's ID for this entity (text for universality)
      - `provider_entity_name` (text) — human-readable name from provider
      - `confidence_score` (numeric 0-1) — mapping confidence
      - `match_method` (text) — how mapping was established
      - `is_primary` (boolean, default false) — primary provider flag
      - `verified_at` (timestamptz) — when mapping was verified
      - `verified_by` (text) — who/what verified
      - `metadata` (jsonb) — provider-specific extra data
      - `created_at`, `updated_at` (timestamptz)
    - `provider_registry`
      - `provider_name` (text, PK) — canonical provider identifier
      - `role` (text, NOT NULL) — CORE_TRUTH, BACKUP, LIVE_UI, VALIDATION, METADATA, SECONDARY
      - `priority` (integer) — provider priority order
      - `is_active`, `is_core_truth`, `is_live_provider`, `is_metadata_provider` (boolean flags)
      - `health_status` (text) — current health
      - `cost_limit` (numeric) — budget cap
      - `created_at`, `updated_at` (timestamptz)

  2. Constraints
    - CHECK on entity_type, provider_name, confidence_score, match_method (provider_mappings)
    - CHECK on role (provider_registry)
    - UNIQUE (entity_type, provider_name, provider_entity_id) — one internal entity per provider ID
    - UNIQUE (entity_type, internal_entity_id, provider_name) — one mapping per provider per entity
    - Partial UNIQUE (entity_type, internal_entity_id) WHERE is_primary = true — one primary per entity

  3. Indexes
    - provider_name, entity_type, internal_entity_id, provider_entity_id
    - Partial index on is_primary
    - GIN index on metadata

  4. Security
    - RLS enabled on both tables
    - service_role: full access
    - authenticated (super_admin): read-only
    - anon/authenticated: insert/update/delete blocked
    - Follows existing provider_health / provider_costs_daily pattern

  5. Triggers
    - updated_at trigger using existing set_updated_at() function

  6. Seed Data
    - provider_registry: football-data-uk row (role=VALIDATION, is_active=true)
    - provider_mappings: backfill 4924 football-data.co.uk match mappings from matches.source_match_id

  7. Important Notes
    - No existing tables are modified
    - No provider-specific columns on entity tables are touched
    - provider_entity_id is TEXT (not BIGINT) for universal compatibility
    - Backfill uses deterministic data already in matches table
    - No API calls, no external data fetched
*/

-- ============================================================
-- STEP 2: CREATE provider_mappings
-- ============================================================
CREATE TABLE IF NOT EXISTS provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  internal_entity_id uuid NOT NULL,
  provider_name text NOT NULL,
  provider_entity_id text NOT NULL,
  provider_entity_name text,
  confidence_score numeric(3,2),
  match_method text,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT provider_mappings_entity_type_check CHECK (
    entity_type IN ('competition', 'competition_season', 'team', 'match', 'player', 'stadium', 'coach', 'referee')
  ),
  CONSTRAINT provider_mappings_provider_name_check CHECK (
    provider_name IN ('api-football', 'sportmonks', 'football-data-uk', 'football-data-org', 'flashscore', 'thesportsdb', 'statsbomb', 'opta', 'wyscout', 'seed')
  ),
  CONSTRAINT provider_mappings_confidence_check CHECK (
    confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)
  ),
  CONSTRAINT provider_mappings_match_method_check CHECK (
    match_method IS NULL OR match_method IN ('exact_name', 'fuzzy', 'manual', 'api_lookup', 'id_crossref', 'deterministic_hash', 'imported_seed')
  )
);

-- ============================================================
-- STEP 3: UNIQUENESS AND INDEXES
-- ============================================================

-- 1. A provider entity ID can map to only one internal entity
CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_provider_entity
  ON provider_mappings (entity_type, provider_name, provider_entity_id);

-- 2. One mapping per provider per internal entity
CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_internal_entity_provider
  ON provider_mappings (entity_type, internal_entity_id, provider_name);

-- 3. Only one primary provider mapping per entity
CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_primary_per_entity
  ON provider_mappings (entity_type, internal_entity_id)
  WHERE is_primary = true;

-- 4. Lookup indexes
CREATE INDEX IF NOT EXISTS idx_pm_provider_name ON provider_mappings (provider_name);
CREATE INDEX IF NOT EXISTS idx_pm_entity_type ON provider_mappings (entity_type);
CREATE INDEX IF NOT EXISTS idx_pm_internal_entity_id ON provider_mappings (internal_entity_id);
CREATE INDEX IF NOT EXISTS idx_pm_provider_entity_id ON provider_mappings (provider_entity_id);
CREATE INDEX IF NOT EXISTS idx_pm_is_primary ON provider_mappings (is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_pm_metadata ON provider_mappings USING gin (metadata);

-- ============================================================
-- STEP 4: RLS (follows provider_health / provider_costs_daily pattern)
-- ============================================================
ALTER TABLE provider_mappings ENABLE ROW LEVEL SECURITY;

-- service_role: full access
CREATE POLICY "provider_mappings_service_all"
  ON provider_mappings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- authenticated super_admin: read only
CREATE POLICY "provider_mappings_super_admin_read"
  ON provider_mappings FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- anon/authenticated: insert blocked
CREATE POLICY "provider_mappings_authenticated_insert_blocked"
  ON provider_mappings FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- anon/authenticated: update blocked
CREATE POLICY "provider_mappings_authenticated_update_blocked"
  ON provider_mappings FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- anon/authenticated: delete blocked
CREATE POLICY "provider_mappings_authenticated_delete_blocked"
  ON provider_mappings FOR DELETE
  TO anon, authenticated
  USING (false);

-- ============================================================
-- STEP 5: updated_at TRIGGER (uses existing set_updated_at function)
-- ============================================================
CREATE TRIGGER set_provider_mappings_updated_at
  BEFORE UPDATE ON provider_mappings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- STEP 6: BACKFILL football-data-uk match mappings
-- ============================================================
INSERT INTO provider_mappings (
  entity_type,
  internal_entity_id,
  provider_name,
  provider_entity_id,
  confidence_score,
  match_method,
  is_primary,
  verified_at,
  verified_by
)
SELECT
  'match',
  m.id,
  'football-data-uk',
  m.source_match_id,
  1.00,
  'deterministic_hash',
  false,
  now(),
  'migration_backfill'
FROM matches m
WHERE m.source_provider = 'football-data.co.uk'
  AND m.source_match_id IS NOT NULL
  AND m.source_match_id != ''
ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 7: CREATE provider_registry
-- ============================================================
CREATE TABLE IF NOT EXISTS provider_registry (
  provider_name text PRIMARY KEY,
  role text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  is_core_truth boolean NOT NULL DEFAULT false,
  is_live_provider boolean NOT NULL DEFAULT false,
  is_metadata_provider boolean NOT NULL DEFAULT false,
  health_status text,
  cost_limit numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT provider_registry_role_check CHECK (
    role IN ('CORE_TRUTH', 'BACKUP', 'LIVE_UI', 'VALIDATION', 'METADATA', 'SECONDARY')
  )
);

ALTER TABLE provider_registry ENABLE ROW LEVEL SECURITY;

-- service_role: full access
CREATE POLICY "provider_registry_service_all"
  ON provider_registry FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- authenticated super_admin: read only
CREATE POLICY "provider_registry_super_admin_read"
  ON provider_registry FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- anon/authenticated: insert blocked
CREATE POLICY "provider_registry_authenticated_insert_blocked"
  ON provider_registry FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- anon/authenticated: update blocked
CREATE POLICY "provider_registry_authenticated_update_blocked"
  ON provider_registry FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- anon/authenticated: delete blocked
CREATE POLICY "provider_registry_authenticated_delete_blocked"
  ON provider_registry FOR DELETE
  TO anon, authenticated
  USING (false);

-- updated_at trigger
CREATE TRIGGER set_provider_registry_updated_at
  BEFORE UPDATE ON provider_registry
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Seed football-data-uk
INSERT INTO provider_registry (provider_name, role, priority, is_active, is_core_truth)
VALUES ('football-data-uk', 'VALIDATION', 4, true, false)
ON CONFLICT DO NOTHING;
