/*
  # Create team_strength_ratings table

  1. New Tables
    - `team_strength_ratings`
      - `id` (uuid, primary key)
      - `team_id` (uuid, FK to teams)
      - `provider_name` (text, default 'api-football')
      - `rating_scope` (text, e.g. 'national_team_recent')
      - `rating_version` (text, default 'wc2026_v1')
      - `elo_rating` (numeric, default 1500)
      - `form_score` (numeric, default 0)
      - `attack_score` (numeric, nullable)
      - `defense_score` (numeric, nullable)
      - `market_score` (numeric, nullable)
      - `venue_score` (numeric, nullable)
      - `match_count` (integer, default 0)
      - `last_match_at` (timestamptz, nullable)
      - `data_window_start` (date, nullable)
      - `data_window_end` (date, nullable)
      - `confidence_score` (numeric, default 0, range 0-1)
      - `metadata` (jsonb, default '{}')
      - `created_at`, `updated_at` (timestamptz)

  2. Constraints
    - UNIQUE on (team_id, provider_name, rating_scope, rating_version)
    - CHECK confidence_score between 0 and 1
    - CHECK match_count >= 0

  3. Security
    - RLS enabled
    - service_role full access via existing pattern
    - authenticated users can SELECT only
    - anon no access
*/

CREATE TABLE IF NOT EXISTS team_strength_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  provider_name text NOT NULL DEFAULT 'api-football',
  rating_scope text NOT NULL,
  rating_version text NOT NULL DEFAULT 'wc2026_v1',
  elo_rating numeric NOT NULL DEFAULT 1500,
  form_score numeric NOT NULL DEFAULT 0,
  attack_score numeric,
  defense_score numeric,
  market_score numeric,
  venue_score numeric,
  match_count integer NOT NULL DEFAULT 0,
  last_match_at timestamptz,
  data_window_start date,
  data_window_end date,
  confidence_score numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tsr_confidence_range CHECK (confidence_score >= 0 AND confidence_score <= 1),
  CONSTRAINT tsr_match_count_positive CHECK (match_count >= 0),
  CONSTRAINT tsr_unique_team_scope UNIQUE (team_id, provider_name, rating_scope, rating_version)
);

CREATE INDEX IF NOT EXISTS idx_tsr_team_id ON team_strength_ratings(team_id);
CREATE INDEX IF NOT EXISTS idx_tsr_rating_value ON team_strength_ratings(elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_tsr_rated_at ON team_strength_ratings(updated_at DESC);

ALTER TABLE team_strength_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on team_strength_ratings"
  ON team_strength_ratings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read team_strength_ratings"
  ON team_strength_ratings
  FOR SELECT
  TO authenticated
  USING (true);
