
-- ============================================================
-- Security Gap Fix: Enable RLS on 3 unprotected tables
-- ============================================================

-- 1. model_lab.gold_forecast_core_freeze
--    CRITICAL: Active model stack configuration - must be protected
ALTER TABLE model_lab.gold_forecast_core_freeze ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read the active model stack
CREATE POLICY "gold_freeze_select_authenticated"
  ON model_lab.gold_forecast_core_freeze FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert/update/delete (no authenticated user policies = blocked for authenticated)
-- This effectively locks writes to service_role only


-- 2. model_lab.feature_snapshot_batch_runs
--    MEDIUM: Batch run logs - authenticated admin read, service writes
ALTER TABLE model_lab.feature_snapshot_batch_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batch_runs_select_authenticated"
  ON model_lab.feature_snapshot_batch_runs FOR SELECT
  TO authenticated
  USING (true);


-- 3. shared.understat_matches_raw
--    MEDIUM: Raw match data - authenticated admin read, service writes
ALTER TABLE shared.understat_matches_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "understat_raw_select_authenticated"
  ON shared.understat_matches_raw FOR SELECT
  TO authenticated
  USING (true);
