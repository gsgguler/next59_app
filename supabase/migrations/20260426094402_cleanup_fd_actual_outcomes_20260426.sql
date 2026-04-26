/*
  # Delete football-data.co.uk actual_outcomes

  1. Changes
    - Deletes all `actual_outcomes` rows whose `match_id` belongs to
      a match with `source_provider = 'football-data.co.uk'`
    - Expected: 5,770 rows deleted
  2. Safety
    - Backup exists in `backup_fd_actual_outcomes_20260426`
    - Scoped DELETE, not TRUNCATE
    - No other tables affected
*/

DELETE FROM public.actual_outcomes
WHERE match_id IN (
  SELECT id FROM public.matches
  WHERE source_provider = 'football-data.co.uk'
);
