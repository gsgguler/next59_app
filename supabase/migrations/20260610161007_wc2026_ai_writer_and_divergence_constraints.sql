
-- Unique constraint for divergence upsert
ALTER TABLE wc2026_model_market_divergence
  ADD CONSTRAINT wc2026_mmd_fixture_version_unique
  UNIQUE (fixture_id, scenario_version);

-- RLS + grants for ai_narrative_runs (anon can read)
CREATE POLICY "anon_read_ai_runs" ON wc2026_ai_narrative_runs
  FOR SELECT TO anon USING (true);

GRANT SELECT ON wc2026_ai_narrative_runs TO anon;
GRANT SELECT ON wc2026_model_market_divergence TO anon;

-- RLS for divergence table
ALTER TABLE wc2026_model_market_divergence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_divergence" ON wc2026_model_market_divergence
  FOR SELECT TO anon, authenticated USING (true);

-- Public RPC: get latest sanity check + ai run status for a fixture
CREATE OR REPLACE FUNCTION public.wc2026_get_narrative_audit(p_fixture_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'divergence', (
      SELECT jsonb_build_object(
        'model_home_pct',   d.model_home_pct,
        'model_draw_pct',   d.model_draw_pct,
        'model_away_pct',   d.model_away_pct,
        'market_home_pct',  d.market_home_pct,
        'market_draw_pct',  d.market_draw_pct,
        'market_away_pct',  d.market_away_pct,
        'total_divergence', d.total_divergence,
        'severity',         d.severity,
        'notes',            d.notes,
        'created_at',       d.created_at
      )
      FROM wc2026_model_market_divergence d
      WHERE d.fixture_id = p_fixture_id
      ORDER BY d.created_at DESC
      LIMIT 1
    ),
    'ai_runs', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',            r.id,
          'status',        r.status,
          'model_name',    r.model_name,
          'prompt_version',r.prompt_version,
          'created_at',    r.created_at,
          'error_text',    r.error_text
        ) ORDER BY r.created_at DESC
      )
      FROM wc2026_ai_narrative_runs r
      WHERE r.fixture_id = p_fixture_id
      LIMIT 5
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.wc2026_get_narrative_audit(uuid) TO anon, authenticated;
