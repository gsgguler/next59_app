import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FlaskConical, Database, Shield, ChevronRight, Activity,
  RefreshCw, CheckCircle, AlertCircle, Clock, Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ModelVersion {
  id: string;
  version_key: string;
  model_name: string;
  model_family: string;
  training_start_date: string;
  training_end_date: string;
  validation_start_date: string;
  validation_end_date: string;
  is_active: boolean;
  created_at: string;
}

interface BacktestRun {
  id: string;
  run_key: string;
  run_status: string;
  run_scope: string;
  total_matches: number;
  processed_matches: number;
  failed_matches: number;
  average_brier_1x2: number | null;
  average_log_loss_1x2: number | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

interface DashboardData {
  active_model: ModelVersion | null;
  run_counts: Record<string, number>;
  latest_runs: BacktestRun[];
  archive_count: number;
}

export default function ModelLabPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupLog, setCleanupLog] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: result, error: err } = await supabase.rpc('ml_get_model_lab_dashboard');
    if (err) setError(err.message);
    else setData(result as DashboardData);
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = 'Model Lab | Admin | Next59';
    load();
  }, [load]);

  async function runCleanup() {
    setCleanupLoading(true);
    setCleanupLog(null);
    const { data: result, error: err } = await supabase.rpc('ml_cleanup_stale_backtest_runs');
    if (err) {
      setCleanupLog(`Hata: ${err.message}`);
    } else {
      const r = result as { cleaned_up: number };
      setCleanupLog(
        r.cleaned_up > 0
          ? `${r.cleaned_up} takılı çalışma "failed" olarak işaretlendi.`
          : 'Takılı çalışma bulunamadı.'
      );
      if (r.cleaned_up > 0) await load();
    }
    setCleanupLoading(false);
  }

  const quickLinks = [
    { label: 'Backtest', to: '/admin/model-lab/backtest', icon: Activity, desc: 'Backtest çalıştır ve geçmiş sonuçları incele' },
    { label: 'Maç İnceleme', to: '/admin/model-lab/mac-inceleme', icon: Database, desc: 'Maç bazında model kararlarını ve gerçek sonuçları karşılaştır' },
    { label: 'Kalibrasyon', to: '/admin/model-lab/kalibrasyon', icon: FlaskConical, desc: 'Toplu kalibrasyon özeti ve Brier/log-loss metrikleri' },
    { label: 'Hata Analizi', to: '/admin/model-lab/hata-analizi', icon: Shield, desc: 'Yanlış tahminlerin ve yüksek güven hatalarının analizi' },
  ];

  const counts = data?.run_counts ?? {};
  const completedRuns = counts.completed ?? 0;
  const failedRuns = counts.failed ?? 0;
  const runningRuns = counts.running ?? 0;
  const totalRuns = Object.values(counts).reduce((s, v) => s + v, 0);
  const latestRuns = data?.latest_runs ?? [];
  const activeModel = data?.active_model ?? null;
  const hasStaleRunning = runningRuns > 0;

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Admin warning */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Model Lab — Admin Only.</strong> Bu alan yalnızca model araştırma ve kalibrasyon içindir. Public kullanıcıya gösterilmez. Model çıktıları public sayfalara yansıtılmaz.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <FlaskConical className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Model Lab</h1>
              <p className="text-sm text-navy-400 mt-1">
                B3 Historical Backbone — Deterministik futbol modeli araştırma merkezi
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

        {/* Stale running warning */}
        {!loading && hasStaleRunning && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">
                <strong>{runningRuns}</strong> çalışma hâlâ "running" durumunda. 30 dakikadan eskiyse takılı kalmış olabilir.
              </p>
            </div>
            <button
              onClick={runCleanup}
              disabled={cleanupLoading}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/15 transition-all disabled:opacity-40 shrink-0"
            >
              {cleanupLoading
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <Trash2 className="w-3 h-3" />}
              Stale Temizle
            </button>
          </div>
        )}

        {/* Cleanup result log */}
        {!hasStaleRunning && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={runCleanup}
              disabled={cleanupLoading}
              className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-navy-400 transition-colors disabled:opacity-40"
            >
              {cleanupLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Stale Temizle
            </button>
          </div>
        )}

        {cleanupLog && (
          <div className="bg-navy-900/60 border border-navy-700 rounded-xl px-4 py-2.5 mb-5 text-xs text-navy-300 font-mono">
            {cleanupLog}
          </div>
        )}

        {/* Stat cards — 2×3 grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            <StatCard
              label="Arşiv Kaydı"
              value={data?.archive_count != null ? Number(data.archive_count).toLocaleString('tr-TR') : '–'}
            />
            <StatCard
              label="Aktif Model"
              value={activeModel?.version_key?.split('_v')[0]?.replace(/_/g, ' ') ?? '–'}
              small
            />
            <StatCard label="Toplam Backtest" value={totalRuns > 0 ? String(totalRuns) : '–'} small />
            <StatCard
              label="Tamamlanan"
              value={String(completedRuns)}
              small
              accent="green"
            />
            <StatCard
              label="Başarısız"
              value={String(failedRuns)}
              small
              accent={failedRuns > 0 ? 'red' : undefined}
            />
            <StatCard
              label="Çalışıyor"
              value={String(runningRuns)}
              small
              accent={runningRuns > 0 ? 'amber' : undefined}
            />
          </div>
        )}

        {/* Active model version */}
        {!loading && activeModel && (
          <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 mb-6">
            <h2 className="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-3">
              Aktif Model Versiyonu
            </h2>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Field label="Version Key" value={activeModel.version_key} mono />
              <Field label="Model Ailesi" value={activeModel.model_family} />
              <Field label="Eğitim Dönemi" value={`${activeModel.training_start_date} → ${activeModel.training_end_date}`} />
              <Field label="Validasyon" value={`${activeModel.validation_start_date} → ${activeModel.validation_end_date}`} />
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {quickLinks.map((q) => (
            <Link
              key={q.to}
              to={q.to}
              className="flex items-start gap-4 bg-navy-900/50 hover:bg-navy-900 border border-navy-800/60 hover:border-navy-700 rounded-xl p-4 transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-navy-800 flex items-center justify-center shrink-0 group-hover:bg-champagne/10 transition-all">
                <q.icon className="w-4 h-4 text-navy-400 group-hover:text-champagne transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-champagne transition-colors">
                  {q.label}
                </p>
                <p className="text-xs text-navy-500 mt-0.5">{q.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-navy-700 group-hover:text-navy-400 shrink-0 mt-0.5" />
            </Link>
          ))}
        </div>

        {/* Latest runs */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5">
          <h2 className="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-4">
            Son Backtest Çalışmaları
          </h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-9 bg-navy-800/40 rounded animate-pulse" />
              ))}
            </div>
          ) : latestRuns.length === 0 ? (
            <p className="text-sm text-navy-600">Henüz backtest çalışması oluşturulmadı.</p>
          ) : (
            <div className="space-y-1.5">
              {latestRuns.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RunRow({ run }: { run: BacktestRun }) {
  const date = run.completed_at
    ? new Date(run.completed_at).toLocaleString('tr-TR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : run.started_at
      ? new Date(run.started_at).toLocaleString('tr-TR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '–';

  return (
    <div className={`flex items-center gap-3 text-xs px-3 py-2 rounded-lg ${
      run.run_status === 'running' ? 'bg-amber-500/5 border border-amber-500/15' :
      run.run_status === 'failed'  ? 'bg-red-500/5 border border-red-500/10' :
      'bg-navy-800/30 border border-navy-800/60'
    }`}>
      <StatusIcon status={run.run_status} />
      <span className="text-white font-medium shrink-0">{run.run_scope}</span>
      <span className="text-navy-500 tabular-nums shrink-0">
        {run.processed_matches}/{run.total_matches}
      </span>
      {run.average_brier_1x2 !== null && run.run_status === 'completed' && (
        <span className="text-navy-500 tabular-nums shrink-0">
          Brier <span className="text-navy-300">{Number(run.average_brier_1x2).toFixed(4)}</span>
        </span>
      )}
      {run.run_status === 'failed' && run.error_message && (
        <span className="text-red-500/70 truncate flex-1 font-mono" title={run.error_message}>
          {run.error_message}
        </span>
      )}
      <span className="text-navy-600 shrink-0 ml-auto tabular-nums">{date}</span>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (status === 'running')   return <RefreshCw   className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-spin" />;
  if (status === 'failed')    return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  return <Clock className="w-3.5 h-3.5 text-navy-500 shrink-0" />;
}

function StatCard({
  label, value, small, accent,
}: {
  label: string;
  value: string;
  small?: boolean;
  accent?: 'green' | 'red' | 'amber';
}) {
  const valueColor =
    accent === 'green' ? 'text-emerald-400' :
    accent === 'red'   ? 'text-red-400' :
    accent === 'amber' ? 'text-amber-400' :
    'text-white';

  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`font-bold tabular-nums ${valueColor} ${small ? 'text-lg' : 'text-xl'}`}>
        {value}
      </div>
      <div className="text-[11px] text-navy-500 mt-0.5">{label}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-xs text-navy-500">{label}: </span>
      <span className={`text-sm text-white ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
