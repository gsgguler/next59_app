/*
  # WC History — Process openfootball pg_net responses

  Parses fetched JSON and inserts into wc_history tables.
  All score semantics: 90min, AET, penalties, decided_by, final_winner.

  Separation: public.matches untouched, model_lab untouched, predictions untouched.
*/

-- Normalize round string to stage_code
CREATE OR REPLACE FUNCTION public.wch_of_stage_code(p_round text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(p_round) SIMILAR TO '%(matchday|group|first round|second round|preliminary|pool|final round)%'
         THEN 'Group stage'
    WHEN lower(p_round) SIMILAR TO '%(round of 16|eighth|last 16)%'
         THEN 'Round of 16'
    WHEN lower(p_round) SIMILAR TO '%(quarterfinal|quarter-final|quarter final)%'
         THEN 'Quarter-finals'
    WHEN lower(p_round) SIMILAR TO '%(semifinal|semi-final|semi final)%'
         THEN 'Semi-finals'
    WHEN lower(p_round) SIMILAR TO '%(third|3rd|bronze|place play)%'
         THEN '3rd Place Final'
    WHEN lower(p_round) LIKE '%final%'
         THEN 'Final'
    ELSE p_round
  END;
$$;

-- Main processor: parse one year's response and insert into wc_history
CREATE OR REPLACE FUNCTION public.wch_of_process_year(p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_content      text;
  v_json         jsonb;
  v_matches      jsonb;
  v_match        jsonb;
  v_score        jsonb;
  v_ft           jsonb;
  v_et           jsonb;
  v_pen          jsonb;
  v_h90          int; v_a90 int;
  v_haet         int; v_aaet int;
  v_hpen         int; v_apen int;
  v_result90     text;
  v_result_aet   text;
  v_result_pen   text;
  v_decided_by   text;
  v_winner       text;
  v_stage_code   text;
  v_venue        text;
  v_city         text;
  v_ground       text;
  v_parts        text[];
  v_dates        text[];
  v_host         text;
  v_champ        text;
  v_team_names   text[];
  v_match_rows   jsonb;
  v_team_rows    jsonb;
  v_chunk        jsonb;
  v_idx          int := 0;
  v_ins_matches  int := 0;
  v_ins_teams    int := 0;
  v_total        int;
  v_chunk_start  int;
  i              int;
BEGIN
  -- Get fetched content
  SELECT encode(content, 'escape') INTO v_content
  FROM net._http_response
  WHERE id = (
    SELECT pg_net_id FROM wc_history.of_fetch_jobs WHERE edition_year = p_year LIMIT 1
  );

  IF v_content IS NULL THEN
    RETURN jsonb_build_object('year', p_year, 'error', 'no response found');
  END IF;

  v_json    := v_content::jsonb;
  v_matches := v_json->'matches';

  IF v_matches IS NULL OR jsonb_array_length(v_matches) = 0 THEN
    RETURN jsonb_build_object('year', p_year, 'error', 'no matches in JSON');
  END IF;

  -- Store raw (idempotent)
  PERFORM public.wch_store_of_raw(
    p_year,
    'https://raw.githubusercontent.com/openfootball/worldcup.json/master/' || p_year || '/worldcup.json',
    md5(v_content),
    v_json
  );

  -- Edition metadata
  SELECT h, ch INTO v_host, v_champ
  FROM (VALUES
    (1930,'Uruguay',           'Uruguay'),
    (1934,'Italy',             'Italy'),
    (1938,'France',            'Italy'),
    (1950,'Brazil',            'Uruguay'),
    (1954,'Switzerland',       'West Germany'),
    (1958,'Sweden',            'Brazil'),
    (1962,'Chile',             'Brazil'),
    (1966,'England',           'England'),
    (1970,'Mexico',            'Brazil'),
    (1974,'West Germany',      'West Germany'),
    (1978,'Argentina',         'Argentina'),
    (1982,'Spain',             'Italy'),
    (1986,'Mexico',            'Argentina'),
    (1990,'Italy',             'West Germany'),
    (1994,'USA',               'Brazil'),
    (1998,'France',            'France'),
    (2002,'South Korea / Japan','Brazil'),
    (2006,'Germany',           'Italy')
  ) t(yr,h,ch) WHERE yr = p_year;

  -- Collect sorted dates
  SELECT array_agg(m->>'date' ORDER BY m->>'date')
  INTO v_dates
  FROM jsonb_array_elements(v_matches) m
  WHERE m->>'date' IS NOT NULL;

  -- Collect unique team names
  SELECT array_agg(DISTINCT t ORDER BY t)
  INTO v_team_names
  FROM (
    SELECT m->>'team1' AS t FROM jsonb_array_elements(v_matches) m
    UNION
    SELECT m->>'team2' AS t FROM jsonb_array_elements(v_matches) m
  ) teams WHERE t IS NOT NULL;

  -- Upsert edition
  PERFORM public.wch_upsert_edition_full(
    p_year,
    v_host,
    (v_dates[1])::date,
    (v_dates[array_length(v_dates,1)])::date,
    array_length(v_team_names, 1),
    jsonb_array_length(v_matches),
    v_champ
  );

  -- Upsert teams
  v_team_rows := '[]'::jsonb;
  FOR i IN 1..array_length(v_team_names,1) LOOP
    v_team_rows := v_team_rows || jsonb_build_array(
      jsonb_build_object('edition_year', p_year::text, 'name_en', v_team_names[i])
    );
  END LOOP;
  v_ins_teams := public.wch_upsert_teams_bulk(v_team_rows);

  -- Build match rows
  v_match_rows := '[]'::jsonb;
  FOR v_match IN SELECT jsonb_array_elements(v_matches) LOOP
    v_score := v_match->'score';
    v_ft    := v_score->'ft';
    v_et    := v_score->'et';
    v_pen   := v_score->'p';

    IF v_ft IS NULL OR jsonb_array_length(v_ft) < 2 THEN CONTINUE; END IF;

    v_h90 := (v_ft->0)::int;
    v_a90 := (v_ft->1)::int;

    IF    v_h90 > v_a90 THEN v_result90 := 'home_win';
    ELSIF v_h90 < v_a90 THEN v_result90 := 'away_win';
    ELSE                      v_result90 := 'draw'; END IF;

    v_haet := NULL; v_aaet := NULL; v_result_aet := NULL;
    IF v_et IS NOT NULL AND jsonb_array_length(v_et) >= 2 THEN
      v_haet := (v_et->0)::int; v_aaet := (v_et->1)::int;
      IF    v_haet > v_aaet THEN v_result_aet := 'home_win';
      ELSIF v_haet < v_aaet THEN v_result_aet := 'away_win';
      ELSE                        v_result_aet := 'draw'; END IF;
    END IF;

    v_hpen := NULL; v_apen := NULL; v_result_pen := NULL;
    IF v_pen IS NOT NULL AND jsonb_array_length(v_pen) >= 2 THEN
      v_hpen := (v_pen->0)::int; v_apen := (v_pen->1)::int;
      v_result_pen := CASE WHEN v_hpen > v_apen THEN 'home_win' ELSE 'away_win' END;
    END IF;

    IF v_pen IS NOT NULL THEN
      v_decided_by := 'penalties';
      v_winner := CASE WHEN v_hpen > v_apen THEN v_match->>'team1' ELSE v_match->>'team2' END;
    ELSIF v_et IS NOT NULL THEN
      v_decided_by := 'extra_time';
      v_winner := CASE WHEN v_haet > v_aaet THEN v_match->>'team1'
                       WHEN v_aaet > v_haet THEN v_match->>'team2'
                       ELSE NULL END;
    ELSE
      v_decided_by := 'regulation';
      v_winner := CASE WHEN v_h90 > v_a90 THEN v_match->>'team1'
                       WHEN v_a90 > v_h90 THEN v_match->>'team2'
                       ELSE NULL END;
    END IF;

    v_stage_code := public.wch_of_stage_code(COALESCE(v_match->>'round', ''));

    v_ground := v_match->>'ground';
    v_venue  := ''; v_city := '';
    IF v_ground IS NOT NULL THEN
      v_parts := string_to_array(v_ground, ',');
      IF array_length(v_parts,1) >= 2 THEN
        v_city  := trim(v_parts[array_length(v_parts,1)]);
        v_venue := trim(array_to_string(v_parts[1:array_length(v_parts,1)-1], ','));
      ELSE
        v_venue := trim(v_ground);
      END IF;
    END IF;

    v_idx := v_idx + 1;
    v_match_rows := v_match_rows || jsonb_build_array(jsonb_build_object(
      'edition_year',           p_year::text,
      'match_no',               v_idx::text,
      'stage_code',             v_stage_code,
      'stage_name_en',          COALESCE(v_match->>'round', ''),
      'group_name',             COALESCE(v_match->>'group', ''),
      'match_date',             COALESCE(v_match->>'date', ''),
      'home_team_name',         COALESCE(v_match->>'team1', ''),
      'away_team_name',         COALESCE(v_match->>'team2', ''),
      'home_score_90',          v_h90::text,
      'away_score_90',          v_a90::text,
      'result_90',              v_result90,
      'home_score_aet',         COALESCE(v_haet::text, ''),
      'away_score_aet',         COALESCE(v_aaet::text, ''),
      'result_aet',             COALESCE(v_result_aet, ''),
      'home_penalties',         COALESCE(v_hpen::text, ''),
      'away_penalties',         COALESCE(v_apen::text, ''),
      'result_penalties',       COALESCE(v_result_pen, ''),
      'final_winner_name',      COALESCE(v_winner, ''),
      'decided_by',             v_decided_by,
      'result',                 v_result90,
      'venue_name',             v_venue,
      'city',                   v_city,
      'score_semantics_status', 'verified'
    ));
  END LOOP;

  -- Insert in chunks of 30
  v_total       := jsonb_array_length(v_match_rows);
  v_chunk_start := 1;
  WHILE v_chunk_start <= v_total LOOP
    v_chunk := '[]'::jsonb;
    FOR i IN v_chunk_start .. LEAST(v_chunk_start + 29, v_total) LOOP
      v_chunk := v_chunk || jsonb_build_array(v_match_rows->(i-1));
    END LOOP;
    v_ins_matches := v_ins_matches + public.wch_insert_of_matches(v_chunk);
    v_chunk_start := v_chunk_start + 30;
  END LOOP;

  -- Mark done
  UPDATE wc_history.of_fetch_jobs SET status = 'done' WHERE edition_year = p_year;
  PERFORM public.wch_mark_of_raw_transformed(p_year);

  RETURN jsonb_build_object(
    'year',             p_year,
    'matches_fetched',  jsonb_array_length(v_matches),
    'matches_inserted', v_ins_matches,
    'teams_inserted',   v_ins_teams
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.wch_of_process_year TO service_role;

-- Process all 18 old editions
CREATE OR REPLACE FUNCTION public.wch_of_process_all()
RETURNS TABLE(yr integer, fetched int, inserted int, teams int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_years integer[] := ARRAY[1930,1934,1938,1950,1954,1958,1962,1966,
                               1970,1974,1978,1982,1986,1990,1994,1998,2002,2006];
  v_year  integer;
  v_res   jsonb;
BEGIN
  FOREACH v_year IN ARRAY v_years LOOP
    v_res    := public.wch_of_process_year(v_year);
    yr       := v_year;
    fetched  := (v_res->>'matches_fetched')::int;
    inserted := (v_res->>'matches_inserted')::int;
    teams    := (v_res->>'teams_inserted')::int;
    RETURN NEXT;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.wch_of_process_all TO service_role;
