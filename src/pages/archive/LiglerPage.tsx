import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Search, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LeagueRow {
  competition_id: string;
  competition_name: string;
  match_count: number;
}

export default function LiglerPage() {
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Ligler — Maç Arşivi | Next59';
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('v_historical_match_archive')
          .select('competition_id, competition_name')
          .not('competition_id', 'is', null);

        if (err) throw err;

        const map = new Map<string, LeagueRow>();
        for (const row of data ?? []) {
          if (!row.competition_id) continue;
          const existing = map.get(row.competition_id);
          if (existing) {
            existing.match_count++;
          } else {
            map.set(row.competition_id, {
              competition_id: row.competition_id,
              competition_name: row.competition_name,
              match_count: 1,
            });
          }
        }

        setLeagues(
          Array.from(map.values()).sort((a, b) =>
            a.competition_name.localeCompare(b.competition_name, 'tr'),
          ),
        );
      } catch {
        setError('Lig listesi yüklenirken bir sorun oluştu.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = leagues.filter((l) =>
    l.competition_name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60 bg-navy-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <Link to="/mac-arsivi" className="hover:text-champagne transition-colors">
              Maç Arşivi
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-navy-400">Ligler</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Ligler</h1>
              <p className="mt-1 text-sm text-readable-muted">
                Arşivdeki tüm lig ve turnuvalar. Bir lige tıklayarak filtrelenmiş maç listesine ulaşın.
              </p>
            </div>
          </div>

          <div className="mt-6 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
            <input
              type="text"
              placeholder="Lig ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-navy-900 border border-navy-700 text-white text-sm rounded-lg pl-9 pr-4 py-2.5 placeholder-navy-500 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-16 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-readable-muted">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-readable-muted py-20">Eşleşen lig bulunamadı.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((league) => (
              <Link
                key={league.competition_id}
                to={`/mac-arsivi?lig=${league.competition_id}`}
                className="flex items-center justify-between bg-navy-900/50 hover:bg-navy-900 border border-navy-800/60 hover:border-navy-700 rounded-xl px-4 py-3.5 transition-all group"
              >
                <span className="text-sm font-medium text-white group-hover:text-champagne transition-colors truncate">
                  {league.competition_name}
                </span>
                <span className="ml-3 shrink-0 text-xs text-readable-muted tabular-nums">
                  {league.match_count.toLocaleString('tr-TR')} maç
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
