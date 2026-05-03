/*
  # Seed 2010-2022 edition metadata + expose events via public view

  1. Updates editions rows for 2010, 2014, 2018, 2022 with correct host/champion data
  2. Creates public.wch_events view for gol/kart/change event details
  3. Grants anon/authenticated read on the new view
*/

-- Update edition metadata (match counts already exist in wch_matches)
UPDATE wc_history.editions SET
  host_country = 'South Africa',
  champion = 'Spain',
  total_matches = 64,
  total_teams = 32,
  start_date = '2010-06-11',
  end_date = '2010-07-11'
WHERE edition_year = 2010;

UPDATE wc_history.editions SET
  host_country = 'Brazil',
  champion = 'Germany',
  total_matches = 64,
  total_teams = 32,
  start_date = '2014-06-12',
  end_date = '2014-07-13'
WHERE edition_year = 2014;

UPDATE wc_history.editions SET
  host_country = 'Russia',
  champion = 'France',
  total_matches = 64,
  total_teams = 32,
  start_date = '2018-06-14',
  end_date = '2018-07-15'
WHERE edition_year = 2018;

UPDATE wc_history.editions SET
  host_country = 'Qatar',
  champion = 'Argentina',
  total_matches = 64,
  total_teams = 32,
  start_date = '2022-11-20',
  end_date = '2022-12-18'
WHERE edition_year = 2022;

-- Public view for events (goals, cards, substitutions)
CREATE OR REPLACE VIEW public.wch_events AS
SELECT
  e.id,
  e.match_id,
  e.elapsed,
  e.extra_time,
  e.event_type,
  e.event_detail,
  e.player_name,
  e.assist_player_name,
  e.comments,
  t.name_en AS team_name
FROM wc_history.events e
LEFT JOIN wc_history.teams t ON t.id = e.team_id;

GRANT SELECT ON public.wch_events TO anon, authenticated;
