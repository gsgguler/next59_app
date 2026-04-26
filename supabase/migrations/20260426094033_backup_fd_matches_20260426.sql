/*
  # Backup football-data.co.uk matches

  1. New Tables
    - `backup_fd_matches_20260426`
      - Full copy of all columns from `matches`
      - Filtered to `source_provider = 'football-data.co.uk'`
  2. Purpose
    - Pre-cleanup safety backup of corrupted import data
    - No indexes or constraints — pure data archive
  3. Security
    - RLS enabled, no policies (admin-only access)
*/

CREATE TABLE IF NOT EXISTS public.backup_fd_matches_20260426 AS
SELECT *
FROM public.matches
WHERE source_provider = 'football-data.co.uk';

ALTER TABLE public.backup_fd_matches_20260426 ENABLE ROW LEVEL SECURITY;
