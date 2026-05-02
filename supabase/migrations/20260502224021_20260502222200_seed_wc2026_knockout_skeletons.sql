/*
  # Seed 32 knockout skeleton fixtures (M73–M104)

  ## Summary
  Inserts placeholder rows for all knockout-stage matches per the official
  FIFA World Cup 2026 match schedule published at:
  https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/knockout-stage-match-schedule-bracket

  ## Rules
  - fixture_status = 'placeholder' for all knockout rows
  - home_team_name / away_team_name = NULL (unknown until group stage ends)
  - home_team_placeholder / away_team_placeholder = official FIFA qualifier description
  - api_football_fixture_id = NULL (not yet available from provider)
  - ingestion_run_id = NULL (manually seeded, not from API ingestion)
  - source_url = FIFA official article URL

  ## Match numbers follow FIFA official numbering (M73–M104):
  Round of 32:  M73–M88  (16 matches)
  Round of 16:  M89–M96  (8 matches)
  Quarter-final: M97–M100 (4 matches)
  Semi-final:   M101–M102 (2 matches)
  Third Place:  M103       (1 match)
  Final:        M104       (1 match)

  ## No model / no predictions / no strength engine touched
*/

DO $$
DECLARE
  v_source text := 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/knockout-stage-match-schedule-bracket';
  v_checked timestamptz := now();

  -- venue UUIDs
  v_LA        uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'SoFi Stadium');
  v_Boston    uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'Gillette Stadium');
  v_Monterrey uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'Estadio BBVA');
  v_Houston   uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'NRG Stadium');
  v_NYC       uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'MetLife Stadium');
  v_Dallas    uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'AT&T Stadium');
  v_MexCity   uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'Estadio Azteca');
  v_Atlanta   uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'Mercedes-Benz Stadium');
  v_SF        uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'Levi''s Stadium');
  v_Seattle   uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'Lumen Field');
  v_Toronto   uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'BMO Field');
  v_Vancouver uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'BC Place');
  v_Miami     uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'Hard Rock Stadium');
  v_KC        uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'Arrowhead Stadium');
  v_Philly    uuid := (SELECT id FROM public.wc2026_venues WHERE venue_name = 'Lincoln Financial Field');

BEGIN
  -- Guard: remove existing knockouts to allow idempotent re-run
  DELETE FROM public.wc2026_fixtures WHERE stage_code IN ('Round of 32','Round of 16','Quarter-final','Semi-final','Third Place','Final');

  -- ── ROUND OF 32 (M73–M88) ────────────────────────────────────────────────

  INSERT INTO public.wc2026_fixtures
    (match_number, stage_code, round_label, match_date,
     home_team_placeholder, away_team_placeholder,
     venue_id, venue_name_raw, fixture_status, source_url, source_checked_at)
  VALUES
  -- Sun 28 Jun
  (73, 'Round of 32', 'Round of 32', '2026-06-28T17:00:00Z',
   'Runner-up Group A', 'Runner-up Group B',
   v_LA, 'SoFi Stadium', 'placeholder', v_source, v_checked),

  -- Mon 29 Jun
  (74, 'Round of 32', 'Round of 32', '2026-06-29T16:30:00Z',
   'Winner Group E', '3rd Place Group A/B/C/D/F',
   v_Boston, 'Gillette Stadium', 'placeholder', v_source, v_checked),

  (75, 'Round of 32', 'Round of 32', '2026-06-29T20:00:00Z',
   'Winner Group F', 'Runner-up Group C',
   v_Monterrey, 'Estadio BBVA', 'placeholder', v_source, v_checked),

  (76, 'Round of 32', 'Round of 32', '2026-06-29T13:00:00Z',
   'Winner Group C', 'Runner-up Group F',
   v_Houston, 'NRG Stadium', 'placeholder', v_source, v_checked),

  -- Tue 30 Jun
  (77, 'Round of 32', 'Round of 32', '2026-06-30T17:00:00Z',
   'Winner Group I', '3rd Place Group C/D/F/G/H',
   v_NYC, 'MetLife Stadium', 'placeholder', v_source, v_checked),

  (78, 'Round of 32', 'Round of 32', '2026-06-30T21:00:00Z',
   'Runner-up Group E', 'Runner-up Group I',
   v_Dallas, 'AT&T Stadium', 'placeholder', v_source, v_checked),

  (79, 'Round of 32', 'Round of 32', '2026-06-30T21:00:00Z',
   'Winner Group A', '3rd Place Group C/E/F/H/I',
   v_MexCity, 'Estadio Azteca', 'placeholder', v_source, v_checked),

  -- Wed 1 Jul
  (80, 'Round of 32', 'Round of 32', '2026-07-01T20:00:00Z',
   'Winner Group L', '3rd Place Group E/H/I/J/K',
   v_Atlanta, 'Mercedes-Benz Stadium', 'placeholder', v_source, v_checked),

  (81, 'Round of 32', 'Round of 32', '2026-07-01T20:00:00Z',
   'Winner Group D', '3rd Place Group B/E/F/I/J',
   v_SF, 'Levi''s Stadium', 'placeholder', v_source, v_checked),

  (82, 'Round of 32', 'Round of 32', '2026-07-01T17:00:00Z',
   'Winner Group G', '3rd Place Group A/E/H/I/J',
   v_Seattle, 'Lumen Field', 'placeholder', v_source, v_checked),

  -- Thu 2 Jul
  (83, 'Round of 32', 'Round of 32', '2026-07-02T17:00:00Z',
   'Runner-up Group K', 'Runner-up Group L',
   v_Toronto, 'BMO Field', 'placeholder', v_source, v_checked),

  (84, 'Round of 32', 'Round of 32', '2026-07-02T21:00:00Z',
   'Winner Group H', 'Runner-up Group J',
   v_LA, 'SoFi Stadium', 'placeholder', v_source, v_checked),

  (85, 'Round of 32', 'Round of 32', '2026-07-02T17:00:00Z',
   'Winner Group B', '3rd Place Group E/F/G/I/J',
   v_Vancouver, 'BC Place', 'placeholder', v_source, v_checked),

  -- Fri 3 Jul
  (86, 'Round of 32', 'Round of 32', '2026-07-03T21:00:00Z',
   'Winner Group J', 'Runner-up Group H',
   v_Miami, 'Hard Rock Stadium', 'placeholder', v_source, v_checked),

  (87, 'Round of 32', 'Round of 32', '2026-07-03T21:30:00Z',
   'Winner Group K', '3rd Place Group D/E/I/J/L',
   v_KC, 'Arrowhead Stadium', 'placeholder', v_source, v_checked),

  (88, 'Round of 32', 'Round of 32', '2026-07-03T21:00:00Z',
   'Runner-up Group D', 'Runner-up Group G',
   v_Dallas, 'AT&T Stadium', 'placeholder', v_source, v_checked),

  -- ── ROUND OF 16 (M89–M96) ─────────────────────────────────────────────────

  -- Sat 4 Jul
  (89, 'Round of 16', 'Round of 16', '2026-07-04T16:30:00Z',
   'Winner Match 74', 'Winner Match 77',
   v_Philly, 'Lincoln Financial Field', 'placeholder', v_source, v_checked),

  (90, 'Round of 16', 'Round of 16', '2026-07-04T20:00:00Z',
   'Winner Match 73', 'Winner Match 75',
   v_Houston, 'NRG Stadium', 'placeholder', v_source, v_checked),

  -- Sun 5 Jul
  (91, 'Round of 16', 'Round of 16', '2026-07-05T17:00:00Z',
   'Winner Match 76', 'Winner Match 78',
   v_NYC, 'MetLife Stadium', 'placeholder', v_source, v_checked),

  (92, 'Round of 16', 'Round of 16', '2026-07-05T21:00:00Z',
   'Winner Match 79', 'Winner Match 80',
   v_MexCity, 'Estadio Azteca', 'placeholder', v_source, v_checked),

  -- Mon 6 Jul
  (93, 'Round of 16', 'Round of 16', '2026-07-06T17:00:00Z',
   'Winner Match 83', 'Winner Match 84',
   v_Dallas, 'AT&T Stadium', 'placeholder', v_source, v_checked),

  (94, 'Round of 16', 'Round of 16', '2026-07-06T20:30:00Z',
   'Winner Match 81', 'Winner Match 82',
   v_Seattle, 'Lumen Field', 'placeholder', v_source, v_checked),

  -- Tue 7 Jul
  (95, 'Round of 16', 'Round of 16', '2026-07-07T17:00:00Z',
   'Winner Match 86', 'Winner Match 88',
   v_Atlanta, 'Mercedes-Benz Stadium', 'placeholder', v_source, v_checked),

  (96, 'Round of 16', 'Round of 16', '2026-07-07T20:30:00Z',
   'Winner Match 85', 'Winner Match 87',
   v_Vancouver, 'BC Place', 'placeholder', v_source, v_checked),

  -- ── QUARTER-FINALS (M97–M100) ─────────────────────────────────────────────

  -- Thu 9 Jul
  (97, 'Quarter-final', 'Quarter-final', '2026-07-09T20:00:00Z',
   'Winner Match 89', 'Winner Match 90',
   v_Boston, 'Gillette Stadium', 'placeholder', v_source, v_checked),

  -- Fri 10 Jul
  (98, 'Quarter-final', 'Quarter-final', '2026-07-10T21:00:00Z',
   'Winner Match 93', 'Winner Match 94',
   v_LA, 'SoFi Stadium', 'placeholder', v_source, v_checked),

  -- Sat 11 Jul
  (99, 'Quarter-final', 'Quarter-final', '2026-07-11T17:00:00Z',
   'Winner Match 91', 'Winner Match 92',
   v_Miami, 'Hard Rock Stadium', 'placeholder', v_source, v_checked),

  (100, 'Quarter-final', 'Quarter-final', '2026-07-11T21:00:00Z',
   'Winner Match 95', 'Winner Match 96',
   v_KC, 'Arrowhead Stadium', 'placeholder', v_source, v_checked),

  -- ── SEMI-FINALS (M101–M102) ───────────────────────────────────────────────

  -- Tue 14 Jul
  (101, 'Semi-final', 'Semi-final', '2026-07-14T21:00:00Z',
   'Winner Match 97', 'Winner Match 98',
   v_Dallas, 'AT&T Stadium', 'placeholder', v_source, v_checked),

  -- Wed 15 Jul
  (102, 'Semi-final', 'Semi-final', '2026-07-15T21:00:00Z',
   'Winner Match 99', 'Winner Match 100',
   v_Atlanta, 'Mercedes-Benz Stadium', 'placeholder', v_source, v_checked),

  -- ── THIRD PLACE (M103) ────────────────────────────────────────────────────

  -- Sat 18 Jul
  (103, 'Third Place', 'Third Place', '2026-07-18T21:00:00Z',
   'Runner-up Match 101', 'Runner-up Match 102',
   v_Miami, 'Hard Rock Stadium', 'placeholder', v_source, v_checked),

  -- ── FINAL (M104) ──────────────────────────────────────────────────────────

  -- Sun 19 Jul
  (104, 'Final', 'Final', '2026-07-19T20:00:00Z',
   'Winner Match 101', 'Winner Match 102',
   v_NYC, 'MetLife Stadium', 'placeholder', v_source, v_checked);

END $$;
