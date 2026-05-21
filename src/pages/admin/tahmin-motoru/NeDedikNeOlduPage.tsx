import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Filter, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, ReferenceLine } from 'recharts';
import { supabase } from '../../../lib/supabase';
import BrierScoreBadge from '../../../components/tahmin-motoru/BrierScoreBadge';
import TahminTimeline, { type SnapshotEntry } from '../../../components/tahmin-motoru/TahminTimeline';
import BrainDetailPanel from '../../../components/tahmin-motoru/BrainDetailPanel';

interface MatchSnapshot {
  match_id: string;
  home_team: string;
  away_team: string;
  actual_outcome: string | null;
  snapshots: SnapshotEntry[];
  avg_brier: number | null;
  last_snapshot: SnapshotEntry | null;
}

type OutcomeFilter = 'all' | 'correct' | 'wrong' | 'pending';
type TypeFilter = 'all' | 'prematch' | 'live' | 'final';

export default function NeDedikNeOlduPage() {
  const [matchGroups, setMatchGroups] = useState<MatchSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [expandedBrains, setExpandedBrains] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const fetchData = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('ensemble_prediction_snapshots')
      .select('id, match_id, snapshot_version, snapshot_type, match_minute, home_prob, draw_prob, away_prob, predicted_outcome, ensemble_confidence, actual_outcome, brier_score, was_correct, is_locked, created_at, explanation_json, brain_outputs, effective_weights')
      .order('created_at', { ascending: false })
      .limit(300);

    if (typeFilter !== 'all') query = query.eq('snapshot_type', typeFilter);

    const { data } = await query;
    if (!data) { setLoading(false); return; }

    const grouped: Record<string, SnapshotEntry[]> = {};

    for (const row of data as (SnapshotEntry & { brain_outputs?: unknown; effective_weights?: unknown })[]) {
      if (!grouped[row.match_id]) grouped[row.match_id] = [];
      grouped[row.match_id].push(row);
    }

    // Fetch team names for all match IDs in one query
    const matchIds = Object.keys(grouped);
    const { data: matchRows } = await supabase
      .from('matches')
      .select(`
        id,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `)
      .in('id', matchIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchNameMap: Record<string, { home: string; away: string }> = {};
    for (const m of (matchRows ?? []) as any[]) {
      matchNameMap[m.id] = {
        home: m.home_team?.name ?? null,
        away: m.away_team?.name ?? null,
      };
    }

    const groups: MatchSnapshot[] = Object.entries(grouped).map(([matchId, snaps]) => {
      const sorted = [...snaps].sort((a, b) => a.snapshot_version - b.snapshot_version);
      const evaluated = sorted.filter(s => s.brier_score != null);
      const avgBrier = evaluated.length > 0
        ? evaluated.reduce((sum, s) => sum + (s.brier_score ?? 0), 0) / evaluated.length
        : null;
      const last = sorted[sorted.length - 1];
      const names = matchNameMap[matchId];
      return {
        match_id: matchId,
        home_team: names?.home ?? (last.explanation_json?.home_team as string) ?? 'Ev Sahibi',
        away_team: names?.away ?? (last.explanation_json?.away_team as string) ?? 'Deplasman',
        actual_outcome: last.actual_outcome,
        snapshots: sorted,
        avg_brier: avgBrier,
        last_snapshot: last,
      };
    });

    setMatchGroups(groups);
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(0); }, [search, outcomeFilter]);

  const filtered = matchGroups
    .filter(g => {
      if (search) {
        const q = search.toLowerCase();
        return g.home_team.toLowerCase().includes(q) || g.away_team.toLowerCase().includes(q);
      }
      return true;
    })
    .filter(g => {
      if (outcomeFilter === 'all') return true;
      if (outcomeFilter === 'pending') return g.actual_outcome == null;
      const last = g.last_snapshot;
      if (!last) return false;
      if (outcomeFilter === 'correct') return last.was_correct === true;
      if (outcomeFilter === 'wrong') return last.was_correct === false;
      return true;
    });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const stats = {
    total: matchGroups.length,
    correct: matchGroups.filter(g => g.last_snapshot?.was_correct === true).length,
    wrong: matchGroups.filter(g => g.last_snapshot?.was_correct === false).length,
    pending: matchGroups.filter(g => g.actual_outcome == null).length,
    avgBrier: (() => {
      const ev = matchGroups.filter(g => g.avg_brier != null);
      return ev.length > 0 ? ev.reduce((s, g) => s + (g.avg_brier ?? 0), 0) / ev.length : null;
    })(),
  };

  // ─── Analytics Dashboard ──────────────────────────────────────────────────

  function outcomeIcon(snap: SnapshotEntry | null) {
    if (!snap || snap.was_correct == null) return <Minus className="w-4 h-4 text-navy-500" />;
    return snap.was_correct
      ? <TrendingUp className="w-4 h-4 text-emerald-400" />
      : <TrendingDown className="w-4 h-4 text-red-400" />;
  }

  return (
    <div className="min-h-screen bg-navy-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white">Ne Dedik / Ne Oldu</h1>
          <p className="text-sm text-navy-400 mt-0.5">Tahmin–sonuç karşılaştırması ve beyin doğruluk analizi</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: 'Toplam Maç', value: stats.total, color: 'text-white' },
            { label: 'Doğru', value: stats.correct, color: 'text-emerald-400' },
            { label: 'Yanlış', value: stats.wrong, color: 'text-red-400' },
            { label: 'Bekliyor', value: stats.pending, color: 'text-yellow-400' },
            { label: 'Ort. Brier', value: stats.avgBrier != null ? stats.avgBrier.toFixed(3) : '—', color: stats.avgBrier != null && stats.avgBrier > 0.25 ? 'text-red-400' : 'text-emerald-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-navy-600 bg-navy-800/50 px-4 py-3">
              <p className="text-[10px] text-navy-400 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Analytics Charts */}
        {!loading && matchGroups.length > 0 && (
          <AnalyticsDashboard stats={stats} matchGroups={matchGroups} />
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
            <input
              type="text"
              placeholder="Takım ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
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
          <button onClick={fetchData} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-navy-400 border border-navy-600 hover:text-white transition-colors">
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
            {paginated.map(group => {
              const isOpen = expandedMatch === group.match_id;
              const isBrainsOpen = expandedBrains === group.match_id;
              const lastSnap = group.last_snapshot;
              const lastBrainOutputs = (lastSnap as (SnapshotEntry & { brain_outputs?: Record<string, unknown> }) | null)?.brain_outputs ?? {};
              const lastWeights = (lastSnap as (SnapshotEntry & { effective_weights?: Record<string, number> }) | null)?.effective_weights ?? {};

              return (
                <div key={group.match_id} className="rounded-xl border border-navy-600 bg-navy-800/40 overflow-hidden">
                  {/* Summary Row */}
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {group.home_team} <span className="text-navy-400">vs</span> {group.away_team}
                      </p>
                      <p className="text-[10px] text-navy-500 mt-0.5 font-mono">{group.match_id.slice(0, 12)}…</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {outcomeIcon(lastSnap)}
                      <BrierScoreBadge score={group.avg_brier} size="sm" />
                      <span className="text-[10px] text-navy-400">{group.snapshots.length} tahmin</span>
                    </div>
                    {lastSnap?.actual_outcome && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${lastSnap.was_correct ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40' : 'bg-red-900/40 text-red-400 border border-red-700/40'}`}>
                        {lastSnap.was_correct ? 'DOĞRU' : 'YANLIŞ'}
                      </span>
                    )}
                    <div className="flex gap-1">
                      <button
                        onClick={() => setExpandedMatch(isOpen ? null : group.match_id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-navy-400 hover:text-white border border-navy-600 hover:border-navy-500 transition-colors"
                      >
                        Zaman Çizelgesi
                        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => setExpandedBrains(isBrainsOpen ? null : group.match_id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] text-navy-400 hover:text-white border border-navy-600 hover:border-navy-500 transition-colors"
                      >
                        Beyin Detay
                        {isBrainsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* Prediction Timeline */}
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-navy-600/40">
                      <div className="pt-4">
                        <TahminTimeline
                          snapshots={group.snapshots}
                          homeTeam={group.home_team}
                          awayTeam={group.away_team}
                        />
                      </div>
                    </div>
                  )}

                  {/* Brain Detail */}
                  {isBrainsOpen && lastSnap && (
                    <div className="px-5 pb-5 border-t border-navy-600/40">
                      <div className="pt-4">
                        <BrainDetailPanel
                          brainOutputs={lastBrainOutputs as Record<string, { status: string; latency_ms: number; output: { winner_prob: { home: number; draw: number; away: number }; confidence: number; key_factors?: string[] } | null; error: string | null }>}
                          effectiveWeights={lastWeights}
                          homeTeam={group.home_team}
                          awayTeam={group.away_team}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="text-center py-16 text-navy-500">
                <p className="text-sm">Filtre kriterlerine uygun sonuç bulunamadı</p>
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 rounded-lg text-xs font-medium border border-navy-600 text-navy-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              Önceki
            </button>
            <span className="text-xs text-navy-400">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-4 py-2 rounded-lg text-xs font-medium border border-navy-600 text-navy-400 hover:text-white disabled:opacity-30 transition-colors"
            >
              Sonraki
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Analytics Dashboard Component ──────────────────────────────────────────

interface AnalyticsDashboardProps {
  stats: {
    total: number;
    correct: number;
    wrong: number;
    pending: number;
    avgBrier: number | null;
  };
  matchGroups: MatchSnapshot[];
}

function AnalyticsDashboard({ stats, matchGroups }: AnalyticsDashboardProps) {
  const evaluated = stats.correct + stats.wrong;
  const winRate = evaluated > 0 ? Math.round((stats.correct / evaluated) * 100) : 0;

  // Bar chart: outcome distribution
  const outcomeData = [
    { name: 'Doğru',    value: stats.correct,  fill: '#10b981' },
    { name: 'Yanlış',   value: stats.wrong,    fill: '#ef4444' },
    { name: 'Bekliyor', value: stats.pending,  fill: '#f59e0b' },
  ];

  // Brier score buckets — group matches into quality tiers
  const brierBuckets = [
    { name: '< 0.15',    label: 'Mükemmel', count: 0, fill: '#10b981' },
    { name: '0.15–0.20', label: 'İyi',       count: 0, fill: '#3b82f6' },
    { name: '0.20–0.25', label: 'Orta',      count: 0, fill: '#f59e0b' },
    { name: '> 0.25',    label: 'Zayıf',     count: 0, fill: '#ef4444' },
  ];
  for (const g of matchGroups) {
    if (g.avg_brier == null) continue;
    if (g.avg_brier < 0.15)      brierBuckets[0].count++;
    else if (g.avg_brier < 0.20) brierBuckets[1].count++;
    else if (g.avg_brier < 0.25) brierBuckets[2].count++;
    else                          brierBuckets[3].count++;
  }

  // Rolling win-rate trend — take evaluated matches sorted by snapshot date,
  // compute cumulative accuracy every 5 evaluated matches
  const trendData: { label: string; winRate: number; correct: number; total: number }[] = [];
  const evaluated_groups = matchGroups
    .filter(g => g.last_snapshot?.was_correct != null)
    .sort((a, b) => {
      const ta = a.last_snapshot?.created_at ?? '';
      const tb = b.last_snapshot?.created_at ?? '';
      return ta < tb ? -1 : 1;
    });

  const WINDOW = 10;
  for (let i = WINDOW - 1; i < evaluated_groups.length; i += Math.max(1, Math.floor(WINDOW / 2))) {
    const window = evaluated_groups.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const correct = window.filter(g => g.last_snapshot?.was_correct === true).length;
    const rate = Math.round((correct / window.length) * 100);
    const dateStr = evaluated_groups[i].last_snapshot?.created_at
      ? new Date(evaluated_groups[i].last_snapshot!.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
      : `${i + 1}`;
    trendData.push({ label: dateStr, winRate: rate, correct, total: window.length });
  }

  // Streak — current consecutive correct/wrong
  const recentEval = evaluated_groups.slice(-20).reverse();
  let streakCount = 0;
  let streakType: 'correct' | 'wrong' | null = null;
  for (const g of recentEval) {
    const isCorrect = g.last_snapshot?.was_correct === true;
    if (streakType == null) {
      streakType = isCorrect ? 'correct' : 'wrong';
      streakCount = 1;
    } else if ((streakType === 'correct') === isCorrect) {
      streakCount++;
    } else {
      break;
    }
  }

  return (
    <div className="space-y-4">
      {/* Top row: distribution charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Win Rate Chart */}
        <div className="rounded-xl border border-navy-600 bg-navy-800/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Tahmin Doğruluğu</h3>
              <p className="text-[11px] text-navy-400 mt-0.5">Değerlendirilen maçlar üzerinden</p>
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
              <Tooltip
                contentStyle={{ background: '#0f1d2a', border: '1px solid #1e3a4c', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {outcomeData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Brier Score Distribution */}
        <div className="rounded-xl border border-navy-600 bg-navy-800/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Brier Skor Dağılımı</h3>
              <p className="text-[11px] text-navy-400 mt-0.5">Model kalitesi — düşük = iyi</p>
            </div>
            {stats.avgBrier != null && (
              <div className="text-right">
                <span className={`text-2xl font-bold tabular-nums ${stats.avgBrier < 0.20 ? 'text-emerald-400' : stats.avgBrier < 0.25 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {stats.avgBrier.toFixed(3)}
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
                formatter={(value: number, _: string, entry: { payload?: { label?: string } }) => [value, entry.payload?.label ?? '']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {brierBuckets.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Win-Rate Trend (rolling 10-match window) */}
      {trendData.length >= 3 && (
        <div className="rounded-xl border border-navy-600 bg-navy-800/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Doğruluk Trendi</h3>
              <p className="text-[11px] text-navy-400 mt-0.5">Son {WINDOW} maçlık kayan pencere doğruluk oranı</p>
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
              <span className="text-navy-500">kesikli çizgi = %50 eşiği</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2f3f" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={32}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: '#0f1d2a', border: '1px solid #1e3a4c', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => [`${value}%`, 'Win Rate']}
              />
              <ReferenceLine y={50} stroke="#334155" strokeDasharray="4 4" />
              <ReferenceLine y={60} stroke="#10b98133" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="winRate"
                stroke="#d4af37"
                strokeWidth={2}
                dot={{ r: 3, fill: '#d4af37', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#d4af37' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
