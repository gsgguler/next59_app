/*
  # Player Enrichment RPC Helpers

  Helper functions used by player enrichment edge functions.

  1. get_domestic_fixture_ids(league_id, season_year, offset, limit)
     Returns api_football_fixture_id + match_id for a domestic league/season page.
     Used by af-fixture-player-stats edge function.

  2. af_normalize_fixture_player_stats(league_id, season_year)
     Normalizes af_fixture_player_stats_raw into af_fixture_player_stats.

  3. af_normalize_player_season_stats(league_id, season_year)
     Normalizes af_player_season_stats_raw into af_player_season_stats + af_player_profiles.
*/

-- ── 1. get_domestic_fixture_ids ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_domestic_fixture_ids(
  p_af_league_id integer,
  p_season_year  integer,
  p_offset       integer DEFAULT 0,
  p_limit        integer DEFAULT 50
)
RETURNS TABLE (
  match_id                uuid,
  api_football_fixture_id integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT m.id AS match_id, m.api_football_fixture_id
  FROM matches m
  JOIN competition_seasons cs ON cs.id = m.competition_season_id
  JOIN competitions c         ON c.id  = cs.competition_id
  JOIN seasons s              ON s.id  = cs.season_id
  WHERE c.api_football_id      = p_af_league_id
    AND s.year                 = p_season_year
    AND m.api_football_fixture_id IS NOT NULL
  ORDER BY m.match_date
  OFFSET p_offset
  LIMIT  p_limit;
$$;

-- ── 2. af_normalize_fixture_player_stats ─────────────────────────────────
CREATE OR REPLACE FUNCTION af_normalize_fixture_player_stats(
  p_league_id  integer DEFAULT NULL,
  p_season     integer DEFAULT NULL
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
  player_entry jsonb;
  stat        jsonb;
  p_games     jsonb;
  p_shots     jsonb;
  p_goals     jsonb;
  p_passes    jsonb;
  p_tackles   jsonb;
  p_duels     jsonb;
  p_dribbles  jsonb;
  p_fouls     jsonb;
  p_cards     jsonb;
  p_penalty   jsonb;
BEGIN
  FOR rec IN
    SELECT r.id, r.match_id, r.af_uefa_fixture_id,
           r.api_football_fixture_id, r.competition_type,
           r.response_json
    FROM af_fixture_player_stats_raw r
    WHERE r.transform_status = 'raw'
      AND (p_league_id IS NULL OR EXISTS (
        SELECT 1 FROM matches m
        JOIN competition_seasons cs ON cs.id = m.competition_season_id
        JOIN competitions c ON c.id = cs.competition_id
        JOIN seasons s ON s.id = cs.season_id
        WHERE m.id = r.match_id
          AND c.api_football_id = p_league_id
          AND (p_season IS NULL OR s.year = p_season)
      ))
  LOOP
    BEGIN
      FOR team_entry IN
        SELECT jsonb_array_elements(rec.response_json->'teams')
      LOOP
        FOR player_entry IN
          SELECT jsonb_array_elements(team_entry->'players')
        LOOP
          stat       := (player_entry->'statistics'->0);
          p_games    := stat->'games';
          p_shots    := stat->'shots';
          p_goals    := stat->'goals';
          p_passes   := stat->'passes';
          p_tackles  := stat->'tackles';
          p_duels    := stat->'duels';
          p_dribbles := stat->'dribbles';
          p_fouls    := stat->'fouls';
          p_cards    := stat->'cards';
          p_penalty  := stat->'penalty';

          INSERT INTO af_fixture_player_stats (
            competition_type, match_id, af_uefa_fixture_id,
            api_football_fixture_id,
            api_football_team_id, team_name,
            api_football_player_id, player_name,
            minutes, number, position, rating, captain, substitute,
            offsides,
            shots_total, shots_on,
            goals_total, goals_conceded, assists, saves,
            passes_total, passes_key, passes_accuracy,
            tackles_total, tackles_blocks, tackles_interceptions,
            duels_total, duels_won,
            dribbles_attempts, dribbles_success,
            fouls_drawn, fouls_committed,
            cards_yellow, cards_red,
            penalty_won, penalty_committed, penalty_scored, penalty_missed, penalty_saved,
            raw_payload
          ) VALUES (
            rec.competition_type, rec.match_id, rec.af_uefa_fixture_id,
            rec.api_football_fixture_id,
            (team_entry->'team'->>'id')::integer,
            team_entry->'team'->>'name',
            (player_entry->'player'->>'id')::integer,
            player_entry->'player'->>'name',
            NULLIF(p_games->>'minutes','')::integer,
            NULLIF(p_games->>'number','')::integer,
            p_games->>'position',
            NULLIF(p_games->>'rating','')::numeric,
            (p_games->>'captain')::boolean,
            (p_games->>'substitute')::boolean,
            NULLIF(stat->>'offsides','')::integer,
            NULLIF(p_shots->>'total','')::integer,
            NULLIF(p_shots->>'on','')::integer,
            NULLIF(p_goals->>'total','')::integer,
            NULLIF(p_goals->>'conceded','')::integer,
            NULLIF(p_goals->>'assists','')::integer,
            NULLIF(p_goals->>'saves','')::integer,
            NULLIF(p_passes->>'total','')::integer,
            NULLIF(p_passes->>'key','')::integer,
            NULLIF(p_passes->>'accuracy','')::integer,
            NULLIF(p_tackles->>'total','')::integer,
            NULLIF(p_tackles->>'blocks','')::integer,
            NULLIF(p_tackles->>'interceptions','')::integer,
            NULLIF(p_duels->>'total','')::integer,
            NULLIF(p_duels->>'won','')::integer,
            NULLIF(p_dribbles->>'attempts','')::integer,
            NULLIF(p_dribbles->>'success','')::integer,
            NULLIF(p_fouls->>'drawn','')::integer,
            NULLIF(p_fouls->>'committed','')::integer,
            NULLIF(p_cards->>'yellow','')::integer,
            NULLIF(p_cards->>'red','')::integer,
            NULLIF(p_penalty->>'won','')::integer,
            NULLIF(p_penalty->>'committed','')::integer,
            NULLIF(p_penalty->>'scored','')::integer,
            NULLIF(p_penalty->>'missed','')::integer,
            NULLIF(p_penalty->>'saved','')::integer,
            player_entry
          )
          ON CONFLICT (api_football_fixture_id, api_football_team_id, api_football_player_id)
          DO NOTHING;
        END LOOP;
      END LOOP;

      UPDATE af_fixture_player_stats_raw
      SET transform_status = 'normalized', transform_error = NULL
      WHERE id = rec.id;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE af_fixture_player_stats_raw
      SET transform_status = 'error', transform_error = SQLERRM
      WHERE id = rec.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'failed',    v_failed,
    'safety', jsonb_build_object(
      'model_lab_touched',           false,
      'predictions_created',         0,
      'domestic_match_stats_changed', false
    )
  );
END;
$$;

-- ── 3. af_normalize_player_season_stats ──────────────────────────────────
CREATE OR REPLACE FUNCTION af_normalize_player_season_stats(
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
  p_entry     jsonb;
  p_player    jsonb;
  p_stat      jsonb;
  p_team      jsonb;
  p_games     jsonb;
  p_subs      jsonb;
  p_shots     jsonb;
  p_goals     jsonb;
  p_passes    jsonb;
  p_tackles   jsonb;
  p_duels     jsonb;
  p_dribbles  jsonb;
  p_fouls     jsonb;
  p_cards     jsonb;
  p_pen       jsonb;
BEGIN
  FOR rec IN
    SELECT r.id, r.league_id, r.season, r.competition_type, r.response_json
    FROM af_player_season_stats_raw r
    WHERE r.transform_status = 'raw'
      AND (p_league_id IS NULL OR r.league_id = p_league_id)
      AND (p_season    IS NULL OR r.season    = p_season)
  LOOP
    BEGIN
      FOR p_entry IN
        SELECT jsonb_array_elements(rec.response_json->'players')
      LOOP
        p_player := p_entry->'player';
        p_stat   := p_entry->'statistics'->0;
        p_team   := p_stat->'team';
        p_games  := p_stat->'games';
        p_subs   := p_stat->'substitutes';
        p_shots  := p_stat->'shots';
        p_goals  := p_stat->'goals';
        p_passes := p_stat->'passes';
        p_tackles:= p_stat->'tackles';
        p_duels  := p_stat->'duels';
        p_dribbles:= p_stat->'dribbles';
        p_fouls  := p_stat->'fouls';
        p_cards  := p_stat->'cards';
        p_pen    := p_stat->'penalty';

        -- Upsert player profile
        INSERT INTO af_player_profiles (
          api_football_player_id, player_name, firstname, lastname,
          age, birth_date, birth_place, birth_country,
          nationality, height, weight, injured, photo_url, raw_payload
        ) VALUES (
          (p_player->>'id')::integer,
          p_player->>'name',
          p_player->>'firstname',
          p_player->>'lastname',
          NULLIF(p_player->>'age','')::integer,
          NULLIF(p_player->'birth'->>'date','')::date,
          p_player->'birth'->>'place',
          p_player->'birth'->>'country',
          p_player->>'nationality',
          p_player->>'height',
          p_player->>'weight',
          (p_player->>'injured')::boolean,
          p_player->>'photo',
          p_player
        )
        ON CONFLICT (api_football_player_id) DO UPDATE SET
          player_name  = EXCLUDED.player_name,
          age          = EXCLUDED.age,
          injured      = EXCLUDED.injured,
          updated_at   = now();

        -- Upsert season stats
        INSERT INTO af_player_season_stats (
          api_football_player_id, player_name, competition_type,
          league_id, season, api_football_team_id, team_name,
          appearances, lineups, minutes, position, rating, captain,
          subs_in, subs_out, subs_bench,
          shots_total, shots_on,
          goals_total, goals_conceded, assists, saves,
          passes_total, passes_key, passes_accuracy,
          tackles_total, tackles_blocks, tackles_interceptions,
          duels_total, duels_won,
          dribbles_attempts, dribbles_success, dribbles_past,
          fouls_drawn, fouls_committed,
          cards_yellow, cards_yellow_red, cards_red,
          penalty_won, penalty_committed, penalty_scored, penalty_missed, penalty_saved,
          raw_payload
        ) VALUES (
          (p_player->>'id')::integer,
          p_player->>'name',
          rec.competition_type,
          rec.league_id,
          rec.season,
          (p_team->>'id')::integer,
          p_team->>'name',
          NULLIF(p_games->>'appearences','')::integer,
          NULLIF(p_games->>'lineups','')::integer,
          NULLIF(p_games->>'minutes','')::integer,
          p_games->>'position',
          NULLIF(p_games->>'rating','')::numeric,
          (p_games->>'captain')::boolean,
          NULLIF(p_subs->>'in','')::integer,
          NULLIF(p_subs->>'out','')::integer,
          NULLIF(p_subs->>'bench','')::integer,
          NULLIF(p_shots->>'total','')::integer,
          NULLIF(p_shots->>'on','')::integer,
          NULLIF(p_goals->>'total','')::integer,
          NULLIF(p_goals->>'conceded','')::integer,
          NULLIF(p_goals->>'assists','')::integer,
          NULLIF(p_goals->>'saves','')::integer,
          NULLIF(p_passes->>'total','')::integer,
          NULLIF(p_passes->>'key','')::integer,
          NULLIF(p_passes->>'accuracy','')::integer,
          NULLIF(p_tackles->>'total','')::integer,
          NULLIF(p_tackles->>'blocks','')::integer,
          NULLIF(p_tackles->>'interceptions','')::integer,
          NULLIF(p_duels->>'total','')::integer,
          NULLIF(p_duels->>'won','')::integer,
          NULLIF(p_dribbles->>'attempts','')::integer,
          NULLIF(p_dribbles->>'success','')::integer,
          NULLIF(p_dribbles->>'past','')::integer,
          NULLIF(p_fouls->>'drawn','')::integer,
          NULLIF(p_fouls->>'committed','')::integer,
          NULLIF(p_cards->>'yellow','')::integer,
          NULLIF(p_cards->>'yellowred','')::integer,
          NULLIF(p_cards->>'red','')::integer,
          NULLIF(p_pen->>'won','')::integer,
          NULLIF(p_pen->>'commited','')::integer,
          NULLIF(p_pen->>'scored','')::integer,
          NULLIF(p_pen->>'missed','')::integer,
          NULLIF(p_pen->>'saved','')::integer,
          p_entry
        )
        ON CONFLICT (api_football_player_id, league_id, season, api_football_team_id)
        DO NOTHING;

        -- Upsert identity mapping
        INSERT INTO af_player_identity_mappings (
          api_football_player_id, player_name,
          normalized_player_name, nationality, birth_date,
          mapping_status, confidence
        ) VALUES (
          (p_player->>'id')::integer,
          p_player->>'name',
          lower(regexp_replace(p_player->>'name', '[^a-zA-Z ]', '', 'g')),
          p_player->>'nationality',
          NULLIF(p_player->'birth'->>'date','')::date,
          'provider_verified',
          1.0
        )
        ON CONFLICT (api_football_player_id) DO NOTHING;

      END LOOP;

      UPDATE af_player_season_stats_raw
      SET transform_status = 'normalized', transform_error = NULL
      WHERE id = rec.id;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE af_player_season_stats_raw
      SET transform_status = 'error', transform_error = SQLERRM
      WHERE id = rec.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'failed',    v_failed,
    'safety', jsonb_build_object(
      'model_lab_touched',   false,
      'predictions_created', 0
    )
  );
END;
$$;
