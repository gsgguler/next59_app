import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { transformMatch } from '../lib/transformers';
import type { UIMatch } from '../types/ui-models';
import type { DbMatch, DbPrediction } from '../types/schema';

interface UseMatchResult {
  match: UIMatch | null;
  loading: boolean;
  error: string | null;
}

export function useMatch(matchId: string | undefined): UseMatchResult {
  const [match, setMatch] = useState<UIMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!matchId) {
      setMatch(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: rows, error: matchErr } = await supabase
        .from('matches')
        .select(`
          id, competition_season_id,
          home_team_id, away_team_id, venue_id,
          match_date, match_time, timezone, timestamp,
          status_short, status_long, status_elapsed,
          home_score_ft, away_score_ft, round, result,
          home_team:teams!matches_home_team_id_fkey(id, name, short_name, code, logo_url),
          away_team:teams!matches_away_team_id_fkey(id, name, short_name, code, logo_url),
          venue:venues!matches_venue_id_fkey(id, name, city, capacity)
        `)
        .eq('id', matchId)
        .limit(1)
        .abortSignal(controller.signal);

      const raw = rows?.[0] ?? null;

      if (controller.signal.aborted) return;

      if (matchErr) {
        setError(matchErr.message);
        setLoading(false);
        return;
      }

      if (!raw) {
        setMatch(null);
        setLoading(false);
        return;
      }

      const dbMatch = raw as unknown as DbMatch;

      const { data: predData } = await supabase
        .from('predictions')
        .select('id, match_id, prediction_type, predicted_outcome, confidence, odds_fair, explanation_json, is_elite_only, superseded_by, created_at, updated_at')
        .eq('match_id', matchId)
        .is('superseded_by', null)
        .limit(10)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      setMatch(
        transformMatch(dbMatch, (predData as unknown as DbPrediction[]) ?? []),
      );
      setLoading(false);
    }

    load();

    return () => {
      controller.abort();
    };
  }, [matchId]);

  return { match, loading, error };
}
