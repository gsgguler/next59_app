/*
  # Phase 8 — Feature Layer Integration: H2H, Squad & Venue Context

  ## Summary
  Non-breaking additive enrichment functions. H2H history, squad freshness,
  and venue altitude/capacity are surfaced as context functions.

  The enriched view uses shared.af_fixtures_raw (which has team IDs in raw_response)
  joined with af_venues_normalized and h2h/squad summary views.

  All additions are graceful — NULL-safe COALESCE throughout.
  If H2H/squad feeds are empty, functions return data_available=false.

  ## New Functions
  - get_h2h_feature_context(home_id, away_id)
  - get_venue_context(venue_id)
  - get_squad_freshness(team_id)

  ## New Views
  - v_match_context_enriched — upcoming fixtures with H2H, venue, squad context
*/

-- ─────────────────────────────────────────────
-- H2H feature context function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_h2h_feature_context(
  p_home_team_id integer,
  p_away_team_id integer
)
RETURNS TABLE (
  total_matches        integer,
  home_team_wins       integer,
  away_team_wins       integer,
  draws                integer,
  home_win_rate        numeric,
  away_win_rate        numeric,
  draw_rate            numeric,
  avg_total_goals      numeric,
  last_meeting_date    date,
  recent_3y_count      integer,
  recent_3y_draw_rate  numeric,
  h2h_data_available   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t1 integer := LEAST(p_home_team_id, p_away_team_id);
  v_t2 integer := GREATEST(p_home_team_id, p_away_team_id);
  v_row record;
BEGIN
  SELECT * INTO v_row
  FROM public.v_recent_h2h_summary s
  WHERE s.af_team1_id = v_t1 AND s.af_team2_id = v_t2;

  IF NOT FOUND OR v_row.total_matches = 0 THEN
    RETURN QUERY SELECT
      0::integer, 0::integer, 0::integer, 0::integer,
      NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
      NULL::date, 0::integer, NULL::numeric, false;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_row.total_matches::integer,
    CASE WHEN p_home_team_id = v_t1 THEN v_row.team1_wins ELSE v_row.team2_wins END::integer,
    CASE WHEN p_away_team_id = v_t2 THEN v_row.team2_wins ELSE v_row.team1_wins END::integer,
    v_row.draws::integer,
    CASE WHEN v_row.total_matches > 0
      THEN ROUND(
        CASE WHEN p_home_team_id = v_t1 THEN v_row.team1_wins ELSE v_row.team2_wins END::numeric
        / v_row.total_matches, 3)
      ELSE NULL END,
    CASE WHEN v_row.total_matches > 0
      THEN ROUND(
        CASE WHEN p_away_team_id = v_t2 THEN v_row.team2_wins ELSE v_row.team1_wins END::numeric
        / v_row.total_matches, 3)
      ELSE NULL END,
    CASE WHEN v_row.total_matches > 0
      THEN ROUND(v_row.draws::numeric / v_row.total_matches, 3)
      ELSE NULL END,
    v_row.avg_total_goals,
    v_row.last_meeting_date,
    v_row.recent_3y_count::integer,
    CASE WHEN v_row.recent_3y_count > 0
      THEN ROUND(v_row.recent_3y_draws::numeric / v_row.recent_3y_count, 3)
      ELSE NULL END,
    true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_h2h_feature_context(integer, integer) TO anon, authenticated;

-- ─────────────────────────────────────────────
-- Venue context function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_venue_context(
  p_venue_id integer
)
RETURNS TABLE (
  venue_name              text,
  city                    text,
  country                 text,
  capacity                integer,
  surface                 text,
  altitude_meters         integer,
  is_wc2026_venue         boolean,
  venue_context_warning   text,
  data_available          boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean := false;
BEGIN
  RETURN QUERY
  SELECT
    v.name,
    v.city,
    v.country,
    v.capacity,
    v.surface,
    v.altitude_meters,
    COALESCE(v.is_wc2026_venue, false),
    v.venue_context_warning,
    true AS data_available
  FROM af_venues_normalized v
  WHERE v.af_venue_id = p_venue_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      NULL::text, NULL::text, NULL::text, NULL::integer,
      NULL::text, NULL::integer, false, NULL::text, false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_context(integer) TO anon, authenticated;

-- ─────────────────────────────────────────────
-- Squad freshness function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_squad_freshness(
  p_team_id integer
)
RETURNS TABLE (
  team_name         text,
  squad_size        integer,
  avg_age           numeric,
  gk_count          integer,
  def_count         integer,
  mid_count         integer,
  att_count         integer,
  last_synced_at    timestamptz,
  data_available    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.team_name,
    p.squad_size::integer,
    p.avg_age,
    p.gk_count::integer,
    p.def_count::integer,
    p.mid_count::integer,
    p.att_count::integer,
    p.last_synced_at,
    true AS data_available
  FROM public.v_squad_continuity_profile p
  WHERE p.af_team_id = p_team_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      NULL::text, 0::integer, NULL::numeric,
      0::integer, 0::integer, 0::integer, 0::integer,
      NULL::timestamptz, false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_squad_freshness(integer) TO anon, authenticated;

-- ─────────────────────────────────────────────
-- Enriched match context view (upcoming fixtures only)
-- Uses shared.af_fixtures_raw JSON extraction for team IDs + venue
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_match_context_enriched AS
SELECT
  f.fixture_id                                                          AS af_fixture_id,
  f.league_id                                                           AS af_league_id,
  f.season                                                              AS af_season,
  (f.raw_response -> 'fixture' ->> 'date')::timestamptz                AS kickoff_utc,
  (f.raw_response -> 'teams' -> 'home' ->> 'id')::integer              AS home_team_id,
  (f.raw_response -> 'teams' -> 'away' ->> 'id')::integer              AS away_team_id,
  f.raw_response -> 'teams' -> 'home' ->> 'name'                       AS home_team_name,
  f.raw_response -> 'teams' -> 'away' ->> 'name'                       AS away_team_name,
  (f.raw_response -> 'fixture' -> 'venue' ->> 'id')::integer           AS venue_id,
  -- Venue enrichment
  v.name                  AS venue_name,
  v.city                  AS venue_city,
  v.capacity              AS venue_capacity,
  v.altitude_meters       AS venue_altitude_m,
  COALESCE(v.is_wc2026_venue, false)                                    AS is_wc2026_venue,
  v.venue_context_warning,
  -- H2H summary (canonical pair)
  h.total_matches         AS h2h_total,
  h.team1_wins            AS h2h_team1_wins,
  h.team2_wins            AS h2h_team2_wins,
  h.draws                 AS h2h_draws,
  h.avg_total_goals       AS h2h_avg_goals,
  h.last_meeting_date     AS h2h_last_date,
  h.recent_3y_count       AS h2h_recent_3y,
  -- Squad freshness — home
  sh.squad_size           AS home_squad_size,
  sh.avg_age              AS home_avg_age,
  sh.last_synced_at       AS home_squad_synced_at,
  -- Squad freshness — away
  sa.squad_size           AS away_squad_size,
  sa.avg_age              AS away_avg_age,
  sa.last_synced_at       AS away_squad_synced_at
FROM shared.af_fixtures_raw f
LEFT JOIN af_venues_normalized v
  ON v.af_venue_id = (f.raw_response -> 'fixture' -> 'venue' ->> 'id')::integer
LEFT JOIN public.v_recent_h2h_summary h
  ON h.af_team1_id = LEAST(
    (f.raw_response -> 'teams' -> 'home' ->> 'id')::integer,
    (f.raw_response -> 'teams' -> 'away' ->> 'id')::integer
  )
  AND h.af_team2_id = GREATEST(
    (f.raw_response -> 'teams' -> 'home' ->> 'id')::integer,
    (f.raw_response -> 'teams' -> 'away' ->> 'id')::integer
  )
LEFT JOIN public.v_squad_continuity_profile sh
  ON sh.af_team_id = (f.raw_response -> 'teams' -> 'home' ->> 'id')::integer
LEFT JOIN public.v_squad_continuity_profile sa
  ON sa.af_team_id = (f.raw_response -> 'teams' -> 'away' ->> 'id')::integer
WHERE (f.raw_response -> 'fixture' ->> 'date')::timestamptz >= now() - INTERVAL '3 hours';

GRANT SELECT ON public.v_match_context_enriched TO authenticated, anon;
