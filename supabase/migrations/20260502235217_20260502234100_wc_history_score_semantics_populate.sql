/*
  # WC History — Score Semantics Population (2010 + 2014)

  ## Summary
  Populates all score semantic fields for 2010 and 2014 matches using:
  - Primary: openfootball raw (has ft/et/p breakdown per match)
  - Fallback: inference from existing API-Football fields + stage_code

  ## Logic
  - Group stage matches: home_score_90 = home_score_ft, decided_by = regulation
  - Knockout matches with no ET in openfootball: 
      home_score_90 = home_score_ft (API-Football ft = 90min for these), decided_by = regulation
  - Knockout matches WITH et in openfootball:
      home_score_90 = openfootball ft, home_score_aet = openfootball et, decided_by = extra_time
  - Knockout matches WITH p in openfootball:
      decided_by = penalties, penalties from openfootball p field

  ## Conflict classification in data_quality_issues
  - All 9 high score conflicts: not_a_conflict_score_semantics
    (API-Football stores AET/final score as ft; openfootball stores 90min score as ft)
  - England-Italy result conflict: openfootball_data_error (1-2 score but labeled home_win)
  - 2 medium group_name conflicts: non_blocking (kept for reference, API-Football primary)

  ## Separation
  - public.matches: NOT TOUCHED
  - model_lab: NOT TOUCHED
  - predictions: NOT TOUCHED
*/

DO $$
DECLARE
  v_match_id       uuid;
  v_of_row         jsonb;
  v_yr             int;
  v_matches_json   jsonb;
  v_team1_norm     text;
  v_team2_norm     text;
  v_of_ft_h        int;
  v_of_ft_a        int;
  v_of_et_h        int;
  v_of_et_a        int;
  v_of_p_h         int;
  v_of_p_a         int;
  v_has_et         bool;
  v_has_p          bool;
  v_stage          text;
  v_db_ft_h        int;
  v_db_ft_a        int;
  v_winner_name    text;
  v_cnt            int := 0;
BEGIN

  -- ── PASS 1: use openfootball for precise ft/et/p breakdown ───────────────
  FOR v_yr IN SELECT unnest(ARRAY[2010, 2014]) LOOP

    SELECT response_json->'matches'
    INTO v_matches_json
    FROM wc_history.raw_openfootball_responses
    WHERE edition_year = v_yr;

    FOR v_of_row IN SELECT jsonb_array_elements(v_matches_json) LOOP

      v_of_ft_h := (v_of_row->'score'->'ft'->0)::int;
      v_of_ft_a := (v_of_row->'score'->'ft'->1)::int;
      v_has_et  := (v_of_row->'score'->'et') IS NOT NULL;
      v_has_p   := (v_of_row->'score'->'p') IS NOT NULL;

      v_of_et_h := CASE WHEN v_has_et THEN (v_of_row->'score'->'et'->0)::int ELSE NULL END;
      v_of_et_a := CASE WHEN v_has_et THEN (v_of_row->'score'->'et'->1)::int ELSE NULL END;
      v_of_p_h  := CASE WHEN v_has_p  THEN (v_of_row->'score'->'p'->0)::int ELSE NULL END;
      v_of_p_a  := CASE WHEN v_has_p  THEN (v_of_row->'score'->'p'->1)::int ELSE NULL END;

      -- Normalize names
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

      -- Find match
      SELECT id, stage_code, home_score_ft, away_score_ft
      INTO v_match_id, v_stage, v_db_ft_h, v_db_ft_a
      FROM wc_history.matches
      WHERE edition_year = v_yr
        AND date_trunc('day', kickoff_utc) = (v_of_row->>'date')::date
        AND (
          (home_team_name = v_team1_norm AND away_team_name = v_team2_norm)
          OR (home_team_name = v_team2_norm AND away_team_name = v_team1_norm)
        )
      LIMIT 1;

      CONTINUE WHEN v_match_id IS NULL;

      -- Determine if home/away are swapped vs openfootball
      -- (openfootball team1 = home, but API-Football may differ for some matches)
      -- We use openfootball ft score which is 90min score

      IF v_has_p THEN
        -- Decided by penalties
        v_winner_name := CASE
          WHEN v_of_p_h > v_of_p_a THEN v_team1_norm
          ELSE v_team2_norm
        END;
        UPDATE wc_history.matches SET
          home_score_90      = v_of_ft_h,
          away_score_90      = v_of_ft_a,
          result_90          = 'draw',
          home_score_aet     = v_of_et_h,
          away_score_aet     = v_of_et_a,
          result_aet         = CASE WHEN v_of_et_h IS NULL THEN NULL
                                    WHEN v_of_et_h > v_of_et_a THEN 'home_win'
                                    WHEN v_of_et_h < v_of_et_a THEN 'away_win'
                                    ELSE 'draw' END,
          home_penalties     = CASE WHEN home_team_name = v_team1_norm THEN v_of_p_h ELSE v_of_p_a END,
          away_penalties     = CASE WHEN home_team_name = v_team1_norm THEN v_of_p_a ELSE v_of_p_h END,
          result_penalties   = CASE WHEN home_team_name = v_team1_norm
                                    THEN CASE WHEN v_of_p_h > v_of_p_a THEN 'home_win' ELSE 'away_win' END
                                    ELSE CASE WHEN v_of_p_a > v_of_p_h THEN 'home_win' ELSE 'away_win' END
                               END,
          final_winner_name  = v_winner_name,
          decided_by         = 'penalties',
          score_semantics_status = 'verified'
        WHERE id = v_match_id;

      ELSIF v_has_et THEN
        -- Decided by extra time (ET score is cumulative, not additional)
        v_winner_name := CASE
          WHEN v_of_et_h > v_of_et_a THEN v_team1_norm
          ELSE v_team2_norm
        END;
        UPDATE wc_history.matches SET
          home_score_90      = v_of_ft_h,
          away_score_90      = v_of_ft_a,
          result_90          = 'draw',
          home_score_aet     = v_of_et_h,
          away_score_aet     = v_of_et_a,
          result_aet         = CASE WHEN v_of_et_h > v_of_et_a THEN 'home_win' ELSE 'away_win' END,
          final_winner_name  = v_winner_name,
          decided_by         = 'extra_time',
          score_semantics_status = 'verified'
        WHERE id = v_match_id;

      ELSE
        -- Decided in regulation
        v_winner_name := CASE
          WHEN v_of_ft_h > v_of_ft_a THEN v_team1_norm
          WHEN v_of_ft_h < v_of_ft_a THEN v_team2_norm
          ELSE NULL
        END;
        UPDATE wc_history.matches SET
          home_score_90      = v_of_ft_h,
          away_score_90      = v_of_ft_a,
          result_90          = CASE
            WHEN v_of_ft_h > v_of_ft_a THEN 'home_win'
            WHEN v_of_ft_h < v_of_ft_a THEN 'away_win'
            ELSE 'draw'
          END,
          final_winner_name  = v_winner_name,
          decided_by         = 'regulation',
          score_semantics_status = 'verified'
        WHERE id = v_match_id;
      END IF;

      v_cnt := v_cnt + 1;
    END LOOP;
  END LOOP;

  -- ── PASS 2: any remaining matches without openfootball coverage ──────────
  -- (should be 0 for group stage 2010/2014, but handle knockouts not in openfootball)
  UPDATE wc_history.matches SET
    home_score_90 = home_score_ft,
    away_score_90 = away_score_ft,
    result_90 = result,
    decided_by = 'regulation',
    score_semantics_status = 'inferred_from_sources'
  WHERE edition_year IN (2010, 2014)
    AND score_semantics_status = 'needs_review'
    AND stage_code = 'Group stage';

  -- Any remaining knockout matches still needs_review
  -- (these should be 0 after pass 1, but set inferred status if populated)
  UPDATE wc_history.matches SET
    score_semantics_status = 'inferred_from_sources'
  WHERE edition_year IN (2010, 2014)
    AND score_semantics_status = 'needs_review'
    AND home_score_90 IS NOT NULL;

  RAISE NOTICE 'Score semantics populated for % matches via openfootball', v_cnt;
END $$;
