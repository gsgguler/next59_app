
/*
  # ELO V2 — Parameterized Computation Function

  ## Summary
  Creates model_lab.ml_run_elo_v2(), a fully parameterized version of the
  ELO computation function. Does NOT modify or overwrite ELO V1 snapshots.
  Each call uses a unique p_elo_version key; the UNIQUE(match_id, elo_version)
  constraint on team_elo_snapshots prevents any cross-version contamination.

  ## Parameters
  - p_elo_version     : version key, e.g. 'elo_v2_ha20_k20_global'
  - p_home_advantage  : ELO rating points added to home team (default 20)
  - p_k_factor        : base learning rate per match (default 20)
  - p_decay_mode      : 'none' | 'linear_decay' | 'exponential_decay'
  - p_era_mode        : 'global' | 'covid_aware'
  - p_covid_ha        : HA override for 2020-2021 season (used when era_mode='covid_aware')

  ## Decay Modes
  - none:               k_factor unchanged
  - linear_decay:       k applied at full for first 3 seasons, decays by 5% per additional season
                        (approximates recency preference without randomness)
  - exponential_decay:  k * 0.97^seasons_elapsed from first season in corpus

  NOTE: Decay is applied at the season level, not per-match. Season order is
  derived from the chronological position of the season within each competition.

  ## COVID-Aware Mode
  When era_mode = 'covid_aware', matches in season_label starting with '2020'
  use p_covid_ha instead of p_home_advantage.
  2019-2020 partial season (Mar-Aug 2020, played behind closed doors) is also
  treated as covid era by checking match_date >= '2020-03-01'.

  ## Safety
  - Uses ON CONFLICT (match_id, elo_version) DO NOTHING — fully idempotent
  - Reads only from model_lab.v_calibration_safe_matches (7 safe leagues)
  - No reads from v_team_pre_match_rolling_features
  - All state is local temp table, dropped after each competition
*/

DROP FUNCTION IF EXISTS model_lab.ml_run_elo_v2(text, numeric, numeric, text, text, numeric);

CREATE OR REPLACE FUNCTION model_lab.ml_run_elo_v2(
  p_elo_version     text    DEFAULT 'elo_v2_ha20_k20_global',
  p_home_advantage  numeric DEFAULT 20.0,
  p_k_factor        numeric DEFAULT 20.0,
  p_decay_mode      text    DEFAULT 'none',
  p_era_mode        text    DEFAULT 'global',
  p_covid_ha        numeric DEFAULT 5.0
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
  v_comp              record;
  v_match             record;
  v_season_order      integer;
  v_prev_season       text;
  v_elo_home          numeric;
  v_elo_away          numeric;
  v_ha                numeric;
  v_k                 numeric;
  v_decay_factor      numeric;
  v_expected_home     numeric;
  v_expected_away     numeric;
  v_actual_home       numeric;
  v_actual_away       numeric;
  v_gdm               numeric;
  v_delta_home        numeric;
  v_delta_away        numeric;
  v_base_rating       constant numeric := 1500.0;
  v_carryover         constant numeric := 0.75;
  v_match_count       integer;
BEGIN

  FOR v_comp IN
    SELECT DISTINCT competition_id, competition_name
    FROM model_lab.v_calibration_safe_matches
    ORDER BY competition_name
  LOOP

    -- Temp ELO state: team_id -> current_elo, season_label
    CREATE TEMP TABLE IF NOT EXISTS _elo_state_v2 (
      team_id      uuid    PRIMARY KEY,
      current_elo  numeric NOT NULL DEFAULT 1500.0,
      season_label text
    ) ON COMMIT PRESERVE ROWS;

    TRUNCATE _elo_state_v2;

    v_prev_season  := NULL;
    v_season_order := 0;
    v_match_count  := 0;

    FOR v_match IN
      SELECT
        csm.match_id,
        csm.competition_id,
        csm.competition_name,
        csm.season_label,
        csm.kickoff_utc::date     AS match_date,
        csm.kickoff_utc,
        csm.home_team_id,
        csm.away_team_id,
        csm.home_team_name,
        csm.away_team_name,
        csm.home_score_ft,
        csm.away_score_ft,
        csm.result_1x2
      FROM model_lab.v_calibration_safe_matches csm
      WHERE csm.competition_id = v_comp.competition_id
      ORDER BY csm.kickoff_utc ASC, csm.competition_name ASC, csm.match_id ASC
    LOOP

      -- Season boundary: carryover + track season order for decay
      IF v_match.season_label IS DISTINCT FROM v_prev_season THEN
        v_season_order := v_season_order + 1;

        -- Apply carryover to all teams in this competition
        UPDATE _elo_state_v2
        SET current_elo  = v_base_rating + (current_elo - v_base_rating) * v_carryover,
            season_label = v_match.season_label
        WHERE season_label IS NOT NULL
          AND season_label <> v_match.season_label;

        v_prev_season := v_match.season_label;
      END IF;

      -- Initialise teams on first appearance
      INSERT INTO _elo_state_v2 (team_id, current_elo, season_label)
      VALUES (v_match.home_team_id, v_base_rating, v_match.season_label)
      ON CONFLICT DO NOTHING;

      INSERT INTO _elo_state_v2 (team_id, current_elo, season_label)
      VALUES (v_match.away_team_id, v_base_rating, v_match.season_label)
      ON CONFLICT DO NOTHING;

      -- Read pre-match ELOs
      SELECT current_elo INTO v_elo_home
      FROM _elo_state_v2 WHERE team_id = v_match.home_team_id;

      SELECT current_elo INTO v_elo_away
      FROM _elo_state_v2 WHERE team_id = v_match.away_team_id;

      -- Determine effective HA (COVID-aware mode)
      v_ha := p_home_advantage;
      IF p_era_mode = 'covid_aware' THEN
        IF v_match.season_label LIKE '2020-%'
           OR (v_match.season_label LIKE '2019-%' AND v_match.match_date >= '2020-03-01'::date)
        THEN
          v_ha := p_covid_ha;
        END IF;
      END IF;

      -- Expected score with HA
      v_expected_home := 1.0 / (1.0 + POWER(10.0, (v_elo_away - (v_elo_home + v_ha)) / 400.0));
      v_expected_away := 1.0 - v_expected_home;

      -- Actual scores
      v_actual_home := CASE v_match.result_1x2 WHEN 'H' THEN 1.0 WHEN 'D' THEN 0.5 ELSE 0.0 END;
      v_actual_away := 1.0 - v_actual_home;

      -- Goal difference multiplier
      v_gdm := CASE ABS(v_match.home_score_ft - v_match.away_score_ft)
        WHEN 0 THEN 1.00
        WHEN 1 THEN 1.00
        WHEN 2 THEN 1.25
        WHEN 3 THEN 1.50
        ELSE        1.75
      END;

      -- K-factor with optional decay
      v_k := p_k_factor;
      IF p_decay_mode = 'linear_decay' THEN
        -- Full K for first 3 seasons, then 95% per additional season
        v_k := p_k_factor * GREATEST(0.5, 1.0 - GREATEST(0, v_season_order - 3) * 0.05);
      ELSIF p_decay_mode = 'exponential_decay' THEN
        -- K * 0.97^(season_order-1): decays by 3% per season from start
        v_k := p_k_factor * POWER(0.97, v_season_order - 1);
      END IF;

      v_delta_home := v_k * v_gdm * (v_actual_home - v_expected_home);
      v_delta_away := v_k * v_gdm * (v_actual_away - v_expected_away);

      -- Write snapshot (immutable; ignore if version already exists for this match)
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
        v_ha, v_k, v_gdm,
        p_elo_version
      )
      ON CONFLICT (match_id, elo_version) DO NOTHING;

      -- Update in-memory state
      UPDATE _elo_state_v2
      SET current_elo = v_elo_home + v_delta_home
      WHERE team_id = v_match.home_team_id;

      UPDATE _elo_state_v2
      SET current_elo = v_elo_away + v_delta_away
      WHERE team_id = v_match.away_team_id;

      v_match_count := v_match_count + 1;

    END LOOP;

    DROP TABLE IF EXISTS _elo_state_v2;

    RETURN QUERY
      SELECT
        v_comp.competition_name,
        v_match_count,
        (SELECT COUNT(DISTINCT team_id)::integer FROM model_lab.team_elo_snapshots
         WHERE elo_version = p_elo_version AND competition_id = v_comp.competition_id),
        (SELECT ROUND(AVG(
           (pre_match_elo_home + pre_match_elo_away) / 2.0
         )::numeric, 2)
         FROM model_lab.team_elo_snapshots
         WHERE elo_version = p_elo_version AND competition_id = v_comp.competition_id);

  END LOOP;

  DROP TABLE IF EXISTS _elo_state_v2;

END;
$$;
