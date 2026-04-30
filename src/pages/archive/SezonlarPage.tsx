import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SeasonRow {
  season_id: string;
  season_label: string;
  season_year: number;
  match_count: number;
}

export default function SezonlarPage() {
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Sezonlar — Maç Arşivi | Next59';
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('v_historical_match_archive')
          .select('season_id, season_label, season_year')
          .not('season_id', 'is', null);

        if (err) throw err;

        const map = new Map<string, SeasonRow>();
        for (const row of data ?? []) {
          if (!row.season_id) continue;
          const existing = map.get(row.season_id);
          if (existing) {
            existing.match_count++;
          } else {
            map.set(row.season_id, {
              season_id: row.season_id,
              season_label: row.season_label,
              season_year: row.season_year,
              match_count: 1,
            });
          }
        }

        setSeasons(
          Array.from(map.values()).sort((a, b) => b.season_year - a.season_year),
        );
      } catch {
        setError('Sezon listesi yüklenirken bir sorun oluştu.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60 bg-navy-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <Link to="/mac-arsivi" className="hover:text-champagne transition-colors">
              Maç Arşivi
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-navy-400">Sezonlar</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Sezonlar</h1>
              <p className="mt-1 text-sm text-navy-400">
                2000–2025 arasındaki tüm sezonlar. Bir sezona tıklayarak o sezonun maçlarını görün.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-16 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-navy-400">{error}</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {seasons.map((s) => (
              <Link
                key={s.season_id}
                to={`/mac-arsivi?sezon=${s.season_id}`}
                className="flex items-center justify-between bg-navy-900/50 hover:bg-navy-900 border border-navy-800/60 hover:border-navy-700 rounded-xl px-4 py-3.5 transition-all group"
              >
                <div>
                  <span className="text-sm font-semibold text-white group-hover:text-champagne transition-colors">
                    {s.season_label}
                  </span>
                  <div className="text-xs text-navy-500 mt-0.5">{s.season_year}</div>
                </div>
                <span className="text-xs text-navy-500 tabular-nums shrink-0 ml-2">
                  {s.match_count.toLocaleString('tr-TR')} maç
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
