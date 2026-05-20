import { useState, useEffect, useCallback } from 'react';
import {
  Shield, RefreshCw, AlertCircle, CheckCircle2, XCircle,
  AlertTriangle, Clock, Wifi, WifiOff, Activity, ChevronDown,
  ChevronUp, Info, Ban, Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ProviderHealthRow {
  feed_key: string;
  feed_label: string;
  last_success_at: string | null;
  last_attempt_at: string | null;
  rows_total: number;
  rows_today: number;
  http_errors_today: number;
  transform_errors_today: number;
  last_error_msg: string | null;
  stale_hours_threshold: number;
}

type FeedStatus = 'ok' | 'stale' | 'error' | 'dead' | 'no_data';

// ─── Constants ──────────────────────────────────────────────────────────────

// Feed groupings for display
const FEED_GROUPS: Record<string, string[]> = {
  'API-Football Veri Akışları': [
    'af_standings', 'af_injuries', 'af_team_stats', 'af_venues',
    'af_fixtures_upcoming', 'af_uefa',
    'af_h2h', 'af_squads',
  ],
  'Pipeline & Sync': [
    'prematch_pipeline', 'enrichment_sync', 'result_sync',
  ],
};

const FEED_GROUP_ICONS: Record<string, React.ReactNode> = {
  'API-Football Veri Akışları': <Wifi className="w-4 h-4" />,
  'Pipeline & Sync':            <Zap  className="w-4 h-4" />,
};

// ─── Status derivation ──────────────────────────────────────────────────────

function deriveStatus(row: ProviderHealthRow): FeedStatus {
  const hasErrors = row.http_errors_today > 0 || row.transform_errors_today > 0;
  const hasData   = row.rows_total > 0 || row.last_attempt_at != null;

  if (!hasData) return 'no_data';

  if (hasErrors && row.last_success_at == null) return 'error';

  // Dead feed: has data but last fetch was null or very old with no today rows
  if (row.last_attempt_at == null && row.rows_total === 0) return 'dead';

  const now = Date.now();
  const lastSuccess = row.last_success_at ? new Date(row.last_success_at).getTime() : null;
  const lastAttempt = row.last_attempt_at ? new Date(row.last_attempt_at).getTime() : null;
  const thresholdMs = row.stale_hours_threshold * 3_600_000;

  // Has errors today but was previously successful
  if (hasErrors) return 'error';

  if (!lastSuccess) {
    if (lastAttempt && now - lastAttempt > thresholdMs) return 'stale';
    return 'no_data';
  }

  if (now - lastSuccess > thresholdMs) return 'stale';
  return 'ok';
}

function statusConfig(s: FeedStatus) {
  switch (s) {
    case 'ok':      return { label: 'Aktif',        color: 'text-emerald-400', bg: 'bg-emerald-500/12 border-emerald-500/25', icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
    case 'stale':   return { label: 'Bayat Veri',   color: 'text-amber-400',   bg: 'bg-amber-500/12 border-amber-500/25',     icon: <Clock className="w-3.5 h-3.5" /> };
    case 'error':   return { label: 'API Hatası',   color: 'text-red-400',     bg: 'bg-red-500/12 border-red-500/25',         icon: <WifiOff className="w-3.5 h-3.5" /> };
    case 'dead':    return { label: 'Ölü Akış',     color: 'text-red-500',     bg: 'bg-red-500/15 border-red-500/30',         icon: <Ban className="w-3.5 h-3.5" /> };
    case 'no_data': return { label: 'Veri Yok',     color: 'text-navy-400',    bg: 'bg-navy-700/50 border-navy-600/30',       icon: <XCircle className="w-3.5 h-3.5" /> };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAge(ts: string | null): string {
  if (!ts) return '—';
  const diffMs  = Date.now() - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay > 0) return `${diffDay}g önce`;
  if (diffHr  > 0) return `${diffHr}s önce`;
  if (diffMin > 0) return `${diffMin}dk önce`;
  return 'Az önce';
}

function staleLabel(hours: number): string {
  return hours < 24 ? `${hours}s` : `${hours / 24}g`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProviderHealthPage() {
  const [rows, setRows]       = useState<ProviderHealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_get_provider_health');
    if (err) setError(err.message);
    else { setRows((data as ProviderHealthRow[]) ?? []); setLastRefresh(new Date()); }
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = 'Sağlayıcı Sağlığı | Admin | Next59';
    load();
  }, [load]);

  const toggleExpand = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Summary counts
  const byStatus = rows.reduce<Record<FeedStatus, number>>(
    (acc, r) => { acc[deriveStatus(r)]++; return acc; },
    { ok: 0, stale: 0, error: 0, dead: 0, no_data: 0 },
  );
  const alertCount = byStatus.error + byStatus.dead + byStatus.stale;

  // Total pipeline errors (from prematch_pipeline row)
  const pipelineRow = rows.find(r => r.feed_key === 'prematch_pipeline');
  const pipelineErrorCount = pipelineRow?.transform_errors_today ?? 0;

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-6xl mx-auto">

        {/* Admin banner */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Sağlayıcı Sağlığı — Yalnızca Admin.</strong>{' '}
            Gerçek zamanlı API çağrı durumu, bayatlık tespiti ve hata logları.
            Hiçbir otomatik müdahale yapılmaz.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Activity className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Sağlayıcı Sağlığı</h1>
              <p className="text-sm text-readable-muted mt-1">
                Senkronizasyon Durumu · Son Başarılı Çağrı · Hatalı Çağrı · Bayat Veri · Kota Uyarısı
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {lastRefresh && (
              <span className="text-[11px] text-navy-500 hidden sm:block">
                Son güncelleme: {lastRefresh.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>

        {/* Pipeline error alert — always visible if errors exist */}
        {!loading && pipelineErrorCount > 0 && pipelineRow?.last_error_msg && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3.5 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-400 mb-1">
                Prematch Pipeline — {pipelineErrorCount} Hatalı Çağrı (Bugün)
              </div>
              <div className="text-[11px] text-red-300 font-mono">{pipelineRow.last_error_msg}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-6 text-xs text-red-400 font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />Yükleme hatası: {error}
          </div>
        )}

        {/* Summary stat cards */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
          <SummaryCard label="Toplam Akış"  value={rows.length}        />
          <SummaryCard label="Aktif"         value={byStatus.ok}        accent="green" />
          <SummaryCard label="Bayat Veri"    value={byStatus.stale}     accent={byStatus.stale > 0 ? 'amber' : undefined} />
          <SummaryCard label="API Hatası"    value={byStatus.error + byStatus.dead} accent={byStatus.error + byStatus.dead > 0 ? 'red' : undefined} />
          <SummaryCard label="Veri Yok"      value={byStatus.no_data}   accent={byStatus.no_data > 0 ? 'gray' : undefined} />
        </div>

        {/* Alert bar */}
        {!loading && alertCount > 0 && (
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-sm text-amber-300">
              <strong>{alertCount} akış</strong> dikkat gerektiriyor — bayat, hatalı veya ölü akışlar aşağıda kırmızı/sarı ile işaretli.
            </span>
          </div>
        )}

        {/* Feed groups */}
        {loading ? (
          <LoadingSkeleton rows={9} />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {Object.entries(FEED_GROUPS).map(([groupLabel, keys]) => {
              const groupRows = rows.filter(r => keys.includes(r.feed_key));
              if (groupRows.length === 0) return null;
              const groupAlerts = groupRows.filter(r => {
                const s = deriveStatus(r);
                return s === 'error' || s === 'dead' || s === 'stale';
              }).length;

              return (
                <div key={groupLabel} className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-navy-800 flex items-center gap-2">
                    <span className="text-navy-400">{FEED_GROUP_ICONS[groupLabel]}</span>
                    <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider flex-1">
                      {groupLabel}
                    </span>
                    {groupAlerts > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                        <AlertTriangle className="w-3 h-3" />{groupAlerts} uyarı
                      </span>
                    )}
                  </div>

                  <div className="divide-y divide-navy-800/50">
                    {groupRows.map(row => (
                      <FeedRow
                        key={row.feed_key}
                        row={row}
                        expanded={expanded.has(row.feed_key)}
                        onToggle={() => toggleExpand(row.feed_key)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        {!loading && rows.length > 0 && (
          <div className="mt-6 bg-navy-900/30 border border-navy-800/50 rounded-xl px-5 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-3.5 h-3.5 text-navy-500" />
              <span className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Durum Açıklamaları</span>
            </div>
            <div className="flex flex-wrap gap-4 text-[11px] text-navy-500">
              <span><span className="text-emerald-400 font-semibold">Aktif</span> — Son başarılı çağrı eşik süresi içinde</span>
              <span><span className="text-amber-400 font-semibold">Bayat Veri</span> — Son başarılı çağrı eşiği aştı</span>
              <span><span className="text-red-400 font-semibold">API Hatası</span> — HTTP ≥400 veya dönüşüm hatası</span>
              <span><span className="text-red-500 font-semibold">Ölü Akış</span> — Hiç veri yok, çalışmıyor</span>
              <span><span className="text-navy-400 font-semibold">Veri Yok</span> — Henüz çalışmamış</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Feed Row ────────────────────────────────────────────────────────────────

function FeedRow({
  row, expanded, onToggle,
}: {
  row: ProviderHealthRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = deriveStatus(row);
  const cfg    = statusConfig(status);
  const hasErrors = row.http_errors_today > 0 || row.transform_errors_today > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
          status === 'error' || status === 'dead'
            ? 'hover:bg-red-900/5 bg-red-500/3'
            : status === 'stale'
            ? 'hover:bg-amber-900/5'
            : 'hover:bg-navy-800/15'
        }`}
        onClick={onToggle}
      >
        {/* Feed label + status icon */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cfg.color}>{cfg.icon}</span>
            <span className="text-sm font-medium text-white">{row.feed_label}</span>
            <span className="text-[10px] font-mono text-navy-600 hidden sm:block">{row.feed_key}</span>
          </div>
          {/* Error preview inline */}
          {hasErrors && row.last_error_msg && (
            <div className="text-[10px] text-red-400 mt-0.5 truncate max-w-md font-mono">
              {row.last_error_msg}
            </div>
          )}
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-4 shrink-0 text-[11px]">
          {/* Son Başarılı Çağrı */}
          <div className="hidden lg:block text-right">
            <div className="text-navy-500 text-[10px]">Son Başarılı Çağrı</div>
            <div className={`tabular-nums font-medium ${
              status === 'stale' ? 'text-amber-400' :
              status === 'ok'    ? 'text-emerald-400' : 'text-navy-500'
            }`}>
              {formatAge(row.last_success_at)}
            </div>
          </div>

          {/* Bugün */}
          <div className="hidden md:block text-right">
            <div className="text-navy-500 text-[10px]">Bugün</div>
            <div className="text-navy-300 tabular-nums font-medium">{row.rows_today}</div>
          </div>

          {/* Hatalı Çağrı */}
          {hasErrors && (
            <div className="text-right">
              <div className="text-navy-500 text-[10px]">Hatalı Çağrı</div>
              <div className="text-red-400 tabular-nums font-semibold">
                {row.http_errors_today + row.transform_errors_today}
              </div>
            </div>
          )}

          {/* Bayat eşiği */}
          <div className="hidden sm:block text-right">
            <div className="text-navy-500 text-[10px]">Eşik</div>
            <div className="text-navy-500 tabular-nums">{staleLabel(row.stale_hours_threshold)}</div>
          </div>

          {/* Status badge */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.bg} ${cfg.color}`}>
            {cfg.icon}{cfg.label}
          </span>

          {expanded
            ? <ChevronUp className="w-4 h-4 text-navy-500" />
            : <ChevronDown className="w-4 h-4 text-navy-500" />
          }
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 bg-navy-900/20 border-t border-navy-800/50">
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <DetailCard label="Son Başarılı Çağrı"
              value={row.last_success_at ? new Date(row.last_success_at).toLocaleString('tr-TR') : '—'}
              sub={row.last_success_at ? formatAge(row.last_success_at) : 'Hiç başarılı çalışmadı'}
              accent={status === 'ok' ? 'green' : status === 'stale' ? 'amber' : 'red'}
            />
            <DetailCard label="Son Deneme"
              value={row.last_attempt_at ? new Date(row.last_attempt_at).toLocaleString('tr-TR') : '—'}
              sub={formatAge(row.last_attempt_at)}
              accent="neutral"
            />
            <DetailCard label="Toplam Satır / Bugün"
              value={`${row.rows_total.toLocaleString('tr-TR')} / ${row.rows_today}`}
              sub="toplam kayıt / bugün eklenen"
              accent="neutral"
            />
            <DetailCard label="Bayat Eşiği"
              value={`${row.stale_hours_threshold < 24 ? row.stale_hours_threshold + ' saat' : (row.stale_hours_threshold / 24) + ' gün'}`}
              sub={`${formatAge(row.last_success_at)} geçti`}
              accent={status === 'stale' ? 'amber' : status === 'ok' ? 'green' : 'neutral'}
            />
          </div>

          {/* Error section */}
          {hasErrors && (
            <div className="mt-3 bg-red-500/8 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider">Hata Detayı</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                {row.http_errors_today > 0 && (
                  <div className="text-[11px]">
                    <span className="text-navy-500">HTTP Hata (bugün): </span>
                    <span className="text-red-400 font-semibold tabular-nums">{row.http_errors_today}</span>
                  </div>
                )}
                {row.transform_errors_today > 0 && (
                  <div className="text-[11px]">
                    <span className="text-navy-500">Dönüşüm Hatası (bugün): </span>
                    <span className="text-red-400 font-semibold tabular-nums">{row.transform_errors_today}</span>
                  </div>
                )}
              </div>
              {row.last_error_msg && (
                <div className="bg-navy-900/60 rounded p-2 text-[11px] text-red-300 font-mono break-all">
                  {row.last_error_msg}
                </div>
              )}
            </div>
          )}

          {/* Stale warning when no errors */}
          {!hasErrors && status === 'stale' && (
            <div className="mt-3 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-300">
                <span className="font-semibold">Bayat Veri</span> — Son başarılı çağrı{' '}
                <strong>{formatAge(row.last_success_at)}</strong> idi; eşik{' '}
                <strong>{staleLabel(row.stale_hours_threshold)}</strong>. Edge function manuel tetiklenebilir.
              </div>
            </div>
          )}

          {/* Dead feed warning */}
          {status === 'dead' && (
            <div className="mt-3 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <Ban className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-red-300">
                <span className="font-semibold">Ölü Akış</span> — Bu feed hiç çalışmadı veya tüm veriler silindi.
                Edge function yapılandırmasını kontrol edin.
              </div>
            </div>
          )}

          {/* No data */}
          {status === 'no_data' && (
            <div className="mt-3 bg-navy-800/40 border border-navy-700 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-navy-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-navy-400">
                Bu feed henüz hiç çalışmadı. İlk çalışma sonrası veriler burada görünecek.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, accent,
}: {
  label: string;
  value: number;
  accent?: 'green' | 'amber' | 'red' | 'gray';
}) {
  const color =
    accent === 'green' ? 'text-emerald-400' :
    accent === 'amber' ? 'text-amber-400'   :
    accent === 'red'   ? 'text-red-400'     :
    accent === 'gray'  ? 'text-navy-500'    :
    'text-white';
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
    </div>
  );
}

function DetailCard({
  label, value, sub, accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: 'green' | 'amber' | 'red' | 'neutral';
}) {
  const valueColor =
    accent === 'green'   ? 'text-emerald-400' :
    accent === 'amber'   ? 'text-amber-400'   :
    accent === 'red'     ? 'text-red-400'      :
    'text-white';
  return (
    <div className="bg-navy-800/40 rounded-lg p-3">
      <div className="text-[10px] text-navy-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-semibold ${valueColor} tabular-nums`}>{value}</div>
      <div className="text-[10px] text-navy-600 mt-0.5">{sub}</div>
    </div>
  );
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-navy-800/40 rounded animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-12 text-center">
      <Activity className="w-8 h-8 text-navy-700 mx-auto mb-3" />
      <p className="text-sm text-readable-muted">Sağlayıcı verisi bulunamadı.</p>
    </div>
  );
}
