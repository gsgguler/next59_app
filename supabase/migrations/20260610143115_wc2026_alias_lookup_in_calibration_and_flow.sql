
-- Phase 3: Add alias table lookup as 3rd step in wc2026_compute_team_calibration
-- The function already has: Step 1 (exact), Step 2 (normalized)
-- Adding: Step 3 (alias table by normalized), Step 4 (alias table by canonical name)

CREATE OR REPLACE FUNCTION public.wc2026_compute_team_calibration(
  p_api_team_id integer,
  p_run_id      uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
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
v_wch_fifa_code     text;
v_team_hist_id      uuid;

v_recent_matches    integer := 0;
v_recent_wins       integer := 0;
v_recent_gf         integer := 0;
v_recent_ga         integer := 0;

v_pos_present       integer := 0;
v_loss_rate         numeric;

-- Qualifier layer (PRIMARY recent-performance signal 2023-2026)
v_qual_win_rate       numeric := 0;
v_qual_gf_per_match   numeric := 0;
v_qual_ga_per_match   numeric := 0;
v_qual_confidence     numeric := 0;
v_qual_matches        integer := 0;
v_is_host_nation_f    boolean := false;
v_qualifier_elo       numeric := 1400;
v_has_qualifier_data  boolean := false;
v_qual_weight         numeric := 0;
v_hist_weight         numeric := 1.0;

-- Alias resolution
v_alias_name        text;
BEGIN

SELECT * INTO v_team_pool
FROM public.wc2026_team_pool
WHERE api_football_team_id = p_api_team_id
LIMIT 1;

IF NOT FOUND THEN
RETURN NULL;
END IF;

v_name_norm     := lower(regexp_replace(v_team_pool.team_name, '[^a-zA-Z]', '', 'g'));
v_wch_fifa_code := v_team_pool.fifa_code;

-- Layer 1: WC History Backbone
SELECT t.id INTO v_team_hist_id
FROM wc_history.teams t
WHERE (v_wch_fifa_code IS NOT NULL AND t.fifa_code = v_wch_fifa_code)
OR lower(regexp_replace(t.name_en, '[^a-zA-Z]', '', 'g')) = v_name_norm
LIMIT 1;

SELECT
COUNT(DISTINCT s.match_id),
COALESCE(SUM(s.is_win), 0),
COALESCE(SUM(s.is_draw), 0),
COALESCE(SUM(s.is_loss), 0),
COALESCE(SUM(s.gf), 0),
COALESCE(SUM(s.ga), 0),
MAX(s.yr),
COUNT(DISTINCT s.yr)
INTO
v_wc_match_count, v_wc_wins, v_wc_draws, v_wc_losses,
v_wc_gf, v_wc_ga, v_last_wc_year, v_wc_appearances
FROM (
SELECT DISTINCT ON (m.id)
m.id AS match_id,
m.edition_year AS yr,
CASE
WHEN m.result = 'Home Win' AND m.home_team_id = v_team_hist_id THEN 1
WHEN m.result = 'Away Win' AND m.away_team_id = v_team_hist_id THEN 1
ELSE 0 END AS is_win,
CASE WHEN m.result = 'Draw' THEN 1 ELSE 0 END AS is_draw,
CASE
WHEN m.result = 'Home Win' AND m.away_team_id = v_team_hist_id THEN 1
WHEN m.result = 'Away Win' AND m.home_team_id = v_team_hist_id THEN 1
ELSE 0 END AS is_loss,
CASE WHEN m.home_team_id = v_team_hist_id
THEN COALESCE(m.home_score_ft, 0)
ELSE COALESCE(m.away_score_ft, 0) END AS gf,
CASE WHEN m.home_team_id = v_team_hist_id
THEN COALESCE(m.away_score_ft, 0)
ELSE COALESCE(m.home_score_ft, 0) END AS ga
FROM wc_history.matches m
WHERE v_team_hist_id IS NOT NULL
AND (m.home_team_id = v_team_hist_id OR m.away_team_id = v_team_hist_id)
AND m.home_score_ft IS NOT NULL

UNION

SELECT DISTINCT ON (m.id)
m.id AS match_id,
m.edition_year AS yr,
CASE
WHEN m.result = 'Home Win'
AND lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm THEN 1
WHEN m.result = 'Away Win'
AND lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g')) = v_name_norm THEN 1
WHEN m.result = 'Home Win' AND v_wch_fifa_code IS NOT NULL
AND EXISTS (
SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
= lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g'))
) THEN 1
WHEN m.result = 'Away Win' AND v_wch_fifa_code IS NOT NULL
AND EXISTS (
SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
= lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g'))
) THEN 1
ELSE 0 END AS is_win,
CASE WHEN m.result = 'Draw' THEN 1 ELSE 0 END AS is_draw,
CASE
WHEN m.result = 'Home Win'
AND lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g')) = v_name_norm THEN 1
WHEN m.result = 'Away Win'
AND lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm THEN 1
ELSE 0 END AS is_loss,
CASE
WHEN lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm
OR (v_wch_fifa_code IS NOT NULL AND EXISTS (
SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
= lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g'))
))
THEN COALESCE(m.home_score_ft, 0)
ELSE COALESCE(m.away_score_ft, 0) END AS gf,
CASE
WHEN lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm
OR (v_wch_fifa_code IS NOT NULL AND EXISTS (
SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
= lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g'))
))
THEN COALESCE(m.away_score_ft, 0)
ELSE COALESCE(m.home_score_ft, 0) END AS ga
FROM wc_history.matches m
WHERE m.home_score_ft IS NOT NULL
AND (
lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm
OR lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g')) = v_name_norm
OR (v_wch_fifa_code IS NOT NULL AND EXISTS (
SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
IN (
lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')),
lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g'))
)
))
)
) s;

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

v_historical_elo := 1200
+ (v_wc_win_rate * 750)
+ LEAST(v_wc_appearances * 15, 150)
+ GREATEST(v_wc_goal_diff_avg * 30, -100);

v_experience_score := LEAST(
(v_wc_appearances * 20)
+ CASE WHEN v_last_wc_year >= 2018 THEN 20 ELSE 0 END,
100
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

-- Layer 1.5: Qualifier Recent Form (PRIMARY recent-performance signal 2023-2026)
-- Step 1: exact team name match
SELECT
COALESCE(qualifier_win_rate, 0),
COALESCE(qualifier_goals_for_per_match, 0),
COALESCE(qualifier_goals_against_per_match, 0),
COALESCE(overall_qualifier_data_confidence, 0),
COALESCE(qualifier_matches_played, 0),
COALESCE(is_host_nation, false)
INTO v_qual_win_rate, v_qual_gf_per_match, v_qual_ga_per_match,
v_qual_confidence, v_qual_matches, v_is_host_nation_f
FROM wc_qualifier_model_features
WHERE team_name = v_team_pool.team_name
LIMIT 1;

-- Step 2: normalized name fallback
IF NOT FOUND THEN
SELECT
COALESCE(qualifier_win_rate, 0),
COALESCE(qualifier_goals_for_per_match, 0),
COALESCE(qualifier_goals_against_per_match, 0),
COALESCE(overall_qualifier_data_confidence, 0),
COALESCE(qualifier_matches_played, 0),
COALESCE(is_host_nation, false)
INTO v_qual_win_rate, v_qual_gf_per_match, v_qual_ga_per_match,
v_qual_confidence, v_qual_matches, v_is_host_nation_f
FROM wc_qualifier_model_features
WHERE lower(regexp_replace(team_name, '[^a-zA-Z]', '', 'g')) = v_name_norm
LIMIT 1;
END IF;

-- Step 3: alias table lookup (canonical → alias → model_features)
IF NOT FOUND THEN
SELECT alias_name INTO v_alias_name
FROM public.wc2026_team_name_aliases
WHERE canonical_name = v_team_pool.team_name
  AND alias_name != v_team_pool.team_name
LIMIT 1;

IF v_alias_name IS NOT NULL THEN
  SELECT
  COALESCE(qualifier_win_rate, 0),
  COALESCE(qualifier_goals_for_per_match, 0),
  COALESCE(qualifier_goals_against_per_match, 0),
  COALESCE(overall_qualifier_data_confidence, 0),
  COALESCE(qualifier_matches_played, 0),
  COALESCE(is_host_nation, false)
  INTO v_qual_win_rate, v_qual_gf_per_match, v_qual_ga_per_match,
  v_qual_confidence, v_qual_matches, v_is_host_nation_f
  FROM wc_qualifier_model_features
  WHERE team_name = v_alias_name
  LIMIT 1;
END IF;
END IF;

IF v_qual_matches >= 4 THEN
v_has_qualifier_data := true;
v_data_layers        := v_data_layers + 1;

v_qualifier_elo := 1200
+ (v_qual_win_rate * 800)
+ ((v_qual_gf_per_match - v_qual_ga_per_match) * 50);

v_qual_weight := CASE
WHEN v_qual_confidence >= 0.85 THEN 0.85
WHEN v_qual_confidence >= 0.65 THEN 0.72
WHEN v_qual_confidence >= 0.45 THEN 0.55
ELSE                                 0.40
END;
v_hist_weight := 1.0 - v_qual_weight;

v_historical_elo := v_historical_elo * v_hist_weight + v_qualifier_elo * v_qual_weight;

ELSIF v_is_host_nation_f THEN
v_warnings := v_warnings
|| '["Ev sahibi takım: eleme yolu yok — tarihsel + kadro kalitesi kullanıldı"]'::jsonb;
ELSIF v_qual_matches > 0 THEN
v_has_qualifier_data := true;
v_qualifier_elo := 1200 + (v_qual_win_rate * 600);
v_historical_elo := v_historical_elo * 0.70 + v_qualifier_elo * 0.30;
v_warnings := v_warnings
|| '["Sınırlı eleme verisi — kısmi ağırlık uygulandı"]'::jsonb;
ELSE
v_warnings := v_warnings
|| '["Eleme dönemi verisi bulunamadı — tarihsel ağırlık uygulandı"]'::jsonb;
END IF;

-- Layer 2: WC 2018/2022 — secondary recency signal (15% weight)
SELECT
COUNT(*),
COALESCE(SUM(CASE
WHEN m.result = 'Home Win'
AND lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm THEN 1
WHEN m.result = 'Away Win'
AND lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g')) = v_name_norm THEN 1
WHEN m.result = 'Home Win' AND v_wch_fifa_code IS NOT NULL
AND EXISTS (SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
= lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g'))) THEN 1
WHEN m.result = 'Away Win' AND v_wch_fifa_code IS NOT NULL
AND EXISTS (SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
= lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g'))) THEN 1
ELSE 0 END), 0),
COALESCE(SUM(CASE
WHEN lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm
OR (v_wch_fifa_code IS NOT NULL AND EXISTS (
SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
= lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g'))
))
THEN COALESCE(m.home_score_ft, 0)
ELSE COALESCE(m.away_score_ft, 0) END), 0),
COALESCE(SUM(CASE
WHEN lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm
OR (v_wch_fifa_code IS NOT NULL AND EXISTS (
SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
= lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g'))
))
THEN COALESCE(m.away_score_ft, 0)
ELSE COALESCE(m.home_score_ft, 0) END), 0)
INTO v_recent_matches, v_recent_wins, v_recent_gf, v_recent_ga
FROM wc_history.matches m
WHERE m.edition_year >= 2018
AND m.home_score_ft IS NOT NULL
AND (
lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')) = v_name_norm
OR lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g')) = v_name_norm
OR (v_wch_fifa_code IS NOT NULL AND EXISTS (
SELECT 1 FROM wc_history.teams ta
WHERE ta.fifa_code = v_wch_fifa_code
AND lower(regexp_replace(ta.name_en,'[^a-zA-Z]','','g'))
IN (
lower(regexp_replace(m.home_team_name,'[^a-zA-Z]','','g')),
lower(regexp_replace(m.away_team_name,'[^a-zA-Z]','','g'))
)
))
);

IF COALESCE(v_recent_matches, 0) > 0 THEN
v_has_recent  := true;
v_data_layers := v_data_layers + 1;
v_historical_elo := v_historical_elo * 0.85
+ (1200 + (v_recent_wins::numeric / v_recent_matches * 900)) * 0.15;
ELSE
v_warnings := v_warnings
|| '["2018/2022 DK form verisi yok — tarihsel ağırlık kullanıldı"]'::jsonb;
END IF;

-- Layer 3: Player pool
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

v_pos_present := 0;
IF v_gk_count > 0  THEN v_pos_present := v_pos_present + 1; END IF;
IF v_def_count > 0 THEN v_pos_present := v_pos_present + 1; END IF;
IF v_mid_count > 0 THEN v_pos_present := v_pos_present + 1; END IF;
IF v_att_count > 0 THEN v_pos_present := v_pos_present + 1; END IF;
v_pos_coverage := v_pos_present::numeric / 4.0;

v_loss_rate := (v_inj_count + v_susp_count)::numeric / GREATEST(v_player_count, 1);
v_historical_elo := v_historical_elo - (v_loss_rate * 300);

IF v_inj_count > 2 OR v_susp_count > 1 THEN
v_warnings := v_warnings
|| ('[\"Kadro kaybı: ' || v_inj_count || ' sakatlık, ' || v_susp_count || ' ceza\"]')::jsonb;
END IF;
ELSE
v_pos_coverage := 0;
v_warnings := v_warnings
|| '["Oyuncu havuzu verisi yok — kadro düzeltmesi yapılamadı"]'::jsonb;
END IF;

-- Layer 4: Probable XI
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
v_warnings := v_warnings
|| '["Muhtemel İlk 11 verisi yok — oyuncu kalitesi düzeltmesi yapılamadı"]'::jsonb;
END IF;

-- Layer 5: Bench
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

-- Squad age profile
SELECT AVG(EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM ppp.birth_date))
INTO v_squad_avg_age
FROM public.wc2026_player_profiles ppp
JOIN public.wc2026_player_pool pool ON pool.wc2026_player_profile_id = ppp.id
WHERE pool.api_football_team_id = p_api_team_id
AND ppp.birth_date IS NOT NULL;

v_age_profile := CASE
WHEN v_squad_avg_age IS NULL THEN 'unknown'
WHEN v_squad_avg_age < 25   THEN 'young'
WHEN v_squad_avg_age > 28   THEN 'experienced'
ELSE 'balanced'
END;

-- Named Indices
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

-- Confidence: qualification-tiered
v_scenario_conf := CASE
WHEN v_qual_confidence >= 0.85 THEN
CASE v_data_layers WHEN 0 THEN 0.10 WHEN 1 THEN 0.35 WHEN 2 THEN 0.55
WHEN 3 THEN 0.72 WHEN 4 THEN 0.85 ELSE 0.92 END
WHEN v_qual_confidence >= 0.65 THEN
CASE v_data_layers WHEN 0 THEN 0.10 WHEN 1 THEN 0.28 WHEN 2 THEN 0.48
WHEN 3 THEN 0.65 WHEN 4 THEN 0.78 ELSE 0.85 END
WHEN v_qual_confidence >= 0.45 THEN
CASE v_data_layers WHEN 0 THEN 0.08 WHEN 1 THEN 0.22 WHEN 2 THEN 0.40
WHEN 3 THEN 0.55 WHEN 4 THEN 0.68 ELSE 0.75 END
ELSE
CASE v_data_layers WHEN 0 THEN 0.08 WHEN 1 THEN 0.18 WHEN 2 THEN 0.32
WHEN 3 THEN 0.45 WHEN 4 THEN 0.58 ELSE 0.65 END
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
'has_history',           v_has_history,
'has_qualifier_data',    v_has_qualifier_data,
'qualifier_confidence',  v_qual_confidence,
'qualifier_weight',      v_qual_weight,
'has_recent_form',       v_has_recent,
'has_player_pool',       v_has_player_pool,
'has_probable_xi',       v_has_xi,
'has_bench',             v_has_bench,
'data_layers',           v_data_layers
);

v_notes := 'ELO tarihsel: ' || round(v_historical_elo)::text
|| ' | Maç: '         || v_wc_match_count::text
|| ' | Görünme: '     || v_wc_appearances::text
|| ' | ElemeConf: '   || round(v_qual_confidence * 100)::text || '%'
|| ' | Katmanlar: '   || v_data_layers::text;

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
'wc2026_v4_qualifier_primary', v_notes, now()
)
RETURNING id INTO v_result_id;

RETURN v_result_id;
END;
$$;

-- Phase 3b: Update generate_wc2026_5min_match_flow to use alias lookup
-- The function already works (fixture names = Czech Republic/Congo DR match directly)
-- Add alias fallback for future-proofing after the primary + normalized lookups

CREATE OR REPLACE FUNCTION public.generate_wc2026_5min_match_flow(
  p_fixture_id   uuid,
  p_scenario_ctx text    DEFAULT 'qualifier_priority_v4',
  p_force        boolean DEFAULT false,
  p_publish      boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
v_fixture          RECORD;
v_home_model       RECORD;
v_away_model       RECORD;
v_venue_psych      RECORD;
v_existing_ver     integer;
v_new_ver          integer;

v_period_start     integer;
v_period_end       integer;
v_period_label     text;

v_home_fouls       numeric;
v_away_fouls       numeric;
v_home_yellows     numeric;
v_away_yellows     numeric;
v_home_corners     numeric;
v_away_corners     numeric;
v_home_possession  numeric;
v_away_possession  numeric;
v_home_xg          numeric;
v_away_xg          numeric;

v_time_factor      numeric;
v_goal_risk_home   numeric;
v_goal_risk_away   numeric;
v_pressure_home    numeric;
v_pressure_away    numeric;
v_yellow_home      numeric;
v_yellow_away      numeric;
v_red_home         numeric;
v_red_away         numeric;
v_corner_home      numeric;
v_corner_away      numeric;
v_foul_home        numeric;
v_foul_away        numeric;
v_offside_home     numeric;
v_offside_away     numeric;
v_sub_home         numeric;
v_sub_away         numeric;
v_confidence       numeric;
v_momentum_side    text;
v_narrative        text;

v_home_host_boost  numeric;
v_away_host_boost  numeric;

v_home_alias       text;
v_away_alias       text;

PERIODS            integer[] := ARRAY[0,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85];
BEGIN

-- 1. Load fixture
SELECT f.id, f.match_number, f.home_team_name, f.away_team_name,
f.home_api_team_id, f.away_api_team_id, f.venue_id, f.stage_code
INTO   v_fixture
FROM   wc2026_fixtures f
WHERE  f.id = p_fixture_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'Fixture not found: %', p_fixture_id;
END IF;

-- 2. Skip-guard
SELECT COALESCE(MAX(scenario_version), 0)
INTO   v_existing_ver
FROM   wc2026_5min_flow_scenarios
WHERE  fixture_id = p_fixture_id AND is_current = true;

IF v_existing_ver > 0 AND NOT p_force THEN
RETURN;
END IF;

v_new_ver := v_existing_ver + 1;

-- 3. Qualifier model features — Step 1: exact match
SELECT avg_total_shots, avg_fouls, avg_yellow_cards, avg_corners,
avg_possession_pct, avg_shots_on_goal, xg_for_per_match,
detailed_stats_confidence
INTO   v_home_model
FROM   wc_qualifier_model_features
WHERE  team_name = v_fixture.home_team_name
LIMIT  1;

-- Step 2: alias fallback for home team
IF NOT FOUND THEN
SELECT alias_name INTO v_home_alias
FROM public.wc2026_team_name_aliases
WHERE canonical_name = v_fixture.home_team_name
  AND alias_name != v_fixture.home_team_name
LIMIT 1;
IF v_home_alias IS NOT NULL THEN
  SELECT avg_total_shots, avg_fouls, avg_yellow_cards, avg_corners,
  avg_possession_pct, avg_shots_on_goal, xg_for_per_match,
  detailed_stats_confidence
  INTO   v_home_model
  FROM   wc_qualifier_model_features
  WHERE  team_name = v_home_alias
  LIMIT  1;
END IF;
END IF;

-- Step 1: exact match for away team
SELECT avg_total_shots, avg_fouls, avg_yellow_cards, avg_corners,
avg_possession_pct, avg_shots_on_goal, xg_for_per_match,
detailed_stats_confidence
INTO   v_away_model
FROM   wc_qualifier_model_features
WHERE  team_name = v_fixture.away_team_name
LIMIT  1;

-- Step 2: alias fallback for away team
IF NOT FOUND THEN
SELECT alias_name INTO v_away_alias
FROM public.wc2026_team_name_aliases
WHERE canonical_name = v_fixture.away_team_name
  AND alias_name != v_fixture.away_team_name
LIMIT 1;
IF v_away_alias IS NOT NULL THEN
  SELECT avg_total_shots, avg_fouls, avg_yellow_cards, avg_corners,
  avg_possession_pct, avg_shots_on_goal, xg_for_per_match,
  detailed_stats_confidence
  INTO   v_away_model
  FROM   wc_qualifier_model_features
  WHERE  team_name = v_away_alias
  LIMIT  1;
END IF;
END IF;

v_home_fouls      := COALESCE(v_home_model.avg_fouls, 13.0);
v_away_fouls      := COALESCE(v_away_model.avg_fouls, 13.0);
v_home_yellows    := COALESCE(v_home_model.avg_yellow_cards, 1.8);
v_away_yellows    := COALESCE(v_away_model.avg_yellow_cards, 1.8);
v_home_corners    := COALESCE(v_home_model.avg_corners, 5.5);
v_away_corners    := COALESCE(v_away_model.avg_corners, 5.5);
v_home_possession := COALESCE(v_home_model.avg_possession_pct, 50.0);
v_away_possession := COALESCE(v_away_model.avg_possession_pct, 50.0);
v_home_xg         := COALESCE(v_home_model.xg_for_per_match, 1.3);
v_away_xg         := COALESCE(v_away_model.xg_for_per_match, 1.3);

-- 4. Venue psychology
SELECT vpf.altitude_factor, vpf.travel_fatigue_factor,
vpf.home_crowd_support_score,
vpf.is_home_team_host_country, vpf.is_away_team_host_country,
vpf.venue_country
INTO   v_venue_psych
FROM   wc2026_venue_psychology_factors vpf
WHERE  vpf.fixture_id = p_fixture_id
LIMIT  1;

v_home_host_boost := 0.0;
v_away_host_boost := 0.0;
IF v_venue_psych IS NOT NULL THEN
IF v_venue_psych.is_home_team_host_country THEN
v_home_host_boost := CASE v_venue_psych.venue_country
WHEN 'Mexico' THEN 0.090
WHEN 'Canada' THEN 0.072
ELSE 0.078
END;
END IF;
IF v_venue_psych.is_away_team_host_country THEN
v_away_host_boost := CASE v_venue_psych.venue_country
WHEN 'Mexico' THEN 0.090
WHEN 'Canada' THEN 0.072
ELSE 0.078
END;
END IF;
END IF;

-- 5. Seal old current rows
IF v_existing_ver > 0 THEN
UPDATE wc2026_5min_flow_scenarios
SET    is_current = false, sealed_at = now()
WHERE  fixture_id = p_fixture_id AND is_current = true;

INSERT INTO wc2026_5min_flow_scenario_changes
(fixture_id, from_version, to_version, change_reason)
VALUES
(p_fixture_id, v_existing_ver, v_new_ver, 'Regenerated: ctx=' || p_scenario_ctx);
END IF;

-- 6. Generate 18 period rows
FOREACH v_period_start IN ARRAY PERIODS LOOP
v_period_end   := v_period_start + 5;
v_period_label := v_period_start::text || '–' || v_period_end::text;

v_time_factor := CASE
WHEN v_period_start < 20  THEN 1.20
WHEN v_period_start = 40  THEN 1.10
WHEN v_period_start = 45  THEN 0.90
WHEN v_period_start < 60  THEN 0.95
WHEN v_period_start < 75  THEN 1.05
WHEN v_period_start >= 70 THEN 1.25
ELSE 1.00
END;

v_goal_risk_home := LEAST(0.45, (v_home_xg / 18.0) * v_time_factor + v_home_host_boost);
v_goal_risk_away := LEAST(0.45, (v_away_xg / 18.0) * v_time_factor + v_away_host_boost);

v_pressure_home  := LEAST(0.95, (v_home_possession / 100.0) * v_time_factor + v_home_host_boost * 0.5);
v_pressure_away  := LEAST(0.95, (v_away_possession / 100.0) * v_time_factor + v_away_host_boost * 0.5);

v_yellow_home := LEAST(0.30, (v_home_yellows / 18.0) * v_time_factor);
v_yellow_away := LEAST(0.30, (v_away_yellows / 18.0) * v_time_factor);

v_red_home := LEAST(0.05, v_yellow_home * 0.08 * (CASE WHEN v_period_start >= 70 THEN 1.5 ELSE 1.0 END));
v_red_away := LEAST(0.05, v_yellow_away * 0.08 * (CASE WHEN v_period_start >= 70 THEN 1.5 ELSE 1.0 END));

v_corner_home := LEAST(0.40, v_home_corners / 18.0 * v_time_factor);
v_corner_away := LEAST(0.40, v_away_corners / 18.0 * v_time_factor);

v_foul_home := LEAST(0.40, v_home_fouls / 18.0 * v_time_factor);
v_foul_away := LEAST(0.40, v_away_fouls / 18.0 * v_time_factor);

v_offside_home := LEAST(0.25, v_goal_risk_home * 0.4 * v_time_factor);
v_offside_away := LEAST(0.25, v_goal_risk_away * 0.4 * v_time_factor);

v_sub_home := CASE WHEN v_period_start >= 60 THEN LEAST(0.30, (v_period_start - 55.0) / 100.0) ELSE 0.0 END;
v_sub_away := v_sub_home;

v_confidence := CASE
WHEN COALESCE(v_home_model.detailed_stats_confidence, 0) > 0.7
AND COALESCE(v_away_model.detailed_stats_confidence, 0) > 0.7 THEN 0.80
WHEN COALESCE(v_home_model.detailed_stats_confidence, 0) > 0.5
OR COALESCE(v_away_model.detailed_stats_confidence, 0) > 0.5 THEN 0.62
ELSE 0.45
END;

v_momentum_side := CASE
WHEN v_goal_risk_home > v_goal_risk_away + 0.03 THEN 'home'
WHEN v_goal_risk_away > v_goal_risk_home + 0.03 THEN 'away'
ELSE 'balanced'
END;

v_narrative := CASE
WHEN v_period_start < 10  THEN 'Maç başlangıcında her iki takım da pozisyon arayışında olabilir.'
WHEN v_period_start < 20  THEN 'İlk 20 dakika: yüksek ritim beklentisi; erken pozisyon yaratma çabaları yoğunlaşabilir.'
WHEN v_period_start < 35  THEN 'Orta alan hakimiyeti için mücadele yoğunlaşabilir; baskı dalgaları belirginleşebilir.'
WHEN v_period_start < 40  THEN 'İlk yarı kapanışına yaklaşılırken tempo yoğunlaşabilir; kritik pozisyonlar oluşabilir.'
WHEN v_period_start = 40  THEN 'İlk yarı bitimine yakın kritik dakikalar; duran top tehdidi artabilir.'
WHEN v_period_start = 45  THEN 'İlk yarı uzatma dakikaları; anlık skor baskısı yükselir.'
WHEN v_period_start < 60  THEN 'İkinci yarı başlangıcı: takım ayarlamaları sahayı etkileyebilir.'
WHEN v_period_start < 70  THEN 'Oyun kurma bölgesi; kanat çıkışları ve değişiklikler ritimleri değiştirebilir.'
WHEN v_period_start < 80  THEN 'Yorgunluk faktörü ve oyuncu değişiklikleri belirleyici hale gelebilir.'
ELSE                           'Son dakikalar: her iki takım için kritik bir denge noktası.'
END;

INSERT INTO wc2026_5min_flow_scenarios (
fixture_id, scenario_version, scenario_context,
home_team_name, away_team_name,
period_label, period_start, period_end,
goal_risk_home, goal_risk_away,
home_pressure_score, away_pressure_score,
yellow_card_risk_home, yellow_card_risk_away,
red_card_risk_home, red_card_risk_away,
corner_risk_home, corner_risk_away,
foul_risk_home, foul_risk_away,
offside_risk_home, offside_risk_away,
substitution_impact_home, substitution_impact_away,
narrative_text, confidence, expected_momentum_side,
is_current, is_public, generated_at
) VALUES (
p_fixture_id, v_new_ver, p_scenario_ctx,
v_fixture.home_team_name, v_fixture.away_team_name,
v_period_label, v_period_start, v_period_end,
v_goal_risk_home, v_goal_risk_away,
v_pressure_home, v_pressure_away,
v_yellow_home, v_yellow_away,
v_red_home, v_red_away,
v_corner_home, v_corner_away,
v_foul_home, v_foul_away,
v_offside_home, v_offside_away,
v_sub_home, v_sub_away,
v_narrative, v_confidence, v_momentum_side,
true, p_publish, now()
);
END LOOP;

END;
$$;
