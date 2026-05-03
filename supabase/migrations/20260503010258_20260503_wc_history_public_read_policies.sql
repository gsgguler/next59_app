/*
  # WC History — Public read access for editions, matches, teams

  Allows anonymous and authenticated users to read historical WC data.
  Raw ingestion tables, admin/ops tables remain admin-only.

  Tables opened:
  - wc_history.editions     (tournament metadata: host, champion, dates)
  - wc_history.matches      (all match results, scores, stages, venues)
  - wc_history.teams        (team names per edition)

  Tables kept admin-only:
  - raw_openfootball_responses
  - raw_api_football_responses
  - ingestion_runs
  - coverage_matrix
  - data_quality_issues
  - of_fetch_jobs
  - events / lineups / players / squads / statistics (not yet populated)
*/

-- editions: public read
CREATE POLICY "Public read wc_history editions"
  ON wc_history.editions FOR SELECT
  TO anon, authenticated
  USING (true);

-- matches: public read
CREATE POLICY "Public read wc_history matches"
  ON wc_history.matches FOR SELECT
  TO anon, authenticated
  USING (true);

-- teams: public read
CREATE POLICY "Public read wc_history teams"
  ON wc_history.teams FOR SELECT
  TO anon, authenticated
  USING (true);
