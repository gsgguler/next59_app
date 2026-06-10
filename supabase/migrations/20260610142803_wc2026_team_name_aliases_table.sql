
-- Phase 2: Create wc2026_team_name_aliases table
-- Provides canonical name → alias mapping for team name normalization across tables

CREATE TABLE IF NOT EXISTS public.wc2026_team_name_aliases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name    text NOT NULL,
  alias_name        text NOT NULL,
  normalized_alias  text NOT NULL,
  source            text DEFAULT 'manual_model_mapping',
  context_note      text,
  created_at        timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wc2026_alias_normalized
  ON public.wc2026_team_name_aliases(normalized_alias);

ALTER TABLE public.wc2026_team_name_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_aliases_public" ON public.wc2026_team_name_aliases
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "insert_aliases_service" ON public.wc2026_team_name_aliases
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "update_aliases_service" ON public.wc2026_team_name_aliases
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "delete_aliases_service" ON public.wc2026_team_name_aliases
  FOR DELETE TO authenticated USING (true);

-- Seed: all known team name variants for WC2026
-- canonical_name = the name used in wc2026_team_pool (primary reference)
-- alias_name = alternate spellings found in other tables
-- normalized_alias = lower(regexp_replace(alias_name, '[^a-zA-Z]', '', 'g'))

INSERT INTO public.wc2026_team_name_aliases
  (canonical_name, alias_name, normalized_alias, context_note)
VALUES
  -- Czechia variants
  ('Czechia', 'Czech Republic',   'czechrepublic',        'FIFA/API name; used in wc2026_fixtures + wc_qualifier_model_features'),
  ('Czechia', 'Czechia',          'czechia',              'pool name; alias row added to model_features'),
  -- DR Congo variants
  ('DR Congo', 'Congo DR',        'congodr',              'FIFA/API name; used in wc2026_fixtures + wc_qualifier_model_features'),
  ('DR Congo', 'DR Congo',        'drcongo',              'pool name; alias row added to model_features'),
  ('DR Congo', 'Democratic Republic of Congo', 'democraticrepublicofcongo', 'long-form variant'),
  -- USA variants
  ('USA', 'United States',        'unitedstates',         'FIFA/API name variant'),
  ('USA', 'USA',                  'usa',                  'pool name'),
  ('USA', 'United States of America', 'unitedstatesofamerica', 'full official name'),
  -- South Korea variants
  ('South Korea', 'Korea Republic', 'korearepublic',      'FIFA official name'),
  ('South Korea', 'South Korea',  'southkorea',           'pool name'),
  ('South Korea', 'Republic of Korea', 'republicofkorea', 'alternate'),
  -- Iran variants
  ('Iran', 'IR Iran',             'iriran',               'FIFA official name'),
  ('Iran', 'Iran',                'iran',                 'pool name'),
  -- Ivory Coast variants
  ('Ivory Coast', 'Côte d''Ivoire', 'cotedivoire',        'FIFA official name (French)'),
  ('Ivory Coast', 'Ivory Coast',  'ivorycoast',           'pool name (English)'),
  ('Ivory Coast', 'Cote d''Ivoire', 'cotedivoire2',       'without accent variant'),
  -- Türkiye variants
  ('Türkiye', 'Turkey',           'turkey',               'pre-2022 FIFA name'),
  ('Türkiye', 'Türkiye',          'turkiye',              'pool name (post-2022)')
ON CONFLICT (normalized_alias) DO UPDATE
  SET canonical_name = EXCLUDED.canonical_name,
      alias_name     = EXCLUDED.alias_name,
      context_note   = EXCLUDED.context_note;

-- Helper function: resolve any team name to its pool canonical name
CREATE OR REPLACE FUNCTION public.wc2026_resolve_team_name(p_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_norm        text;
  v_canonical   text;
BEGIN
  -- Step 1: exact match in pool
  SELECT team_name INTO v_canonical
  FROM wc2026_team_pool
  WHERE team_name = p_name
  LIMIT 1;
  IF FOUND THEN RETURN v_canonical; END IF;

  -- Step 2: check alias table by alias_name exact
  SELECT canonical_name INTO v_canonical
  FROM wc2026_team_name_aliases
  WHERE alias_name = p_name
  LIMIT 1;
  IF FOUND THEN RETURN v_canonical; END IF;

  -- Step 3: check alias table by normalized alias
  v_norm := lower(regexp_replace(p_name, '[^a-zA-Z]', '', 'g'));
  SELECT canonical_name INTO v_canonical
  FROM wc2026_team_name_aliases
  WHERE normalized_alias = v_norm
  LIMIT 1;
  IF FOUND THEN RETURN v_canonical; END IF;

  -- Step 4: direct normalized match against model_features
  SELECT team_name INTO v_canonical
  FROM wc_qualifier_model_features
  WHERE lower(regexp_replace(team_name, '[^a-zA-Z]', '', 'g')) = v_norm
  LIMIT 1;
  IF FOUND THEN RETURN v_canonical; END IF;

  -- Fallback: return original
  RETURN p_name;
END;
$$;
