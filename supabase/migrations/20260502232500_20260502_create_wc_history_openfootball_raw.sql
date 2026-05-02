/*
  # Create wc_history.raw_openfootball_responses

  ## Summary
  Stores raw openfootball/worldcup.json payloads before normalization.
  Separate from API-Football raw table to maintain clear provenance.

  ## Security
  - RLS enabled, admin read, service_role write, no anon access
*/

CREATE TABLE IF NOT EXISTS wc_history.raw_openfootball_responses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text NOT NULL DEFAULT 'openfootball_worldcup_json',
  source_url       text NOT NULL,
  edition_year     integer,
  response_hash    text NOT NULL,
  response_json    jsonb NOT NULL DEFAULT '{}',
  fetched_at       timestamptz DEFAULT now(),
  transform_status text DEFAULT 'raw',
  UNIQUE(response_hash)
);

ALTER TABLE wc_history.raw_openfootball_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read openfootball raw"
  ON wc_history.raw_openfootball_responses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')
  ));

CREATE POLICY "Service role write openfootball raw"
  ON wc_history.raw_openfootball_responses FOR INSERT TO service_role WITH CHECK (true);

-- Grant to service_role (already has GRANT ALL from prior migration on schema)
GRANT ALL ON wc_history.raw_openfootball_responses TO service_role;
