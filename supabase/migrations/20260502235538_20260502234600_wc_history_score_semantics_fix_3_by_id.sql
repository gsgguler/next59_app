/*
  # WC History — Score Semantics: Final fix for 3 remaining matches (by ID)

  API-Football stored "South Korea" / "USA" (not normalized to Korea Republic / United States),
  so name-based lookup missed these. Fixing directly by UUID.

  Sources (openfootball verified):
  - Uruguay vs South Korea 2010-06-26: ft=[2,1] no ET → regulation
  - USA vs Ghana 2010-06-26: ft=[1,1] et=[1,2] → extra_time, Ghana wins
  - Belgium vs USA 2014-07-01: ft=[0,0] et=[2,1] → extra_time, Belgium wins
*/

UPDATE wc_history.matches SET
  home_score_90 = 2, away_score_90 = 1,
  result_90 = 'home_win',
  final_winner_name = 'Uruguay',
  decided_by = 'regulation',
  score_semantics_status = 'verified'
WHERE id = '7c0ca704-020e-4753-834b-de448eb04c0a';

UPDATE wc_history.matches SET
  home_score_90 = 1, away_score_90 = 1,
  result_90 = 'draw',
  home_score_aet = 1, away_score_aet = 2,
  result_aet = 'away_win',
  final_winner_name = 'Ghana',
  decided_by = 'extra_time',
  score_semantics_status = 'verified'
WHERE id = '3608db79-d7cc-484c-9902-87f874b7c869';

UPDATE wc_history.matches SET
  home_score_90 = 0, away_score_90 = 0,
  result_90 = 'draw',
  home_score_aet = 2, away_score_aet = 1,
  result_aet = 'home_win',
  final_winner_name = 'Belgium',
  decided_by = 'extra_time',
  score_semantics_status = 'verified'
WHERE id = '2fc4faa7-caab-4097-9046-60204342e6b7';
