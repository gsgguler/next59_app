/*
  # Tournament Schema Hardening

  Additive migration to support international tournaments (FIFA World Cup, UEFA Euro,
  Champions League, Nations League, qualifiers) alongside existing domestic league schema.

  1. Modified Tables
    - `teams`
      - `team_type` (text, NOT NULL, default 'club') — distinguishes club vs national_team
      - `fifa_code` (text, nullable) — 3-letter FIFA code for national teams (TUR, GER, ENG, etc.)
    - `matches`
      - `stage` (text, nullable) — tournament stage (group_stage, round_of_16, final, etc.)
      - `group_name` (text, nullable) — group assignment (Group A, Group B, etc.)
    - `team_participations`
      - `stage` (text, nullable) — participation stage context
      - `group_name` (text, nullable) — group assignment for standings separation
    - `competition_seasons`
      - `host_countries` (text[], nullable) — multi-host tournament support (e.g., US/MX/CA)

  2. Constraint Changes
    - `teams`: CHECK constraint on team_type (club, national_team)
    - `teams`: UNIQUE constraint on fifa_code (nullable, partial)
    - `matches`: CHECK constraint on stage
    - `team_participations`: CHECK constraint on stage
    - `team_participations`: Old UNIQUE(team_id, competition_season_id) dropped
    - `team_participations`: New UNIQUE index on (team_id, competition_season_id, COALESCE(stage,''), COALESCE(group_name,''))

  3. Security
    - No RLS changes
    - No policy changes

  4. Important Notes
    - All existing teams default to team_type = 'club'
    - No existing data is modified except the team_type default backfill
    - All new columns are nullable (except team_type which has a default)
    - The team_participations table is currently empty, making constraint swap zero-risk
*/

-- ============================================================
-- 1. teams.team_type
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'team_type'
  ) THEN
    ALTER TABLE teams ADD COLUMN team_type text NOT NULL DEFAULT 'club';
    ALTER TABLE teams ADD CONSTRAINT teams_team_type_check
      CHECK (team_type IN ('club', 'national_team'));
  END IF;
END $$;

-- ============================================================
-- 2. teams.fifa_code
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'fifa_code'
  ) THEN
    ALTER TABLE teams ADD COLUMN fifa_code text;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_fifa_code
      ON teams (fifa_code) WHERE fifa_code IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 3. matches.stage
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'stage'
  ) THEN
    ALTER TABLE matches ADD COLUMN stage text;
    ALTER TABLE matches ADD CONSTRAINT matches_stage_check
      CHECK (stage IN (
        'group_stage', 'round_of_32', 'round_of_16',
        'quarter_final', 'semi_final', 'third_place', 'final',
        'league_phase', 'qualifier', 'playoff', 'friendly'
      ));
  END IF;
END $$;

-- ============================================================
-- 4. matches.group_name
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'group_name'
  ) THEN
    ALTER TABLE matches ADD COLUMN group_name text;
  END IF;
END $$;

-- ============================================================
-- 5. team_participations.stage
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_participations' AND column_name = 'stage'
  ) THEN
    ALTER TABLE team_participations ADD COLUMN stage text;
    ALTER TABLE team_participations ADD CONSTRAINT team_participations_stage_check
      CHECK (stage IN (
        'group_stage', 'round_of_32', 'round_of_16',
        'quarter_final', 'semi_final', 'third_place', 'final',
        'league_phase', 'qualifier', 'playoff', 'friendly'
      ));
  END IF;
END $$;

-- ============================================================
-- 6. team_participations.group_name
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'team_participations' AND column_name = 'group_name'
  ) THEN
    ALTER TABLE team_participations ADD COLUMN group_name text;
  END IF;
END $$;

-- ============================================================
-- 7. competition_seasons.host_countries
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'competition_seasons' AND column_name = 'host_countries'
  ) THEN
    ALTER TABLE competition_seasons ADD COLUMN host_countries text[];
  END IF;
END $$;

-- ============================================================
-- 8. Replace team_participations unique constraint
-- ============================================================
-- Drop old constraint (safe: table is empty, no FKs reference it)
ALTER TABLE team_participations
  DROP CONSTRAINT IF EXISTS team_participations_team_id_competition_season_id_key;

-- Create new unique index with COALESCE to handle NULLs deterministically
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_participations_season_stage_group
  ON team_participations (
    team_id,
    competition_season_id,
    COALESCE(stage, ''),
    COALESCE(group_name, '')
  );

-- ============================================================
-- 9. Indexes for new columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_teams_team_type ON teams (team_type);
CREATE INDEX IF NOT EXISTS idx_teams_fifa_code ON teams (fifa_code) WHERE fifa_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_stage ON matches (stage) WHERE stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_group_name ON matches (group_name) WHERE group_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tp_stage ON team_participations (stage) WHERE stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tp_group_name ON team_participations (group_name) WHERE group_name IS NOT NULL;
