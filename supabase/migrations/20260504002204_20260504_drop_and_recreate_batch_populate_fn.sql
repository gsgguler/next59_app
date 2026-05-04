/*
  # Drop and recreate ml_populate_feature_snapshot_batch_v1
  Output column names changed (o_batch_key etc.) to resolve PL/pgSQL ambiguity.
  Must drop first since return type changed.
*/

DROP FUNCTION IF EXISTS model_lab.ml_populate_feature_snapshot_batch_v1(text,date,date);

CREATE FUNCTION model_lab.ml_populate_feature_snapshot_batch_v1(
  p_batch_key text,
  p_date_from date,
  p_date_to   date
)
RETURNS TABLE (
  o_batch_key   text,
  o_date_from   date,
  o_date_to     date,
  rows_inserted integer,
  duration_ms   numeric,
  status        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_start       timestamptz := clock_timestamp();
  v_inserted    integer     := 0;
  v_duration_ms numeric;
  v_err         text;
BEGIN
  INSERT INTO model_lab.feature_snapshot_batch_runs
    (batch_key, date_from, date_to, status, started_at)
  VALUES
    (p_batch_key, p_date_from, p_date_to, 'running', v_start)
  ON CONFLICT (batch_key) DO UPDATE
    SET status        = 'running',
        started_at    = EXCLUDED.started_at,
        error_message = NULL;

  BEGIN
    INSERT INTO model_lab.prematch_feature_matrix_snapshot_v1 (
      match_id, competition_id, competition_name, season_id, season_label,
      match_date, home_team_id, away_team_id,
      actual_result_1x2, actual_home_goals, actual_away_goals,
      data_quality_tier, has_stats, has_events, has_lineups, has_player_features,
      split_label, leakage_check_passed,
      home_matches_played_l5, home_matches_played_l10, home_matches_played_l20,
      home_form_l5, home_form_l10, home_form_l20,
      home_win_rate_l5, home_draw_rate_l5, home_loss_rate_l5,
      home_win_rate_l10, home_draw_rate_l10, home_loss_rate_l10,
      home_win_rate_l20,
      home_goals_for_avg_l5, home_goals_against_avg_l5, home_goal_diff_avg_l5,
      home_goals_for_avg_l10, home_goals_against_avg_l10, home_goal_diff_avg_l10,
      home_goals_for_avg_l20, home_goals_against_avg_l20,
      home_shots_avg_l5, home_shots_on_goal_avg_l5, home_shots_insidebox_avg_l5,
      home_corners_avg_l5, home_fouls_avg_l5, home_yellow_cards_avg_l5,
      home_possession_avg_l5, home_pass_accuracy_avg_l5,
      home_shots_avg_l10, home_shots_on_goal_avg_l10, home_gk_saves_avg_l10,
      home_attack_index_l5, home_defense_resistance_l5,
      home_xg_lite_l5, home_xg_lite_l10, home_has_stats_features,
      away_matches_played_l5, away_matches_played_l10, away_matches_played_l20,
      away_form_l5, away_form_l10, away_form_l20,
      away_win_rate_l5, away_draw_rate_l5, away_loss_rate_l5,
      away_win_rate_l10, away_draw_rate_l10, away_loss_rate_l10,
      away_win_rate_l20,
      away_goals_for_avg_l5, away_goals_against_avg_l5, away_goal_diff_avg_l5,
      away_goals_for_avg_l10, away_goals_against_avg_l10, away_goal_diff_avg_l10,
      away_goals_for_avg_l20, away_goals_against_avg_l20,
      away_shots_avg_l5, away_shots_on_goal_avg_l5, away_shots_insidebox_avg_l5,
      away_corners_avg_l5, away_fouls_avg_l5, away_yellow_cards_avg_l5,
      away_possession_avg_l5, away_pass_accuracy_avg_l5,
      away_shots_avg_l10, away_shots_on_goal_avg_l10, away_gk_saves_avg_l10,
      away_attack_index_l5, away_defense_resistance_l5,
      away_xg_lite_l5, away_xg_lite_l10, away_has_stats_features,
      diff_form_l5, diff_form_l10,
      diff_goals_for_l5, diff_goals_against_l5,
      diff_attack_index_l5, diff_defense_resistance_l5,
      diff_xg_lite_l5, diff_win_rate_l10, diff_goal_diff_l10,
      snapshot_run_key
    )
    SELECT
      u.match_id, u.competition_id, u.competition_name, u.season_id, u.season_label,
      u.match_date, u.home_team_id, u.away_team_id,
      u.actual_result_1x2, u.actual_home_goals, u.actual_away_goals,
      u.data_quality_tier, u.has_stats, false, u.has_lineups, false,
      CASE
        WHEN u.match_date < '2024-07-01' THEN 'train'
        WHEN u.match_date < '2025-01-01' THEN 'validate'
        ELSE 'holdout'
      END,
      (COALESCE(h.home_matches_played_l20, 0) >= 5 AND COALESCE(a.away_matches_played_l20, 0) >= 5),
      h.home_matches_played_l5, h.home_matches_played_l10, h.home_matches_played_l20,
      h.home_form_l5, h.home_form_l10, h.home_form_l20,
      h.home_win_rate_l5, h.home_draw_rate_l5, h.home_loss_rate_l5,
      h.home_win_rate_l10, h.home_draw_rate_l10, h.home_loss_rate_l10,
      h.home_win_rate_l20,
      h.home_goals_for_avg_l5, h.home_goals_against_avg_l5, h.home_goal_diff_avg_l5,
      h.home_goals_for_avg_l10, h.home_goals_against_avg_l10, h.home_goal_diff_avg_l10,
      h.home_goals_for_avg_l20, h.home_goals_against_avg_l20,
      h.home_shots_avg_l5, h.home_shots_on_goal_avg_l5, h.home_shots_insidebox_avg_l5,
      h.home_corners_avg_l5, h.home_fouls_avg_l5, h.home_yellow_cards_avg_l5,
      h.home_possession_avg_l5, h.home_pass_accuracy_avg_l5,
      h.home_shots_avg_l10, h.home_shots_on_goal_avg_l10, h.home_gk_saves_avg_l10,
      h.home_attack_index_l5, h.home_defense_resistance_l5,
      h.home_xg_lite_l5, h.home_xg_lite_l10, h.home_has_stats_features,
      a.away_matches_played_l5, a.away_matches_played_l10, a.away_matches_played_l20,
      a.away_form_l5, a.away_form_l10, a.away_form_l20,
      a.away_win_rate_l5, a.away_draw_rate_l5, a.away_loss_rate_l5,
      a.away_win_rate_l10, a.away_draw_rate_l10, a.away_loss_rate_l10,
      a.away_win_rate_l20,
      a.away_goals_for_avg_l5, a.away_goals_against_avg_l5, a.away_goal_diff_avg_l5,
      a.away_goals_for_avg_l10, a.away_goals_against_avg_l10, a.away_goal_diff_avg_l10,
      a.away_goals_for_avg_l20, a.away_goals_against_avg_l20,
      a.away_shots_avg_l5, a.away_shots_on_goal_avg_l5, a.away_shots_insidebox_avg_l5,
      a.away_corners_avg_l5, a.away_fouls_avg_l5, a.away_yellow_cards_avg_l5,
      a.away_possession_avg_l5, a.away_pass_accuracy_avg_l5,
      a.away_shots_avg_l10, a.away_shots_on_goal_avg_l10, a.away_gk_saves_avg_l10,
      a.away_attack_index_l5, a.away_defense_resistance_l5,
      a.away_xg_lite_l5, a.away_xg_lite_l10, a.away_has_stats_features,
      COALESCE(h.home_form_l5,0)              - COALESCE(a.away_form_l5,0),
      COALESCE(h.home_form_l10,0)             - COALESCE(a.away_form_l10,0),
      COALESCE(h.home_goals_for_avg_l5,0)     - COALESCE(a.away_goals_for_avg_l5,0),
      COALESCE(h.home_goals_against_avg_l5,0) - COALESCE(a.away_goals_against_avg_l5,0),
      COALESCE(h.home_attack_index_l5,0)      - COALESCE(a.away_attack_index_l5,0),
      COALESCE(h.home_defense_resistance_l5,0)- COALESCE(a.away_defense_resistance_l5,0),
      COALESCE(h.home_xg_lite_l5,0)           - COALESCE(a.away_xg_lite_l5,0),
      COALESCE(h.home_win_rate_l10,0)          - COALESCE(a.away_win_rate_l10,0),
      COALESCE(h.home_goal_diff_avg_l10,0)     - COALESCE(a.away_goal_diff_avg_l10,0),
      'prematch_feature_matrix_snapshot_v1'

    FROM model_lab.v_calibration_match_universe u

    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)                                                                        AS home_matches_played_l5,
        SUM(CASE WHEN rn<=10 THEN 1 ELSE 0 END)                                        AS home_matches_played_l10,
        COUNT(*)                                                                        AS home_matches_played_l20,
        ROUND(AVG(CASE WHEN rn<=5  THEN pts END)::numeric,4)                           AS home_form_l5,
        ROUND(AVG(CASE WHEN rn<=10 THEN pts END)::numeric,4)                           AS home_form_l10,
        ROUND(AVG(pts)::numeric,4)                                                      AS home_form_l20,
        ROUND(AVG(CASE WHEN rn<=5  AND pts=3 THEN 1.0 WHEN rn<=5  THEN 0.0 END)::numeric,4) AS home_win_rate_l5,
        ROUND(AVG(CASE WHEN rn<=5  AND pts=1 THEN 1.0 WHEN rn<=5  THEN 0.0 END)::numeric,4) AS home_draw_rate_l5,
        ROUND(AVG(CASE WHEN rn<=5  AND pts=0 THEN 1.0 WHEN rn<=5  THEN 0.0 END)::numeric,4) AS home_loss_rate_l5,
        ROUND(AVG(CASE WHEN rn<=10 AND pts=3 THEN 1.0 WHEN rn<=10 THEN 0.0 END)::numeric,4) AS home_win_rate_l10,
        ROUND(AVG(CASE WHEN rn<=10 AND pts=1 THEN 1.0 WHEN rn<=10 THEN 0.0 END)::numeric,4) AS home_draw_rate_l10,
        ROUND(AVG(CASE WHEN rn<=10 AND pts=0 THEN 1.0 WHEN rn<=10 THEN 0.0 END)::numeric,4) AS home_loss_rate_l10,
        ROUND(AVG(CASE WHEN pts=3 THEN 1.0 ELSE 0.0 END)::numeric,4)                   AS home_win_rate_l20,
        ROUND(AVG(CASE WHEN rn<=5  THEN gf    END)::numeric,4)                         AS home_goals_for_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN ga    END)::numeric,4)                         AS home_goals_against_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN gf-ga END)::numeric,4)                         AS home_goal_diff_avg_l5,
        ROUND(AVG(CASE WHEN rn<=10 THEN gf    END)::numeric,4)                         AS home_goals_for_avg_l10,
        ROUND(AVG(CASE WHEN rn<=10 THEN ga    END)::numeric,4)                         AS home_goals_against_avg_l10,
        ROUND(AVG(CASE WHEN rn<=10 THEN gf-ga END)::numeric,4)                         AS home_goal_diff_avg_l10,
        ROUND(AVG(gf)::numeric,4)                                                       AS home_goals_for_avg_l20,
        ROUND(AVG(ga)::numeric,4)                                                       AS home_goals_against_avg_l20,
        ROUND(AVG(CASE WHEN rn<=5  THEN shots    END)::numeric,4)                      AS home_shots_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN shots_og END)::numeric,4)                      AS home_shots_on_goal_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN shots_ib END)::numeric,4)                      AS home_shots_insidebox_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN corners  END)::numeric,4)                      AS home_corners_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN fouls    END)::numeric,4)                      AS home_fouls_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN yellows  END)::numeric,4)                      AS home_yellow_cards_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN poss     END)::numeric,4)                      AS home_possession_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN pass_pct END)::numeric,4)                      AS home_pass_accuracy_avg_l5,
        ROUND(AVG(CASE WHEN rn<=10 THEN shots    END)::numeric,4)                      AS home_shots_avg_l10,
        ROUND(AVG(CASE WHEN rn<=10 THEN shots_og END)::numeric,4)                      AS home_shots_on_goal_avg_l10,
        ROUND(AVG(CASE WHEN rn<=10 THEN gk_saves END)::numeric,4)                      AS home_gk_saves_avg_l10,
        ROUND(AVG(CASE WHEN rn<=5  THEN attack_idx END)::numeric,4)                    AS home_attack_index_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN def_res    END)::numeric,4)                    AS home_defense_resistance_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN xg_lite    END)::numeric,4)                    AS home_xg_lite_l5,
        ROUND(AVG(CASE WHEN rn<=10 THEN xg_lite    END)::numeric,4)                    AS home_xg_lite_l10,
        BOOL_OR(has_stats AND rn<=5)                                                    AS home_has_stats_features
      FROM (
        SELECT
          ROW_NUMBER() OVER (ORDER BY pm.match_date DESC, pm.id DESC)  AS rn,
          CASE WHEN pm.home_team_id=u.home_team_id
            THEN CASE WHEN pm.result='H' THEN 3 WHEN pm.result='D' THEN 1 ELSE 0 END
            ELSE CASE WHEN pm.result='A' THEN 3 WHEN pm.result='D' THEN 1 ELSE 0 END
          END::numeric AS pts,
          CASE WHEN pm.home_team_id=u.home_team_id THEN pm.home_score_ft ELSE pm.away_score_ft END::numeric AS gf,
          CASE WHEN pm.home_team_id=u.home_team_id THEN pm.away_score_ft ELSE pm.home_score_ft END::numeric AS ga,
          COALESCE(ms.total_shots,0)::numeric       AS shots,
          COALESCE(ms.shots_on_goal,0)::numeric     AS shots_og,
          COALESCE(ms.shots_insidebox,0)::numeric   AS shots_ib,
          COALESCE(ms.corner_kicks,0)::numeric      AS corners,
          COALESCE(ms.fouls,0)::numeric             AS fouls,
          COALESCE(ms.yellow_cards,0)::numeric      AS yellows,
          COALESCE(ms.ball_possession,0)::numeric   AS poss,
          COALESCE(ms.passes_percentage,0)::numeric AS pass_pct,
          COALESCE(ms.goalkeeper_saves,0)::numeric  AS gk_saves,
          CASE WHEN ms.id IS NOT NULL THEN ROUND(((COALESCE(ms.shots_on_goal,0)*2.0+COALESCE(ms.shots_insidebox,0))/30.0)::numeric,4) ELSE NULL END AS attack_idx,
          GREATEST(0,LEAST(1, CASE WHEN pm.home_team_id=u.home_team_id THEN 1.0-COALESCE(pm.away_score_ft,0)::numeric/3.0 ELSE 1.0-COALESCE(pm.home_score_ft,0)::numeric/3.0 END)) AS def_res,
          CASE WHEN ms.id IS NOT NULL THEN GREATEST(0,LEAST(1,COALESCE(ms.shots_insidebox,0)::numeric/8.0)) ELSE NULL END AS xg_lite,
          (ms.id IS NOT NULL) AS has_stats
        FROM public.matches pm
        LEFT JOIN public.match_stats ms ON ms.match_id=pm.id AND ms.team_id=u.home_team_id AND ms.half='FT'
        WHERE (pm.home_team_id=u.home_team_id OR pm.away_team_id=u.home_team_id)
          AND pm.match_date < u.match_date AND pm.id <> u.match_id
          AND pm.result IS NOT NULL AND pm.home_score_ft IS NOT NULL
        ORDER BY pm.match_date DESC, pm.id DESC LIMIT 20
      ) sub_h
    ) h

    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)                                                                        AS away_matches_played_l5,
        SUM(CASE WHEN rn<=10 THEN 1 ELSE 0 END)                                        AS away_matches_played_l10,
        COUNT(*)                                                                        AS away_matches_played_l20,
        ROUND(AVG(CASE WHEN rn<=5  THEN pts END)::numeric,4)                           AS away_form_l5,
        ROUND(AVG(CASE WHEN rn<=10 THEN pts END)::numeric,4)                           AS away_form_l10,
        ROUND(AVG(pts)::numeric,4)                                                      AS away_form_l20,
        ROUND(AVG(CASE WHEN rn<=5  AND pts=3 THEN 1.0 WHEN rn<=5  THEN 0.0 END)::numeric,4) AS away_win_rate_l5,
        ROUND(AVG(CASE WHEN rn<=5  AND pts=1 THEN 1.0 WHEN rn<=5  THEN 0.0 END)::numeric,4) AS away_draw_rate_l5,
        ROUND(AVG(CASE WHEN rn<=5  AND pts=0 THEN 1.0 WHEN rn<=5  THEN 0.0 END)::numeric,4) AS away_loss_rate_l5,
        ROUND(AVG(CASE WHEN rn<=10 AND pts=3 THEN 1.0 WHEN rn<=10 THEN 0.0 END)::numeric,4) AS away_win_rate_l10,
        ROUND(AVG(CASE WHEN rn<=10 AND pts=1 THEN 1.0 WHEN rn<=10 THEN 0.0 END)::numeric,4) AS away_draw_rate_l10,
        ROUND(AVG(CASE WHEN rn<=10 AND pts=0 THEN 1.0 WHEN rn<=10 THEN 0.0 END)::numeric,4) AS away_loss_rate_l10,
        ROUND(AVG(CASE WHEN pts=3 THEN 1.0 ELSE 0.0 END)::numeric,4)                   AS away_win_rate_l20,
        ROUND(AVG(CASE WHEN rn<=5  THEN gf    END)::numeric,4)                         AS away_goals_for_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN ga    END)::numeric,4)                         AS away_goals_against_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN gf-ga END)::numeric,4)                         AS away_goal_diff_avg_l5,
        ROUND(AVG(CASE WHEN rn<=10 THEN gf    END)::numeric,4)                         AS away_goals_for_avg_l10,
        ROUND(AVG(CASE WHEN rn<=10 THEN ga    END)::numeric,4)                         AS away_goals_against_avg_l10,
        ROUND(AVG(CASE WHEN rn<=10 THEN gf-ga END)::numeric,4)                         AS away_goal_diff_avg_l10,
        ROUND(AVG(gf)::numeric,4)                                                       AS away_goals_for_avg_l20,
        ROUND(AVG(ga)::numeric,4)                                                       AS away_goals_against_avg_l20,
        ROUND(AVG(CASE WHEN rn<=5  THEN shots    END)::numeric,4)                      AS away_shots_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN shots_og END)::numeric,4)                      AS away_shots_on_goal_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN shots_ib END)::numeric,4)                      AS away_shots_insidebox_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN corners  END)::numeric,4)                      AS away_corners_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN fouls    END)::numeric,4)                      AS away_fouls_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN yellows  END)::numeric,4)                      AS away_yellow_cards_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN poss     END)::numeric,4)                      AS away_possession_avg_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN pass_pct END)::numeric,4)                      AS away_pass_accuracy_avg_l5,
        ROUND(AVG(CASE WHEN rn<=10 THEN shots    END)::numeric,4)                      AS away_shots_avg_l10,
        ROUND(AVG(CASE WHEN rn<=10 THEN shots_og END)::numeric,4)                      AS away_shots_on_goal_avg_l10,
        ROUND(AVG(CASE WHEN rn<=10 THEN gk_saves END)::numeric,4)                      AS away_gk_saves_avg_l10,
        ROUND(AVG(CASE WHEN rn<=5  THEN attack_idx END)::numeric,4)                    AS away_attack_index_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN def_res    END)::numeric,4)                    AS away_defense_resistance_l5,
        ROUND(AVG(CASE WHEN rn<=5  THEN xg_lite    END)::numeric,4)                    AS away_xg_lite_l5,
        ROUND(AVG(CASE WHEN rn<=10 THEN xg_lite    END)::numeric,4)                    AS away_xg_lite_l10,
        BOOL_OR(has_stats AND rn<=5)                                                    AS away_has_stats_features
      FROM (
        SELECT
          ROW_NUMBER() OVER (ORDER BY pm.match_date DESC, pm.id DESC)  AS rn,
          CASE WHEN pm.away_team_id=u.away_team_id
            THEN CASE WHEN pm.result='A' THEN 3 WHEN pm.result='D' THEN 1 ELSE 0 END
            ELSE CASE WHEN pm.result='H' THEN 3 WHEN pm.result='D' THEN 1 ELSE 0 END
          END::numeric AS pts,
          CASE WHEN pm.away_team_id=u.away_team_id THEN pm.away_score_ft ELSE pm.home_score_ft END::numeric AS gf,
          CASE WHEN pm.away_team_id=u.away_team_id THEN pm.home_score_ft ELSE pm.away_score_ft END::numeric AS ga,
          COALESCE(ms.total_shots,0)::numeric       AS shots,
          COALESCE(ms.shots_on_goal,0)::numeric     AS shots_og,
          COALESCE(ms.shots_insidebox,0)::numeric   AS shots_ib,
          COALESCE(ms.corner_kicks,0)::numeric      AS corners,
          COALESCE(ms.fouls,0)::numeric             AS fouls,
          COALESCE(ms.yellow_cards,0)::numeric      AS yellows,
          COALESCE(ms.ball_possession,0)::numeric   AS poss,
          COALESCE(ms.passes_percentage,0)::numeric AS pass_pct,
          COALESCE(ms.goalkeeper_saves,0)::numeric  AS gk_saves,
          CASE WHEN ms.id IS NOT NULL THEN ROUND(((COALESCE(ms.shots_on_goal,0)*2.0+COALESCE(ms.shots_insidebox,0))/30.0)::numeric,4) ELSE NULL END AS attack_idx,
          GREATEST(0,LEAST(1, CASE WHEN pm.away_team_id=u.away_team_id THEN 1.0-COALESCE(pm.home_score_ft,0)::numeric/3.0 ELSE 1.0-COALESCE(pm.away_score_ft,0)::numeric/3.0 END)) AS def_res,
          CASE WHEN ms.id IS NOT NULL THEN GREATEST(0,LEAST(1,COALESCE(ms.shots_insidebox,0)::numeric/8.0)) ELSE NULL END AS xg_lite,
          (ms.id IS NOT NULL) AS has_stats
        FROM public.matches pm
        LEFT JOIN public.match_stats ms ON ms.match_id=pm.id AND ms.team_id=u.away_team_id AND ms.half='FT'
        WHERE (pm.home_team_id=u.away_team_id OR pm.away_team_id=u.away_team_id)
          AND pm.match_date < u.match_date AND pm.id <> u.match_id
          AND pm.result IS NOT NULL AND pm.home_score_ft IS NOT NULL
        ORDER BY pm.match_date DESC, pm.id DESC LIMIT 20
      ) sub_a
    ) a

    WHERE u.match_date >= p_date_from
      AND u.match_date < p_date_to

    ON CONFLICT (match_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_duration_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000);

    UPDATE model_lab.feature_snapshot_batch_runs
    SET status        = 'completed',
        rows_inserted = v_inserted,
        completed_at  = clock_timestamp()
    WHERE feature_snapshot_batch_runs.batch_key = p_batch_key;

  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_duration_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000);
    UPDATE model_lab.feature_snapshot_batch_runs
    SET status        = 'error',
        error_message = v_err,
        completed_at  = clock_timestamp()
    WHERE feature_snapshot_batch_runs.batch_key = p_batch_key;
    RAISE;
  END;

  RETURN QUERY SELECT p_batch_key, p_date_from, p_date_to, v_inserted, v_duration_ms, 'completed'::text;
END;
$$;
