import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ChevronRight, AlertTriangle, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ErrorRow {
  id: string;
  match_id: string;
  match_date: string;
  competition_name: string;
  season_label: string;
  home_team_name: string;
  away_team_name: string;
  predicted_result: string;
  confidence_score: number;
  confidence_grade: string;
  actual_result: string;
  brier_1x2: number;
  log_loss_1x2: number;
  error_category: string;
  error_notes: string;
  is_result_correct: boolean;
  over_2_5_correct: boolean;
  btts_correct: boolean;
}

const ERROR_CATEGORIES = ['all', 'high_confidence_wrong', 'low_confidence_wrong', 'draw_miss', 'upset'];

export default function ModelLabHataAnaliziPage() {
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 40;

  useEffect(() => {
    document.title = 'Hata Analizi | Model Lab | Admin | Next59';
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: result } = await supabase.rpc('ml_get_error_analysis_rows', {
      p_run_id: null,
      p_error_category: categoryFilter !== 'all' ? categoryFilter : null,
      p_grade: gradeFilter || null,
      p_offset: page * PAGE_SIZE,
      p_limit: PAGE_SIZE,
    });

    const payload = result as { rows: ErrorRow[]; total: number } | null;
    setRows(payload?.rows ?? []);
    setTotal(payload?.total ?? 0);
    setLoading(false);
  }, [page, categoryFilter, gradeFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = total !== null ? Math.ceil(total / PAGE_SIZE) : null;

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-navy-500 mb-6">
          <Link to="/admin/model-lab" className="hover:text-champagne transition-colors">Model Lab</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-navy-400">Hata Analizi</span>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5 mb-6 flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">Bu alan yalnızca model araştırma içindir. Public kullanıcıya gösterilmez.</p>
        </div>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Hata Analizi</h1>
            <p className="text-sm text-navy-400 mt-1">
              Yanlış tahminler — yüksek güven hataları ve örüntü analizi.
              {total !== null && <span className="ml-2 text-navy-500">Toplam: {total.toLocaleString('tr-TR')} yanlış tahmin</span>}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <div className="flex flex-wrap gap-1.5">
            {ERROR_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategoryFilter(cat); setPage(0); }}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                  categoryFilter === cat
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-navy-900 border-navy-700 text-navy-400 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'Tümü' : cat.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <select
            value={gradeFilter}
            onChange={(e) => { setGradeFilter(e.target.value); setPage(0); }}
            className="appearance-none bg-navy-900 border border-navy-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-champagne/40 transition-all"
          >
            <option value="">Tüm Güven Dereceleri</option>
            {['A', 'B+', 'B', 'C', 'D', 'F'].map((g) => (
              <option key={g} value={g}>Grade: {g}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Target className="w-8 h-8 text-navy-700" />
            <p className="text-sm text-navy-500 text-center">
              {total === 0
                ? 'Backtest sonuçları mevcut değil. Önce backtest çalıştırın.'
                : 'Bu filtre için hata kaydı yok.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    {['Tarih', 'Lig', 'Maç', 'Tahmin', 'Gerçek', 'Grade', 'Güven', 'Brier', 'Hata Tipi'].map((h) => (
                      <th key={h} className="text-left text-navy-500 font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800/50">
                  {rows.map((r) => (
                    <ErrorRowItem key={r.id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages !== null && totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-xs text-navy-400 hover:text-white disabled:opacity-30 transition-colors px-3 py-1.5 rounded-lg border border-navy-700 hover:border-navy-600"
                >
                  ← Önceki
                </button>
                <span className="text-xs text-navy-600">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-xs text-navy-400 hover:text-white disabled:opacity-30 transition-colors px-3 py-1.5 rounded-lg border border-navy-700 hover:border-navy-600"
                >
                  Sonraki →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ErrorRowItem({ row }: { row: ErrorRow }) {
  const gradeCls =
    row.confidence_grade === 'A' || row.confidence_grade === 'B+'
      ? 'text-red-400 font-bold'
      : row.confidence_grade === 'B' || row.confidence_grade === 'C'
        ? 'text-amber-400'
        : 'text-navy-400';

  const brierCls = row.brier_1x2 > 0.5 ? 'text-red-400' : row.brier_1x2 > 0.3 ? 'text-amber-400' : 'text-navy-300';

  return (
    <tr className="hover:bg-navy-900/40 transition-colors">
      <td className="px-3 py-2.5 text-navy-400 whitespace-nowrap tabular-nums">{row.match_date}</td>
      <td className="px-3 py-2.5 text-navy-400 whitespace-nowrap max-w-[120px] truncate">{row.competition_name}</td>
      <td className="px-3 py-2.5 text-white">
        <span className="truncate max-w-[160px] block">{row.home_team_name} – {row.away_team_name}</span>
      </td>
      <td className="px-3 py-2.5">
        <ResultBadge result={row.predicted_result} />
      </td>
      <td className="px-3 py-2.5">
        <ResultBadge result={row.actual_result} actual />
      </td>
      <td className={`px-3 py-2.5 tabular-nums ${gradeCls}`}>{row.confidence_grade}</td>
      <td className="px-3 py-2.5 text-navy-300 tabular-nums">{(row.confidence_score * 100).toFixed(1)}%</td>
      <td className={`px-3 py-2.5 tabular-nums ${brierCls}`}>{Number(row.brier_1x2).toFixed(4)}</td>
      <td className="px-3 py-2.5 text-navy-500 text-[10px] font-mono">
        {row.error_category || '–'}
      </td>
    </tr>
  );
}

function ResultBadge({ result, actual }: { result: string; actual?: boolean }) {
  const label = result === 'H' ? 'Ev' : result === 'D' ? 'Ber' : result === 'A' ? 'Dep' : result;
  const cls = actual
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-red-500/10 text-red-400 border-red-500/20';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

