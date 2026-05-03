/*
  # UEFA Fixture Normalization Functions

  Three idempotent normalization functions that transform UEFA raw API responses
  into structured tables. Mirror the domestic league normalization pattern.

  ## Functions
  1. `af_normalize_uefa_fixture_statistics(league_id, season)` — stats per team per fixture
  2. `af_normalize_uefa_fixture_events(league_id, season)`     — minute-level events
  3. `af_normalize_uefa_fixture_lineups(league_id, season)`    — formations + XI + bench

  ## Safety
  - All functions are SECURITY DEFINER, accessible only via service_role RPC
  - Only processes rows WHERE transform_status = 'raw' (idempotent)
  - Never touches matches, match_stats, or domestic enrichment tables
  - Returns jsonb summary for observability

  ## Notes
  - stats JSON key is 'stats' (array of {team, statistics} objects) — same as domestic
  - events JSON key is 'events' (array of event objects)
  - lineups JSON key is 'lineups' (array of {team, formation, startXI, substitutes} objects)
  - NULL xg/goals_prevented are NOT treated as zero — sparse optional features
*/

-- ── 1. Statistics normalization ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.af_normalize_uefa_fixture_statistics(
  p_league_id integer DEFAULT NULL,
  p_season    integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_processed integer := 0;
  v_skipped   integer := 0;
  v_failed    integer := 0;
  rec         record;
  team_entry  jsonb;
  stat_val    text;
BEGIN
  FOR rec IN
    SELECT r.id, r.af_uefa_fixture_id, r.api_football_fixture_id,
           r.af_league_id, r.af_season, r.response_json
    FROM public.af_uefa_fixture_statistics_raw r
    WHERE r.transform_status = 'raw'
      AND (p_league_id IS NULL OR r.af_league_id = p_league_id)
      AND (p_season    IS NULL OR r.af_season    = p_season)
  LOOP
    BEGIN
      FOR team_entry IN
        SELECT jsonb_array_elements(rec.response_json->'stats')
      LOOP
        INSERT INTO public.af_uefa_fixture_stats (
          af_uefa_fixture_id, api_football_fixture_id,
          af_league_id, af_season, af_team_id, team_name, half,
          ball_possession, shots_on_goal, shots_off_goal, total_shots,
          blocked_shots, shots_insidebox, shots_outsidebox,
          fouls, corner_kicks, offsides, yellow_cards, red_cards,
          goalkeeper_saves, total_passes, passes_accurate, passes_pct,
          expected_goals_provider, goals_prevented, raw_payload
        )
        VALUES (
          rec.af_uefa_fixture_id,
          rec.api_football_fixture_id,
          rec.af_league_id,
          rec.af_season,
          (team_entry->'team'->>'id')::integer,
          team_entry->'team'->>'name',
          'FT',
          -- ball_possession: strip trailing '%'
          NULLIF(regexp_replace(
            (SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
             WHERE s->>'type' = 'Ball Possession' LIMIT 1),
            '%', ''), '')::numeric,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Shots on Goal' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Shots off Goal' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Total Shots' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Blocked Shots' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Shots insidebox' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Shots outsidebox' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Fouls' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Corner Kicks' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Offsides' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Yellow Cards' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Red Cards' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Goalkeeper Saves' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Total passes' LIMIT 1), '')::integer,
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'Passes accurate' LIMIT 1), '')::integer,
          NULLIF(regexp_replace(
            (SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
             WHERE s->>'type' = 'Passes %' LIMIT 1),
            '%', ''), '')::numeric,
          -- xG: sparse — NULL if not provided
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'expected_goals' LIMIT 1), '')::numeric,
          -- goals_prevented: sparse
          NULLIF((SELECT s->>'value' FROM jsonb_array_elements(team_entry->'statistics') s
            WHERE s->>'type' = 'goals_prevented' LIMIT 1), '')::numeric,
          team_entry
        )
        ON CONFLICT (api_football_fixture_id, af_team_id, half) DO NOTHING;
      END LOOP;

      UPDATE public.af_uefa_fixture_statistics_raw
      SET transform_status = 'normalized', transform_error = NULL
      WHERE id = rec.id;

      -- Update has_statistics flag on the fixture
      UPDATE public.af_uefa_fixtures
      SET has_statistics = true, updated_at = now()
      WHERE id = rec.af_uefa_fixture_id;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.af_uefa_fixture_statistics_raw
      SET transform_status = 'error', transform_error = SQLERRM
      WHERE id = rec.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'failed',    v_failed,
    'safety', jsonb_build_object(
      'domestic_match_stats_changed', false,
      'model_lab_touched', false,
      'predictions_created', 0
    )
  );
END;
$$;

-- ── 2. Events normalization ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.af_normalize_uefa_fixture_events(
  p_league_id integer DEFAULT NULL,
  p_season    integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_processed integer := 0;
  v_failed    integer := 0;
  rec         record;
  ev          jsonb;
BEGIN
  FOR rec IN
    SELECT r.id, r.af_uefa_fixture_id, r.api_football_fixture_id,
           r.af_league_id, r.af_season, r.response_json
    FROM public.af_uefa_fixture_events_raw r
    WHERE r.transform_status = 'raw'
      AND (p_league_id IS NULL OR r.af_league_id = p_league_id)
      AND (p_season    IS NULL OR r.af_season    = p_season)
  LOOP
    BEGIN
      -- Delete existing normalized events for this fixture (idempotent re-run)
      DELETE FROM public.af_uefa_fixture_events
      WHERE api_football_fixture_id = rec.api_football_fixture_id;

      FOR ev IN SELECT jsonb_array_elements(rec.response_json->'events') LOOP
        INSERT INTO public.af_uefa_fixture_events (
          af_uefa_fixture_id, api_football_fixture_id,
          af_league_id, af_season,
          af_team_id, team_name,
          player_name, assist_player_name,
          elapsed, extra_time,
          event_type, event_detail, comments,
          raw_payload
        ) VALUES (
          rec.af_uefa_fixture_id,
          rec.api_football_fixture_id,
          rec.af_league_id,
          rec.af_season,
          NULLIF(ev->'team'->>'id', '')::integer,
          ev->'team'->>'name',
          ev->'player'->>'name',
          ev->'assist'->>'name',
          NULLIF(ev->'time'->>'elapsed', '')::integer,
          NULLIF(ev->'time'->>'extra', '')::integer,
          ev->>'type',
          ev->>'detail',
          ev->>'comments',
          ev
        );
      END LOOP;

      UPDATE public.af_uefa_fixture_events_raw
      SET transform_status = 'normalized', transform_error = NULL
      WHERE id = rec.id;

      UPDATE public.af_uefa_fixtures
      SET has_events = true, updated_at = now()
      WHERE id = rec.af_uefa_fixture_id;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.af_uefa_fixture_events_raw
      SET transform_status = 'error', transform_error = SQLERRM
      WHERE id = rec.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'failed',    v_failed,
    'safety', jsonb_build_object(
      'domestic_match_stats_changed', false,
      'model_lab_touched', false,
      'predictions_created', 0
    )
  );
END;
$$;

-- ── 3. Lineups normalization ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.af_normalize_uefa_fixture_lineups(
  p_league_id integer DEFAULT NULL,
  p_season    integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_processed integer := 0;
  v_failed    integer := 0;
  rec         record;
  team_entry  jsonb;
  lineup_id   uuid;
  player_row  jsonb;
BEGIN
  FOR rec IN
    SELECT r.id, r.af_uefa_fixture_id, r.api_football_fixture_id,
           r.af_league_id, r.af_season, r.response_json
    FROM public.af_uefa_fixture_lineups_raw r
    WHERE r.transform_status = 'raw'
      AND (p_league_id IS NULL OR r.af_league_id = p_league_id)
      AND (p_season    IS NULL OR r.af_season    = p_season)
  LOOP
    BEGIN
      FOR team_entry IN SELECT jsonb_array_elements(rec.response_json->'lineups') LOOP
        INSERT INTO public.af_uefa_fixture_lineups (
          af_uefa_fixture_id, api_football_fixture_id,
          af_league_id, af_season,
          af_team_id, team_name, formation, coach_name, raw_payload
        ) VALUES (
          rec.af_uefa_fixture_id,
          rec.api_football_fixture_id,
          rec.af_league_id,
          rec.af_season,
          (team_entry->'team'->>'id')::integer,
          team_entry->'team'->>'name',
          team_entry->>'formation',
          team_entry->'coach'->>'name',
          team_entry
        )
        ON CONFLICT (api_football_fixture_id, af_team_id) DO UPDATE
          SET formation   = EXCLUDED.formation,
              coach_name  = EXCLUDED.coach_name,
              raw_payload = EXCLUDED.raw_payload
        RETURNING id INTO lineup_id;

        -- Starters
        FOR player_row IN SELECT jsonb_array_elements(team_entry->'startXI') LOOP
          INSERT INTO public.af_uefa_fixture_lineup_players (
            lineup_id, af_uefa_fixture_id, api_football_fixture_id,
            af_team_id, af_player_id, player_name, player_number,
            position, grid, is_starting, raw_payload
          ) VALUES (
            lineup_id,
            rec.af_uefa_fixture_id,
            rec.api_football_fixture_id,
            (team_entry->'team'->>'id')::integer,
            NULLIF(player_row->'player'->>'id', '')::integer,
            player_row->'player'->>'name',
            NULLIF(player_row->'player'->>'number', '')::integer,
            player_row->'player'->>'pos',
            player_row->'player'->>'grid',
            true,
            player_row
          )
          ON CONFLICT DO NOTHING;
        END LOOP;

        -- Substitutes
        FOR player_row IN SELECT jsonb_array_elements(team_entry->'substitutes') LOOP
          INSERT INTO public.af_uefa_fixture_lineup_players (
            lineup_id, af_uefa_fixture_id, api_football_fixture_id,
            af_team_id, af_player_id, player_name, player_number,
            position, grid, is_starting, raw_payload
          ) VALUES (
            lineup_id,
            rec.af_uefa_fixture_id,
            rec.api_football_fixture_id,
            (team_entry->'team'->>'id')::integer,
            NULLIF(player_row->'player'->>'id', '')::integer,
            player_row->'player'->>'name',
            NULLIF(player_row->'player'->>'number', '')::integer,
            player_row->'player'->>'pos',
            player_row->'player'->>'grid',
            false,
            player_row
          )
          ON CONFLICT DO NOTHING;
        END LOOP;
      END LOOP;

      UPDATE public.af_uefa_fixture_lineups_raw
      SET transform_status = 'normalized', transform_error = NULL
      WHERE id = rec.id;

      UPDATE public.af_uefa_fixtures
      SET has_lineups = true, updated_at = now()
      WHERE id = rec.af_uefa_fixture_id;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.af_uefa_fixture_lineups_raw
      SET transform_status = 'error', transform_error = SQLERRM
      WHERE id = rec.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'failed',    v_failed,
    'safety', jsonb_build_object(
      'domestic_match_stats_changed', false,
      'model_lab_touched', false,
      'predictions_created', 0
    )
  );
END;
$$;
