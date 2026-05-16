/*
  # ELO Engine V1 — Storage Schema

  ## Summary
  Creates the canonical ELO V1 snapshot table and supporting structures
  for the calibration backbone. Non-destructive: existing match_elo_snapshots,
  team_elo_ratings, and elo_computation_runs tables are untouched.

  ## New Tables
  - model_lab.team_elo_snapshots
      Immutable one-row-per-match-per-elo_version snapshot store.
      Contains full pre/post ELO state, expected scores, and all
      computation parameters used — enabling exact reproducibility.

  ## Design Rules
  - Unique on (match_id, elo_version): no overwrite, append-only per version
  - All numeric fields use numeric(10,4) for precision
  - elo_version column is the versioning gate for future parameter sweeps
  - RLS enabled; admin-only write, authenticated read

  ## Security
  - RLS enabled (restrictive)
  - SELECT: authenticated users
  - INSERT/UPDATE/DELETE: service_role only (admin computation)
*/

-- ============================================================
-- TABLE: model_lab.team_elo_snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS model_lab.team_elo_snapshots (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Match identity
  match_id                uuid        NOT NULL,
  competition_id          uuid        NOT NULL,
  competition_name        text        NOT NULL,
  season_label            text        NOT NULL,
  match_date              date        NOT NULL,
  home_team_id            uuid        NOT NULL,
  away_team_id            uuid        NOT NULL,
  home_team_name          text        NOT NULL,
  away_team_name          text        NOT NULL,

  -- Outcome (labels only — not used as features)
  home_score_ft           integer     NOT NULL,
  away_score_ft           integer     NOT NULL,
  result_1x2              text        NOT NULL CHECK (result_1x2 IN ('H', 'D', 'A')),

  -- Pre-match ELO (raw — before home advantage applied to expected calc)
  pre_match_elo_home      numeric(10,4) NOT NULL,
  pre_match_elo_away      numeric(10,4) NOT NULL,

  -- Post-match ELO (after delta applied)
  post_match_elo_home     numeric(10,4) NOT NULL,
  post_match_elo_away     numeric(10,4) NOT NULL,

  -- Deltas
  elo_delta_home          numeric(10,4) NOT NULL,
  elo_delta_away          numeric(10,4) NOT NULL,

  -- Expected scores (home advantage baked in)
  expected_home           numeric(10,6) NOT NULL CHECK (expected_home > 0 AND expected_home < 1),
  expected_away           numeric(10,6) NOT NULL CHECK (expected_away > 0 AND expected_away < 1),

  -- Computation parameters (for full reproducibility)
  home_advantage_applied  numeric(8,2)  NOT NULL,
  k_factor                numeric(8,2)  NOT NULL,
  goal_diff_multiplier    numeric(6,4)  NOT NULL,

  -- Version gate
  elo_version             text          NOT NULL DEFAULT 'elo_v1_domestic_2026_05',

  -- Audit
  generated_at            timestamptz   NOT NULL DEFAULT now(),

  -- Immutability: one row per match per version
  CONSTRAINT uq_team_elo_snapshots_match_version
    UNIQUE (match_id, elo_version)
);

-- Indexes for fast lookup patterns needed in feature engineering
CREATE INDEX IF NOT EXISTS idx_tes_match_date
  ON model_lab.team_elo_snapshots (match_date);

CREATE INDEX IF NOT EXISTS idx_tes_competition
  ON model_lab.team_elo_snapshots (competition_id, match_date);

CREATE INDEX IF NOT EXISTS idx_tes_home_team
  ON model_lab.team_elo_snapshots (home_team_id, match_date);

CREATE INDEX IF NOT EXISTS idx_tes_away_team
  ON model_lab.team_elo_snapshots (away_team_id, match_date);

CREATE INDEX IF NOT EXISTS idx_tes_elo_version
  ON model_lab.team_elo_snapshots (elo_version, match_date);

-- RLS
ALTER TABLE model_lab.team_elo_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ELO snapshots"
  ON model_lab.team_elo_snapshots
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant read to authenticated via PostgREST
GRANT SELECT ON model_lab.team_elo_snapshots TO authenticated;
