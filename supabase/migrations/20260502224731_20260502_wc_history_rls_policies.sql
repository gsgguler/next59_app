/*
  # wc_history RLS policies

  ## Summary
  Admin-only policies for raw/audit tables.
  Normalized tables get read policies for authenticated admin.
  Public access is via views only (created in next migration).

  ## Rules
  - Raw payload tables: admin only
  - Audit/ingestion tables: admin only
  - Normalized tables (editions, teams, matches, etc.): admin write, public views for anon
*/

-- Helper: admin check inline (profiles.role = 'admin')
-- Used in every policy USING clause

-- ── ingestion_runs: admin only ────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history ingestion_runs"
  ON wc_history.ingestion_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history ingestion_runs"
  ON wc_history.ingestion_runs FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role update wc_history ingestion_runs"
  ON wc_history.ingestion_runs FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ── raw_api_football_responses: admin only ────────────────────────────────────
CREATE POLICY "Admin read wc_history raw responses"
  ON wc_history.raw_api_football_responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history raw responses"
  ON wc_history.raw_api_football_responses FOR INSERT TO service_role WITH CHECK (true);

-- ── coverage_matrix: admin only ───────────────────────────────────────────────
CREATE POLICY "Service role write coverage_matrix"
  ON wc_history.coverage_matrix FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role update coverage_matrix"
  ON wc_history.coverage_matrix FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ── editions: admin write, service_role write ─────────────────────────────────
CREATE POLICY "Admin read wc_history editions"
  ON wc_history.editions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history editions"
  ON wc_history.editions FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role update wc_history editions"
  ON wc_history.editions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ── teams ─────────────────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history teams"
  ON wc_history.teams FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history teams"
  ON wc_history.teams FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role update wc_history teams"
  ON wc_history.teams FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ── matches ───────────────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history matches"
  ON wc_history.matches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history matches"
  ON wc_history.matches FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role update wc_history matches"
  ON wc_history.matches FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ── match_statistics ──────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history match_statistics"
  ON wc_history.match_statistics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history match_statistics"
  ON wc_history.match_statistics FOR INSERT TO service_role WITH CHECK (true);

-- ── events ────────────────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history events"
  ON wc_history.events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history events"
  ON wc_history.events FOR INSERT TO service_role WITH CHECK (true);

-- ── lineups ───────────────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history lineups"
  ON wc_history.lineups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history lineups"
  ON wc_history.lineups FOR INSERT TO service_role WITH CHECK (true);

-- ── lineup_players ────────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history lineup_players"
  ON wc_history.lineup_players FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history lineup_players"
  ON wc_history.lineup_players FOR INSERT TO service_role WITH CHECK (true);

-- ── players ───────────────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history players"
  ON wc_history.players FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history players"
  ON wc_history.players FOR INSERT TO service_role WITH CHECK (true);

-- ── squads ────────────────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history squads"
  ON wc_history.squads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history squads"
  ON wc_history.squads FOR INSERT TO service_role WITH CHECK (true);

-- ── venues ────────────────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history venues"
  ON wc_history.venues FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history venues"
  ON wc_history.venues FOR INSERT TO service_role WITH CHECK (true);

-- ── groups ────────────────────────────────────────────────────────────────────
CREATE POLICY "Admin read wc_history groups"
  ON wc_history.groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history groups"
  ON wc_history.groups FOR INSERT TO service_role WITH CHECK (true);

-- ── source_mappings: admin only ───────────────────────────────────────────────
CREATE POLICY "Admin read wc_history source_mappings"
  ON wc_history.source_mappings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history source_mappings"
  ON wc_history.source_mappings FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role update wc_history source_mappings"
  ON wc_history.source_mappings FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ── data_quality_issues: admin only ──────────────────────────────────────────
CREATE POLICY "Admin read wc_history data_quality_issues"
  ON wc_history.data_quality_issues FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin')));

CREATE POLICY "Service role write wc_history data_quality_issues"
  ON wc_history.data_quality_issues FOR INSERT TO service_role WITH CHECK (true);
