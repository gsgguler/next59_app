/*
  # WC2026 Dedicated Calibration Engine — v1

  ## Purpose
  A completely separate World Cup 2026 calibration namespace, isolated from
  model_lab domestic league calibration. Computes tournament-specific strength
  and scenario indices using:
    - WC history backbone (wc_history schema)
    - National team recent form
    - Probable XI quality
    - Bench impact
    - Tournament pressure factors
    - Scenario risk indices

  ## New Tables

  ### wc2026_team_calibration_profiles
  Master calibration record per national team. Stores all 8 named indices plus
  supporting metadata, data coverage flags, and confidence levels.
  Indices:
    - wc2026_team_strength_index     (0–100)
    - wc2026_lineup_strength_index   (0–100, null until probable XI available)
    - wc2026_bench_impact_index      (-1.0 to +1.0)
    - wc2026_tournament_pressure_index (0–100)
    - wc2026_scenario_confidence     (0–1)
    - wc2026_late_goal_risk          (0–1)
    - wc2026_chaos_probability       (0–1)
    - wc2026_fatigue_risk            (0–1)

  ### wc2026_match_scenario_calibration
  Per-fixture scenario calibration. One row per fixture per calibration run.
  Records scenario signals per phase (0-15, 15-45, 45-75, 75+).

  ### wc2026_calibration_runs
  Audit log for each calibration engine execution.

  ## Functions

  ### wc2026_compute_team_calibration(p_api_team_id int)
  Computes all 8 indices for one national team.
  Data sources used (in priority order):
    1. wc_history.matches    — historical WC match results for backbone ELO
    2. wc2026_player_pool    — available player count / positions
    3. wc2026_probable_squads — squad completeness
    4. wc2026_player_performance_snapshots — avg player rating
    5. wc2026_team_pool      — squad/lineup status
  All indices are NULL-safe: missing data → low confidence, not error.

  ### wc2026_compute_all_team_calibrations()
  Batch wrapper — runs compute for every team in wc2026_team_pool.

  ### wc2026_compute_match_scenario(p_fixture_id int)
  Computes per-fixture scenario calibration for a wc2026_fixtures entry.

  ### wc2026_get_calibration_dashboard()
  Admin overview RPC — one row per team with all calibration indices + coverage.

  ## Security
  - RLS on all tables: admin SELECT, service_role INSERT/UPDATE, anon revoked
  - Functions: SECURITY DEFINER, search_path locked

  ## Isolation Guarantee
  - No writes to model_lab schema
  - No references to public.matches or domestic league tables
  - Does not replace or shadow model_lab.prematch_prediction_drafts
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_calibration_runs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_calibration_runs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type                text        NOT NULL DEFAULT 'full_team_batch',
    -- full_team_batch | single_team | match_scenario | manual
  triggered_by            text        NOT NULL DEFAULT 'manual',
    -- manual | cron | admin_ui | edge_function
  teams_processed         integer     NOT NULL DEFAULT 0,
  teams_updated           integer     NOT NULL DEFAULT 0,
  teams_skipped           integer     NOT NULL DEFAULT 0,
  matches_processed       integer     NOT NULL DEFAULT 0,
  run_status              text        NOT NULL DEFAULT 'running',
    -- running | completed | failed | partial
  error_summary           text,
  data_version            text        NOT NULL DEFAULT 'wc2026_v1',
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  notes                   text
);

ALTER TABLE public.wc2026_calibration_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select wc2026_calibration_runs"
  ON public.wc2026_calibration_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','super_admin')
  );

CREATE POLICY "Service insert wc2026_calibration_runs"
  ON public.wc2026_calibration_runs FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Service update wc2026_calibration_runs"
  ON public.wc2026_calibration_runs FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.wc2026_calibration_runs FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_team_calibration_profiles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_team_calibration_profiles (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_run_id              uuid        REFERENCES public.wc2026_calibration_runs(id) ON DELETE SET NULL,
  api_football_team_id            integer     NOT NULL,
  team_name                       text        NOT NULL,
  fifa_code                       text,
  confederation                   text,

  -- ── Layer 1: Historical backbone ──────────────────────────────────────────
  -- Derived from wc_history.matches using a simplified ELO pass
  historical_wc_matches           integer     NOT NULL DEFAULT 0,
  historical_elo_rating           numeric(7,2) NOT NULL DEFAULT 1500,
  -- Win rate across all WC appearances (NULL if no history)
  historical_win_rate             numeric(5,4),
  historical_goal_diff_avg        numeric(6,3),
  last_wc_year                    integer,

  -- ── Layer 2: Recent form ──────────────────────────────────────────────────
  -- Populated when recent national team match data is available
  recent_matches_available        integer     NOT NULL DEFAULT 0,
  recent_win_rate                 numeric(5,4),
  recent_goal_diff_avg            numeric(6,3),
  form_data_source                text,       -- 'wc_history' | 'api_football' | 'unavailable'

  -- ── Layer 3: Player availability ─────────────────────────────────────────
  player_pool_count               integer     NOT NULL DEFAULT 0,
  players_available               integer     NOT NULL DEFAULT 0,
  players_injured                 integer     NOT NULL DEFAULT 0,
  players_suspended               integer     NOT NULL DEFAULT 0,
  position_coverage_score         numeric(5,4) NOT NULL DEFAULT 0,
    -- 0 = no position data, 1 = all 4 positions covered

  -- ── Layer 4: Probable XI quality ─────────────────────────────────────────
  probable_xi_available           boolean     NOT NULL DEFAULT false,
  probable_xi_avg_rating          numeric(5,2),
  probable_xi_top_player_count    integer     NOT NULL DEFAULT 0,
    -- players with rating >= 7.5 in probable starting XI

  -- ── Layer 5: Bench impact ────────────────────────────────────────────────
  bench_available                 boolean     NOT NULL DEFAULT false,
  bench_avg_rating                numeric(5,2),
  bench_quality_vs_xi             numeric(5,4),
    -- 0 = bench much weaker, 1 = bench as strong as XI

  -- ── Named Indices ────────────────────────────────────────────────────────
  -- All 0-100 unless noted; NULL = not enough data
  wc2026_team_strength_index      numeric(6,2),
  wc2026_lineup_strength_index    numeric(6,2),
  wc2026_bench_impact_index       numeric(5,4),  -- -1.0 to +1.0
  wc2026_tournament_pressure_index numeric(6,2),
  wc2026_scenario_confidence      numeric(5,4),  -- 0–1
  wc2026_late_goal_risk           numeric(5,4),  -- 0–1
  wc2026_chaos_probability        numeric(5,4),  -- 0–1
  wc2026_fatigue_risk             numeric(5,4),  -- 0–1

  -- ── Tournament pressure sub-factors ─────────────────────────────────────
  tournament_experience_score     numeric(6,2),
    -- based on # of WC appearances in last 3 editions
  squad_avg_age                   numeric(4,1),
  squad_age_profile               text,
    -- young (<25 avg), balanced (25-28), experienced (>28)
  defensive_fragility_score       numeric(6,2),
    -- derived from goals conceded per WC match historically
  comeback_risk_score             numeric(6,2),
    -- derived from losing-position matches in history

  -- ── Confidence & Coverage ────────────────────────────────────────────────
  calibration_confidence          text        NOT NULL DEFAULT 'none',
    -- none | low | medium | high
  data_coverage_flags             jsonb       NOT NULL DEFAULT '{}',
    -- {has_history, has_recent_form, has_player_pool, has_probable_xi, has_bench}
  missing_data_warnings           jsonb       NOT NULL DEFAULT '[]',
    -- array of human-readable warning strings

  -- ── Audit ────────────────────────────────────────────────────────────────
  calibration_formula_version     text        NOT NULL DEFAULT 'wc2026_v1',
  calibration_notes               text,
  calibrated_at                   timestamptz NOT NULL DEFAULT now(),
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_calib_profiles_team_id
  ON public.wc2026_team_calibration_profiles (api_football_team_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_calib_profiles_confidence
  ON public.wc2026_team_calibration_profiles (calibration_confidence);

CREATE INDEX IF NOT EXISTS idx_wc2026_calib_profiles_calibrated_at
  ON public.wc2026_team_calibration_profiles (calibrated_at DESC);

-- One calibration profile per team per run (latest wins on conflict)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wc2026_calib_profile_team_run
  ON public.wc2026_team_calibration_profiles (api_football_team_id, calibration_run_id)
  WHERE calibration_run_id IS NOT NULL;

ALTER TABLE public.wc2026_team_calibration_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select wc2026_team_calibration_profiles"
  ON public.wc2026_team_calibration_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','super_admin')
  );

CREATE POLICY "Service insert wc2026_team_calibration_profiles"
  ON public.wc2026_team_calibration_profiles FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Service update wc2026_team_calibration_profiles"
  ON public.wc2026_team_calibration_profiles FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.wc2026_team_calibration_profiles FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- wc2026_match_scenario_calibration
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wc2026_match_scenario_calibration (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  calibration_run_id              uuid        REFERENCES public.wc2026_calibration_runs(id) ON DELETE SET NULL,
  api_football_fixture_id         integer     NOT NULL,
  home_team_name                  text        NOT NULL,
  away_team_name                  text        NOT NULL,
  stage_code                      text,
  group_label                     text,

  -- ── Match-level strength diff ────────────────────────────────────────────
  home_team_strength_index        numeric(6,2),
  away_team_strength_index        numeric(6,2),
  strength_diff                   numeric(6,2),
    -- positive = home advantage, negative = away stronger
  home_win_probability            numeric(5,4),
  draw_probability                numeric(5,4),
  away_win_probability            numeric(5,4),
  predicted_score_home            integer,
  predicted_score_away            integer,

  -- ── Phase scenario signals ────────────────────────────────────────────────
  -- Phase 1: first 15 minutes
  first_15_tempo                  text,       -- low | balanced | high
  first_15_pressure               numeric(5,4),

  -- Phase 2: first half (15-45)
  first_half_pressure_dominant    text,       -- home | away | balanced
  first_half_goal_probability     numeric(5,4),
  first_half_card_risk            text,       -- low | medium | high

  -- Phase 3: second half (45-75)
  second_half_fatigue_factor      numeric(5,4),
  second_half_momentum_shift_risk numeric(5,4),

  -- Phase 4: late game (75+)
  late_game_chaos_score           numeric(5,4),
  late_goal_probability           numeric(5,4),
  late_card_risk                  text,
  comeback_probability            numeric(5,4),
  set_piece_threat                text,       -- low | medium | high

  -- ── Match-level scenario indices (named) ─────────────────────────────────
  wc2026_scenario_confidence      numeric(5,4),
  wc2026_late_goal_risk           numeric(5,4),
  wc2026_chaos_probability        numeric(5,4),
  wc2026_fatigue_risk             numeric(5,4),

  -- ── Coverage & confidence ────────────────────────────────────────────────
  calibration_confidence          text        NOT NULL DEFAULT 'none',
  missing_data_warnings           jsonb       NOT NULL DEFAULT '[]',
  calibration_formula_version     text        NOT NULL DEFAULT 'wc2026_v1',
  calibrated_at                   timestamptz NOT NULL DEFAULT now(),
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wc2026_match_scenario_fixture_id
  ON public.wc2026_match_scenario_calibration (api_football_fixture_id);

CREATE INDEX IF NOT EXISTS idx_wc2026_match_scenario_calibrated_at
  ON public.wc2026_match_scenario_calibration (calibrated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wc2026_match_scenario_fixture_run
  ON public.wc2026_match_scenario_calibration (api_football_fixture_id, calibration_run_id)
  WHERE calibration_run_id IS NOT NULL;

ALTER TABLE public.wc2026_match_scenario_calibration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select wc2026_match_scenario_calibration"
  ON public.wc2026_match_scenario_calibration FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
    OR (auth.jwt()->'app_metadata'->>'role') IN ('admin','super_admin')
  );

CREATE POLICY "Service insert wc2026_match_scenario_calibration"
  ON public.wc2026_match_scenario_calibration FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Service update wc2026_match_scenario_calibration"
  ON public.wc2026_match_scenario_calibration FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.wc2026_match_scenario_calibration FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: wc2026_compute_team_calibration
-- Computes all 8 indices for one national team.
-- Uses only existing data — never errors on missing data.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_compute_team_calibration(
  p_api_team_id     integer,
  p_run_id          uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, wc_history
AS $$
DECLARE
  v_team_pool         public.wc2026_team_pool%ROWTYPE;
  v_result_id         uuid;

  -- Layer 1: WC history backbone
  v_wc_match_count    integer := 0;
  v_wc_wins           integer := 0;
  v_wc_draws          integer := 0;
  v_wc_losses         integer := 0;
  v_wc_gf             integer := 0;
  v_wc_ga             integer := 0;
  v_wc_goal_diff_avg  numeric := 0;
  v_wc_win_rate       numeric := 0;
  v_last_wc_year      integer;
  v_wc_appearances    integer := 0;

  -- Simplified ELO from WC history (K=32 for international)
  v_historical_elo    numeric := 1400; -- Start below 1500 (WC qualification not guaranteed)

  -- Layer 3: Player pool
  v_player_count      integer := 0;
  v_avail_count       integer := 0;
  v_inj_count         integer := 0;
  v_susp_count        integer := 0;
  v_gk_count          integer := 0;
  v_def_count         integer := 0;
  v_mid_count         integer := 0;
  v_att_count         integer := 0;
  v_pos_coverage      numeric := 0;

  -- Layer 4: Probable XI
  v_xi_available      boolean := false;
  v_xi_avg_rating     numeric;
  v_xi_top_count      integer := 0;

  -- Layer 5: Bench
  v_bench_available   boolean := false;
  v_bench_avg_rating  numeric;
  v_bench_vs_xi       numeric;

  -- Indices
  v_team_strength     numeric;
  v_lineup_strength   numeric;
  v_bench_impact      numeric;
  v_tournament_pressure numeric;
  v_scenario_conf     numeric;
  v_late_goal_risk    numeric;
  v_chaos_prob        numeric;
  v_fatigue_risk      numeric;

  -- Tournament sub-factors
  v_experience_score  numeric;
  v_squad_avg_age     numeric;
  v_age_profile       text;
  v_def_fragility     numeric;
  v_comeback_risk     numeric;

  -- Confidence and coverage
  v_confidence        text := 'none';
  v_coverage_flags    jsonb;
  v_warnings          jsonb := '[]'::jsonb;
  v_notes             text;

  -- Internals
  v_has_history       boolean := false;
  v_has_recent        boolean := false;
  v_has_player_pool   boolean := false;
  v_has_xi            boolean := false;
  v_has_bench         boolean := false;
  v_data_layers       integer := 0;

  v_wch_team_name_norm text;
  v_wch_team_row      record;
BEGIN

  -- ── Load team pool record ───────────────────────────────────────────────
  SELECT * INTO v_team_pool
  FROM public.wc2026_team_pool
  WHERE api_football_team_id = p_api_team_id
  LIMIT 1;

  IF NOT FOUND THEN
    -- Team not in pool yet — cannot calibrate
    RETURN NULL;
  END IF;

  -- ── Layer 1: WC History Backbone ────────────────────────────────────────
  -- Find team in wc_history by name match or fifa_code
  -- We use a loose name match since provider IDs differ between wc_history and wc2026

  SELECT
    COUNT(*)                                      AS match_count,
    SUM(CASE
      WHEN m.result = 'Home Win' AND t.id = m.home_team_id THEN 1
      WHEN m.result = 'Away Win' AND t.id = m.away_team_id THEN 1
      ELSE 0 END)                                 AS wins,
    SUM(CASE WHEN m.result = 'Draw' THEN 1 ELSE 0 END) AS draws,
    SUM(CASE
      WHEN m.result = 'Home Win' AND t.id = m.away_team_id THEN 1
      WHEN m.result = 'Away Win' AND t.id = m.home_team_id THEN 1
      ELSE 0 END)                                 AS losses,
    SUM(CASE WHEN t.id = m.home_team_id THEN COALESCE(m.home_score_ft,0)
             ELSE COALESCE(m.away_score_ft,0) END) AS gf,
    SUM(CASE WHEN t.id = m.home_team_id THEN COALESCE(m.away_score_ft,0)
             ELSE COALESCE(m.home_score_ft,0) END) AS ga,
    MAX(m.edition_year)                            AS last_year,
    COUNT(DISTINCT m.edition_year)                 AS appearances
  INTO
    v_wc_match_count, v_wc_wins, v_wc_draws, v_wc_losses,
    v_wc_gf, v_wc_ga, v_last_wc_year, v_wc_appearances
  FROM wc_history.teams t
  JOIN wc_history.matches m ON (m.home_team_id = t.id OR m.away_team_id = t.id)
  WHERE
    m.home_score_ft IS NOT NULL         -- completed matches only
    AND (
      -- Match by FIFA code if available
      (v_team_pool.fifa_code IS NOT NULL AND t.fifa_code = v_team_pool.fifa_code)
      OR
      -- Fallback: normalized name match
      lower(regexp_replace(t.name_en, '[^a-zA-Z]', '', 'g'))
        = lower(regexp_replace(v_team_pool.team_name, '[^a-zA-Z]', '', 'g'))
    );

  v_wc_match_count := COALESCE(v_wc_match_count, 0);
  v_wc_wins        := COALESCE(v_wc_wins, 0);
  v_wc_draws       := COALESCE(v_wc_draws, 0);
  v_wc_losses      := COALESCE(v_wc_losses, 0);
  v_wc_gf          := COALESCE(v_wc_gf, 0);
  v_wc_ga          := COALESCE(v_wc_ga, 0);
  v_wc_appearances := COALESCE(v_wc_appearances, 0);

  IF v_wc_match_count > 0 THEN
    v_has_history      := true;
    v_data_layers      := v_data_layers + 1;
    v_wc_win_rate      := v_wc_wins::numeric / v_wc_match_count;
    v_wc_goal_diff_avg := (v_wc_gf - v_wc_ga)::numeric / v_wc_match_count;

    -- Simplified ELO from win rate:
    -- WR 0.6+ → ~1650, WR 0.4 → ~1480, WR 0.2 → ~1300
    v_historical_elo := 1200 + (v_wc_win_rate * 750)
                        + LEAST(v_wc_appearances * 15, 150)  -- experience bonus, capped
                        + GREATEST(v_wc_goal_diff_avg * 30, -100); -- GD bonus/penalty

    -- Tournament experience score (0-100)
    v_experience_score := LEAST(
      (v_wc_appearances * 20)                       -- 5 appearances = max
      + CASE WHEN v_last_wc_year >= 2018 THEN 20 ELSE 0 END  -- recency bonus
      , 100
    );
  ELSE
    -- New/first-time qualifier — low baseline
    v_historical_elo   := 1350;
    v_experience_score := 10;
    v_warnings := v_warnings || '["Tarihsel DK verisi bulunamadı — temel ELO varsayılan"]'::jsonb;
  END IF;

  -- Defensive fragility: goals conceded per match in WC history
  IF v_wc_match_count > 0 THEN
    v_def_fragility := GREATEST(0, LEAST(100,
      100 - (v_wc_ga::numeric / v_wc_match_count * 20)
    ));
    -- Comeback risk: proportion of losses
    v_comeback_risk := CASE WHEN v_wc_match_count > 0
      THEN LEAST(1.0, v_wc_losses::numeric / v_wc_match_count * 2.0)
      ELSE 0.3 END;
  ELSE
    v_def_fragility  := 50;
    v_comeback_risk  := 0.3;
  END IF;

  -- ── Layer 2: Recent form (from wc_history last 2 editions) ──────────────
  -- If we have recent matches (2018, 2022 editions), weight more heavily
  -- This is approximate — full national team form requires live API data
  DECLARE
    v_recent_matches  integer := 0;
    v_recent_wins     integer := 0;
    v_recent_gf       integer := 0;
    v_recent_ga       integer := 0;
  BEGIN
    SELECT
      COUNT(*) AS mc, SUM(CASE
        WHEN m.result = 'Home Win' AND t.id = m.home_team_id THEN 1
        WHEN m.result = 'Away Win' AND t.id = m.away_team_id THEN 1
        ELSE 0 END) AS w,
      SUM(CASE WHEN t.id = m.home_team_id THEN COALESCE(m.home_score_ft,0)
               ELSE COALESCE(m.away_score_ft,0) END) AS gf,
      SUM(CASE WHEN t.id = m.home_team_id THEN COALESCE(m.away_score_ft,0)
               ELSE COALESCE(m.home_score_ft,0) END) AS ga
    INTO v_recent_matches, v_recent_wins, v_recent_gf, v_recent_ga
    FROM wc_history.teams t
    JOIN wc_history.matches m ON (m.home_team_id = t.id OR m.away_team_id = t.id)
    WHERE m.edition_year >= 2018
      AND m.home_score_ft IS NOT NULL
      AND (
        (v_team_pool.fifa_code IS NOT NULL AND t.fifa_code = v_team_pool.fifa_code)
        OR lower(regexp_replace(t.name_en, '[^a-zA-Z]', '', 'g'))
           = lower(regexp_replace(v_team_pool.team_name, '[^a-zA-Z]', '', 'g'))
      );

    IF v_recent_matches > 0 THEN
      v_has_recent := true;
      v_data_layers := v_data_layers + 1;
      -- Blend: 60% recent form, 40% historical baseline
      v_historical_elo := v_historical_elo * 0.4
        + (1200 + (v_recent_wins::numeric / v_recent_matches * 900)) * 0.6;
    ELSE
      v_warnings := v_warnings || '["2018/2022 DK form verisi yok — tarihsel ağırlık kullanıldı"]'::jsonb;
    END IF;
  END;

  -- ── Layer 3: Player pool ──────────────────────────────────────────────────
  SELECT
    COUNT(*)                                         AS total,
    SUM(CASE WHEN availability_status = 'available' THEN 1 ELSE 0 END)  AS avail,
    SUM(CASE WHEN availability_status = 'injured'   THEN 1 ELSE 0 END)  AS inj,
    SUM(CASE WHEN availability_status = 'suspended' THEN 1 ELSE 0 END)  AS susp,
    SUM(CASE WHEN position = 'Goalkeeper'  THEN 1 ELSE 0 END)           AS gk,
    SUM(CASE WHEN position = 'Defender'   THEN 1 ELSE 0 END)            AS def,
    SUM(CASE WHEN position = 'Midfielder' THEN 1 ELSE 0 END)            AS mid,
    SUM(CASE WHEN position = 'Attacker'  THEN 1 ELSE 0 END)             AS att
  INTO
    v_player_count, v_avail_count, v_inj_count, v_susp_count,
    v_gk_count, v_def_count, v_mid_count, v_att_count
  FROM public.wc2026_player_pool
  WHERE api_football_team_id = p_api_team_id
    AND data_status NOT IN ('unavailable','stale');

  v_player_count := COALESCE(v_player_count, 0);
  v_avail_count  := COALESCE(v_avail_count, 0);
  v_inj_count    := COALESCE(v_inj_count, 0);
  v_susp_count   := COALESCE(v_susp_count, 0);

  IF v_player_count > 0 THEN
    v_has_player_pool := true;
    v_data_layers := v_data_layers + 1;

    -- Position coverage: 1.0 if all 4 positions present
    DECLARE
      v_pos_present integer := 0;
    BEGIN
      IF v_gk_count > 0  THEN v_pos_present := v_pos_present + 1; END IF;
      IF v_def_count > 0 THEN v_pos_present := v_pos_present + 1; END IF;
      IF v_mid_count > 0 THEN v_pos_present := v_pos_present + 1; END IF;
      IF v_att_count > 0 THEN v_pos_present := v_pos_present + 1; END IF;
      v_pos_coverage := v_pos_present::numeric / 4.0;
    END;

    -- Adjust ELO for injury/suspension impact
    IF v_player_count > 0 THEN
      DECLARE
        v_loss_rate numeric := (v_inj_count + v_susp_count)::numeric / GREATEST(v_player_count, 1);
      BEGIN
        -- Each 10% player loss ≈ -30 ELO points
        v_historical_elo := v_historical_elo - (v_loss_rate * 300);
      END;
    END IF;

    IF v_inj_count > 2 OR v_susp_count > 1 THEN
      v_warnings := v_warnings || format('["Kadro kaybı: %s sakatlık, %s ceza"]', v_inj_count, v_susp_count)::jsonb;
    END IF;
  ELSE
    v_pos_coverage := 0;
    v_warnings := v_warnings || '["Oyuncu havuzu verisi yok — kadro düzeltmesi yapılamadı"]'::jsonb;
  END IF;

  -- ── Layer 4: Probable XI quality ─────────────────────────────────────────
  SELECT
    true,
    AVG(pps.rating),
    SUM(CASE WHEN pps.rating >= 7.5 THEN 1 ELSE 0 END)
  INTO v_xi_available, v_xi_avg_rating, v_xi_top_count
  FROM public.wc2026_probable_lineups pl
  JOIN public.wc2026_player_pool pp
    ON pp.api_football_team_id = pl.api_football_team_id
  JOIN public.wc2026_player_performance_snapshots pps
    ON pps.api_football_player_id = pp.api_football_player_id
  WHERE pl.api_football_team_id = p_api_team_id
    AND pl.status != 'unavailable'
    AND pps.rating IS NOT NULL
  LIMIT 1;

  v_xi_available := COALESCE(v_xi_available, false);
  v_xi_top_count := COALESCE(v_xi_top_count, 0);

  IF v_xi_available AND v_xi_avg_rating IS NOT NULL THEN
    v_has_xi := true;
    v_data_layers := v_data_layers + 1;
    -- XI quality adjustment: avg rating 6.5=neutral, 7.0=+50 ELO, 8.0=+150
    v_historical_elo := v_historical_elo
      + ((v_xi_avg_rating - 6.5) * 100);
  ELSE
    v_warnings := v_warnings || '["Muhtemel İlk 11 verisi yok — oyuncu kalitesi düzeltmesi yapılamadı"]'::jsonb;
  END IF;

  -- ── Layer 5: Bench impact ────────────────────────────────────────────────
  SELECT
    true,
    AVG(pps.rating)
  INTO v_bench_available, v_bench_avg_rating
  FROM public.wc2026_probable_lineups pl
  JOIN public.wc2026_player_pool pp
    ON pp.api_football_team_id = pl.api_football_team_id
  JOIN public.wc2026_player_performance_snapshots pps
    ON pps.api_football_player_id = pp.api_football_player_id
  WHERE pl.api_football_team_id = p_api_team_id
    AND jsonb_array_length(pl.substitutes_json) > 0
    AND pps.rating IS NOT NULL
  LIMIT 1;

  v_bench_available := COALESCE(v_bench_available, false);

  IF v_bench_available AND v_bench_avg_rating IS NOT NULL AND v_xi_avg_rating IS NOT NULL THEN
    v_has_bench := true;
    v_data_layers := v_data_layers + 1;
    -- bench_vs_xi: 0=much weaker, 0.5=half as good, 1=same quality
    v_bench_vs_xi := LEAST(1.0, v_bench_avg_rating / GREATEST(v_xi_avg_rating, 0.01));
  END IF;

  -- ── Squad age profile (from player pool snapshots) ───────────────────────
  SELECT AVG(
    EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM ppp.birth_date)
  )
  INTO v_squad_avg_age
  FROM public.wc2026_player_profiles ppp
  JOIN public.wc2026_player_pool pool ON pool.wc2026_player_profile_id = ppp.id
  WHERE pool.api_football_team_id = p_api_team_id
    AND ppp.birth_date IS NOT NULL;

  IF v_squad_avg_age IS NOT NULL THEN
    v_age_profile := CASE
      WHEN v_squad_avg_age < 25 THEN 'young'
      WHEN v_squad_avg_age > 28 THEN 'experienced'
      ELSE 'balanced'
    END;
  ELSE
    v_age_profile := 'unknown';
  END IF;

  -- ── Compute Named Indices ─────────────────────────────────────────────────

  -- 1. wc2026_team_strength_index (0-100): rescale ELO
  -- Typical WC range ~1200–1900; map to 0-100
  v_team_strength := GREATEST(0, LEAST(100,
    (v_historical_elo - 1200) / 7.0
  ));

  -- 2. wc2026_lineup_strength_index (0-100): only if XI available
  IF v_xi_available AND v_xi_avg_rating IS NOT NULL THEN
    -- XI avg rating 5.5=0, 9.0=100
    v_lineup_strength := GREATEST(0, LEAST(100,
      (v_xi_avg_rating - 5.5) / 3.5 * 100
    ));
  END IF;

  -- 3. wc2026_bench_impact_index (-1.0 to +1.0)
  -- Positive = bench upgrades late game; Negative = bench weakens late game
  IF v_bench_vs_xi IS NOT NULL THEN
    v_bench_impact := (v_bench_vs_xi - 0.6) * 2.5; -- 0.6=neutral pivot
    v_bench_impact := GREATEST(-1.0, LEAST(1.0, v_bench_impact));
  ELSE
    v_bench_impact := 0.0;
  END IF;

  -- 4. wc2026_tournament_pressure_index (0-100)
  -- Higher = more expected to perform / under pressure
  v_tournament_pressure := GREATEST(0, LEAST(100,
    (v_team_strength * 0.5)           -- strong teams under more pressure
    + COALESCE(v_experience_score, 30) * 0.3
    + CASE v_age_profile
        WHEN 'experienced' THEN 10
        WHEN 'young'       THEN -5
        ELSE 0 END
    + CASE WHEN v_last_wc_year IS NOT NULL AND v_last_wc_year >= 2018 THEN 10 ELSE 0 END
  ));

  -- 5. wc2026_scenario_confidence (0-1): data coverage quality
  v_scenario_conf := CASE v_data_layers
    WHEN 0 THEN 0.10
    WHEN 1 THEN 0.25
    WHEN 2 THEN 0.45
    WHEN 3 THEN 0.65
    WHEN 4 THEN 0.80
    ELSE          0.90
  END;

  -- 6. wc2026_late_goal_risk (0-1)
  -- Higher if team scores/concedes late, high comeback risk, bench impact positive
  v_late_goal_risk := GREATEST(0, LEAST(1,
    0.3                                             -- base rate
    + COALESCE(v_comeback_risk, 0.3) * 0.3
    + COALESCE(v_bench_impact, 0) * 0.2
    + CASE WHEN v_age_profile = 'young' THEN 0.1 ELSE 0 END
  ));

  -- 7. wc2026_chaos_probability (0-1)
  -- Higher for teams with high fragility, low experience, close-match history
  v_chaos_prob := GREATEST(0, LEAST(1,
    0.2
    + (100 - COALESCE(v_def_fragility, 50)) / 100.0 * 0.3
    + (100 - COALESCE(v_experience_score, 30)) / 100.0 * 0.2
    + CASE WHEN v_team_strength < 40 THEN 0.15 ELSE 0 END
  ));

  -- 8. wc2026_fatigue_risk (0-1)
  -- Higher for old squads, many games in qualification, no depth
  v_fatigue_risk := GREATEST(0, LEAST(1,
    0.15
    + CASE WHEN v_age_profile = 'experienced' THEN 0.2 ELSE 0 END
    + CASE WHEN v_bench_impact < -0.2 THEN 0.2 ELSE 0 END
    + CASE WHEN v_player_count < 18 THEN 0.15 ELSE 0 END
  ));

  -- ── Calibration confidence tier ──────────────────────────────────────────
  v_confidence := CASE
    WHEN v_data_layers >= 4 THEN 'high'
    WHEN v_data_layers >= 2 THEN 'medium'
    WHEN v_data_layers >= 1 THEN 'low'
    ELSE 'none'
  END;

  -- ── Coverage flags ────────────────────────────────────────────────────────
  v_coverage_flags := jsonb_build_object(
    'has_history',      v_has_history,
    'has_recent_form',  v_has_recent,
    'has_player_pool',  v_has_player_pool,
    'has_probable_xi',  v_has_xi,
    'has_bench',        v_has_bench,
    'data_layers',      v_data_layers
  );

  v_notes := format(
    'ELO tarihsel: %.0f | Maç: %s | Görünme: %s | Katmanlar: %s',
    v_historical_elo, v_wc_match_count, v_wc_appearances, v_data_layers
  );

  -- ── Write calibration profile ─────────────────────────────────────────────
  INSERT INTO public.wc2026_team_calibration_profiles (
    calibration_run_id,
    api_football_team_id,
    team_name,
    fifa_code,
    confederation,
    historical_wc_matches,
    historical_elo_rating,
    historical_win_rate,
    historical_goal_diff_avg,
    last_wc_year,
    recent_matches_available,
    player_pool_count,
    players_available,
    players_injured,
    players_suspended,
    position_coverage_score,
    probable_xi_available,
    probable_xi_avg_rating,
    probable_xi_top_player_count,
    bench_available,
    bench_avg_rating,
    bench_quality_vs_xi,
    wc2026_team_strength_index,
    wc2026_lineup_strength_index,
    wc2026_bench_impact_index,
    wc2026_tournament_pressure_index,
    wc2026_scenario_confidence,
    wc2026_late_goal_risk,
    wc2026_chaos_probability,
    wc2026_fatigue_risk,
    tournament_experience_score,
    squad_avg_age,
    squad_age_profile,
    defensive_fragility_score,
    comeback_risk_score,
    calibration_confidence,
    data_coverage_flags,
    missing_data_warnings,
    calibration_formula_version,
    calibration_notes,
    calibrated_at
  )
  VALUES (
    p_run_id,
    p_api_team_id,
    v_team_pool.team_name,
    v_team_pool.fifa_code,
    v_team_pool.confederation,
    v_wc_match_count,
    v_historical_elo,
    CASE WHEN v_wc_match_count > 0 THEN v_wc_win_rate ELSE NULL END,
    CASE WHEN v_wc_match_count > 0 THEN v_wc_goal_diff_avg ELSE NULL END,
    v_last_wc_year,
    CASE WHEN v_has_recent THEN 1 ELSE 0 END,
    v_player_count,
    v_avail_count,
    v_inj_count,
    v_susp_count,
    v_pos_coverage,
    v_xi_available,
    v_xi_avg_rating,
    v_xi_top_count,
    v_bench_available,
    v_bench_avg_rating,
    v_bench_vs_xi,
    v_team_strength,
    v_lineup_strength,
    v_bench_impact,
    v_tournament_pressure,
    v_scenario_conf,
    v_late_goal_risk,
    v_chaos_prob,
    v_fatigue_risk,
    v_experience_score,
    v_squad_avg_age,
    v_age_profile,
    v_def_fragility,
    v_comeback_risk,
    v_confidence,
    v_coverage_flags,
    v_warnings,
    'wc2026_v1',
    v_notes,
    now()
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wc2026_compute_team_calibration(integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.wc2026_compute_team_calibration(integer, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: wc2026_run_full_calibration
-- Batch: creates a run log entry, computes all teams, updates run log.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_run_full_calibration(
  p_triggered_by text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, wc_history
AS $$
DECLARE
  v_run_id        uuid;
  v_team          record;
  v_processed     integer := 0;
  v_updated       integer := 0;
  v_skipped       integer := 0;
  v_result_id     uuid;
BEGIN
  -- Create run log entry
  INSERT INTO public.wc2026_calibration_runs (
    run_type, triggered_by, run_status
  ) VALUES (
    'full_team_batch', p_triggered_by, 'running'
  ) RETURNING id INTO v_run_id;

  -- Process each team in the pool
  FOR v_team IN
    SELECT api_football_team_id, team_name
    FROM public.wc2026_team_pool
    ORDER BY team_name
  LOOP
    v_processed := v_processed + 1;
    BEGIN
      SELECT public.wc2026_compute_team_calibration(
        v_team.api_football_team_id,
        v_run_id
      ) INTO v_result_id;

      IF v_result_id IS NOT NULL THEN
        v_updated := v_updated + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  -- Update run log
  UPDATE public.wc2026_calibration_runs
  SET
    run_status       = CASE WHEN v_skipped = v_processed THEN 'failed'
                            WHEN v_skipped > 0 THEN 'partial'
                            ELSE 'completed' END,
    teams_processed  = v_processed,
    teams_updated    = v_updated,
    teams_skipped    = v_skipped,
    completed_at     = now()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id',           v_run_id,
    'teams_processed',  v_processed,
    'teams_updated',    v_updated,
    'teams_skipped',    v_skipped,
    'status',           CASE WHEN v_skipped = v_processed THEN 'failed'
                             WHEN v_skipped > 0 THEN 'partial'
                             ELSE 'completed' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wc2026_run_full_calibration(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.wc2026_run_full_calibration(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: wc2026_compute_match_scenario
-- Computes scenario calibration for a single WC2026 fixture.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_compute_match_scenario(
  p_fixture_id  integer,
  p_run_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fixture       record;
  v_home_calib    public.wc2026_team_calibration_profiles%ROWTYPE;
  v_away_calib    public.wc2026_team_calibration_profiles%ROWTYPE;
  v_result_id     uuid;

  v_strength_diff   numeric;
  v_p_home          numeric;
  v_p_draw          numeric;
  v_p_away          numeric;
  v_pred_home       integer;
  v_pred_away       integer;

  v_elo_h           numeric := 1500;
  v_elo_a           numeric := 1500;
  v_elo_diff        numeric;
  v_elo_win_p       numeric;

  v_late_risk       numeric;
  v_chaos           numeric;
  v_fatigue         numeric;
  v_scenario_conf   numeric := 0.15;
  v_confidence      text := 'none';
  v_warnings        jsonb := '[]'::jsonb;
BEGIN
  -- Load fixture
  SELECT * INTO v_fixture
  FROM public.wc2026_fixtures
  WHERE api_football_fixture_id = p_fixture_id
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Load latest calibration profiles for home + away teams
  SELECT tcp.* INTO v_home_calib
  FROM public.wc2026_team_calibration_profiles tcp
  WHERE EXISTS (
    SELECT 1 FROM public.wc2026_team_pool tp
    WHERE tp.api_football_team_id = tcp.api_football_team_id
      AND lower(regexp_replace(tp.team_name,'[^a-zA-Z]','','g'))
          = lower(regexp_replace(v_fixture.home_team_name,'[^a-zA-Z]','','g'))
  )
  ORDER BY tcp.calibrated_at DESC
  LIMIT 1;

  SELECT tcp.* INTO v_away_calib
  FROM public.wc2026_team_calibration_profiles tcp
  WHERE EXISTS (
    SELECT 1 FROM public.wc2026_team_pool tp
    WHERE tp.api_football_team_id = tcp.api_football_team_id
      AND lower(regexp_replace(tp.team_name,'[^a-zA-Z]','','g'))
          = lower(regexp_replace(v_fixture.away_team_name,'[^a-zA-Z]','','g'))
  )
  ORDER BY tcp.calibrated_at DESC
  LIMIT 1;

  -- Use calibration ELO; fall back to 1500
  v_elo_h := COALESCE(v_home_calib.historical_elo_rating, 1500);
  v_elo_a := COALESCE(v_away_calib.historical_elo_rating, 1500);

  -- ELO-based win probability (international: no home advantage at neutral venues)
  v_elo_diff  := v_elo_h - v_elo_a;
  v_elo_win_p := 1.0 / (1.0 + power(10.0, -v_elo_diff / 400.0));

  -- Draw: league prior approach; international average ~28%
  v_p_draw := 0.10 + 0.18 * (1.0 - abs(v_elo_win_p - 0.5) * 2);
  v_p_draw := GREATEST(0.10, LEAST(0.32, v_p_draw));

  -- Distribute remainder to home/away
  v_p_home := (1 - v_p_draw) * v_elo_win_p;
  v_p_away := (1 - v_p_draw) * (1 - v_elo_win_p);

  -- Normalize
  DECLARE v_total numeric := v_p_home + v_p_draw + v_p_away;
  BEGIN
    v_p_home := v_p_home / v_total;
    v_p_draw := v_p_draw / v_total;
    v_p_away := v_p_away / v_total;
  END;

  -- Predicted score (simplified Poisson-ish proxy)
  v_strength_diff := COALESCE(v_home_calib.wc2026_team_strength_index, 50)
                   - COALESCE(v_away_calib.wc2026_team_strength_index, 50);
  v_pred_home := CASE
    WHEN v_strength_diff >= 20 THEN 2
    WHEN v_strength_diff >= 5  THEN 1
    ELSE 1 END;
  v_pred_away := CASE
    WHEN v_strength_diff <= -20 THEN 2
    WHEN v_strength_diff <= -5  THEN 1
    ELSE 1 END;

  -- Scenario indices (average of both teams or computed)
  v_late_risk := (
    COALESCE(v_home_calib.wc2026_late_goal_risk, 0.35)
    + COALESCE(v_away_calib.wc2026_late_goal_risk, 0.35)
  ) / 2;

  v_chaos := (
    COALESCE(v_home_calib.wc2026_chaos_probability, 0.25)
    + COALESCE(v_away_calib.wc2026_chaos_probability, 0.25)
  ) / 2;

  v_fatigue := (
    COALESCE(v_home_calib.wc2026_fatigue_risk, 0.2)
    + COALESCE(v_away_calib.wc2026_fatigue_risk, 0.2)
  ) / 2;

  -- Scenario confidence: min of both teams' calibration confidence
  v_scenario_conf := LEAST(
    COALESCE(v_home_calib.wc2026_scenario_confidence, 0.1),
    COALESCE(v_away_calib.wc2026_scenario_confidence, 0.1)
  );

  v_confidence := CASE
    WHEN v_scenario_conf >= 0.6 THEN 'high'
    WHEN v_scenario_conf >= 0.35 THEN 'medium'
    WHEN v_scenario_conf >= 0.15 THEN 'low'
    ELSE 'none'
  END;

  IF v_home_calib.api_football_team_id IS NULL THEN
    v_warnings := v_warnings || '["Ev takımı kalibrasyonu bulunamadı"]'::jsonb;
  END IF;
  IF v_away_calib.api_football_team_id IS NULL THEN
    v_warnings := v_warnings || '["Deplasman takımı kalibrasyonu bulunamadı"]'::jsonb;
  END IF;

  -- Insert scenario record
  INSERT INTO public.wc2026_match_scenario_calibration (
    calibration_run_id,
    api_football_fixture_id,
    home_team_name,
    away_team_name,
    stage_code,
    group_label,
    home_team_strength_index,
    away_team_strength_index,
    strength_diff,
    home_win_probability,
    draw_probability,
    away_win_probability,
    predicted_score_home,
    predicted_score_away,
    first_15_tempo,
    first_15_pressure,
    first_half_pressure_dominant,
    first_half_goal_probability,
    first_half_card_risk,
    second_half_fatigue_factor,
    second_half_momentum_shift_risk,
    late_game_chaos_score,
    late_goal_probability,
    late_card_risk,
    comeback_probability,
    set_piece_threat,
    wc2026_scenario_confidence,
    wc2026_late_goal_risk,
    wc2026_chaos_probability,
    wc2026_fatigue_risk,
    calibration_confidence,
    missing_data_warnings
  )
  VALUES (
    p_run_id,
    p_fixture_id,
    v_fixture.home_team_name,
    v_fixture.away_team_name,
    v_fixture.stage_code,
    v_fixture.group_label,
    COALESCE(v_home_calib.wc2026_team_strength_index, 50),
    COALESCE(v_away_calib.wc2026_team_strength_index, 50),
    v_strength_diff,
    v_p_home,
    v_p_draw,
    v_p_away,
    v_pred_home,
    v_pred_away,
    -- first 15: derive from chaos + strength diff
    CASE WHEN v_chaos > 0.5 THEN 'high'
         WHEN abs(v_strength_diff) < 10 THEN 'balanced'
         ELSE 'low' END,
    LEAST(1.0, v_chaos * 0.5 + 0.2),
    -- first half dominant
    CASE WHEN v_strength_diff > 15 THEN 'home'
         WHEN v_strength_diff < -15 THEN 'away'
         ELSE 'balanced' END,
    LEAST(1.0, 0.35 + v_chaos * 0.2),
    -- first half card risk
    CASE WHEN v_chaos > 0.5 THEN 'high'
         WHEN v_chaos > 0.3 THEN 'medium'
         ELSE 'low' END,
    v_fatigue,
    -- momentum shift risk: high when teams are close
    CASE WHEN abs(v_strength_diff) < 10 THEN 0.6 ELSE 0.3 END,
    v_chaos,
    v_late_risk,
    -- late card risk
    CASE WHEN v_late_risk > 0.5 THEN 'high'
         WHEN v_late_risk > 0.3 THEN 'medium'
         ELSE 'low' END,
    -- comeback probability: use lower-strength team's comeback risk
    GREATEST(
      COALESCE(v_home_calib.comeback_risk_score, 30),
      COALESCE(v_away_calib.comeback_risk_score, 30)
    ) / 100.0,
    -- set piece threat: high for experienced teams
    CASE WHEN GREATEST(
      COALESCE(v_home_calib.tournament_experience_score, 30),
      COALESCE(v_away_calib.tournament_experience_score, 30)
    ) > 70 THEN 'high'
         WHEN GREATEST(
      COALESCE(v_home_calib.tournament_experience_score, 30),
      COALESCE(v_away_calib.tournament_experience_score, 30)
    ) > 40 THEN 'medium'
         ELSE 'low' END,
    v_scenario_conf,
    v_late_risk,
    v_chaos,
    v_fatigue,
    v_confidence,
    v_warnings
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wc2026_compute_match_scenario(integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.wc2026_compute_match_scenario(integer, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: wc2026_get_calibration_dashboard
-- Admin overview: latest calibration profile per team
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wc2026_get_calibration_dashboard()
RETURNS TABLE (
  api_football_team_id            integer,
  team_name                       text,
  fifa_code                       text,
  confederation                   text,
  historical_wc_matches           integer,
  last_wc_year                    integer,
  wc2026_team_strength_index      numeric,
  wc2026_lineup_strength_index    numeric,
  wc2026_bench_impact_index       numeric,
  wc2026_tournament_pressure_index numeric,
  wc2026_scenario_confidence      numeric,
  wc2026_late_goal_risk           numeric,
  wc2026_chaos_probability        numeric,
  wc2026_fatigue_risk             numeric,
  calibration_confidence          text,
  player_pool_count               integer,
  players_injured                 integer,
  probable_xi_available           boolean,
  squad_age_profile               text,
  defensive_fragility_score       numeric,
  comeback_risk_score             numeric,
  data_coverage_flags             jsonb,
  missing_data_warnings           jsonb,
  calibration_notes               text,
  calibrated_at                   timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (tcp.api_football_team_id)
    tcp.api_football_team_id,
    tcp.team_name,
    tcp.fifa_code,
    tcp.confederation,
    tcp.historical_wc_matches,
    tcp.last_wc_year,
    tcp.wc2026_team_strength_index,
    tcp.wc2026_lineup_strength_index,
    tcp.wc2026_bench_impact_index,
    tcp.wc2026_tournament_pressure_index,
    tcp.wc2026_scenario_confidence,
    tcp.wc2026_late_goal_risk,
    tcp.wc2026_chaos_probability,
    tcp.wc2026_fatigue_risk,
    tcp.calibration_confidence,
    tcp.player_pool_count,
    tcp.players_injured,
    tcp.probable_xi_available,
    tcp.squad_age_profile,
    tcp.defensive_fragility_score,
    tcp.comeback_risk_score,
    tcp.data_coverage_flags,
    tcp.missing_data_warnings,
    tcp.calibration_notes,
    tcp.calibrated_at
  FROM public.wc2026_team_calibration_profiles tcp
  ORDER BY tcp.api_football_team_id, tcp.calibrated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.wc2026_get_calibration_dashboard() FROM anon;
GRANT EXECUTE ON FUNCTION public.wc2026_get_calibration_dashboard() TO authenticated;
