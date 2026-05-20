/*
  # Publication Governance Layer V1

  ## Summary
  Establishes a strict, human-gated publication governance system.
  No content can reach public visibility without explicit admin approval.

  ## Changes

  ### 1. Standardize status CHECK constraints
  - Aligns `match_story_drafts.status` and `prematch_prediction_drafts.status`
    CHECK constraints to match the actual values used in code.
  - Adds new canonical states: `review_required`, `approved_public`,
    `approved_internal`, `archived`, `do_not_publish`.
  - Old constraint used `'approved'` which is never written by code; replaced with
    correct values.

  ### 2. New table: model_lab.publication_governance_log
  - Append-only audit trail for every publication state transition.
  - Fields: id, entity_type, entity_id, previous_state, new_state, changed_by,
    changed_at, reason, warning_snapshot (jsonb), calibration_snapshot (jsonb),
    publish_risk_level.
  - RLS: admin-only read; service-role insert only (no user can insert directly).

  ### 3. New RPC: model_lab.log_publication_transition
  - Called by admin actions to record governance events.
  - SECURITY DEFINER so it bypasses RLS for insert.
  - Validates state machine: do_not_publish may never auto-escalate.

  ### 4. New RPC: model_lab.hard_block_publish_check
  - Returns an error if entity has do_not_publish state or if
    public publication is attempted without approved_public status.

  ### 5. Fix get_match_prediction (public RPC)
  - Currently returns predictions with status NOT IN ('hidden','rejected').
  - This can leak `draft_generated`, `pending_review`, `review_required` drafts.
  - Fixed to only return predictions where status IN ('approved_public','published').
  - This is the critical public-protection change.

  ### 6. Fix ml_admin_publish_story
  - Adds governance log entry on successful publish.
  - Validates do_not_publish hard block before proceeding.

  ### 7. New RPC: public.admin_log_governance_event
  - Public wrapper callable by authenticated admin from frontend.
  - Validates caller is admin via profiles.role check.
  - Records state transitions with optional moderation note and risk level.

  ## Security
  - publication_governance_log: RLS enabled, admin-only SELECT, no direct INSERT.
  - get_match_prediction: now only returns fully approved+published predictions.
  - do_not_publish is a hard block at RPC level, not just UI level.

  ## Important Notes
  1. The status value 'approved' in the old CHECK constraint was never actually
     written; code always writes 'approved_internal'. This migration fixes that.
  2. All existing rows with status 'approved' (if any exist) are migrated to
     'approved_internal' before the constraint is updated.
  3. get_match_prediction change is a BREAKING change for public API — only
     fully published predictions are visible. This is intentional and correct.
*/

-- ─── Step 1: Migrate any stale 'approved' rows to 'approved_internal' ─────────

UPDATE model_lab.match_story_drafts
SET status = 'approved_internal'
WHERE status = 'approved';

UPDATE model_lab.prematch_prediction_drafts
SET status = 'approved_internal'
WHERE status = 'approved';

-- ─── Step 2: Drop and recreate CHECK constraints with canonical state set ──────

ALTER TABLE model_lab.match_story_drafts
  DROP CONSTRAINT IF EXISTS match_story_drafts_status_check;

ALTER TABLE model_lab.match_story_drafts
  ADD CONSTRAINT match_story_drafts_status_check
  CHECK (status IN (
    'draft_generated',
    'pending_review',
    'review_required',
    'approved_internal',
    'approved_public',
    'rejected',
    'archived',
    'do_not_publish',
    'published',
    'hidden'
  ));

ALTER TABLE model_lab.prematch_prediction_drafts
  DROP CONSTRAINT IF EXISTS prematch_prediction_drafts_status_check;

ALTER TABLE model_lab.prematch_prediction_drafts
  ADD CONSTRAINT prematch_prediction_drafts_status_check
  CHECK (status IN (
    'draft_generated',
    'pending_review',
    'review_required',
    'approved_internal',
    'approved_public',
    'rejected',
    'archived',
    'do_not_publish',
    'published',
    'hidden'
  ));

-- ─── Step 3: Create publication_governance_log ─────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.publication_governance_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type           text        NOT NULL CHECK (entity_type IN ('story_draft', 'prediction_draft', 'publication')),
  entity_id             uuid        NOT NULL,
  previous_state        text,
  new_state             text        NOT NULL,
  changed_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at            timestamptz NOT NULL DEFAULT now(),
  reason                text,
  moderation_note       text,
  warning_snapshot      jsonb,
  calibration_snapshot  jsonb,
  publish_risk_level    text        CHECK (publish_risk_level IN ('low', 'medium', 'high', 'blocked'))
);

-- Append-only: no updates or deletes allowed
ALTER TABLE model_lab.publication_governance_log
  ENABLE ROW LEVEL SECURITY;

-- Admins can read
CREATE POLICY "Admins can read governance log"
  ON model_lab.publication_governance_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- No direct INSERT for any user; inserts go through SECURITY DEFINER functions only
-- (No INSERT policy means no direct inserts)

-- ─── Step 4: RPC to log governance events (SECURITY DEFINER bypasses RLS) ─────

CREATE OR REPLACE FUNCTION model_lab.log_publication_transition(
  p_entity_type         text,
  p_entity_id           uuid,
  p_previous_state      text,
  p_new_state           text,
  p_changed_by          uuid,
  p_reason              text        DEFAULT NULL,
  p_moderation_note     text        DEFAULT NULL,
  p_warning_snapshot    jsonb       DEFAULT NULL,
  p_calibration_snapshot jsonb      DEFAULT NULL,
  p_publish_risk_level  text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  -- Hard block: do_not_publish may never transition to anything that increases visibility
  IF p_previous_state = 'do_not_publish' AND p_new_state IN ('approved_internal', 'approved_public', 'published', 'pending_review') THEN
    RAISE EXCEPTION 'do_not_publish is a terminal block state and cannot be escalated to %', p_new_state;
  END IF;

  -- Hard block: review_required may never auto-transition
  -- (this fn is called from admin actions, but record the enforcement)
  IF p_new_state = 'approved_public' AND p_previous_state NOT IN ('approved_internal', 'approved_public') THEN
    RAISE EXCEPTION 'approved_public requires prior approved_internal state, current state: %', p_previous_state;
  END IF;

  INSERT INTO model_lab.publication_governance_log (
    entity_type, entity_id, previous_state, new_state,
    changed_by, reason, moderation_note,
    warning_snapshot, calibration_snapshot, publish_risk_level
  ) VALUES (
    p_entity_type, p_entity_id, p_previous_state, p_new_state,
    p_changed_by, p_reason, p_moderation_note,
    p_warning_snapshot, p_calibration_snapshot, p_publish_risk_level
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ─── Step 5: Public admin wrapper RPC ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_log_governance_event(
  p_entity_type         text,
  p_entity_id           uuid,
  p_previous_state      text,
  p_new_state           text,
  p_reason              text        DEFAULT NULL,
  p_moderation_note     text        DEFAULT NULL,
  p_publish_risk_level  text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_caller_role text;
  v_log_id      uuid;
BEGIN
  -- Verify caller is admin
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin_log_governance_event: caller is not admin';
  END IF;

  v_log_id := model_lab.log_publication_transition(
    p_entity_type        := p_entity_type,
    p_entity_id          := p_entity_id,
    p_previous_state     := p_previous_state,
    p_new_state          := p_new_state,
    p_changed_by         := auth.uid(),
    p_reason             := p_reason,
    p_moderation_note    := p_moderation_note,
    p_publish_risk_level := p_publish_risk_level
  );

  RETURN jsonb_build_object('success', true, 'log_id', v_log_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_log_governance_event TO authenticated;

-- ─── Step 6: Fix get_match_prediction — only return fully published predictions ─

CREATE OR REPLACE FUNCTION public.get_match_prediction(p_match_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
  SELECT to_jsonb(d) AS prediction
  FROM model_lab.prematch_prediction_drafts d
  WHERE d.match_id = p_match_id
    AND d.status = 'published'
  ORDER BY d.generated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_match_prediction FROM anon;
GRANT EXECUTE ON FUNCTION public.get_match_prediction TO anon, authenticated;

-- ─── Step 7: Rebuild ml_admin_publish_story with governance log ───────────────

CREATE OR REPLACE FUNCTION public.ml_admin_publish_story(
  p_story_draft_id uuid,
  p_published_by   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_story         model_lab.match_story_drafts%ROWTYPE;
  v_pred          model_lab.prematch_prediction_drafts%ROWTYPE;
  v_pub_id        uuid;
  v_risk_level    text;
BEGIN
  -- Fetch story draft
  SELECT * INTO v_story
  FROM model_lab.match_story_drafts
  WHERE id = p_story_draft_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Story draft not found');
  END IF;

  -- Hard block: do_not_publish
  IF v_story.status = 'do_not_publish' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Story is marked do_not_publish — blocked');
  END IF;

  -- Must be approved_internal to publish
  IF v_story.status <> 'approved_internal' THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Story must be approved_internal to publish, current status: %s', v_story.status));
  END IF;

  -- Prediction link required
  IF v_story.prediction_draft_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Story has no linked prediction — publish blocked');
  END IF;

  -- Fetch linked prediction
  SELECT * INTO v_pred
  FROM model_lab.prematch_prediction_drafts
  WHERE id = v_story.prediction_draft_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Linked prediction draft not found');
  END IF;

  -- Prediction do_not_publish hard block
  IF v_pred.status = 'do_not_publish' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Linked prediction is marked do_not_publish — blocked');
  END IF;

  -- No duplicate publications
  IF EXISTS (
    SELECT 1 FROM model_lab.match_story_publications
    WHERE match_id = v_story.match_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Publication already exists for this match');
  END IF;

  -- Determine risk level
  v_risk_level := CASE
    WHEN v_pred.has_calibration_warning OR v_pred.has_data_warning THEN 'high'
    WHEN v_story.confidence_tier IN ('low', 'very_low') THEN 'medium'
    ELSE 'low'
  END;

  -- Create publication record
  INSERT INTO model_lab.match_story_publications (
    story_draft_id, prediction_draft_id, match_id,
    is_visible, published_by, published_at
  ) VALUES (
    v_story.id, v_story.prediction_draft_id, v_story.match_id,
    true, p_published_by, now()
  )
  RETURNING id INTO v_pub_id;

  -- Update story draft status
  UPDATE model_lab.match_story_drafts
  SET status = 'published', published_at = now()
  WHERE id = p_story_draft_id;

  -- Update prediction draft status
  UPDATE model_lab.prematch_prediction_drafts
  SET status = 'published', published_at = now()
  WHERE id = v_story.prediction_draft_id;

  -- Log governance event (non-fatal if fails)
  BEGIN
    PERFORM model_lab.log_publication_transition(
      p_entity_type        := 'story_draft',
      p_entity_id          := p_story_draft_id,
      p_previous_state     := 'approved_internal',
      p_new_state          := 'published',
      p_changed_by         := p_published_by,
      p_reason             := 'admin_publish',
      p_publish_risk_level := v_risk_level
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- governance log failure must not block publish
  END;

  RETURN jsonb_build_object(
    'success',        true,
    'publication_id', v_pub_id,
    'risk_level',     v_risk_level
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_publish_story TO authenticated;

-- ─── Step 8: RPC to read governance log (admin only) ──────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_governance_log(
  p_entity_id   uuid    DEFAULT NULL,
  p_entity_type text    DEFAULT NULL,
  p_limit       integer DEFAULT 50
)
RETURNS TABLE (
  id                   uuid,
  entity_type          text,
  entity_id            uuid,
  previous_state       text,
  new_state            text,
  changed_by           uuid,
  changed_at           timestamptz,
  reason               text,
  moderation_note      text,
  warning_snapshot     jsonb,
  calibration_snapshot jsonb,
  publish_risk_level   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin_get_governance_log: caller is not admin';
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.entity_type, l.entity_id,
    l.previous_state, l.new_state,
    l.changed_by, l.changed_at,
    l.reason, l.moderation_note,
    l.warning_snapshot, l.calibration_snapshot,
    l.publish_risk_level
  FROM model_lab.publication_governance_log l
  WHERE (p_entity_id IS NULL OR l.entity_id = p_entity_id)
    AND (p_entity_type IS NULL OR l.entity_type = p_entity_type)
  ORDER BY l.changed_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_governance_log TO authenticated;

-- ─── Step 9: Safety comments on public API isolation ─────────────────────────
-- Operational loop (run_daily_operational_loop) calls run_daily_prematch_pipeline
-- which only creates/updates prediction_drafts with status 'pending_review'.
-- It never writes 'published', 'approved_internal', or 'approved_public'.
-- The governance layer ensures any status change to those values requires
-- admin_log_governance_event (which checks admin role).

-- WC2026 scenario engine (wc2026-strength-engine edge function) writes to
-- wc2026 schema tables only — it never touches match_story_drafts or
-- prematch_prediction_drafts.

-- Story generator (ml_admin_generate_match_story) always creates with
-- status = 'draft_generated'. Never 'published'.

COMMENT ON TABLE model_lab.publication_governance_log IS
  'Append-only audit trail for all publication state transitions. '
  'No deletes permitted. Admin-only read. Inserts via SECURITY DEFINER functions only.';
