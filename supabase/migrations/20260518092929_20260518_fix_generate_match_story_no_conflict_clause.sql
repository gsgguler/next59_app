/*
  # Fix ml_admin_generate_match_story — remove invalid ON CONFLICT

  match_story_drafts has no unique constraint on match_id (only a primary key on id),
  so ON CONFLICT (match_id) was invalid. Replace with explicit duplicate check.
*/

CREATE OR REPLACE FUNCTION public.ml_admin_generate_match_story(
  p_match_id     uuid,
  p_generated_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, model_lab
AS $$
DECLARE
  v_home_team   text;
  v_away_team   text;
  v_competition text;
  v_match_date  date;
BEGIN
  SELECT
    ht.name,
    at2.name,
    COALESCE(c.name, 'Unknown'),
    m.match_date
  INTO v_home_team, v_away_team, v_competition, v_match_date
  FROM public.matches m
  JOIN public.teams ht  ON ht.id  = m.home_team_id
  JOIN public.teams at2 ON at2.id = m.away_team_id
  LEFT JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  LEFT JOIN public.competitions c         ON c.id  = cs.competition_id
  WHERE m.id = p_match_id;

  IF v_home_team IS NULL THEN
    RAISE EXCEPTION 'Match not found: %', p_match_id;
  END IF;

  -- If a draft already exists, reset it to draft_generated state
  IF EXISTS (SELECT 1 FROM model_lab.match_story_drafts WHERE match_id = p_match_id) THEN
    UPDATE model_lab.match_story_drafts
    SET status       = 'draft_generated',
        generated_at = now()
    WHERE match_id = p_match_id;
  ELSE
    INSERT INTO model_lab.match_story_drafts (
      match_id,
      competition_name,
      match_date,
      home_team_name,
      away_team_name,
      status,
      generated_by,
      generated_at
    ) VALUES (
      p_match_id,
      v_competition,
      v_match_date,
      v_home_team,
      v_away_team,
      'draft_generated',
      p_generated_by,
      now()
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ml_admin_generate_match_story(uuid, uuid) TO authenticated;
