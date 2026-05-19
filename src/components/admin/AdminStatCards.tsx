import { useEffect, useState, useCallback } from 'react';
import {
  Users, Building2, RefreshCw, AlertCircle,
  CheckCircle2, Clock, AlertTriangle, FileText,
  Send, Activity, Radio, Database, Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthSummary {
  total_users:                    number;
  total_orgs:                     number;
  predictions_total:              number;
  predictions_published:          number;
  stories_pending_review:         number;
  publications_total:             number;
  pipeline_last_run_at:           string | null;
  pipeline_last_status:           string | null;
  pipeline_predictions_generated: number | null;
  pipeline_error_count:           number | null;
  sync_last_run_at:               string | null;
  sync_last_status:               string | null;
  sync_matches_updated:           number | null;
  ingestion_runs_24h:             number;
  ingestion_failed_24h:           number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ts: string | null): string {
  if (!ts) return 'Veri Bekleniyor';
  return new Date(ts).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function staleMins(ts: string | null): number | null {
  if (!ts) return null;
  return Math.round((Date.now() - new Date(ts).getTime()) / 60_000);
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-[10px] text-navy-600 font-mono">–</span>;
  }
  const meta: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-400',
    success:   'bg-emerald-500/15 text-emerald-400',
    running:   'bg-blue-500/15 text-blue-400',
    failed:    'bg-red-500/15 text-red-400',
    error:     'bg-red-500/15 text-red-400',
    partial:   'bg-amber-500/15 text-amber-400',
    unknown:   'bg-navy-800 text-navy-500',
  };
  const labels: Record<string, string> = {
    completed: 'Tamamlandı', success: 'Başarılı',
    running: 'Çalışıyor', failed: 'Hatalı',
    error: 'Hata', partial: 'Kısmi', unknown: 'Bilinmiyor',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${meta[status] ?? meta.unknown}`}>
      {labels[status] ?? status}
    </span>
  );
}

function StaleBadge({ ts }: { ts: string | null }) {
  const mins = staleMins(ts);
  if (mins === null) return null;
  if (mins > 60) {
    return (
      <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
        <AlertTriangle className="w-3 h-3" />
        {mins >= 1440 ? `${Math.floor(mins / 1440)}g` : mins >= 60 ? `${Math.floor(mins / 60)}s` : `${mins}dk`} önce
      </span>
    );
  }
  return (
    <span className="text-[10px] text-navy-500">{mins}dk önce</span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color = 'text-white',
  subLabel, subValue, warn = false,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  color?: string;
  subLabel?: string;
  subValue?: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className={`bg-navy-900 border rounded-xl p-4 ${warn ? 'border-amber-500/30' : 'border-navy-800'}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${warn ? 'text-amber-400' : 'text-navy-500'}`} />
        <span className="text-[10px] text-navy-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-mono ${color} mb-0.5`}>{value}</p>
      {(subLabel || subValue) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {subLabel && <span className="text-[10px] text-navy-600">{subLabel}</span>}
          {subValue}
        </div>
      )}
    </div>
  );
}

// ─── Health row (for pipeline / sync) ────────────────────────────────────────

function HealthRow({
  icon: Icon, label, status, lastRun, detail, warn = false,
}: {
  icon: typeof Activity;
  label: string;
  status: string | null;
  lastRun: string | null;
  detail?: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
      warn ? 'bg-amber-500/5 border-amber-500/20' : 'bg-navy-900 border-navy-800'
    }`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${warn ? 'text-amber-400' : 'text-navy-500'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-xs font-medium text-navy-300">{label}</span>
          <StatusPill status={status} />
          {!lastRun && (
            <span className="text-[10px] text-navy-600 flex items-center gap-0.5">
              <Clock className="w-3 h-3" /> Veri Bekleniyor
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {lastRun && (
            <div className="flex items-center gap-1 text-[10px] text-navy-500">
              <Clock className="w-3 h-3" />
              <span>Son: {fmt(lastRun)}</span>
              <StaleBadge ts={lastRun} />
            </div>
          )}
          {detail}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminStatCards() {
  const [data, setData]       = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: err } = await supabase.rpc('admin_get_system_health_summary');
      if (err) throw err;
      setData(result as HealthSummary ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const v = (n: number | null | undefined): string =>
    loading ? '…' : (n == null ? '–' : String(n));

  const pipelineWarn =
    data?.pipeline_last_status === 'failed' ||
    (data?.pipeline_error_count ?? 0) > 0 ||
    (staleMins(data?.pipeline_last_run_at ?? null) ?? 0) > 1440;

  const syncWarn =
    data?.sync_last_status === 'failed' ||
    (staleMins(data?.sync_last_run_at ?? null) ?? 0) > 60;

  const ingestionWarn = (data?.ingestion_failed_24h ?? 0) > 0;

  return (
    <div className="space-y-5">
      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 text-xs text-red-400 font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Top row: refresh + section title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Sistem Sağlığı</h2>
          <p className="text-[11px] text-navy-500">Gerçek zamanlı DB verileri — sahte değer yok</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-800 hover:bg-navy-700 text-navy-300 rounded-lg text-xs transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* User + Org + Prediction + Publication counts */}
      <div>
        <p className="text-[10px] text-navy-600 uppercase tracking-wide mb-2 font-medium">Kullanıcılar & İçerik</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Toplam Kullanıcı"
            value={v(data?.total_users)}
            icon={Users}
            color="text-white"
          />
          <StatCard
            label="Organizasyon"
            value={v(data?.total_orgs)}
            icon={Building2}
            color="text-white"
          />
          <StatCard
            label="Tahmin Durumu"
            value={loading ? '…' : data == null ? '–' : `${data.predictions_published ?? 0} / ${data.predictions_total ?? 0}`}
            icon={CheckCircle2}
            color={(data?.predictions_published ?? 0) > 0 ? 'text-emerald-400' : 'text-navy-500'}
            subLabel="yayınlandı / toplam"
          />
          <StatCard
            label="Yayın Durumu"
            value={loading ? '…' : data == null ? '–' : `${data.publications_total ?? 0}`}
            icon={Send}
            color={(data?.publications_total ?? 0) > 0 ? 'text-emerald-400' : 'text-navy-500'}
            subLabel="görünür yayın"
            subValue={
              (data?.stories_pending_review ?? 0) > 0 ? (
                <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  {data!.stories_pending_review} inceleme bekliyor
                </span>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Pipeline + Sync health */}
      <div>
        <p className="text-[10px] text-navy-600 uppercase tracking-wide mb-2 font-medium">Veri Akışı</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <HealthRow
            icon={Activity}
            label="Günlük Pipeline"
            status={loading ? null : (data?.pipeline_last_status ?? null)}
            lastRun={loading ? null : (data?.pipeline_last_run_at ?? null)}
            warn={!loading && pipelineWarn}
            detail={
              !loading && data?.pipeline_predictions_generated != null ? (
                <span className="text-[10px] text-navy-500">
                  {data.pipeline_predictions_generated} tahmin üretildi
                  {(data.pipeline_error_count ?? 0) > 0 && (
                    <span className="text-red-400 ml-1">· {data.pipeline_error_count} hata</span>
                  )}
                </span>
              ) : undefined
            }
          />
          <HealthRow
            icon={Radio}
            label="Senkronizasyon"
            status={loading ? null : (data?.sync_last_status ?? null)}
            lastRun={loading ? null : (data?.sync_last_run_at ?? null)}
            warn={!loading && syncWarn}
            detail={
              !loading && data?.sync_matches_updated != null ? (
                <span className="text-[10px] text-navy-500">
                  {data.sync_matches_updated} maç güncellendi
                </span>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Ingestion health (last 24h) */}
      <div>
        <p className="text-[10px] text-navy-600 uppercase tracking-wide mb-2 font-medium">Sağlayıcı Sağlığı (Son 24 Saat)</p>
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
          ingestionWarn ? 'bg-amber-500/5 border-amber-500/20' : 'bg-navy-900 border-navy-800'
        }`}>
          <Database className={`w-4 h-4 mt-0.5 shrink-0 ${ingestionWarn ? 'text-amber-400' : 'text-navy-500'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-navy-300">Veri Akışı (ingestion_runs)</span>
              {loading ? (
                <span className="text-[10px] text-navy-600">…</span>
              ) : data == null ? (
                <span className="text-[10px] text-navy-600 flex items-center gap-0.5">
                  <Clock className="w-3 h-3" /> Veri Bekleniyor
                </span>
              ) : (
                <>
                  <span className="text-[11px] font-mono text-white">
                    {data.ingestion_runs_24h} çalışma
                  </span>
                  {data.ingestion_failed_24h > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      {data.ingestion_failed_24h} hatalı iş — Operasyonlar sayfasını kontrol edin
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Hatalı iş yok
                    </span>
                  )}
                </>
              )}
            </div>
            {!loading && data?.ingestion_runs_24h === 0 && (
              <p className="text-[10px] text-navy-600 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Son 24 saatte ingestion çalışması yok
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Data note */}
      <div className="px-4 py-3 bg-navy-900/40 border border-navy-800 rounded-xl text-[10px] text-navy-600 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-navy-700" />
        <span>
          Tüm sayılar doğrudan veritabanından çekilmektedir. Tahmini veya önceden
          hesaplanmış değer kullanılmamaktadır. Detaylı tanı için{' '}
          <a href="/admin/operasyonlar" className="text-navy-400 underline underline-offset-2 hover:text-white transition-colors">
            Operasyonlar
          </a>{' '}
          sayfasına bakın.
        </span>
      </div>

      {/* Removed sections note */}
      <div className="px-4 py-3 bg-navy-900/30 border border-navy-800/50 rounded-xl text-[10px] text-navy-600 flex items-start gap-2">
        <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-navy-700" />
        <span>
          "Bugünkü Girişler" ve "Premium Üye" alanları kaldırıldı — bu değerler için
          gerekli sorgu henüz uygulanmamıştır ve sahte sıfır değer göstermek yanıltıcı olacaktır.
        </span>
      </div>
    </div>
  );
}
