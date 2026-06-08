-- Part 3: Promotion bridge from model_lab draft → public.predictions

CREATE OR REPLACE FUNCTION public.promote_prematch_prediction_draft_to_public(
  p_draft_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'model_lab', 'public'
AS $$
DECLARE
  v_draft   model_lab.prematch_prediction_drafts;
  v_outcome text;
  v_expl    jsonb;
  v_existing_id uuid;
  v_result_id   uuid;
BEGIN
  -- Load draft
  SELECT * INTO v_draft
  FROM model_lab.prematch_prediction_drafts
  WHERE id = p_draft_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promote_prematch_prediction_draft_to_public: draft not found: %', p_draft_id;
  END IF;

  IF v_draft.status <> 'published' THEN
    RAISE EXCEPTION 'promote_prematch_prediction_draft_to_public: draft status must be published, got: %', v_draft.status;
  END IF;

  IF v_draft.match_id IS NULL THEN
    RAISE EXCEPTION 'promote_prematch_prediction_draft_to_public: draft has no match_id';
  END IF;

  -- Derive predicted outcome from probabilities
  v_outcome := CASE
    WHEN v_draft.p_home >= v_draft.p_draw AND v_draft.p_home >= v_draft.p_away THEN 'H'
    WHEN v_draft.p_away > v_draft.p_home AND v_draft.p_away > v_draft.p_draw THEN 'A'
    ELSE 'D'
  END;

  -- Build explanation JSON from available narrative fields
  v_expl := jsonb_build_object(
    'source_draft_id',    p_draft_id,
    'home_team',          v_draft.home_team_name,
    'away_team',          v_draft.away_team_name,
    'p_home',             v_draft.p_home,
    'p_draw',             v_draft.p_draw,
    'p_away',             v_draft.p_away,
    'confidence_tier',    v_draft.confidence_tier,
    'feature_quality',    v_draft.feature_quality_tier,
    'prediction_formula', v_draft.prediction_formula,
    'predicted_score',    v_draft.predicted_score,
    'model_version',      v_draft.model_version,
    'calibration_version', v_draft.calibration_version,
    'has_calibration_warning', v_draft.has_calibration_warning,
    'has_data_warning',   v_draft.has_data_warning
  );

  -- Idempotency: check for active public prediction for this match + type
  SELECT id INTO v_existing_id
  FROM public.predictions
  WHERE match_id       = v_draft.match_id
    AND prediction_type = '1X2'
    AND superseded_by  IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- UPDATE existing row
    UPDATE public.predictions SET
      predicted_outcome = v_outcome,
      confidence        = v_draft.confidence_score,
      explanation_json  = v_expl,
      is_elite_only     = false,
      is_published      = true,
      published_at      = COALESCE(v_draft.published_at, now()),
      updated_at        = now()
    WHERE id = v_existing_id
    RETURNING id INTO v_result_id;

    RETURN jsonb_build_object(
      'ok',         true,
      'action',     'updated',
      'prediction_id', v_result_id,
      'match_id',   v_draft.match_id
    );
  ELSE
    -- INSERT new row
    INSERT INTO public.predictions (
      match_id,
      prediction_type,
      predicted_outcome,
      confidence,
      odds_fair,
      explanation_json,
      is_elite_only,
      is_published,
      published_at,
      superseded_by
    ) VALUES (
      v_draft.match_id,
      '1X2',
      v_outcome,
      v_draft.confidence_score,
      NULL,
      v_expl,
      false,
      true,
      COALESCE(v_draft.published_at, now()),
      NULL
    )
    RETURNING id INTO v_result_id;

    RETURN jsonb_build_object(
      'ok',         true,
      'action',     'inserted',
      'prediction_id', v_result_id,
      'match_id',   v_draft.match_id
    );
  END IF;
END;
$$;

-- Grant execute to authenticated (called by admin RPC internally)
GRANT EXECUTE ON FUNCTION public.promote_prematch_prediction_draft_to_public(uuid)
  TO authenticated;

-- Part 4: Update ml_admin_publish_prediction to call the bridge
CREATE OR REPLACE FUNCTION public.ml_admin_publish_prediction(
  p_draft_id     uuid,
  p_published_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'model_lab'
AS $$
DECLARE
  v_draft    model_lab.prematch_prediction_drafts;
  v_promoted jsonb;
BEGIN
  -- Auth check: caller must be admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id   = auth.uid()
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

  -- Mark draft published
  UPDATE model_lab.prematch_prediction_drafts
  SET status       = 'published',
      published_at = now(),
      reviewed_by  = p_published_by,
      approved_at  = COALESCE(approved_at, now())
  WHERE id = p_draft_id;

  -- Promote to public.predictions
  SELECT public.promote_prematch_prediction_draft_to_public(p_draft_id)
  INTO v_promoted;

  RETURN jsonb_build_object(
    'ok',           true,
    'draft_id',     p_draft_id,
    'match_id',     v_draft.match_id,
    'published_at', now(),
    'promotion',    v_promoted
  );
END;
$$;
