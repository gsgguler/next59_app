/*
  # Create wc_history.coverage_matrix

  ## Summary
  Coverage discovery table for API-Football World Cup (league=1) season coverage.
  Records which data types are available per edition year before bulk ingestion.

  ## Security
  - RLS enabled, admin-only read/write
*/

CREATE SCHEMA IF NOT EXISTS wc_history;

CREATE TABLE IF NOT EXISTS wc_history.coverage_matrix (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider              text NOT NULL DEFAULT 'api_football',
  league_id             integer NOT NULL DEFAULT 1,
  edition_year          integer NOT NULL,
  season_label          text,
  fixtures_supported    boolean,
  events_supported      boolean,
  lineups_supported     boolean,
  statistics_supported  boolean,
  players_supported     boolean,
  standings_supported   boolean,
  venues_supported      boolean,
  odds_supported        boolean,
  predictions_supported boolean,
  coverage_raw          jsonb DEFAULT '{}',
  coverage_status       text DEFAULT 'discovered',
  checked_at            timestamptz DEFAULT now(),
  UNIQUE(provider, edition_year)
);

ALTER TABLE wc_history.coverage_matrix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only coverage_matrix"
  ON wc_history.coverage_matrix FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
