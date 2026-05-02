/*
  # Create public read-only views for wc_history

  ## Summary
  Safe sanitized views exposed in the public schema.
  Strips raw_payload, ingestion_run_id, provider secrets, audit internals.
  Anon users may SELECT only these views.

  ## Views
  - public.v_world_cup_editions
  - public.v_world_cup_matches
  - public.v_world_cup_teams
  - public.v_world_cup_match_statistics
  - public.v_world_cup_events
  - public.v_world_cup_groups
  - public.v_world_cup_venues
*/

-- ── v_world_cup_editions ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_world_cup_editions
WITH (security_invoker = true)
AS
SELECT
  edition_year,
  host_country,
  host_countries,
  start_date,
  end_date,
  teams_count,
  matches_count,
  source_status,
  data_quality_status
FROM wc_history.editions
WHERE data_quality_status != 'blocked';

GRANT SELECT ON public.v_world_cup_editions TO anon, authenticated;

-- ── v_world_cup_teams ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_world_cup_teams
WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.edition_year,
  t.fifa_code,
  t.iso2,
  t.iso3,
  t.name_en,
  t.name_tr,
  t.flag_asset,
  t.confederation,
  t.data_quality_status
FROM wc_history.teams t;

GRANT SELECT ON public.v_world_cup_teams TO anon, authenticated;

-- ── v_world_cup_matches ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_world_cup_matches
WITH (security_invoker = true)
AS
SELECT
  m.id,
  m.edition_year,
  m.match_no,
  m.stage_code,
  m.stage_name_en,
  m.stage_name_tr,
  m.group_name,
  m.match_date,
  m.kickoff_utc,
  m.home_team_name,
  m.away_team_name,
  ht.name_en  AS home_team_name_en,
  ht.iso2     AS home_team_iso2,
  ht.flag_asset AS home_team_flag,
  at.name_en  AS away_team_name_en,
  at.iso2     AS away_team_iso2,
  at.flag_asset AS away_team_flag,
  m.home_score_ft,
  m.away_score_ft,
  m.home_score_ht,
  m.away_score_ht,
  m.result,
  m.venue_name,
  m.city,
  m.country,
  m.attendance,
  m.referee,
  m.match_status,
  m.fixture_status,
  m.data_quality_status
FROM wc_history.matches m
LEFT JOIN wc_history.teams ht ON ht.id = m.home_team_id
LEFT JOIN wc_history.teams at ON at.id = m.away_team_id;

GRANT SELECT ON public.v_world_cup_matches TO anon, authenticated;

-- ── v_world_cup_match_statistics ──────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_world_cup_match_statistics
WITH (security_invoker = true)
AS
SELECT
  s.id,
  m.edition_year,
  s.match_id,
  t.name_en   AS team_name,
  t.iso2      AS team_iso2,
  s.stat_name,
  s.stat_value,
  s.stat_numeric,
  s.data_quality_status
FROM wc_history.match_statistics s
JOIN wc_history.matches m ON m.id = s.match_id
LEFT JOIN wc_history.teams t ON t.id = s.team_id;

GRANT SELECT ON public.v_world_cup_match_statistics TO anon, authenticated;

-- ── v_world_cup_events ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_world_cup_events
WITH (security_invoker = true)
AS
SELECT
  e.id,
  m.edition_year,
  e.match_id,
  t.name_en    AS team_name,
  t.iso2       AS team_iso2,
  e.elapsed,
  e.extra_time,
  e.event_type,
  e.event_detail,
  e.player_name,
  e.assist_player_name,
  e.comments,
  e.data_quality_status
FROM wc_history.events e
JOIN wc_history.matches m ON m.id = e.match_id
LEFT JOIN wc_history.teams t ON t.id = e.team_id;

GRANT SELECT ON public.v_world_cup_events TO anon, authenticated;

-- ── v_world_cup_groups ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_world_cup_groups
WITH (security_invoker = true)
AS
SELECT
  g.id,
  g.edition_year,
  g.group_name,
  t.name_en    AS team_name,
  t.iso2       AS team_iso2,
  t.flag_asset AS team_flag,
  g.position,
  g.played,
  g.won,
  g.drawn,
  g.lost,
  g.goals_for,
  g.goals_against,
  g.goal_difference,
  g.points,
  g.data_quality_status
FROM wc_history.groups g
LEFT JOIN wc_history.teams t ON t.id = g.team_id;

GRANT SELECT ON public.v_world_cup_groups TO anon, authenticated;

-- ── v_world_cup_venues ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_world_cup_venues
WITH (security_invoker = true)
AS
SELECT
  id,
  edition_year,
  venue_name,
  city,
  country,
  capacity,
  data_quality_status
FROM wc_history.venues;

GRANT SELECT ON public.v_world_cup_venues TO anon, authenticated;
