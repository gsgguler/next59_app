/*
  # Create af_normalize_fixture_statistics() SQL function

  Reads from api_football_fixture_statistics_raw (transform_status='raw'),
  maps each stat type to the correct match_stats column, updates only NULL fields,
  marks raw rows as 'normalized' on success.

  Safe rules:
  - Never overwrites existing non-null values
  - Only updates half='FT' rows
  - Matches team by home/away position (index 0=home, index 1=away)
  - Skips if match_stats row missing
  - Returns jsonb report
*/

CREATE OR REPLACE FUNCTION public.af_normalize_fixture_statistics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated      integer := 0;
  v_skipped      integer := 0;
  v_no_stats     integer := 0;
  v_parse_errors integer := 0;
  rec            record;
  team_entry     jsonb;
  stats_arr      jsonb;
  stat_rec       jsonb;
  stat_type      text;
  stat_raw       text;
  stat_int       integer;
  stat_num       numeric;
  is_home        boolean;
  target_team_id uuid;
BEGIN

  FOR rec IN
    SELECT
      r.id AS raw_id,
      r.match_id,
      r.api_football_fixture_id,
      r.response_json,
      m.home_team_id,
      m.away_team_id
    FROM public.api_football_fixture_statistics_raw r
    JOIN public.matches m ON m.id = r.match_id
    WHERE r.transform_status = 'raw'
      AND r.response_json IS NOT NULL
      AND r.response_json ? 'stats'
  LOOP
    BEGIN
      -- Each raw row has stats = [{team, statistics}, {team, statistics}]
      -- index 0 = home team, index 1 = away team
      FOR team_idx IN 0..1 LOOP
        team_entry := rec.response_json->'stats'->team_idx;
        IF team_entry IS NULL THEN CONTINUE; END IF;

        stats_arr := team_entry->'statistics';
        IF stats_arr IS NULL OR jsonb_array_length(stats_arr) = 0 THEN
          v_no_stats := v_no_stats + 1;
          CONTINUE;
        END IF;

        is_home := (team_idx = 0);
        target_team_id := CASE WHEN is_home THEN rec.home_team_id ELSE rec.away_team_id END;

        -- Only update if the match_stats FT row exists for this team
        IF NOT EXISTS (
          SELECT 1 FROM public.match_stats
          WHERE match_id = rec.match_id AND team_id = target_team_id AND half = 'FT'
        ) THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        -- Build UPDATE from stat array
        FOR stat_rec IN SELECT * FROM jsonb_array_elements(stats_arr) LOOP
          stat_type := stat_rec->>'type';
          stat_raw  := stat_rec->>'value';
          IF stat_raw IS NULL OR stat_raw = 'null' THEN CONTINUE; END IF;

          -- Strip % suffix
          stat_raw := replace(stat_raw, '%', '');

          CASE stat_type
            WHEN 'Ball Possession' THEN
              stat_int := stat_raw::integer;
              UPDATE public.match_stats SET ball_possession = stat_int
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND ball_possession IS NULL;

            WHEN 'Goalkeeper Saves' THEN
              stat_int := stat_raw::integer;
              UPDATE public.match_stats SET goalkeeper_saves = stat_int
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND goalkeeper_saves IS NULL;

            WHEN 'Offsides' THEN
              stat_int := stat_raw::integer;
              UPDATE public.match_stats SET offsides = stat_int
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND offsides IS NULL;

            WHEN 'Blocked Shots' THEN
              stat_int := stat_raw::integer;
              UPDATE public.match_stats SET blocked_shots = stat_int
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND blocked_shots IS NULL;

            WHEN 'Shots insidebox' THEN
              stat_int := stat_raw::integer;
              UPDATE public.match_stats SET shots_insidebox = stat_int
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND shots_insidebox IS NULL;

            WHEN 'Shots outsidebox' THEN
              stat_int := stat_raw::integer;
              UPDATE public.match_stats SET shots_outsidebox = stat_int
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND shots_outsidebox IS NULL;

            WHEN 'Total passes' THEN
              stat_int := stat_raw::integer;
              UPDATE public.match_stats SET total_passes = stat_int
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND total_passes IS NULL;

            WHEN 'Passes accurate' THEN
              stat_int := stat_raw::integer;
              UPDATE public.match_stats SET passes_accurate = stat_int
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND passes_accurate IS NULL;

            WHEN 'Passes %' THEN
              stat_int := stat_raw::integer;
              UPDATE public.match_stats SET passes_percentage = stat_int
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND passes_percentage IS NULL;

            WHEN 'expected_goals' THEN
              stat_num := stat_raw::numeric;
              UPDATE public.match_stats SET expected_goals_provider = stat_num
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND expected_goals_provider IS NULL;

            WHEN 'goals_prevented' THEN
              stat_num := stat_raw::numeric;
              UPDATE public.match_stats SET goals_prevented = stat_num
              WHERE match_id = rec.match_id AND team_id = target_team_id
                AND half = 'FT' AND goals_prevented IS NULL;

            ELSE NULL; -- ignored stat types
          END CASE;
        END LOOP;

        v_updated := v_updated + 1;

      END LOOP; -- team loop

      -- Mark raw row as normalized
      UPDATE public.api_football_fixture_statistics_raw
      SET transform_status = 'normalized'
      WHERE id = rec.raw_id;

    EXCEPTION WHEN OTHERS THEN
      v_parse_errors := v_parse_errors + 1;
      UPDATE public.api_football_fixture_statistics_raw
      SET transform_status = 'error'
      WHERE id = rec.raw_id;
    END;

  END LOOP;

  RETURN jsonb_build_object(
    'team_rows_updated',  v_updated,
    'team_rows_skipped',  v_skipped,
    'no_stats_entries',   v_no_stats,
    'parse_errors',       v_parse_errors,
    'safety', jsonb_build_object(
      'scores_changed',        false,
      'match_stats_overwrite', 0,
      'model_lab_touched',     false,
      'predictions_created',   0,
      'odds_endpoints_called', false,
      'events_lineups_called', false,
      'wc_history_touched',    false
    )
  );
END;
$$;
