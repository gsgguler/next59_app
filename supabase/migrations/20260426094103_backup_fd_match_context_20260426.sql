/*
  # Backup football-data.co.uk match context

  1. New Tables
    - `backup_fd_match_context_20260426`
      - Full copy of all columns from `match_context`
      - Filtered by JOIN to matches where `source_provider = 'football-data.co.uk'`
  2. Purpose
    - Pre-cleanup safety backup of corrupted import data
  3. Security
    - RLS enabled, no policies (admin-only access)
*/

CREATE TABLE IF NOT EXISTS public.backup_fd_match_context_20260426 AS
SELECT mc.*
FROM public.match_context mc
INNER JOIN public.matches m ON mc.match_id = m.id
WHERE m.source_provider = 'football-data.co.uk';

ALTER TABLE public.backup_fd_match_context_20260426 ENABLE ROW LEVEL SECURITY;
