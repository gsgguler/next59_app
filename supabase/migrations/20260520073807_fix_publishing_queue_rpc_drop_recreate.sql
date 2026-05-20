/*
  # Fix ml_admin_get_publishing_queue RPC — Drop and recreate with publications join

  ## Problem
  Existing RPC hardcodes has_publication/publication_visible as false.
  Return type must change to include new columns, requiring DROP + CREATE.

  ## Changes
  - Drops old function
  - Recreates with LEFT JOIN to model_lab.match_story_publications
  - Adds prediction_draft_id, story_draft_id, story_has_content, publication_id columns
  - Adds 'ready_to_publish' filter option
  - has_publication and publication_visible now reflect real DB state
*/

DROP FUNCTION IF EXISTS public.ml_admin_get_publishing_queue(integer, text, text, text, text);

CREATE OR REPLACE FUNCTION public.ml_admin_get_publishing_queue(
  p_limit       integer  DEFAULT 200,
  p_filter      text     DEFAULT NULL,
  p_competition text     DEFAULT NULL,
  p_date_from   text     DEFAULT NULL,
  p_date_to     text     DEFAULT NULL
)
RETURNS TABLE(
  match_id              uuid,
  match_date            text,
  competition_name      text,
  home_team             text,
  away_team             text,
  home_score            integer,
  away_score            integer,
  has_prediction        boolean,
  prediction_state      text,
  prediction_confidence numeric,
  prediction_draft_id   uuid,
  has_story             boolean,
  story_state           text,
  story_draft_id        uuid,
  story_has_content     boolean,
  has_publication       boolean,
  publication_visible   boolean,
  publication_id        uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'model_lab'
AS $$
SELECT
  m.id                                                                    AS match_id,
  m.match_date::text                                                      AS match_date,
  COALESCE(c.name, '')                                                    AS competition_name,
  ht.name                                                                 AS home_team,
  at2.name                                                                AS away_team,
  m.home_score_ft                                                         AS home_score,
  m.away_score_ft                                                         AS away_score,
  (pd.id IS NOT NULL)                                                     AS has_prediction,
  pd.status                                                               AS prediction_state,
  pd.confidence_score                                                     AS prediction_confidence,
  pd.id                                                                   AS prediction_draft_id,
  (sd.id IS NOT NULL)                                                     AS has_story,
  sd.status                                                               AS story_state,
  sd.id                                                                   AS story_draft_id,
  (sd.full_narrative_text IS NOT NULL AND sd.full_narrative_text <> '')   AS story_has_content,
  (pub.id IS NOT NULL)                                                    AS has_publication,
  COALESCE(pub.is_visible, false)                                         AS publication_visible,
  pub.id                                                                  AS publication_id
FROM public.matches m
JOIN  public.teams ht   ON ht.id  = m.home_team_id
JOIN  public.teams at2  ON at2.id = m.away_team_id
LEFT JOIN public.competition_seasons cs  ON cs.id = m.competition_season_id
LEFT JOIN public.competitions c          ON c.id  = cs.competition_id
LEFT JOIN model_lab.prematch_prediction_drafts pd  ON pd.match_id = m.id
LEFT JOIN model_lab.match_story_drafts         sd  ON sd.match_id = m.id
LEFT JOIN model_lab.match_story_publications   pub ON pub.match_id = m.id
WHERE (p_date_from   IS NULL OR m.match_date >= p_date_from::date)
  AND (p_date_to     IS NULL OR m.match_date <= p_date_to::date)
  AND (p_competition IS NULL OR c.name = p_competition)
  AND (
        p_filter IS NULL
    OR (p_filter = 'needs_prediction'  AND pd.id IS NULL)
    OR (p_filter = 'needs_story'       AND sd.id IS NULL)
    OR (p_filter = 'needs_review'      AND (pd.status = 'pending_review' OR sd.status = 'pending_review'))
    OR (p_filter = 'ready_to_publish'  AND sd.status = 'approved_internal' AND pub.id IS NULL)
    OR (p_filter = 'published'         AND pub.id IS NOT NULL)
  )
ORDER BY m.match_date DESC
LIMIT p_limit;
$$;
