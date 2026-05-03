/*
  # Fix AF fixture mapping: improved normalization + comprehensive alias table

  ## Problem
  - af_norm_name() NFD decomposition destroys Turkish chars: Beşiktaş → "be ikta "
  - DB uses short names: "Dortmund" vs AF full names: "Borussia Dortmund"
  - Alias table in edge function was not used by SQL engine

  ## Fix
  1. Drop and recreate af_norm_name() with transliteration before strip
  2. Create af_team_aliases table for db_norm → af_norm mappings
  3. Rewrite af_run_fixture_mapping() to join through alias table
  4. Remove "mark as mapped" step — engine is now idempotent
*/

-- ── 1. Replace af_norm_name ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.af_norm_name(text);

CREATE FUNCTION public.af_norm_name(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    trim(
      regexp_replace(
        regexp_replace(
          lower(
            translate(
              p_raw,
              'ÀÁÂÃÄÅàáâãäåÆæÇçÈÉÊËèéêëÌÍÎÏìíîïÐðÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿŠšŸŽžŒœŁłŃńŚśŻżĞğİıŞşÜüÖöÇç',
              'AAAAAAaaaaaaAACcEEEEeeeeIIIIiiiiDdNnOOOOOOooooooUUUUuuuuYyySSYZzOoLlNnSsZzGgIiSsUuOoCc'
            )
          ),
          '[^a-z0-9 ]', ' ',
          'g'
        ),
        '\s+', ' ',
        'g'
      )
    )
$$;

-- ── 2. Create alias table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.af_team_aliases (
  id          serial PRIMARY KEY,
  league_id   integer NOT NULL,
  db_norm     text NOT NULL,
  af_norm     text NOT NULL,
  UNIQUE (league_id, db_norm)
);

ALTER TABLE public.af_team_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role read af_team_aliases"
  ON public.af_team_aliases FOR SELECT TO service_role USING (true);

-- ── 3. Seed aliases ──────────────────────────────────────────────────────────
INSERT INTO public.af_team_aliases (league_id, db_norm, af_norm) VALUES
-- Premier League (39) — DB short → AF full
(39, 'man city',          'manchester city'),
(39, 'man united',        'manchester united'),
(39, 'nott m forest',     'nottingham forest'),
(39, 'sheffield united',  'sheffield utd'),
-- Ligue 1 (61)
(61, 'paris sg',          'paris saint germain'),
(61, 'st etienne',        'saint etienne'),
(61, 'clermont',          'clermont foot'),
(61, 'troyes',            'estac troyes'),
(61, 'brest',             'stade brestois 29'),
-- Bundesliga (78)
(78, 'dortmund',          'borussia dortmund'),
(78, 'm gladbach',        'borussia monchengladbach'),
(78, 'ein frankfurt',     'eintracht frankfurt'),
(78, 'fc koln',           '1 fc koln'),
(78, 'hoffenheim',        '1899 hoffenheim'),
(78, 'leverkusen',        'bayer leverkusen'),
(78, 'augsburg',          'fc augsburg'),
(78, 'wolfsburg',         'vfl wolfsburg'),
(78, 'schalke 04',        'fc schalke 04'),
(78, 'freiburg',          'sc freiburg'),
(78, 'mainz',             'fsv mainz 05'),
(78, 'hertha',            'hertha berlin'),
(78, 'stuttgart',         'vfb stuttgart'),
(78, 'bochum',            'vfl bochum'),
(78, 'paderborn',         'sc paderborn 07'),
(78, 'greuther furth',    'spvgg greuther furth'),
(78, 'bielefeld',         'arminia bielefeld'),
(78, 'darmstadt',         'sv darmstadt 98'),
(78, 'heidenheim',        '1 fc heidenheim 1846'),
(78, 'st pauli',          'fc st pauli'),
-- Eredivisie (88)
(88, 'den haag',          'ado den haag'),
(88, 'for sittard',       'fortuna sittard'),
(88, 'nijmegen',          'nec nijmegen'),
(88, 'zwolle',            'pec zwolle'),
(88, 'fc emmen',          'emmen'),
(88, 'volendam',          'fc volendam'),
(88, 'almere city',       'almere city fc'),
-- Serie A (135)
(135, 'milan',            'ac milan'),
(135, 'roma',             'as roma'),
(135, 'verona',           'hellas verona'),
-- La Liga (140)
(140, 'ath bilbao',       'athletic club'),
(140, 'ath madrid',       'atletico madrid'),
(140, 'betis',            'real betis'),
(140, 'sociedad',         'real sociedad'),
(140, 'celta',            'celta vigo'),
(140, 'espanol',          'espanyol'),
(140, 'vallecano',        'rayo vallecano'),
(140, 'granada',          'granada cf'),
-- Sueper Lig (203) — DB ascii → AF transliterated norm
(203, 'besiktas',         'besiktas'),
(203, 'ankaragucu',       'ankaragucu'),
(203, 'buyuksehyr',       'basaksehir'),
(203, 'gaziantep',        'gaziantep fk'),
(203, 'kasimpasa',        'kasimpasa'),
(203, 'genclerbirligi',   'genclerbirligi s k '),
(203, 'karagumruk',       'fatih karagumruk'),
(203, 'goztep',           'goztepe'),
(203, 'erzurum bb',       'erzurumspor fk'),
(203, 'istanbulspor',     'istanbulspor'),
(203, 'umraniyespor',     'umraniyespor'),
(203, 'eyupspor',         'eyupspor'),
(203, 'ad demirspor',     'adana demirspor'),
(203, 'bodrumspor',       'bodrum fk')
ON CONFLICT (league_id, db_norm) DO UPDATE SET af_norm = EXCLUDED.af_norm;

-- ── 4. Replace mapping engine ────────────────────────────────────────────────
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

CREATE TEMP TABLE IF NOT EXISTS _db_scope (
  match_id      uuid,
  match_date    date,
  home_norm     text,
  away_norm     text,
  home_raw      text,
  away_raw      text,
  af_league_id  integer,
  af_season     integer
) ON COMMIT DROP;
TRUNCATE _db_scope;

INSERT INTO _db_scope
SELECT
  m.id,
  m.match_date,
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

-- Exact date + teams → verified
INSERT INTO _results
SELECT DISTINCT ON (db.match_id)
  db.match_id, af.af_fixture_id, af.af_league_id, af.af_season,
  af.af_date, af.af_home_raw, af.af_away_raw,
  'verified', 'exact_date+teams', 1.0
FROM _db_scope db
JOIN _af_fix af
  ON  af.af_league_id = db.af_league_id
  AND af.af_season    = db.af_season
  AND af.af_date      = db.match_date
  AND af.af_home_norm = db.home_norm
  AND af.af_away_norm = db.away_norm
ORDER BY db.match_id, af.af_fixture_id;

-- ±1 day fallback → candidate
INSERT INTO _results
SELECT DISTINCT ON (db.match_id)
  db.match_id, af.af_fixture_id, af.af_league_id, af.af_season,
  af.af_date, af.af_home_raw, af.af_away_raw,
  'candidate', 'date_±1day+teams', 0.8
FROM _db_scope db
JOIN _af_fix af
  ON  af.af_league_id = db.af_league_id
  AND af.af_season    = db.af_season
  AND af.af_date      BETWEEN db.match_date - 1 AND db.match_date + 1
  AND af.af_home_norm = db.home_norm
  AND af.af_away_norm = db.away_norm
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

-- Raw rows intentionally NOT marked processed — engine is idempotent

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
