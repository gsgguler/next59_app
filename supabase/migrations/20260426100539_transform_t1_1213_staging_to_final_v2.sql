/*
  # Transform Turkish Super Lig 2012/13 from staging to final tables (v2)

  1. Scope
    - Source: staging_football_data_uk_raw WHERE league_code='T1' AND season_code='1213'
    - Only valid rows (home_team IS NOT NULL) — 306 matches
  2. Operations
    a. Upsert competition (code='T1')
    b. Upsert competition_season (T1 1213)
    c. Upsert teams (18 teams, country_code='TR')
    d. Upsert matches (source_provider='football-data.co.uk')
    e. Upsert match_statistics (version=1)
    f. Upsert match_context (version=1, minimal)
    g. Upsert actual_outcomes (version=1, derivation_source='provider_direct')
  3. Fix from v1: derivation_source uses allowed enum value 'provider_direct'
*/

-- A. UPSERT COMPETITION
INSERT INTO public.competitions (
  name, short_name, code, type, country_code, confederation,
  tier, is_domestic, competition_priority, is_active, is_supported
)
VALUES (
  'Turkish Süper Lig', 'Süper Lig', 'T1', 'league', 'TR', 'UEFA',
  1, true, 40, true, true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now();

-- B. UPSERT COMPETITION_SEASON
INSERT INTO public.competition_seasons (
  competition_id, season_code, start_date, end_date,
  is_current, total_matchweeks
)
SELECT
  c.id, '1213', '2012-08-17'::date, '2013-05-19'::date, false, 34
FROM public.competitions c
WHERE c.code = 'T1'
ON CONFLICT (competition_id, season_code) DO UPDATE SET
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  total_matchweeks = EXCLUDED.total_matchweeks,
  updated_at = now();

-- C. UPSERT TEAMS
INSERT INTO public.teams (name, country_code, is_active)
SELECT DISTINCT s.home_team, 'TR', true
FROM public.staging_football_data_uk_raw s
WHERE s.league_code = 'T1'
  AND s.season_code = '1213'
  AND s.home_team IS NOT NULL
ON CONFLICT (name) DO UPDATE SET
  updated_at = now();

-- D. UPSERT MATCHES
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
JOIN public.competition_seasons cs ON cs.competition_id = comp.id AND cs.season_code = '1213'
JOIN public.teams ht ON ht.name = s.home_team
JOIN public.teams at_ ON at_.name = s.away_team
WHERE s.league_code = 'T1'
  AND s.season_code = '1213'
  AND s.home_team IS NOT NULL
ON CONFLICT (source_provider, source_match_id) DO UPDATE SET
  home_goals_ht = EXCLUDED.home_goals_ht,
  away_goals_ht = EXCLUDED.away_goals_ht,
  home_goals_ft = EXCLUDED.home_goals_ft,
  away_goals_ft = EXCLUDED.away_goals_ft,
  source_payload_hash = EXCLUDED.source_payload_hash,
  updated_at = now();

-- E. UPSERT MATCH_STATISTICS
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
  s.hs, s.hst, s.hc, s.hf, COALESCE(s.hy, 0), COALESCE(s.hr, 0),
  s.as_col, s.ast, s.ac, s.af, COALESCE(s.ay, 0), COALESCE(s.ar, 0),
  jsonb_build_object(
    'referee', s.referee,
    'b365h', s.b365h, 'b365d', s.b365d, 'b365a', s.b365a,
    'bwh', s.bwh, 'bwd', s.bwd, 'bwa', s.bwa,
    'iwh', s.iwh, 'iwd', s.iwd, 'iwa', s.iwa,
    'psh', s.psh, 'psd', s.psd, 'psa', s.psa,
    'whh', s.whh, 'whd', s.whd, 'wha', s.wha,
    'vch', s.vch, 'vcd', s.vcd, 'vca', s.vca
  ),
  'football-data.co.uk',
  s.row_hash
FROM public.staging_football_data_uk_raw s
JOIN public.matches m
  ON m.source_provider = 'football-data.co.uk'
  AND m.source_match_id = s.deterministic_source_match_id
WHERE s.league_code = 'T1'
  AND s.season_code = '1213'
  AND s.home_team IS NOT NULL
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

-- F. UPSERT MATCH_CONTEXT (minimal)
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
  AND s.season_code = '1213'
  AND s.home_team IS NOT NULL
ON CONFLICT (match_id, version) DO UPDATE SET
  source_payload_hash = EXCLUDED.source_payload_hash,
  updated_at = now();

-- G. UPSERT ACTUAL_OUTCOMES
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
  COALESCE(s.hy, 0) + COALESCE(s.ay, 0),
  COALESCE(s.hr, 0) + COALESCE(s.ar, 0),
  CASE WHEN s.hc IS NOT NULL AND s.ac IS NOT NULL THEN s.hc + s.ac ELSE NULL END,
  'provider_direct',
  'Derived from staging_football_data_uk_raw T1 1213',
  s.bbavh::float8,
  s.bbavd::float8,
  s.bbava::float8,
  s.bbmxh::float8,
  s.bbmxd::float8,
  s.bbmxa::float8
FROM public.staging_football_data_uk_raw s
JOIN public.matches m
  ON m.source_provider = 'football-data.co.uk'
  AND m.source_match_id = s.deterministic_source_match_id
WHERE s.league_code = 'T1'
  AND s.season_code = '1213'
  AND s.home_team IS NOT NULL
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
