/*
  # Backup football-data.co.uk match statistics

  1. New Tables
    - `backup_fd_match_statistics_20260426`
      - Full copy of all columns from `match_statistics`
      - Filtered by JOIN to matches where `source_provider = 'football-data.co.uk'`
  2. Purpose
    - Pre-cleanup safety backup of corrupted import data
  3. Security
    - RLS enabled, no policies (admin-only access)
*/

CREATE TABLE IF NOT EXISTS public.backup_fd_match_statistics_20260426 AS
SELECT ms.*
FROM public.match_statistics ms
INNER JOIN public.matches m ON ms.match_id = m.id
WHERE m.source_provider = 'football-data.co.uk';

ALTER TABLE public.backup_fd_match_statistics_20260426 ENABLE ROW LEVEL SECURITY;
