/*
  # Operational Hardening — Phase 3: Duplicate Guards + Stale Draft Invalidation

  ## Summary
  Adds partial unique indexes to prevent duplicate active drafts for the same
  match + model + formula on the same day. Superseded elo_only drafts that have
  been replaced by enriched versions are marked status='hidden' (not deleted).

  ## Duplicate guard indexes

  1. prematch_prediction_drafts:
     One active enriched draft per (match_id, model_version, prediction_formula, day).
     Partial index excludes hidden/rejected rows and elo_only tier — those are
     superseded by design and do not block new enriched rows.

  2. match_story_drafts:
     One non-hidden story draft per match_id per day.

  3. match_story_publications:
     One visible publication per match_id (enforced by existing data discipline —
     unique partial index on match_id WHERE is_visible = true).

  ## Stale elo_only cleanup
  Marks existing elo_only drafts as 'hidden' where a newer enriched draft exists
  for the same match on the same day. Does NOT delete rows.

  ## Important notes
  - No unique constraints on pk-indexed tables (too broad); partial indexes only.
  - Panathinaikos/Olympiakos elo_only draft (2026-05-17) is left as-is — no
    enriched replacement exists for that match, so it remains the active draft.
*/

-- ── 1. Invalidate superseded elo_only drafts ────────────────────────────────
-- Mark elo_only drafts as hidden when an enriched draft exists for same match today
UPDATE model_lab.prematch_prediction_drafts AS old
SET status = 'hidden'
WHERE old.feature_quality_tier = 'elo_only'
  AND old.status = 'pending_review'
  AND EXISTS (
    SELECT 1 FROM model_lab.prematch_prediction_drafts newer
    WHERE newer.match_id = old.match_id
      AND newer.feature_quality_tier IS DISTINCT FROM 'elo_only'
      AND newer.generated_at > old.generated_at
      AND newer.status NOT IN ('hidden', 'rejected')
  );

-- ── 2. Partial unique index: one enriched draft per match per model per day ─
-- Prevents the pipeline from stacking multiple enriched drafts in one day run.
-- Excludes hidden/rejected and elo_only rows (they coexist as archived history).
CREATE UNIQUE INDEX IF NOT EXISTS ux_prediction_draft_enriched_per_day
  ON model_lab.prematch_prediction_drafts (
    match_id,
    model_version,
    prediction_formula,
    DATE(generated_at AT TIME ZONE 'UTC')
  )
  WHERE status NOT IN ('hidden', 'rejected')
    AND feature_quality_tier IS DISTINCT FROM 'elo_only';

-- ── 3. Partial unique index: one active story draft per match per day ────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_story_draft_active_per_day
  ON model_lab.match_story_drafts (
    match_id,
    model_version,
    DATE(generated_at AT TIME ZONE 'UTC')
  )
  WHERE status NOT IN ('hidden', 'rejected');

-- ── 4. Partial unique index: one visible publication per match ───────────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_story_publication_visible_per_match
  ON model_lab.match_story_publications (match_id)
  WHERE is_visible = true;
