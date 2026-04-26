/*
  # Delete football-data.co.uk match_statistics

  1. Changes
    - Deletes all `match_statistics` rows whose `match_id` belongs to
      a match with `source_provider = 'football-data.co.uk'`
    - Expected: 11,544 rows deleted
  2. Safety
    - Backup exists in `backup_fd_match_statistics_20260426`
    - Scoped DELETE, not TRUNCATE
    - No other tables affected
*/

DELETE FROM public.match_statistics
WHERE match_id IN (
  SELECT id FROM public.matches
  WHERE source_provider = 'football-data.co.uk'
);
