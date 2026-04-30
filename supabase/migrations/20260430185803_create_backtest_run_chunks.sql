/*
  # Create model_lab.backtest_run_chunks

  ## Purpose
  Supports chunked, resumable, retryable large-scale backtests.
  Each chunk represents a slice of validation matches (offset_start..offset_end).
  A parent backtest_run row tracks aggregate state; this table tracks per-chunk state.

  ## New Table: backtest_run_chunks
  - id: uuid PK
  - backtest_run_id: FK → model_lab.backtest_runs ON DELETE CASCADE
  - chunk_index: 0-based position in the chunk sequence
  - offset_start: inclusive row offset in the ordered validation match set
  - offset_end: exclusive row offset
  - limit_size: number of rows in this chunk (= offset_end - offset_start)
  - status: pending | running | completed | failed
  - processed_matches: count of rows successfully written
  - failed_matches: count of rows skipped/errored
  - average_brier_1x2: per-chunk Brier score
  - average_log_loss_1x2: per-chunk log loss
  - started_at, completed_at, error_message, created_at

  ## Security
  - RLS enabled, restrictive
  - No anon access
  - No normal authenticated access
  - service_role bypasses RLS automatically
  - Admin-only policy via auth.jwt() app_metadata role check

  ## Unique constraint
  (backtest_run_id, chunk_index) — prevents duplicate chunks
*/

CREATE TABLE IF NOT EXISTS model_lab.backtest_run_chunks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backtest_run_id      uuid NOT NULL REFERENCES model_lab.backtest_runs(id) ON DELETE CASCADE,
  chunk_index          integer NOT NULL,
  offset_start         integer NOT NULL,
  offset_end           integer NOT NULL,
  limit_size           integer NOT NULL DEFAULT 500,
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  processed_matches    integer DEFAULT 0,
  failed_matches       integer DEFAULT 0,
  average_brier_1x2    numeric(10,8),
  average_log_loss_1x2 numeric(10,8),
  started_at           timestamptz,
  completed_at         timestamptz,
  error_message        text,
  created_at           timestamptz DEFAULT now(),
  CONSTRAINT backtest_run_chunks_run_chunk_idx UNIQUE (backtest_run_id, chunk_index)
);

ALTER TABLE model_lab.backtest_run_chunks ENABLE ROW LEVEL SECURITY;

-- Admin-only select (service_role bypasses RLS automatically)
CREATE POLICY "Admin can select chunks"
  ON model_lab.backtest_run_chunks FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );

CREATE POLICY "Admin can insert chunks"
  ON model_lab.backtest_run_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );

CREATE POLICY "Admin can update chunks"
  ON model_lab.backtest_run_chunks FOR UPDATE
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_chunks_run_status ON model_lab.backtest_run_chunks(backtest_run_id, status);
CREATE INDEX IF NOT EXISTS idx_chunks_run_index  ON model_lab.backtest_run_chunks(backtest_run_id, chunk_index);

-- Grant to service_role for edge function access
GRANT SELECT, INSERT, UPDATE ON model_lab.backtest_run_chunks TO service_role;
GRANT SELECT ON model_lab.backtest_run_chunks TO authenticated;
