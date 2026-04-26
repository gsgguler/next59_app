/*
  # Backup football-data.co.uk actual outcomes

  1. New Tables
    - `backup_fd_actual_outcomes_20260426`
      - Full copy of all columns from `actual_outcomes`
      - Filtered by JOIN to matches where `source_provider = 'football-data.co.uk'`
  2. Purpose
    - Pre-cleanup safety backup of corrupted import data
  3. Security
    - RLS enabled, no policies (admin-only access)
*/

CREATE TABLE IF NOT EXISTS public.backup_fd_actual_outcomes_20260426 AS
SELECT ao.*
FROM public.actual_outcomes ao
INNER JOIN public.matches m ON ao.match_id = m.id
WHERE m.source_provider = 'football-data.co.uk';

ALTER TABLE public.backup_fd_actual_outcomes_20260426 ENABLE ROW LEVEL SECURITY;
