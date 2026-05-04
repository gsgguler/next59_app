/*
  # Calibration Snapshot Batched Populate Redesign

  ## Context
  ml_populate_feature_snapshot_rolling_v1() exceeded HTTP gateway timeout (4m+),
  causing a lock cascade on prematch_feature_matrix_snapshot_v1. This migration
  replaces it with a safe, bounded batch approach.

  ## Changes

  ### 1. model_lab.feature_snapshot_batch_runs (new table)
  Tracks progress of each batch slice so the caller can resume after any failure.
  Unique on batch_key prevents double-inserts.

  ### 2. model_lab.ml_populate_feature_snapshot_batch_v1(batch_key, date_from, date_to)
  Inserts rows for matches in [date_from, date_to) using only:
  - model_lab.v_calibration_match_universe  (identity + target columns)
  - LATERAL indexed subqueries against public.matches + public.match_stats (rolling form/stats)
  Does NOT touch: v_prematch_feature_matrix_v1, v_team_pre_match_event_features,
  v_team_pre_match_player_features.
  Event/player columns are set to NULL; has_events=false, has_player_features=false.
  Idempotent via ON CONFLICT(match_id) DO NOTHING.
  Records timing in feature_snapshot_batch_runs.

  ### 3. model_lab.ml_reset_feature_snapshot_v1()
  Safe TRUNCATE of snapshot + batch_runs tables. Returns before/after counts.

  ## Security
  - RLS not required: model_lab schema is service-role only, no anon access.

  ## Important Notes
  1. ml_populate_feature_snapshot_rolling_v1() is superseded — do not call it.
  2. Recommended batch size: monthly slices (~500–2000 rows each, <20s).
  3. split_label assigned per calibration convention:
     train    = match_date < 2024-07-01
     validate = match_date >= 2024-07-01 and < 2025-01-01
     holdout  = match_date >= 2025-01-01
  4. leakage_check_passed = true only when both teams have >= 5 prior completed matches.
*/

-- ─── 1. Batch control table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS model_lab.feature_snapshot_batch_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_key       text        NOT NULL,
  date_from       date,
  date_to         date,
  split_label     text,
  status          text        NOT NULL DEFAULT 'pending',
  rows_inserted   integer     NOT NULL DEFAULT 0,
  started_at      timestamptz,
  completed_at    timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_snapshot_batch_runs_batch_key_key UNIQUE (batch_key)
);

-- ─── 2. Batch populate function ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION model_lab.ml_populate_feature_snapshot_batch_v1(
  p_batch_key text,
  p_date_from date,
  p_date_to   date
)
RETURNS TABLE (
  batch_key     text,
  date_from     date,
  date_to       date,
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
  -- Upsert batch run record as started
  INSERT INTO model_lab.feature_snapshot_batch_runs
    (batch_key, date_from, date_to, status, started_at)
  VALUES
    (p_batch_key, p_date_from, p_date_to, 'running', v_start)
  ON CONFLICT (batch_key) DO UPDATE
    SET status     = 'running',
        started_at = v_start,
        error_message = NULL;

  BEGIN
    INSERT INTO model_lab.prematch_feature_matrix_snapshot_v1 (
      -- identity
      match_id, competition_id, competition_name, season_id, season_label,
      match_date, home_team_id, away_team_id,
      -- target
      actual_result_1x2, actual_home_goals, actual_away_goals,
      -- quality flags
      data_quality_tier, has_stats, has_events, has_lineups, has_player_features,
      -- split
      split_label,
      -- leakage
      leakage_check_passed,
      -- home rolling form (results)
      home_matches_played_l5, home_matches_played_l10, home_matches_played_l20,
      home_form_l5, home_form_l10, home_form_l20,
      home_win_rate_l5, home_draw_rate_l5, home_loss_rate_l5,
      home_win_rate_l10, home_draw_rate_l10, home_loss_rate_l10,
      home_win_rate_l20,
      home_goals_for_avg_l5, home_goals_against_avg_l5, home_goal_diff_avg_l5,
      home_goals_for_avg_l10, home_goals_against_avg_l10, home_goal_diff_avg_l10,
      home_goals_for_avg_l20, home_goals_against_avg_l20,
      -- home rolling stats (l5)
      home_shots_avg_l5, home_shots_on_goal_avg_l5, home_shots_insidebox_avg_l5,
      home_corners_avg_l5, home_fouls_avg_l5, home_yellow_cards_avg_l5,
      home_possession_avg_l5, home_pass_accuracy_avg_l5,
      home_shots_avg_l10, home_shots_on_goal_avg_l10, home_gk_saves_avg_l10,
      home_attack_index_l5, home_defense_resistance_l5,
      home_xg_lite_l5, home_xg_lite_l10,
      home_has_stats_features,
      -- away rolling form (results)
      away_matches_played_l5, away_matches_played_l10, away_matches_played_l20,
      away_form_l5, away_form_l10, away_form_l20,
      away_win_rate_l5, away_draw_rate_l5, away_loss_rate_l5,
      away_win_rate_l10, away_draw_rate_l10, away_loss_rate_l10,
      away_win_rate_l20,
      away_goals_for_avg_l5, away_goals_against_avg_l5, away_goal_diff_avg_l5,
      away_goals_for_avg_l10, away_goals_against_avg_l10, away_goal_diff_avg_l10,
      away_goals_for_avg_l20, away_goals_against_avg_l20,
      -- away rolling stats (l5)
      away_shots_avg_l5, away_shots_on_goal_avg_l5, away_shots_insidebox_avg_l5,
      away_corners_avg_l5, away_fouls_avg_l5, away_yellow_cards_avg_l5,
      away_possession_avg_l5, away_pass_accuracy_avg_l5,
      away_shots_avg_l10, away_shots_on_goal_avg_l10, away_gk_saves_avg_l10,
      away_attack_index_l5, away_defense_resistance_l5,
      away_xg_lite_l5, away_xg_lite_l10,
      away_has_stats_features,
      -- diff features
      diff_form_l5, diff_form_l10,
      diff_goals_for_l5, diff_goals_against_l5,
      diff_attack_index_l5, diff_defense_resistance_l5,
      diff_xg_lite_l5, diff_win_rate_l10, diff_goal_diff_l10,
      -- event/player features: NULL for now
      snapshot_run_key
    )
    SELECT
      u.match_id,
      u.competition_id,
      u.competition_name,
      u.season_id,
      u.season_label,
      u.match_date,
      u.home_team_id,
      u.away_team_id,
      u.actual_result_1x2,
      u.actual_home_goals,
      u.actual_away_goals,
      u.data_quality_tier,
      u.has_stats,
      false AS has_events,
      u.has_lineups,
      false AS has_player_features,
      CASE
        WHEN u.match_date < '2024-07-01'  THEN 'train'
        WHEN u.match_date < '2025-01-01'  THEN 'validate'
        ELSE 'holdout'
      END AS split_label,
      -- leakage: both teams need >= 5 prior matches
      (h.home_matches_played_l20 >= 5 AND a.away_matches_played_l20 >= 5) AS leakage_check_passed,
      -- home form
      h.home_matches_played_l5, h.home_matches_played_l10, h.home_matches_played_l20,
      h.home_form_l5, h.home_form_l10, h.home_form_l20,
      h.home_win_rate_l5, h.home_draw_rate_l5, h.home_loss_rate_l5,
      h.home_win_rate_l10, h.home_draw_rate_l10, h.home_loss_rate_l10,
      h.home_win_rate_l20,
      h.home_goals_for_avg_l5, h.home_goals_against_avg_l5, h.home_goal_diff_avg_l5,
      h.home_goals_for_avg_l10, h.home_goals_against_avg_l10, h.home_goal_diff_avg_l10,
      h.home_goals_for_avg_l20, h.home_goals_against_avg_l20,
      -- home stats
      h.home_shots_avg_l5, h.home_shots_on_goal_avg_l5, h.home_shots_insidebox_avg_l5,
      h.home_corners_avg_l5, h.home_fouls_avg_l5, h.home_yellow_cards_avg_l5,
      h.home_possession_avg_l5, h.home_pass_accuracy_avg_l5,
      h.home_shots_avg_l10, h.home_shots_on_goal_avg_l10, h.home_gk_saves_avg_l10,
      h.home_attack_index_l5, h.home_defense_resistance_l5,
      h.home_xg_lite_l5, h.home_xg_lite_l10,
      h.home_has_stats_features,
      -- away form
      a.away_matches_played_l5, a.away_matches_played_l10, a.away_matches_played_l20,
      a.away_form_l5, a.away_form_l10, a.away_form_l20,
      a.away_win_rate_l5, a.away_draw_rate_l5, a.away_loss_rate_l5,
      a.away_win_rate_l10, a.away_draw_rate_l10, a.away_loss_rate_l10,
      a.away_win_rate_l20,
      a.away_goals_for_avg_l5, a.away_goals_against_avg_l5, a.away_goal_diff_avg_l5,
      a.away_goals_for_avg_l10, a.away_goals_against_avg_l10, a.away_goal_diff_avg_l10,
      a.away_goals_for_avg_l20, a.away_goals_against_avg_l20,
      -- away stats
      a.away_shots_avg_l5, a.away_shots_on_goal_avg_l5, a.away_shots_insidebox_avg_l5,
      a.away_corners_avg_l5, a.away_fouls_avg_l5, a.away_yellow_cards_avg_l5,
      a.away_possession_avg_l5, a.away_pass_accuracy_avg_l5,
      a.away_shots_avg_l10, a.away_shots_on_goal_avg_l10, a.away_gk_saves_avg_l10,
      a.away_attack_index_l5, a.away_defense_resistance_l5,
      a.away_xg_lite_l5, a.away_xg_lite_l10,
      a.away_has_stats_features,
      -- diff
      h.home_form_l5  - a.away_form_l5  AS diff_form_l5,
      h.home_form_l10 - a.away_form_l10 AS diff_form_l10,
      h.home_goals_for_avg_l5  - a.away_goals_for_avg_l5  AS diff_goals_for_l5,
      h.home_goals_against_avg_l5 - a.away_goals_against_avg_l5 AS diff_goals_against_l5,
      h.home_attack_index_l5  - a.away_attack_index_l5  AS diff_attack_index_l5,
      h.home_defense_resistance_l5 - a.away_defense_resistance_l5 AS diff_defense_resistance_l5,
      h.home_xg_lite_l5 - a.away_xg_lite_l5 AS diff_xg_lite_l5,
      h.home_win_rate_l10 - a.away_win_rate_l10 AS diff_win_rate_l10,
      h.home_goal_diff_avg_l10 - a.away_goal_diff_avg_l10 AS diff_goal_diff_l10,
      'prematch_feature_matrix_snapshot_v1' AS snapshot_run_key

    FROM model_lab.v_calibration_match_universe u

    -- ── Home team rolling stats via indexed LATERAL ──────────────────────
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)                                                    AS home_matches_played_l5,
        SUM(CASE WHEN prev.n <= 10 THEN 1 ELSE 0 END)              AS home_matches_played_l10,
        COUNT(*)                                                    AS home_matches_played_l20,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.pts END)::numeric, 4) AS home_form_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.pts END)::numeric, 4) AS home_form_l10,
        ROUND(AVG(prev.pts)::numeric, 4)                            AS home_form_l20,
        ROUND(AVG(CASE WHEN prev.n <= 5 AND prev.pts = 3 THEN 1.0 ELSE CASE WHEN prev.n <= 5 THEN 0.0 END END)::numeric, 4) AS home_win_rate_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5 AND prev.pts = 1 THEN 1.0 ELSE CASE WHEN prev.n <= 5 THEN 0.0 END END)::numeric, 4) AS home_draw_rate_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5 AND prev.pts = 0 THEN 1.0 ELSE CASE WHEN prev.n <= 5 THEN 0.0 END END)::numeric, 4) AS home_loss_rate_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 AND prev.pts = 3 THEN 1.0 ELSE CASE WHEN prev.n <= 10 THEN 0.0 END END)::numeric, 4) AS home_win_rate_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 AND prev.pts = 1 THEN 1.0 ELSE CASE WHEN prev.n <= 10 THEN 0.0 END END)::numeric, 4) AS home_draw_rate_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 AND prev.pts = 0 THEN 1.0 ELSE CASE WHEN prev.n <= 10 THEN 0.0 END END)::numeric, 4) AS home_loss_rate_l10,
        ROUND(AVG(CASE WHEN prev.pts = 3 THEN 1.0 ELSE 0.0 END)::numeric, 4)  AS home_win_rate_l20,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.gf END)::numeric, 4) AS home_goals_for_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.ga END)::numeric, 4) AS home_goals_against_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.gf - prev.ga END)::numeric, 4) AS home_goal_diff_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.gf END)::numeric, 4) AS home_goals_for_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.ga END)::numeric, 4) AS home_goals_against_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.gf - prev.ga END)::numeric, 4) AS home_goal_diff_avg_l10,
        ROUND(AVG(prev.gf)::numeric, 4)  AS home_goals_for_avg_l20,
        ROUND(AVG(prev.ga)::numeric, 4)  AS home_goals_against_avg_l20,
        -- stats (l5 only from match_stats join)
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.shots     END)::numeric, 4) AS home_shots_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.shots_og  END)::numeric, 4) AS home_shots_on_goal_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.shots_ib  END)::numeric, 4) AS home_shots_insidebox_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.corners   END)::numeric, 4) AS home_corners_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.fouls     END)::numeric, 4) AS home_fouls_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.yellows   END)::numeric, 4) AS home_yellow_cards_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.poss      END)::numeric, 4) AS home_possession_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.pass_pct  END)::numeric, 4) AS home_pass_accuracy_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.shots     END)::numeric, 4) AS home_shots_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.shots_og  END)::numeric, 4) AS home_shots_on_goal_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.gk_saves  END)::numeric, 4) AS home_gk_saves_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.attack_idx END)::numeric, 4)  AS home_attack_index_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.def_res    END)::numeric, 4)  AS home_defense_resistance_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.xg_lite    END)::numeric, 4)  AS home_xg_lite_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.xg_lite    END)::numeric, 4)  AS home_xg_lite_l10,
        BOOL_OR(prev.has_stats AND prev.n <= 5)                                   AS home_has_stats_features
      FROM (
        SELECT
          ROW_NUMBER() OVER (ORDER BY pm.match_date DESC, pm.id DESC) AS n,
          CASE
            WHEN pm.home_team_id = u.home_team_id THEN
              CASE WHEN pm.result = 'H' THEN 3 WHEN pm.result = 'D' THEN 1 ELSE 0 END
            ELSE
              CASE WHEN pm.result = 'A' THEN 3 WHEN pm.result = 'D' THEN 1 ELSE 0 END
          END AS pts,
          CASE WHEN pm.home_team_id = u.home_team_id THEN pm.home_score_ft ELSE pm.away_score_ft END AS gf,
          CASE WHEN pm.home_team_id = u.home_team_id THEN pm.away_score_ft ELSE pm.home_score_ft END AS ga,
          COALESCE(ms.total_shots, 0)         AS shots,
          COALESCE(ms.shots_on_goal, 0)       AS shots_og,
          COALESCE(ms.shots_insidebox, 0)     AS shots_ib,
          COALESCE(ms.corner_kicks, 0)        AS corners,
          COALESCE(ms.fouls, 0)               AS fouls,
          COALESCE(ms.yellow_cards, 0)        AS yellows,
          COALESCE(ms.ball_possession, 0)     AS poss,
          COALESCE(ms.passes_percentage, 0)   AS pass_pct,
          COALESCE(ms.goalkeeper_saves, 0)    AS gk_saves,
          -- attack index: shots_on_goal * 2 + shots_insidebox normalised
          CASE WHEN ms.id IS NOT NULL
            THEN ROUND(((COALESCE(ms.shots_on_goal,0) * 2.0 + COALESCE(ms.shots_insidebox,0)) / 30.0)::numeric, 4)
            ELSE NULL END AS attack_idx,
          -- defense resistance: 1 - (ga / 3) clamped 0-1
          GREATEST(0, LEAST(1,
            CASE WHEN pm.home_team_id = u.home_team_id
              THEN 1.0 - (COALESCE(pm.away_score_ft,0)::numeric / 3.0)
              ELSE 1.0 - (COALESCE(pm.home_score_ft,0)::numeric / 3.0)
            END))::numeric AS def_res,
          -- xg_lite: shots_insidebox / 8 clamped 0-1
          CASE WHEN ms.id IS NOT NULL
            THEN GREATEST(0, LEAST(1, COALESCE(ms.shots_insidebox,0)::numeric / 8.0))
            ELSE NULL END AS xg_lite,
          (ms.id IS NOT NULL) AS has_stats
        FROM public.matches pm
        LEFT JOIN public.match_stats ms
          ON ms.match_id = pm.id
          AND ms.team_id = u.home_team_id
          AND ms.half = 'FT'
        WHERE
          (pm.home_team_id = u.home_team_id OR pm.away_team_id = u.home_team_id)
          AND pm.match_date < u.match_date
          AND pm.id <> u.match_id
          AND pm.result IS NOT NULL
          AND pm.home_score_ft IS NOT NULL
        ORDER BY pm.match_date DESC, pm.id DESC
        LIMIT 20
      ) prev
    ) h

    -- ── Away team rolling stats via indexed LATERAL ──────────────────────
    CROSS JOIN LATERAL (
      SELECT
        COUNT(*)                                                    AS away_matches_played_l5,
        SUM(CASE WHEN prev.n <= 10 THEN 1 ELSE 0 END)              AS away_matches_played_l10,
        COUNT(*)                                                    AS away_matches_played_l20,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.pts END)::numeric, 4) AS away_form_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.pts END)::numeric, 4) AS away_form_l10,
        ROUND(AVG(prev.pts)::numeric, 4)                            AS away_form_l20,
        ROUND(AVG(CASE WHEN prev.n <= 5 AND prev.pts = 3 THEN 1.0 ELSE CASE WHEN prev.n <= 5 THEN 0.0 END END)::numeric, 4) AS away_win_rate_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5 AND prev.pts = 1 THEN 1.0 ELSE CASE WHEN prev.n <= 5 THEN 0.0 END END)::numeric, 4) AS away_draw_rate_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5 AND prev.pts = 0 THEN 1.0 ELSE CASE WHEN prev.n <= 5 THEN 0.0 END END)::numeric, 4) AS away_loss_rate_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 AND prev.pts = 3 THEN 1.0 ELSE CASE WHEN prev.n <= 10 THEN 0.0 END END)::numeric, 4) AS away_win_rate_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 AND prev.pts = 1 THEN 1.0 ELSE CASE WHEN prev.n <= 10 THEN 0.0 END END)::numeric, 4) AS away_draw_rate_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 AND prev.pts = 0 THEN 1.0 ELSE CASE WHEN prev.n <= 10 THEN 0.0 END END)::numeric, 4) AS away_loss_rate_l10,
        ROUND(AVG(CASE WHEN prev.pts = 3 THEN 1.0 ELSE 0.0 END)::numeric, 4)  AS away_win_rate_l20,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.gf END)::numeric, 4) AS away_goals_for_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.ga END)::numeric, 4) AS away_goals_against_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.gf - prev.ga END)::numeric, 4) AS away_goal_diff_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.gf END)::numeric, 4) AS away_goals_for_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.ga END)::numeric, 4) AS away_goals_against_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.gf - prev.ga END)::numeric, 4) AS away_goal_diff_avg_l10,
        ROUND(AVG(prev.gf)::numeric, 4)  AS away_goals_for_avg_l20,
        ROUND(AVG(prev.ga)::numeric, 4)  AS away_goals_against_avg_l20,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.shots     END)::numeric, 4) AS away_shots_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.shots_og  END)::numeric, 4) AS away_shots_on_goal_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.shots_ib  END)::numeric, 4) AS away_shots_insidebox_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.corners   END)::numeric, 4) AS away_corners_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.fouls     END)::numeric, 4) AS away_fouls_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.yellows   END)::numeric, 4) AS away_yellow_cards_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.poss      END)::numeric, 4) AS away_possession_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.pass_pct  END)::numeric, 4) AS away_pass_accuracy_avg_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.shots     END)::numeric, 4) AS away_shots_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.shots_og  END)::numeric, 4) AS away_shots_on_goal_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.gk_saves  END)::numeric, 4) AS away_gk_saves_avg_l10,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.attack_idx END)::numeric, 4) AS away_attack_index_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.def_res    END)::numeric, 4) AS away_defense_resistance_l5,
        ROUND(AVG(CASE WHEN prev.n <= 5  THEN prev.xg_lite    END)::numeric, 4) AS away_xg_lite_l5,
        ROUND(AVG(CASE WHEN prev.n <= 10 THEN prev.xg_lite    END)::numeric, 4) AS away_xg_lite_l10,
        BOOL_OR(prev.has_stats AND prev.n <= 5)                                  AS away_has_stats_features
      FROM (
        SELECT
          ROW_NUMBER() OVER (ORDER BY pm.match_date DESC, pm.id DESC) AS n,
          CASE
            WHEN pm.away_team_id = u.away_team_id THEN
              CASE WHEN pm.result = 'A' THEN 3 WHEN pm.result = 'D' THEN 1 ELSE 0 END
            ELSE
              CASE WHEN pm.result = 'H' THEN 3 WHEN pm.result = 'D' THEN 1 ELSE 0 END
          END AS pts,
          CASE WHEN pm.away_team_id = u.away_team_id THEN pm.away_score_ft ELSE pm.home_score_ft END AS gf,
          CASE WHEN pm.away_team_id = u.away_team_id THEN pm.home_score_ft ELSE pm.away_score_ft END AS ga,
          COALESCE(ms.total_shots, 0)         AS shots,
          COALESCE(ms.shots_on_goal, 0)       AS shots_og,
          COALESCE(ms.shots_insidebox, 0)     AS shots_ib,
          COALESCE(ms.corner_kicks, 0)        AS corners,
          COALESCE(ms.fouls, 0)               AS fouls,
          COALESCE(ms.yellow_cards, 0)        AS yellows,
          COALESCE(ms.ball_possession, 0)     AS poss,
          COALESCE(ms.passes_percentage, 0)   AS pass_pct,
          COALESCE(ms.goalkeeper_saves, 0)    AS gk_saves,
          CASE WHEN ms.id IS NOT NULL
            THEN ROUND(((COALESCE(ms.shots_on_goal,0) * 2.0 + COALESCE(ms.shots_insidebox,0)) / 30.0)::numeric, 4)
            ELSE NULL END AS attack_idx,
          GREATEST(0, LEAST(1,
            CASE WHEN pm.away_team_id = u.away_team_id
              THEN 1.0 - (COALESCE(pm.home_score_ft,0)::numeric / 3.0)
              ELSE 1.0 - (COALESCE(pm.away_score_ft,0)::numeric / 3.0)
            END))::numeric AS def_res,
          CASE WHEN ms.id IS NOT NULL
            THEN GREATEST(0, LEAST(1, COALESCE(ms.shots_insidebox,0)::numeric / 8.0))
            ELSE NULL END AS xg_lite,
          (ms.id IS NOT NULL) AS has_stats
        FROM public.matches pm
        LEFT JOIN public.match_stats ms
          ON ms.match_id = pm.id
          AND ms.team_id = u.away_team_id
          AND ms.half = 'FT'
        WHERE
          (pm.home_team_id = u.away_team_id OR pm.away_team_id = u.away_team_id)
          AND pm.match_date < u.match_date
          AND pm.id <> u.match_id
          AND pm.result IS NOT NULL
          AND pm.home_score_ft IS NOT NULL
        ORDER BY pm.match_date DESC, pm.id DESC
        LIMIT 20
      ) prev
    ) a

    WHERE u.match_date >= p_date_from
      AND u.match_date < p_date_to

    ON CONFLICT (match_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    v_duration_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000);

    UPDATE model_lab.feature_snapshot_batch_runs
    SET status       = 'completed',
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

-- ─── 3. Reset function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION model_lab.ml_reset_feature_snapshot_v1()
RETURNS TABLE (
  snapshot_rows_before  bigint,
  batch_runs_before     bigint,
  snapshot_rows_after   bigint,
  batch_runs_after      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = model_lab, public
AS $$
DECLARE
  v_snap_before  bigint;
  v_batch_before bigint;
BEGIN
  SELECT COUNT(*) INTO v_snap_before  FROM model_lab.prematch_feature_matrix_snapshot_v1;
  SELECT COUNT(*) INTO v_batch_before FROM model_lab.feature_snapshot_batch_runs;

  TRUNCATE model_lab.prematch_feature_matrix_snapshot_v1;
  TRUNCATE model_lab.feature_snapshot_batch_runs;

  RETURN QUERY SELECT v_snap_before, v_batch_before, 0::bigint, 0::bigint;
END;
$$;
