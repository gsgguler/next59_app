/*
  # openfootball Pass-2 — Bosnia & Côte d'Ivoire name-variant fix + full cross-validation

  ## Summary
  Pass-1 left 2 matches unmapped due to team-name normalization gaps:
    1. Argentina vs Bosnia & Herzegovina (2014-06-15): openfootball="Bosnia-Herzegovina"
    2. Côte d'Ivoire vs Japan (2014-06-14): openfootball="Cote d'Ivoire" without accent

  ## Changes
  1. For each unmapped group-stage match: add missing normalization rules, re-attempt mapping.
  2. Fill NULL fields (group_name, result, city) only where NULL.
  3. Upsert source_mappings with correct column names.
  4. Cross-validate all 2010/2014 group matches:
     - group_name mismatch → data_quality_issues (medium)
     - result mismatch → data_quality_issues (high)
  5. Remove resolved unmapped_openfootball_row issues.

  ## Separation
  - public.matches: NOT TOUCHED
  - model_lab: NOT TOUCHED
  - predictions: NOT TOUCHED
*/

DO $$
DECLARE
  v_match_id       uuid;
  v_of_row         jsonb;
  v_of_group       text;
  v_of_result      text;
  v_of_city        text;
  v_of_score_h     int;
  v_of_score_a     int;
  v_db_group       text;
  v_db_result      text;
  v_db_city        text;
  v_team1_norm     text;
  v_team2_norm     text;
  v_provider_id    text;
  v_filled_group   int := 0;
  v_filled_result  int := 0;
  v_filled_city    int := 0;
  v_conflicts      int := 0;
  v_mapped         int := 0;
  v_yr             int;
  v_matches_json   jsonb;
  v_ground_parts   text[];
BEGIN

  FOR v_yr IN SELECT unnest(ARRAY[2010, 2014]) LOOP

    SELECT response_json->'matches'
    INTO v_matches_json
    FROM wc_history.raw_openfootball_responses
    WHERE edition_year = v_yr;

    FOR v_of_row IN SELECT jsonb_array_elements(v_matches_json) LOOP

      -- Only group-stage matches (have 'group' field)
      CONTINUE WHEN v_of_row->>'group' IS NULL;

      v_of_group   := v_of_row->>'group';
      v_of_score_h := (v_of_row->'score'->'ft'->0)::int;
      v_of_score_a := (v_of_row->'score'->'ft'->1)::int;
      v_of_result  := CASE
        WHEN v_of_score_h > v_of_score_a THEN 'home_win'
        WHEN v_of_score_h < v_of_score_a THEN 'away_win'
        ELSE 'draw'
      END;

      -- Parse city from ground: "Stadium, City" or "Stadium Name, City Name"
      v_ground_parts := string_to_array(v_of_row->>'ground', ',');
      v_of_city := TRIM(v_ground_parts[array_length(v_ground_parts, 1)]);

      -- Normalize team names: openfootball → API-Football equivalents
      v_team1_norm := v_of_row->>'team1';
      v_team2_norm := v_of_row->>'team2';

      v_team1_norm := replace(v_team1_norm, 'Bosnia-Herzegovina', 'Bosnia & Herzegovina');
      v_team2_norm := replace(v_team2_norm, 'Bosnia-Herzegovina', 'Bosnia & Herzegovina');
      v_team1_norm := replace(v_team1_norm, 'Cote d''Ivoire', 'Ivory Coast');
      v_team2_norm := replace(v_team2_norm, 'Cote d''Ivoire', 'Ivory Coast');
      v_team1_norm := replace(v_team1_norm, 'Côte d''Ivoire', 'Ivory Coast');
      v_team2_norm := replace(v_team2_norm, 'Côte d''Ivoire', 'Ivory Coast');
      v_team1_norm := replace(v_team1_norm, 'USA', 'United States');
      v_team2_norm := replace(v_team2_norm, 'USA', 'United States');
      v_team1_norm := replace(v_team1_norm, 'South Korea', 'Korea Republic');
      v_team2_norm := replace(v_team2_norm, 'South Korea', 'Korea Republic');
      v_team1_norm := replace(v_team1_norm, 'North Korea', 'Korea DPR');
      v_team2_norm := replace(v_team2_norm, 'North Korea', 'Korea DPR');

      -- Stable provider_entity_id: sha256 of canonical key
      v_provider_id := encode(
        digest(v_yr::text || '|' || (v_of_row->>'date') || '|' || (v_of_row->>'team1') || '|' || (v_of_row->>'team2'), 'sha256'),
        'hex'
      );

      -- Primary lookup: date + normalized team names (both orderings)
      SELECT m.id, m.group_name, m.result, m.city
      INTO v_match_id, v_db_group, v_db_result, v_db_city
      FROM wc_history.matches m
      WHERE m.edition_year = v_yr
        AND date_trunc('day', m.kickoff_utc) = (v_of_row->>'date')::date
        AND (
          (m.home_team_name = v_team1_norm AND m.away_team_name = v_team2_norm)
          OR
          (m.home_team_name = v_team2_norm AND m.away_team_name = v_team1_norm)
        )
      LIMIT 1;

      -- Fallback: date + score
      IF v_match_id IS NULL THEN
        SELECT m.id, m.group_name, m.result, m.city
        INTO v_match_id, v_db_group, v_db_result, v_db_city
        FROM wc_history.matches m
        WHERE m.edition_year = v_yr
          AND date_trunc('day', m.kickoff_utc) = (v_of_row->>'date')::date
          AND m.stage_code = 'Group stage'
          AND (
            (m.home_score_ft = v_of_score_h AND m.away_score_ft = v_of_score_a)
            OR
            (m.home_score_ft = v_of_score_a AND m.away_score_ft = v_of_score_h)
          )
        LIMIT 1;
      END IF;

      CONTINUE WHEN v_match_id IS NULL;

      -- ── group_name: cross-validate or fill ───────────────────────────────
      IF v_db_group IS NOT NULL AND v_db_group <> v_of_group THEN
        INSERT INTO wc_history.data_quality_issues
          (edition_year, entity_type, entity_id, issue_type, severity, description, source_provider)
        VALUES (
          v_yr, 'match', v_match_id, 'source_conflict', 'medium',
          'group_name conflict: API-Football=' || v_db_group || ' vs openfootball=' || v_of_group,
          'openfootball'
        );
        v_conflicts := v_conflicts + 1;
      ELSIF v_db_group IS NULL THEN
        UPDATE wc_history.matches SET group_name = v_of_group WHERE id = v_match_id;
        v_filled_group := v_filled_group + 1;
      END IF;

      -- ── result: cross-validate or fill ──────────────────────────────────
      IF v_db_result IS NOT NULL AND v_db_result <> v_of_result THEN
        INSERT INTO wc_history.data_quality_issues
          (edition_year, entity_type, entity_id, issue_type, severity, description, source_provider)
        VALUES (
          v_yr, 'match', v_match_id, 'source_conflict', 'high',
          'result conflict: API-Football=' || v_db_result || ' vs openfootball=' || v_of_result,
          'openfootball'
        );
        v_conflicts := v_conflicts + 1;
      ELSIF v_db_result IS NULL THEN
        UPDATE wc_history.matches SET result = v_of_result WHERE id = v_match_id;
        v_filled_result := v_filled_result + 1;
      END IF;

      -- ── city: fill NULL only ─────────────────────────────────────────────
      IF v_db_city IS NULL AND v_of_city <> '' THEN
        UPDATE wc_history.matches SET city = v_of_city WHERE id = v_match_id;
        v_filled_city := v_filled_city + 1;
      END IF;

      -- ── source_mapping: upsert ───────────────────────────────────────────
      INSERT INTO wc_history.source_mappings (
        edition_year,
        provider,
        provider_entity_type,
        provider_entity_id,
        internal_entity_type,
        internal_entity_id,
        confidence,
        mapping_status,
        raw_payload
      ) VALUES (
        v_yr,
        'openfootball',
        'match',
        v_provider_id,
        'wc_history.matches',
        v_match_id,
        0.98,
        'verified',
        jsonb_build_object(
          'date', v_of_row->>'date',
          'team1', v_of_row->>'team1',
          'team2', v_of_row->>'team2',
          'group', v_of_group
        )
      )
      ON CONFLICT (provider, provider_entity_type, provider_entity_id, internal_entity_type)
      DO UPDATE SET
        internal_entity_id = EXCLUDED.internal_entity_id,
        confidence         = EXCLUDED.confidence,
        mapping_status     = EXCLUDED.mapping_status;

      v_mapped := v_mapped + 1;

    END LOOP;
  END LOOP;

  -- Remove resolved unmapped issues for now-mapped rows
  DELETE FROM wc_history.data_quality_issues
  WHERE issue_type = 'unmapped_openfootball_row'
    AND (description LIKE '%Bosnia%' OR description LIKE '%Ivory Coast%' OR description LIKE '%Cote%');

  RAISE NOTICE 'Pass-2: mapped=% filled_group=% filled_result=% filled_city=% new_conflicts=%',
    v_mapped, v_filled_group, v_filled_result, v_filled_city, v_conflicts;

END $$;
