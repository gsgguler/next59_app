
-- Phase 3c: Update generate_wc2026_projected_match_stats
-- Adds: alias table lookup as 3rd step, correct p_force sealing behavior

CREATE OR REPLACE FUNCTION public.generate_wc2026_projected_match_stats(
  p_fixture_id uuid,
  p_publish    boolean DEFAULT true,
  p_force      boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
v_fixture    record;
v_home_feat  record;
v_away_feat  record;
v_ver        integer;
v_sealed     integer;

v_h_shots    numeric;
v_a_shots    numeric;
v_h_sot      numeric;
v_a_sot      numeric;
v_h_goals    numeric;
v_a_goals    numeric;
v_h_fouls    numeric;
v_a_fouls    numeric;
v_h_corners  numeric;
v_a_corners  numeric;
v_h_cards    numeric;
v_a_cards    numeric;
v_h_poss     numeric;
v_a_poss     numeric;
v_h_xg       numeric;
v_a_xg       numeric;
v_confidence numeric;
v_result     jsonb;

v_home_alias text;
v_away_alias text;
BEGIN
SELECT * INTO v_fixture FROM wc2026_fixtures WHERE id = p_fixture_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Fixture % not found', p_fixture_id; END IF;

-- Check if current projected stats already exist
SELECT COUNT(*) INTO v_sealed
FROM   wc2026_projected_match_stats
WHERE  fixture_id = p_fixture_id AND is_current = true;

IF v_sealed > 0 AND NOT p_force THEN
SELECT row_to_json(pms)::jsonb INTO v_result
FROM   wc2026_projected_match_stats pms
WHERE  fixture_id = p_fixture_id AND is_current = true LIMIT 1;
RETURN v_result;
END IF;

-- p_force: seal existing current rows
IF v_sealed > 0 AND p_force THEN
UPDATE wc2026_projected_match_stats
SET    is_current = false, sealed_at = now()
WHERE  fixture_id = p_fixture_id AND is_current = true;
END IF;

-- Get scenario version to align with
SELECT COALESCE(MAX(scenario_version), 1) INTO v_ver
FROM   wc2026_5min_flow_scenarios
WHERE  fixture_id = p_fixture_id AND is_current = true;

-- Qualifier features: Step 1 exact match
SELECT * INTO v_home_feat FROM wc_qualifier_model_features
WHERE team_name = v_fixture.home_team_name LIMIT 1;

-- Step 2: alias fallback for home
IF NOT FOUND THEN
SELECT alias_name INTO v_home_alias
FROM public.wc2026_team_name_aliases
WHERE canonical_name = v_fixture.home_team_name
  AND alias_name != v_fixture.home_team_name
LIMIT 1;
IF v_home_alias IS NOT NULL THEN
  SELECT * INTO v_home_feat FROM wc_qualifier_model_features
  WHERE team_name = v_home_alias LIMIT 1;
END IF;
END IF;

-- Step 1 exact for away
SELECT * INTO v_away_feat FROM wc_qualifier_model_features
WHERE team_name = v_fixture.away_team_name LIMIT 1;

-- Step 2: alias fallback for away
IF NOT FOUND THEN
SELECT alias_name INTO v_away_alias
FROM public.wc2026_team_name_aliases
WHERE canonical_name = v_fixture.away_team_name
  AND alias_name != v_fixture.away_team_name
LIMIT 1;
IF v_away_alias IS NOT NULL THEN
  SELECT * INTO v_away_feat FROM wc_qualifier_model_features
  WHERE team_name = v_away_alias LIMIT 1;
END IF;
END IF;

-- Use actual qualifier stats directly where available
v_h_shots   := COALESCE(v_home_feat.avg_total_shots,        12.0);
v_a_shots   := COALESCE(v_away_feat.avg_total_shots,        11.0);
v_h_sot     := COALESCE(v_home_feat.avg_shots_on_goal,       4.5);
v_a_sot     := COALESCE(v_away_feat.avg_shots_on_goal,       4.0);
v_h_fouls   := COALESCE(v_home_feat.avg_fouls,              13.0);
v_a_fouls   := COALESCE(v_away_feat.avg_fouls,              13.0);
v_h_corners := COALESCE(v_home_feat.avg_corners,             5.0);
v_a_corners := COALESCE(v_away_feat.avg_corners,             4.5);
v_h_cards   := COALESCE(v_home_feat.avg_yellow_cards,        2.5);
v_a_cards   := COALESCE(v_away_feat.avg_yellow_cards,        2.5);

-- Goals projection capped
v_h_goals := GREATEST(0.3, LEAST(4.0,
COALESCE(v_home_feat.qualifier_goals_for_per_match, 1.4)));
v_a_goals := GREATEST(0.3, LEAST(4.0,
COALESCE(v_away_feat.qualifier_goals_for_per_match, 1.2)));

-- Possession
v_h_poss := COALESCE(v_home_feat.avg_possession_pct, 50.0);
v_a_poss := 100.0 - v_h_poss;

-- xG: use qualifier xg when available, proxy from goals if not
v_h_xg := COALESCE(
  NULLIF(v_home_feat.xg_for_per_match, 0),
  v_home_feat.qualifier_goals_for_per_match,
  NULL
);
v_a_xg := COALESCE(
  NULLIF(v_away_feat.xg_for_per_match, 0),
  v_away_feat.qualifier_goals_for_per_match,
  NULL
);

-- Confidence
v_confidence := CASE
WHEN v_home_feat.team_name IS NOT NULL AND v_away_feat.team_name IS NOT NULL
AND v_home_feat.detailed_stats_confidence > 0.7
AND v_away_feat.detailed_stats_confidence > 0.7 THEN 0.78
WHEN v_home_feat.team_name IS NOT NULL AND v_away_feat.team_name IS NOT NULL THEN 0.62
WHEN v_home_feat.team_name IS NOT NULL OR  v_away_feat.team_name IS NOT NULL THEN 0.45
ELSE 0.28
END;

INSERT INTO wc2026_projected_match_stats (
fixture_id, scenario_version,
home_team_name, away_team_name,
home_total_shots, away_total_shots,
home_shots_on_target, away_shots_on_target,
home_possession_pct, away_possession_pct,
home_fouls, away_fouls,
home_yellow_cards, away_yellow_cards,
home_red_cards, away_red_cards,
home_corners, away_corners,
home_goals_projection, away_goals_projection,
home_xg, away_xg,
confidence, is_current, is_public, generated_at
) VALUES (
p_fixture_id, v_ver,
v_fixture.home_team_name, v_fixture.away_team_name,
ROUND(v_h_shots::numeric,   2), ROUND(v_a_shots::numeric,   2),
ROUND(v_h_sot::numeric,     2), ROUND(v_a_sot::numeric,     2),
ROUND(v_h_poss::numeric,    1), ROUND(v_a_poss::numeric,    1),
ROUND(v_h_fouls::numeric,   2), ROUND(v_a_fouls::numeric,   2),
ROUND(v_h_cards::numeric,   2), ROUND(v_a_cards::numeric,   2),
0, 0,
ROUND(v_h_corners::numeric, 2), ROUND(v_a_corners::numeric, 2),
ROUND(v_h_goals::numeric,   2), ROUND(v_a_goals::numeric,   2),
CASE WHEN v_h_xg IS NOT NULL THEN ROUND(v_h_xg::numeric, 2) ELSE NULL END,
CASE WHEN v_a_xg IS NOT NULL THEN ROUND(v_a_xg::numeric, 2) ELSE NULL END,
ROUND(v_confidence::numeric, 4),
true, p_publish, now()
)
ON CONFLICT (fixture_id, scenario_version) DO NOTHING;

SELECT row_to_json(pms)::jsonb INTO v_result
FROM   wc2026_projected_match_stats pms
WHERE  fixture_id = p_fixture_id AND scenario_version = v_ver LIMIT 1;

RETURN v_result;
END;
$$;
