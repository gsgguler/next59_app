/*
  # Fix prematch_brain_runs and prematch_brain_outputs missing unique constraints

  ## Problem
  The generate_prematch_brain_package() SQL function uses:
    - ON CONFLICT (match_id) on prematch_brain_runs
    - ON CONFLICT DO NOTHING   on prematch_brain_outputs

  Neither table had the required unique constraints, causing every daily pipeline
  run to error with "there is no unique or exclusion constraint matching the ON CONFLICT
  specification" for all 16 upcoming matches.

  ## Changes
  1. prematch_brain_runs: add UNIQUE (match_id) — one active brain run per match
  2. prematch_brain_outputs: add UNIQUE (brain_run_id, brain_name) — one output per
     brain type per run; also allows the ON CONFLICT DO NOTHING guard in the function
     to work correctly for the 'master_brain' insert

  ## Notes
  - Existing duplicate rows (if any) are deduplicated before adding the constraint
    by keeping the latest row per (match_id) / (brain_run_id, brain_name)
  - No data is deleted that isn't already a duplicate
*/

-- ── Step 1: deduplicate prematch_brain_runs on match_id ──────────────────────
-- Keep the row with the latest generated_at; delete older duplicates.
DELETE FROM model_lab.prematch_brain_runs
WHERE id NOT IN (
  SELECT DISTINCT ON (match_id) id
  FROM model_lab.prematch_brain_runs
  ORDER BY match_id, generated_at DESC NULLS LAST
);

-- ── Step 2: add unique constraint on prematch_brain_runs.match_id ─────────────
ALTER TABLE model_lab.prematch_brain_runs
  ADD CONSTRAINT prematch_brain_runs_match_id_unique UNIQUE (match_id);

-- ── Step 3: deduplicate prematch_brain_outputs on (brain_run_id, brain_name) ──
-- Keep the row with the highest id (proxy for insertion order).
DELETE FROM model_lab.prematch_brain_outputs
WHERE id NOT IN (
  SELECT DISTINCT ON (brain_run_id, brain_name) id
  FROM model_lab.prematch_brain_outputs
  ORDER BY brain_run_id, brain_name, id DESC
);

-- ── Step 4: add unique constraint on prematch_brain_outputs ───────────────────
ALTER TABLE model_lab.prematch_brain_outputs
  ADD CONSTRAINT prematch_brain_outputs_run_name_unique
  UNIQUE (brain_run_id, brain_name);
