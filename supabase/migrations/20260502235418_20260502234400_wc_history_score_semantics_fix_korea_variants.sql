/*
  # WC History — Score Semantics: Fix Korea DPR / Korea Republic name variants

  ## Summary
  openfootball uses "South Korea" / "North Korea" while API-Football uses
  "Korea Republic" / "Korea DPR". The semantic populate pass normalized
  openfootball→DB direction correctly for team lookup but missed these 11 matches
  because DB stored "Korea DPR"/"Korea Republic" while openfootball query
  returned those as unmatched. The same applies to "Ivory Coast" vs "Cote d'Ivoire".

  This pass: for all 2010/2014 matches still at conflict_unresolved,
  populate score semantic fields using openfootball date+score fallback match.
*/

DO $$
DECLARE
  v_match_id    uuid;
  v_of_row      jsonb;
  v_yr          int;
  v_matches_json jsonb;
  v_of_ft_h     int;
  v_of_ft_a     int;
  v_of_et_h     int;
  v_of_et_a     int;
  v_of_p_h      int;
  v_of_p_a      int;
  v_has_et      bool;
  v_has_p       bool;
  v_winner_name text;
  v_team1_norm  text;
  v_team2_norm  text;
  v_cnt         int := 0;
BEGIN

  FOR v_yr IN SELECT unnest(ARRAY[2010, 2014]) LOOP

    SELECT response_json->'matches'
    INTO v_matches_json
    FROM wc_history.raw_openfootball_responses
    WHERE edition_year = v_yr;

    FOR v_of_row IN SELECT jsonb_array_elements(v_matches_json) LOOP

      v_of_ft_h := (v_of_row->'score'->'ft'->0)::int;
      v_of_ft_a := (v_of_row->'score'->'ft'->1)::int;
      v_has_et  := (v_of_row->'score'->'et') IS NOT NULL;
      v_has_p   := (v_of_row->'score'->'p')  IS NOT NULL;

      v_of_et_h := CASE WHEN v_has_et THEN (v_of_row->'score'->'et'->0)::int ELSE NULL END;
      v_of_et_a := CASE WHEN v_has_et THEN (v_of_row->'score'->'et'->1)::int ELSE NULL END;
      v_of_p_h  := CASE WHEN v_has_p  THEN (v_of_row->'score'->'p'->0)::int  ELSE NULL END;
      v_of_p_a  := CASE WHEN v_has_p  THEN (v_of_row->'score'->'p'->1)::int  ELSE NULL END;

      -- Normalize openfootball names (full set including Korea/Ivory variants)
      v_team1_norm := v_of_row->>'team1';
      v_team2_norm := v_of_row->>'team2';
      v_team1_norm := replace(v_team1_norm, 'Bosnia-Herzegovina', 'Bosnia & Herzegovina');
      v_team2_norm := replace(v_team2_norm, 'Bosnia-Herzegovina', 'Bosnia & Herzegovina');
      v_team1_norm := replace(replace(v_team1_norm, 'Cote d''Ivoire', 'Ivory Coast'), 'Côte d''Ivoire', 'Ivory Coast');
      v_team2_norm := replace(replace(v_team2_norm, 'Cote d''Ivoire', 'Ivory Coast'), 'Côte d''Ivoire', 'Ivory Coast');
      v_team1_norm := replace(v_team1_norm, 'USA', 'United States');
      v_team2_norm := replace(v_team2_norm, 'USA', 'United States');
      v_team1_norm := replace(v_team1_norm, 'South Korea', 'Korea Republic');
      v_team2_norm := replace(v_team2_norm, 'South Korea', 'Korea Republic');
      v_team1_norm := replace(v_team1_norm, 'North Korea', 'Korea DPR');
      v_team2_norm := replace(v_team2_norm, 'North Korea', 'Korea DPR');

      -- Only update matches still at conflict_unresolved
      SELECT id INTO v_match_id
      FROM wc_history.matches
      WHERE edition_year = v_yr
        AND score_semantics_status = 'conflict_unresolved'
        AND date_trunc('day', kickoff_utc) = (v_of_row->>'date')::date
        AND (
          (home_team_name = v_team1_norm AND away_team_name = v_team2_norm)
          OR (home_team_name = v_team2_norm AND away_team_name = v_team1_norm)
        )
      LIMIT 1;

      CONTINUE WHEN v_match_id IS NULL;

      IF v_has_p THEN
        v_winner_name := CASE WHEN v_of_p_h > v_of_p_a THEN v_team1_norm ELSE v_team2_norm END;
        UPDATE wc_history.matches SET
          home_score_90 = v_of_ft_h, away_score_90 = v_of_ft_a, result_90 = 'draw',
          home_score_aet = v_of_et_h, away_score_aet = v_of_et_a,
          result_aet = CASE WHEN v_of_et_h IS NULL THEN NULL
                            WHEN v_of_et_h > v_of_et_a THEN 'home_win'
                            WHEN v_of_et_h < v_of_et_a THEN 'away_win' ELSE 'draw' END,
          home_penalties = CASE WHEN home_team_name = v_team1_norm THEN v_of_p_h ELSE v_of_p_a END,
          away_penalties = CASE WHEN home_team_name = v_team1_norm THEN v_of_p_a ELSE v_of_p_h END,
          result_penalties = CASE WHEN home_team_name = v_team1_norm
                               THEN CASE WHEN v_of_p_h > v_of_p_a THEN 'home_win' ELSE 'away_win' END
                               ELSE CASE WHEN v_of_p_a > v_of_p_h THEN 'home_win' ELSE 'away_win' END END,
          final_winner_name = v_winner_name,
          decided_by = 'penalties',
          score_semantics_status = 'verified'
        WHERE id = v_match_id;

      ELSIF v_has_et THEN
        v_winner_name := CASE WHEN v_of_et_h > v_of_et_a THEN v_team1_norm ELSE v_team2_norm END;
        UPDATE wc_history.matches SET
          home_score_90 = v_of_ft_h, away_score_90 = v_of_ft_a, result_90 = 'draw',
          home_score_aet = v_of_et_h, away_score_aet = v_of_et_a,
          result_aet = CASE WHEN v_of_et_h > v_of_et_a THEN 'home_win' ELSE 'away_win' END,
          final_winner_name = v_winner_name,
          decided_by = 'extra_time',
          score_semantics_status = 'verified'
        WHERE id = v_match_id;

      ELSE
        v_winner_name := CASE WHEN v_of_ft_h > v_of_ft_a THEN v_team1_norm
                              WHEN v_of_ft_h < v_of_ft_a THEN v_team2_norm ELSE NULL END;
        UPDATE wc_history.matches SET
          home_score_90 = v_of_ft_h, away_score_90 = v_of_ft_a,
          result_90 = CASE WHEN v_of_ft_h > v_of_ft_a THEN 'home_win'
                           WHEN v_of_ft_h < v_of_ft_a THEN 'away_win' ELSE 'draw' END,
          final_winner_name = v_winner_name,
          decided_by = 'regulation',
          score_semantics_status = 'verified'
        WHERE id = v_match_id;
      END IF;

      v_cnt := v_cnt + 1;
    END LOOP;
  END LOOP;

  -- Any group-stage matches still unresolved: infer from existing ft scores
  UPDATE wc_history.matches SET
    home_score_90 = home_score_ft,
    away_score_90 = away_score_ft,
    result_90 = result,
    decided_by = 'regulation',
    score_semantics_status = 'inferred_from_sources'
  WHERE edition_year IN (2010, 2014)
    AND score_semantics_status = 'conflict_unresolved'
    AND stage_code IN ('Group stage', 'Group Stage')
    AND home_score_ft IS NOT NULL;

  RAISE NOTICE 'Korea/variant fix: resolved % additional matches', v_cnt;
END $$;
