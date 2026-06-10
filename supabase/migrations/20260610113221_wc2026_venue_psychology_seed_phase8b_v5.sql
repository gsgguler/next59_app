
-- Phase 8B v5: corrected to match actual wc2026_venue_psychology_factors schema
-- Columns: home_crowd_support_score, away_crowd_support_score,
--          home_morale_lift_score, away_morale_lift_score,
--          home_pressure_against_score, away_pressure_against_score,
--          is_home_team_host_country, is_away_team_host_country,
--          host_affinity_notes, assumptions_json, confidence

CREATE OR REPLACE FUNCTION public.populate_wc2026_venue_psychology()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fixture        RECORD;
  v_rows_inserted  integer := 0;
  v_tmp            integer;
  v_home_name      text;
  v_away_name      text;
  v_home_is_host   boolean;
  v_away_is_host   boolean;
  v_host_code      text;   -- venue country code: MX, US, CA
  v_home_hc        text;   -- home team host country code
  v_away_hc        text;   -- away team host country code
  -- output scores
  v_home_crowd     numeric(4,3);
  v_away_crowd     numeric(4,3);
  v_home_morale    numeric(4,3);
  v_away_morale    numeric(4,3);
  v_home_pressure  numeric(4,3);
  v_away_pressure  numeric(4,3);
  v_confidence     numeric(4,3);
  v_affinity_notes text;
BEGIN
  FOR v_fixture IN
    SELECT
      f.id                                AS fixture_id,
      COALESCE(f.home_team_name, 'TBD')   AS home_team_name,
      COALESCE(f.away_team_name, 'TBD')   AS away_team_name,
      f.home_team_name                    AS home_raw,
      f.away_team_name                    AS away_raw,
      COALESCE(v.venue_name, 'Unknown')   AS venue_name,
      COALESCE(v.city, 'Unknown')         AS venue_city,
      COALESCE(v.country_code_host, 'US') AS venue_country,
      f.stage_code,
      f.round_label
    FROM wc2026_fixtures f
    LEFT JOIN wc2026_venues v ON v.id = f.venue_id
  LOOP
    v_home_name  := v_fixture.home_team_name;
    v_away_name  := v_fixture.away_team_name;
    v_host_code  := v_fixture.venue_country;

    v_home_hc := CASE
      WHEN v_home_name ILIKE '%Mexico%'        THEN 'MX'
      WHEN v_home_name ILIKE '%United States%'
           OR v_home_name ILIKE '%USA%'        THEN 'US'
      WHEN v_home_name ILIKE '%Canada%'        THEN 'CA'
      ELSE NULL
    END;

    v_away_hc := CASE
      WHEN v_away_name ILIKE '%Mexico%'        THEN 'MX'
      WHEN v_away_name ILIKE '%United States%'
           OR v_away_name ILIKE '%USA%'        THEN 'US'
      WHEN v_away_name ILIKE '%Canada%'        THEN 'CA'
      ELSE NULL
    END;

    v_home_is_host := v_home_hc IS NOT NULL;
    v_away_is_host := v_away_hc IS NOT NULL;

    -- home_crowd_support_score (0–1): how much crowd backs the home side
    v_home_crowd := CASE
      WHEN v_home_is_host AND v_home_hc = v_host_code  THEN 0.870
      WHEN v_home_is_host                               THEN 0.640
      WHEN v_away_is_host AND v_away_hc = v_host_code  THEN 0.120  -- away team is the "home" crowd fave
      ELSE 0.180
    END;

    -- away_crowd_support_score
    v_away_crowd := CASE
      WHEN v_away_is_host AND v_away_hc = v_host_code  THEN 0.870
      WHEN v_away_is_host                               THEN 0.640
      WHEN v_home_is_host AND v_home_hc = v_host_code  THEN 0.120
      ELSE 0.180
    END;

    -- home_morale_lift_score
    v_home_morale := CASE
      WHEN v_home_is_host AND v_home_hc = v_host_code THEN
        CASE v_host_code WHEN 'MX' THEN 0.900 WHEN 'US' THEN 0.780 WHEN 'CA' THEN 0.720 ELSE 0.700 END
      WHEN v_home_is_host THEN 0.540
      ELSE 0.100
    END;

    -- away_morale_lift_score
    v_away_morale := CASE
      WHEN v_away_is_host AND v_away_hc = v_host_code THEN
        CASE v_host_code WHEN 'MX' THEN 0.900 WHEN 'US' THEN 0.780 WHEN 'CA' THEN 0.720 ELSE 0.700 END
      WHEN v_away_is_host THEN 0.540
      ELSE 0.100
    END;

    -- home_pressure_against_score (opposition crowd hostility toward home side)
    v_home_pressure := CASE
      WHEN v_away_is_host AND v_away_hc = v_host_code  THEN 0.760
      WHEN v_home_is_host AND v_home_hc = v_host_code  THEN 0.090
      ELSE 0.340
    END;

    -- away_pressure_against_score
    v_away_pressure := CASE
      WHEN v_home_is_host AND v_home_hc = v_host_code  THEN 0.760
      WHEN v_away_is_host AND v_away_hc = v_host_code  THEN 0.090
      ELSE 0.340
    END;

    -- confidence: lower for TBD fixtures, higher for group stage (known matchups)
    v_confidence := CASE
      WHEN v_fixture.home_raw IS NULL OR v_fixture.away_raw IS NULL THEN 0.300
      WHEN v_fixture.stage_code = 'GS'                              THEN 0.850
      ELSE 0.650
    END;

    v_affinity_notes := CASE
      WHEN v_home_is_host AND v_home_hc = v_host_code THEN
        v_home_name || ' plays in home country (' || v_host_code || '); strong crowd support expected.'
      WHEN v_away_is_host AND v_away_hc = v_host_code THEN
        v_away_name || ' plays in home country (' || v_host_code || '); strong crowd support expected.'
      WHEN v_home_is_host OR v_away_is_host THEN
        'Host nation playing away from home country venue; reduced but present crowd support.'
      ELSE
        'Neutral fixture; no host nation team involved. Slight home-listed side crowd edge assumed.'
    END;

    INSERT INTO wc2026_venue_psychology_factors (
      fixture_id,
      venue_name,
      venue_city,
      venue_country,
      home_team_name,
      away_team_name,
      is_home_team_host_country,
      is_away_team_host_country,
      home_crowd_support_score,
      away_crowd_support_score,
      home_morale_lift_score,
      away_morale_lift_score,
      home_pressure_against_score,
      away_pressure_against_score,
      host_affinity_notes,
      confidence,
      assumptions_json
    ) VALUES (
      v_fixture.fixture_id,
      v_fixture.venue_name,
      v_fixture.venue_city,
      v_fixture.venue_country,
      v_home_name,
      v_away_name,
      v_home_is_host,
      v_away_is_host,
      v_home_crowd,
      v_away_crowd,
      v_home_morale,
      v_away_morale,
      v_home_pressure,
      v_away_pressure,
      v_affinity_notes,
      v_confidence,
      jsonb_build_object(
        'home_host_country',  v_home_hc,
        'away_host_country',  v_away_hc,
        'venue_host_code',    v_host_code,
        'stage_code',         v_fixture.stage_code,
        'round_label',        v_fixture.round_label,
        'is_tbd',             (v_fixture.home_raw IS NULL OR v_fixture.away_raw IS NULL)
      )
    )
    ON CONFLICT (fixture_id) DO UPDATE SET
      venue_name                  = EXCLUDED.venue_name,
      venue_city                  = EXCLUDED.venue_city,
      venue_country               = EXCLUDED.venue_country,
      home_team_name              = EXCLUDED.home_team_name,
      away_team_name              = EXCLUDED.away_team_name,
      is_home_team_host_country   = EXCLUDED.is_home_team_host_country,
      is_away_team_host_country   = EXCLUDED.is_away_team_host_country,
      home_crowd_support_score    = EXCLUDED.home_crowd_support_score,
      away_crowd_support_score    = EXCLUDED.away_crowd_support_score,
      home_morale_lift_score      = EXCLUDED.home_morale_lift_score,
      away_morale_lift_score      = EXCLUDED.away_morale_lift_score,
      home_pressure_against_score = EXCLUDED.home_pressure_against_score,
      away_pressure_against_score = EXCLUDED.away_pressure_against_score,
      host_affinity_notes         = EXCLUDED.host_affinity_notes,
      confidence                  = EXCLUDED.confidence,
      assumptions_json            = EXCLUDED.assumptions_json,
      updated_at                  = now();

    GET DIAGNOSTICS v_tmp = ROW_COUNT;
    v_rows_inserted := v_rows_inserted + v_tmp;
  END LOOP;

  RETURN v_rows_inserted;
END;
$$;

-- Weekly reseed cron (Mondays 4am, after fixture data refresh)
SELECT cron.schedule(
  'wc2026-venue-psychology-reseed',
  '0 4 * * 1',
  $$SELECT public.populate_wc2026_venue_psychology()$$
);

-- Bootstrap: seed all fixtures now
SELECT public.populate_wc2026_venue_psychology();
