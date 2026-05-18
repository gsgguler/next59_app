/*
  # Live Memory — Phase 3: Replay Candidate View

  ## Summary
  Creates model_lab.v_live_replay_candidates — a view identifying completed FT/AET/PEN matches
  with event data that have not yet been fully evaluated by the live memory replay engine.

  ## New Views
  - `model_lab.v_live_replay_candidates`
    - fixture_id, match_id (alias), competition_season_id
    - season_label (from seasons.label via competition_seasons.season_id)
    - event_count: distinct goal events
    - already_evaluated_count: how many elapsed buckets already have outcome rows
    - status: 'pending' | 'partial' | 'complete' (complete = 5+ evaluated buckets)

  ## Criteria
  - status_short IN ('FT','AET','PEN')
  - result IS NOT NULL
  - api_football_fixture_id IS NOT NULL
  - Has at least one Goal event in api_football_fixture_events
  - Not fully complete (already_evaluated < 5)
*/

CREATE OR REPLACE VIEW model_lab.v_live_replay_candidates AS
SELECT
  m.id                                              AS fixture_id,
  m.id                                              AS match_id,
  m.competition_season_id,
  s.label                                           AS season_label,
  COUNT(DISTINCT e.id)                              AS event_count,
  COALESCE(ev.evaluated_count, 0)                   AS already_evaluated_count,
  CASE
    WHEN COALESCE(ev.evaluated_count, 0) = 0 THEN 'pending'
    WHEN COALESCE(ev.evaluated_count, 0) < 5  THEN 'partial'
    ELSE 'complete'
  END                                               AS status
FROM public.matches m
JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
JOIN public.seasons s ON s.id = cs.season_id
JOIN public.api_football_fixture_events e
     ON e.match_id = m.id AND e.event_type = 'Goal'
LEFT JOIN (
  SELECT fixture_id, COUNT(*) AS evaluated_count
  FROM model_lab.live_state_outcomes
  WHERE evaluated_at IS NOT NULL
  GROUP BY fixture_id
) ev ON ev.fixture_id = m.id
WHERE m.status_short IN ('FT','AET','PEN')
  AND m.result IS NOT NULL
  AND m.api_football_fixture_id IS NOT NULL
  AND COALESCE(ev.evaluated_count, 0) < 5
GROUP BY m.id, m.competition_season_id, s.label, ev.evaluated_count;

-- Grant read access to authenticated (admin reads via RLS on base tables)
GRANT SELECT ON model_lab.v_live_replay_candidates TO authenticated;
