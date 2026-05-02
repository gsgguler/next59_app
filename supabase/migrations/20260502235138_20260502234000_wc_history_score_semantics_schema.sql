/*
  # WC History — Score Semantics Schema Extension

  ## Summary
  Adds semantic score fields to wc_history.matches to explicitly separate:
  - 90-minute scores (result_90)
  - Extra-time scores (home/away_score_aet, result_aet)
  - Penalty scores (home/away_penalties, result_penalties)
  - Final winner and decision method (decided_by, final_winner_name)
  - Audit status (score_semantics_status)

  ## New Columns
  - home_score_90 / away_score_90: goals scored in first 90 minutes
  - result_90: match result at 90 minutes (home_win/away_win/draw)
  - home_score_aet / away_score_aet: goals in full extra time (90+ET, cumulative)
  - result_aet: result after extra time
  - home_penalties / away_penalties: penalties scored in shootout
  - result_penalties: winner of shootout (home_win/away_win)
  - final_winner_team_id / final_winner_name: advancing/champion team
  - decided_by: regulation | extra_time | penalties | walkover | unknown
  - score_semantics_status: verified | inferred_from_sources | needs_review | conflict_unresolved

  ## Existing fields preserved (NOT modified)
  - home_score_ft / away_score_ft: API-Football "ft" value = AET/final score if ET occurred
  - result: derived from home_score_ft/away_score_ft (may include ET)

  ## Separation
  - public.matches: NOT TOUCHED
  - model_lab: NOT TOUCHED
  - predictions: NOT TOUCHED
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='home_score_90') THEN
    ALTER TABLE wc_history.matches ADD COLUMN home_score_90 integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='away_score_90') THEN
    ALTER TABLE wc_history.matches ADD COLUMN away_score_90 integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='result_90') THEN
    ALTER TABLE wc_history.matches ADD COLUMN result_90 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='home_score_aet') THEN
    ALTER TABLE wc_history.matches ADD COLUMN home_score_aet integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='away_score_aet') THEN
    ALTER TABLE wc_history.matches ADD COLUMN away_score_aet integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='result_aet') THEN
    ALTER TABLE wc_history.matches ADD COLUMN result_aet text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='home_penalties') THEN
    ALTER TABLE wc_history.matches ADD COLUMN home_penalties integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='away_penalties') THEN
    ALTER TABLE wc_history.matches ADD COLUMN away_penalties integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='result_penalties') THEN
    ALTER TABLE wc_history.matches ADD COLUMN result_penalties text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='final_winner_team_id') THEN
    ALTER TABLE wc_history.matches ADD COLUMN final_winner_team_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='final_winner_name') THEN
    ALTER TABLE wc_history.matches ADD COLUMN final_winner_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='decided_by') THEN
    ALTER TABLE wc_history.matches ADD COLUMN decided_by text
      CHECK (decided_by IN ('regulation','extra_time','penalties','walkover','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='wc_history' AND table_name='matches' AND column_name='score_semantics_status') THEN
    ALTER TABLE wc_history.matches ADD COLUMN score_semantics_status text DEFAULT 'needs_review'
      CHECK (score_semantics_status IN ('verified','inferred_from_sources','needs_review','conflict_unresolved'));
  END IF;
END $$;
