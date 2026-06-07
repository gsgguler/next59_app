import { useState, useEffect, useCallback } from 'react';
import { GitBranch, RefreshCw } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { supabase } from '../../../lib/supabase';
import BrainHeatmap from '../../../components/tahmin-motoru/BrainHeatmap';

const BRAIN_META: Array<{ key: string; label: string; color: string }> = [
  { key: 'tactical',      label: 'Taktik',  color: '#FF6B6B' },
  { key: 'statistical',   label: 'İstat.',  color: '#4ECDC4' },
  { key: 'psychological', label: 'Psiko.',  color: '#9B59B6' },
  { key: 'live',          label: 'Canlı',   color: '#F39C12' },
  { key: 'conditions',    label: 'Koşul',   color: '#3498DB' },
  { key: 'news',          label: 'Haber',   color: '#2ECC71' },
];

const BRAIN_COLORS = Object.fromEntries(BRAIN_META.map(b => [b.key, b.color]));
const BRAIN_LABELS_MAP = Object.fromEntries(BRAIN_META.map(b => [b.key, b.label]));

const MATCH_TYPES = ['league_standard', 'derby_match', 'cup_final', 'live_60min', 'weather_extreme', 'transfer_window_chaos'];

interface PerfRow {
  brain_key: string;
  tracking_date: string;
  brier_score_7d: number | null;
  accuracy_7d: number | null;
  brier_score_30d: number | null;
}

interface WeightRow {
  profile_key: string;
  weights: Record<string, number>;
}

export default function ZekaGrafigiPage() {
  const [perfRows, setPerfRows] = useState<PerfRow[]>([]);
  const [weightProfiles, setWeightProfiles] = useState<WeightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'accuracy' | 'weights' | 'heatmap'>('accuracy');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [perfRes, wpRes] = await Promise.all([
      supabase
        .from('brain_performance_tracking')
        .select('brain_key, tracking_date, brier_score_7d, accuracy_7d, brier_score_30d')
        .order('tracking_date', { ascending: true })
        .limit(200),
      supabase
        .from('brain_weight_profiles')
        .select('profile_key, weights'),
    ]);
    if (perfRes.data) setPerfRows(perfRes.data as PerfRow[]);
    if (wpRes.data) setWeightProfiles(wpRes.data as WeightRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build accuracy trend: one data point per unique date, one line per brain
  const dates = [...new Set(perfRows.map(r => r.tracking_date))].sort();
  const accuracyData = dates.map(date => {
    const point: Record<string, unknown> = { date: date.slice(5) }; // MM-DD
    BRAIN_META.forEach(b => {
      const row = perfRows.find(r => r.brain_key === b.key && r.tracking_date === date);
      point[b.key] = row?.accuracy_7d != null ? Math.round(row.accuracy_7d * 100) : null;
    });
    return point;
  });

  // Build weight change data: one data point per profile
  const weightData = MATCH_TYPES.map(mt => {
    const profile = weightProfiles.find(p => p.profile_key === mt);
    const point: Record<string, unknown> = { profile: mt.replace('_', ' ') };
    BRAIN_META.forEach(b => {
      point[b.key] = profile?.weights?.[b.key] != null
        ? Math.round((profile.weights[b.key] as number) * 100)
        : null;
    });
    return point;
  });

  // Build heatmap cells: match_type × brain → accuracy (use weight as proxy)
  const heatmapCells = MATCH_TYPES.flatMap(mt => {
    const profile = weightProfiles.find(p => p.profile_key === mt);
    return BRAIN_META.map(b => ({
      match_type: mt,
      brain_key: b.key,
      accuracy: profile?.weights?.[b.key] != null ? (profile.weights[b.key] as number) : null,
    }));
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-champagne animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-900 p-6">
      <div className="max-w-6xl mx-auto space-y-8">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Zeka Grafiği</h1>
              <p className="text-sm text-navy-400">Brain ağırlıkları, doğruluk trendi ve maç tipi ısı haritası</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-navy-400 border border-navy-600 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Yenile
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-navy-800/40 rounded-xl p-1 w-fit border border-navy-700">
          {[
            { key: 'accuracy', label: 'Doğruluk Trendi' },
            { key: 'weights',  label: 'Ağırlık Profilleri' },
            { key: 'heatmap',  label: 'Isı Haritası' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === key ? 'bg-navy-700 text-white' : 'text-navy-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Accuracy trend chart */}
        {activeTab === 'accuracy' && (
          <div className="rounded-xl border border-navy-600 bg-navy-800/50 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">7 Günlük Doğruluk Trendi (%)</h2>
            {accuracyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={accuracyData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `${v}%`} width={36} />
                  <Tooltip
                    contentStyle={{ background: '#0f1d2a', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#94a3b8' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown, name: string) => [`${v as number}%`, BRAIN_LABELS_MAP[name] ?? name]) as any}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(val) => BRAIN_LABELS_MAP[val] ?? val}
                  />
                  {BRAIN_META.map(b => (
                    <Line
                      key={b.key}
                      type="monotone"
                      dataKey={b.key}
                      stroke={b.color}
                      strokeWidth={2}
                      dot={{ fill: b.color, r: 2 }}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-navy-500 text-sm">
                Henüz performans verisi yok
              </div>
            )}
          </div>
        )}

        {/* Weight profiles chart */}
        {activeTab === 'weights' && (
          <div className="rounded-xl border border-navy-600 bg-navy-800/50 p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Maç Tipine Göre Brain Ağırlıkları (%)</h2>
            {weightData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={weightData} margin={{ top: 8, right: 16, left: 0, bottom: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis
                    dataKey="profile"
                    tick={{ fill: '#64748b', fontSize: 9 }}
                    angle={-25}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis domain={[0, 50]} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `${v}%`} width={36} />
                  <Tooltip
                    contentStyle={{ background: '#0f1d2a', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#94a3b8' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={((v: unknown, name: string) => [`${v as number}%`, BRAIN_LABELS_MAP[name] ?? name]) as any}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(val) => BRAIN_LABELS_MAP[val] ?? val}
                  />
                  {BRAIN_META.map(b => (
                    <Line
                      key={b.key}
                      type="monotone"
                      dataKey={b.key}
                      stroke={b.color}
                      strokeWidth={2}
                      dot={{ fill: b.color, r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-48 text-navy-500 text-sm">
                Ağırlık profili verisi yok
              </div>
            )}
          </div>
        )}

        {/* Heatmap */}
        {activeTab === 'heatmap' && (
          <div className="rounded-xl border border-navy-600 bg-navy-800/50 p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Maç Tipi × Brain Ağırlık Haritası</h2>
            <p className="text-[11px] text-navy-500 mb-4">Her hücre, o maç tipindeki profil ağırlığını gösterir (koyu = yüksek ağırlık)</p>
            <BrainHeatmap
              cells={heatmapCells}
              matchTypes={MATCH_TYPES}
              brainKeys={BRAIN_META.map(b => b.key)}
              brainColors={BRAIN_COLORS}
              brainLabels={BRAIN_LABELS_MAP}
            />
          </div>
        )}

      </div>
    </div>
  );
}
