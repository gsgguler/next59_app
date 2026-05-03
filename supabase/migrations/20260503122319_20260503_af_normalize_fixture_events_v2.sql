/*
  # Replace af_normalize_fixture_events — team resolution via name norm

  ## Change
  v1 referenced af_fixture_mappings.api_football_home_team_id which does not exist.
  This version resolves team_id by normalizing the event team name via af_norm_name()
  and comparing against af_norm_name(afm.af_home_team) / af_norm_name(afm.af_away_team).

  ## Team Resolution Logic
  For each event:
    norm(event.team.name) == norm(afm.af_home_team) → home_team_id
    norm(event.team.name) == norm(afm.af_away_team) → away_team_id
    else → team_id = NULL, increment team_map_failures

  ## Safety
  Does not touch match scores, match_stats, model_lab, predictions, WC history.
*/

CREATE OR REPLACE FUNCTION af_normalize_fixture_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_raw             RECORD;
  v_event           jsonb;
  v_elapsed         integer;
  v_extra_time      integer;
  v_event_team_norm text;
  v_home_norm       text;
  v_away_norm       text;
  v_team_id         uuid;
  v_home_team_id    uuid;
  v_away_team_id    uuid;
  v_rows_inserted   integer := 0;
  v_parse_errors    integer := 0;
  v_team_map_fail   integer := 0;
  v_fixtures_zero   integer := 0;
  v_event_count     integer;
BEGIN
  FOR v_raw IN
    SELECT r.id, r.match_id, r.api_football_fixture_id, r.response_json
    FROM api_football_fixture_events_raw r
    WHERE r.transform_status = 'raw'
      AND r.response_json IS NOT NULL
  LOOP
    BEGIN
      -- Remove existing normalized events for this fixture (idempotent)
      DELETE FROM api_football_fixture_events
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

      v_event_count := 0;

      FOR v_event IN
        SELECT jsonb_array_elements(v_raw.response_json -> 'events')
      LOOP
        -- Parse elapsed (integer column in AF response)
        v_elapsed := CASE
          WHEN v_event -> 'time' ->> 'elapsed' IS NOT NULL
          THEN (v_event -> 'time' ->> 'elapsed')::integer
          ELSE NULL
        END;

        -- Parse extra_time (may be null or integer)
        v_extra_time := CASE
          WHEN v_event -> 'time' ->> 'extra' IS NOT NULL
               AND v_event -> 'time' ->> 'extra' <> 'null'
          THEN (v_event -> 'time' ->> 'extra')::integer
          ELSE NULL
        END;

        -- Resolve team_id by normalizing event team name
        v_event_team_norm := af_norm_name(v_event -> 'team' ->> 'name');
        v_team_id := CASE
          WHEN v_event_team_norm = v_home_norm THEN v_home_team_id
          WHEN v_event_team_norm = v_away_norm THEN v_away_team_id
          ELSE NULL
        END;

        IF v_team_id IS NULL AND (v_event -> 'team' ->> 'name') IS NOT NULL THEN
          v_team_map_fail := v_team_map_fail + 1;
        END IF;

        INSERT INTO api_football_fixture_events (
          match_id,
          api_football_fixture_id,
          team_id,
          api_football_team_id,
          team_name,
          player_id,
          player_name,
          assist_player_id,
          assist_player_name,
          elapsed,
          extra_time,
          event_type,
          event_detail,
          comments,
          raw_payload
        ) VALUES (
          v_raw.match_id,
          v_raw.api_football_fixture_id,
          v_team_id,
          (v_event -> 'team' ->> 'id')::integer,
          v_event -> 'team' ->> 'name',
          (v_event -> 'player' ->> 'id')::integer,
          v_event -> 'player' ->> 'name',
          (v_event -> 'assist' ->> 'id')::integer,
          v_event -> 'assist' ->> 'name',
          v_elapsed,
          v_extra_time,
          v_event ->> 'type',
          v_event ->> 'detail',
          v_event ->> 'comments',
          v_event
        );

        v_rows_inserted := v_rows_inserted + 1;
        v_event_count   := v_event_count + 1;
      END LOOP;

      IF v_event_count = 0 THEN
        v_fixtures_zero := v_fixtures_zero + 1;
      END IF;

      UPDATE api_football_fixture_events_raw
        SET transform_status = 'normalized'
        WHERE id = v_raw.id;

    EXCEPTION WHEN OTHERS THEN
      v_parse_errors := v_parse_errors + 1;
      UPDATE api_football_fixture_events_raw
        SET transform_status = 'error'
        WHERE id = v_raw.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'rows_inserted',        v_rows_inserted,
    'parse_errors',         v_parse_errors,
    'team_map_failures',    v_team_map_fail,
    'fixtures_zero_events', v_fixtures_zero,
    'safety', jsonb_build_object(
      'scores_changed',         false,
      'match_stats_changed',    false,
      'model_lab_touched',      false,
      'predictions_created',    0,
      'odds_endpoints_called',  false,
      'lineups_players_called', false,
      'wc_history_touched',     false
    )
  );
END;
$$;
