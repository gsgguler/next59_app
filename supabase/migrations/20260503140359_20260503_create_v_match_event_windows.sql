/*
  # Create v_match_event_windows

  Read-only view. Aggregates api_football_fixture_events into 8 minute windows per match.

  Windows:
    0_15         : elapsed 0-15, extra_time = 0 or null
    16_30        : elapsed 16-30
    31_45        : elapsed 31-45, extra_time = 0 or null
    first_half_extra : elapsed = 45, extra_time > 0
    46_60        : elapsed 46-60, extra_time = 0 or null
    61_75        : elapsed 61-75
    76_90        : elapsed 76-90, extra_time = 0 or null
    second_half_extra : elapsed = 90, extra_time > 0

  IMPORTANT:
  - Events with elapsed < 0 are EXCLUDED from all windows (provider timing artifacts)
  - elapsed NULL = 0 rows (confirmed in audit)
  - extra_time NULL treated as 0

  Counts per window: goals, normal_goals, penalty_goals, own_goals, missed_penalties,
                     yellow_cards, red_cards, substitutions, var_events, total_events
*/

CREATE OR REPLACE VIEW public.v_match_event_windows AS
WITH base AS (
  SELECT
    e.match_id,
    e.api_football_fixture_id,
    e.elapsed,
    COALESCE(e.extra_time, 0) AS extra_time,
    e.event_type,
    e.event_detail,

    -- Window classification (elapsed < 0 excluded via WHERE)
    CASE
      WHEN e.elapsed <= 15 AND COALESCE(e.extra_time, 0) = 0                      THEN '0_15'
      WHEN e.elapsed BETWEEN 16 AND 30                                              THEN '16_30'
      WHEN e.elapsed BETWEEN 31 AND 44 AND COALESCE(e.extra_time, 0) = 0          THEN '31_45'
      WHEN e.elapsed = 45 AND COALESCE(e.extra_time, 0) > 0                        THEN 'first_half_extra'
      WHEN e.elapsed = 45 AND COALESCE(e.extra_time, 0) = 0                        THEN '31_45'
      WHEN e.elapsed BETWEEN 46 AND 60 AND COALESCE(e.extra_time, 0) = 0          THEN '46_60'
      WHEN e.elapsed BETWEEN 61 AND 75                                              THEN '61_75'
      WHEN e.elapsed BETWEEN 76 AND 89 AND COALESCE(e.extra_time, 0) = 0          THEN '76_90'
      WHEN e.elapsed = 90 AND COALESCE(e.extra_time, 0) > 0                        THEN 'second_half_extra'
      WHEN e.elapsed >= 90 AND COALESCE(e.extra_time, 0) = 0                       THEN '76_90'
      ELSE NULL
    END AS window_name

  FROM public.api_football_fixture_events e
  WHERE e.elapsed >= 0  -- exclude timing artifacts
),
windowed AS (
  SELECT
    match_id,
    api_football_fixture_id,
    window_name,
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE event_type = 'Goal')                                     AS goals,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail = 'Normal Goal')    AS normal_goals,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail = 'Penalty')        AS penalty_goals,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail = 'Own Goal')       AS own_goals,
    COUNT(*) FILTER (WHERE event_type = 'Goal' AND event_detail = 'Missed Penalty') AS missed_penalties,
    COUNT(*) FILTER (WHERE event_type = 'Card' AND event_detail = 'Yellow Card')    AS yellow_cards,
    COUNT(*) FILTER (WHERE event_type = 'Card' AND event_detail = 'Red Card')       AS red_cards,
    COUNT(*) FILTER (WHERE event_type = 'subst')                                    AS substitutions,
    COUNT(*) FILTER (WHERE event_type = 'Var')                                      AS var_events
  FROM base
  WHERE window_name IS NOT NULL
  GROUP BY match_id, api_football_fixture_id, window_name
)
SELECT
  match_id,
  api_football_fixture_id,
  window_name,
  total_events,
  goals,
  normal_goals,
  penalty_goals,
  own_goals,
  missed_penalties,
  yellow_cards,
  red_cards,
  substitutions,
  var_events
FROM windowed;
