/*
  # Expose wc_history schema to PostgREST

  ## Summary
  Grants PostgREST (anon, authenticated, service_role) access to wc_history
  schema so that supabase-js client.schema("wc_history") calls work.
  Also grants table-level permissions needed for service_role writes.
*/

-- Schema usage
GRANT USAGE ON SCHEMA wc_history TO anon, authenticated, service_role;

-- service_role needs full access for ingestion writes
GRANT ALL ON ALL TABLES IN SCHEMA wc_history TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA wc_history TO service_role;

-- authenticated gets SELECT on normalized tables (admin RLS filters further)
GRANT SELECT ON
  wc_history.editions,
  wc_history.teams,
  wc_history.matches,
  wc_history.match_statistics,
  wc_history.events,
  wc_history.lineups,
  wc_history.lineup_players,
  wc_history.players,
  wc_history.squads,
  wc_history.venues,
  wc_history.groups,
  wc_history.coverage_matrix,
  wc_history.ingestion_runs,
  wc_history.raw_api_football_responses,
  wc_history.source_mappings,
  wc_history.data_quality_issues
TO authenticated;

-- anon gets no direct table access — public views only
