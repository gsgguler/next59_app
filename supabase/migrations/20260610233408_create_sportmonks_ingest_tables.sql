-- wc2026_sportmonks_id_map: maps local IDs to Sportmonks IDs for match 1 only
CREATE TABLE IF NOT EXISTS wc2026_sportmonks_id_map (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      text NOT NULL, -- 'fixture' | 'team'
  local_fixture_id uuid REFERENCES wc2026_fixtures(id) ON DELETE SET NULL,
  local_team_id    uuid,
  api_football_fixture_id bigint,
  api_football_team_id    bigint,
  sportmonks_id    bigint NOT NULL,
  sportmonks_name  text,
  confidence       numeric DEFAULT 1.0,
  source           text DEFAULT 'auto',
  raw_json         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wc2026_sportmonks_id_map_entity_type_sm_id
  ON wc2026_sportmonks_id_map (entity_type, sportmonks_id);

ALTER TABLE wc2026_sportmonks_id_map ENABLE ROW LEVEL SECURITY;
-- Internal-only: no public SELECT policy

-- wc2026_sportmonks_ingest_runs: audit log per action invocation
CREATE TABLE IF NOT EXISTS wc2026_sportmonks_ingest_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_number         int,
  fixture_id           uuid REFERENCES wc2026_fixtures(id) ON DELETE SET NULL,
  action               text NOT NULL,
  status               text NOT NULL DEFAULT 'started', -- started | ok | error
  started_at           timestamptz NOT NULL DEFAULT now(),
  completed_at         timestamptz,
  rows_inserted        int DEFAULT 0,
  rows_updated         int DEFAULT 0,
  error_text           text,
  raw_response_summary jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wc2026_sportmonks_ingest_runs ENABLE ROW LEVEL SECURITY;
-- Internal-only: no public SELECT policy

-- Add Sportmonks-specific columns to wc2026_market_odds_snapshots
ALTER TABLE wc2026_market_odds_snapshots
  ADD COLUMN IF NOT EXISTS sportmonks_fixture_id bigint,
  ADD COLUMN IF NOT EXISTS bookmaker_id          bigint,
  ADD COLUMN IF NOT EXISTS bookmaker_name        text,
  ADD COLUMN IF NOT EXISTS margin                numeric,
  ADD COLUMN IF NOT EXISTS internal_only         boolean NOT NULL DEFAULT true;
