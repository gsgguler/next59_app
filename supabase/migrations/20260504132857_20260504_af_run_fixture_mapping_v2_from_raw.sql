/*
  # af_run_fixture_mapping_v2 — maps matches using shared.af_fixtures_raw

  Problem: af_run_fixture_mapping() reads api_football_fixture_probe_raw
  which stores fixtures in a JSON array under response_json->'fixtures'.
  The probe_raw 'full' rows exist for all 35 league×season pairs but only
  mapped ~4,527 of ~12,375 matches (~37%) due to name/date mismatches.

  shared.af_fixtures_raw stores one row per fixture with the same JSON
  structure in raw_response. It has 10,570 rows covering 6 leagues ×
  5 seasons (PL/39 is absent). This function uses that richer source
  with the same 8-combo norm matching logic (exact date + ±1 day,
  ali/raw home/away combinations).

  Changes vs v1:
  - Reads shared.af_fixtures_raw instead of api_football_fixture_probe_raw
  - _af_fix populated from per-row source (no jsonb_array_elements)
  - Also writes canonical_match_id back to af_fixtures_raw on verified match
  - Same safety envelope: only writes api_football_fixture_id on 'verified'
*/
CREATE OR REPLACE FUNCTION public.af_run_fixture_mapping_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $fn$
DECLARE
  v_verified     integer := 0;
  v_candidate    integer := 0;
  v_needs_review integer := 0;
  v_not_found    integer := 0;
  v_written      integer := 0;
  v_mappings     integer := 0;
  v_league_stats jsonb   := '[]'::jsonb;
BEGIN

  CREATE TEMP TABLE IF NOT EXISTS _af_fix2 (
    af_fixture_id  integer,
    af_league_id   integer,
    af_season      integer,
    af_date        date,
    af_home_norm   text,
    af_away_norm   text,
    af_home_raw    text,
    af_away_raw    text
  ) ON COMMIT DROP;
  TRUNCATE _af_fix2;

  -- Populate from shared.af_fixtures_raw (one row per fixture)
  INSERT INTO _af_fix2
  SELECT
    r.fixture_id,
    r.league_id,
    r.season,
    (r.raw_response->'fixture'->>'date')::date,
    af_norm_name(r.raw_response->'teams'->'home'->>'name'),
    af_norm_name(r.raw_response->'teams'->'away'->>'name'),
    r.raw_response->'teams'->'home'->>'name',
    r.raw_response->'teams'->'away'->>'name'
  FROM shared.af_fixtures_raw r
  WHERE r.league_id IN (39,140,135,78,61,88,203)
    AND r.season BETWEEN 2020 AND 2024
    AND (r.raw_response->'fixture'->>'date') IS NOT NULL
    AND (r.raw_response->'teams'->'home'->>'name') IS NOT NULL;

  CREATE TEMP TABLE IF NOT EXISTS _db_scope2 (
    match_id       uuid,
    match_date     date,
    home_norm_raw  text,
    away_norm_raw  text,
    home_norm_ali  text,
    away_norm_ali  text,
    home_raw       text,
    away_raw       text,
    af_league_id   integer,
    af_season      integer
  ) ON COMMIT DROP;
  TRUNCATE _db_scope2;

  INSERT INTO _db_scope2
  SELECT
    m.id, m.match_date,
    af_norm_name(ht.name),
    af_norm_name(at.name),
    COALESCE(ha.af_norm, af_norm_name(ht.name)),
    COALESCE(aa.af_norm, af_norm_name(at.name)),
    ht.name, at.name,
    c.api_football_id, s.year
  FROM matches m
  JOIN competition_seasons cs ON cs.id = m.competition_season_id
  JOIN competitions c         ON c.id  = cs.competition_id
  JOIN seasons s              ON s.id  = cs.season_id
  JOIN teams ht               ON ht.id = m.home_team_id
  JOIN teams at               ON at.id = m.away_team_id
  LEFT JOIN af_team_aliases ha
    ON ha.league_id = c.api_football_id AND ha.db_norm = af_norm_name(ht.name)
  LEFT JOIN af_team_aliases aa
    ON aa.league_id = c.api_football_id AND aa.db_norm = af_norm_name(at.name)
  WHERE c.api_football_id IN (39,140,135,78,61,88,203)
    AND s.year BETWEEN 2020 AND 2024
    AND m.api_football_fixture_id IS NULL;

  CREATE TEMP TABLE IF NOT EXISTS _results2 (
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
  TRUNCATE _results2;

  -- Exact date: 4 norm combinations
  DO $inner$
  DECLARE
    _combos text[][] := ARRAY[
      ARRAY['ali','ali'], ARRAY['raw','raw'],
      ARRAY['ali','raw'], ARRAY['raw','ali']
    ];
    _combo text[];
    _hcol text; _acol text;
  BEGIN
    FOREACH _combo SLICE 1 IN ARRAY _combos LOOP
      _hcol := _combo[1]; _acol := _combo[2];
      INSERT INTO _results2
      SELECT DISTINCT ON (db.match_id)
        db.match_id, af.af_fixture_id, af.af_league_id, af.af_season,
        af.af_date, af.af_home_raw, af.af_away_raw,
        'verified', 'exact_date+' || _hcol || '_h+' || _acol || '_a', 1.0
      FROM _db_scope2 db
      JOIN _af_fix2 af
        ON  af.af_league_id = db.af_league_id
        AND af.af_season    = db.af_season
        AND af.af_date      = db.match_date
        AND af.af_home_norm = CASE WHEN _hcol = 'ali' THEN db.home_norm_ali ELSE db.home_norm_raw END
        AND af.af_away_norm = CASE WHEN _acol = 'ali' THEN db.away_norm_ali ELSE db.away_norm_raw END
      WHERE NOT EXISTS (SELECT 1 FROM _results2 r WHERE r.match_id = db.match_id)
      ORDER BY db.match_id, af.af_fixture_id;
    END LOOP;
  END $inner$;

  -- ±1 day: 4 norm combinations
  DO $inner2$
  DECLARE
    _combos text[][] := ARRAY[
      ARRAY['ali','ali'], ARRAY['raw','raw'],
      ARRAY['ali','raw'], ARRAY['raw','ali']
    ];
    _combo text[];
    _hcol text; _acol text;
  BEGIN
    FOREACH _combo SLICE 1 IN ARRAY _combos LOOP
      _hcol := _combo[1]; _acol := _combo[2];
      INSERT INTO _results2
      SELECT DISTINCT ON (db.match_id)
        db.match_id, af.af_fixture_id, af.af_league_id, af.af_season,
        af.af_date, af.af_home_raw, af.af_away_raw,
        'candidate', 'date_±1day+' || _hcol || '_h+' || _acol || '_a', 0.8
      FROM _db_scope2 db
      JOIN _af_fix2 af
        ON  af.af_league_id = db.af_league_id
        AND af.af_season    = db.af_season
        AND af.af_date      BETWEEN db.match_date - 1 AND db.match_date + 1
        AND af.af_home_norm = CASE WHEN _hcol = 'ali' THEN db.home_norm_ali ELSE db.home_norm_raw END
        AND af.af_away_norm = CASE WHEN _acol = 'ali' THEN db.away_norm_ali ELSE db.away_norm_raw END
      WHERE NOT EXISTS (SELECT 1 FROM _results2 r WHERE r.match_id = db.match_id)
      ORDER BY db.match_id, af.af_date ASC, af.af_fixture_id;
    END LOOP;
  END $inner2$;

  -- Collision → needs_review
  UPDATE _results2 r
  SET status = 'needs_review', reason = 'af_fixture_id_collision',
      confidence = 0.5, match_id = NULL
  WHERE af_fixture_id IN (
    SELECT af_fixture_id FROM _results2 GROUP BY af_fixture_id HAVING COUNT(*) > 1
  );

  SELECT
    COUNT(*) FILTER (WHERE status = 'verified'),
    COUNT(*) FILTER (WHERE status = 'candidate'),
    COUNT(*) FILTER (WHERE status = 'needs_review')
  INTO v_verified, v_candidate, v_needs_review
  FROM _results2;

  SELECT COUNT(*) INTO v_not_found
  FROM _db_scope2 db
  WHERE NOT EXISTS (SELECT 1 FROM _results2 r WHERE r.match_id = db.match_id);

  -- Upsert af_fixture_mappings
  INSERT INTO public.af_fixture_mappings (
    match_id, af_fixture_id, af_league_id, af_season,
    af_date, af_home_team, af_away_team,
    mapping_status, confidence, match_reason, updated_at
  )
  SELECT match_id, af_fixture_id, af_league_id, af_season,
         af_date, af_home_raw, af_away_raw, status, confidence, reason, now()
  FROM _results2
  ON CONFLICT (af_fixture_id) DO UPDATE SET
    match_id       = EXCLUDED.match_id,
    mapping_status = EXCLUDED.mapping_status,
    confidence     = EXCLUDED.confidence,
    match_reason   = EXCLUDED.match_reason,
    updated_at     = now();
  GET DIAGNOSTICS v_mappings = ROW_COUNT;

  -- Write api_football_fixture_id back to matches (verified only)
  UPDATE matches m
  SET api_football_fixture_id = r.af_fixture_id
  FROM _results2 r
  WHERE r.match_id = m.id
    AND r.status   = 'verified'
    AND m.api_football_fixture_id IS NULL;
  GET DIAGNOSTICS v_written = ROW_COUNT;

  -- Write canonical_match_id back to af_fixtures_raw
  UPDATE shared.af_fixtures_raw f
  SET canonical_match_id = r.match_id
  FROM _results2 r
  WHERE f.fixture_id      = r.af_fixture_id
    AND r.status          = 'verified'
    AND f.canonical_match_id IS NULL;

  -- Per-league summary
  SELECT jsonb_agg(row_to_json(ls))
  INTO v_league_stats
  FROM (
    SELECT
      c.name AS league, c.api_football_id AS af_id,
      COUNT(DISTINCT db.match_id) AS db_matches,
      COUNT(DISTINCT mr.af_fixture_id) AS af_matched,
      COUNT(*) FILTER (WHERE mr.status = 'verified')   AS verified,
      COUNT(*) FILTER (WHERE mr.status = 'candidate')  AS candidate,
      COUNT(*) FILTER (WHERE mr.status = 'needs_review') AS needs_review,
      COUNT(db.match_id) FILTER (
        WHERE NOT EXISTS (SELECT 1 FROM _results2 mr2 WHERE mr2.match_id = db.match_id)
      ) AS not_found,
      round(
        COUNT(*) FILTER (WHERE mr.status = 'verified') * 100.0
        / NULLIF(COUNT(DISTINCT db.match_id), 0), 1
      )::text || '%' AS mapped_pct
    FROM _db_scope2 db
    JOIN competitions c ON c.api_football_id = db.af_league_id
    LEFT JOIN _results2 mr ON mr.match_id = db.match_id
    GROUP BY c.name, c.api_football_id ORDER BY c.name
  ) ls;

  RETURN jsonb_build_object(
    'source', 'shared.af_fixtures_raw',
    'overall', jsonb_build_object(
      'total_db_matches',   (SELECT COUNT(*) FROM _db_scope2),
      'verified',           v_verified,
      'candidate',          v_candidate,
      'needs_review',       v_needs_review,
      'not_found',          v_not_found,
      'fixture_id_written', v_written,
      'mappings_upserted',  v_mappings
    ),
    'by_league', v_league_stats,
    'safety', jsonb_build_object(
      'scores_changed', false, 'match_stats_changed', false,
      'model_lab_touched', false, 'predictions_created', 0,
      'odds_endpoints_called', false, 'wc_history_touched', false
    )
  );
END;
$fn$;
