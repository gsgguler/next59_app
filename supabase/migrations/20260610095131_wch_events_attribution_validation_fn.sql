
-- Reusable attribution integrity validator for wc_history.events / wch_events.
-- Call: SELECT * FROM wch_validate_event_attribution();
-- Returns one row per check with a pass/fail flag and counts.
-- All invalid_count values must be 0 for a clean import.

CREATE OR REPLACE FUNCTION wch_validate_event_attribution()
RETURNS TABLE (
  check_name      text,
  total_checked   bigint,
  invalid_count   bigint,
  status          text,
  note            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, wc_history
AS $$

  -- Check 1: wc_history.events.team_id must not be null
  SELECT
    'team_id_not_null'                                            AS check_name,
    COUNT(*)                                                      AS total_checked,
    COUNT(*) FILTER (WHERE e.team_id IS NULL)                    AS invalid_count,
    CASE WHEN COUNT(*) FILTER (WHERE e.team_id IS NULL) = 0
         THEN 'PASS' ELSE 'FAIL' END                             AS status,
    'Every event row in wc_history.events must have team_id populated'::text AS note
  FROM wc_history.events e

  UNION ALL

  -- Check 2: wch_events.team_name (view-resolved) must not be null
  SELECT
    'team_name_not_null',
    COUNT(*),
    COUNT(*) FILTER (WHERE v.team_name IS NULL),
    CASE WHEN COUNT(*) FILTER (WHERE v.team_name IS NULL) = 0
         THEN 'PASS' ELSE 'FAIL' END,
    'wch_events view must resolve team_name for every event (team_id → teams join)'
  FROM wch_events v

  UNION ALL

  -- Check 3: team_name must equal parent match home or away team name
  SELECT
    'team_name_matches_fixture',
    COUNT(*),
    COUNT(*) FILTER (
      WHERE v.team_name IS NOT NULL
        AND v.team_name != m.home_team_name
        AND v.team_name != m.away_team_name
    ),
    CASE WHEN COUNT(*) FILTER (
           WHERE v.team_name IS NOT NULL
             AND v.team_name != m.home_team_name
             AND v.team_name != m.away_team_name
         ) = 0
         THEN 'PASS' ELSE 'FAIL' END,
    'event team_name must equal home_team_name or away_team_name of its parent match'
  FROM wch_events v
  JOIN wch_matches m ON m.id = v.match_id

  UNION ALL

  -- Check 4: team_id must belong to the same edition_year as the parent match
  SELECT
    'edition_year_integrity',
    COUNT(*),
    COUNT(*) FILTER (WHERE t.edition_year IS DISTINCT FROM m.edition_year),
    CASE WHEN COUNT(*) FILTER (WHERE t.edition_year IS DISTINCT FROM m.edition_year) = 0
         THEN 'PASS' ELSE 'FAIL' END,
    'event team_id must resolve to a wc_history.teams row with matching edition_year'
  FROM wc_history.events e
  JOIN wc_history.matches m ON m.id = e.match_id
  JOIN wc_history.teams   t ON t.id = e.team_id

  UNION ALL

  -- Check 5: composite — any row failing any of the above
  SELECT
    'all_checks_combined',
    COUNT(*),
    COUNT(*) FILTER (
      WHERE e.team_id IS NULL
         OR v.team_name IS NULL
         OR (v.team_name IS NOT NULL AND v.team_name != m.home_team_name AND v.team_name != m.away_team_name)
         OR (t.id IS NOT NULL AND t.edition_year IS DISTINCT FROM m.edition_year)
    ),
    CASE WHEN COUNT(*) FILTER (
           WHERE e.team_id IS NULL
              OR v.team_name IS NULL
              OR (v.team_name IS NOT NULL AND v.team_name != m.home_team_name AND v.team_name != m.away_team_name)
              OR (t.id IS NOT NULL AND t.edition_year IS DISTINCT FROM m.edition_year)
         ) = 0
         THEN 'PASS' ELSE 'FAIL' END,
    'Combined: any event failing one or more attribution checks'
  FROM wc_history.events e
  LEFT JOIN wch_events v      ON v.id = e.id
  LEFT JOIN wch_matches m     ON m.id = e.match_id
  LEFT JOIN wc_history.teams t ON t.id = e.team_id;

$$;

GRANT EXECUTE ON FUNCTION wch_validate_event_attribution() TO authenticated;
