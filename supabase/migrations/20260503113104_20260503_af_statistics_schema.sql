/*
  # API-Football fixture statistics: schema additions

  ## New columns on match_stats
  - expected_goals_provider: AF-supplied xG (distinct from any internal xg column)
  - goals_prevented: AF goalkeeper metric

  ## New table: api_football_fixture_statistics_raw
  - Admin-only raw store for /fixtures/statistics responses
  - RLS: no anon, service_role write, admin read
*/

-- ── 1. Add new columns to match_stats ───────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_stats' AND column_name = 'expected_goals_provider'
  ) THEN
    ALTER TABLE public.match_stats ADD COLUMN expected_goals_provider numeric;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_stats' AND column_name = 'goals_prevented'
  ) THEN
    ALTER TABLE public.match_stats ADD COLUMN goals_prevented numeric;
  END IF;
END $$;

-- ── 2. Raw statistics store ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_football_fixture_statistics_raw (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                uuid,
  api_football_fixture_id integer NOT NULL,
  endpoint                text,
  response_hash           text UNIQUE,
  response_json           jsonb,
  http_status             integer,
  fetched_at              timestamptz DEFAULT now(),
  transform_status        text DEFAULT 'raw'
);

ALTER TABLE public.api_football_fixture_statistics_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read fixture_statistics_raw"
  ON public.api_football_fixture_statistics_raw FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Service role write fixture_statistics_raw"
  ON public.api_football_fixture_statistics_raw FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update fixture_statistics_raw"
  ON public.api_football_fixture_statistics_raw FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_af_stats_raw_fixture_id
  ON public.api_football_fixture_statistics_raw (api_football_fixture_id);

CREATE INDEX IF NOT EXISTS idx_af_stats_raw_transform
  ON public.api_football_fixture_statistics_raw (transform_status);
