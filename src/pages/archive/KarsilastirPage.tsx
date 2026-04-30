import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Swords, Search, AlertCircle, ChevronRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TeamOption {
  team_id: string;
  team_name: string;
}

interface H2HMatch {
  match_id: string;
  match_date: string;
  competition_name: string;
  season_label: string;
  home_team_name: string;
  away_team_name: string;
  home_score_ft: number | null;
  away_score_ft: number | null;
  result: string | null;
}

function useTeamSearch(query: string) {
  const [results, setResults] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.length < 2) { setResults([]); return; }

    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [{ data: h }, { data: a }] = await Promise.all([
          supabase
            .from('v_historical_match_archive')
            .select('home_team_id, home_team_name')
            .ilike('home_team_name', `%${query}%`)
            .limit(80),
          supabase
            .from('v_historical_match_archive')
            .select('away_team_id, away_team_name')
            .ilike('away_team_name', `%${query}%`)
            .limit(80),
        ]);

        const map = new Map<string, TeamOption>();
        for (const r of h ?? []) {
          if (r.home_team_id && !map.has(r.home_team_id))
            map.set(r.home_team_id, { team_id: r.home_team_id, team_name: r.home_team_name });
        }
        for (const r of a ?? []) {
          if (r.away_team_id && !map.has(r.away_team_id))
            map.set(r.away_team_id, { team_id: r.away_team_id, team_name: r.away_team_name });
        }
        setResults(Array.from(map.values()).sort((a, b) => a.team_name.localeCompare(b.team_name, 'tr')));
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return { results, loading };
}

function TeamSearchBox({
  label,
  selected,
  onSelect,
  onClear,
}: {
  label: string;
  selected: TeamOption | null;
  onSelect: (t: TeamOption) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const { results, loading } = useTeamSearch(q);

  if (selected) {
    return (
      <div className="flex items-center justify-between bg-navy-800 border border-champagne/30 rounded-xl px-4 py-3">
        <div>
          <p className="text-[10px] text-navy-500 uppercase tracking-wider">{label}</p>
          <p className="text-sm font-semibold text-white mt-0.5">{selected.team_name}</p>
        </div>
        <button
          onClick={onClear}
          className="p-1 text-navy-500 hover:text-red-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <p className="text-xs text-navy-500 mb-1.5">{label}</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
        <input
          type="text"
          placeholder="Takım ara..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          className="w-full bg-navy-900 border border-navy-700 text-white text-sm rounded-xl pl-9 pr-4 py-2.5 placeholder-navy-600 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
        />
      </div>
      {focused && q.length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-navy-900 border border-navy-700 rounded-xl shadow-2xl z-10 max-h-48 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-3 text-xs text-navy-500">Aranıyor...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-navy-500">Takım bulunamadı.</div>
          ) : (
            results.map((t) => (
              <button
                key={t.team_id}
                onMouseDown={() => { onSelect(t); setQ(''); }}
                className="w-full text-left px-4 py-2.5 text-sm text-navy-300 hover:text-white hover:bg-navy-800/60 transition-colors"
              >
                {t.team_name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function KarsilastirPage() {
  const [teamA, setTeamA] = useState<TeamOption | null>(null);
  const [teamB, setTeamB] = useState<TeamOption | null>(null);
  const [matches, setMatches] = useState<H2HMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Takım Karşılaştırma — Maç Arşivi | Next59';
  }, []);

  useEffect(() => {
    if (!teamA || !teamB) { setMatches([]); return; }

    async function load() {
      if (!teamA || !teamB) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('v_historical_match_archive')
          .select(
            'match_id, match_date, competition_name, season_label, home_team_name, away_team_name, home_score_ft, away_score_ft, result',
          )
          .or(
            `and(home_team_id.eq.${teamA.team_id},away_team_id.eq.${teamB.team_id}),and(home_team_id.eq.${teamB.team_id},away_team_id.eq.${teamA.team_id})`,
          )
          .order('match_date', { ascending: false });

        if (err) throw err;
        setMatches((data as H2HMatch[]) ?? []);
      } catch {
        setError('Karşılaşma verisi yüklenirken bir sorun oluştu.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [teamA, teamB]);

  const winsA = teamA
    ? matches.filter((m) =>
        (m.home_team_name === teamA.team_name && m.result === 'H') ||
        (m.away_team_name === teamA.team_name && m.result === 'A'),
      ).length
    : 0;
  const winsB = teamB
    ? matches.filter((m) =>
        (m.home_team_name === teamB.team_name && m.result === 'H') ||
        (m.away_team_name === teamB.team_name && m.result === 'A'),
      ).length
    : 0;
  const draws = matches.filter((m) => m.result === 'D').length;

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60 bg-navy-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <Link to="/mac-arsivi" className="hover:text-champagne transition-colors">
              Maç Arşivi
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-navy-400">Takım Karşılaştırma</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Swords className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">
                Head-to-Head
              </h1>
              <p className="mt-1 text-sm text-navy-400">
                İki takım arasındaki tüm geçmiş karşılaşmaları görün.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TeamSearchBox
              label="1. Takım"
              selected={teamA}
              onSelect={setTeamA}
              onClear={() => setTeamA(null)}
            />
            <TeamSearchBox
              label="2. Takım"
              selected={teamB}
              onSelect={setTeamB}
              onClear={() => setTeamB(null)}
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!teamA || !teamB ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <Swords className="w-10 h-10 text-navy-700" />
            <p className="text-sm text-navy-500">
              İki takım seçin; aralarındaki tüm karşılaşmalar listelenecek.
            </p>
          </div>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-12 gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-navy-400">{error}</p>
          </div>
        ) : matches.length === 0 ? (
          <p className="text-center text-sm text-navy-500 py-16">
            Bu iki takım arasında arşivde kayıtlı karşılaşma bulunamadı.
          </p>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{winsA}</div>
                <div className="text-xs text-navy-500 mt-1 truncate">{teamA.team_name}</div>
              </div>
              <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-400">{draws}</div>
                <div className="text-xs text-navy-500 mt-1">Beraberlik</div>
              </div>
              <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-sky-400">{winsB}</div>
                <div className="text-xs text-navy-500 mt-1 truncate">{teamB.team_name}</div>
              </div>
            </div>

            <p className="text-xs text-navy-600 mb-3">{matches.length} karşılaşma</p>

            <div className="space-y-2">
              {matches.map((m) => (
                <div
                  key={m.match_id}
                  className="bg-navy-900/50 border border-navy-800/60 rounded-xl p-4"
                >
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-navy-500 mb-2">
                    <span>{formatDate(m.match_date)}</span>
                    <span className="text-navy-700">·</span>
                    <span>{m.competition_name}</span>
                    <span className="text-navy-700">·</span>
                    <span>{m.season_label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-sm font-semibold text-white text-right truncate">
                      {m.home_team_name}
                    </span>
                    <span className="text-base font-bold text-white tabular-nums shrink-0">
                      {m.home_score_ft ?? '–'} – {m.away_score_ft ?? '–'}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-white text-left truncate">
                      {m.away_team_name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
