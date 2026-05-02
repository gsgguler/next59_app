/*
  # Transform 72 group stage fixtures from raw API-Football data (v2)

  ## Summary
  Reads fixture rows from wc2026_api_football_raw_responses and inserts
  normalized records into wc2026_fixtures. Uses DELETE+INSERT guard instead
  of ON CONFLICT due to partial unique index on api_football_fixture_id.

  - fixture_status = verified_official when venue resolved
  - fixture_status = needs_review when venue cannot be matched
  - match_number M1–M72 assigned chronologically
  - ingestion_run_id: d997f1a4-533a-4944-96a7-e0da60f2a2ba
  - NO model / NO predictions / NO strength engine touched
*/

DO $$
DECLARE
  v_run_id uuid := 'd997f1a4-533a-4944-96a7-e0da60f2a2ba'::uuid;
  v_source text := 'https://v3.football.api-sports.io/fixtures?league=1&season=2026';
BEGIN
  -- Remove any previously attempted group-stage inserts to allow clean re-run
  DELETE FROM public.wc2026_fixtures WHERE stage_code = 'Group Stage';

  INSERT INTO public.wc2026_fixtures (
    match_number,
    stage_code,
    group_label,
    round_label,
    api_football_fixture_id,
    match_date,
    home_team_name,
    away_team_name,
    home_team_placeholder,
    away_team_placeholder,
    home_api_team_id,
    away_api_team_id,
    venue_id,
    venue_name_raw,
    fixture_status,
    source_url,
    source_checked_at,
    ingestion_run_id,
    notes
  )
  SELECT
    rn::integer,
    'Group Stage',
    NULL,
    round_label,
    api_fixture_id::bigint,
    match_date_raw::timestamptz,
    home_name,
    away_name,
    NULL,
    NULL,
    home_api_id,
    away_api_id,
    v.id,
    venue_raw,
    CASE WHEN v.id IS NULL THEN 'needs_review' ELSE 'verified_official' END,
    v_source,
    now(),
    v_run_id,
    CASE WHEN v.id IS NULL THEN 'Venue not matched in wc2026_venues' ELSE NULL END
  FROM (
    SELECT
      r.response_json->'fixture'->>'id'                   AS api_fixture_id,
      r.response_json->'fixture'->>'date'                 AS match_date_raw,
      r.response_json->'league'->>'round'                 AS round_label,
      r.response_json->'teams'->'home'->>'name'           AS home_name,
      r.response_json->'teams'->'away'->>'name'           AS away_name,
      (r.response_json->'teams'->'home'->>'id')::integer  AS home_api_id,
      (r.response_json->'teams'->'away'->>'id')::integer  AS away_api_id,
      r.response_json->'fixture'->'venue'->>'name'        AS venue_raw,
      ROW_NUMBER() OVER (
        ORDER BY (r.response_json->'fixture'->>'date') ASC
      ) AS rn
    FROM public.wc2026_api_football_raw_responses r
    WHERE r.provider_entity_type = 'fixture'
  ) ranked
  LEFT JOIN public.wc2026_venues v
    ON LOWER(TRIM(v.venue_name)) = LOWER(TRIM(ranked.venue_raw));
END $$;
