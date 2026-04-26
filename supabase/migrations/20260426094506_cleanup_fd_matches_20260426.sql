/*
  # Delete football-data.co.uk matches

  1. Changes
    - Deletes all `matches` rows with `source_provider = 'football-data.co.uk'`
    - Expected: 11,544 rows deleted
    - All child rows (actual_outcomes, match_context, match_statistics)
      were already deleted in prior migrations
  2. Safety
    - Backup exists in `backup_fd_matches_20260426`
    - Scoped DELETE, not TRUNCATE
    - No other tables affected
*/

DELETE FROM public.matches
WHERE source_provider = 'football-data.co.uk';
