import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, RefreshCw, Filter, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, ReferenceLine } from 'recharts';
import { supabase } from '../../../lib/supabase';
import BrierScoreBadge from '../../../components/tahmin-motoru/BrierScoreBadge';
import TahminTimeline, { type SnapshotEntry } from '../../../components/tahmin-motoru/TahminTimeline';
import BrainDetailPanel from '../../../components/tahmin-motoru/BrainDetailPanel';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MatchRow {
  match_id: string;
  home_team: string;
  away_team: string;
  actual_outcome: string | null;
  snapshot_count: number;
  avg_brier: number | null;
  last_was_correct: boolean | null;
  last_predicted: string | null;
  last_confidence: number | null;
  last_snapshot_at: string | null;
  last_home_prob: number | null;
  last_draw_prob: number | null;
  last_away_prob: number | null;
  last_explanation: Record<string, unknown> | null;
  last_brain_outputs: Record<string, unknown> | null;
  last_weights: Record<string, number> | null;
  total_count: number;
}

// Stats computed from the current page results and a running summary query
interface PageStats {
  pageCorrect: number;
  pageWrong: number;
  pagePending: number;
  pageAvgBrier: number | null;
}

type OutcomeFilter = 'all' | 'correct' | 'wrong' | 'pending';
type TypeFilter    = 'all' | 'prematch' | 'live' | 'final';

const PAGE_SIZE = 15;

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NeDedikNeOlduPage() {
  const [rows, setRows]           = useState<MatchRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading]     = useState(true);

  const [search, setSearch]           = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>('all');
  const [page, setPage]               = useState(0);

  const [expandedMatch, setExpandedMatch]   = useState<string | null>(null);
  const [expandedBrains, setExpandedBrains] = useState<string | null>(null);

  // Debounce search input
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 350);
  }

  // Reset to page 0 whenever filters change
  useEffect(() => { setPage(0); }, [outcomeFilter, typeFilter, debouncedSearch]);

  const fetchData = useCallback(async (currentPage: number) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_ne_dedik_ne_oldu', {
      p_outcome_filter: outcomeFilter,
      p_type_filter:    typeFilter,
      p_search:         debouncedSearch || null,
      p_page:           currentPage,
      p_page_size:      PAGE_SIZE,
    });

    if (error || !data) {
      setRows([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    const typedRows = data as MatchRow[];
    setRows(typedRows);
    setTotalCount(typedRows[0]?.total_count ?? 0);
    setLoading(false);
  }, [outcomeFilter, typeFilter, debouncedSearch]);

  useEffect(() => { fetchData(page); }, [fetchData, page]);

  function handlePageChange(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Per-page stats (shown in stat cards — reflect current filter context)
  const pageStats: PageStats = {
    pageCorrect:  rows.filter(r => r.last_was_correct === true).length,
    pageWrong:    rows.filter(r => r.last_was_correct === false).length,
    pagePending:  rows.filter(r => r.actual_outcome == null).length,
    pageAvgBrier: (() => {
      const ev = rows.filter(r => r.avg_brier != null);
      return ev.length > 0 ? ev.reduce((s, r) => s + (r.avg_brier ?? 0), 0) / ev.length : null;
    })(),
  };

  function outcomeIcon(row: MatchRow) {
    if (row.last_was_correct == null) return <Minus className="w-4 h-4 text-navy-500" />;
    return row.last_was_correct
      ? <TrendingUp className="w-4 h-4 text-emerald-400" />
      : <TrendingDown className="w-4 h-4 text-red-400" />;
  }

  // Build a minimal SnapshotEntry for TahminTimeline from the single last-snapshot fields.
  // Timeline expansion only shows the summary snapshot since we don't fetch all versions
  // from the page-level RPC — a follow-up detail fetch could expand this further, but
  // for the list view the last snapshot is sufficient.
  function buildLastSnap(row: MatchRow): SnapshotEntry {
    return {
      id:                  row.match_id + '_last',
      match_id:            row.match_id,
      snapshot_version:    1,
      snapshot_type:       'final',
      match_minute:        null,
      home_prob:           row.last_home_prob ?? 0,
      draw_prob:           row.last_draw_prob ?? 0,
      away_prob:           row.last_away_prob ?? 0,
      predicted_outcome:   row.last_predicted ?? '',
      ensemble_confidence: row.last_confidence ?? null,
      actual_outcome:      row.actual_outcome ?? null,
      brier_score:         row.avg_brier ?? null,
      was_correct:         row.last_was_correct ?? null,
      is_locked:           true,
      created_at:          row.last_snapshot_at ?? '',
      explanation_json:    row.last_explanation ?? null,
    };
  }

  return (
    <div className="min-h-screen bg-navy-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Ne Dedik / Ne Oldu</h1>
            <p className="text-sm text-navy-400 mt-0.5">Tahmin–sonuç karşılaştırması ve beyin doğruluk analizi</p>
          </div>
          {!loading && (
            <p className="text-xs text-navy-500">
              {totalCount > 0
                ? `${totalCount} maçtan ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalCount)} gösteriliyor`
                : '0 maç'}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: 'Toplam Maç',  value: totalCount,                       color: 'text-white' },
            { label: 'Bu Sayfada',  value: rows.length,                      color: 'text-navy-300' },
            { label: 'Doğru',       value: pageStats.pageCorrect,            color: 'text-emerald-400' },
            { label: 'Yanlış',      value: pageStats.pageWrong,              color: 'text-red-400' },
            {
              label: 'Ort. Brier',
              value: pageStats.pageAvgBrier != null ? pageStats.pageAvgBrier.toFixed(3) : '—',
              color: pageStats.pageAvgBrier != null && pageStats.pageAvgBrier > 0.25 ? 'text-red-400' : 'text-emerald-400',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-navy-600 bg-navy-800/50 px-4 py-3">
              <p className="text-[10px] text-navy-400 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Analytics Charts — only render when we have data on current page */}
        {!loading && rows.length > 0 && (
          <AnalyticsDashboard rows={rows} pageStats={pageStats} />
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
            <input
              type="text"
              placeholder="Takım ara..."
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-navy-700 border border-navy-600 text-sm text-white placeholder-navy-500 focus:outline-none focus:border-champagne/50"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-navy-500" />
            {(['all', 'correct', 'wrong', 'pending'] as OutcomeFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setOutcomeFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${outcomeFilter === f ? 'bg-champagne/20 text-champagne border border-champagne/40' : 'bg-navy-700 text-navy-400 border border-navy-600 hover:text-white'}`}
              >
                {f === 'all' ? 'Tümü' : f === 'correct' ? 'Doğru' : f === 'wrong' ? 'Yanlış' : 'Bekliyor'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'prematch', 'live', 'final'] as TypeFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === f ? 'bg-blue-900/40 text-blue-300 border border-blue-700/40' : 'bg-navy-700 text-navy-400 border border-navy-600 hover:text-white'}`}
              >
                {f === 'all' ? 'Tür: Tümü' : f === 'prematch' ? 'Maç Öncesi' : f === 'live' ? 'Canlı' : 'Final'}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchData(page)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-navy-400 border border-navy-600 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Match Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-7 h-7 text-champagne animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(row => {
              const isOpen      = expandedMatch  === row.match_id;
              const isBrainsOpen = expandedBrains === row.match_id;
              const lastSnap    = buildLastSnap(row);

              return (
                <div key={row.match_id} className="rounded-xl border border-navy-600 bg-navy-800/40 overflow-hidden">
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {row.home_team} <span className="text-navy-400">vs</span> {row.away_team}
                      </p>
                      <p className="text-[10px] text-navy-500 mt-0.5 font-mono">{row.match_id.slice(0, 12)}…</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {outcomeIcon(row)}
                      <BrierScoreBadge score={row.avg_brier} size="sm" />
                      <span className="text-[10px] text-navy-400">{row.snapshot_count} tahmin</span>
                    </div>
                    {row.actual_outcome && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.last_was_correct ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40' : 'bg-red-900/40 text-red-400 border border-red-700/40'}`}>
                        {row.last_was_correct ? 'DOĞRU' : 'YANLIŞ'}
                      </span>
                    )}
                    <div className="flex gap-1">
                      <button
                        onClick={() => setExpandedMatch(isOpen ? null : row.match_id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-navy-400 hover:text-white border border-navy-600 hover:border-navy-500 transition-colors"
                      >
                        Zaman Çizelgesi
                        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => setExpandedBrains(isBrainsOpen ? null : row.match_id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-navy-400 hover:text-white border border-navy-600 hover:border-navy-500 transition-colors"
                      >
                        Beyin Detay
                        {isBrainsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-navy-600/40">
                      <div className="pt-4">
                        <TahminTimeline
                          snapshots={[lastSnap]}
                          homeTeam={row.home_team}
                          awayTeam={row.away_team}
                        />
                      </div>
                    </div>
                  )}

                  {isBrainsOpen && (
                    <div className="px-5 pb-5 border-t border-navy-600/40">
                      <div className="pt-4">
                        <BrainDetailPanel
                          brainOutputs={(row.last_brain_outputs ?? {}) as Record<string, { status: string; latency_ms: number; output: { winner_prob: { home: number; draw: number; away: number }; confidence: number; key_factors?: string[] } | null; error: string | null }>}
                          effectiveWeights={(row.last_weights ?? {}) as Record<string, number>}
                          homeTeam={row.home_team}
                          awayTeam={row.away_team}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {rows.length === 0 && (
              <div className="text-center py-16 text-navy-500">
                <p className="text-sm">Filtre kriterlerine uygun sonuç bulunamadı</p>
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-navy-600 text-navy-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Önceki
            </button>
            <span className="text-xs text-navy-400">Sayfa {page + 1} / {totalPages}</span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-navy-600 text-navy-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              Sonraki
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Analytics Dashboard ──────────────────────────────────────────────────────

interface AnalyticsDashboardProps {
  rows: MatchRow[];
  pageStats: PageStats;
}

function AnalyticsDashboard({ rows, pageStats }: AnalyticsDashboardProps) {
  const evaluated = pageStats.pageCorrect + pageStats.pageWrong;
  const winRate   = evaluated > 0 ? Math.round((pageStats.pageCorrect / evaluated) * 100) : 0;

  const outcomeData = [
    { name: 'Doğru',    value: pageStats.pageCorrect,  fill: '#10b981' },
    { name: 'Yanlış',   value: pageStats.pageWrong,    fill: '#ef4444' },
    { name: 'Bekliyor', value: pageStats.pagePending,  fill: '#f59e0b' },
  ];

  const brierBuckets = [
    { name: '< 0.15',    label: 'Mükemmel', count: 0, fill: '#10b981' },
    { name: '0.15–0.20', label: 'İyi',       count: 0, fill: '#3b82f6' },
    { name: '0.20–0.25', label: 'Orta',      count: 0, fill: '#f59e0b' },
    { name: '> 0.25',    label: 'Zayıf',     count: 0, fill: '#ef4444' },
  ];
  for (const r of rows) {
    if (r.avg_brier == null) continue;
    if      (r.avg_brier < 0.15) brierBuckets[0].count++;
    else if (r.avg_brier < 0.20) brierBuckets[1].count++;
    else if (r.avg_brier < 0.25) brierBuckets[2].count++;
    else                          brierBuckets[3].count++;
  }

  // Rolling win-rate trend over sorted page rows
  const WINDOW = 10;
  const evaluatedRows = rows
    .filter(r => r.last_was_correct != null)
    .sort((a, b) => (a.last_snapshot_at ?? '') < (b.last_snapshot_at ?? '') ? -1 : 1);

  const trendData: { label: string; winRate: number }[] = [];
  for (let i = WINDOW - 1; i < evaluatedRows.length; i += Math.max(1, Math.floor(WINDOW / 2))) {
    const window = evaluatedRows.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const correct = window.filter(r => r.last_was_correct === true).length;
    const dateStr = evaluatedRows[i].last_snapshot_at
      ? new Date(evaluatedRows[i].last_snapshot_at!).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
      : `${i + 1}`;
    trendData.push({ label: dateStr, winRate: Math.round((correct / window.length) * 100) });
  }

  // Streak
  const recentEval = [...evaluatedRows].reverse().slice(0, 20);
  let streakCount = 0;
  let streakType: 'correct' | 'wrong' | null = null;
  for (const r of recentEval) {
    const isCorrect = r.last_was_correct === true;
    if (streakType == null) { streakType = isCorrect ? 'correct' : 'wrong'; streakCount = 1; }
    else if ((streakType === 'correct') === isCorrect) { streakCount++; }
    else break;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="rounded-xl border border-navy-600 bg-navy-800/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Tahmin Doğruluğu</h3>
              <p className="text-[11px] text-navy-400 mt-0.5">Bu sayfa — değerlendirilen maçlar</p>
            </div>
            <div className="text-right">
              <span className={`text-2xl font-bold tabular-nums ${winRate >= 60 ? 'text-emerald-400' : winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                {winRate}%
              </span>
              <p className="text-[10px] text-navy-500">{evaluated} maç</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={outcomeData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2f3f" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ background: '#0f1d2a', border: '1px solid #1e3a4c', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#e2e8f0' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {outcomeData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-navy-600 bg-navy-800/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Brier Skor Dağılımı</h3>
              <p className="text-[11px] text-navy-400 mt-0.5">Model kalitesi — düşük = iyi</p>
            </div>
            {pageStats.pageAvgBrier != null && (
              <div className="text-right">
                <span className={`text-2xl font-bold tabular-nums ${pageStats.pageAvgBrier < 0.20 ? 'text-emerald-400' : pageStats.pageAvgBrier < 0.25 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {pageStats.pageAvgBrier.toFixed(3)}
                </span>
                <p className="text-[10px] text-navy-500">ortalama</p>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={brierBuckets} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2f3f" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: '#0f1d2a', border: '1px solid #1e3a4c', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: unknown, _: string, entry: { payload?: { label?: string } }) => [value, entry.payload?.label ?? '']) as any}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {brierBuckets.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {trendData.length >= 3 && (
        <div className="rounded-xl border border-navy-600 bg-navy-800/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Doğruluk Trendi</h3>
              <p className="text-[11px] text-navy-400 mt-0.5">Son {WINDOW} maçlık kayan pencere (bu sayfa)</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              {streakType && streakCount >= 2 && (
                <span className={`flex items-center gap-1 font-semibold px-2.5 py-1 rounded-full border ${
                  streakType === 'correct'
                    ? 'text-emerald-400 bg-emerald-900/20 border-emerald-700/40'
                    : 'text-red-400 bg-red-900/20 border-red-700/40'
                }`}>
                  {streakType === 'correct' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {streakCount} seri {streakType === 'correct' ? 'doğru' : 'yanlış'}
                </span>
              )}
              <span className="text-navy-500">kesikli = %50 eşiği</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2f3f" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={32} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: '#0f1d2a', border: '1px solid #1e3a4c', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((value: unknown) => [`${value as number}%`, 'Win Rate']) as any}
              />
              <ReferenceLine y={50} stroke="#334155" strokeDasharray="4 4" />
              <ReferenceLine y={60} stroke="#10b98133" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="winRate" stroke="#d4af37" strokeWidth={2} dot={{ r: 3, fill: '#d4af37', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#d4af37' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
