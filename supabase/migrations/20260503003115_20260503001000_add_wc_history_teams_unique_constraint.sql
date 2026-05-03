/*
  # Add unique constraint on wc_history.teams(edition_year, name_en)

  ## Problem
  The wch_upsert_teams_bulk RPC uses ON CONFLICT (edition_year, name_en) DO NOTHING
  but no unique constraint existed on those columns, causing a 42P10 error.

  ## Changes
  - Deduplicate any existing duplicate (edition_year, name_en) rows before adding constraint
    (keep row with earliest created_at, break ties by ctid)
  - Add UNIQUE constraint wc_history_teams_edition_name_uq on (edition_year, name_en)
*/

-- Remove duplicates (keep earliest created_at, tie-break by ctid) before adding constraint
DELETE FROM wc_history.teams
WHERE ctid NOT IN (
  SELECT DISTINCT ON (edition_year, name_en) ctid
  FROM wc_history.teams
  ORDER BY edition_year, name_en, created_at ASC, ctid ASC
);

ALTER TABLE wc_history.teams
  ADD CONSTRAINT wc_history_teams_edition_name_uq UNIQUE (edition_year, name_en);
