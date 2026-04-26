/*
  # Extend raw storage and ingestion run constraints

  1. Modified Tables
    - `api_football_raw_responses`
      - Expand `chk_afr_provider_entity_type` to include `team_list`, `fixture_list`, `league_list` for bulk response storage
    - `ingestion_runs`
      - Expand `chk_ir_status` to include `completed_with_errors` for partial success tracking

  2. Important Notes
    - These additions support the raw-only probe pattern where bulk API responses are stored alongside individual entity rows
    - `completed_with_errors` status distinguishes full success from runs where some inserts failed but others succeeded
*/

ALTER TABLE api_football_raw_responses
  DROP CONSTRAINT IF EXISTS chk_afr_provider_entity_type;

ALTER TABLE api_football_raw_responses
  ADD CONSTRAINT chk_afr_provider_entity_type
  CHECK (provider_entity_type IN (
    'fixture', 'team', 'league', 'season', 'venue', 'referee',
    'event', 'statistic', 'lineup', 'odds', 'standing', 'injury',
    'coach', 'player', 'request_batch',
    'team_list', 'fixture_list', 'league_list'
  ));

ALTER TABLE ingestion_runs
  DROP CONSTRAINT IF EXISTS chk_ir_status;

ALTER TABLE ingestion_runs
  ADD CONSTRAINT chk_ir_status
  CHECK (status IN (
    'started', 'completed', 'failed', 'partial', 'cancelled', 'completed_with_errors'
  ));
