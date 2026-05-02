/*
  # WC History — Update public view with score semantic fields

  ## Summary
  Recreates v_world_cup_matches (drop + create) to expose safe score semantic fields.
  Adds: home/away_score_90, result_90, home/away_score_aet, result_aet,
        home/away_penalties, result_penalties, decided_by, final_winner_name,
        score_semantics_status.
  Does NOT expose: raw_payload, ingestion_run_id, internal audit payloads.
*/

DROP VIEW IF EXISTS public.v_world_cup_matches;

CREATE VIEW public.v_world_cup_matches
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
  ht.name_en    AS home_team_name_en,
  ht.iso2       AS home_team_iso2,
  ht.flag_asset AS home_team_flag,
  at.name_en    AS away_team_name_en,
  at.iso2       AS away_team_iso2,
  at.flag_asset AS away_team_flag,
  m.home_score_ft,
  m.away_score_ft,
  m.home_score_ht,
  m.away_score_ht,
  m.result,
  m.home_score_90,
  m.away_score_90,
  m.result_90,
  m.home_score_aet,
  m.away_score_aet,
  m.result_aet,
  m.home_penalties,
  m.away_penalties,
  m.result_penalties,
  m.decided_by,
  m.final_winner_name,
  m.score_semantics_status,
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
