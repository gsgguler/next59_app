/*
  # API-Football Ingestion Support Tables

  Required by af-upcoming-fixtures, af-live-result-sync, and other AF edge functions.

  1. New Tables
    - `af_team_aliases` - maps AF team names to canonical DB team names per league
    - `af_fixture_mappings` - tracks which AF fixture IDs map to which match IDs
    - `api_football_fixture_probe_raw` - raw response storage for AF fixture API calls

  2. Functions
    - `normalize_team_name(raw text)` - normalize team name for matching
    - `resolve_team_by_normalized_name(p_norm text)` - find team by normalized name

  3. Security
    - RLS on all tables
    - Public/authenticated read
    - Service role write
*/

-- ─── af_team_aliases ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS af_team_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   int NOT NULL,
  af_norm     text NOT NULL,
  db_norm     text NOT NULL,
  confidence  numeric(3,2) NOT NULL DEFAULT 1.0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id, af_norm)
);

ALTER TABLE af_team_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "af_team_aliases authenticated read"
  ON af_team_aliases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "af_team_aliases service insert"
  ON af_team_aliases FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "af_team_aliases service update"
  ON af_team_aliases FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── af_fixture_mappings ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS af_fixture_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  af_fixture_id   int NOT NULL UNIQUE,
  match_id        uuid REFERENCES matches(id) ON DELETE SET NULL,
  af_league_id    int,
  af_season       int,
  af_date         date,
  af_home_team    text,
  af_away_team    text,
  mapping_status  text NOT NULL DEFAULT 'pending' CHECK (mapping_status IN ('pending','verified','needs_review','rejected')),
  confidence      numeric(4,3) NOT NULL DEFAULT 0,
  match_reason    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_afm_match_id ON af_fixture_mappings(match_id);
CREATE INDEX IF NOT EXISTS idx_afm_league_season ON af_fixture_mappings(af_league_id, af_season);
CREATE INDEX IF NOT EXISTS idx_afm_status ON af_fixture_mappings(mapping_status);

ALTER TABLE af_fixture_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "af_fixture_mappings authenticated read"
  ON af_fixture_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "af_fixture_mappings service insert"
  ON af_fixture_mappings FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "af_fixture_mappings service update"
  ON af_fixture_mappings FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── api_football_fixture_probe_raw ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_football_fixture_probe_raw (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint        text NOT NULL,
  request_params  jsonb NOT NULL DEFAULT '{}',
  league_id       int,
  season          int,
  response_hash   text UNIQUE,
  response_json   jsonb NOT NULL DEFAULT '{}',
  http_status     int,
  transform_status text NOT NULL DEFAULT 'pending',
  is_processed    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_afpr_league_season ON api_football_fixture_probe_raw(league_id, season);
CREATE INDEX IF NOT EXISTS idx_afpr_is_processed ON api_football_fixture_probe_raw(is_processed) WHERE is_processed = false;

ALTER TABLE api_football_fixture_probe_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_football_fixture_probe_raw authenticated read"
  ON api_football_fixture_probe_raw FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "api_football_fixture_probe_raw service insert"
  ON api_football_fixture_probe_raw FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "api_football_fixture_probe_raw service update"
  ON api_football_fixture_probe_raw FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── normalize_team_name function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION normalize_team_name(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  s := lower(trim(raw));
  -- Transliterate common diacritics
  s := translate(s,
    'çşğıöüéèêëñãâôîûřčžóúěșțøåęćłźńąýďťőűïàù',
    'csgioueeeenaaooiurczouests oaeclznaydtouiau'
  );
  -- Remove leading articles for club names
  s := regexp_replace(s, '^\s*(as|ac|ss)\s+', '', 'i');
  -- Remove trailing legal suffixes
  s := regexp_replace(s, '\s*(f\.?c\.?|f\.?k\.?|s\.?k\.?|j\.?k\.?|c\.?f\.?|s\.?c\.?|i\.?f\.?|b\.?k\.?|as|aş|a\.ş\.|united|utd|club)\s*$', '', 'i');
  -- Collapse whitespace
  s := regexp_replace(trim(s), '\s+', ' ', 'g');
  RETURN s;
END;
$$;

-- ─── resolve_team_by_normalized_name RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION resolve_team_by_normalized_name(p_norm text)
RETURNS TABLE(id uuid, name text, norm_name text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, normalize_team_name(t.name) AS norm_name
  FROM teams t
  WHERE normalize_team_name(t.name) = p_norm
  LIMIT 1;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION normalize_team_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION resolve_team_by_normalized_name(text) TO authenticated, service_role;
