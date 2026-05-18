/*
  # Phase 3 — Bootstrap ELO ratings for unrated teams

  ## Summary
  Three teams (Ajax, Groningen, Pisa) are absent from model_lab.team_elo_ratings
  despite having extensive completed match histories. This blocks upcoming fixtures
  (Ajax/Groningen on 2026-05-21, Lazio/Pisa on 2026-05-24) from achieving
  elo_readiness=true.

  The ELO computation pipeline was never executed for Eredivisie or Serie B
  competitions. This migration computes accurate ELO ratings from scratch using
  their full historical records via the standard Elo formula (K=20, HA=50pts).

  ## Changes

  1. Computes bootstrap ELO for Ajax and Groningen from all Eredivisie matches.
  2. Computes bootstrap ELO for Pisa from Serie B history, applies a 15% league
     transition regression toward mean for the Serie A entry.
     season_label='202526_bootstrap_promoted' signals prediction uncertainty.
  3. Updates prematch_upcoming_feature_snapshots to mark Pisa fixture as promoted.
  4. Re-runs assess_upcoming_match_readiness for both blocked fixtures.

  ## ELO formula
  - Starting ELO: 1500 for all teams
  - K factor: 20
  - Home advantage: +50 pts added to home team's effective rating
  - Pisa league-transition penalty: new_elo = 1500 + (serie_b_elo - 1500) * 0.85
*/

DO $$
DECLARE
  v_team         RECORD;
  v_match        RECORD;
  v_home_elo     numeric;
  v_away_elo     numeric;
  v_home_elo_new numeric;
  v_away_elo_new numeric;
  v_exp_home     numeric;
  v_exp_away     numeric;
  v_result_home  numeric;
  v_result_away  numeric;
  v_k            numeric := 20.0;
  v_ha_bonus     numeric := 50.0;

  c_ajax_id      uuid := 'e38e7e3c-13a4-4d7d-83a9-ad396de9880e';
  c_gron_id      uuid := '3a2537ca-9b6b-4eaa-83f6-73e7bf9cfc83';
  c_pisa_id      uuid := '986bdfc1-9faa-4867-af01-f0f2bc5d9a79';

  c_eredivisie   uuid := '08a9c47e-4e12-4160-b131-1c5c362d7e0e';
  c_serie_a      uuid := 'e9a473df-4d3c-4937-9d80-a1f394c6f5ae';
  c_serie_b      uuid := '0d9cd45d-100c-45dc-9f1d-39d13b4237a7';

  v_elo_map      jsonb := '{}'::jsonb;

  v_elo_val      numeric;
  v_last_match   uuid;
  v_last_date    date;
  v_matches_home integer;
  v_matches_away integer;
  v_total        integer;
  v_pisa_b_elo   numeric;
  v_pisa_a_elo   numeric;
  v_team_count   integer := 0;

BEGIN
  RAISE NOTICE 'Phase 3: Bootstrap ELO computation starting...';

  -- ─── PASS 1: Eredivisie (Ajax + Groningen) ───────────────────────────────
  FOR v_team IN (
    SELECT DISTINCT home_team_id AS tid FROM public.matches m
    JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
    WHERE cs.competition_id = c_eredivisie AND m.home_score_ft IS NOT NULL
    UNION
    SELECT DISTINCT away_team_id FROM public.matches m
    JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
    WHERE cs.competition_id = c_eredivisie AND m.home_score_ft IS NOT NULL
  ) LOOP
    v_elo_map    := jsonb_set(v_elo_map, ARRAY[v_team.tid::text], '1500'::jsonb);
    v_team_count := v_team_count + 1;
  END LOOP;

  RAISE NOTICE 'Eredivisie teams initialised: %', v_team_count;

  FOR v_match IN (
    SELECT
      m.id,
      m.home_team_id,
      m.away_team_id,
      m.home_score_ft,
      m.away_score_ft,
      m.match_date
    FROM public.matches m
    JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
    WHERE cs.competition_id = c_eredivisie
      AND m.home_score_ft IS NOT NULL
      AND m.away_score_ft IS NOT NULL
    ORDER BY m.match_date ASC, m.id ASC
  ) LOOP
    v_home_elo := COALESCE((v_elo_map ->> v_match.home_team_id::text)::numeric, 1500.0);
    v_away_elo := COALESCE((v_elo_map ->> v_match.away_team_id::text)::numeric, 1500.0);

    v_exp_home := 1.0 / (1.0 + power(10.0, (v_away_elo - v_home_elo - v_ha_bonus) / 400.0));
    v_exp_away := 1.0 - v_exp_home;

    IF v_match.home_score_ft > v_match.away_score_ft THEN
      v_result_home := 1.0; v_result_away := 0.0;
    ELSIF v_match.home_score_ft = v_match.away_score_ft THEN
      v_result_home := 0.5; v_result_away := 0.5;
    ELSE
      v_result_home := 0.0; v_result_away := 1.0;
    END IF;

    v_home_elo_new := v_home_elo + v_k * (v_result_home - v_exp_home);
    v_away_elo_new := v_away_elo + v_k * (v_result_away - v_exp_away);

    v_elo_map := jsonb_set(v_elo_map, ARRAY[v_match.home_team_id::text], to_jsonb(v_home_elo_new));
    v_elo_map := jsonb_set(v_elo_map, ARRAY[v_match.away_team_id::text], to_jsonb(v_away_elo_new));
  END LOOP;

  RAISE NOTICE 'Eredivisie ELO pass complete';

  -- Ajax: aggregate stats then upsert
  SELECT
    COUNT(*) FILTER (WHERE m.home_team_id = c_ajax_id),
    COUNT(*) FILTER (WHERE m.away_team_id = c_ajax_id),
    MAX(m.match_date)
  INTO v_matches_home, v_matches_away, v_last_date
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  WHERE cs.competition_id = c_eredivisie
    AND (m.home_team_id = c_ajax_id OR m.away_team_id = c_ajax_id)
    AND m.home_score_ft IS NOT NULL;

  SELECT m.id INTO v_last_match
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  WHERE cs.competition_id = c_eredivisie
    AND (m.home_team_id = c_ajax_id OR m.away_team_id = c_ajax_id)
    AND m.match_date = v_last_date
    AND m.home_score_ft IS NOT NULL
  LIMIT 1;

  v_total   := v_matches_home + v_matches_away;
  v_elo_val := ROUND(COALESCE((v_elo_map ->> c_ajax_id::text)::numeric, 1500.0), 2);

  INSERT INTO model_lab.team_elo_ratings (
    id, team_id, competition_id,
    elo_overall, elo_home, elo_away,
    matches_played, matches_home, matches_away,
    last_match_date, last_match_id, season_label,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(), c_ajax_id, c_eredivisie,
    v_elo_val, v_elo_val + 15, v_elo_val - 15,
    v_total, v_matches_home, v_matches_away,
    v_last_date, v_last_match, '202526',
    now(), now()
  )
  ON CONFLICT (team_id, competition_id) DO UPDATE SET
    elo_overall     = EXCLUDED.elo_overall,
    elo_home        = EXCLUDED.elo_home,
    elo_away        = EXCLUDED.elo_away,
    matches_played  = EXCLUDED.matches_played,
    matches_home    = EXCLUDED.matches_home,
    matches_away    = EXCLUDED.matches_away,
    last_match_date = EXCLUDED.last_match_date,
    season_label    = EXCLUDED.season_label,
    updated_at      = now();

  RAISE NOTICE 'Ajax ELO bootstrapped: % (% matches)', v_elo_val, v_total;

  -- Groningen: aggregate stats then upsert
  SELECT
    COUNT(*) FILTER (WHERE m.home_team_id = c_gron_id),
    COUNT(*) FILTER (WHERE m.away_team_id = c_gron_id),
    MAX(m.match_date)
  INTO v_matches_home, v_matches_away, v_last_date
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  WHERE cs.competition_id = c_eredivisie
    AND (m.home_team_id = c_gron_id OR m.away_team_id = c_gron_id)
    AND m.home_score_ft IS NOT NULL;

  SELECT m.id INTO v_last_match
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  WHERE cs.competition_id = c_eredivisie
    AND (m.home_team_id = c_gron_id OR m.away_team_id = c_gron_id)
    AND m.match_date = v_last_date
    AND m.home_score_ft IS NOT NULL
  LIMIT 1;

  v_total   := v_matches_home + v_matches_away;
  v_elo_val := ROUND(COALESCE((v_elo_map ->> c_gron_id::text)::numeric, 1500.0), 2);

  INSERT INTO model_lab.team_elo_ratings (
    id, team_id, competition_id,
    elo_overall, elo_home, elo_away,
    matches_played, matches_home, matches_away,
    last_match_date, last_match_id, season_label,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(), c_gron_id, c_eredivisie,
    v_elo_val, v_elo_val + 15, v_elo_val - 15,
    v_total, v_matches_home, v_matches_away,
    v_last_date, v_last_match, '202526',
    now(), now()
  )
  ON CONFLICT (team_id, competition_id) DO UPDATE SET
    elo_overall     = EXCLUDED.elo_overall,
    elo_home        = EXCLUDED.elo_home,
    elo_away        = EXCLUDED.elo_away,
    matches_played  = EXCLUDED.matches_played,
    matches_home    = EXCLUDED.matches_home,
    matches_away    = EXCLUDED.matches_away,
    last_match_date = EXCLUDED.last_match_date,
    season_label    = EXCLUDED.season_label,
    updated_at      = now();

  RAISE NOTICE 'Groningen ELO bootstrapped: % (% matches)', v_elo_val, v_total;

  -- ─── PASS 2: Serie B (Pisa) ──────────────────────────────────────────────
  v_elo_map    := '{}'::jsonb;
  v_team_count := 0;

  FOR v_team IN (
    SELECT DISTINCT home_team_id AS tid FROM public.matches m
    JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
    WHERE cs.competition_id = c_serie_b AND m.home_score_ft IS NOT NULL
    UNION
    SELECT DISTINCT away_team_id FROM public.matches m
    JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
    WHERE cs.competition_id = c_serie_b AND m.home_score_ft IS NOT NULL
  ) LOOP
    v_elo_map    := jsonb_set(v_elo_map, ARRAY[v_team.tid::text], '1500'::jsonb);
    v_team_count := v_team_count + 1;
  END LOOP;

  RAISE NOTICE 'Serie B teams initialised: %', v_team_count;

  FOR v_match IN (
    SELECT
      m.id,
      m.home_team_id,
      m.away_team_id,
      m.home_score_ft,
      m.away_score_ft,
      m.match_date
    FROM public.matches m
    JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
    WHERE cs.competition_id = c_serie_b
      AND m.home_score_ft IS NOT NULL
      AND m.away_score_ft IS NOT NULL
    ORDER BY m.match_date ASC, m.id ASC
  ) LOOP
    v_home_elo := COALESCE((v_elo_map ->> v_match.home_team_id::text)::numeric, 1500.0);
    v_away_elo := COALESCE((v_elo_map ->> v_match.away_team_id::text)::numeric, 1500.0);

    v_exp_home := 1.0 / (1.0 + power(10.0, (v_away_elo - v_home_elo - v_ha_bonus) / 400.0));
    v_exp_away := 1.0 - v_exp_home;

    IF v_match.home_score_ft > v_match.away_score_ft THEN
      v_result_home := 1.0; v_result_away := 0.0;
    ELSIF v_match.home_score_ft = v_match.away_score_ft THEN
      v_result_home := 0.5; v_result_away := 0.5;
    ELSE
      v_result_home := 0.0; v_result_away := 1.0;
    END IF;

    v_home_elo_new := v_home_elo + v_k * (v_result_home - v_exp_home);
    v_away_elo_new := v_away_elo + v_k * (v_result_away - v_exp_away);

    v_elo_map := jsonb_set(v_elo_map, ARRAY[v_match.home_team_id::text], to_jsonb(v_home_elo_new));
    v_elo_map := jsonb_set(v_elo_map, ARRAY[v_match.away_team_id::text], to_jsonb(v_away_elo_new));
  END LOOP;

  RAISE NOTICE 'Serie B ELO pass complete';

  -- Pisa: league transition penalty then upsert as Serie A entry
  v_pisa_b_elo := COALESCE((v_elo_map ->> c_pisa_id::text)::numeric, 1500.0);
  v_pisa_a_elo := ROUND(1500.0 + (v_pisa_b_elo - 1500.0) * 0.85, 2);

  SELECT
    COUNT(*) FILTER (WHERE m.home_team_id = c_pisa_id),
    COUNT(*) FILTER (WHERE m.away_team_id = c_pisa_id),
    MAX(m.match_date)
  INTO v_matches_home, v_matches_away, v_last_date
  FROM public.matches m
  JOIN public.competition_seasons cs ON cs.id = m.competition_season_id
  WHERE cs.competition_id = c_serie_b
    AND (m.home_team_id = c_pisa_id OR m.away_team_id = c_pisa_id)
    AND m.home_score_ft IS NOT NULL;

  INSERT INTO model_lab.team_elo_ratings (
    id, team_id, competition_id,
    elo_overall, elo_home, elo_away,
    matches_played, matches_home, matches_away,
    last_match_date, last_match_id, season_label,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(), c_pisa_id, c_serie_a,
    v_pisa_a_elo, v_pisa_a_elo + 15, v_pisa_a_elo - 15,
    0, 0, 0,
    v_last_date, NULL, '202526_bootstrap_promoted',
    now(), now()
  )
  ON CONFLICT (team_id, competition_id) DO UPDATE SET
    elo_overall     = EXCLUDED.elo_overall,
    elo_home        = EXCLUDED.elo_home,
    elo_away        = EXCLUDED.elo_away,
    season_label    = EXCLUDED.season_label,
    updated_at      = now();

  RAISE NOTICE 'Pisa ELO bootstrapped (Serie B=%, Serie A adjusted=%)',
    ROUND(v_pisa_b_elo, 1), v_pisa_a_elo;

  -- ─── Mark Pisa fixture as promoted_team_bootstrap ────────────────────────
  UPDATE model_lab.prematch_upcoming_feature_snapshots
  SET
    is_promoted_team        = true,
    promoted_team_bootstrap = true
  WHERE match_id = '2ef2b8c2-ee20-4f1b-bd1d-5c7693e2f32c';

  -- ─── Re-assess readiness for previously blocked fixtures ─────────────────
  BEGIN
    PERFORM model_lab.assess_upcoming_match_readiness('ad3eade7-38cb-4964-a090-cd8e7cde14a7');
    RAISE NOTICE 'Readiness re-assessed: Ajax/Groningen';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Readiness re-assess failed for Ajax/Groningen: %', SQLERRM;
  END;

  BEGIN
    PERFORM model_lab.assess_upcoming_match_readiness('2ef2b8c2-ee20-4f1b-bd1d-5c7693e2f32c');
    RAISE NOTICE 'Readiness re-assessed: Lazio/Pisa';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Readiness re-assess failed for Lazio/Pisa: %', SQLERRM;
  END;

  RAISE NOTICE 'Phase 3: Bootstrap ELO complete';
END $$;
