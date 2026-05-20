import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { transformMatch } from '../lib/transformers';
import type { UIMatch } from '../types/ui-models';
import type { DbMatch } from '../types/schema';

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

      if (controller.signal.aborted) return;

      if (matchErr) {
        setError(matchErr.message);
        setLoading(false);
        return;
      }

      const raw = rows?.[0] ?? null;
      if (!raw) {
        setMatch(null);
        setLoading(false);
        return;
      }

      const { data: predData } = await supabase
        .rpc('get_match_prediction', { p_match_id: matchId })
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      setMatch(transformMatch(raw as unknown as DbMatch, predData ?? null));
      setLoading(false);
    }

    load();

    return () => {
      controller.abort();
    };
  }, [matchId]);

  return { match, loading, error };
}
