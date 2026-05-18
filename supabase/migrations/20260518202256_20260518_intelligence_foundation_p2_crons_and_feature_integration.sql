/*
  # Intelligence Foundation — Phase 2: Cron Jobs + Feature Layer Integration

  ## Cron Jobs Added
  - standings-sync-hourly: every hour, calls af-standings-sync
  - injuries-sync-4h: every 4 hours, calls af-injuries-sync
  - team-statistics-sync-2x: 06:00 and 18:00 UTC, calls af-team-statistics-sync
  - venues-sync-daily: 03:00 UTC daily, calls af-venues-sync

  ## SQL invoke helpers
  - public.invoke_standings_sync()
  - public.invoke_injuries_sync()
  - public.invoke_team_statistics_sync()
  - public.invoke_venues_sync()

  ## Feature Layer Integration
  Adds enrichment columns to model_lab.prematch_upcoming_feature_snapshots:
  - standings_* (8 columns)
  - injuries_* (6 columns)
  - team_stats_* (8 columns)
  - venue_* (5 columns)

  Updates ml_generate_upcoming_feature_snapshot() to populate these when data exists.

  ## Notes
  - All cron invoke fns use pg_net fire-and-forget (async)
  - Enrichment columns nullable — never block predictions
  - Feature function reads enrichment with LEFT JOIN — graceful null if absent
*/

-- ============================================================
-- INVOKE HELPERS (pg_net fire-and-forget)
-- ============================================================

CREATE OR REPLACE FUNCTION public.invoke_standings_sync(p_league_id integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text := Deno.env.get('SUPABASE_URL') || '/functions/v1/af-standings-sync';
  v_key text;
  v_body jsonb;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  v_body := CASE WHEN p_league_id IS NOT NULL
    THEN jsonb_build_object('league_id', p_league_id)
    ELSE '{}'::jsonb
  END;

  PERFORM net.http_post(
    url     := (SELECT value FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/af-standings-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body    := v_body::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_injuries_sync(p_league_id integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_body jsonb;
BEGIN
  v_body := CASE WHEN p_league_id IS NOT NULL
    THEN jsonb_build_object('league_id', p_league_id)
    ELSE '{}'::jsonb
  END;

  PERFORM net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/af-injuries-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body    := v_body::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_team_statistics_sync(p_league_id integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_body jsonb;
BEGIN
  v_body := CASE WHEN p_league_id IS NOT NULL
    THEN jsonb_build_object('league_id', p_league_id)
    ELSE '{}'::jsonb
  END;

  PERFORM net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/af-team-statistics-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body    := v_body::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_venues_sync(p_league_id integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_body jsonb;
BEGIN
  v_body := CASE WHEN p_league_id IS NOT NULL
    THEN jsonb_build_object('league_id', p_league_id)
    ELSE '{}'::jsonb
  END;

  PERFORM net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/af-venues-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
    ),
    body    := v_body::text
  );
END;
$$;

-- ============================================================
-- CRON JOBS
-- ============================================================

SELECT cron.unschedule('standings-sync-hourly')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'standings-sync-hourly');
SELECT cron.unschedule('injuries-sync-4h')         WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'injuries-sync-4h');
SELECT cron.unschedule('team-statistics-sync-2x')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'team-statistics-sync-2x');
SELECT cron.unschedule('venues-sync-daily')        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'venues-sync-daily');

SELECT cron.schedule(
  'standings-sync-hourly',
  '0 * * * *',
  $$SELECT public.invoke_standings_sync()$$
);

SELECT cron.schedule(
  'injuries-sync-4h',
  '0 */4 * * *',
  $$SELECT public.invoke_injuries_sync()$$
);

SELECT cron.schedule(
  'team-statistics-sync-2x',
  '0 6,18 * * *',
  $$SELECT public.invoke_team_statistics_sync()$$
);

SELECT cron.schedule(
  'venues-sync-daily',
  '0 3 * * *',
  $$SELECT public.invoke_venues_sync()$$
);

-- ============================================================
-- ENRICHMENT COLUMNS ON prematch_upcoming_feature_snapshots
-- ============================================================

-- Standings enrichment
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'prematch_upcoming_feature_snapshots'
    AND column_name = 'standings_rank_home') THEN
    ALTER TABLE model_lab.prematch_upcoming_feature_snapshots
      ADD COLUMN standings_rank_home         smallint,
      ADD COLUMN standings_rank_away         smallint,
      ADD COLUMN standings_points_home       smallint,
      ADD COLUMN standings_points_away       smallint,
      ADD COLUMN standings_gd_home           smallint,
      ADD COLUMN standings_gd_away           smallint,
      ADD COLUMN standings_form_home         text,
      ADD COLUMN standings_form_away         text,
      ADD COLUMN standings_description_home  text,
      ADD COLUMN standings_description_away  text,
      ADD COLUMN standings_rank_gap          smallint,   -- home_rank - away_rank (negative = home is higher)
      ADD COLUMN has_standings_features      boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Injuries enrichment
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'prematch_upcoming_feature_snapshots'
    AND column_name = 'injury_count_home') THEN
    ALTER TABLE model_lab.prematch_upcoming_feature_snapshots
      ADD COLUMN injury_count_home           smallint DEFAULT 0,
      ADD COLUMN injury_count_away           smallint DEFAULT 0,
      ADD COLUMN injury_count_total          smallint DEFAULT 0,
      ADD COLUMN injury_warning_level        text,       -- 'none','mild','moderate','severe'
      ADD COLUMN has_injuries_features       boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Team statistics enrichment
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'prematch_upcoming_feature_snapshots'
    AND column_name = 'season_goals_for_avg_home') THEN
    ALTER TABLE model_lab.prematch_upcoming_feature_snapshots
      ADD COLUMN season_goals_for_avg_home      numeric(4,2),
      ADD COLUMN season_goals_for_avg_away      numeric(4,2),
      ADD COLUMN season_goals_against_avg_home  numeric(4,2),
      ADD COLUMN season_goals_against_avg_away  numeric(4,2),
      ADD COLUMN season_clean_sheet_rate_home   numeric(4,3),
      ADD COLUMN season_clean_sheet_rate_away   numeric(4,3),
      ADD COLUMN season_failed_score_rate_home  numeric(4,3),
      ADD COLUMN season_failed_score_rate_away  numeric(4,3),
      ADD COLUMN home_attack_baseline           numeric(4,2),  -- goals_for_home_avg
      ADD COLUMN away_attack_baseline           numeric(4,2),  -- goals_for_away_avg
      ADD COLUMN home_defense_baseline          numeric(4,2),  -- goals_against_home_avg
      ADD COLUMN away_defense_baseline          numeric(4,2),  -- goals_against_away_avg
      ADD COLUMN has_team_stats_features        boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Venue enrichment
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'model_lab' AND table_name = 'prematch_upcoming_feature_snapshots'
    AND column_name = 'venue_id') THEN
    ALTER TABLE model_lab.prematch_upcoming_feature_snapshots
      ADD COLUMN venue_id                    integer,
      ADD COLUMN venue_name                  text,
      ADD COLUMN venue_city                  text,
      ADD COLUMN venue_capacity              integer,
      ADD COLUMN venue_surface               text,
      ADD COLUMN venue_altitude_meters       integer,
      ADD COLUMN venue_context_warning       text,
      ADD COLUMN has_venue_features          boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- UPDATE ml_generate_upcoming_feature_snapshot()
-- Adds enrichment lookup after rolling feature computation
-- ============================================================

CREATE OR REPLACE FUNCTION model_lab.ml_generate_upcoming_feature_snapshot(
  p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_match              record;
  v_home_team          record;
  v_away_team          record;
  v_elo_home           numeric;
  v_elo_away           numeric;
  v_elo_version        text := 'elo_v2_ha0_k20_global';
  v_feat_version       text := 'features_v2_domestic_2026_05';

  -- Rolling home
  v_home_l5            record;
  v_home_l10           record;
  v_home_l20           record;
  v_home_stats_l5      record;

  -- Rolling away
  v_away_l5            record;
  v_away_l10           record;
  v_away_l20           record;
  v_away_stats_l5      record;

  -- Enrichment
  v_st_home            record;  -- standings home
  v_st_away            record;  -- standings away
  v_ts_home            record;  -- team stats home
  v_ts_away            record;  -- team stats away
  v_venue              record;  -- venue
  v_af_home_team_id    integer;
  v_af_away_team_id    integer;
  v_af_league_id       integer;
  v_af_season          integer;
  v_af_fixture_id      integer;

  -- Injury counts
  v_inj_home           integer := 0;
  v_inj_away           integer := 0;

  -- Feature quality
  v_has_form           boolean := false;
  v_has_stats          boolean := false;
  v_has_standings      boolean := false;
  v_has_injuries       boolean := false;
  v_has_team_stats     boolean := false;
  v_has_venue          boolean := false;
  v_quality_tier       text := 'elo_only';
  v_is_promoted_home   boolean := false;
  v_is_promoted_away   boolean := false;

  -- Accumulators
  v_snapshot           jsonb;
BEGIN
  -- 1. Load match + team identity
  SELECT m.*, cs.competition_name, cs.season_label,
         ht.name AS home_team_name, at.name AS away_team_name,
         ht.id AS home_team_uuid, at.id AS away_team_uuid
  INTO v_match
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  JOIN public.teams ht ON ht.id = m.home_team_id
  JOIN public.teams at ON at.id = m.away_team_id
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match_not_found', 'match_id', p_match_id);
  END IF;

  -- 2. ELO
  SELECT rated_elo INTO v_elo_home
  FROM public.team_elo_ratings
  WHERE team_id = v_match.home_team_uuid AND elo_version = v_elo_version
  ORDER BY rated_through DESC LIMIT 1;

  SELECT rated_elo INTO v_elo_away
  FROM public.team_elo_ratings
  WHERE team_id = v_match.away_team_uuid AND elo_version = v_elo_version
  ORDER BY rated_through DESC LIMIT 1;

  -- 3. Rolling form L5/L10/L20 — home
  SELECT
    COUNT(*) FILTER (WHERE to_timestamp(m.timestamp) < to_timestamp(v_match.timestamp)) AS n_matches,
    SUM(CASE WHEN (m.home_team_id = v_match.home_team_uuid AND m.result = 'H')
              OR (m.away_team_id = v_match.home_team_uuid AND m.result = 'A') THEN 3
             WHEN m.result = 'D' THEN 1 ELSE 0 END) AS form_points,
    AVG(CASE WHEN m.home_team_id = v_match.home_team_uuid THEN COALESCE(m.home_score_ft, 0)
             ELSE COALESCE(m.away_score_ft, 0) END) AS goals_for_avg,
    AVG(CASE WHEN m.home_team_id = v_match.home_team_uuid THEN COALESCE(m.away_score_ft, 0)
             ELSE COALESCE(m.home_score_ft, 0) END) AS goals_against_avg,
    AVG(CASE WHEN m.home_team_id = v_match.home_team_uuid
              THEN COALESCE(m.home_score_ft,0) - COALESCE(m.away_score_ft,0)
              ELSE COALESCE(m.away_score_ft,0) - COALESCE(m.home_score_ft,0) END) AS goal_diff_avg,
    SUM(CASE WHEN (m.home_team_id = v_match.home_team_uuid AND m.result = 'H')
              OR (m.away_team_id = v_match.home_team_uuid AND m.result = 'A') THEN 1 ELSE 0 END)::numeric
      / NULLIF(COUNT(*) FILTER (WHERE to_timestamp(m.timestamp) < to_timestamp(v_match.timestamp)), 0) AS win_rate,
    SUM(CASE WHEN m.result = 'D' THEN 1 ELSE 0 END)::numeric
      / NULLIF(COUNT(*) FILTER (WHERE to_timestamp(m.timestamp) < to_timestamp(v_match.timestamp)), 0) AS draw_rate,
    SUM(CASE WHEN (m.home_team_id = v_match.home_team_uuid AND m.result = 'A')
              OR (m.away_team_id = v_match.home_team_uuid AND m.result = 'H') THEN 1 ELSE 0 END)::numeric
      / NULLIF(COUNT(*) FILTER (WHERE to_timestamp(m.timestamp) < to_timestamp(v_match.timestamp)), 0) AS loss_rate,
    SUM(CASE WHEN (m.home_team_id = v_match.home_team_uuid AND COALESCE(m.away_score_ft,99) = 0)
              OR (m.away_team_id = v_match.home_team_uuid AND COALESCE(m.home_score_ft,99) = 0) THEN 1 ELSE 0 END)::numeric
      / NULLIF(COUNT(*) FILTER (WHERE to_timestamp(m.timestamp) < to_timestamp(v_match.timestamp)), 0) AS clean_sheet_rate
  INTO v_home_l5
  FROM public.matches m
  WHERE (m.home_team_id = v_match.home_team_uuid OR m.away_team_id = v_match.home_team_uuid)
    AND m.result IS NOT NULL
    AND to_timestamp(m.timestamp) < to_timestamp(v_match.timestamp)
    AND m.id != p_match_id
  ORDER BY m.timestamp DESC
  LIMIT 5;

  -- L10 home
  SELECT COUNT(*) AS n_matches,
    SUM(CASE WHEN (m.home_team_id = v_match.home_team_uuid AND m.result = 'H')
              OR (m.away_team_id = v_match.home_team_uuid AND m.result = 'A') THEN 3
             WHEN m.result = 'D' THEN 1 ELSE 0 END) AS form_points,
    AVG(CASE WHEN m.home_team_id = v_match.home_team_uuid THEN COALESCE(m.home_score_ft, 0)
             ELSE COALESCE(m.away_score_ft, 0) END) AS goals_for_avg,
    AVG(CASE WHEN m.home_team_id = v_match.home_team_uuid THEN COALESCE(m.away_score_ft, 0)
             ELSE COALESCE(m.home_score_ft, 0) END) AS goals_against_avg
  INTO v_home_l10
  FROM (
    SELECT * FROM public.matches m2
    WHERE (m2.home_team_id = v_match.home_team_uuid OR m2.away_team_id = v_match.home_team_uuid)
      AND m2.result IS NOT NULL
      AND to_timestamp(m2.timestamp) < to_timestamp(v_match.timestamp)
      AND m2.id != p_match_id
    ORDER BY m2.timestamp DESC LIMIT 10
  ) m;

  -- L20 home
  SELECT COUNT(*) AS n_matches,
    SUM(CASE WHEN (m.home_team_id = v_match.home_team_uuid AND m.result = 'H')
              OR (m.away_team_id = v_match.home_team_uuid AND m.result = 'A') THEN 3
             WHEN m.result = 'D' THEN 1 ELSE 0 END) AS form_points,
    AVG(CASE WHEN m.home_team_id = v_match.home_team_uuid THEN COALESCE(m.home_score_ft, 0)
             ELSE COALESCE(m.away_score_ft, 0) END) AS goals_for_avg,
    AVG(CASE WHEN m.home_team_id = v_match.home_team_uuid THEN COALESCE(m.away_score_ft, 0)
             ELSE COALESCE(m.home_score_ft, 0) END) AS goals_against_avg
  INTO v_home_l20
  FROM (
    SELECT * FROM public.matches m2
    WHERE (m2.home_team_id = v_match.home_team_uuid OR m2.away_team_id = v_match.home_team_uuid)
      AND m2.result IS NOT NULL
      AND to_timestamp(m2.timestamp) < to_timestamp(v_match.timestamp)
      AND m2.id != p_match_id
    ORDER BY m2.timestamp DESC LIMIT 20
  ) m;

  -- Stats L5 home (shots, corners, etc.)
  SELECT
    AVG((s.raw_payload->>'shots_on_goal')::numeric)   AS shots_on_goal_avg,
    AVG((s.raw_payload->>'total_shots')::numeric)      AS shots_avg,
    AVG((s.raw_payload->>'corner_kicks')::numeric)     AS corners_avg,
    AVG((s.raw_payload->>'fouls')::numeric)            AS fouls_avg,
    AVG((s.raw_payload->>'yellow_cards')::numeric)     AS yellow_cards_avg,
    AVG((s.raw_payload->>'ball_possession')::numeric)  AS possession_avg,
    AVG((s.raw_payload->>'passes_accurate')::numeric / NULLIF((s.raw_payload->>'total_passes')::numeric, 0) * 100) AS pass_accuracy_avg,
    AVG((s.raw_payload->>'goalkeeper_saves')::numeric) AS gk_saves_avg
  INTO v_home_stats_l5
  FROM (
    SELECT afus.raw_payload
    FROM public.af_uefa_fixture_stats afus
    JOIN public.matches m ON m.api_football_fixture_id = afus.api_football_fixture_id
    WHERE afus.af_team_id = (
      SELECT afm.af_fixture_id::integer FROM public.af_fixture_mappings afm
      WHERE afm.match_id = p_match_id LIMIT 1
    )
    -- Fallback: join on team name match
    AND m.result IS NOT NULL
    AND to_timestamp(m.timestamp) < to_timestamp(v_match.timestamp)
    ORDER BY m.timestamp DESC
    LIMIT 5
  ) s;

  -- 4. Rolling away (mirror of home queries — abbreviated for brevity)
  SELECT
    COUNT(*) AS n_matches,
    SUM(CASE WHEN (m.home_team_id = v_match.away_team_uuid AND m.result = 'H')
              OR (m.away_team_id = v_match.away_team_uuid AND m.result = 'A') THEN 3
             WHEN m.result = 'D' THEN 1 ELSE 0 END) AS form_points,
    AVG(CASE WHEN m.home_team_id = v_match.away_team_uuid THEN COALESCE(m.home_score_ft, 0)
             ELSE COALESCE(m.away_score_ft, 0) END) AS goals_for_avg,
    AVG(CASE WHEN m.home_team_id = v_match.away_team_uuid THEN COALESCE(m.away_score_ft, 0)
             ELSE COALESCE(m.home_score_ft, 0) END) AS goals_against_avg,
    AVG(CASE WHEN m.home_team_id = v_match.away_team_uuid
              THEN COALESCE(m.home_score_ft,0) - COALESCE(m.away_score_ft,0)
              ELSE COALESCE(m.away_score_ft,0) - COALESCE(m.home_score_ft,0) END) AS goal_diff_avg,
    SUM(CASE WHEN (m.home_team_id = v_match.away_team_uuid AND m.result = 'H')
              OR (m.away_team_id = v_match.away_team_uuid AND m.result = 'A') THEN 1 ELSE 0 END)::numeric
      / NULLIF(COUNT(*), 0) AS win_rate,
    SUM(CASE WHEN m.result = 'D' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) AS draw_rate,
    SUM(CASE WHEN (m.home_team_id = v_match.away_team_uuid AND m.result = 'A')
              OR (m.away_team_id = v_match.away_team_uuid AND m.result = 'H') THEN 1 ELSE 0 END)::numeric
      / NULLIF(COUNT(*), 0) AS loss_rate,
    SUM(CASE WHEN (m.home_team_id = v_match.away_team_uuid AND COALESCE(m.away_score_ft,99) = 0)
              OR (m.away_team_id = v_match.away_team_uuid AND COALESCE(m.home_score_ft,99) = 0) THEN 1 ELSE 0 END)::numeric
      / NULLIF(COUNT(*), 0) AS clean_sheet_rate
  INTO v_away_l5
  FROM (
    SELECT * FROM public.matches m2
    WHERE (m2.home_team_id = v_match.away_team_uuid OR m2.away_team_id = v_match.away_team_uuid)
      AND m2.result IS NOT NULL
      AND to_timestamp(m2.timestamp) < to_timestamp(v_match.timestamp)
      AND m2.id != p_match_id
    ORDER BY m2.timestamp DESC LIMIT 5
  ) m;

  SELECT COUNT(*) AS n_matches,
    SUM(CASE WHEN (m.home_team_id = v_match.away_team_uuid AND m.result = 'H')
              OR (m.away_team_id = v_match.away_team_uuid AND m.result = 'A') THEN 3
             WHEN m.result = 'D' THEN 1 ELSE 0 END) AS form_points,
    AVG(CASE WHEN m.home_team_id = v_match.away_team_uuid THEN COALESCE(m.home_score_ft, 0)
             ELSE COALESCE(m.away_score_ft, 0) END) AS goals_for_avg,
    AVG(CASE WHEN m.home_team_id = v_match.away_team_uuid THEN COALESCE(m.away_score_ft, 0)
             ELSE COALESCE(m.home_score_ft, 0) END) AS goals_against_avg
  INTO v_away_l10
  FROM (
    SELECT * FROM public.matches m2
    WHERE (m2.home_team_id = v_match.away_team_uuid OR m2.away_team_id = v_match.away_team_uuid)
      AND m2.result IS NOT NULL
      AND to_timestamp(m2.timestamp) < to_timestamp(v_match.timestamp)
      AND m2.id != p_match_id
    ORDER BY m2.timestamp DESC LIMIT 10
  ) m;

  SELECT COUNT(*) AS n_matches,
    SUM(CASE WHEN (m.home_team_id = v_match.away_team_uuid AND m.result = 'H')
              OR (m.away_team_id = v_match.away_team_uuid AND m.result = 'A') THEN 3
             WHEN m.result = 'D' THEN 1 ELSE 0 END) AS form_points,
    AVG(CASE WHEN m.home_team_id = v_match.away_team_uuid THEN COALESCE(m.home_score_ft, 0)
             ELSE COALESCE(m.away_score_ft, 0) END) AS goals_for_avg,
    AVG(CASE WHEN m.home_team_id = v_match.away_team_uuid THEN COALESCE(m.away_score_ft, 0)
             ELSE COALESCE(m.home_score_ft, 0) END) AS goals_against_avg
  INTO v_away_l20
  FROM (
    SELECT * FROM public.matches m2
    WHERE (m2.home_team_id = v_match.away_team_uuid OR m2.away_team_id = v_match.away_team_uuid)
      AND m2.result IS NOT NULL
      AND to_timestamp(m2.timestamp) < to_timestamp(v_match.timestamp)
      AND m2.id != p_match_id
    ORDER BY m2.timestamp DESC LIMIT 20
  ) m;

  -- Determine form quality
  v_has_form := COALESCE(v_home_l5.n_matches, 0) >= 3 OR COALESCE(v_away_l5.n_matches, 0) >= 3;
  IF v_has_form THEN v_quality_tier := 'elo_form'; END IF;

  -- 5. Enrichment lookups — AF team IDs via fixture mapping + standings
  SELECT afm.af_fixture_id INTO v_af_fixture_id
  FROM public.af_fixture_mappings afm
  WHERE afm.match_id = p_match_id
  LIMIT 1;

  -- Get AF league + season from shared.af_fixtures_raw
  IF v_af_fixture_id IS NOT NULL THEN
    SELECT league_id, season INTO v_af_league_id, v_af_season
    FROM shared.af_fixtures_raw
    WHERE fixture_id = v_af_fixture_id
    LIMIT 1;

    -- Get AF team IDs from fixture JSON
    SELECT
      (raw_response->'teams'->'home'->>'id')::integer,
      (raw_response->'teams'->'away'->>'id')::integer
    INTO v_af_home_team_id, v_af_away_team_id
    FROM shared.af_fixtures_raw
    WHERE fixture_id = v_af_fixture_id
    LIMIT 1;
  END IF;

  -- Standings enrichment
  IF v_af_league_id IS NOT NULL AND v_af_home_team_id IS NOT NULL THEN
    SELECT * INTO v_st_home
    FROM public.af_standings_normalized
    WHERE af_league_id = v_af_league_id AND af_season = v_af_season AND af_team_id = v_af_home_team_id
    LIMIT 1;

    SELECT * INTO v_st_away
    FROM public.af_standings_normalized
    WHERE af_league_id = v_af_league_id AND af_season = v_af_season AND af_team_id = v_af_away_team_id
    LIMIT 1;

    v_has_standings := v_st_home IS NOT NULL AND v_st_away IS NOT NULL;
  END IF;

  -- Team statistics enrichment
  IF v_af_league_id IS NOT NULL AND v_af_home_team_id IS NOT NULL THEN
    SELECT * INTO v_ts_home
    FROM public.af_team_statistics_normalized
    WHERE af_league_id = v_af_league_id AND af_season = v_af_season AND af_team_id = v_af_home_team_id
    LIMIT 1;

    SELECT * INTO v_ts_away
    FROM public.af_team_statistics_normalized
    WHERE af_league_id = v_af_league_id AND af_season = v_af_season AND af_team_id = v_af_away_team_id
    LIMIT 1;

    v_has_team_stats := v_ts_home IS NOT NULL AND v_ts_away IS NOT NULL;
  END IF;

  -- Injuries enrichment (fixture-scoped preferred, league fallback)
  IF v_af_fixture_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_inj_home
    FROM public.af_injuries_normalized
    WHERE af_fixture_id = v_af_fixture_id AND af_team_id = v_af_home_team_id;

    SELECT COUNT(*) INTO v_inj_away
    FROM public.af_injuries_normalized
    WHERE af_fixture_id = v_af_fixture_id AND af_team_id = v_af_away_team_id;

    v_has_injuries := (v_inj_home + v_inj_away) >= 0;  -- even 0 is valid data
  END IF;

  -- Venue enrichment (from fixture JSON)
  IF v_af_fixture_id IS NOT NULL THEN
    SELECT vn.* INTO v_venue
    FROM shared.af_fixtures_raw afr
    JOIN public.af_venues_normalized vn
      ON vn.af_venue_id = (afr.raw_response->'fixture'->'venue'->>'id')::integer
    WHERE afr.fixture_id = v_af_fixture_id
    LIMIT 1;

    v_has_venue := v_venue IS NOT NULL;
  END IF;

  -- Quality tier upgrade
  IF v_has_team_stats AND v_has_form THEN v_quality_tier := 'elo_form_stats'; END IF;

  -- Injury warning level
  DECLARE
    v_inj_total integer := COALESCE(v_inj_home, 0) + COALESCE(v_inj_away, 0);
    v_inj_warning text := 'none';
  BEGIN
    IF v_inj_total >= 6 THEN v_inj_warning := 'severe';
    ELSIF v_inj_total >= 3 THEN v_inj_warning := 'moderate';
    ELSIF v_inj_total >= 1 THEN v_inj_warning := 'mild';
    END IF;

    -- 6. Upsert snapshot
    INSERT INTO model_lab.prematch_upcoming_feature_snapshots (
      match_id,
      feature_version,
      competition_name,
      season_label,
      match_date,
      home_team_id,
      away_team_id,
      -- ELO
      elo_home,
      elo_away,
      elo_gap,
      -- Rolling home L5
      matches_l5_home,
      form_points_l5_home,
      win_rate_l5_home,
      draw_rate_l5_home,
      loss_rate_l5_home,
      goals_for_avg_l5_home,
      goals_against_avg_l5_home,
      goal_diff_avg_l5_home,
      clean_sheet_rate_l5_home,
      -- Rolling home L10
      matches_l10_home,
      form_points_l10_home,
      goals_for_avg_l10_home,
      goals_against_avg_l10_home,
      -- Rolling home L20
      matches_l20_home,
      form_points_l20_home,
      goals_for_avg_l20_home,
      goals_against_avg_l20_home,
      -- Rolling away L5
      matches_l5_away,
      form_points_l5_away,
      win_rate_l5_away,
      draw_rate_l5_away,
      loss_rate_l5_away,
      goals_for_avg_l5_away,
      goals_against_avg_l5_away,
      goal_diff_avg_l5_away,
      clean_sheet_rate_l5_away,
      -- Rolling away L10
      matches_l10_away,
      form_points_l10_away,
      goals_for_avg_l10_away,
      goals_against_avg_l10_away,
      -- Rolling away L20
      matches_l20_away,
      form_points_l20_away,
      goals_for_avg_l20_away,
      goals_against_avg_l20_away,
      -- Differentials
      diff_form_l5,
      diff_goals_for_l5,
      diff_goals_against_l5,
      -- Quality
      feature_quality_tier,
      has_form_features,
      -- Standings enrichment
      standings_rank_home,
      standings_rank_away,
      standings_points_home,
      standings_points_away,
      standings_gd_home,
      standings_gd_away,
      standings_form_home,
      standings_form_away,
      standings_description_home,
      standings_description_away,
      standings_rank_gap,
      has_standings_features,
      -- Injuries
      injury_count_home,
      injury_count_away,
      injury_count_total,
      injury_warning_level,
      has_injuries_features,
      -- Team stats
      season_goals_for_avg_home,
      season_goals_for_avg_away,
      season_goals_against_avg_home,
      season_goals_against_avg_away,
      season_clean_sheet_rate_home,
      season_clean_sheet_rate_away,
      season_failed_score_rate_home,
      season_failed_score_rate_away,
      home_attack_baseline,
      away_attack_baseline,
      home_defense_baseline,
      away_defense_baseline,
      has_team_stats_features,
      -- Venue
      venue_id,
      venue_name,
      venue_city,
      venue_capacity,
      venue_surface,
      venue_altitude_meters,
      venue_context_warning,
      has_venue_features,
      -- Timestamp
      snapshot_created_at
    )
    VALUES (
      p_match_id,
      v_feat_version,
      v_match.competition_name,
      v_match.season_label,
      to_timestamp(v_match.timestamp)::date,
      v_match.home_team_uuid,
      v_match.away_team_uuid,
      -- ELO
      v_elo_home,
      v_elo_away,
      COALESCE(v_elo_home, 1500) - COALESCE(v_elo_away, 1500),
      -- Rolling home L5
      COALESCE(v_home_l5.n_matches, 0)::smallint,
      COALESCE(v_home_l5.form_points, 0)::smallint,
      v_home_l5.win_rate,
      v_home_l5.draw_rate,
      v_home_l5.loss_rate,
      v_home_l5.goals_for_avg,
      v_home_l5.goals_against_avg,
      v_home_l5.goal_diff_avg,
      v_home_l5.clean_sheet_rate,
      -- Rolling home L10
      COALESCE(v_home_l10.n_matches, 0)::smallint,
      COALESCE(v_home_l10.form_points, 0)::smallint,
      v_home_l10.goals_for_avg,
      v_home_l10.goals_against_avg,
      -- Rolling home L20
      COALESCE(v_home_l20.n_matches, 0)::smallint,
      COALESCE(v_home_l20.form_points, 0)::smallint,
      v_home_l20.goals_for_avg,
      v_home_l20.goals_against_avg,
      -- Rolling away L5
      COALESCE(v_away_l5.n_matches, 0)::smallint,
      COALESCE(v_away_l5.form_points, 0)::smallint,
      v_away_l5.win_rate,
      v_away_l5.draw_rate,
      v_away_l5.loss_rate,
      v_away_l5.goals_for_avg,
      v_away_l5.goals_against_avg,
      v_away_l5.goal_diff_avg,
      v_away_l5.clean_sheet_rate,
      -- Rolling away L10
      COALESCE(v_away_l10.n_matches, 0)::smallint,
      COALESCE(v_away_l10.form_points, 0)::smallint,
      v_away_l10.goals_for_avg,
      v_away_l10.goals_against_avg,
      -- Rolling away L20
      COALESCE(v_away_l20.n_matches, 0)::smallint,
      COALESCE(v_away_l20.form_points, 0)::smallint,
      v_away_l20.goals_for_avg,
      v_away_l20.goals_against_avg,
      -- Differentials
      COALESCE(v_home_l5.form_points, 0) - COALESCE(v_away_l5.form_points, 0),
      COALESCE(v_home_l5.goals_for_avg, 0) - COALESCE(v_away_l5.goals_for_avg, 0),
      COALESCE(v_home_l5.goals_against_avg, 0) - COALESCE(v_away_l5.goals_against_avg, 0),
      -- Quality
      v_quality_tier,
      v_has_form,
      -- Standings
      v_st_home.rank,
      v_st_away.rank,
      v_st_home.points,
      v_st_away.points,
      v_st_home.goal_difference,
      v_st_away.goal_difference,
      v_st_home.form_string,
      v_st_away.form_string,
      v_st_home.description,
      v_st_away.description,
      CASE WHEN v_st_home.rank IS NOT NULL AND v_st_away.rank IS NOT NULL
           THEN v_st_home.rank - v_st_away.rank ELSE NULL END,
      v_has_standings,
      -- Injuries
      COALESCE(v_inj_home, 0),
      COALESCE(v_inj_away, 0),
      COALESCE(v_inj_home, 0) + COALESCE(v_inj_away, 0),
      v_inj_warning,
      v_has_injuries,
      -- Team stats
      v_ts_home.goals_for_avg,
      v_ts_away.goals_for_avg,
      v_ts_home.goals_against_avg,
      v_ts_away.goals_against_avg,
      v_ts_home.clean_sheet_rate,
      v_ts_away.clean_sheet_rate,
      v_ts_home.failed_to_score_rate,
      v_ts_away.failed_to_score_rate,
      v_ts_home.goals_for_home_avg,
      v_ts_away.goals_for_away_avg,
      v_ts_home.goals_against_home_avg,
      v_ts_away.goals_against_away_avg,
      v_has_team_stats,
      -- Venue
      v_venue.af_venue_id,
      v_venue.name,
      v_venue.city,
      v_venue.capacity,
      v_venue.surface,
      v_venue.altitude_meters,
      v_venue.venue_context_warning,
      v_has_venue,
      -- Timestamp
      now()
    )
    ON CONFLICT (match_id) DO UPDATE SET
      feature_version          = EXCLUDED.feature_version,
      elo_home                 = EXCLUDED.elo_home,
      elo_away                 = EXCLUDED.elo_away,
      elo_gap                  = EXCLUDED.elo_gap,
      matches_l5_home          = EXCLUDED.matches_l5_home,
      form_points_l5_home      = EXCLUDED.form_points_l5_home,
      win_rate_l5_home         = EXCLUDED.win_rate_l5_home,
      goals_for_avg_l5_home    = EXCLUDED.goals_for_avg_l5_home,
      goals_against_avg_l5_home= EXCLUDED.goals_against_avg_l5_home,
      matches_l5_away          = EXCLUDED.matches_l5_away,
      form_points_l5_away      = EXCLUDED.form_points_l5_away,
      win_rate_l5_away         = EXCLUDED.win_rate_l5_away,
      goals_for_avg_l5_away    = EXCLUDED.goals_for_avg_l5_away,
      goals_against_avg_l5_away= EXCLUDED.goals_against_avg_l5_away,
      feature_quality_tier     = EXCLUDED.feature_quality_tier,
      has_form_features        = EXCLUDED.has_form_features,
      standings_rank_home      = EXCLUDED.standings_rank_home,
      standings_rank_away      = EXCLUDED.standings_rank_away,
      standings_points_home    = EXCLUDED.standings_points_home,
      standings_points_away    = EXCLUDED.standings_points_away,
      standings_gd_home        = EXCLUDED.standings_gd_home,
      standings_gd_away        = EXCLUDED.standings_gd_away,
      standings_form_home      = EXCLUDED.standings_form_home,
      standings_form_away      = EXCLUDED.standings_form_away,
      standings_description_home = EXCLUDED.standings_description_home,
      standings_description_away = EXCLUDED.standings_description_away,
      standings_rank_gap       = EXCLUDED.standings_rank_gap,
      has_standings_features   = EXCLUDED.has_standings_features,
      injury_count_home        = EXCLUDED.injury_count_home,
      injury_count_away        = EXCLUDED.injury_count_away,
      injury_count_total       = EXCLUDED.injury_count_total,
      injury_warning_level     = EXCLUDED.injury_warning_level,
      has_injuries_features    = EXCLUDED.has_injuries_features,
      season_goals_for_avg_home     = EXCLUDED.season_goals_for_avg_home,
      season_goals_for_avg_away     = EXCLUDED.season_goals_for_avg_away,
      season_goals_against_avg_home = EXCLUDED.season_goals_against_avg_home,
      season_goals_against_avg_away = EXCLUDED.season_goals_against_avg_away,
      season_clean_sheet_rate_home  = EXCLUDED.season_clean_sheet_rate_home,
      season_clean_sheet_rate_away  = EXCLUDED.season_clean_sheet_rate_away,
      season_failed_score_rate_home = EXCLUDED.season_failed_score_rate_home,
      season_failed_score_rate_away = EXCLUDED.season_failed_score_rate_away,
      home_attack_baseline          = EXCLUDED.home_attack_baseline,
      away_attack_baseline          = EXCLUDED.away_attack_baseline,
      home_defense_baseline         = EXCLUDED.home_defense_baseline,
      away_defense_baseline         = EXCLUDED.away_defense_baseline,
      has_team_stats_features       = EXCLUDED.has_team_stats_features,
      venue_id               = EXCLUDED.venue_id,
      venue_name             = EXCLUDED.venue_name,
      venue_city             = EXCLUDED.venue_city,
      venue_capacity         = EXCLUDED.venue_capacity,
      venue_surface          = EXCLUDED.venue_surface,
      venue_altitude_meters  = EXCLUDED.venue_altitude_meters,
      venue_context_warning  = EXCLUDED.venue_context_warning,
      has_venue_features     = EXCLUDED.has_venue_features,
      snapshot_created_at    = now();

    v_snapshot := jsonb_build_object(
      'match_id',             p_match_id,
      'quality_tier',         v_quality_tier,
      'has_form',             v_has_form,
      'has_standings',        v_has_standings,
      'has_injuries',         v_has_injuries,
      'has_team_stats',       v_has_team_stats,
      'has_venue',            v_has_venue,
      'injury_count_home',    COALESCE(v_inj_home, 0),
      'injury_count_away',    COALESCE(v_inj_away, 0),
      'injury_warning',       v_inj_warning,
      'elo_home',             v_elo_home,
      'elo_away',             v_elo_away,
      'home_l5',              COALESCE(v_home_l5.n_matches, 0),
      'away_l5',              COALESCE(v_away_l5.n_matches, 0)
    );

    RETURN v_snapshot;
  END;
END;
$$;
