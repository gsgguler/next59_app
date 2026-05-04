/*
  # Fix af_apply_referee_backfill v3: drop api_football_fixture_id update

  The unique constraint on matches.api_football_fixture_id causes conflicts when
  two matches share the same date within a league-season (the date-only join is
  ambiguous). Referee backfill only needs to set the referee text field.
  api_football_fixture_id population is handled separately via the fixture-mapping pipeline.
*/

DROP FUNCTION IF EXISTS public.af_apply_referee_backfill();

CREATE FUNCTION public.af_apply_referee_backfill()
RETURNS TABLE(
  fd_code       TEXT,
  season_label  TEXT,
  with_referee  BIGINT,
  total         BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, shared
AS $$
DECLARE
  v_league_map JSONB := '{
    "78":  "D1",
    "61":  "F1",
    "135": "I1",
    "88":  "N1",
    "140": "SP1",
    "203": "T1"
  }';
BEGIN
  -- Update only referee; skip api_football_fixture_id to avoid unique constraint conflicts
  -- on date-ambiguous matches (two matches same date same league-season)
  UPDATE public.matches m
  SET
    referee    = TRIM(REGEXP_REPLACE(
                   afr.raw_response->'fixture'->>'referee',
                   ',\s*\S[\S\s]*$', ''
                 )),
    updated_at = NOW()
  FROM shared.af_fixtures_raw afr
  JOIN public.competition_seasons cs
    ON cs.football_data_uk_code = (v_league_map ->> afr.league_id::TEXT)
   AND cs.football_data_uk_season_label = (
         LPAD(afr.season::TEXT, 4, '0') ||
         LPAD(((afr.season % 100) + 1)::TEXT, 2, '0')
       )
  WHERE afr.league_id IN (78, 61, 135, 88, 140, 203)
    AND afr.season BETWEEN 2020 AND 2024
    AND afr.raw_response->'fixture'->>'referee' IS NOT NULL
    AND afr.raw_response->'fixture'->>'referee' <> ''
    AND afr.raw_response->'fixture'->>'referee' <> 'null'
    AND m.competition_season_id = cs.id
    AND m.match_date = (afr.raw_response->'fixture'->>'date')::DATE
    AND m.referee IS NULL;

  -- Mark staging rows processed
  UPDATE shared.af_fixtures_raw
  SET is_processed = TRUE
  WHERE league_id IN (78, 61, 135, 88, 140, 203)
    AND season BETWEEN 2020 AND 2024;

  RETURN QUERY
  SELECT
    cs.football_data_uk_code,
    cs.football_data_uk_season_label,
    COUNT(*) FILTER (WHERE m.referee IS NOT NULL)::BIGINT,
    COUNT(*)::BIGINT
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  WHERE cs.football_data_uk_code IN ('D1','F1','I1','N1','SP1','T1')
    AND cs.football_data_uk_season_label IN ('202021','202122','202223','202324','202425')
  GROUP BY cs.football_data_uk_code, cs.football_data_uk_season_label
  ORDER BY cs.football_data_uk_code, cs.football_data_uk_season_label;
END;
$$;

GRANT EXECUTE ON FUNCTION public.af_apply_referee_backfill() TO service_role;
