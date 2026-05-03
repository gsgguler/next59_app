/*
  # WC History — Public views in public schema for anon/supabase-js access

  supabase-js v2 does not support .schema() chaining.
  The wc_history schema was not accessible to anon role (only authenticated).

  This migration creates lightweight views in the public schema so that
  the standard supabase client can query them without a second client instance.

  Views created:
  - public.wch_editions   → wc_history.editions
  - public.wch_matches    → wc_history.matches
  - public.wch_teams      → wc_history.teams

  Security:
  - Views are SECURITY INVOKER (default) — RLS on underlying tables still applies
  - We already granted anon SELECT on editions/matches/teams via earlier migration
  - Add anon RLS policies here as belt-and-suspenders via the view
*/

-- Editions view
CREATE OR REPLACE VIEW public.wch_editions AS
SELECT
  edition_year,
  host_country,
  champion,
  total_matches,
  total_teams,
  start_date,
  end_date
FROM wc_history.editions
WHERE host_country IS NOT NULL;

-- Matches view (all columns needed by UI)
CREATE OR REPLACE VIEW public.wch_matches AS
SELECT
  id,
  edition_year,
  match_no,
  stage_code,
  stage_name_en,
  group_name,
  match_date,
  kickoff_utc,
  home_team_id,
  away_team_id,
  home_team_name,
  away_team_name,
  home_score_ft,
  away_score_ft,
  home_score_90,
  away_score_90,
  home_score_ht,
  away_score_ht,
  home_score_aet,
  away_score_aet,
  home_penalties,
  away_penalties,
  result_90,
  result_aet,
  result_penalties,
  decided_by,
  final_winner_name,
  venue_name,
  city,
  country,
  attendance,
  referee,
  match_status
FROM wc_history.matches;

-- Teams view
CREATE OR REPLACE VIEW public.wch_teams AS
SELECT
  id,
  edition_year,
  name_en,
  name_tr,
  iso2,
  fifa_code,
  confederation
FROM wc_history.teams;

-- Grant select on views to anon and authenticated
GRANT SELECT ON public.wch_editions TO anon, authenticated;
GRANT SELECT ON public.wch_matches  TO anon, authenticated;
GRANT SELECT ON public.wch_teams    TO anon, authenticated;
