import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TeamResult {
  team_id: string;
  team_name: string;
}

export default function TakimlarPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.title = 'Takımlar — Maç Arşivi | Next59';
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('v_historical_match_archive')
          .select('home_team_id, home_team_name')
          .ilike('home_team_name', `%${query}%`)
          .limit(100);

        const map = new Map<string, TeamResult>();
        for (const row of data ?? []) {
          if (row.home_team_id && !map.has(row.home_team_id)) {
            map.set(row.home_team_id, {
              team_id: row.home_team_id,
              team_name: row.home_team_name,
            });
          }
        }

        const { data: awayData } = await supabase
          .from('v_historical_match_archive')
          .select('away_team_id, away_team_name')
          .ilike('away_team_name', `%${query}%`)
          .limit(100);

        for (const row of awayData ?? []) {
          if (row.away_team_id && !map.has(row.away_team_id)) {
            map.set(row.away_team_id, {
              team_id: row.away_team_id,
              team_name: row.away_team_name,
            });
          }
        }

        setResults(
          Array.from(map.values()).sort((a, b) =>
            a.team_name.localeCompare(b.team_name, 'tr'),
          ),
        );
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60 bg-navy-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <Link to="/mac-arsivi" className="hover:text-champagne transition-colors">
              Maç Arşivi
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-navy-400">Takımlar</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Takımlar</h1>
              <p className="mt-1 text-sm text-readable-muted">
                Arşivdeki bir takımı arayın; o takımın tüm maçlarını filtreli arşivde görün.
              </p>
            </div>
          </div>

          <div className="mt-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-readable-muted" />
            <input
              type="text"
              placeholder="Takım adı girin (en az 2 karakter)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-navy-900 border border-navy-700 text-white text-sm rounded-xl pl-9 pr-4 py-3 placeholder-navy-500 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
              autoFocus
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {query.length < 2 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <Users className="w-10 h-10 text-navy-700" />
            <p className="text-sm text-readable-muted">Takım aramak için en az 2 karakter girin.</p>
          </div>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <p className="text-center text-sm text-readable-muted py-16">
            "{query}" ile eşleşen takım bulunamadı.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-readable-muted mb-3">{results.length} takım bulundu</p>
            {results.map((t) => (
              <Link
                key={t.team_id}
                to={`/mac-arsivi?takim=${t.team_id}`}
                className="flex items-center justify-between bg-navy-900/50 hover:bg-navy-900 border border-navy-800/60 hover:border-navy-700 rounded-xl px-4 py-3 transition-all group"
              >
                <span className="text-sm font-medium text-white group-hover:text-champagne transition-colors">
                  {t.team_name}
                </span>
                <span className="text-xs text-readable-muted group-hover:text-navy-400 transition-colors">
                  Maçları Gör →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
