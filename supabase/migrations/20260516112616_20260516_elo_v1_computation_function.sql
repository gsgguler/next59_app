/*
  # ELO Engine V1 — Computation Function

  ## Summary
  Deterministic ELO computation function sourced exclusively from
  model_lab.v_calibration_safe_matches. Writes immutable snapshots
  to model_lab.team_elo_snapshots.

  ## Parameters (ELO V1 Spec)
  - base_rating:               1500
  - k_factor:                  20 (fixed, no variable K)
  - home_advantage:            60
  - season_carryover:          0.75
  - goal_diff_multiplier:
      |gd| = 1 → 1.00
      |gd| = 2 → 1.25
      |gd| = 3 → 1.50
      |gd| >= 4 → 1.75

  ## Expected Score Formula
  E_home = 1 / (1 + 10 ^ ((away_elo - (home_elo + home_advantage)) / 400))
  E_away = 1 - E_home

  ## Season Carryover
  Applied once per team per competition when the season_label changes.
  new_rating = 1500 + (previous_rating - 1500) * 0.75
  Teams never seen before start at 1500.

  ## Processing Order
  ORDER BY match_date ASC, competition_name ASC, match_id ASC
  Fully deterministic given these three sort keys.

  ## Safety
  - Source: v_calibration_safe_matches only (7 safe domestic leagues)
  - No UEFA, no WC2026, no national teams
  - No post-match stats used as inputs
  - No random values
  - UNIQUE constraint on (match_id, elo_version) prevents double-writes
  - Uses ON CONFLICT DO NOTHING for idempotent re-runs

  ## Returns
  Table of (competition_name, matches_processed, teams_rated, avg_elo)
*/

CREATE OR REPLACE FUNCTION model_lab.ml_run_elo_v1(
  p_elo_version text DEFAULT 'elo_v1_domestic_2026_05'
)
RETURNS TABLE (
  competition_name  text,
  matches_processed integer,
  teams_rated       integer,
  avg_elo           numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- ELO V1 fixed parameters
  v_base_elo          numeric := 1500.0;
  v_k                 numeric := 20.0;
  v_home_advantage    numeric := 60.0;
  v_carryover         numeric := 0.75;

  -- Working state
  v_match             record;
  v_comp              record;
  v_elo_home          numeric;
  v_elo_away          numeric;
  v_expected_home     numeric;
  v_expected_away     numeric;
  v_actual_home       numeric;
  v_actual_away       numeric;
  v_gdm               numeric;   -- goal diff multiplier
  v_delta_home        numeric;
  v_delta_away        numeric;
  v_post_home         numeric;
  v_post_away         numeric;
  v_last_season       text;
  v_proc_count        integer;

  -- In-memory ELO state for the current competition pass
  -- Stored in a temp table per competition loop
BEGIN
  -- ----------------------------------------------------------------
  -- Iterate competition by competition for clean season-boundary logic
  -- ----------------------------------------------------------------
  FOR v_comp IN
    SELECT DISTINCT competition_id, competition_name
    FROM model_lab.v_calibration_safe_matches
    ORDER BY competition_name
  LOOP
    v_last_season := NULL;
    v_proc_count  := 0;

    -- Temp table holds live ELO state for this competition pass
    CREATE TEMP TABLE IF NOT EXISTS _elo_state (
      team_id    uuid PRIMARY KEY,
      elo        numeric(10,4) NOT NULL DEFAULT 1500.0,
      last_season text
    ) ON COMMIT DELETE ROWS;

    TRUNCATE _elo_state;

    -- Process every safe match in chronological order
    FOR v_match IN
      SELECT
        match_id,
        competition_id,
        competition_name,
        season_label,
        match_date,
        home_team_id,
        home_team_name,
        away_team_id,
        away_team_name,
        home_score_ft,
        away_score_ft,
        result_1x2
      FROM model_lab.v_calibration_safe_matches
      WHERE competition_id = v_comp.competition_id
      ORDER BY match_date ASC, competition_name ASC, match_id ASC
    LOOP

      -- ---- Season carryover ----------------------------------------
      -- Applied once per team when the season label changes
      IF v_last_season IS NOT NULL AND v_match.season_label IS DISTINCT FROM v_last_season THEN
        UPDATE _elo_state
        SET elo = v_base_elo + (elo - v_base_elo) * v_carryover;
      END IF;
      v_last_season := v_match.season_label;

      -- ---- Resolve home ELO ----------------------------------------
      SELECT elo INTO v_elo_home
      FROM _elo_state
      WHERE team_id = v_match.home_team_id;

      IF NOT FOUND THEN
        v_elo_home := v_base_elo;
        INSERT INTO _elo_state (team_id, elo, last_season)
        VALUES (v_match.home_team_id, v_base_elo, v_match.season_label);
      END IF;

      -- ---- Resolve away ELO ----------------------------------------
      SELECT elo INTO v_elo_away
      FROM _elo_state
      WHERE team_id = v_match.away_team_id;

      IF NOT FOUND THEN
        v_elo_away := v_base_elo;
        INSERT INTO _elo_state (team_id, elo, last_season)
        VALUES (v_match.away_team_id, v_base_elo, v_match.season_label);
      END IF;

      -- ---- Expected scores -----------------------------------------
      v_expected_home := 1.0 / (1.0 + power(10.0,
        (v_elo_away - (v_elo_home + v_home_advantage)) / 400.0));
      v_expected_away := 1.0 - v_expected_home;

      -- ---- Actual scores -------------------------------------------
      v_actual_home := CASE v_match.result_1x2
        WHEN 'H' THEN 1.0
        WHEN 'D' THEN 0.5
        ELSE 0.0
      END;
      v_actual_away := 1.0 - v_actual_home;

      -- ---- Goal difference multiplier ------------------------------
      v_gdm := CASE ABS(v_match.home_score_ft - v_match.away_score_ft)
        WHEN 0 THEN 1.00   -- draw (safety — result_1x2='D' already handled)
        WHEN 1 THEN 1.00
        WHEN 2 THEN 1.25
        WHEN 3 THEN 1.50
        ELSE        1.75   -- 4+ goals
      END;

      -- ---- Deltas --------------------------------------------------
      v_delta_home := v_k * v_gdm * (v_actual_home - v_expected_home);
      v_delta_away := v_k * v_gdm * (v_actual_away - v_expected_away);

      v_post_home := v_elo_home + v_delta_home;
      v_post_away := v_elo_away + v_delta_away;

      -- ---- Write immutable snapshot --------------------------------
      INSERT INTO model_lab.team_elo_snapshots (
        match_id, competition_id, competition_name,
        season_label, match_date,
        home_team_id, home_team_name,
        away_team_id, away_team_name,
        home_score_ft, away_score_ft, result_1x2,
        pre_match_elo_home, pre_match_elo_away,
        post_match_elo_home, post_match_elo_away,
        elo_delta_home, elo_delta_away,
        expected_home, expected_away,
        home_advantage_applied, k_factor, goal_diff_multiplier,
        elo_version
      ) VALUES (
        v_match.match_id, v_match.competition_id, v_match.competition_name,
        v_match.season_label, v_match.match_date,
        v_match.home_team_id, v_match.home_team_name,
        v_match.away_team_id, v_match.away_team_name,
        v_match.home_score_ft, v_match.away_score_ft, v_match.result_1x2,
        round(v_elo_home, 4), round(v_elo_away, 4),
        round(v_post_home, 4), round(v_post_away, 4),
        round(v_delta_home, 4), round(v_delta_away, 4),
        round(v_expected_home, 6), round(v_expected_away, 6),
        v_home_advantage, v_k, v_gdm,
        p_elo_version
      )
      ON CONFLICT (match_id, elo_version) DO NOTHING;

      -- ---- Update live state ---------------------------------------
      UPDATE _elo_state SET elo = round(v_post_home, 4)
      WHERE team_id = v_match.home_team_id;

      UPDATE _elo_state SET elo = round(v_post_away, 4)
      WHERE team_id = v_match.away_team_id;

      v_proc_count := v_proc_count + 1;

    END LOOP; -- per match

    -- Return per-competition summary
    RETURN QUERY
    SELECT
      v_comp.competition_name::text,
      v_proc_count::integer,
      (SELECT COUNT(*)::integer FROM _elo_state),
      (SELECT ROUND(AVG(elo), 1) FROM _elo_state);

    DROP TABLE IF EXISTS _elo_state;

  END LOOP; -- per competition

END;
$$;

-- Allow authenticated users to call the function (execution controlled by SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION model_lab.ml_run_elo_v1(text) TO authenticated;
