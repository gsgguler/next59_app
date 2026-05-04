/*
  # SQL backfill function: af_apply_referee_backfill

  Updates public.matches.referee (and api_football_fixture_id) from
  shared.af_fixtures_raw for the 6 target leagues, seasons 2020–2024.

  Match strategy:
  1. Join af_fixtures_raw → competition_seasons via (football_data_uk_code, season_label)
  2. Join to matches via (competition_season_id, match_date)
  3. Only update rows where matches.referee IS NULL
  4. Strip trailing ", Country" from referee names

  Returns summary row counts.
*/

CREATE OR REPLACE FUNCTION public.af_apply_referee_backfill()
RETURNS TABLE(
  fd_code       TEXT,
  season_label  TEXT,
  updated       BIGINT
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
  -- Bulk UPDATE: for each staging row with a non-null referee,
  -- find the matching match by date + competition_season and fill referee.
  UPDATE public.matches m
  SET
    referee = TRIM(REGEXP_REPLACE(
      afr.raw_response->'fixture'->>'referee',
      ',\s*\S[\S\s]*$', ''
    )),
    api_football_fixture_id = (afr.raw_response->'fixture'->>'id')::INTEGER,
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

  -- Mark processed rows
  UPDATE shared.af_fixtures_raw afr
  SET is_processed = TRUE
  WHERE afr.league_id IN (78, 61, 135, 88, 140, 203)
    AND afr.season BETWEEN 2020 AND 2024;

  -- Return per-league-season summary
  RETURN QUERY
  SELECT
    cs.football_data_uk_code,
    cs.football_data_uk_season_label,
    COUNT(*) FILTER (WHERE m.referee IS NOT NULL)::BIGINT AS updated
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  WHERE cs.football_data_uk_code IN ('D1','F1','I1','N1','SP1','T1')
    AND cs.football_data_uk_season_label IN ('202021','202122','202223','202324','202425')
  GROUP BY cs.football_data_uk_code, cs.football_data_uk_season_label
  ORDER BY cs.football_data_uk_code, cs.football_data_uk_season_label;
END;
$$;

GRANT EXECUTE ON FUNCTION public.af_apply_referee_backfill() TO service_role;
