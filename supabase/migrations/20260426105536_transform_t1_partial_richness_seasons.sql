/*
  # Transform T1 partial-richness seasons (1011,1112,1314,1415,1516,1617)

  1. Scope
    - 6 seasons: 1011, 1112, 1314, 1415, 1516, 1617
    - Source: staging_football_data_uk_raw WHERE league_code='T1'
    - Only valid rows (non-null date, teams, FT scores)
    - Expected: 6 x 306 = 1,836 matches added
    - Partial richness: HT/FT scores + odds, no match stats

  2. Operations (FK-safe order)
    a. Upsert 6 competition_seasons
    b. Upsert teams (country_code='TR')
    c. Upsert matches
    d. Upsert match_statistics (stats NULL, cards 0 per NOT NULL constraint, odds in extra_stats)
    e. Upsert match_context (minimal)
    f. Upsert actual_outcomes (no cards/corners, odds from BetBrain aggregates)

  3. Preserves
    - T1 1213, 1718-2425 (different season_codes, no conflict)
    - All non-football-data.co.uk data

  4. Key Decisions
    - match_statistics card columns default to 0 (NOT NULL constraint with DEFAULT 0)
    - Shots, corners, fouls are NULL (nullable columns, data not in source)
    - actual_outcomes cards/corners NULL (data not available)
*/

-- ============================================================
-- A. UPSERT COMPETITION_SEASONS
-- ============================================================
INSERT INTO public.competition_seasons (competition_id, season_code, start_date, end_date, is_current, total_matchweeks)
SELECT c.id, v.season_code, v.start_date::date, v.end_date::date, false, v.total_matchweeks
FROM public.competitions c,
(VALUES
  ('1011', '2010-08-14', '2011-05-22', 34),
  ('1112', '2011-09-10', '2012-04-08', 34),
  ('1314', '2013-08-16', '2014-05-18', 34),
  ('1415', '2014-08-29', '2015-05-30', 34),
  ('1516', '2015-08-14', '2016-05-19', 34),
  ('1617', '2016-08-19', '2017-06-03', 34)
) AS v(season_code, start_date, end_date, total_matchweeks)
WHERE c.code = 'T1'
ON CONFLICT (competition_id, season_code) DO UPDATE SET
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  total_matchweeks = EXCLUDED.total_matchweeks,
  updated_at = now();

-- ============================================================
-- B. UPSERT TEAMS
-- ============================================================
INSERT INTO public.teams (name, country_code, is_active)
SELECT DISTINCT s.home_team, 'TR', true
FROM public.staging_football_data_uk_raw s
WHERE s.league_code = 'T1'
  AND s.season_code IN ('1011','1112','1314','1415','1516','1617')
  AND s.home_team IS NOT NULL
  AND s.fthg IS NOT NULL
ON CONFLICT (name) DO UPDATE SET
  updated_at = now();

-- ============================================================
-- C. UPSERT MATCHES
-- ============================================================
INSERT INTO public.matches (
  competition_season_id,
  home_team_id, away_team_id,
  kickoff_at, timezone, status,
  home_goals_ht, away_goals_ht,
  home_goals_ft, away_goals_ft,
  source_provider, source_match_id, source_payload_hash
)
SELECT
  cs.id,
  ht.id,
  at_.id,
  (s.match_date + COALESCE(s.match_time, '15:00')::time) AT TIME ZONE 'Europe/Istanbul',
  'Europe/Istanbul',
  'finished',
  s.hthg, s.htag,
  s.fthg, s.ftag,
  'football-data.co.uk',
  s.deterministic_source_match_id,
  s.row_hash
FROM public.staging_football_data_uk_raw s
JOIN public.competitions comp ON comp.code = 'T1'
JOIN public.competition_seasons cs ON cs.competition_id = comp.id AND cs.season_code = s.season_code
JOIN public.teams ht ON ht.name = s.home_team
JOIN public.teams at_ ON at_.name = s.away_team
WHERE s.league_code = 'T1'
  AND s.season_code IN ('1011','1112','1314','1415','1516','1617')
  AND s.match_date IS NOT NULL
  AND s.home_team IS NOT NULL
  AND s.away_team IS NOT NULL
  AND s.fthg IS NOT NULL
  AND s.ftag IS NOT NULL
ON CONFLICT (source_provider, source_match_id) DO UPDATE SET
  competition_season_id = EXCLUDED.competition_season_id,
  home_goals_ht = EXCLUDED.home_goals_ht,
  away_goals_ht = EXCLUDED.away_goals_ht,
  home_goals_ft = EXCLUDED.home_goals_ft,
  away_goals_ft = EXCLUDED.away_goals_ft,
  source_payload_hash = EXCLUDED.source_payload_hash,
  updated_at = now();

-- ============================================================
-- D. UPSERT MATCH_STATISTICS
--    Stats columns NULL (no data), card columns 0 (NOT NULL constraint)
--    Odds stored in extra_stats jsonb
-- ============================================================
INSERT INTO public.match_statistics (
  match_id, version, is_current,
  captured_period,
  home_shots_total, home_shots_on_target, home_corners, home_fouls,
  home_yellow_cards, home_red_cards,
  away_shots_total, away_shots_on_target, away_corners, away_fouls,
  away_yellow_cards, away_red_cards,
  extra_stats,
  source_provider, source_payload_hash
)
SELECT
  m.id, 1, true, 'FT',
  NULL, NULL, NULL, NULL,
  0, 0,
  NULL, NULL, NULL, NULL,
  0, 0,
  jsonb_strip_nulls(jsonb_build_object(
    'b365h', s.b365h, 'b365d', s.b365d, 'b365a', s.b365a,
    'bwh', s.bwh, 'bwd', s.bwd, 'bwa', s.bwa,
    'iwh', s.iwh, 'iwd', s.iwd, 'iwa', s.iwa,
    'psh', s.psh, 'psd', s.psd, 'psa', s.psa,
    'whh', s.whh, 'whd', s.whd, 'wha', s.wha,
    'vch', s.vch, 'vcd', s.vcd, 'vca', s.vca,
    'b365ch', s.b365ch, 'b365cd', s.b365cd, 'b365ca', s.b365ca,
    'psch', s.psch, 'pscd', s.pscd, 'psca', s.psca
  )),
  'football-data.co.uk',
  s.row_hash
FROM public.staging_football_data_uk_raw s
JOIN public.matches m
  ON m.source_provider = 'football-data.co.uk'
  AND m.source_match_id = s.deterministic_source_match_id
WHERE s.league_code = 'T1'
  AND s.season_code IN ('1011','1112','1314','1415','1516','1617')
  AND s.match_date IS NOT NULL
  AND s.home_team IS NOT NULL
  AND s.away_team IS NOT NULL
  AND s.fthg IS NOT NULL
  AND s.ftag IS NOT NULL
ON CONFLICT (match_id, version) DO UPDATE SET
  home_shots_total = EXCLUDED.home_shots_total,
  home_shots_on_target = EXCLUDED.home_shots_on_target,
  home_corners = EXCLUDED.home_corners,
  home_fouls = EXCLUDED.home_fouls,
  home_yellow_cards = EXCLUDED.home_yellow_cards,
  home_red_cards = EXCLUDED.home_red_cards,
  away_shots_total = EXCLUDED.away_shots_total,
  away_shots_on_target = EXCLUDED.away_shots_on_target,
  away_corners = EXCLUDED.away_corners,
  away_fouls = EXCLUDED.away_fouls,
  away_yellow_cards = EXCLUDED.away_yellow_cards,
  away_red_cards = EXCLUDED.away_red_cards,
  extra_stats = EXCLUDED.extra_stats,
  source_payload_hash = EXCLUDED.source_payload_hash,
  updated_at = now();

-- ============================================================
-- E. UPSERT MATCH_CONTEXT (minimal)
-- ============================================================
INSERT INTO public.match_context (
  match_id, version, is_current,
  source_provider, source_payload_hash
)
SELECT
  m.id, 1, true,
  'football-data.co.uk',
  s.row_hash
FROM public.staging_football_data_uk_raw s
JOIN public.matches m
  ON m.source_provider = 'football-data.co.uk'
  AND m.source_match_id = s.deterministic_source_match_id
WHERE s.league_code = 'T1'
  AND s.season_code IN ('1011','1112','1314','1415','1516','1617')
  AND s.match_date IS NOT NULL
  AND s.home_team IS NOT NULL
  AND s.away_team IS NOT NULL
  AND s.fthg IS NOT NULL
  AND s.ftag IS NOT NULL
ON CONFLICT (match_id, version) DO UPDATE SET
  source_payload_hash = EXCLUDED.source_payload_hash,
  updated_at = now();

-- ============================================================
-- F. UPSERT ACTUAL_OUTCOMES
--    Cards/corners NULL (no source data for partial seasons)
--    Odds from BetBrain aggregates where available
-- ============================================================
INSERT INTO public.actual_outcomes (
  match_id, version, is_current,
  result_1x2,
  total_goals, home_goals, away_goals,
  over_0_5, over_1_5, over_2_5, over_3_5, over_4_5,
  both_teams_scored, clean_sheet_home, clean_sheet_away,
  total_yellow_cards, total_red_cards, total_corners,
  derivation_source, derivation_notes,
  avg_odds_home, avg_odds_draw, avg_odds_away,
  max_odds_home, max_odds_draw, max_odds_away
)
SELECT
  m.id, 1, true,
  CASE
    WHEN s.fthg > s.ftag THEN '1'
    WHEN s.fthg = s.ftag THEN 'X'
    WHEN s.fthg < s.ftag THEN '2'
  END,
  s.fthg + s.ftag,
  s.fthg, s.ftag,
  (s.fthg + s.ftag) > 0,
  (s.fthg + s.ftag) > 1,
  (s.fthg + s.ftag) > 2,
  (s.fthg + s.ftag) > 3,
  (s.fthg + s.ftag) > 4,
  (s.fthg > 0 AND s.ftag > 0),
  (s.ftag = 0),
  (s.fthg = 0),
  NULL,
  NULL,
  NULL,
  'provider_direct',
  'Derived from staging_football_data_uk_raw T1 ' || s.season_code || ' (partial richness, no card/corner stats)',
  s.bbavh::float8, s.bbavd::float8, s.bbava::float8,
  s.bbmxh::float8, s.bbmxd::float8, s.bbmxa::float8
FROM public.staging_football_data_uk_raw s
JOIN public.matches m
  ON m.source_provider = 'football-data.co.uk'
  AND m.source_match_id = s.deterministic_source_match_id
WHERE s.league_code = 'T1'
  AND s.season_code IN ('1011','1112','1314','1415','1516','1617')
  AND s.match_date IS NOT NULL
  AND s.home_team IS NOT NULL
  AND s.away_team IS NOT NULL
  AND s.fthg IS NOT NULL
  AND s.ftag IS NOT NULL
ON CONFLICT (match_id, version) DO UPDATE SET
  result_1x2 = EXCLUDED.result_1x2,
  total_goals = EXCLUDED.total_goals,
  home_goals = EXCLUDED.home_goals,
  away_goals = EXCLUDED.away_goals,
  over_0_5 = EXCLUDED.over_0_5,
  over_1_5 = EXCLUDED.over_1_5,
  over_2_5 = EXCLUDED.over_2_5,
  over_3_5 = EXCLUDED.over_3_5,
  over_4_5 = EXCLUDED.over_4_5,
  both_teams_scored = EXCLUDED.both_teams_scored,
  clean_sheet_home = EXCLUDED.clean_sheet_home,
  clean_sheet_away = EXCLUDED.clean_sheet_away,
  total_yellow_cards = EXCLUDED.total_yellow_cards,
  total_red_cards = EXCLUDED.total_red_cards,
  total_corners = EXCLUDED.total_corners,
  avg_odds_home = EXCLUDED.avg_odds_home,
  avg_odds_draw = EXCLUDED.avg_odds_draw,
  avg_odds_away = EXCLUDED.avg_odds_away,
  max_odds_home = EXCLUDED.max_odds_home,
  max_odds_draw = EXCLUDED.max_odds_draw,
  max_odds_away = EXCLUDED.max_odds_away,
  updated_at = now();
