import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { transformMatch } from '../lib/transformers';
import type { UIMatch } from '../types/ui-models';
import type { DbMatch, DbTeamStrength, DbPrediction } from '../types/schema';

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
          id, competition_season_id, matchweek, round_name,
          home_team_id, away_team_id, stadium_id,
          kickoff_at, timezone, status,
          home_goals_ft, away_goals_ft, stage, group_name,
          home_team:teams!matches_home_team_id_fkey(id, name, short_name, tla, country_code, fifa_code, logo_url, team_type, is_active),
          away_team:teams!matches_away_team_id_fkey(id, name, short_name, tla, country_code, fifa_code, logo_url, team_type, is_active),
          stadium:stadiums!matches_stadium_id_fkey(id, name, city, country_code, capacity, timezone)
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

      const [strengthHomeRes, strengthAwayRes, predsRes] = await Promise.all([
        supabase
          .from('team_strength_ratings')
          .select('id, team_id, elo_rating, form_score, attack_score, defense_score')
          .eq('team_id', dbMatch.home_team_id)
          .limit(1)
          .abortSignal(controller.signal),
        supabase
          .from('team_strength_ratings')
          .select('id, team_id, elo_rating, form_score, attack_score, defense_score')
          .eq('team_id', dbMatch.away_team_id)
          .limit(1)
          .abortSignal(controller.signal),
        supabase
          .from('predictions')
          .select('id, match_id, version, is_current, cassandra_code, statement, probability, confidence_label, category, model_version, model_input_features, model_output_raw, access_level, generated_at')
          .eq('match_id', matchId)
          .eq('is_current', true)
          .limit(10)
          .abortSignal(controller.signal),
      ]);

      if (controller.signal.aborted) return;

      const homeStrength = (strengthHomeRes.data?.[0] as unknown as DbTeamStrength) ?? null;
      const awayStrength = (strengthAwayRes.data?.[0] as unknown as DbTeamStrength) ?? null;

      setMatch(
        transformMatch(
          dbMatch,
          homeStrength,
          awayStrength,
          (predsRes.data as unknown as DbPrediction[]) ?? [],
        ),
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
