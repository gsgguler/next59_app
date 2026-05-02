/*
  # WC2026 Players Domain — Isolated World Cup Player Tables

  ## Purpose
  Create a completely independent player data domain exclusively for World Cup 2026.
  This data MUST NOT be connected to domestic league player tables, league models,
  B3 historical backbone, model_lab, calibration, or team_strength_ratings.

  ## New Tables

  ### wc2026_player_profiles
  - Canonical player record for each WC 2026 participant
  - Keyed by api_football_player_id
  - Stores personal metadata: name, age, birth, nationality, height, weight, photo
  - raw_payload stores full API response for later re-parsing
  - data_status: raw_imported → enriched → final

  ### wc2026_team_squads
  - Links players to their national team for WC 2026
  - References wc2026_player_profiles
  - squad_status: provisional → final
  - Source tracked via source_endpoint + source_checked_at

  ### wc2026_player_ingestion_status
  - Per-team ingestion coverage tracking
  - Tracks completeness of squad data per team
  - completeness_status: complete / partial / missing

  ## Security
  - RLS enabled on all three tables
  - Raw data (raw_payload) is admin-only via SELECT policy
  - Public read is restricted to safe display columns via separate future view
  - INSERT/UPDATE only via service_role (no authenticated user writes)

  ## Isolation Guarantee
  - No foreign keys to league player tables (none exist in this project)
  - No references to model_lab schema
  - No references to team_strength_ratings
  - No references to actual_outcomes or predictions
  - The only allowed external reference is to internal wc2026 team identifiers
    (provider_mappings entity_type='team') for optional future join — not enforced here
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_player_profiles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_player_profiles (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_player_id  integer     UNIQUE,          -- api-football /players response player.id
  player_name             text        NOT NULL,
  firstname               text,
  lastname                text,
  age                     integer,
  birth_date              date,
  birth_place             text,
  birth_country           text,
  nationality             text,
  height                  text,                        -- e.g. "183 cm"
  weight                  text,                        -- e.g. "78 kg"
  injured                 boolean     NOT NULL DEFAULT false,
  photo_url               text,
  raw_payload             jsonb       NOT NULL DEFAULT '{}',
  data_status             text        NOT NULL DEFAULT 'raw_imported',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wc2026_player_profiles ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admin full access to wc2026_player_profiles"
  ON public.wc2026_player_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Admin insert wc2026_player_profiles"
  ON public.wc2026_player_profiles FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admin update wc2026_player_profiles"
  ON public.wc2026_player_profiles FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_team_squads
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_team_squads (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_football_team_id        integer     NOT NULL,    -- api-football team ID for the national team
  api_football_player_id      integer,                 -- api-football player ID (may be null if unresolved)
  wc2026_player_profile_id    uuid        REFERENCES public.wc2026_player_profiles(id) ON DELETE CASCADE,
  player_name                 text        NOT NULL,
  position                    text,                    -- Goalkeeper / Defender / Midfielder / Attacker
  shirt_number                integer,
  squad_status                text        NOT NULL DEFAULT 'provisional',  -- provisional | final | withdrawn
  source_endpoint             text        NOT NULL DEFAULT '/players?league=1&season=2026',
  source_checked_at           timestamptz NOT NULL DEFAULT now(),
  raw_payload                 jsonb       NOT NULL DEFAULT '{}',
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_team_squads_team_id
  ON public.wc2026_team_squads (api_football_team_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_team_squads_player_id
  ON public.wc2026_team_squads (wc2026_player_profile_id);

-- Prevent duplicate player+team combination
CREATE UNIQUE INDEX IF NOT EXISTS uq_wc2026_squad_team_player
  ON public.wc2026_team_squads (api_football_team_id, api_football_player_id)
  WHERE api_football_player_id IS NOT NULL;

ALTER TABLE public.wc2026_team_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to wc2026_team_squads"
  ON public.wc2026_team_squads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Admin insert wc2026_team_squads"
  ON public.wc2026_team_squads FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admin update wc2026_team_squads"
  ON public.wc2026_team_squads FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_player_ingestion_status
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_player_ingestion_status (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id      uuid,                         -- references ingestion_runs(id), nullable for flexibility
  api_team_id           integer     NOT NULL,
  team_name             text        NOT NULL,
  player_count          integer     NOT NULL DEFAULT 0,
  has_positions         boolean     NOT NULL DEFAULT false,
  has_numbers           boolean     NOT NULL DEFAULT false,
  completeness_status   text        NOT NULL DEFAULT 'missing',  -- complete | partial | missing
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wc2026_ingestion_status_team_run
  ON public.wc2026_player_ingestion_status (api_team_id, ingestion_run_id)
  WHERE ingestion_run_id IS NOT NULL;

ALTER TABLE public.wc2026_player_ingestion_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to wc2026_player_ingestion_status"
  ON public.wc2026_player_ingestion_status FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Admin insert wc2026_player_ingestion_status"
  ON public.wc2026_player_ingestion_status FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Admin update wc2026_player_ingestion_status"
  ON public.wc2026_player_ingestion_status FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Revoke public execute — no anonymous access to these tables via RPC
-- (tables are only accessible via service_role or admin-authenticated reads)
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.wc2026_player_profiles FROM anon;
REVOKE ALL ON public.wc2026_team_squads FROM anon;
REVOKE ALL ON public.wc2026_player_ingestion_status FROM anon;
