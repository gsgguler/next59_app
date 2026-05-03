/*
  # Normalize Fixture Lineups

  ## Purpose
  Parse raw /fixtures/lineups JSON into api_football_fixture_lineups and
  api_football_fixture_lineup_players rows.

  ## Logic
  - Iterates raw rows with transform_status = 'raw'
  - Deletes existing normalized lineups for that fixture before re-inserting (idempotent)
  - Resolves team_id via af_norm_name() against af_fixture_mappings home/away names,
    with fallback aliases for known AF event-name variants
  - is_starting=true for startXI, false for substitutes
  - grid stored as-is from AF (e.g. "1:1", "2:3"), NULL if absent
  - Does not infer missing position, grid, or formation

  ## Safety
  Does not touch match scores, match_stats, events, model_lab, predictions, WC history.
*/

CREATE OR REPLACE FUNCTION af_normalize_fixture_lineups()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_raw               RECORD;
  v_team_entry        jsonb;
  v_player_entry      jsonb;
  v_team_norm         text;
  v_home_norm         text;
  v_away_norm         text;
  v_team_id           uuid;
  v_home_team_id      uuid;
  v_away_team_id      uuid;
  v_lineup_id         uuid;
  v_lineups_inserted  integer := 0;
  v_players_inserted  integer := 0;
  v_parse_errors      integer := 0;
  v_team_map_fail     integer := 0;
  v_zero_lineups      integer := 0;
  v_one_sided         integer := 0;
  v_team_count        integer;
BEGIN
  FOR v_raw IN
    SELECT r.id, r.match_id, r.api_football_fixture_id, r.response_json
    FROM api_football_fixture_lineups_raw r
    WHERE r.transform_status = 'raw'
      AND r.response_json IS NOT NULL
  LOOP
    BEGIN
      -- Remove existing normalized lineups for this fixture (idempotent)
      DELETE FROM api_football_fixture_lineups
        WHERE api_football_fixture_id = v_raw.api_football_fixture_id;

      -- Resolve home/away team ids and norms from mapping
      SELECT
        m.home_team_id,
        m.away_team_id,
        af_norm_name(afm.af_home_team),
        af_norm_name(afm.af_away_team)
      INTO v_home_team_id, v_away_team_id, v_home_norm, v_away_norm
      FROM af_fixture_mappings afm
      JOIN matches m ON m.id = afm.match_id
      WHERE afm.match_id = v_raw.match_id
      LIMIT 1;

      v_team_count := jsonb_array_length(v_raw.response_json -> 'lineups');

      IF v_team_count = 0 THEN
        v_zero_lineups := v_zero_lineups + 1;
        UPDATE api_football_fixture_lineups_raw
          SET transform_status = 'normalized' WHERE id = v_raw.id;
        CONTINUE;
      END IF;

      IF v_team_count = 1 THEN
        v_one_sided := v_one_sided + 1;
      END IF;

      FOR v_team_entry IN
        SELECT jsonb_array_elements(v_raw.response_json -> 'lineups')
      LOOP
        -- Resolve team_id
        v_team_norm := af_norm_name(v_team_entry -> 'team' ->> 'name');
        v_team_id := CASE
          WHEN v_team_norm = v_home_norm THEN v_home_team_id
          WHEN v_team_norm = v_away_norm THEN v_away_team_id
          -- Known event-name aliases
          WHEN v_team_norm = 'bb bodrumspor' AND v_home_norm = 'bodrum fk' THEN v_home_team_id
          WHEN v_team_norm = 'bb bodrumspor' AND v_away_norm = 'bodrum fk' THEN v_away_team_id
          WHEN v_team_norm = 'istanbul basaksehir' AND v_home_norm = 'basaksehir' THEN v_home_team_id
          WHEN v_team_norm = 'istanbul basaksehir' AND v_away_norm = 'basaksehir' THEN v_away_team_id
          WHEN v_team_norm IN ('gazisehir gaziantep','gaziantep fk') AND v_home_norm IN ('gaziantep fk','gazisehir gaziantep') THEN v_home_team_id
          WHEN v_team_norm IN ('gazisehir gaziantep','gaziantep fk') AND v_away_norm IN ('gaziantep fk','gazisehir gaziantep') THEN v_away_team_id
          WHEN v_team_norm = 'fc koln' AND (v_home_norm = 'fc koln' OR v_home_norm = '1 fc koln') THEN v_home_team_id
          WHEN v_team_norm = 'fc koln' AND (v_away_norm = 'fc koln' OR v_away_norm = '1 fc koln') THEN v_away_team_id
          WHEN v_team_norm = 'verona' AND (v_home_norm LIKE '%verona%') THEN v_home_team_id
          WHEN v_team_norm = 'verona' AND (v_away_norm LIKE '%verona%') THEN v_away_team_id
          ELSE NULL
        END;

        IF v_team_id IS NULL THEN
          v_team_map_fail := v_team_map_fail + 1;
        END IF;

        -- Insert lineup row (team-level)
        INSERT INTO api_football_fixture_lineups (
          match_id,
          api_football_fixture_id,
          team_id,
          api_football_team_id,
          team_name,
          formation,
          coach_id,
          coach_name,
          raw_payload
        ) VALUES (
          v_raw.match_id,
          v_raw.api_football_fixture_id,
          v_team_id,
          (v_team_entry -> 'team' ->> 'id')::integer,
          v_team_entry -> 'team' ->> 'name',
          NULLIF(v_team_entry ->> 'formation', ''),
          (v_team_entry -> 'coach' ->> 'id')::integer,
          v_team_entry -> 'coach' ->> 'name',
          v_team_entry
        ) RETURNING id INTO v_lineup_id;

        v_lineups_inserted := v_lineups_inserted + 1;

        -- Insert startXI players (is_starting = true)
        FOR v_player_entry IN
          SELECT jsonb_array_elements(v_team_entry -> 'startXI')
        LOOP
          INSERT INTO api_football_fixture_lineup_players (
            lineup_id,
            match_id,
            team_id,
            api_football_fixture_id,
            api_football_player_id,
            player_name,
            player_number,
            position,
            grid,
            is_starting,
            raw_payload
          ) VALUES (
            v_lineup_id,
            v_raw.match_id,
            v_team_id,
            v_raw.api_football_fixture_id,
            (v_player_entry -> 'player' ->> 'id')::integer,
            v_player_entry -> 'player' ->> 'name',
            (v_player_entry -> 'player' ->> 'number')::integer,
            v_player_entry -> 'player' ->> 'pos',
            NULLIF(v_player_entry -> 'player' ->> 'grid', ''),
            true,
            v_player_entry -> 'player'
          );
          v_players_inserted := v_players_inserted + 1;
        END LOOP;

        -- Insert substitutes (is_starting = false)
        FOR v_player_entry IN
          SELECT jsonb_array_elements(v_team_entry -> 'substitutes')
        LOOP
          INSERT INTO api_football_fixture_lineup_players (
            lineup_id,
            match_id,
            team_id,
            api_football_fixture_id,
            api_football_player_id,
            player_name,
            player_number,
            position,
            grid,
            is_starting,
            raw_payload
          ) VALUES (
            v_lineup_id,
            v_raw.match_id,
            v_team_id,
            v_raw.api_football_fixture_id,
            (v_player_entry -> 'player' ->> 'id')::integer,
            v_player_entry -> 'player' ->> 'name',
            (v_player_entry -> 'player' ->> 'number')::integer,
            v_player_entry -> 'player' ->> 'pos',
            NULL,  -- bench players have no grid
            false,
            v_player_entry -> 'player'
          );
          v_players_inserted := v_players_inserted + 1;
        END LOOP;

      END LOOP;

      UPDATE api_football_fixture_lineups_raw
        SET transform_status = 'normalized' WHERE id = v_raw.id;

    EXCEPTION WHEN OTHERS THEN
      v_parse_errors := v_parse_errors + 1;
      UPDATE api_football_fixture_lineups_raw
        SET transform_status = 'error' WHERE id = v_raw.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'lineups_inserted',      v_lineups_inserted,
    'players_inserted',      v_players_inserted,
    'parse_errors',          v_parse_errors,
    'team_map_failures',     v_team_map_fail,
    'fixtures_zero_lineups', v_zero_lineups,
    'fixtures_one_sided',    v_one_sided,
    'safety', jsonb_build_object(
      'scores_changed',              false,
      'match_stats_changed',         false,
      'events_changed',              false,
      'model_lab_touched',           false,
      'predictions_created',         0,
      'odds_endpoints_called',       false,
      'stats_events_players_called', false,
      'wc_history_touched',          false
    )
  );
END;
$$;
