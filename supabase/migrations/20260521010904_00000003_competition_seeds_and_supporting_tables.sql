/*
  # Competition Seeds, Provider Registry & Ensemble Snapshots

  1. Schema Changes
    - Add af_league_id, af_season_year columns to competition_seasons
    - Add tier column to competitions
    - Create provider_mappings, ingestion_runs, ensemble_prediction_snapshots tables

  2. Seed Data
    - Providers (api_football, understat, fbref, open_football) using correct type enum
    - 7 league competitions with api_football_id
    - 7 competition_seasons for 2025-26 with fixed UUIDs matching af-live-result-sync

  3. Security
    - RLS on all new tables
*/

-- ─── Extend competition_seasons ───────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competition_seasons' AND column_name = 'af_league_id') THEN
    ALTER TABLE competition_seasons ADD COLUMN af_league_id int;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competition_seasons' AND column_name = 'af_season_year') THEN
    ALTER TABLE competition_seasons ADD COLUMN af_season_year int;
  END IF;
END $$;

-- ─── Extend competitions ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitions' AND column_name = 'tier') THEN
    ALTER TABLE competitions ADD COLUMN tier int NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ─── Seed providers (type enum: live | historical | static) ──────────────────

INSERT INTO providers (name, slug, type, config_json)
VALUES
  ('API-Football', 'api_football',  'live',       '{"base_url":"https://v3.football.api-sports.io","rate_limit_rpm":60}'),
  ('Understat',    'understat',     'historical', '{"base_url":"https://understat.com","rate_limit_rpm":30}'),
  ('FBref',        'fbref',         'historical', '{"base_url":"https://fbref.com","rate_limit_rpm":20}'),
  ('OpenFootball', 'open_football', 'static',     '{"base_url":"https://raw.githubusercontent.com","rate_limit_rpm":0}')
ON CONFLICT (slug) DO NOTHING;

-- ─── provider_mappings ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_mappings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         uuid NOT NULL REFERENCES providers(id),
  entity_type         text NOT NULL CHECK (entity_type IN ('team','competition','venue','player')),
  provider_entity_id  text NOT NULL,
  canonical_id        uuid NOT NULL,
  confidence          numeric(3,2) NOT NULL DEFAULT 1.0,
  is_verified         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, entity_type, provider_entity_id)
);

ALTER TABLE provider_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "provider_mappings authenticated read"
  ON provider_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "provider_mappings service insert"
  ON provider_mappings FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "provider_mappings service update"
  ON provider_mappings FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── ingestion_runs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug    text NOT NULL,
  run_type         text NOT NULL,
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  records_fetched  int NOT NULL DEFAULT 0,
  records_stored   int NOT NULL DEFAULT 0,
  errors_json      jsonb NOT NULL DEFAULT '[]',
  started_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_runs authenticated read"
  ON ingestion_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ingestion_runs service insert"
  ON ingestion_runs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "ingestion_runs service update"
  ON ingestion_runs FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── ensemble_prediction_snapshots ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ensemble_prediction_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  snapshot_type       text NOT NULL DEFAULT 'prematch' CHECK (snapshot_type IN ('prematch','live','halftime')),
  model_version_key   text NOT NULL DEFAULT 'b3_temp160',
  win_prob_home       numeric(5,4) NOT NULL,
  draw_prob           numeric(5,4) NOT NULL,
  win_prob_away       numeric(5,4) NOT NULL,
  confidence          numeric(5,4),
  predicted_result    text CHECK (predicted_result IN ('H','D','A')),
  actual_result       text CHECK (actual_result IN ('H','D','A')),
  was_correct         boolean,
  brier_score         numeric(6,4),
  is_locked           boolean NOT NULL DEFAULT false,
  narrative_draft     text,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, snapshot_type, model_version_key)
);

CREATE INDEX IF NOT EXISTS idx_eps_match_id ON ensemble_prediction_snapshots(match_id);
CREATE INDEX IF NOT EXISTS idx_eps_snapshot_type ON ensemble_prediction_snapshots(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_eps_locked ON ensemble_prediction_snapshots(is_locked) WHERE is_locked = true;
CREATE INDEX IF NOT EXISTS idx_eps_created_at ON ensemble_prediction_snapshots(created_at DESC);

ALTER TABLE ensemble_prediction_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ensemble_prediction_snapshots public read locked"
  ON ensemble_prediction_snapshots FOR SELECT
  TO anon, authenticated
  USING (is_locked = true);

CREATE POLICY "ensemble_prediction_snapshots admin read all"
  ON ensemble_prediction_snapshots FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "ensemble_prediction_snapshots service insert"
  ON ensemble_prediction_snapshots FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "ensemble_prediction_snapshots service update"
  ON ensemble_prediction_snapshots FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- ─── Seed countries ───────────────────────────────────────────────────────────

INSERT INTO countries (name, iso2, iso3)
VALUES
  ('England',     'GB-ENG', 'ENG'),
  ('France',      'FR',     'FRA'),
  ('Germany',     'DE',     'DEU'),
  ('Netherlands', 'NL',     'NLD'),
  ('Italy',       'IT',     'ITA'),
  ('Spain',       'ES',     'ESP'),
  ('Turkey',      'TR',     'TUR')
ON CONFLICT (iso2) DO NOTHING;

-- ─── Seed competitions (competition_type enum values) ─────────────────────────

INSERT INTO competitions (name, slug, competition_type, api_football_id, tier, country_id)
SELECT
  c.comp_name,
  c.comp_slug,
  'domestic_league',
  c.af_id,
  1,
  countries.id
FROM (VALUES
  ('Premier League', 'premier-league', 39,  'GB-ENG'),
  ('Ligue 1',        'ligue-1',        61,  'FR'),
  ('Bundesliga',     'bundesliga',     78,  'DE'),
  ('Eredivisie',     'eredivisie',     88,  'NL'),
  ('Serie A',        'serie-a',        135, 'IT'),
  ('La Liga',        'la-liga',        140, 'ES'),
  ('Süper Lig',      'super-lig',      203, 'TR')
) AS c(comp_name, comp_slug, af_id, iso2)
JOIN countries ON countries.iso2 = c.iso2
ON CONFLICT (slug) DO UPDATE SET
  api_football_id = EXCLUDED.api_football_id,
  tier = EXCLUDED.tier;

-- ─── Seed competition_seasons for 2025-26 ────────────────────────────────────
-- Uses fixed UUIDs that match the hardcoded cs_id values in af-live-result-sync

INSERT INTO competition_seasons (id, competition_id, season_label, season_code, af_league_id, af_season_year, start_date, end_date, is_current)
SELECT
  cs.fixed_id::uuid,
  competitions.id,
  '2025-26',
  '2025',
  cs.af_league_id,
  2025,
  '2025-08-01',
  '2026-06-30',
  true
FROM (VALUES
  ('f0f5f43c-55c4-44a1-9ca6-dbed10460097', 'premier-league', 39),
  ('96b68baf-5368-43ed-93d4-05720a45a843', 'ligue-1',        61),
  ('dff96a19-a77a-42ae-bf04-bae1098e8411', 'bundesliga',     78),
  ('09af551c-9bae-48ed-aa01-28a328f0d5cb', 'eredivisie',     88),
  ('160eb576-5b10-4803-be2c-e92eeb4afd82', 'serie-a',        135),
  ('60b9c7ec-ae43-4986-98e8-77ac6de3c3f2', 'la-liga',        140),
  ('fb898419-630e-439c-a709-003b9ac3bb34', 'super-lig',      203)
) AS cs(fixed_id, comp_slug, af_league_id)
JOIN competitions ON competitions.slug = cs.comp_slug
ON CONFLICT (id) DO UPDATE SET
  af_league_id   = EXCLUDED.af_league_id,
  af_season_year = EXCLUDED.af_season_year,
  is_current     = true;
