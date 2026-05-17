
/*
  # Upcoming Match Readiness Layer — Phase 1

  ## Purpose
  Operational readiness assessment table for upcoming fixtures. For every match
  that needs a prediction, this table records exactly what data is available,
  what is missing, and whether the match is cleared for prediction generation.

  ## New Table: model_lab.upcoming_match_readiness

  ### Core identity
  - match_id            — FK to public.matches
  - competition_name    — denormalized for display
  - season_label        — denormalized for display
  - match_date          — date of the fixture
  - kickoff_utc         — derived from matches.timestamp (to_timestamp)
  - home_team_name      — denormalized from teams.name
  - away_team_name      — denormalized from teams.name

  ### Readiness dimensions
  - elo_readiness           — both teams have ELO ratings as of assessment date
  - feature_readiness       — feature matrix row exists (any tier)
  - calibration_readiness   — league_calibration_state row exists for competition
  - lineup_availability     — AF lineup data fetched for this fixture
  - stats_availability      — AF statistics data fetched for this fixture
  - prediction_readiness    — prediction draft exists (any status)
  - scenario_readiness      — match_story_draft exists for this match

  ### Quality metadata
  - feature_quality_tier    — 'elo_only' | 'elo_form' | 'elo_form_stats'
  - elo_home                — latest home ELO at assessment time
  - elo_away                — latest away ELO at assessment time
  - home_l5_available       — L5 matches available in feature matrix
  - away_l5_available       — L5 matches available in feature matrix
  - calibration_brier_l50   — rolling Brier from league_calibration_state
  - prediction_status       — denormalized from prematch_prediction_drafts.status
  - warnings                — array of human-readable warning strings

  ### Operational fields
  - overall_status          — 'ready' | 'partial' | 'blocked'
  - blocking_reasons        — array of strings explaining blockers
  - assessed_at             — when this row was computed
  - assessment_version      — version slug for the assessment function

  ## Security
  - RLS enabled; authenticated users can read
  - Service role can insert/update via function
*/

CREATE TABLE IF NOT EXISTS model_lab.upcoming_match_readiness (
  match_id                  uuid        PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  competition_name          text        NOT NULL,
  season_label              text,
  match_date                date        NOT NULL,
  kickoff_utc               timestamptz,
  home_team_name            text        NOT NULL,
  away_team_name            text        NOT NULL,

  -- Readiness dimensions (boolean flags)
  elo_readiness             boolean     NOT NULL DEFAULT false,
  feature_readiness         boolean     NOT NULL DEFAULT false,
  calibration_readiness     boolean     NOT NULL DEFAULT false,
  lineup_availability       boolean     NOT NULL DEFAULT false,
  stats_availability        boolean     NOT NULL DEFAULT false,
  prediction_readiness      boolean     NOT NULL DEFAULT false,
  scenario_readiness        boolean     NOT NULL DEFAULT false,

  -- Quality metadata
  feature_quality_tier      text,
  elo_home                  numeric,
  elo_away                  numeric,
  home_l5_available         smallint    DEFAULT 0,
  away_l5_available         smallint    DEFAULT 0,
  calibration_brier_l50     numeric,
  prediction_status         text,
  warnings                  text[]      NOT NULL DEFAULT '{}',

  -- Operational status
  overall_status            text        NOT NULL DEFAULT 'blocked'
                              CHECK (overall_status IN ('ready', 'partial', 'blocked')),
  blocking_reasons          text[]      NOT NULL DEFAULT '{}',

  -- Timestamps
  assessed_at               timestamptz NOT NULL DEFAULT now(),
  assessment_version        text        NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_umr_competition ON model_lab.upcoming_match_readiness(competition_name);
CREATE INDEX IF NOT EXISTS idx_umr_match_date   ON model_lab.upcoming_match_readiness(match_date);
CREATE INDEX IF NOT EXISTS idx_umr_status       ON model_lab.upcoming_match_readiness(overall_status);
CREATE INDEX IF NOT EXISTS idx_umr_assessed_at  ON model_lab.upcoming_match_readiness(assessed_at DESC);

ALTER TABLE model_lab.upcoming_match_readiness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read readiness assessments"
  ON model_lab.upcoming_match_readiness FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON model_lab.upcoming_match_readiness TO authenticated;
