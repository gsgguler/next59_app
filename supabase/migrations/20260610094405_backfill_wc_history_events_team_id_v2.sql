
-- Phase 4: Backfill wc_history.events.team_id from raw API-Football payloads
-- Fixture ID extracted from request_params->>'fixture' (integer)
-- Join path: events → matches (provider_fixture_id as int)
--            → raw_api_football_responses (request_params->>'fixture')
--            → lateral unnest response_json->'response'
--            → teams (name_en = raw team.name, edition_year = match.edition_year)
-- Match key: (fixture_id, player_id, elapsed, event_type, extra_time)

WITH raw_events AS (
  SELECT
    (r.request_params->>'fixture')::int            AS fixture_id,
    r.edition_year                                 AS raw_edition_year,
    (ev->'player'->>'id')::int                     AS player_id_raw,
    (ev->'time'->>'elapsed')::int                  AS elapsed_raw,
    CASE WHEN ev->'time'->>'extra' IN ('null', '') OR ev->'time'->>'extra' IS NULL
         THEN NULL
         ELSE (ev->'time'->>'extra')::int END       AS extra_time_raw,
    upper(ev->>'type')                             AS event_type_raw,
    ev->'team'->>'name'                            AS team_name_raw
  FROM wc_history.raw_api_football_responses r,
       jsonb_array_elements(r.response_json->'response') AS ev
  WHERE r.endpoint ILIKE '%events%'
    AND r.response_json ? 'response'
    AND jsonb_typeof(r.response_json->'response') = 'array'
    AND (ev->'player'->>'id') IS NOT NULL
    AND (ev->'team'->>'name')  IS NOT NULL
),
resolved AS (
  SELECT DISTINCT ON (e.id)
    e.id       AS event_id,
    t.id       AS team_uuid
  FROM wc_history.events e
  JOIN wc_history.matches m
    ON m.id = e.match_id
  JOIN raw_events re
    ON  re.fixture_id          = m.provider_fixture_id
    AND re.player_id_raw       = e.player_id
    AND re.elapsed_raw         = e.elapsed
    AND upper(re.event_type_raw) = upper(e.event_type)
    AND (re.extra_time_raw IS NOT DISTINCT FROM e.extra_time)
  JOIN wc_history.teams t
    ON  t.name_en      = re.team_name_raw
    AND t.edition_year = m.edition_year
  WHERE e.team_id IS NULL
  ORDER BY e.id
)
UPDATE wc_history.events e
SET    team_id = r.team_uuid
FROM   resolved r
WHERE  e.id = r.event_id;
