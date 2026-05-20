import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Play, Shield, AlertCircle, CheckCircle2, XCircle,
  Clock, Layers, TrendingUp, Zap, Activity, ChevronDown, ChevronUp,
  AlertTriangle, Database, BarChart3,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoopRun {
  id: string;
  loop_key: string;
  trigger_source: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  providers_checked: number;
  providers_stale: number;
  pipeline_run_id: string | null;
  fixtures_seen: number;
  readiness_processed: number;
  features_generated: number;
  predictions_generated: number;
  brain_packages_generated: number;
  scenarios_generated: number;
  stories_generated: number;
  skipped_existing: number;
  blocked_count: number;
  live_matches_processed: number;
  evaluations_generated: number;
  calibration_updates: number;
  warnings_json: WarningEntry[];
  errors_json: ErrorEntry[];
  error_count: number;
}

interface WarningEntry {
  step: string;
  feed?: string;
  label?: string;
  last_success_at?: string | null;
  stale_threshold_hours?: number;
  warning?: string;
}

interface ErrorEntry {
  step: string;
  error?: string;
  error_count?: number;
  match?: string;
  detail?: unknown;
}

interface RunResult {
  loop_id: string;
  trigger_source: string;
  providers_checked: number;
  providers_stale: number;
  fixtures_seen: number;
  predictions_generated: number;
  brains_generated: number;
  stories_generated: number;
  skipped_existing: number;
  blocked: number;
  live_synced_1h: number;
  evaluations_today: number;
  calibration_updated: boolean;
  error_count: number;
  warning_count: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperasyonDongusuPage() {
  const [runs, setRuns] = useState<LoopRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_get_operational_loop_runs', { p_limit: 20 });
    if (err) setError(err.message);
    else setRuns((data as LoopRun[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = 'Operasyon Döngüsü | Admin | Next59';
    load();
  }, [load]);

  async function runLoop() {
    setRunning(true);
    setRunResult(null);
    setRunError(null);
    setConfirmOpen(false);

    const { data, error: err } = await supabase.rpc('invoke_daily_operational_loop', {
      p_trigger_source: 'admin_manual',
    });
    if (err) {
      setRunError(err.message);
    } else {
      setRunResult(data as RunResult);
      await load();
    }
    setRunning(false);
  }

  const latestRun = runs[0] ?? null;

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Admin warning */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-6 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Operasyon Döngüsü — Yalnızca Yönetici.</strong> Günlük otomasyon döngüsünü izler ve manuel tetikler. Otomatik yayın yapılmaz.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Operasyon Döngüsü</h1>
              <p className="text-sm text-readable-muted mt-1">
                Sağlayıcı · Özellik · Tahmin · Beyin · Hikaye · Sonuç · Değerlendirme · Kalibrasyon
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={running}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-all disabled:opacity-40"
            >
              {running
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Çalışıyor...</>
                : <><Play className="w-4 h-4" />Döngüyü Manuel Çalıştır</>
              }
            </button>
          </div>
        </div>

        {/* Confirm dialog */}
        {confirmOpen && (
          <div className="bg-navy-800/80 border border-navy-700 rounded-xl p-5 mb-6 flex items-start gap-4">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white mb-1">Döngüyü manuel çalıştır?</p>
              <p className="text-xs text-navy-400 mb-4">
                Bu işlem sağlayıcı kontrolü, tahmin üretimi, beyin paketi ve hikaye taslakları oluşturur.
                Hiçbir şey otomatik olarak yayınlanmaz. İdempotent — zaten varsa atlar.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={runLoop}
                  className="text-xs font-semibold px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 transition-all"
                >
                  Evet, çalıştır
                </button>
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="text-xs px-3 py-2 rounded-lg bg-navy-700 border border-navy-600 text-navy-400 hover:text-white transition-all"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Run result */}
        {runResult && (
          <RunResultPanel result={runResult} onClose={() => setRunResult(null)} />
        )}

        {runError && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-5 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Manuel çalıştırma hatası: {runError}
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-5 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Latest run summary */}
        {latestRun && <LatestRunSummary run={latestRun} />}

        {/* Cron schedule info */}
        <CronInfoPanel />

        {/* Run history */}
        <div className="mt-5 bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-navy-800/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Döngü Geçmişi</h2>
            <span className="text-xs text-navy-500">{runs.length} kayıt</span>
          </div>
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-navy-800/40 rounded animate-pulse" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="p-8 text-center text-sm text-navy-500">
              Henüz döngü kaydı yok. İlk çalıştırmak için yukarıdaki butonu kullanın.
            </div>
          ) : (
            <div className="divide-y divide-navy-800/50">
              {runs.map(run => (
                <RunRow
                  key={run.id}
                  run={run}
                  expanded={expandedRun === run.id}
                  onToggle={() => setExpandedRun(prev => prev === run.id ? null : run.id)}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LatestRunSummary({ run }: { run: LoopRun }) {
  const dur = run.completed_at
    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 mb-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Son Operasyon Döngüsü</h2>
        <div className="flex items-center gap-2">
          <StatusBadge status={run.status} errorCount={run.error_count} />
          <span className="text-xs text-navy-500">
            {new Date(run.started_at).toLocaleString('tr-TR', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
          {dur != null && (
            <span className="text-xs text-navy-600">{dur}s</span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-800 text-navy-500 border border-navy-700">
            {run.trigger_source}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatBox label="Fikstür" value={run.fixtures_seen} icon={<Database className="w-3.5 h-3.5" />} />
        <StatBox label="Tahmin" value={run.predictions_generated} icon={<TrendingUp className="w-3.5 h-3.5" />} color="blue" />
        <StatBox label="Beyin" value={run.brain_packages_generated} icon={<Layers className="w-3.5 h-3.5" />} color="blue" />
        <StatBox label="Hikaye" value={run.stories_generated} icon={<BarChart3 className="w-3.5 h-3.5" />} color="blue" />
        <StatBox label="Atlandı" value={run.skipped_existing} icon={<Clock className="w-3.5 h-3.5" />} />
        <StatBox label="Bloke" value={run.blocked_count} icon={<XCircle className="w-3.5 h-3.5" />} color={run.blocked_count > 0 ? 'amber' : undefined} />
        <StatBox label="Hata" value={run.error_count} icon={<AlertCircle className="w-3.5 h-3.5" />} color={run.error_count > 0 ? 'red' : 'green'} />
        <StatBox label="Uyarı" value={run.warnings_json?.length ?? 0} icon={<AlertTriangle className="w-3.5 h-3.5" />} color={(run.warnings_json?.length ?? 0) > 0 ? 'amber' : undefined} />
      </div>

      {/* Stale provider warnings */}
      {run.providers_stale > 0 && (
        <div className="mt-4 pt-4 border-t border-navy-800/50">
          <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Bayat Sağlayıcı Uyarıları ({run.providers_stale}/{run.providers_checked})
          </p>
          <div className="flex flex-wrap gap-2">
            {(run.warnings_json ?? [])
              .filter(w => w.step === 'provider_check')
              .map((w, i) => (
                <span key={i} className="text-[11px] px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono">
                  {w.label ?? w.feed}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Error summary */}
      {run.error_count > 0 && (
        <ErrorSummary errors={run.errors_json ?? []} />
      )}
    </div>
  );
}

function RunResultPanel({ result, onClose }: { result: RunResult; onClose: () => void }) {
  return (
    <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-emerald-400">Manuel çalıştırma tamamlandı</span>
          {result.error_count > 0 && (
            <span className="text-xs text-amber-400">({result.error_count} hata)</span>
          )}
        </div>
        <button onClick={onClose} className="text-navy-500 hover:text-white text-xs transition-colors">
          Kapat
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
        <ResultCell label="Fikstür" value={result.fixtures_seen} />
        <ResultCell label="Tahmin" value={result.predictions_generated} />
        <ResultCell label="Beyin" value={result.brains_generated} />
        <ResultCell label="Hikaye" value={result.stories_generated} />
        <ResultCell label="Atlandı" value={result.skipped_existing} />
        <ResultCell label="Hata" value={result.error_count} alert={result.error_count > 0} />
      </div>
      {result.warning_count > 0 && (
        <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {result.warning_count} sağlayıcı uyarısı — Sağlayıcı Sağlığı sayfasını kontrol edin.
        </p>
      )}
    </div>
  );
}

function CronInfoPanel() {
  return (
    <div className="bg-navy-900/30 border border-navy-800/60 rounded-xl px-5 py-4 mb-5">
      <h2 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Zap className="w-3.5 h-3.5" />
        Zamanlanmış Döngüler
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <CronRow name="operational-loop-daily" schedule="Her gün 08:00 UTC" desc="Tam döngü — sağlayıcı + tahmin + beyin + değerlendirme + kalibrasyon" />
        <CronRow name="operational-loop-matchday" schedule="6 saatte bir" desc="Maç günü yenileme — aynı günkü fikstürler için hazırlığı günceller" />
      </div>
      <p className="text-[10px] text-navy-600 mt-3">
        Ayrıca: daily-prematch-pipeline 07:00 · standings-sync saatlik · result-sync 15dk · eval 30dk
      </p>
    </div>
  );
}

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: LoopRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  const dur = run.completed_at
    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-navy-800/30 transition-colors text-left"
      >
        <StatusDot status={run.status} errorCount={run.error_count} />
        <span className="text-xs text-white font-mono shrink-0 w-36">
          {new Date(run.started_at).toLocaleString('tr-TR', {
            day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit',
          })}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-navy-800 text-navy-500 border border-navy-700 shrink-0">
          {run.trigger_source}
        </span>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Pill label="Fikstür" value={run.fixtures_seen} />
          <Pill label="Tahmin" value={run.predictions_generated} />
          <Pill label="Beyin" value={run.brain_packages_generated} />
          <Pill label="Hata" value={run.error_count} alert={run.error_count > 0} />
          {run.warnings_json?.length > 0 && (
            <Pill label="Uyarı" value={run.warnings_json.length} amber />
          )}
        </div>
        {dur != null && <span className="text-[10px] text-navy-600 shrink-0">{dur}s</span>}
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-navy-500 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-navy-500 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="px-5 pb-4 bg-navy-800/20 border-t border-navy-800/40">
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 pt-3 mb-3">
            <StatBox label="Fikstür" value={run.fixtures_seen} />
            <StatBox label="Tahmin" value={run.predictions_generated} />
            <StatBox label="Beyin" value={run.brain_packages_generated} />
            <StatBox label="Hikaye" value={run.stories_generated} />
            <StatBox label="Atlandı" value={run.skipped_existing} />
            <StatBox label="Bloke" value={run.blocked_count} />
            <StatBox label="Hata" value={run.error_count} color={run.error_count > 0 ? 'red' : 'green'} />
            <StatBox label="Değerlend." value={run.evaluations_generated} />
          </div>

          {run.errors_json?.length > 0 && (
            <ErrorSummary errors={run.errors_json} />
          )}

          {run.warnings_json?.filter(w => w.step === 'provider_check').length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold text-amber-400 mb-1.5 uppercase tracking-wider">Bayat Sağlayıcılar</p>
              <div className="flex flex-wrap gap-1.5">
                {run.warnings_json.filter(w => w.step === 'provider_check').map((w, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono">
                    {w.label ?? w.feed}
                  </span>
                ))}
              </div>
            </div>
          )}

          {run.warnings_json?.filter(w => w.step !== 'provider_check').length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold text-navy-400 mb-1.5 uppercase tracking-wider">Diğer Uyarılar</p>
              <div className="space-y-1">
                {run.warnings_json.filter(w => w.step !== 'provider_check').map((w, i) => (
                  <div key={i} className="text-[10px] font-mono text-navy-400 bg-navy-800/50 rounded px-2 py-1">
                    [{w.step}] {w.warning}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorSummary({ errors }: { errors: ErrorEntry[] }) {
  const pipelineErrors = errors.filter(e => e.step === 'pipeline');
  const otherErrors = errors.filter(e => e.step !== 'pipeline');

  return (
    <div className="mt-3 pt-3 border-t border-navy-800/50">
      <p className="text-[10px] font-semibold text-red-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
        <XCircle className="w-3 h-3" />
        Hatalar
      </p>
      {pipelineErrors.map((e, i) => {
        const detail = e.detail as { error?: string; step?: string; match?: string }[] | null;
        const firstError = Array.isArray(detail) ? detail[0] : null;
        return (
          <div key={i} className="text-[10px] bg-red-500/5 border border-red-500/15 rounded px-3 py-2 mb-1.5">
            <span className="text-red-400 font-medium">[pipeline]</span>
            <span className="text-navy-400 ml-2">{e.error_count ?? 0} hata</span>
            {firstError && (
              <div className="mt-1 text-red-300/70 font-mono truncate">
                {firstError.error ?? JSON.stringify(firstError)}
              </div>
            )}
          </div>
        );
      })}
      {otherErrors.map((e, i) => (
        <div key={i} className="text-[10px] bg-red-500/5 border border-red-500/15 rounded px-3 py-2 mb-1.5">
          <span className="text-red-400 font-medium">[{e.step}]</span>
          <span className="text-red-300/70 ml-2 font-mono">{e.error}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function StatusBadge({ status, errorCount }: { status: string; errorCount: number }) {
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
        <XCircle className="w-3 h-3" />Başarısız
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">
        <RefreshCw className="w-3 h-3 animate-spin" />Çalışıyor
      </span>
    );
  }
  if (errorCount > 0) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
        <AlertTriangle className="w-3 h-3" />Uyarılı Tamamlandı
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      <CheckCircle2 className="w-3 h-3" />Tamamlandı
    </span>
  );
}

function StatusDot({ status, errorCount }: { status: string; errorCount: number }) {
  const cls = status === 'failed' ? 'bg-red-500'
    : status === 'running' ? 'bg-blue-500 animate-pulse'
    : errorCount > 0 ? 'bg-amber-500'
    : 'bg-emerald-500';
  return <div className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

function StatBox({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'amber' | 'red';
}) {
  const valueColor = color === 'blue' ? 'text-blue-400'
    : color === 'green' ? 'text-emerald-400'
    : color === 'amber' ? 'text-amber-400'
    : color === 'red' ? 'text-red-400'
    : 'text-white';

  return (
    <div className="bg-navy-800/40 rounded-lg px-3 py-2 min-w-0">
      <div className={`text-lg font-bold tabular-nums ${valueColor}`}>{value}</div>
      <div className="flex items-center gap-1 text-[10px] text-navy-500 mt-0.5">
        {icon && <span>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  alert,
  amber,
}: {
  label: string;
  value: number;
  alert?: boolean;
  amber?: boolean;
}) {
  const cls = alert ? 'text-red-400'
    : amber ? 'text-amber-400'
    : 'text-navy-400';
  return (
    <span className={`text-[10px] ${cls}`}>
      {label}: <span className="font-mono">{value}</span>
    </span>
  );
}

function ResultCell({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="bg-navy-800/50 rounded-lg px-3 py-2">
      <div className={`text-base font-bold tabular-nums ${alert ? 'text-red-400' : 'text-white'}`}>{value}</div>
      <div className="text-[10px] text-navy-500">{label}</div>
    </div>
  );
}

function CronRow({ name, schedule, desc }: { name: string; schedule: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 bg-navy-800/40 rounded-lg px-3 py-2.5">
      <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
      <div>
        <div className="font-mono text-[11px] text-white">{name}</div>
        <div className="text-[10px] text-blue-400 font-medium mt-0.5">{schedule}</div>
        <div className="text-[10px] text-navy-500 mt-0.5">{desc}</div>
      </div>
    </div>
  );
}
