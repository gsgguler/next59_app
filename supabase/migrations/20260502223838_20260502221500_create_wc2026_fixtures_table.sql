/*
  # Create wc2026_fixtures table

  ## Summary
  Normalized fixture table for all 104 FIFA World Cup 2026 matches.

  ## Tables
  - `wc2026_fixtures` — canonical fixture record for each of the 104 WC2026 matches

  ## Columns
  - `id` — internal UUID PK
  - `match_number` — official FIFA match number (1–104)
  - `stage_code` — FK → wc2026_stages.stage_code
  - `group_label` — group letter A–L (null for knockout)
  - `round_label` — e.g. "Group Stage - 1", "Round of 32"
  - `api_football_fixture_id` — provider fixture id (null for knockout skeletons)
  - `match_date` — UTC kickoff time
  - `home_team_name`, `away_team_name` — resolved names or placeholder text
  - `home_team_placeholder`, `away_team_placeholder` — e.g. "Winner Group A"
  - `home_api_team_id`, `away_api_team_id` — provider team ids (null for knockouts)
  - `venue_id` — FK → wc2026_venues.id
  - `venue_name_raw` — as returned by API or FIFA
  - `fixture_status` — enum: verified_official | needs_review | placeholder
  - `source_url` — where this record was sourced from
  - `source_checked_at` — when source was last checked
  - `ingestion_run_id` — FK → wc2026_ingestion_runs.id (null for manual seeds)
  - `notes` — freeform review notes
  - `created_at`, `updated_at`

  ## Security
  - RLS enabled, read-only for anonymous (public tournament data)
*/

CREATE TABLE IF NOT EXISTS public.wc2026_fixtures (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_number              integer,
  stage_code                text REFERENCES public.wc2026_stages(stage_code),
  group_label               text,
  round_label               text NOT NULL,
  api_football_fixture_id   bigint,
  match_date                timestamptz,
  home_team_name            text,
  away_team_name            text,
  home_team_placeholder     text,
  away_team_placeholder     text,
  home_api_team_id          integer,
  away_api_team_id          integer,
  venue_id                  uuid REFERENCES public.wc2026_venues(id),
  venue_name_raw            text,
  fixture_status            text NOT NULL DEFAULT 'placeholder'
                              CHECK (fixture_status IN ('verified_official','needs_review','placeholder')),
  source_url                text,
  source_checked_at         timestamptz,
  ingestion_run_id          uuid REFERENCES public.wc2026_ingestion_runs(id),
  notes                     text,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wc2026_fixtures_api_id_uidx
  ON public.wc2026_fixtures(api_football_fixture_id)
  WHERE api_football_fixture_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wc2026_fixtures_match_number_uidx
  ON public.wc2026_fixtures(match_number)
  WHERE match_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS wc2026_fixtures_stage_idx ON public.wc2026_fixtures(stage_code);
CREATE INDEX IF NOT EXISTS wc2026_fixtures_date_idx  ON public.wc2026_fixtures(match_date);

ALTER TABLE public.wc2026_fixtures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read wc2026 fixtures"
  ON public.wc2026_fixtures FOR SELECT
  TO anon, authenticated
  USING (true);
