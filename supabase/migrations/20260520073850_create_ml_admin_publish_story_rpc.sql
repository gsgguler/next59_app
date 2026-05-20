/*
  # Create ml_admin_publish_story RPC

  ## Purpose
  Atomic publish action for the admin publishing queue.
  Copies approved story draft + prediction draft into match_story_publications.

  ## Rules enforced
  - Story must be in 'approved_internal' status
  - Story must have full_narrative_text (not null, not empty)
  - Prediction draft must exist (prediction_draft_id on story)
  - Duplicate guard: raises exception if publication already exists for this match_id
  - Sets story status → 'published' after successful insert
  - Sets prediction status → 'published' after successful insert

  ## Security
  SECURITY DEFINER with explicit search_path
  Called only from admin UI (profile.role = 'admin' checked at RLS layer)
*/

CREATE OR REPLACE FUNCTION public.ml_admin_publish_story(
  p_story_draft_id uuid,
  p_published_by   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'model_lab'
AS $$
DECLARE
  v_story    model_lab.match_story_drafts%ROWTYPE;
  v_pred     model_lab.prematch_prediction_drafts%ROWTYPE;
  v_pub_id   uuid;
BEGIN
  -- Load story draft
  SELECT * INTO v_story
  FROM model_lab.match_story_drafts
  WHERE id = p_story_draft_id;

  IF v_story.id IS NULL THEN
    RAISE EXCEPTION 'story_not_found: Senaryo taslağı bulunamadı (id: %)', p_story_draft_id;
  END IF;

  -- Status guard
  IF v_story.status <> 'approved_internal' THEN
    RAISE EXCEPTION 'story_not_approved: Senaryo "approved_internal" durumunda değil (mevcut: %)', v_story.status;
  END IF;

  -- Content guard — no fake publications
  IF v_story.full_narrative_text IS NULL OR trim(v_story.full_narrative_text) = '' THEN
    RAISE EXCEPTION 'story_no_content: Senaryo içeriği boş; yayınlanamaz';
  END IF;

  -- Prediction guard
  IF v_story.prediction_draft_id IS NULL THEN
    RAISE EXCEPTION 'no_prediction: Kaynak tahmin bağlantısı yok; önce tahmin üretin';
  END IF;

  SELECT * INTO v_pred
  FROM model_lab.prematch_prediction_drafts
  WHERE id = v_story.prediction_draft_id;

  IF v_pred.id IS NULL THEN
    RAISE EXCEPTION 'prediction_not_found: Kaynak tahmin kaydı bulunamadı';
  END IF;

  -- Duplicate guard
  IF EXISTS (SELECT 1 FROM model_lab.match_story_publications WHERE match_id = v_story.match_id) THEN
    RAISE EXCEPTION 'already_published: Bu maç için zaten bir yayın mevcut';
  END IF;

  -- Insert publication
  INSERT INTO model_lab.match_story_publications (
    story_draft_id, prediction_draft_id, match_id,
    competition_name, season_label, match_date,
    home_team_name, away_team_name,
    model_version, feature_version, calibration_version,
    prediction_formula,
    headline, full_narrative_text,
    p_home, p_draw, p_away,
    confidence_tier, feature_quality_tier,
    generated_by, approved_by, published_by,
    approved_at, published_at,
    is_visible
  )
  VALUES (
    v_story.id,
    v_story.prediction_draft_id,
    v_story.match_id,
    v_story.competition_name,
    v_story.season_label,
    v_story.match_date,
    v_story.home_team_name,
    v_story.away_team_name,
    v_story.model_version,
    v_story.feature_version,
    v_story.calibration_version,
    v_pred.prediction_formula,
    v_story.headline,
    v_story.full_narrative_text,
    v_story.p_home,
    v_story.p_draw,
    v_story.p_away,
    v_story.confidence_tier,
    v_story.feature_quality_tier,
    COALESCE(v_story.generated_by, p_published_by),
    p_published_by,
    p_published_by,
    COALESCE(v_story.approved_at, now()),
    now(),
    true
  )
  RETURNING id INTO v_pub_id;

  -- Mark story as published
  UPDATE model_lab.match_story_drafts
  SET status = 'published', published_at = now()
  WHERE id = v_story.id;

  -- Mark prediction as published
  UPDATE model_lab.prematch_prediction_drafts
  SET status = 'published'
  WHERE id = v_story.prediction_draft_id;

  RETURN jsonb_build_object(
    'success',        true,
    'publication_id', v_pub_id,
    'match_id',       v_story.match_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   SQLERRM
  );
END;
$$;
