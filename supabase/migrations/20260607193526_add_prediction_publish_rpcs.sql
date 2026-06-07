
-- Publish a single prediction draft (admin only)
CREATE OR REPLACE FUNCTION public.ml_admin_publish_prediction(
  p_draft_id    uuid,
  p_published_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_draft model_lab.prematch_prediction_drafts;
BEGIN
  -- Auth check: caller must be admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch draft
  SELECT * INTO v_draft
  FROM model_lab.prematch_prediction_drafts
  WHERE id = p_draft_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found: %', p_draft_id;
  END IF;

  IF v_draft.status NOT IN ('pending_review', 'approved_internal', 'approved_public') THEN
    RAISE EXCEPTION 'Draft status % cannot be published', v_draft.status;
  END IF;

  -- Mark published
  UPDATE model_lab.prematch_prediction_drafts
  SET status       = 'published',
      published_at = now(),
      reviewed_by  = p_published_by,
      approved_at  = COALESCE(approved_at, now())
  WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'draft_id',   p_draft_id,
    'match_id',   v_draft.match_id,
    'published_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_publish_prediction(uuid, uuid) TO authenticated;


-- Bulk publish all pending_review drafts (admin only)
-- Returns count of published drafts
CREATE OR REPLACE FUNCTION public.ml_admin_bulk_publish_predictions(
  p_published_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Auth check
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE model_lab.prematch_prediction_drafts
  SET status       = 'published',
      published_at = now(),
      reviewed_by  = p_published_by,
      approved_at  = COALESCE(approved_at, now())
  WHERE status IN ('pending_review', 'approved_internal', 'approved_public');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',      true,
    'published', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_bulk_publish_predictions(uuid) TO authenticated;
