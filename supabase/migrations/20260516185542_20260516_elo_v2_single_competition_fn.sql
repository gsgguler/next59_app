
/*
  # ELO V2 — Single-Competition Computation Function

  ## Summary
  Creates model_lab.ml_run_elo_v2_competition(), which runs the full ELO V2
  computation for a single competition only. Designed to be called 7 times
  (once per competition) to avoid statement-level timeouts on the full corpus.

  Functionally identical to ml_run_elo_v2() but scoped to one competition_name.
  Uses the same algorithm: HA=0 default, K=20, seasonal carryover=0.75,
  goal-diff multiplier, ON CONFLICT DO NOTHING for idempotency.

  ## Usage
  SELECT * FROM model_lab.ml_run_elo_v2_competition(
    'elo_v2_ha0_k20_global', 'Premier League', 0.0, 20.0
  );

  ## Safety
  - Reads only from model_lab.v_calibration_safe_matches
  - Writes only to model_lab.team_elo_snapshots (new version key)
  - ON CONFLICT (match_id, elo_version) DO NOTHING — fully idempotent
  - ELO V1 untouched (different version key)
*/

DROP FUNCTION IF EXISTS model_lab.ml_run_elo_v2_competition(text, text, numeric, numeric, text, text, numeric);

CREATE OR REPLACE FUNCTION model_lab.ml_run_elo_v2_competition(
  p_elo_version       text    DEFAULT 'elo_v2_ha0_k20_global',
  p_competition_name  text    DEFAULT 'Premier League',
  p_home_advantage    numeric DEFAULT 0.0,
  p_k_factor          numeric DEFAULT 20.0,
  p_decay_mode        text    DEFAULT 'none',
  p_era_mode          text    DEFAULT 'global',
  p_covid_ha          numeric DEFAULT 0.0
)
RETURNS TABLE (
  out_competition  text,
  out_matches      integer,
  out_teams        integer,
  out_avg_elo      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_match         record;
  v_season_order  integer;
  v_prev_season   text;
  v_elo_home      numeric;
  v_elo_away      numeric;
  v_ha            numeric;
  v_k             numeric;
  v_expected_home numeric;
  v_expected_away numeric;
  v_actual_home   numeric;
  v_actual_away   numeric;
  v_gdm           numeric;
  v_delta_home    numeric;
  v_delta_away    numeric;
  v_base_rating   constant numeric := 1500.0;
  v_carryover     constant numeric := 0.75;
  v_match_count   integer := 0;
  v_comp_id       uuid;
BEGIN

  -- Resolve competition_id
  SELECT DISTINCT competition_id INTO v_comp_id
  FROM model_lab.v_calibration_safe_matches
  WHERE competition_name = p_competition_name
  LIMIT 1;

  IF v_comp_id IS NULL THEN
    RAISE EXCEPTION 'Competition not found: %', p_competition_name;
  END IF;

  -- Temp ELO state for this competition
  DROP TABLE IF EXISTS _elo_state_v2c;
  CREATE TEMP TABLE _elo_state_v2c (
    team_id      uuid    PRIMARY KEY,
    current_elo  numeric NOT NULL DEFAULT 1500.0,
    season_label text
  );

  v_prev_season  := NULL;
  v_season_order := 0;

  FOR v_match IN
    SELECT
      csm.match_id,
      csm.competition_id,
      csm.competition_name,
      csm.season_label,
      csm.kickoff_utc::date   AS match_date,
      csm.home_team_id,
      csm.away_team_id,
      csm.home_team_name,
      csm.away_team_name,
      csm.home_score_ft,
      csm.away_score_ft,
      csm.result_1x2
    FROM model_lab.v_calibration_safe_matches csm
    WHERE csm.competition_id = v_comp_id
    ORDER BY csm.kickoff_utc ASC, csm.match_id ASC
  LOOP

    -- Season boundary
    IF v_match.season_label IS DISTINCT FROM v_prev_season THEN
      v_season_order := v_season_order + 1;
      UPDATE _elo_state_v2c
      SET current_elo  = v_base_rating + (current_elo - v_base_rating) * v_carryover,
          season_label = v_match.season_label
      WHERE season_label IS NOT NULL
        AND season_label <> v_match.season_label;
      v_prev_season := v_match.season_label;
    END IF;

    -- Init new teams
    INSERT INTO _elo_state_v2c (team_id, current_elo, season_label)
    VALUES (v_match.home_team_id, v_base_rating, v_match.season_label)
    ON CONFLICT DO NOTHING;
    INSERT INTO _elo_state_v2c (team_id, current_elo, season_label)
    VALUES (v_match.away_team_id, v_base_rating, v_match.season_label)
    ON CONFLICT DO NOTHING;

    SELECT current_elo INTO v_elo_home FROM _elo_state_v2c WHERE team_id = v_match.home_team_id;
    SELECT current_elo INTO v_elo_away FROM _elo_state_v2c WHERE team_id = v_match.away_team_id;

    -- HA
    v_ha := p_home_advantage;
    IF p_era_mode = 'covid_aware' THEN
      IF v_match.season_label LIKE '2020-%'
         OR (v_match.season_label LIKE '2019-%' AND v_match.match_date >= '2020-03-01'::date)
      THEN v_ha := p_covid_ha; END IF;
    END IF;

    v_expected_home := 1.0 / (1.0 + POWER(10.0, (v_elo_away - (v_elo_home + v_ha)) / 400.0));
    v_expected_away := 1.0 - v_expected_home;

    v_actual_home := CASE v_match.result_1x2 WHEN 'H' THEN 1.0 WHEN 'D' THEN 0.5 ELSE 0.0 END;
    v_actual_away := 1.0 - v_actual_home;

    v_gdm := CASE ABS(v_match.home_score_ft - v_match.away_score_ft)
      WHEN 0 THEN 1.00  WHEN 1 THEN 1.00
      WHEN 2 THEN 1.25  WHEN 3 THEN 1.50
      ELSE        1.75
    END;

    v_k := p_k_factor;
    IF p_decay_mode = 'linear_decay' THEN
      v_k := p_k_factor * GREATEST(0.5, 1.0 - GREATEST(0, v_season_order - 3) * 0.05);
    ELSIF p_decay_mode = 'exponential_decay' THEN
      v_k := p_k_factor * POWER(0.97, v_season_order - 1);
    END IF;

    v_delta_home := v_k * v_gdm * (v_actual_home - v_expected_home);
    v_delta_away := v_k * v_gdm * (v_actual_away - v_expected_away);

    INSERT INTO model_lab.team_elo_snapshots (
      match_id, competition_id, competition_name, season_label,
      match_date, home_team_id, away_team_id,
      home_team_name, away_team_name,
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
      v_match.home_team_id, v_match.away_team_id,
      v_match.home_team_name, v_match.away_team_name,
      v_match.home_score_ft, v_match.away_score_ft, v_match.result_1x2,
      ROUND(v_elo_home, 4), ROUND(v_elo_away, 4),
      ROUND(v_elo_home + v_delta_home, 4),
      ROUND(v_elo_away + v_delta_away, 4),
      ROUND(v_delta_home, 4), ROUND(v_delta_away, 4),
      ROUND(v_expected_home, 6), ROUND(v_expected_away, 6),
      v_ha, ROUND(v_k, 4), v_gdm,
      p_elo_version
    )
    ON CONFLICT (match_id, elo_version) DO NOTHING;

    UPDATE _elo_state_v2c SET current_elo = v_elo_home + v_delta_home WHERE team_id = v_match.home_team_id;
    UPDATE _elo_state_v2c SET current_elo = v_elo_away + v_delta_away WHERE team_id = v_match.away_team_id;

    v_match_count := v_match_count + 1;
  END LOOP;

  DROP TABLE IF EXISTS _elo_state_v2c;

  RETURN QUERY
    SELECT
      p_competition_name::text,
      v_match_count::integer,
      (SELECT COUNT(DISTINCT t)::integer FROM (
         SELECT home_team_id AS t FROM model_lab.team_elo_snapshots
         WHERE elo_version = p_elo_version AND competition_id = v_comp_id
         UNION SELECT away_team_id FROM model_lab.team_elo_snapshots
         WHERE elo_version = p_elo_version AND competition_id = v_comp_id
       ) x),
      (SELECT ROUND(AVG((pre_match_elo_home+pre_match_elo_away)/2.0)::numeric,2)
       FROM model_lab.team_elo_snapshots
       WHERE elo_version = p_elo_version AND competition_id = v_comp_id);

END;
$$;
