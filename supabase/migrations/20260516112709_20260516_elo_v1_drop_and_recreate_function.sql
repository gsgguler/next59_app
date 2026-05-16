/*
  # ELO V1 — Drop and recreate computation function
  Drops previous version with different return type, then recreates
  with out_ prefixed return columns to avoid PL/pgSQL ambiguity.
*/

DROP FUNCTION IF EXISTS model_lab.ml_run_elo_v1(text);

CREATE FUNCTION model_lab.ml_run_elo_v1(
  p_elo_version text DEFAULT 'elo_v1_domestic_2026_05'
)
RETURNS TABLE (
  out_competition   text,
  out_matches       integer,
  out_teams         integer,
  out_avg_elo       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_base_elo       numeric := 1500.0;
  v_k              numeric := 20.0;
  v_home_adv       numeric := 60.0;
  v_carryover      numeric := 0.75;

  v_match          record;
  v_comp           record;
  v_elo_h          numeric;
  v_elo_a          numeric;
  v_exp_h          numeric;
  v_exp_a          numeric;
  v_act_h          numeric;
  v_act_a          numeric;
  v_gdm            numeric;
  v_dh             numeric;
  v_da             numeric;
  v_post_h         numeric;
  v_post_a         numeric;
  v_last_season    text;
  v_proc_count     integer;
BEGIN

  FOR v_comp IN
    SELECT DISTINCT
      csm.competition_id  AS cid,
      csm.competition_name AS cname
    FROM model_lab.v_calibration_safe_matches csm
    ORDER BY csm.competition_name
  LOOP
    v_last_season := NULL;
    v_proc_count  := 0;

    CREATE TEMP TABLE IF NOT EXISTS _elo_state (
      team_id     uuid PRIMARY KEY,
      elo         numeric(10,4) NOT NULL DEFAULT 1500.0
    ) ON COMMIT DELETE ROWS;

    TRUNCATE _elo_state;

    FOR v_match IN
      SELECT
        csm.match_id,
        csm.competition_id,
        csm.competition_name  AS cname,
        csm.season_label,
        csm.match_date,
        csm.home_team_id,
        csm.home_team_name,
        csm.away_team_id,
        csm.away_team_name,
        csm.home_score_ft,
        csm.away_score_ft,
        csm.result_1x2
      FROM model_lab.v_calibration_safe_matches csm
      WHERE csm.competition_id = v_comp.cid
      ORDER BY csm.match_date ASC, csm.competition_name ASC, csm.match_id ASC
    LOOP

      -- Season boundary carryover
      IF v_last_season IS NOT NULL
         AND v_match.season_label IS DISTINCT FROM v_last_season THEN
        UPDATE _elo_state
        SET elo = round(v_base_elo + (elo - v_base_elo) * v_carryover, 4);
      END IF;
      v_last_season := v_match.season_label;

      -- Home ELO
      SELECT es.elo INTO v_elo_h FROM _elo_state es WHERE es.team_id = v_match.home_team_id;
      IF NOT FOUND THEN
        v_elo_h := v_base_elo;
        INSERT INTO _elo_state (team_id, elo) VALUES (v_match.home_team_id, v_base_elo);
      END IF;

      -- Away ELO
      SELECT es.elo INTO v_elo_a FROM _elo_state es WHERE es.team_id = v_match.away_team_id;
      IF NOT FOUND THEN
        v_elo_a := v_base_elo;
        INSERT INTO _elo_state (team_id, elo) VALUES (v_match.away_team_id, v_base_elo);
      END IF;

      -- Expected scores (home advantage baked into expected, not into raw ELO)
      v_exp_h := 1.0 / (1.0 + power(10.0, (v_elo_a - (v_elo_h + v_home_adv)) / 400.0));
      v_exp_a := 1.0 - v_exp_h;

      -- Actual scores
      v_act_h := CASE v_match.result_1x2 WHEN 'H' THEN 1.0 WHEN 'D' THEN 0.5 ELSE 0.0 END;
      v_act_a := 1.0 - v_act_h;

      -- Goal difference multiplier
      v_gdm := CASE ABS(v_match.home_score_ft - v_match.away_score_ft)
        WHEN 1 THEN 1.00
        WHEN 2 THEN 1.25
        WHEN 3 THEN 1.50
        ELSE        1.75
      END;

      -- Deltas
      v_dh := v_k * v_gdm * (v_act_h - v_exp_h);
      v_da := v_k * v_gdm * (v_act_a - v_exp_a);

      v_post_h := round(v_elo_h + v_dh, 4);
      v_post_a := round(v_elo_a + v_da, 4);

      -- Immutable snapshot (ON CONFLICT DO NOTHING = idempotent)
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
        v_match.match_id, v_match.competition_id, v_match.cname,
        v_match.season_label, v_match.match_date,
        v_match.home_team_id, v_match.home_team_name,
        v_match.away_team_id, v_match.away_team_name,
        v_match.home_score_ft, v_match.away_score_ft, v_match.result_1x2,
        round(v_elo_h, 4), round(v_elo_a, 4),
        v_post_h, v_post_a,
        round(v_dh, 4), round(v_da, 4),
        round(v_exp_h, 6), round(v_exp_a, 6),
        v_home_adv, v_k, v_gdm,
        p_elo_version
      )
      ON CONFLICT (match_id, elo_version) DO NOTHING;

      -- Advance live state
      UPDATE _elo_state SET elo = v_post_h WHERE team_id = v_match.home_team_id;
      UPDATE _elo_state SET elo = v_post_a WHERE team_id = v_match.away_team_id;

      v_proc_count := v_proc_count + 1;

    END LOOP; -- per match

    RETURN QUERY
    SELECT
      v_comp.cname,
      v_proc_count,
      (SELECT COUNT(*)::integer FROM _elo_state),
      (SELECT ROUND(AVG(elo), 1) FROM _elo_state);

    DROP TABLE IF EXISTS _elo_state;

  END LOOP; -- per competition

END;
$$;

GRANT EXECUTE ON FUNCTION model_lab.ml_run_elo_v1(text) TO authenticated;
