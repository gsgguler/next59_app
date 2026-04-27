import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { transformMatch } from '../lib/transformers';
import type { UIMatch } from '../types/ui-models';
import type { DbMatch, DbTeamStrength, DbPrediction } from '../types/schema';

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
          id, competition_season_id, matchweek, round_name,
          home_team_id, away_team_id, stadium_id,
          kickoff_at, timezone, status,
          home_goals_ft, away_goals_ft, stage, group_name,
          home_team:teams!matches_home_team_id_fkey(id, name, short_name, tla, country_code, fifa_code, logo_url, team_type, is_active),
          away_team:teams!matches_away_team_id_fkey(id, name, short_name, tla, country_code, fifa_code, logo_url, team_type, is_active),
          stadium:stadiums!matches_stadium_id_fkey(id, name, city, country_code, capacity, timezone)
        `)
        .order('kickoff_at', { ascending: true })
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

      if (rawMatches.length >= MATCH_LIMIT) {
        console.warn(`[useHomeMatches] Query returned ${rawMatches.length} rows (limit: ${MATCH_LIMIT}). Some matches may be missing.`);
      }

      const matchIds = rawMatches.map((m: { id: string }) => m.id);
      const teamIds = rawMatches.flatMap((m: { home_team_id: string; away_team_id: string }) => [m.home_team_id, m.away_team_id]);
      const uniqueTeamIds = [...new Set(teamIds)];

      const [strengthRes, predRes] = await Promise.all([
        supabase
          .from('team_strength_ratings')
          .select('id, team_id, elo_rating, form_score, attack_score, defense_score')
          .in('team_id', uniqueTeamIds)
          .limit(uniqueTeamIds.length * 2)
          .abortSignal(controller.signal),
        supabase
          .from('predictions')
          .select('id, match_id, version, is_current, cassandra_code, statement, probability, confidence_label, category, model_version, model_input_features, model_output_raw, access_level, generated_at')
          .in('match_id', matchIds)
          .eq('is_current', true)
          .limit(matchIds.length * 5)
          .abortSignal(controller.signal),
      ]);

      if (controller.signal.aborted) return;

      const strengthByTeam = new Map<string, DbTeamStrength>();
      if (strengthRes.data) {
        for (const s of strengthRes.data as unknown as DbTeamStrength[]) {
          strengthByTeam.set(s.team_id, s);
        }
      }

      const predsByMatch = new Map<string, DbPrediction[]>();
      if (predRes.data) {
        for (const p of predRes.data as unknown as DbPrediction[]) {
          const arr = predsByMatch.get(p.match_id);
          if (arr) arr.push(p);
          else predsByMatch.set(p.match_id, [p]);
        }
      }

      const uiMatches = (rawMatches as unknown as DbMatch[]).map((raw) =>
        transformMatch(
          raw,
          strengthByTeam.get(raw.home_team_id) ?? null,
          strengthByTeam.get(raw.away_team_id) ?? null,
          predsByMatch.get(raw.id) ?? [],
        ),
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
