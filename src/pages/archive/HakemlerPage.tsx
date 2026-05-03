import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Scale, Search, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface RefereeRow {
  name: string;
  match_count: number;
}

export default function HakemlerPage() {
  const [referees, setReferees] = useState<RefereeRow[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.title = 'Hakem Arşivi — Maç Arşivi | Next59';
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSearch(searchInput), 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [searchInput]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from('v_historical_match_archive')
          .select('referee')
          .not('referee', 'is', null);

        if (search.length >= 2) {
          query = query.ilike('referee', `%${search}%`);
        }

        const { data, error: err } = await query;
        if (err) throw err;

        const map = new Map<string, number>();
        for (const row of data ?? []) {
          if (!row.referee) continue;
          map.set(row.referee, (map.get(row.referee) ?? 0) + 1);
        }

        setReferees(
          Array.from(map.entries())
            .map(([name, match_count]) => ({ name, match_count }))
            .sort((a, b) => b.match_count - a.match_count),
        );
      } catch {
        setError('Hakem listesi yüklenirken bir sorun oluştu.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [search]);

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60 bg-navy-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <Link to="/mac-arsivi" className="hover:text-champagne transition-colors">
              Maç Arşivi
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-navy-400">Hakem Arşivi</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Scale className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Hakem Arşivi</h1>
              <p className="mt-1 text-sm text-readable-muted">
                Arşivde hakem bilgisi kayıtlı maçlardaki tüm hakemler.
              </p>
            </div>
          </div>

          <div className="mt-6 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
            <input
              type="text"
              placeholder="Hakem adı ara..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-navy-900 border border-navy-700 text-white text-sm rounded-lg pl-9 pr-4 py-2.5 placeholder-navy-500 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="h-14 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-readable-muted">{error}</p>
          </div>
        ) : referees.length === 0 ? (
          <p className="text-center text-sm text-readable-muted py-20">Eşleşen hakem bulunamadı.</p>
        ) : (
          <>
            <p className="text-xs text-readable-muted mb-3">
              {referees.length.toLocaleString('tr-TR')} hakem
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {referees.map((r) => (
                <Link
                  key={r.name}
                  to={`/mac-arsivi?hakem=${encodeURIComponent(r.name)}`}
                  className="flex items-center justify-between bg-navy-900/50 hover:bg-navy-900 border border-navy-800/60 hover:border-navy-700 rounded-xl px-4 py-3 transition-all group"
                >
                  <span className="text-sm font-medium text-white group-hover:text-champagne transition-colors truncate">
                    {r.name}
                  </span>
                  <span className="ml-3 shrink-0 text-xs text-readable-muted tabular-nums">
                    {r.match_count.toLocaleString('tr-TR')} maç
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
