/*
  # Fix wc2026_compute_team_calibration — Layer 2 recent form query

  ## Problem
  wc_history.matches for editions 2018 and 2022 have home_team_id / away_team_id = NULL.
  The Layer 2 query joined via t.id = m.home_team_id, which returned 0 rows for all teams.

  ## Fix
  Replace the team-table JOIN with a direct name match against m.home_team_name and
  m.away_team_name using the same normalization already used in Layer 1 fallback.
  Also compute recent wins/losses/gf/ga correctly using team position in each match.

  ## Effect
  Teams that appeared in 2018 or 2022 will now get recent_matches_available > 0,
  advancing from 'low' to 'medium' confidence. Teams absent from 2018/2022 (first-time
  qualifiers) remain at 'none'/'low'.
*/

CREATE OR REPLACE FUNCTION public.wc2026_compute_team_calibration(
  p_api_team_id integer,
  p_run_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'wc_history'
AS $function$
DECLARE
v_team_pool         public.wc2026_team_pool%ROWTYPE;
v_result_id         uuid;

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

v_historical_elo    numeric := 1400;

v_player_count      integer := 0;
v_avail_count       integer := 0;
v_inj_count         integer := 0;
v_susp_count        integer := 0;
v_gk_count          integer := 0;
v_def_count         integer := 0;
v_mid_count         integer := 0;
v_att_count         integer := 0;
v_pos_coverage      numeric := 0;

v_xi_available      boolean := false;
v_xi_avg_rating     numeric;
v_xi_top_count      integer := 0;

v_bench_available   boolean := false;
v_bench_avg_rating  numeric;
v_bench_vs_xi       numeric;

v_team_strength       numeric;
v_lineup_strength     numeric;
v_bench_impact        numeric;
v_tournament_pressure numeric;
v_scenario_conf       numeric;
v_late_goal_risk      numeric;
v_chaos_prob          numeric;
v_fatigue_risk        numeric;

v_experience_score  numeric;
v_squad_avg_age     numeric;
v_age_profile       text;
v_def_fragility     numeric;
v_comeback_risk     numeric;

v_confidence        text := 'none';
v_coverage_flags    jsonb;
v_warnings          jsonb := '[]'::jsonb;
v_notes             text;

v_has_history       boolean := false;
v_has_recent        boolean := false;
v_has_player_pool   boolean := false;
v_has_xi            boolean := false;
v_has_bench         boolean := false;
v_data_layers       integer := 0;

v_name_norm         text;
BEGIN

SELECT * INTO v_team_pool
FROM public.wc2026_team_pool
WHERE api_football_team_id = p_api_team_id
LIMIT 1;

IF NOT FOUND THEN
  RETURN NULL;
END IF;

-- Pre-compute normalized team name once
v_name_norm := lower(regexp_replace(v_team_pool.team_name, '[^a-zA-Z]', '', 'g'));

-- ── Layer 1: WC History Backbone (all editions, via team_id JOIN) ─────────
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
  m.home_score_ft IS NOT NULL
  AND (
    (v_team_pool.fifa_code IS NOT NULL AND t.fifa_code = v_team_pool.fifa_code)
    OR lower(regexp_replace(t.name_en, '[^a-zA-Z]', '', 'g')) = v_name_norm
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

  v_historical_elo := 1200 + (v_wc_win_rate * 750)
    + LEAST(v_wc_appearances * 15, 150)
    + GREATEST(v_wc_goal_diff_avg * 30, -100);

  v_experience_score := LEAST(
    (v_wc_appearances * 20)
    + CASE WHEN v_last_wc_year >= 2018 THEN 20 ELSE 0 END
    , 100
  );
ELSE
  v_historical_elo   := 1350;
  v_experience_score := 10;
  v_warnings := v_warnings || '["Tarihsel DK verisi bulunamadı — temel ELO varsayılan"]'::jsonb;
END IF;

IF v_wc_match_count > 0 THEN
  v_def_fragility := GREATEST(0, LEAST(100,
    100 - (v_wc_ga::numeric / v_wc_match_count * 20)
  ));
  v_comeback_risk := LEAST(1.0, v_wc_losses::numeric / v_wc_match_count * 2.0);
ELSE
  v_def_fragility := 50;
  v_comeback_risk := 0.3;
END IF;

-- ── Layer 2: Recent form — 2018/2022 editions ─────────────────────────────
-- NOTE: wc_history.matches for 2018/2022 have home_team_id/away_team_id = NULL.
-- Match directly on home_team_name / away_team_name using normalized name.
DECLARE
  v_recent_matches  integer := 0;
  v_recent_wins     integer := 0;
  v_recent_gf       integer := 0;
  v_recent_ga       integer := 0;
BEGIN
  SELECT
    COUNT(*),
    SUM(CASE
      WHEN m.result = 'Home Win' AND lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm THEN 1
      WHEN m.result = 'Away Win' AND lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g')) = v_name_norm THEN 1
      ELSE 0 END),
    SUM(CASE
      WHEN lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm
        THEN COALESCE(m.home_score_ft,0)
      ELSE COALESCE(m.away_score_ft,0) END),
    SUM(CASE
      WHEN lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm
        THEN COALESCE(m.away_score_ft,0)
      ELSE COALESCE(m.home_score_ft,0) END)
  INTO v_recent_matches, v_recent_wins, v_recent_gf, v_recent_ga
  FROM wc_history.matches m
  WHERE m.edition_year >= 2018
    AND m.home_score_ft IS NOT NULL
    AND (
      lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm
      OR lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g')) = v_name_norm
    );

  IF COALESCE(v_recent_matches, 0) > 0 THEN
    v_has_recent  := true;
    v_data_layers := v_data_layers + 1;
    -- Blend: 60% recent WC form, 40% historical baseline
    v_historical_elo := v_historical_elo * 0.4
      + (1200 + (v_recent_wins::numeric / v_recent_matches * 900)) * 0.6;
  ELSE
    v_warnings := v_warnings || '["2018/2022 DK form verisi yok — tarihsel ağırlık kullanıldı"]'::jsonb;
  END IF;
END;

-- ── Layer 3: Player pool ──────────────────────────────────────────────────
SELECT
  COUNT(*),
  SUM(CASE WHEN availability_status = 'available' THEN 1 ELSE 0 END),
  SUM(CASE WHEN availability_status = 'injured'   THEN 1 ELSE 0 END),
  SUM(CASE WHEN availability_status = 'suspended' THEN 1 ELSE 0 END),
  SUM(CASE WHEN position = 'Goalkeeper'  THEN 1 ELSE 0 END),
  SUM(CASE WHEN position = 'Defender'    THEN 1 ELSE 0 END),
  SUM(CASE WHEN position = 'Midfielder'  THEN 1 ELSE 0 END),
  SUM(CASE WHEN position = 'Attacker'    THEN 1 ELSE 0 END)
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
  v_data_layers     := v_data_layers + 1;

  DECLARE
    v_pos_present integer := 0;
  BEGIN
    IF v_gk_count > 0  THEN v_pos_present := v_pos_present + 1; END IF;
    IF v_def_count > 0 THEN v_pos_present := v_pos_present + 1; END IF;
    IF v_mid_count > 0 THEN v_pos_present := v_pos_present + 1; END IF;
    IF v_att_count > 0 THEN v_pos_present := v_pos_present + 1; END IF;
    v_pos_coverage := v_pos_present::numeric / 4.0;
  END;

  DECLARE
    v_loss_rate numeric;
  BEGIN
    v_loss_rate := (v_inj_count + v_susp_count)::numeric / GREATEST(v_player_count, 1);
    v_historical_elo := v_historical_elo - (v_loss_rate * 300);
  END;

  IF v_inj_count > 2 OR v_susp_count > 1 THEN
    v_warnings := v_warnings
      || ('["Kadro kaybı: ' || v_inj_count || ' sakatlık, ' || v_susp_count || ' ceza"]')::jsonb;
  END IF;
ELSE
  v_pos_coverage := 0;
  v_warnings := v_warnings || '["Oyuncu havuzu verisi yok — kadro düzeltmesi yapılamadı"]'::jsonb;
END IF;

-- ── Layer 4: Probable XI ─────────────────────────────────────────────────
SELECT true, AVG(pps.rating), SUM(CASE WHEN pps.rating >= 7.5 THEN 1 ELSE 0 END)
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
  v_has_xi      := true;
  v_data_layers := v_data_layers + 1;
  v_historical_elo := v_historical_elo + ((v_xi_avg_rating - 6.5) * 100);
ELSE
  v_warnings := v_warnings || '["Muhtemel İlk 11 verisi yok — oyuncu kalitesi düzeltmesi yapılamadı"]'::jsonb;
END IF;

-- ── Layer 5: Bench ───────────────────────────────────────────────────────
SELECT true, AVG(pps.rating)
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
  v_has_bench   := true;
  v_data_layers := v_data_layers + 1;
  v_bench_vs_xi := LEAST(1.0, v_bench_avg_rating / GREATEST(v_xi_avg_rating, 0.01));
END IF;

-- ── Squad age profile ────────────────────────────────────────────────────
SELECT AVG(EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM ppp.birth_date))
INTO v_squad_avg_age
FROM public.wc2026_player_profiles ppp
JOIN public.wc2026_player_pool pool ON pool.wc2026_player_profile_id = ppp.id
WHERE pool.api_football_team_id = p_api_team_id
  AND ppp.birth_date IS NOT NULL;

v_age_profile := CASE
  WHEN v_squad_avg_age IS NULL    THEN 'unknown'
  WHEN v_squad_avg_age < 25       THEN 'young'
  WHEN v_squad_avg_age > 28       THEN 'experienced'
  ELSE 'balanced'
END;

-- ── Named Indices ─────────────────────────────────────────────────────────
v_team_strength := GREATEST(0, LEAST(100, (v_historical_elo - 1200) / 7.0));

IF v_xi_available AND v_xi_avg_rating IS NOT NULL THEN
  v_lineup_strength := GREATEST(0, LEAST(100, (v_xi_avg_rating - 5.5) / 3.5 * 100));
END IF;

v_bench_impact := CASE
  WHEN v_bench_vs_xi IS NOT NULL
    THEN GREATEST(-1.0, LEAST(1.0, (v_bench_vs_xi - 0.6) * 2.5))
  ELSE 0.0
END;

v_tournament_pressure := GREATEST(0, LEAST(100,
  (v_team_strength * 0.5)
  + COALESCE(v_experience_score, 30) * 0.3
  + CASE v_age_profile WHEN 'experienced' THEN 10 WHEN 'young' THEN -5 ELSE 0 END
  + CASE WHEN v_last_wc_year IS NOT NULL AND v_last_wc_year >= 2018 THEN 10 ELSE 0 END
));

v_scenario_conf := CASE v_data_layers
  WHEN 0 THEN 0.10  WHEN 1 THEN 0.25  WHEN 2 THEN 0.45
  WHEN 3 THEN 0.65  WHEN 4 THEN 0.80  ELSE 0.90
END;

v_late_goal_risk := GREATEST(0, LEAST(1,
  0.3
  + COALESCE(v_comeback_risk, 0.3) * 0.3
  + COALESCE(v_bench_impact, 0) * 0.2
  + CASE WHEN v_age_profile = 'young' THEN 0.1 ELSE 0 END
));

v_chaos_prob := GREATEST(0, LEAST(1,
  0.2
  + (100 - COALESCE(v_def_fragility, 50)) / 100.0 * 0.3
  + (100 - COALESCE(v_experience_score, 30)) / 100.0 * 0.2
  + CASE WHEN v_team_strength < 40 THEN 0.15 ELSE 0 END
));

v_fatigue_risk := GREATEST(0, LEAST(1,
  0.15
  + CASE WHEN v_age_profile = 'experienced' THEN 0.2 ELSE 0 END
  + CASE WHEN v_bench_impact < -0.2 THEN 0.2 ELSE 0 END
  + CASE WHEN v_player_count < 18 THEN 0.15 ELSE 0 END
));

v_confidence := CASE
  WHEN v_data_layers >= 4 THEN 'high'
  WHEN v_data_layers >= 2 THEN 'medium'
  WHEN v_data_layers >= 1 THEN 'low'
  ELSE 'none'
END;

v_coverage_flags := jsonb_build_object(
  'has_history',      v_has_history,
  'has_recent_form',  v_has_recent,
  'has_player_pool',  v_has_player_pool,
  'has_probable_xi',  v_has_xi,
  'has_bench',        v_has_bench,
  'data_layers',      v_data_layers
);

v_notes := 'ELO tarihsel: ' || round(v_historical_elo)::text
  || ' | Maç: '     || v_wc_match_count::text
  || ' | Görünme: ' || v_wc_appearances::text
  || ' | Katmanlar: '|| v_data_layers::text;

INSERT INTO public.wc2026_team_calibration_profiles (
  calibration_run_id, api_football_team_id, team_name, fifa_code, confederation,
  historical_wc_matches, historical_elo_rating, historical_win_rate,
  historical_goal_diff_avg, last_wc_year, recent_matches_available,
  player_pool_count, players_available, players_injured, players_suspended,
  position_coverage_score, probable_xi_available, probable_xi_avg_rating,
  probable_xi_top_player_count, bench_available, bench_avg_rating,
  bench_quality_vs_xi, wc2026_team_strength_index, wc2026_lineup_strength_index,
  wc2026_bench_impact_index, wc2026_tournament_pressure_index,
  wc2026_scenario_confidence, wc2026_late_goal_risk, wc2026_chaos_probability,
  wc2026_fatigue_risk, tournament_experience_score, squad_avg_age,
  squad_age_profile, defensive_fragility_score, comeback_risk_score,
  calibration_confidence, data_coverage_flags, missing_data_warnings,
  calibration_formula_version, calibration_notes, calibrated_at
)
VALUES (
  p_run_id, p_api_team_id, v_team_pool.team_name, v_team_pool.fifa_code,
  v_team_pool.confederation, v_wc_match_count, v_historical_elo,
  CASE WHEN v_wc_match_count > 0 THEN v_wc_win_rate ELSE NULL END,
  CASE WHEN v_wc_match_count > 0 THEN v_wc_goal_diff_avg ELSE NULL END,
  v_last_wc_year,
  CASE WHEN v_has_recent THEN 1 ELSE 0 END,
  v_player_count, v_avail_count, v_inj_count, v_susp_count,
  v_pos_coverage, v_xi_available, v_xi_avg_rating, v_xi_top_count,
  v_bench_available, v_bench_avg_rating, v_bench_vs_xi,
  v_team_strength, v_lineup_strength, v_bench_impact,
  v_tournament_pressure, v_scenario_conf, v_late_goal_risk,
  v_chaos_prob, v_fatigue_risk, v_experience_score,
  v_squad_avg_age, v_age_profile, v_def_fragility, v_comeback_risk,
  v_confidence, v_coverage_flags, v_warnings,
  'wc2026_v2', v_notes, now()
)
RETURNING id INTO v_result_id;

RETURN v_result_id;
END;
$function$;
