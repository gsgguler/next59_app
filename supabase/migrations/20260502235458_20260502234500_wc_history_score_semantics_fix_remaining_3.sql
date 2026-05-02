/*
  # WC History — Score Semantics: Fix remaining 3 conflict_unresolved matches

  ## Summary
  3 matches remain at conflict_unresolved because the populate pass matched by
  date + team name but the UPDATE only fired on score_semantics_status = 'needs_review'.
  The conflict_unresolved status was set AFTER the populate pass ran (by the resolution
  migration's final UPDATE block). Fix by re-running populate for these 3 via
  openfootball date+score fallback.

  Matches:
  - Uruguay vs South Korea (2010-06-26): 2-1, regulation → verified
  - USA vs Ghana (2010-06-26): 1-1 at 90min → 1-2 AET (ET score from openfootball) → extra_time
  - Belgium vs USA (2014-07-01): 0-0 at 90min → 2-1 AET → extra_time
*/

DO $$
DECLARE
  v_match_id uuid;
BEGIN

  -- Uruguay vs South Korea: 2-1 regulation (openfootball ft=[2,1], no et, no p)
  SELECT id INTO v_match_id FROM wc_history.matches
  WHERE edition_year = 2010
    AND date_trunc('day', kickoff_utc) = '2010-06-26'::date
    AND home_team_name = 'Uruguay' AND away_team_name = 'Korea Republic';

  IF v_match_id IS NOT NULL THEN
    UPDATE wc_history.matches SET
      home_score_90 = 2, away_score_90 = 1,
      result_90 = 'home_win',
      final_winner_name = 'Uruguay',
      decided_by = 'regulation',
      score_semantics_status = 'verified'
    WHERE id = v_match_id;
  END IF;

  -- USA vs Ghana: 1-1 at 90min, 1-2 AET (openfootball et=[1,2], ft=[1,1])
  SELECT id INTO v_match_id FROM wc_history.matches
  WHERE edition_year = 2010
    AND date_trunc('day', kickoff_utc) = '2010-06-26'::date
    AND home_team_name = 'United States' AND away_team_name = 'Ghana';

  IF v_match_id IS NOT NULL THEN
    UPDATE wc_history.matches SET
      home_score_90 = 1, away_score_90 = 1,
      result_90 = 'draw',
      home_score_aet = 1, away_score_aet = 2,
      result_aet = 'away_win',
      final_winner_name = 'Ghana',
      decided_by = 'extra_time',
      score_semantics_status = 'verified'
    WHERE id = v_match_id;
  END IF;

  -- Belgium vs USA: 0-0 at 90min, 2-1 AET (openfootball et=[2,1], ft=[0,0])
  SELECT id INTO v_match_id FROM wc_history.matches
  WHERE edition_year = 2014
    AND date_trunc('day', kickoff_utc) = '2014-07-01'::date
    AND home_team_name = 'Belgium' AND away_team_name = 'United States';

  IF v_match_id IS NOT NULL THEN
    UPDATE wc_history.matches SET
      home_score_90 = 0, away_score_90 = 0,
      result_90 = 'draw',
      home_score_aet = 2, away_score_aet = 1,
      result_aet = 'home_win',
      final_winner_name = 'Belgium',
      decided_by = 'extra_time',
      score_semantics_status = 'verified'
    WHERE id = v_match_id;
  END IF;

END $$;
