import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { transformMatch } from '../lib/transformers';
import type { UIMatch } from '../types/ui-models';
import type { DbMatch, DbPrediction } from '../types/schema';

const MATCH_LIMIT = 50;

interface UseHomeMatchesResult {
  matches: UIMatch[];
  loading: boolean;
  error: string | null;
  empty: boolean;
}

export function useHomeMatches(): UseHomeMatchesResult {
  const [matches, setMatches] = useState<UIMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: rawMatches, error: matchErr } = await supabase
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
        .order('match_date', { ascending: true })
        .limit(MATCH_LIMIT)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (matchErr) {
        setError(matchErr.message);
        setLoading(false);
        return;
      }

      if (!rawMatches || rawMatches.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const matchIds = rawMatches.map((m: { id: string }) => m.id);

      const { data: predData } = await supabase
        .from('predictions')
        .select('id, match_id, prediction_type, predicted_outcome, confidence, odds_fair, explanation_json, is_elite_only, superseded_by, created_at, updated_at')
        .in('match_id', matchIds)
        .is('superseded_by', null)
        .limit(matchIds.length * 5)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      const predsByMatch = new Map<string, DbPrediction[]>();
      if (predData) {
        for (const p of predData as unknown as DbPrediction[]) {
          const arr = predsByMatch.get(p.match_id);
          if (arr) arr.push(p);
          else predsByMatch.set(p.match_id, [p]);
        }
      }

      const uiMatches = (rawMatches as unknown as DbMatch[]).map((raw) =>
        transformMatch(raw, predsByMatch.get(raw.id) ?? []),
      );

      setMatches(uiMatches);
      setLoading(false);
    }

    load();

    return () => {
      controller.abort();
    };
  }, []);

  return {
    matches,
    loading,
    error,
    empty: !loading && !error && matches.length === 0,
  };
}
