/*
  # Fix mapping engine v3: dual-norm matching + Bayern München season variance

  ## Problem
  - Single alias replaces norm, preventing direct matches in other seasons
    e.g. 'Bayern Munich' alias → 'bayern munchen' works for 2024 but breaks 2023
    where AF uses 'Bayern Munich' directly (no umlaut)
  - FC Heidenheim alias was wrong ('1 fc heidenheim 1846' vs actual 'fc heidenheim')

  ## Fix
  - Engine now tries BOTH the alias norm AND the original db norm for each team
  - This means Bayern Munich matches directly in 2023 AND via alias in 2024
  - Add Bayern Munich alias back (needed for 2024)
*/

-- Add Bayern Munich alias back (needed for season 2024 where AF uses Bayern München)
INSERT INTO public.af_team_aliases (league_id, db_norm, af_norm)
VALUES (78, 'bayern munich', 'bayern munchen')
ON CONFLICT (league_id, db_norm) DO UPDATE SET af_norm = EXCLUDED.af_norm;

-- Replace engine: try both alias norm and raw db norm
CREATE OR REPLACE FUNCTION public.af_run_fixture_mapping()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_verified     integer := 0;
  v_candidate    integer := 0;
  v_needs_review integer := 0;
  v_not_found    integer := 0;
  v_written      integer := 0;
  v_mappings     integer := 0;
  v_league_stats jsonb   := '[]'::jsonb;
BEGIN

-- ── Step 1: Expand raw fixture JSON ──────────────────────────────────────────
CREATE TEMP TABLE IF NOT EXISTS _af_fix (
  af_fixture_id  integer,
  af_league_id   integer,
  af_season      integer,
  af_date        date,
  af_home_norm   text,
  af_away_norm   text,
  af_home_raw    text,
  af_away_raw    text
) ON COMMIT DROP;
TRUNCATE _af_fix;

INSERT INTO _af_fix
SELECT
  (fix->>'fixture_id')::integer,
  r.league_id,
  r.season,
  (fix->>'date')::date,
  af_norm_name(fix->>'home_team'),
  af_norm_name(fix->>'away_team'),
  fix->>'home_team',
  fix->>'away_team'
FROM public.api_football_fixture_probe_raw r,
LATERAL (
  SELECT jsonb_build_object(
    'fixture_id', (elem->'fixture'->>'id'),
    'date',       left(elem->'fixture'->>'date', 10),
    'home_team',  elem->'teams'->'home'->>'name',
    'away_team',  elem->'teams'->'away'->>'name'
  ) AS fix
  FROM jsonb_array_elements(r.response_json->'fixtures') AS elem
) sub
WHERE r.transform_status = 'full'
  AND r.response_json ? 'fixtures'
  AND (fix->>'fixture_id') IS NOT NULL
  AND (fix->>'date') IS NOT NULL;

-- ── Step 2: DB match scope — store both raw norm AND alias norm ───────────────
CREATE TEMP TABLE IF NOT EXISTS _db_scope (
  match_id       uuid,
  match_date     date,
  home_norm_raw  text,   -- af_norm_name(team_name) directly
  away_norm_raw  text,
  home_norm_ali  text,   -- alias if exists, otherwise same as raw
  away_norm_ali  text,
  home_raw       text,
  away_raw       text,
  af_league_id   integer,
  af_season      integer
) ON COMMIT DROP;
TRUNCATE _db_scope;

INSERT INTO _db_scope
SELECT
  m.id,
  m.match_date,
  af_norm_name(ht.name),
  af_norm_name(at.name),
  COALESCE(ha.af_norm, af_norm_name(ht.name)),
  COALESCE(aa.af_norm, af_norm_name(at.name)),
  ht.name,
  at.name,
  c.api_football_id,
  s.year
FROM public.matches m
JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
JOIN public.competitions c         ON c.id  = cs.competition_id
JOIN public.seasons s              ON s.id  = cs.season_id
JOIN public.teams ht               ON ht.id = m.home_team_id
JOIN public.teams at               ON at.id = m.away_team_id
LEFT JOIN public.af_team_aliases ha
  ON ha.league_id = c.api_football_id AND ha.db_norm = af_norm_name(ht.name)
LEFT JOIN public.af_team_aliases aa
  ON aa.league_id = c.api_football_id AND aa.db_norm = af_norm_name(at.name)
WHERE c.api_football_id IN (39,140,135,78,61,88,203)
  AND s.year BETWEEN 2019 AND 2024
  AND m.api_football_fixture_id IS NULL;

-- ── Step 3: Exact date + teams → verified (try alias norm first, then raw norm) ─
CREATE TEMP TABLE IF NOT EXISTS _results (
  match_id      uuid,
  af_fixture_id integer,
  af_league_id  integer,
  af_season     integer,
  af_date       date,
  af_home_raw   text,
  af_away_raw   text,
  status        text,
  reason        text,
  confidence    numeric
) ON COMMIT DROP;
TRUNCATE _results;

-- Pass 1: exact date + alias norm
INSERT INTO _results
SELECT DISTINCT ON (db.match_id)
  db.match_id, af.af_fixture_id, af.af_league_id, af.af_season,
  af.af_date, af.af_home_raw, af.af_away_raw,
  'verified', 'exact_date+alias', 1.0
FROM _db_scope db
JOIN _af_fix af
  ON  af.af_league_id = db.af_league_id
  AND af.af_season    = db.af_season
  AND af.af_date      = db.match_date
  AND af.af_home_norm = db.home_norm_ali
  AND af.af_away_norm = db.away_norm_ali
ORDER BY db.match_id, af.af_fixture_id;

-- Pass 2: exact date + raw norm (catches teams where alias = raw, and cross-season variances)
INSERT INTO _results
SELECT DISTINCT ON (db.match_id)
  db.match_id, af.af_fixture_id, af.af_league_id, af.af_season,
  af.af_date, af.af_home_raw, af.af_away_raw,
  'verified', 'exact_date+raw_norm', 1.0
FROM _db_scope db
JOIN _af_fix af
  ON  af.af_league_id = db.af_league_id
  AND af.af_season    = db.af_season
  AND af.af_date      = db.match_date
  AND af.af_home_norm = db.home_norm_raw
  AND af.af_away_norm = db.away_norm_raw
WHERE NOT EXISTS (SELECT 1 FROM _results r WHERE r.match_id = db.match_id)
ORDER BY db.match_id, af.af_fixture_id;

-- ±1 day fallback → candidate (try alias norm)
INSERT INTO _results
SELECT DISTINCT ON (db.match_id)
  db.match_id, af.af_fixture_id, af.af_league_id, af.af_season,
  af.af_date, af.af_home_raw, af.af_away_raw,
  'candidate', 'date_±1day+alias', 0.8
FROM _db_scope db
JOIN _af_fix af
  ON  af.af_league_id = db.af_league_id
  AND af.af_season    = db.af_season
  AND af.af_date      BETWEEN db.match_date - 1 AND db.match_date + 1
  AND af.af_home_norm = db.home_norm_ali
  AND af.af_away_norm = db.away_norm_ali
WHERE NOT EXISTS (SELECT 1 FROM _results r WHERE r.match_id = db.match_id)
ORDER BY db.match_id, af.af_date ASC, af.af_fixture_id;

-- ±1 day fallback → candidate (try raw norm)
INSERT INTO _results
SELECT DISTINCT ON (db.match_id)
  db.match_id, af.af_fixture_id, af.af_league_id, af.af_season,
  af.af_date, af.af_home_raw, af.af_away_raw,
  'candidate', 'date_±1day+raw_norm', 0.8
FROM _db_scope db
JOIN _af_fix af
  ON  af.af_league_id = db.af_league_id
  AND af.af_season    = db.af_season
  AND af.af_date      BETWEEN db.match_date - 1 AND db.match_date + 1
  AND af.af_home_norm = db.home_norm_raw
  AND af.af_away_norm = db.away_norm_raw
WHERE NOT EXISTS (SELECT 1 FROM _results r WHERE r.match_id = db.match_id)
ORDER BY db.match_id, af.af_date ASC, af.af_fixture_id;

-- Collision → needs_review
UPDATE _results r
SET status = 'needs_review', reason = 'af_fixture_id_collision',
    confidence = 0.5, match_id = NULL
WHERE af_fixture_id IN (
  SELECT af_fixture_id FROM _results GROUP BY af_fixture_id HAVING COUNT(*) > 1
);

SELECT
  COUNT(*) FILTER (WHERE status = 'verified'),
  COUNT(*) FILTER (WHERE status = 'candidate'),
  COUNT(*) FILTER (WHERE status = 'needs_review')
INTO v_verified, v_candidate, v_needs_review
FROM _results;

SELECT COUNT(*) INTO v_not_found
FROM _db_scope db
WHERE NOT EXISTS (SELECT 1 FROM _results r WHERE r.match_id = db.match_id);

INSERT INTO public.af_fixture_mappings (
  match_id, af_fixture_id, af_league_id, af_season,
  af_date, af_home_team, af_away_team,
  mapping_status, confidence, match_reason, updated_at
)
SELECT
  match_id, af_fixture_id, af_league_id, af_season,
  af_date, af_home_raw, af_away_raw,
  status, confidence, reason, now()
FROM _results
ON CONFLICT (af_fixture_id) DO UPDATE SET
  match_id       = EXCLUDED.match_id,
  mapping_status = EXCLUDED.mapping_status,
  confidence     = EXCLUDED.confidence,
  match_reason   = EXCLUDED.match_reason,
  updated_at     = now();
GET DIAGNOSTICS v_mappings = ROW_COUNT;

UPDATE public.matches m
SET api_football_fixture_id = r.af_fixture_id
FROM _results r
WHERE r.match_id = m.id
  AND r.status = 'verified'
  AND m.api_football_fixture_id IS NULL;
GET DIAGNOSTICS v_written = ROW_COUNT;

SELECT jsonb_agg(row_to_json(ls))
INTO v_league_stats
FROM (
  SELECT
    c.name AS league,
    c.api_football_id AS af_id,
    COUNT(DISTINCT db.match_id) AS db_matches,
    COUNT(DISTINCT mr.af_fixture_id) AS af_matched,
    COUNT(*) FILTER (WHERE mr.status = 'verified') AS verified,
    COUNT(*) FILTER (WHERE mr.status = 'candidate') AS candidate,
    COUNT(*) FILTER (WHERE mr.status = 'needs_review') AS needs_review,
    COUNT(db.match_id) FILTER (
      WHERE NOT EXISTS (SELECT 1 FROM _results mr2 WHERE mr2.match_id = db.match_id)
    ) AS not_found,
    round(
      COUNT(*) FILTER (WHERE mr.status = 'verified') * 100.0
      / NULLIF(COUNT(DISTINCT db.match_id), 0), 1
    )::text || '%' AS mapped_pct
  FROM _db_scope db
  JOIN public.competitions c ON c.api_football_id = db.af_league_id
  LEFT JOIN _results mr ON mr.match_id = db.match_id
  GROUP BY c.name, c.api_football_id
  ORDER BY c.name
) ls;

RETURN jsonb_build_object(
  'overall', jsonb_build_object(
    'total_db_matches',   (SELECT COUNT(*) FROM _db_scope),
    'verified',           v_verified,
    'candidate',          v_candidate,
    'needs_review',       v_needs_review,
    'not_found',          v_not_found,
    'fixture_id_written', v_written,
    'mappings_upserted',  v_mappings
  ),
  'by_league', v_league_stats,
  'safety', jsonb_build_object(
    'scores_changed',        false,
    'match_stats_changed',   false,
    'model_lab_touched',     false,
    'predictions_created',   0,
    'odds_endpoints_called', false,
    'wc_history_touched',    false
  )
);
END;
$$;
