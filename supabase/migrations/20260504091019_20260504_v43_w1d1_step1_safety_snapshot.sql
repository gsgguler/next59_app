/*
  # v4.3-W1-D1 Step 1: Safety Snapshot

  Creates _backup_v42 schema with a migration log table to track
  all v4.3 migration steps with rollback SQL and status.
*/

CREATE SCHEMA IF NOT EXISTS _backup_v42;

CREATE TABLE IF NOT EXISTS _backup_v42._migration_log (
  step_number INTEGER PRIMARY KEY,
  step_name TEXT NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  rollback_sql TEXT,
  status TEXT CHECK (status IN ('success','failed','rolled_back'))
);

INSERT INTO _backup_v42._migration_log (step_number, step_name, status)
VALUES (1, 'Initial v4.3 migration started', 'success')
ON CONFLICT (step_number) DO NOTHING;
