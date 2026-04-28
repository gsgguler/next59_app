#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jsordrrshzivxayryryi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3JkcnJzaHppdnhheXJ5cnlpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk3NDg0MiwiZXhwIjoyMDkyNTUwODQyfQ.CIiKagCt1nJD74I3LR3MUym-MYSIrPyjHEz5VxylaN4';
const BATCH_SIZE = 100;
const REST_TIME = 10000;

const V6_SQL = `DROP FUNCTION IF EXISTS transform_batch_fn(INTEGER);
CREATE OR REPLACE FUNCTION transform_batch_fn(p_batch_size INTEGER DEFAULT 5000)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_row RECORD;
    v_home_team_id UUID;
    v_away_team_id UUID;
    v_comp_season_id UUID;
    v_match_id UUID;
    v_batch_processed INTEGER := 0;
    v_batch_matches INTEGER := 0;
    v_batch_stats INTEGER := 0;
    v_batch_odds_1x2 INTEGER := 0;
    v_batch_odds_ou INTEGER := 0;
    v_batch_odds_ah INTEGER := 0;
    v_batch_skipped INTEGER := 0;
    v_batch_errors INTEGER := 0;
    v_start TIMESTAMP := clock_timestamp();
    v_comp_cache JSONB := '{}'::JSONB;
    v_team_cache JSONB := '{}'::JSONB;
    v_cs RECORD;
    v_t RECORD;
    v_ck TEXT;
    v_norm_season TEXT;
    v_yy INTEGER;
    v_home_name TEXT;
    v_away_name TEXT;
    v_raw JSONB;
    v_hs INTEGER; v_hst INTEGER; v_as INTEGER; v_ast INTEGER;
    v_shots_off INTEGER;
    v_elapsed_sec NUMERIC;
BEGIN
    SET LOCAL statement_timeout = '60s';
    FOR v_cs IN SELECT football_data_uk_code, football_data_uk_season_label, id FROM competition_seasons LOOP
        v_comp_cache := jsonb_set(v_comp_cache, ARRAY[v_cs.football_data_uk_code || '|' || v_cs.football_data_uk_season_label], to_jsonb(v_cs.id));
    END LOOP;
    FOR v_t IN SELECT id, LOWER(name) as lname FROM teams LOOP
        v_team_cache := jsonb_set(v_team_cache, ARRAY[v_t.lname], to_jsonb(v_t.id));
    END LOOP;
    FOR v_row IN SELECT id, deterministic_source_match_id, league_code, season_code, match_date, home_team, away_team, home_score, away_score, referee, raw_data FROM staging_football_data_uk_raw WHERE is_processed = false ORDER BY id LIMIT p_batch_size LOOP
        BEGIN
            v_elapsed_sec := EXTRACT(EPOCH FROM (clock_timestamp() - v_start));
            IF v_elapsed_sec > 55 THEN EXIT; END IF;
            v_raw := v_row.raw_data::JSONB;
            v_norm_season := v_row.season_code;
            IF LENGTH(v_row.season_code) = 4 THEN
                v_yy := SUBSTRING(v_row.season_code, 1, 2)::INTEGER;
                v_norm_season := CASE WHEN v_yy >= 50 THEN '19' ELSE '20' END || v_row.season_code;
            END IF;
            v_ck := v_row.league_code || '|' || v_norm_season;
            IF NOT (v_comp_cache ? v_ck) THEN
                UPDATE staging_football_data_uk_raw SET is_processed = true, processed_at = NOW() WHERE id = v_row.id;
                v_batch_skipped := v_batch_skipped + 1;
                CONTINUE;
            END IF;
            v_comp_season_id := (v_comp_cache ->> v_ck)::UUID;
            v_home_name := COALESCE(v_row.home_team, v_raw ->> 'HomeTeam');
            v_away_name := COALESCE(v_row.away_team, v_raw ->> 'AwayTeam');
            IF v_home_name IS NULL OR v_away_name IS NULL THEN
                UPDATE staging_football_data_uk_raw SET is_processed = true, processed_at = NOW() WHERE id = v_row.id;
                v_batch_skipped := v_batch_skipped + 1;
                CONTINUE;
            END IF;
            IF v_team_cache ? LOWER(v_home_name) THEN v_home_team_id := (v_team_cache ->> LOWER(v_home_name))::UUID;
            ELSE INSERT INTO teams (name) VALUES (v_home_name) RETURNING id INTO v_home_team_id; v_team_cache := jsonb_set(v_team_cache, ARRAY[LOWER(v_home_name)], to_jsonb(v_home_team_id)); END IF;
            IF v_team_cache ? LOWER(v_away_name) THEN v_away_team_id := (v_team_cache ->> LOWER(v_away_name))::UUID;
            ELSE INSERT INTO teams (name) VALUES (v_away_name) RETURNING id INTO v_away_team_id; v_team_cache := jsonb_set(v_team_cache, ARRAY[LOWER(v_away_name)], to_jsonb(v_away_team_id)); END IF;
            v_hs := NULLIF(v_raw ->> 'HS', '')::INT; v_hst := NULLIF(v_raw ->> 'HST', '')::INT;
            v_as := NULLIF(v_raw ->> 'AS', '')::INT; v_ast := NULLIF(v_raw ->> 'AST', '')::INT;
            INSERT INTO matches (competition_season_id, home_team_id, away_team_id, match_date, match_time, deterministic_source_match_id, home_score_ft, away_score_ft, home_score_ht, away_score_ht, referee, status_short, half_time_result, attendance, odds_metadata)
            VALUES (v_comp_season_id, v_home_team_id, v_away_team_id, v_row.match_date, NULLIF(v_raw ->> 'Time', '')::TIME, v_row.deterministic_source_match_id, v_row.home_score, v_row.away_score, NULLIF(v_raw ->> 'HTHG', '')::NUMERIC, NULLIF(v_raw ->> 'HTAG', '')::NUMERIC, v_row.referee, CASE WHEN v_row.home_score IS NOT NULL THEN 'FT' ELSE 'NS' END, NULLIF(v_raw ->> 'HTR', ''), NULLIF(v_raw ->> 'Attendance', '')::INT, jsonb_build_object('Bb1X2', v_raw ->> 'Bb1X2', 'BbAH', v_raw ->> 'BbAH', 'BbAHh', v_raw ->> 'BbAHh', 'BbOU', v_raw ->> 'BbOU'))
            ON CONFLICT (deterministic_source_match_id) DO UPDATE SET home_score_ft = EXCLUDED.home_score_ft, away_score_ft = EXCLUDED.away_score_ft, home_score_ht = EXCLUDED.home_score_ht, away_score_ht = EXCLUDED.away_score_ht, match_time = EXCLUDED.match_time, half_time_result = EXCLUDED.half_time_result, attendance = EXCLUDED.attendance, odds_metadata = EXCLUDED.odds_metadata
            RETURNING id INTO v_match_id;
            v_batch_matches := v_batch_matches + 1;
            v_shots_off := CASE WHEN v_hs IS NOT NULL AND v_hst IS NOT NULL THEN v_hs - v_hst ELSE NULL END;
            INSERT INTO match_stats (match_id, team_id, half, total_shots, shots_on_goal, shots_off_goal, fouls, corner_kicks, offsides, yellow_cards, red_cards, hit_woodwork, free_kicks_conceded, booking_points)
            VALUES (v_match_id, v_home_team_id, 'FT', v_hs, v_hst, v_shots_off, NULLIF(v_raw ->> 'HF', '')::INT, NULLIF(v_raw ->> 'HC', '')::INT, NULLIF(v_raw ->> 'HO', '')::INT, NULLIF(v_raw ->> 'HY', '')::INT, NULLIF(v_raw ->> 'HR', '')::INT, NULLIF(v_raw ->> 'HHW', '')::INT, NULLIF(v_raw ->> 'HFKC', '')::INT, NULLIF(v_raw ->> 'HBP', '')::INT)
            ON CONFLICT (match_id, team_id, half) DO NOTHING;
            v_batch_stats := v_batch_stats + 1;
            v_shots_off := CASE WHEN v_as IS NOT NULL AND v_ast IS NOT NULL THEN v_as - v_ast ELSE NULL END;
            INSERT INTO match_stats (match_id, team_id, half, total_shots, shots_on_goal, shots_off_goal, fouls, corner_kicks, offsides, yellow_cards, red_cards, hit_woodwork, free_kicks_conceded, booking_points)
            VALUES (v_match_id, v_away_team_id, 'FT', v_as, v_ast, v_shots_off, NULLIF(v_raw ->> 'AF', '')::INT, NULLIF(v_raw ->> 'AC', '')::INT, NULLIF(v_raw ->> 'AO', '')::INT, NULLIF(v_raw ->> 'AY', '')::INT, NULLIF(v_raw ->> 'AR', '')::INT, NULLIF(v_raw ->> 'AHW', '')::INT, NULLIF(v_raw ->> 'AFKC', '')::INT, NULLIF(v_raw ->> 'ABP', '')::INT)
            ON CONFLICT (match_id, team_id, half) DO NOTHING;
            v_batch_stats := v_batch_stats + 1;
            IF NULLIF(v_raw ->> 'B365H', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'B365H')::NUMERIC, 'opening', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'B365D', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'B365D')::NUMERIC, 'opening', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'B365A', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'B365A')::NUMERIC, 'opening', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BWH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'BWH')::NUMERIC, 'opening', 'Betway') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BWD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'BWD')::NUMERIC, 'opening', 'Betway') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BWA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'BWA')::NUMERIC, 'opening', 'Betway') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'IWH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'IWH')::NUMERIC, 'opening', 'Interwetten') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'IWD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'IWD')::NUMERIC, 'opening', 'Interwetten') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'IWA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'IWA')::NUMERIC, 'opening', 'Interwetten') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'PSH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'PSH')::NUMERIC, 'opening', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'PSD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'PSD')::NUMERIC, 'opening', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'PSA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'PSA')::NUMERIC, 'opening', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'WHH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'WHH')::NUMERIC, 'opening', 'William Hill') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'WHD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'WHD')::NUMERIC, 'opening', 'William Hill') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'WHA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'WHA')::NUMERIC, 'opening', 'William Hill') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'VCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'VCH')::NUMERIC, 'opening', 'VC Bet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'VCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'VCD')::NUMERIC, 'opening', 'VC Bet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'VCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'VCA')::NUMERIC, 'opening', 'VC Bet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'SCH')::NUMERIC, 'opening', 'Sportingbet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'SCD')::NUMERIC, 'opening', 'Sportingbet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'SCA')::NUMERIC, 'opening', 'Sportingbet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'LBH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'LBH')::NUMERIC, 'opening', 'Ladbrokes') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'LBD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'LBD')::NUMERIC, 'opening', 'Ladbrokes') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'LBA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'LBA')::NUMERIC, 'opening', 'Ladbrokes') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'GBH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'GBH')::NUMERIC, 'opening', 'Gamebookers') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'GBD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'GBD')::NUMERIC, 'opening', 'Gamebookers') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'GBA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'GBA')::NUMERIC, 'opening', 'Gamebookers') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BSH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'BSH')::NUMERIC, 'opening', 'Blue Square') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BSD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'BSD')::NUMERIC, 'opening', 'Blue Square') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BSA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'BSA')::NUMERIC, 'opening', 'Blue Square') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> '1XBH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> '1XBH')::NUMERIC, 'opening', '1XBet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> '1XBD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> '1XBD')::NUMERIC, 'opening', '1XBet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> '1XBA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> '1XBA')::NUMERIC, 'opening', '1XBet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BFH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'BFH')::NUMERIC, 'opening', 'Betfair') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BFD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'BFD')::NUMERIC, 'opening', 'Betfair') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BFA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'BFA')::NUMERIC, 'opening', 'Betfair') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'PPH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'PPH')::NUMERIC, 'opening', 'Paddy Power') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'PPD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'PPD')::NUMERIC, 'opening', 'Paddy Power') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'PPA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'PPA')::NUMERIC, 'opening', 'Paddy Power') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SYH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'SYH')::NUMERIC, 'opening', 'Stanleybet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SYD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'SYD')::NUMERIC, 'opening', 'Stanleybet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SYA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'SYA')::NUMERIC, 'opening', 'Stanleybet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SOH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'SOH')::NUMERIC, 'opening', 'SportingOdds') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SOD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'SOD')::NUMERIC, 'opening', 'SportingOdds') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SOA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'SOA')::NUMERIC, 'opening', 'SportingOdds') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'NAH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'NAH')::NUMERIC, 'opening', 'NordicBet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'NAD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'NAD')::NUMERIC, 'opening', 'NordicBet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'NAA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'NAA')::NUMERIC, 'opening', 'NordicBet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SJH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'SJH')::NUMERIC, 'opening', 'Svenska Spel') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SJD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'SJD')::NUMERIC, 'opening', 'Svenska Spel') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SJA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'SJA')::NUMERIC, 'opening', 'Svenska Spel') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SBH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'SBH')::NUMERIC, 'opening', 'SkyBet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SBD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'SBD')::NUMERIC, 'opening', 'SkyBet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SBA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'SBA')::NUMERIC, 'opening', 'SkyBet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'MaxH')::NUMERIC, 'opening', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'MaxD')::NUMERIC, 'opening', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'MaxA')::NUMERIC, 'opening', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'AvgH')::NUMERIC, 'opening', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'AvgD')::NUMERIC, 'opening', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'AvgA')::NUMERIC, 'opening', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BbMxH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'BbMxH')::NUMERIC, 'opening', 'Betbrain Max') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BbMxD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'BbMxD')::NUMERIC, 'opening', 'Betbrain Max') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BbMxA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'BbMxA')::NUMERIC, 'opening', 'Betbrain Max') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BbAvH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'BbAvH')::NUMERIC, 'opening', 'Betbrain Avg') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BbAvD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'BbAvD')::NUMERIC, 'opening', 'Betbrain Avg') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BbAvA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'BbAvA')::NUMERIC, 'opening', 'Betbrain Avg') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'B365CH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'B365CH')::NUMERIC, 'closing', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'B365CD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'B365CD')::NUMERIC, 'closing', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'B365CA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'B365CA')::NUMERIC, 'closing', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'IWCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'IWCH')::NUMERIC, 'closing', 'Interwetten') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'IWCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'IWCD')::NUMERIC, 'closing', 'Interwetten') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'IWCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'IWCA')::NUMERIC, 'closing', 'Interwetten') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BWCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'BWCH')::NUMERIC, 'closing', 'Betway') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BWCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'BWCD')::NUMERIC, 'closing', 'Betway') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'BWCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'BWCA')::NUMERIC, 'closing', 'Betway') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'VCCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'VCCH')::NUMERIC, 'closing', 'VC Bet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'VCCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'VCCD')::NUMERIC, 'closing', 'VC Bet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'VCCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'VCCA')::NUMERIC, 'closing', 'VC Bet') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'WHCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'WHCH')::NUMERIC, 'closing', 'William Hill') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'WHCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'WHCD')::NUMERIC, 'closing', 'William Hill') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'WHCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'WHCA')::NUMERIC, 'closing', 'William Hill') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'PSCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'PSCH')::NUMERIC, 'closing', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'PSCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'PSCD')::NUMERIC, 'closing', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'PSCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'PSCA')::NUMERIC, 'closing', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'GBCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'GBCH')::NUMERIC, 'closing', 'Gamebookers') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'GBCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'GBCD')::NUMERIC, 'closing', 'Gamebookers') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'GBCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'GBCA')::NUMERIC, 'closing', 'Gamebookers') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'LBCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'LBCH')::NUMERIC, 'closing', 'Ladbrokes') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'LBCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'LBCD')::NUMERIC, 'closing', 'Ladbrokes') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'LBCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'LBCA')::NUMERIC, 'closing', 'Ladbrokes') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SJCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'SJCH')::NUMERIC, 'closing', 'Svenska Spel') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SJCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'SJCD')::NUMERIC, 'closing', 'Svenska Spel') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SJCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'SJCA')::NUMERIC, 'closing', 'Svenska Spel') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SOCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'SOCH')::NUMERIC, 'closing', 'SportingOdds') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SOCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'SOCD')::NUMERIC, 'closing', 'SportingOdds') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'SOCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'SOCA')::NUMERIC, 'closing', 'SportingOdds') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'MaxCH')::NUMERIC, 'closing', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'MaxCD')::NUMERIC, 'closing', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'MaxCA')::NUMERIC, 'closing', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgCH', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Home', (v_raw ->> 'AvgCH')::NUMERIC, 'closing', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgCD', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Draw', (v_raw ->> 'AvgCD')::NUMERIC, 'closing', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgCA', '') IS NOT NULL THEN INSERT INTO match_odds (match_id, market, selection, odds, odds_type, provider_name) VALUES (v_match_id, '1X2', 'Away', (v_raw ->> 'AvgCA')::NUMERIC, 'closing', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_1x2 := v_batch_odds_1x2 + 1; END IF;
            IF NULLIF(v_raw ->> 'B365>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'B365>2.5')::NUMERIC, 'opening', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'B365<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'B365<2.5')::NUMERIC, 'opening', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'P>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'P>2.5')::NUMERIC, 'opening', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'P<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'P<2.5')::NUMERIC, 'opening', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'Max>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'Max>2.5')::NUMERIC, 'opening', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'Max<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'Max<2.5')::NUMERIC, 'opening', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'Avg>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'Avg>2.5')::NUMERIC, 'opening', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'Avg<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'Avg<2.5')::NUMERIC, 'opening', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'BbMx>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'BbMx>2.5')::NUMERIC, 'opening', 'Betbrain Max') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'BbMx<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'BbMx<2.5')::NUMERIC, 'opening', 'Betbrain Max') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'BbAv>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'BbAv>2.5')::NUMERIC, 'opening', 'Betbrain Avg') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'BbAv<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'BbAv<2.5')::NUMERIC, 'opening', 'Betbrain Avg') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'B365C>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'B365C>2.5')::NUMERIC, 'closing', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'B365C<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'B365C<2.5')::NUMERIC, 'closing', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'PC>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'PC>2.5')::NUMERIC, 'closing', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'PC<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'PC<2.5')::NUMERIC, 'closing', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxC>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'MaxC>2.5')::NUMERIC, 'closing', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxC<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'MaxC<2.5')::NUMERIC, 'closing', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgC>2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Over', (v_raw ->> 'AvgC>2.5')::NUMERIC, 'closing', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgC<2.5', '') IS NOT NULL THEN INSERT INTO match_goals_odds (match_id, line, selection, odds, odds_type, provider_name) VALUES (v_match_id, 2.5, 'Under', (v_raw ->> 'AvgC<2.5')::NUMERIC, 'closing', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_ou := v_batch_odds_ou + 1; END IF;
            IF NULLIF(v_raw ->> 'B365AHH', '') IS NOT NULL AND NULLIF(v_raw ->> 'B365AH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'B365AH')::NUMERIC, 'Home', (v_raw ->> 'B365AHH')::NUMERIC, 'opening', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'B365AHA', '') IS NOT NULL AND NULLIF(v_raw ->> 'B365AH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'B365AH')::NUMERIC, 'Away', (v_raw ->> 'B365AHA')::NUMERIC, 'opening', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'PAHH', '') IS NOT NULL AND NULLIF(v_raw ->> 'AHh', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'AHh')::NUMERIC, 'Home', (v_raw ->> 'PAHH')::NUMERIC, 'opening', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'PAHA', '') IS NOT NULL AND NULLIF(v_raw ->> 'AHh', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'AHh')::NUMERIC, 'Away', (v_raw ->> 'PAHA')::NUMERIC, 'opening', 'Pinnacle') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxAHH', '') IS NOT NULL AND NULLIF(v_raw ->> 'MaxAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'MaxAH')::NUMERIC, 'Home', (v_raw ->> 'MaxAHH')::NUMERIC, 'opening', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxAHA', '') IS NOT NULL AND NULLIF(v_raw ->> 'MaxAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'MaxAH')::NUMERIC, 'Away', (v_raw ->> 'MaxAHA')::NUMERIC, 'opening', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgAHH', '') IS NOT NULL AND NULLIF(v_raw ->> 'AvgAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'AvgAH')::NUMERIC, 'Home', (v_raw ->> 'AvgAHH')::NUMERIC, 'opening', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgAHA', '') IS NOT NULL AND NULLIF(v_raw ->> 'AvgAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'AvgAH')::NUMERIC, 'Away', (v_raw ->> 'AvgAHA')::NUMERIC, 'opening', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'BbMxAHH', '') IS NOT NULL AND NULLIF(v_raw ->> 'BbMxAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'BbMxAH')::NUMERIC, 'Home', (v_raw ->> 'BbMxAHH')::NUMERIC, 'opening', 'Betbrain Max') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'BbMxAHA', '') IS NOT NULL AND NULLIF(v_raw ->> 'BbMxAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'BbMxAH')::NUMERIC, 'Away', (v_raw ->> 'BbMxAHA')::NUMERIC, 'opening', 'Betbrain Max') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'BbAvAHH', '') IS NOT NULL AND NULLIF(v_raw ->> 'BbAvAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'BbAvAH')::NUMERIC, 'Home', (v_raw ->> 'BbAvAHH')::NUMERIC, 'opening', 'Betbrain Avg') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'BbAvAHA', '') IS NOT NULL AND NULLIF(v_raw ->> 'BbAvAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'BbAvAH')::NUMERIC, 'Away', (v_raw ->> 'BbAvAHA')::NUMERIC, 'opening', 'Betbrain Avg') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'B365CAHH', '') IS NOT NULL AND NULLIF(v_raw ->> 'B365AH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'B365AH')::NUMERIC, 'Home', (v_raw ->> 'B365CAHH')::NUMERIC, 'closing', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'B365CAHA', '') IS NOT NULL AND NULLIF(v_raw ->> 'B365AH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'B365AH')::NUMERIC, 'Away', (v_raw ->> 'B365CAHA')::NUMERIC, 'closing', 'Bet365') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxCAHH', '') IS NOT NULL AND NULLIF(v_raw ->> 'MaxAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'MaxAH')::NUMERIC, 'Home', (v_raw ->> 'MaxCAHH')::NUMERIC, 'closing', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'MaxCAHA', '') IS NOT NULL AND NULLIF(v_raw ->> 'MaxAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'MaxAH')::NUMERIC, 'Away', (v_raw ->> 'MaxCAHA')::NUMERIC, 'closing', 'Max') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgCAHH', '') IS NOT NULL AND NULLIF(v_raw ->> 'AvgAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'AvgAH')::NUMERIC, 'Home', (v_raw ->> 'AvgCAHH')::NUMERIC, 'closing', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            IF NULLIF(v_raw ->> 'AvgCAHA', '') IS NOT NULL AND NULLIF(v_raw ->> 'AvgAH', '') IS NOT NULL THEN INSERT INTO match_ah_odds (match_id, handicap, selection, odds, odds_type, provider_name) VALUES (v_match_id, (v_raw ->> 'AvgAH')::NUMERIC, 'Away', (v_raw ->> 'AvgCAHA')::NUMERIC, 'closing', 'Avg') ON CONFLICT DO NOTHING; v_batch_odds_ah := v_batch_odds_ah + 1; END IF;
            UPDATE staging_football_data_uk_raw SET is_processed = true, processed_at = NOW(), canonical_match_id = v_match_id WHERE id = v_row.id;
            v_batch_processed := v_batch_processed + 1;
        EXCEPTION WHEN OTHERS THEN
            UPDATE staging_football_data_uk_raw SET is_processed = true, processed_at = NOW() WHERE id = v_row.id;
            v_batch_errors := v_batch_errors + 1;
        END;
    END LOOP;
    RETURN jsonb_build_object('processed', v_batch_processed, 'matches', v_batch_matches, 'stats', v_batch_stats, 'odds_1x2', v_batch_odds_1x2, 'odds_ou', v_batch_odds_ou, 'odds_ah', v_batch_odds_ah, 'skipped', v_batch_skipped, 'errors', v_batch_errors, 'elapsed_sec', ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)), 1), 'time_limited', CASE WHEN v_elapsed_sec > 55 THEN true ELSE false END);
END;
$$;`;

async function main() {
  console.log('\n=== NEXT59 v6 - TUM VERI EKSIKSIZ ===');
  console.log('Kolon: Time, odds_metadata, SB, Bb1X2, Pinnacle Closing + TUM Closing odds');
  console.log('Provider: 53 (22+12 1X2, 6+4 O/U, 6+3 AH)\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 1. Eksik kolonlari ekle
  console.log('1. Kolonlar ekleniyor...');
  await supabase.rpc('exec_sql', { p_sql: `ALTER TABLE matches ADD COLUMN IF NOT EXISTS odds_metadata JSONB` });
  await supabase.rpc('exec_sql', { p_sql: `ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_time TIME` });
  console.log('   OK');

  // 2. v6 yukle
  console.log('2. v6 fonksiyonu yukleniyor (145 INSERT, 53 provider)...');
  const { error: ve } = await supabase.rpc('exec_sql', { p_sql: V6_SQL });
  if (ve) { console.log('   HATA:', ve.message); process.exit(1); }
  console.log('   OK');

  // 3. Tum staging satirlarini geri al (geriye donuk doldurma)
  console.log('3. Staging geri aliniyor (is_processed = false)...');
  const { error: ue } = await supabase.rpc('exec_sql', {
    p_sql: `UPDATE staging_football_data_uk_raw SET is_processed = false, processed_at = NULL, canonical_match_id = NULL`
  });
  if (ue) { console.log('   HATA:', ue.message); process.exit(1); }

  const { count: total } = await supabase.from('staging_football_data_uk_raw').select('*', { count: 'exact', head: true });
  console.log(`   OK - ${total} satir islenecek\n`);

  // 4. Batch isleme
  console.log(`4. Batch: ${BATCH_SIZE} | Dinlenme: ${REST_TIME/1000}sn\n`);
  let tp = 0, cn = 0, t0 = Date.now();

  while (true) {
    cn++;
    const { count: bfr, error: ce } = await supabase.from('staging_football_data_uk_raw').select('*', { count: 'exact', head: true }).eq('is_processed', false);
    if (ce) { console.error('Hata:', ce.message); break; }
    if (!bfr || bfr === 0) { console.log('\nISLENECEK VERI KALMADI!'); break; }

    const { data: r, error } = await supabase.rpc('transform_batch_fn', { p_batch_size: BATCH_SIZE });
    if (error) { console.error(`[Batch #${cn}] HATA: ${error.message}`); break; }

    const { count: aft } = await supabase.from('staging_football_data_uk_raw').select('*', { count: 'exact', head: true }).eq('is_processed', false);
    const processed = (bfr || 0) - (aft || 0); tp += processed;
    const elapsed = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(` #${cn}: +${processed} | Kalan: ${aft} | Toplam: ${tp} | ${elapsed}dk`);
    if (!aft || aft === 0) break;
    await new Promise(res => setTimeout(res, REST_TIME));
  }

  console.log(`\n=== TAMAMLANDI | ${tp} SATIR | ${((Date.now()-t0)/60000).toFixed(1)} dk ===`);
  process.exit(0);
}

main().catch(err => { console.error('KRITIK HATA:', err); process.exit(1); });
