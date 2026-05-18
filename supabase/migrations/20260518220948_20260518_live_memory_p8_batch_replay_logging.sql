/*
  # Live Memory — Phase 4: Batch Replay Logging Table + Phase 5: Batch Replay Function

  ## Summary
  Creates infrastructure for safe, idempotent, batched historical replay of completed matches
  through the live memory engine.

  ## New Tables

  ### model_lab.live_memory_replay_runs
  Audit log for each batch replay execution.
  - id (uuid PK)
  - started_at, completed_at
  - status: 'running' | 'completed' | 'failed'
  - batch_size: requested batch size
  - processed_count: fixtures attempted
  - outcome_rows_created: new outcome rows inserted/updated
  - pattern_rows_updated: pattern memory rows touched after refresh
  - error_count: fixtures that threw errors
  - errors_json: per-fixture error details
  - remaining_candidates: count of pending+partial after batch

  ## Security
  - RLS enabled
  - Admin SELECT policy
  - Service role INSERT/UPDATE policy

  ## New Functions

  ### model_lab.run_live_memory_replay_batch(batch_size integer default 100)
  Processes up to batch_size candidates from v_live_replay_candidates in order (pending first).
  - Per-fixture error isolation via nested BEGIN/EXCEPTION block
  - Calls populate_live_state_outcomes(fixture_id, 1) per candidate
  - Refreshes pattern memory after all candidates processed
  - Logs result to live_memory_replay_runs
  - Returns JSON summary

  ### public.admin_run_live_memory_replay_batch(batch_size integer default 100)
  Admin-gated public wrapper.
*/

-- ─── Table: live_memory_replay_runs ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.live_memory_replay_runs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  status                text        NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','completed','failed')),
  batch_size            integer     NOT NULL DEFAULT 100,
  processed_count       integer     NOT NULL DEFAULT 0,
  outcome_rows_created  integer     NOT NULL DEFAULT 0,
  pattern_rows_updated  integer     NOT NULL DEFAULT 0,
  error_count           integer     NOT NULL DEFAULT 0,
  errors_json           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  remaining_candidates  integer
);

ALTER TABLE model_lab.live_memory_replay_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read replay runs"
  ON model_lab.live_memory_replay_runs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ));

CREATE POLICY "Service role can insert replay runs"
  ON model_lab.live_memory_replay_runs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ));

CREATE POLICY "Service role can update replay runs"
  ON model_lab.live_memory_replay_runs FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ));

-- Grant schema access
GRANT SELECT, INSERT, UPDATE ON model_lab.live_memory_replay_runs TO authenticated;

-- ─── Function: model_lab.run_live_memory_replay_batch ────────────────────────

CREATE OR REPLACE FUNCTION model_lab.run_live_memory_replay_batch(
  p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public, pg_temp
AS $$
DECLARE
  v_run_id              uuid;
  v_fixture             RECORD;
  v_processed           integer := 0;
  v_outcome_rows        integer := 0;
  v_pattern_rows_before integer := 0;
  v_pattern_rows_after  integer := 0;
  v_error_count         integer := 0;
  v_errors              jsonb   := '[]'::jsonb;
  v_fix_result          RECORD;
  v_remaining           integer := 0;
  v_outcome_before      integer := 0;
  v_outcome_after       integer := 0;
BEGIN
  -- Create run log entry
  INSERT INTO model_lab.live_memory_replay_runs (batch_size, status)
  VALUES (p_batch_size, 'running')
  RETURNING id INTO v_run_id;

  -- Snapshot counts before
  SELECT COUNT(*) INTO v_outcome_before FROM model_lab.live_state_outcomes;
  SELECT COUNT(*) INTO v_pattern_rows_before FROM model_lab.live_state_pattern_memory;

  -- Process candidates: pending first, then partial, ordered by fixture_id for determinism
  FOR v_fixture IN
    SELECT fixture_id, status
    FROM model_lab.v_live_replay_candidates
    ORDER BY
      CASE status WHEN 'pending' THEN 0 ELSE 1 END,
      fixture_id
    LIMIT p_batch_size
  LOOP
    BEGIN
      -- Call populate for exactly this fixture (limit=1 means process this one fixture fully)
      PERFORM model_lab.populate_live_state_outcomes(v_fixture.fixture_id, 1);
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_errors := v_errors || jsonb_build_object(
        'fixture_id', v_fixture.fixture_id,
        'error', SQLERRM,
        'sqlstate', SQLSTATE
      );
    END;
  END LOOP;

  -- Refresh pattern memory after batch
  PERFORM model_lab.refresh_live_state_pattern_memory();

  -- Snapshot counts after
  SELECT COUNT(*) INTO v_outcome_after FROM model_lab.live_state_outcomes;
  SELECT COUNT(*) INTO v_pattern_rows_after FROM model_lab.live_state_pattern_memory;

  v_outcome_rows := v_outcome_after - v_outcome_before;

  -- Remaining candidates
  SELECT COUNT(*) INTO v_remaining FROM model_lab.v_live_replay_candidates;

  -- Update run log
  UPDATE model_lab.live_memory_replay_runs SET
    completed_at        = now(),
    status              = CASE WHEN v_error_count > 0 AND v_processed = 0 THEN 'failed' ELSE 'completed' END,
    processed_count     = v_processed,
    outcome_rows_created = v_outcome_rows,
    pattern_rows_updated = v_pattern_rows_after,
    error_count         = v_error_count,
    errors_json         = v_errors,
    remaining_candidates = v_remaining
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id',               v_run_id,
    'batch_size',           p_batch_size,
    'processed',            v_processed,
    'outcome_rows_created', v_outcome_rows,
    'pattern_rows_updated', v_pattern_rows_after,
    'errors',               v_error_count,
    'remaining_candidates', v_remaining
  );
END;
$$;

-- ─── Public admin wrapper ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_run_live_memory_replay_batch(
  p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN model_lab.run_live_memory_replay_batch(p_batch_size);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_run_live_memory_replay_batch(integer) TO authenticated;

-- ─── Additional admin RPC: list recent replay runs ───────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_replay_runs(p_limit integer DEFAULT 10)
RETURNS TABLE (
  id                    uuid,
  started_at            timestamptz,
  completed_at          timestamptz,
  status                text,
  batch_size            integer,
  processed_count       integer,
  outcome_rows_created  integer,
  pattern_rows_updated  integer,
  error_count           integer,
  remaining_candidates  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  RETURN QUERY
  SELECT
    r.id, r.started_at, r.completed_at, r.status,
    r.batch_size, r.processed_count, r.outcome_rows_created,
    r.pattern_rows_updated, r.error_count, r.remaining_candidates
  FROM model_lab.live_memory_replay_runs r
  ORDER BY r.started_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_replay_runs(integer) TO authenticated;
