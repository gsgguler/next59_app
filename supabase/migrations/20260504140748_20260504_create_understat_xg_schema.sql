/*
  # Understat xG ingest schema

  1. New tables (shared schema):
     - understat_matches_raw — raw scraped match data per league×season page
     - match_xg — canonical xG values linked to public.matches

  2. Leagues covered: EPL, La_liga, Bundesliga, Serie_A, Ligue_1, Eredivisie
     Seasons: 2020–2024 (Understat uses year = season start year)
     Süper Lig (T1) excluded — not covered by Understat.

  3. RLS: shared schema is accessible to service_role only;
     authenticated users get read-only access to match_xg via public view.
*/

-- ── Raw staging ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared.understat_matches_raw (
  id                   BIGSERIAL PRIMARY KEY,
  understat_match_id   INTEGER UNIQUE NOT NULL,
  league_slug          TEXT NOT NULL,
  season_year          INTEGER NOT NULL,
  match_date           DATE,
  home_team            TEXT,
  away_team            TEXT,
  home_xg              NUMERIC(5,2),
  away_xg              NUMERIC(5,2),
  home_goals           INTEGER,
  away_goals           INTEGER,
  raw_response         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at          TIMESTAMPTZ DEFAULT NOW(),
  is_processed         BOOLEAN DEFAULT FALSE,
  canonical_match_id   UUID REFERENCES public.matches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_understat_raw_league_season
  ON shared.understat_matches_raw (league_slug, season_year);
CREATE INDEX IF NOT EXISTS idx_understat_raw_date
  ON shared.understat_matches_raw (match_date);
CREATE INDEX IF NOT EXISTS idx_understat_raw_canonical
  ON shared.understat_matches_raw (canonical_match_id)
  WHERE canonical_match_id IS NOT NULL;

-- ── Canonical xG ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_xg (
  match_id    UUID PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  home_xg     NUMERIC(5,2) NOT NULL,
  away_xg     NUMERIC(5,2) NOT NULL,
  source      TEXT NOT NULL DEFAULT 'understat',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.match_xg ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read xg data"
  ON public.match_xg FOR SELECT
  TO authenticated
  USING (true);

-- ── RPC: map understat → matches and populate match_xg ───────────────────
CREATE OR REPLACE FUNCTION public.map_understat_to_matches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $$
DECLARE
  v_mapped   integer := 0;
  v_inserted integer := 0;
  v_skipped  integer := 0;
BEGIN
  -- Map by date + normalised team names via existing af_norm_name()
  -- league_slug → api_football_id mapping
  WITH slug_to_league AS (
    SELECT slug, af_id FROM (VALUES
      ('EPL',        39),
      ('La_liga',   140),
      ('Bundesliga',  78),
      ('Serie_A',   135),
      ('Ligue_1',    61),
      ('Eredivisie',  88)
    ) t(slug, af_id)
  ),
  candidates AS (
    SELECT
      u.id AS raw_id,
      u.understat_match_id,
      u.match_date,
      u.home_xg,
      u.away_xg,
      m.id AS match_id
    FROM shared.understat_matches_raw u
    JOIN slug_to_league sl ON sl.slug = u.league_slug
    JOIN public.competition_seasons cs
      ON cs.competition_id = (
          SELECT id FROM public.competitions WHERE api_football_id = sl.af_id LIMIT 1
         )
    JOIN public.seasons s ON s.id = cs.season_id AND s.year = u.season_year
    JOIN public.matches m ON m.competition_season_id = cs.id
      AND m.match_date = u.match_date
      AND af_norm_name((
            SELECT name FROM public.teams WHERE id = m.home_team_id
          )) = af_norm_name(u.home_team)
      AND af_norm_name((
            SELECT name FROM public.teams WHERE id = m.away_team_id
          )) = af_norm_name(u.away_team)
    WHERE u.canonical_match_id IS NULL
      AND u.home_xg IS NOT NULL
  )
  UPDATE shared.understat_matches_raw r
  SET canonical_match_id = c.match_id,
      is_processed = TRUE
  FROM candidates c
  WHERE r.id = c.raw_id;

  GET DIAGNOSTICS v_mapped = ROW_COUNT;

  -- Insert/update match_xg from mapped rows
  INSERT INTO public.match_xg (match_id, home_xg, away_xg, source, updated_at)
  SELECT
    u.canonical_match_id,
    u.home_xg,
    u.away_xg,
    'understat',
    NOW()
  FROM shared.understat_matches_raw u
  WHERE u.canonical_match_id IS NOT NULL
    AND u.home_xg IS NOT NULL
  ON CONFLICT (match_id) DO UPDATE
    SET home_xg = EXCLUDED.home_xg,
        away_xg = EXCLUDED.away_xg,
        updated_at = NOW();

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT COUNT(*) INTO v_skipped
  FROM shared.understat_matches_raw
  WHERE canonical_match_id IS NULL AND home_xg IS NOT NULL;

  RETURN jsonb_build_object(
    'mapped_raw_rows', v_mapped,
    'match_xg_upserted', v_inserted,
    'still_unmapped', v_skipped
  );
END;
$$;
