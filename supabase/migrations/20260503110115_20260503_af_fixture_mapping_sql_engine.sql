/*
  # API-Football Fixture Mapping — SQL Engine

  Performs the full Phase 1 fixture ID mapping entirely in-database against
  the already-stored raw fixture JSON in api_football_fixture_probe_raw.

  Strategy:
  1. Expand raw fixture JSON arrays into a temp working set
  2. Join against public.matches on league + season + date + normalized team names
  3. Write verified matches.api_football_fixture_id (exact date+team match only)
  4. Write af_fixture_mappings for verified + candidate + needs_review rows

  Name normalization: lower + remove accents + collapse non-alphanumeric to space.
  This runs entirely server-side, no API calls, no timeout risk.
*/

-- ── Helper: normalize team name for matching ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.af_norm_name(s text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT regexp_replace(
    lower(
      translate(s,
        'àáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞ',
        'aaaaaaaceeeeiiiidnoooouuuuytÿaaaaaaaceeeeiiiidnoooouuuuyt'
      )
    ),
    '[^a-z0-9]+', ' ', 'g'
  );
$$;

-- ── Main mapping function ─────────────────────────────────────────────────────
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
  rec            record;
BEGIN

  -- ── Step 1: Expand raw fixture JSON into a temp table ──────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _af_fixtures_expanded (
    af_fixture_id  integer,
    af_league_id   integer,
    af_season      integer,
    af_date        date,
    af_home_norm   text,
    af_away_norm   text,
    af_home_raw    text,
    af_away_raw    text
  ) ON COMMIT DROP;

  TRUNCATE _af_fixtures_expanded;

  INSERT INTO _af_fixtures_expanded
  SELECT
    (f->>'fixture_id')::integer,
    r.league_id,
    r.season,
    (f->>'date')::date,
    af_norm_name(f->>'home_team'),
    af_norm_name(f->>'away_team'),
    f->>'home_team',
    f->>'away_team'
  FROM public.api_football_fixture_probe_raw r,
  LATERAL (
    SELECT
      jsonb_build_object(
        'fixture_id', (fix->'fixture'->>'id'),
        'date',       (fix->'fixture'->>'date')::text,
        'home_team',  fix->'teams'->'home'->>'name',
        'away_team',  fix->'teams'->'away'->>'name'
      ) AS f
    FROM jsonb_array_elements(r.response_json->'fixtures') AS fix
  ) sub
  WHERE r.transform_status = 'full'
    AND r.response_json ? 'fixtures'
    AND (f->>'fixture_id') IS NOT NULL
    AND (f->>'date') IS NOT NULL;

  -- ── Step 2: Build DB match set in scope ────────────────────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _db_matches_scope (
    match_id       uuid,
    match_date     date,
    home_norm      text,
    away_norm      text,
    home_raw       text,
    away_raw       text,
    af_league_id   integer,
    af_season      integer
  ) ON COMMIT DROP;

  TRUNCATE _db_matches_scope;

  INSERT INTO _db_matches_scope
  SELECT
    m.id,
    m.match_date,
    af_norm_name(ht.name),
    af_norm_name(at.name),
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
  WHERE c.api_football_id IN (39,140,135,78,61,88,203)
    AND s.year BETWEEN 2019 AND 2024
    AND m.api_football_fixture_id IS NULL;

  -- ── Step 3: Exact match (same date + both teams) ───────────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _mapping_results (
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

  TRUNCATE _mapping_results;

  -- Exact date + exact norm name match → verified
  INSERT INTO _mapping_results
  SELECT DISTINCT ON (db.match_id)
    db.match_id,
    af.af_fixture_id,
    af.af_league_id,
    af.af_season,
    af.af_date,
    af.af_home_raw,
    af.af_away_raw,
    'verified',
    'exact_date+teams',
    1.0
  FROM _db_matches_scope db
  JOIN _af_fixtures_expanded af
    ON  af.af_league_id = db.af_league_id
    AND af.af_season    = db.af_season
    AND af.af_date      = db.match_date
    AND af.af_home_norm = db.home_norm
    AND af.af_away_norm = db.away_norm
  ORDER BY db.match_id, af.af_fixture_id;

  -- ── Step 4: ±1 day fallback for unmatched → candidate ─────────────────────
  INSERT INTO _mapping_results
  SELECT DISTINCT ON (db.match_id)
    db.match_id,
    af.af_fixture_id,
    af.af_league_id,
    af.af_season,
    af.af_date,
    af.af_home_raw,
    af.af_away_raw,
    'candidate',
    'date_±1day+teams',
    0.8
  FROM _db_matches_scope db
  JOIN _af_fixtures_expanded af
    ON  af.af_league_id = db.af_league_id
    AND af.af_season    = db.af_season
    AND af.af_date      BETWEEN db.match_date - 1 AND db.match_date + 1
    AND af.af_home_norm = db.home_norm
    AND af.af_away_norm = db.away_norm
  WHERE NOT EXISTS (
    SELECT 1 FROM _mapping_results mr WHERE mr.match_id = db.match_id
  )
  ORDER BY db.match_id, af.af_date ASC, af.af_fixture_id;

  -- ── Step 5: Detect duplicate af_fixture_id → downgrade to needs_review ─────
  UPDATE _mapping_results r
  SET status = 'needs_review', reason = 'af_fixture_id_collision', confidence = 0.5,
      match_id = NULL
  WHERE af_fixture_id IN (
    SELECT af_fixture_id FROM _mapping_results
    GROUP BY af_fixture_id HAVING COUNT(*) > 1
  );

  -- ── Step 6: Count stats ────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE status = 'verified'),
    COUNT(*) FILTER (WHERE status = 'candidate'),
    COUNT(*) FILTER (WHERE status = 'needs_review')
  INTO v_verified, v_candidate, v_needs_review
  FROM _mapping_results;

  SELECT COUNT(*) INTO v_not_found
  FROM _db_matches_scope db
  WHERE NOT EXISTS (SELECT 1 FROM _mapping_results mr WHERE mr.match_id = db.match_id);

  -- ── Step 7: Upsert af_fixture_mappings ────────────────────────────────────
  INSERT INTO public.af_fixture_mappings (
    match_id, af_fixture_id, af_league_id, af_season,
    af_date, af_home_team, af_away_team,
    mapping_status, confidence, match_reason, updated_at
  )
  SELECT
    match_id, af_fixture_id, af_league_id, af_season,
    af_date, af_home_raw, af_away_raw,
    status, confidence, reason, now()
  FROM _mapping_results
  ON CONFLICT (af_fixture_id) DO UPDATE SET
    match_id       = EXCLUDED.match_id,
    mapping_status = EXCLUDED.mapping_status,
    confidence     = EXCLUDED.confidence,
    match_reason   = EXCLUDED.match_reason,
    updated_at     = now();

  GET DIAGNOSTICS v_mappings = ROW_COUNT;

  -- ── Step 8: Write api_football_fixture_id to matches (verified only) ───────
  UPDATE public.matches m
  SET api_football_fixture_id = mr.af_fixture_id
  FROM _mapping_results mr
  WHERE mr.match_id = m.id
    AND mr.status = 'verified'
    AND m.api_football_fixture_id IS NULL;

  GET DIAGNOSTICS v_written = ROW_COUNT;

  -- ── Step 9: Mark raw rows as processed ────────────────────────────────────
  UPDATE public.api_football_fixture_probe_raw
  SET transform_status = 'mapped'
  WHERE transform_status = 'full';

  -- ── Step 10: Per-league summary ───────────────────────────────────────────
  SELECT jsonb_agg(row_to_json(ls))
  INTO v_league_stats
  FROM (
    SELECT
      c.name AS league,
      c.api_football_id AS af_id,
      COUNT(DISTINCT db.match_id)                                      AS db_matches,
      COUNT(DISTINCT mr.af_fixture_id)                                 AS af_matched,
      COUNT(*) FILTER (WHERE mr.status = 'verified')                   AS verified,
      COUNT(*) FILTER (WHERE mr.status = 'candidate')                  AS candidate,
      COUNT(*) FILTER (WHERE mr.status = 'needs_review')               AS needs_review,
      COUNT(db.match_id) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM _mapping_results mr2 WHERE mr2.match_id = db.match_id
        )
      )                                                                 AS not_found,
      round(
        COUNT(*) FILTER (WHERE mr.status = 'verified') * 100.0
        / NULLIF(COUNT(DISTINCT db.match_id), 0), 1
      )::text || '%'                                                    AS mapped_pct
    FROM _db_matches_scope db
    JOIN public.competitions c ON c.api_football_id = db.af_league_id
    LEFT JOIN _mapping_results mr ON mr.match_id = db.match_id
    GROUP BY c.name, c.api_football_id
    ORDER BY c.name
  ) ls;

  RETURN jsonb_build_object(
    'overall', jsonb_build_object(
      'total_db_matches',     (SELECT COUNT(*) FROM _db_matches_scope) + v_verified + v_candidate + v_needs_review,
      'verified',             v_verified,
      'candidate',            v_candidate,
      'needs_review',         v_needs_review,
      'not_found',            v_not_found,
      'fixture_id_written',   v_written,
      'mappings_upserted',    v_mappings
    ),
    'by_league',  v_league_stats,
    'safety', jsonb_build_object(
      'scores_changed',      false,
      'match_stats_changed', false,
      'model_lab_touched',   false,
      'predictions_created', 0,
      'odds_endpoints_called', false,
      'wc_history_touched',  false
    )
  );
END;
$$;
