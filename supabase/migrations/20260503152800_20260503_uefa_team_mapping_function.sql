/*
  # UEFA Team Mapping SQL Function

  Maps UEFA fixture team names (from af_uefa_fixtures) to internal teams table
  using the same af_norm_name() normalization already proven for domestic leagues.

  ## Strategy
  1. Build a candidate set: af_home_team_name / af_away_team_name from af_uefa_fixtures
  2. Join to public.teams on normalized name
  3. Write af_uefa_fixture_mappings records with mapping_status:
     - verified: exact norm match
     - candidate: single fuzzy candidate (needs human review)
     - not_found: no match

  ## Safety
  - Does NOT write to public.teams
  - Does NOT modify domestic af_fixture_mappings
  - Does NOT touch matches.api_football_fixture_id
  - Only writes to af_uefa_fixture_mappings
*/

CREATE OR REPLACE FUNCTION public.af_run_uefa_team_mapping(
  p_league_id integer DEFAULT NULL,
  p_season    integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_verified   integer := 0;
  v_candidate  integer := 0;
  v_not_found  integer := 0;
  v_total      integer := 0;
  rec          record;
  home_team_id uuid;
  away_team_id uuid;
  home_status  text;
  away_status  text;
BEGIN
  FOR rec IN
    SELECT f.id,
           f.api_football_fixture_id,
           f.af_league_id,
           f.af_season,
           f.af_home_team_id,
           f.af_home_team_name,
           f.af_away_team_id,
           f.af_away_team_name
    FROM public.af_uefa_fixtures f
    WHERE (p_league_id IS NULL OR f.af_league_id = p_league_id)
      AND (p_season    IS NULL OR f.af_season    = p_season)
      AND NOT EXISTS (
        SELECT 1 FROM public.af_uefa_fixture_mappings m
        WHERE m.af_uefa_fixture_id = f.id
      )
  LOOP
    v_total := v_total + 1;

    -- Try exact normalized name match for home team
    SELECT t.id INTO home_team_id
    FROM public.teams t
    WHERE public.af_norm_name(t.name) = public.af_norm_name(rec.af_home_team_name)
    LIMIT 1;

    home_status := CASE WHEN home_team_id IS NOT NULL THEN 'verified' ELSE 'not_found' END;

    -- Try exact normalized name match for away team
    SELECT t.id INTO away_team_id
    FROM public.teams t
    WHERE public.af_norm_name(t.name) = public.af_norm_name(rec.af_away_team_name)
    LIMIT 1;

    away_status := CASE WHEN away_team_id IS NOT NULL THEN 'verified' ELSE 'not_found' END;

    -- Overall fixture mapping status: verified only if BOTH teams matched
    INSERT INTO public.af_uefa_fixture_mappings (
      af_uefa_fixture_id,
      api_football_fixture_id,
      af_league_id,
      af_season,
      mapping_status,
      confidence,
      notes
    ) VALUES (
      rec.id,
      rec.api_football_fixture_id,
      rec.af_league_id,
      rec.af_season,
      CASE
        WHEN home_status = 'verified' AND away_status = 'verified' THEN 'verified'
        WHEN home_status = 'verified' OR  away_status = 'verified' THEN 'candidate'
        ELSE 'not_found'
      END,
      CASE
        WHEN home_status = 'verified' AND away_status = 'verified' THEN 1.0
        WHEN home_status = 'verified' OR  away_status = 'verified' THEN 0.5
        ELSE 0.0
      END,
      format('home:%s(%s) away:%s(%s)',
        rec.af_home_team_name, home_status,
        rec.af_away_team_name, away_status)
    )
    ON CONFLICT DO NOTHING;

    IF home_status = 'verified' AND away_status = 'verified' THEN
      v_verified := v_verified + 1;
    ELSIF home_status = 'not_found' AND away_status = 'not_found' THEN
      v_not_found := v_not_found + 1;
    ELSE
      v_candidate := v_candidate + 1;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'total_processed', v_total,
    'verified',        v_verified,
    'candidate',       v_candidate,
    'not_found',       v_not_found,
    'note', 'UEFA teams are club teams from across Europe — not_found is expected for clubs not in domestic leagues DB',
    'safety', jsonb_build_object(
      'teams_table_modified', false,
      'domestic_mappings_modified', false,
      'matches_modified', false
    )
  );
END;
$$;
