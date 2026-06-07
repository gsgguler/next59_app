import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, TrendingUp, Database, FlaskConical, Shield, Star, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useActiveModelStack } from '../../hooks/useActiveModelStack';

interface EloVersionStats {
  elo_version: string;
  snapshot_count: number;
  competition_count: number;
  latest_match_date: string | null;
  avg_brier: number | null;
  avg_log_loss: number | null;
  calibration_gap: number | null;
}

interface FeatureMatrixStats {
  feature_version: string;
  elo_version: string;
  total_rows: number;
  tier_1_count: number;
  tier_2_count: number;
  tier_3_count: number;
  competition_count: number;
  latest_match_date: string | null;
}

interface WalkForwardFold {
  test_year: number;
  match_count: number;
  avg_brier: number | null;
  avg_log_loss: number | null;
  hit_rate: number | null;
  run_key: string;
}

interface CalibrationRow {
  competition_name: string;
  tier: number | null;
  match_count: number;
  avg_brier: number | null;
  avg_log_loss: number | null;
  hit_rate: number | null;
  calibration_gap: number | null;
}

interface StatusData {
  elo_versions: EloVersionStats[];
  feature_matrices: FeatureMatrixStats[];
  walk_forward_folds: WalkForwardFold[];
  calibration_rows: CalibrationRow[];
}

export default function ModelStatusPage() {
  const { stack: activeStack, loading: stackLoading } = useActiveModelStack();
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [eloRes, fmRes, wfRes, calRes] = await Promise.all([
        supabase.rpc('ml_admin_get_elo_version_stats'),
        supabase.rpc('ml_admin_get_feature_matrix_stats'),
        supabase.rpc('ml_admin_get_walk_forward_folds'),
        supabase.rpc('ml_admin_get_calibration_summary'),
      ]);

      const errs = [eloRes.error, fmRes.error, wfRes.error, calRes.error].filter(Boolean);
      if (errs.length > 0) {
        setError(errs.map(e => e!.message).join('; '));
      }

      setData({
        elo_versions: (eloRes.data as EloVersionStats[]) ?? [],
        feature_matrices: (fmRes.data as FeatureMatrixStats[]) ?? [],
        walk_forward_folds: (wfRes.data as WalkForwardFold[]) ?? [],
        calibration_rows: (calRes.data as CalibrationRow[]) ?? [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = 'Model Status | Admin | Next59';
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Admin warning */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Model Status — Admin Only.</strong> ELO versiyonları, feature matrix kapsamı ve kalibrasyon metrikleri.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Model Status</h1>
              <p className="text-sm text-readable-muted mt-1">
                ELO versiyonları · Feature matrisler · Kalibrasyon · Walk-forward validasyon
              </p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40 shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-6 text-xs text-red-400 font-mono">
            RPC Hatası: {error}
          </div>
        )}

        {/* Active Model Stack Banner */}
        <ActiveStackBanner stack={activeStack} loading={stackLoading} />

        {/* ELO Versions */}
        <Section title="ELO Versiyonları" icon={<TrendingUp className="w-4 h-4" />}>
          {loading ? (
            <SkeletonRows count={2} />
          ) : (data?.elo_versions.length ?? 0) === 0 ? (
            <EmptyState>ELO snapshot verisi bulunamadı.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    <Th>Versiyon</Th>
                    <Th>Snapshot</Th>
                    <Th>Lig</Th>
                    <Th>Son Maç</Th>
                    <Th>Brier</Th>
                    <Th>Log Loss</Th>
                    <Th>Cal Gap</Th>
                    <Th>Prod?</Th>
                  </tr>
                </thead>
                <tbody>
                  {data?.elo_versions.map((v) => {
                    const isProd = activeStack ? v.elo_version === activeStack.elo_version : false;
                    return (
                      <tr key={v.elo_version} className={`border-b border-navy-800/50 ${isProd ? 'bg-emerald-500/5' : ''}`}>
                        <td className="py-2.5 pr-4">
                          <span className="font-mono text-white">{v.elo_version}</span>
                        </td>
                        <Td>{v.snapshot_count.toLocaleString('tr-TR')}</Td>
                        <Td>{v.competition_count}</Td>
                        <Td>{v.latest_match_date ? v.latest_match_date.slice(0, 10) : '–'}</Td>
                        <MetricTd value={v.avg_brier} decimals={4} lowerBetter />
                        <MetricTd value={v.avg_log_loss} decimals={4} lowerBetter />
                        <MetricTd value={v.calibration_gap} decimals={4} lowerBetter absBound={0.03} />
                        <td className="py-2.5 pr-4">
                          {isProd
                            ? <span className="flex items-center gap-1 text-emerald-400 font-semibold"><Star className="w-3 h-3" />Aktif</span>
                            : <span className="text-navy-500">–</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Feature Matrices */}
        <Section title="Feature Matrisler" icon={<Database className="w-4 h-4" />} className="mt-4">
          {loading ? (
            <SkeletonRows count={2} />
          ) : (data?.feature_matrices.length ?? 0) === 0 ? (
            <EmptyState>Feature matrix verisi bulunamadı.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    <Th>Versiyon</Th>
                    <Th>ELO</Th>
                    <Th>Toplam</Th>
                    <Th>Tier 1</Th>
                    <Th>Tier 2</Th>
                    <Th>Tier 3</Th>
                    <Th>Lig</Th>
                    <Th>Son Maç</Th>
                  </tr>
                </thead>
                <tbody>
                  {data?.feature_matrices.map((fm) => (
                    <tr key={`${fm.feature_version}-${fm.elo_version}`} className="border-b border-navy-800/50">
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-white text-[11px]">{fm.feature_version}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-navy-300 text-[11px]">{fm.elo_version.replace('elo_v2_', 'v2_').replace('elo_v1_', 'v1_')}</span>
                      </td>
                      <Td>{fm.total_rows.toLocaleString('tr-TR')}</Td>
                      <Td>{fm.tier_1_count.toLocaleString('tr-TR')}</Td>
                      <Td>{fm.tier_2_count.toLocaleString('tr-TR')}</Td>
                      <Td>{fm.tier_3_count.toLocaleString('tr-TR')}</Td>
                      <Td>{fm.competition_count}</Td>
                      <Td>{fm.latest_match_date ? fm.latest_match_date.slice(0, 10) : '–'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Walk-Forward Validation */}
        <Section title="Walk-Forward Validasyon (Yıllık Foldlar)" icon={<FlaskConical className="w-4 h-4" />} className="mt-4">
          {loading ? (
            <SkeletonRows count={4} />
          ) : (data?.walk_forward_folds.length ?? 0) === 0 ? (
            <EmptyState>Walk-forward sonucu bulunamadı. Önce backtest sayfasından çalıştırın.</EmptyState>
          ) : (
            <WalkForwardTable folds={data!.walk_forward_folds} />
          )}
        </Section>

        {/* Calibration per-league */}
        <Section title="Kalibrasyon — Lig × Tier" icon={<TrendingUp className="w-4 h-4" />} className="mt-4">
          {loading ? (
            <SkeletonRows count={6} />
          ) : (data?.calibration_rows.length ?? 0) === 0 ? (
            <EmptyState>Kalibrasyon metriği bulunamadı.</EmptyState>
          ) : (
            <CalibrationTable rows={data!.calibration_rows} />
          )}
        </Section>
      </div>
    </div>
  );
}

function ActiveStackBanner({
  stack,
  loading,
}: {
  stack: { elo_version: string; feature_version: string; prediction_formula: string; calibration_version: string | null; frozen_at: string } | null;
  loading: boolean;
}) {
  if (loading) {
    return <div className="h-14 bg-navy-800/40 rounded-xl animate-pulse mb-4" />;
  }
  if (!stack) {
    return (
      <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-4 flex items-center gap-2 text-xs text-red-400">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Aktif model paketi tanımlı değil — üretim versiyonları belirlenemiyor.
      </div>
    );
  }
  return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 shrink-0">
        <Layers className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Aktif Model Paketi</span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-navy-300">
        <span>ELO: <span className="font-mono text-white">{stack.elo_version}</span></span>
        <span>Features: <span className="font-mono text-white">{stack.feature_version}</span></span>
        <span>Formül: <span className="font-mono text-white">{stack.prediction_formula}</span></span>
        {stack.calibration_version && (
          <span>Kalibrasyon: <span className="font-mono text-white">{stack.calibration_version}</span></span>
        )}
        <span className="text-navy-500">
          Donduruldu: {new Date(stack.frozen_at).toLocaleDateString('tr-TR')}
        </span>
      </div>
    </div>
  );
}

function WalkForwardTable({ folds }: { folds: WalkForwardFold[] }) {
  const byKey = folds.reduce<Record<string, WalkForwardFold[]>>((acc, f) => {
    const base = f.run_key.includes('v2') ? 'V2' : 'V1';
    if (!acc[base]) acc[base] = [];
    acc[base].push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(byKey).map(([version, vFolds]) => (
        <div key={version}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              version === 'V2' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-navy-700 text-navy-300'
            }`}>{version === 'V2' ? 'ELO V2 — Prod Candidate' : 'ELO V1 — Baseline'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-800">
                  <Th>Yıl</Th>
                  <Th>Maç</Th>
                  <Th>Brier</Th>
                  <Th>Log Loss</Th>
                  <Th>Hit Rate</Th>
                </tr>
              </thead>
              <tbody>
                {vFolds.sort((a, b) => a.test_year - b.test_year).map((f) => (
                  <tr key={`${version}-${f.test_year}`} className="border-b border-navy-800/40">
                    <td className="py-2 pr-4 text-white font-medium tabular-nums">{f.test_year}</td>
                    <Td>{f.match_count}</Td>
                    <MetricTd value={f.avg_brier} decimals={4} lowerBetter />
                    <MetricTd value={f.avg_log_loss} decimals={4} lowerBetter />
                    <MetricTd value={f.hit_rate ? f.hit_rate * 100 : null} decimals={1} suffix="%" lowerBetter={false} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function CalibrationTable({ rows }: { rows: CalibrationRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-navy-800">
            <Th>Lig</Th>
            <Th>Tier</Th>
            <Th>Maç</Th>
            <Th>Brier</Th>
            <Th>Log Loss</Th>
            <Th>Hit Rate</Th>
            <Th>Cal Gap</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-navy-800/40">
              <td className="py-2 pr-4 text-white">{r.competition_name}</td>
              <td className="py-2 pr-4">
                {r.tier != null
                  ? <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                      r.tier === 1 ? 'bg-emerald-500/15 text-emerald-400' :
                      r.tier === 2 ? 'bg-amber-500/15 text-amber-400' :
                      'bg-navy-700 text-navy-300'
                    }`}>T{r.tier}</span>
                  : <span className="text-navy-500">–</span>
                }
              </td>
              <Td>{r.match_count}</Td>
              <MetricTd value={r.avg_brier} decimals={4} lowerBetter />
              <MetricTd value={r.avg_log_loss} decimals={4} lowerBetter />
              <MetricTd value={r.hit_rate ? r.hit_rate * 100 : null} decimals={1} suffix="%" lowerBetter={false} />
              <MetricTd value={r.calibration_gap} decimals={4} lowerBetter absBound={0.03} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({
  title, icon, children, className,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-navy-900/50 border border-navy-800 rounded-xl p-5 ${className ?? ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-navy-400">{icon}</span>
        <h2 className="text-xs font-semibold text-readable-muted uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left pb-2 pr-4 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-4 text-navy-300 tabular-nums">{children}</td>;
}

function MetricTd({
  value, decimals, lowerBetter: _lowerBetter, suffix, absBound,
}: {
  value: number | null;
  decimals: number;
  lowerBetter: boolean;
  suffix?: string;
  absBound?: number;
}) {
  if (value == null) return <td className="py-2 pr-4 text-navy-500 tabular-nums">–</td>;

  let colorClass = 'text-navy-300';
  if (absBound != null) {
    colorClass = Math.abs(value) <= absBound ? 'text-emerald-400' : 'text-amber-400';
  }

  return (
    <td className={`py-2 pr-4 tabular-nums font-mono ${colorClass}`}>
      {value.toFixed(decimals)}{suffix ?? ''}
    </td>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-8 bg-navy-800/40 rounded animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-readable-muted">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// keep linter happy — CheckCircle used for potential future green status indicators
void CheckCircle;
