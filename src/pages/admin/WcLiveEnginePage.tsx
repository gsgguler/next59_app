import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, AlertTriangle, CheckCircle2, Activity, Database,
  Clock, Wifi, WifiOff, Play, ChevronDown, ChevronUp,
  AlertCircle, Info, Zap, Radio, Calendar,
  BarChart2, Shield, HelpCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EngineStatus {
  last_engine_run_at:        string | null;
  last_engine_status:        string;
  last_engine_processed:     number;
  last_engine_duration_ms:   number;
  last_sync_run_at:          string | null;
  last_sync_status:          string;
  last_sync_matches_updated: number;
  stale_count:               number;
  live_match_state_count:    number;
  outcome_count:             number;
  pattern_count:             number;
}

interface FixtureStatus {
  api_football_fixture_id: number;
  match_date:              string | null;
  stage_code:              string | null;
  group_label:             string | null;
  home_team_name:          string;
  away_team_name:          string;
  home_api_team_id:        number | null;
  away_api_team_id:        number | null;
  fixture_db_status:       string;
  has_lineups:             boolean;
  has_events:              boolean;
  has_live_state:          boolean;
  is_stale:                boolean;
  last_sync_at:            string | null;
}

interface EngineRun {
  id:                 string;
  started_at:         string;
  completed_at:       string | null;
  status:             string;
  fixtures_processed: number;
  fixtures_errored:   number;
  duration_ms:        number;
}

interface SyncRun {
  id:               string;
  started_at:       string;
  completed_at:     string | null;
  status:           string;
  matches_seen:     number;
  matches_updated:  number;
  events_processed: number;
  lineups_processed: number;
}

type TabId = 'overview' | 'fixtures' | 'engine-runs' | 'sync-runs';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt(ts: string | null): string {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function staleMins(ts: string | null): number | null {
  if (!ts) return null;
  return Math.round((Date.now() - new Date(ts).getTime()) / 60_000);
}

function StatusDot({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const color = ok ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-navy-700';
  const textColor = ok ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-navy-500';
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${color} ${ok ? 'shadow-[0_0_6px] shadow-emerald-500/50]' : ''}`} />
      <span className={`text-[11px] ${textColor}`}>{label}</span>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const meta: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
    running:   'bg-blue-500/15 text-blue-400 border border-blue-500/25',
    failed:    'bg-red-500/15 text-red-400 border border-red-500/25',
    success:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
    error:     'bg-red-500/15 text-red-400 border border-red-500/25',
    unknown:   'bg-navy-700 text-navy-500',
  };
  const label: Record<string, string> = {
    completed: 'Tamamlandı', running: 'Çalışıyor', failed: 'Hatalı',
    success: 'Başarılı', error: 'Hata', unknown: 'Bilinmiyor',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${meta[status] ?? meta.unknown}`}>
      {label[status] ?? status}
    </span>
  );
}

function DbStatusBadge({ status }: { status: string }) {
  const live    = ['1H', '2H', 'ET', 'P', 'BT', 'LIVE'].includes(status);
  const done    = ['FT', 'AET', 'PEN'].includes(status);
  const pending = ['NS', 'not_started'].includes(status);
  const color = live
    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
    : done
    ? 'bg-navy-700 text-navy-400'
    : pending
    ? 'bg-navy-800 text-navy-600'
    : 'bg-amber-500/10 text-amber-500';
  const trLabel: Record<string, string> = {
    NS: 'Başlamadı', not_started: 'Başlamadı',
    '1H': 'İlk Yarı', '2H': 'İkinci Yarı',
    HT: 'Devre Arası', ET: 'Uzatma', P: 'Penaltı',
    BT: 'Penaltı Öncesi', LIVE: 'Canlı',
    FT: 'Bitti', AET: 'U.Bitti', PEN: 'Pen.Bitti',
    SUSP: 'Ertelendi', PST: 'Ertelendi', CANC: 'İptal',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
      {trLabel[status] ?? status}
    </span>
  );
}

function DataFlag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
      ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-navy-800 text-navy-600'
    }`}>
      {label}
    </span>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-4 text-xs text-red-400 font-mono flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  );
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-10 text-center">
      <Database className="w-10 h-10 text-navy-700 mx-auto mb-3" />
      <p className="text-sm text-navy-400 mb-2">{title}</p>
      <p className="text-xs text-navy-600 max-w-md mx-auto">{desc}</p>
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="p-5 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-navy-800/40 rounded animate-pulse" />
      ))}
    </div>
  );
}

// ─── Waiting state banner ─────────────────────────────────────────────────────

function WaitingBanner() {
  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-navy-800 flex items-center justify-center shrink-0">
        <Clock className="w-5 h-5 text-navy-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-navy-300 mb-1">Maç Başlamadı</p>
        <p className="text-xs text-navy-500 leading-relaxed max-w-xl">
          Canlı maç motoru aktif değil. WC2026 fikstürleri başlamadığından canlı durum, olay akışı veya anlık kadro verisi bulunmuyor.
          Motor, maçlar başladığında otomatik olarak devreye girecek.
        </p>
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  status,
  loading,
  error,
  onRefresh,
}: {
  status: EngineStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const engineMinsSince = staleMins(status?.last_engine_run_at ?? null);
  const syncMinsSince   = staleMins(status?.last_sync_run_at ?? null);

  const engineHealthy  = !!status?.last_engine_run_at && (engineMinsSince ?? 999) < 10;
  const engineWarning  = !!status?.last_engine_run_at && (engineMinsSince ?? 999) >= 10;
  const syncHealthy    = !!status?.last_sync_run_at && (syncMinsSince ?? 999) < 20;
  const syncWarning    = !!status?.last_sync_run_at && (syncMinsSince ?? 999) >= 20;

  const noLiveData = !status?.last_engine_run_at && !status?.last_sync_run_at;

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      {/* Waiting banner if no live activity */}
      {!loading && noLiveData && <WaitingBanner />}

      {/* Engine health cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label:    'Canlı Maç Motoru',
            value:    status?.last_engine_status ?? '–',
            sub:      status?.last_engine_run_at ? `${engineMinsSince} dk önce` : 'Hiç çalışmadı',
            icon:     Zap,
            ok:       engineHealthy,
            warn:     engineWarning,
          },
          {
            label:    'Senkronizasyon',
            value:    status?.last_sync_status ?? '–',
            sub:      status?.last_sync_run_at ? `${syncMinsSince} dk önce` : 'Hiç çalışmadı',
            icon:     Radio,
            ok:       syncHealthy,
            warn:     syncWarning,
          },
          {
            label:    'Bayat Maç Uyarısı',
            value:    String(status?.stale_count ?? 0),
            sub:      status?.stale_count ? 'Çözümsüz uyarı' : 'Temiz',
            icon:     AlertTriangle,
            ok:       (status?.stale_count ?? 0) === 0,
            warn:     (status?.stale_count ?? 1) > 0,
          },
          {
            label:    'Canlı Durum Satırı',
            value:    String(status?.live_match_state_count ?? 0),
            sub:      'live_match_states',
            icon:     Activity,
            ok:       (status?.live_match_state_count ?? 0) > 0,
            warn:     false,
          },
        ].map(({ label, value, sub, icon: Icon, ok, warn }) => (
          <div
            key={label}
            className={`bg-navy-900 border rounded-xl p-4 ${
              ok ? 'border-emerald-500/20' : warn ? 'border-amber-500/20' : 'border-navy-800'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 ${ok ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-navy-600'}`} />
              <span className="text-[10px] text-navy-500 uppercase tracking-wide">{label}</span>
            </div>
            <p className={`text-xl font-bold mb-0.5 truncate ${ok ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-navy-500'}`}>
              {loading ? '…' : value}
            </p>
            <p className="text-[10px] text-navy-600 truncate">{loading ? '' : sub}</p>
          </div>
        ))}
      </div>

      {/* Engine detail */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Last engine run */}
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-navy-500" />
              <span className="text-xs font-semibold text-navy-300">Canlı Maç Motoru</span>
            </div>
            <StatusDot
              ok={engineHealthy}
              warn={engineWarning}
              label={engineHealthy ? 'Aktif' : engineWarning ? 'Bayat' : 'Veri Yok'}
            />
          </div>
          <EngineDetailRow label="Son Çalışma"     value={fmt(status?.last_engine_run_at ?? null)} />
          <EngineDetailRow label="Son Durum"       value={status?.last_engine_status ?? '–'} />
          <EngineDetailRow label="İşlenen Fikstür" value={String(status?.last_engine_processed ?? 0)} />
          <EngineDetailRow label="Süre"            value={fmtMs(status?.last_engine_duration_ms ?? 0)} />
          {engineWarning && (
            <div className="text-[11px] text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Bayat Veri Uyarısı — Motor {engineMinsSince} dakikadır çalışmadı
            </div>
          )}
          {!status?.last_engine_run_at && !loading && (
            <div className="text-[11px] text-navy-500 bg-navy-800/50 border border-navy-700 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Clock className="w-3 h-3 shrink-0" />
              Veri Bekleniyor — Henüz hiç motor çalışması yok
            </div>
          )}
        </div>

        {/* Last sync run */}
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-navy-500" />
              <span className="text-xs font-semibold text-navy-300">Senkronizasyon (af-live-result-sync)</span>
            </div>
            <StatusDot
              ok={syncHealthy}
              warn={syncWarning}
              label={syncHealthy ? 'Aktif' : syncWarning ? 'Bayat' : 'Veri Yok'}
            />
          </div>
          <EngineDetailRow label="Son Çalışma"       value={fmt(status?.last_sync_run_at ?? null)} />
          <EngineDetailRow label="Son Durum"         value={status?.last_sync_status ?? '–'} />
          <EngineDetailRow label="Güncellenen Maç"   value={String(status?.last_sync_matches_updated ?? 0)} />
          {syncWarning && (
            <div className="text-[11px] text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Bayat Veri Uyarısı — Senkronizasyon {syncMinsSince} dakikadır çalışmadı
            </div>
          )}
          {!status?.last_sync_run_at && !loading && (
            <div className="text-[11px] text-navy-500 bg-navy-800/50 border border-navy-700 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Clock className="w-3 h-3 shrink-0" />
              Veri Bekleniyor — Henüz hiç senkronizasyon çalışması yok
            </div>
          )}
        </div>
      </div>

      {/* Memory stats */}
      <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-navy-500" />
          <span className="text-xs font-semibold text-navy-300">Canlı Bellek İstatistikleri</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Olay Akışı Sonuçları', value: status?.outcome_count ?? 0, desc: 'live_state_outcomes' },
            { label: 'Örüntü Belleği',       value: status?.pattern_count ?? 0,  desc: 'live_state_pattern_memory' },
            { label: 'Bayat Uyarı',          value: status?.stale_count ?? 0,    desc: 'live_match_stale_warnings' },
          ].map(({ label, value, desc }) => (
            <div key={label}>
              <p className="text-[10px] text-navy-500 mb-0.5">{label}</p>
              <p className={`text-lg font-bold font-mono ${loading ? 'text-navy-600' : 'text-white'}`}>
                {loading ? '…' : value.toLocaleString('tr-TR')}
              </p>
              <p className="text-[10px] text-navy-700 font-mono">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cron schedule info */}
      <div className="bg-navy-900/40 border border-navy-800 rounded-xl p-4 text-[11px] text-navy-500">
        <div className="flex items-center gap-1.5 mb-2 text-navy-400">
          <Info className="w-3.5 h-3.5" />
          <span className="font-medium">Cron Takvimi</span>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {[
            { cron: 'Her 5 dk',  job: 'result-sync-live-5min',           desc: 'Canlı maç senkronizasyonu' },
            { cron: 'Her 5 dk',  job: 'detect-stale-live-5min',          desc: 'Bayat maç tespiti' },
            { cron: 'Her 15 dk', job: 'af-live-result-sync-15m',         desc: 'Son maç sonucu senkronizasyonu' },
            { cron: 'Her 30 dk', job: 'af-pre-kickoff-lineups-30m',       desc: 'Yaklaşan maç kadroları' },
            { cron: 'Her 6 sa',  job: 'af-upcoming-fixtures-6h',          desc: 'Gelecek fikstür güncelleme' },
          ].map(({ cron, job, desc }) => (
            <li key={job} className="flex items-start gap-2">
              <span className="text-emerald-600 shrink-0 font-mono w-14">{cron}</span>
              <span>
                <span className="text-navy-400 font-mono">{job}</span>
                <span className="text-navy-600"> — {desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EngineDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-navy-500">{label}</span>
      <span className="text-navy-300 font-mono">{value}</span>
    </div>
  );
}

// ─── Fixtures tab ─────────────────────────────────────────────────────────────

type FixtureFilter = 'tumu' | 'live' | 'no_lineup' | 'no_events' | 'stale';

function FixturesTab() {
  const [rows, setRows]       = useState<FixtureStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<FixtureFilter>('tumu');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.rpc('wc2026_get_live_fixture_status', { p_limit: 104 });
      if (err) throw err;
      setRows((data ?? []) as FixtureStatus[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const liveStatuses = ['1H', '2H', 'ET', 'P', 'BT', 'LIVE', 'HT'];

  const filtered = rows.filter(r => {
    if (filter === 'live')      return liveStatuses.includes(r.fixture_db_status);
    if (filter === 'no_lineup') return !r.has_lineups;
    if (filter === 'no_events') return !r.has_events;
    if (filter === 'stale')     return r.is_stale;
    return true;
  });

  const liveCount     = rows.filter(r => liveStatuses.includes(r.fixture_db_status)).length;
  const noLineupCount = rows.filter(r => !r.has_lineups).length;
  const noEventsCount = rows.filter(r => !r.has_events).length;
  const staleCount    = rows.filter(r => r.is_stale).length;

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {([
          { id: 'tumu'      as FixtureFilter, label: `Tümü (${rows.length})`,                color: '' },
          { id: 'live'      as FixtureFilter, label: `Canlı (${liveCount})`,                 color: liveCount > 0 ? 'text-emerald-400' : '' },
          { id: 'no_lineup' as FixtureFilter, label: `Kadro Yok (${noLineupCount})`,         color: noLineupCount > 0 ? 'text-amber-400' : '' },
          { id: 'no_events' as FixtureFilter, label: `Olay Yok (${noEventsCount})`,          color: noEventsCount > 0 ? 'text-amber-400' : '' },
          { id: 'stale'     as FixtureFilter, label: `Bayat Uyarı (${staleCount})`,          color: staleCount > 0 ? 'text-red-400' : '' },
        ] as const).map(({ id, label, color }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === id
                ? 'bg-navy-700 border-navy-600 text-white'
                : `bg-navy-900 border-navy-800 ${color || 'text-navy-400'} hover:border-navy-700`
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-navy-800 hover:bg-navy-700 text-navy-300 rounded-lg text-xs transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* No live fixtures state */}
      {!loading && liveCount === 0 && filter === 'live' && (
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-8 text-center">
          <WifiOff className="w-10 h-10 text-navy-700 mx-auto mb-3" />
          <p className="text-sm font-medium text-navy-400 mb-1">Canlı Maç Yok</p>
          <p className="text-xs text-navy-600">Şu an hiçbir WC2026 fikstürü canlı durumda değil.</p>
        </div>
      )}

      {loading ? (
        <Skeleton rows={10} />
      ) : filtered.length === 0 && filter !== 'live' ? (
        <EmptyState
          title="Fikstür verisi bulunamadı"
          desc="wc2026_fixtures tablosu boş. Fikstür verilerini içe aktarın."
        />
      ) : (
        <div className="bg-navy-950 border border-navy-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-navy-800 bg-navy-900/60">
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium">Fikstür</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden sm:table-cell w-24">Tarih</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium w-28">DB Durumu</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden md:table-cell w-40">Veri Durumu</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden lg:table-cell w-32">Canlı Durum</th>
                <th className="px-3 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const isLive = liveStatuses.includes(row.fixture_db_status);
                return (
                  <React.Fragment key={row.api_football_fixture_id}>
                    <tr
                      className={`border-b border-navy-800/50 cursor-pointer transition-colors ${
                        isLive ? 'bg-emerald-950/20' : expanded === row.api_football_fixture_id ? 'bg-navy-800/30' : 'hover:bg-navy-900/40'
                      } ${row.is_stale ? 'border-l-2 border-l-red-500/50' : ''}`}
                      onClick={() => setExpanded(expanded === row.api_football_fixture_id ? null : row.api_football_fixture_id)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {isLive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
                          <span className={`font-medium truncate max-w-[180px] ${isLive ? 'text-emerald-300' : 'text-white'}`}>
                            {row.home_team_name} <span className="text-navy-500">vs</span> {row.away_team_name}
                          </span>
                          {row.group_label && (
                            <span className="text-[10px] text-navy-600 shrink-0">{row.group_label}</span>
                          )}
                          {row.is_stale && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1">
                              <AlertTriangle className="w-2 h-2" /> Bayat
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-navy-500">
                        {row.match_date ? new Date(row.match_date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : '–'}
                      </td>
                      <td className="px-3 py-2.5">
                        <DbStatusBadge status={row.fixture_db_status} />
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <div className="flex gap-1 flex-wrap">
                          <DataFlag ok={row.has_lineups} label="Kadro" />
                          <DataFlag ok={row.has_events}  label="Olay Akışı" />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <DataFlag ok={row.has_live_state} label="Canlı Durum" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {expanded === row.api_football_fixture_id
                          ? <ChevronUp className="w-3.5 h-3.5 text-navy-500 ml-auto" />
                          : <ChevronDown className="w-3.5 h-3.5 text-navy-600 ml-auto" />
                        }
                      </td>
                    </tr>
                    {expanded === row.api_football_fixture_id && (
                      <tr className="bg-navy-900/30">
                        <td colSpan={6} className="px-4 pb-4 pt-2">
                          <FixtureDetail row={row} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FixtureDetail({ row }: { row: FixtureStatus }) {
  const liveStatuses = ['1H', '2H', 'ET', 'P', 'BT', 'LIVE', 'HT'];
  const isLive = liveStatuses.includes(row.fixture_db_status);
  const notStarted = ['NS', 'not_started'].includes(row.fixture_db_status);

  return (
    <div className="bg-navy-900 border border-navy-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white">
          {row.home_team_name} vs {row.away_team_name}
        </span>
        <span className="text-[10px] text-navy-600 font-mono">
          API ID: {row.api_football_fixture_id}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
        <div>
          <p className="text-navy-500 mb-0.5">Maç Tarihi</p>
          <p className="text-navy-300">{fmt(row.match_date)}</p>
        </div>
        <div>
          <p className="text-navy-500 mb-0.5">Aşama / Grup</p>
          <p className="text-navy-300">{row.stage_code ?? '–'} {row.group_label ? `· ${row.group_label}` : ''}</p>
        </div>
        <div>
          <p className="text-navy-500 mb-0.5">Son Senkronizasyon</p>
          <p className="text-navy-300">{fmt(row.last_sync_at)}</p>
        </div>
        <div>
          <p className="text-navy-500 mb-0.5">DB Durumu</p>
          <DbStatusBadge status={row.fixture_db_status} />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <DataFlag ok={row.has_lineups}    label="Kadro Verisi" />
        <DataFlag ok={row.has_events}     label="Olay Akışı" />
        <DataFlag ok={row.has_live_state} label="Canlı Durum" />
      </div>

      {notStarted && (
        <div className="bg-navy-800/50 border border-navy-700 rounded-lg px-3 py-2 text-[11px] text-navy-500 flex items-center gap-1.5">
          <Clock className="w-3 h-3 shrink-0" />
          Maç Başlamadı — Veri Bekleniyor
        </div>
      )}
      {isLive && !row.has_live_state && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Canlı maç ama canlı durum satırı yok — motor henüz işlemedi
        </div>
      )}
      {row.is_stale && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2 text-[11px] text-red-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Bayat Veri Uyarısı — Son senkronizasyon çok eski
        </div>
      )}
    </div>
  );
}

// ─── Engine runs tab ──────────────────────────────────────────────────────────

function EngineRunsTab() {
  const [rows, setRows]       = useState<EngineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.rpc('wc2026_get_live_engine_runs', { p_limit: 30 });
      if (err) throw err;
      setRows((data ?? []) as EngineRun[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <div className="flex items-center justify-between">
        <span className="text-xs text-navy-500">{rows.length} kayıt (son 30)</span>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-800 hover:bg-navy-700 text-navy-300 rounded-lg text-xs transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {loading ? (
        <Skeleton rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Motor çalışma kaydı yok"
          desc="model_lab.live_engine_runs tablosu boş. Motor henüz hiç çalışmamış."
        />
      ) : (
        <div className="bg-navy-950 border border-navy-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-navy-800 bg-navy-900/60">
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium">Başlangıç</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium w-28">Durum</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden sm:table-cell w-24">İşlenen</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden sm:table-cell w-20">Hata</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden md:table-cell w-24">Süre</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-navy-800/50 hover:bg-navy-900/30 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-navy-300">{fmt(r.started_at)}</td>
                  <td className="px-3 py-2.5"><RunStatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5 hidden sm:table-cell font-mono text-white">{r.fixtures_processed}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <span className={r.fixtures_errored > 0 ? 'text-red-400 font-mono' : 'text-navy-600 font-mono'}>
                      {r.fixtures_errored}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-navy-400 font-mono">{fmtMs(r.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sync runs tab ────────────────────────────────────────────────────────────

function SyncRunsTab() {
  const [rows, setRows]       = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.rpc('wc2026_get_result_sync_runs', { p_limit: 30 });
      if (err) throw err;
      setRows((data ?? []) as SyncRun[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      <div className="flex items-center justify-between">
        <span className="text-xs text-navy-500">{rows.length} kayıt (son 30)</span>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-800 hover:bg-navy-700 text-navy-300 rounded-lg text-xs transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {loading ? (
        <Skeleton rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Senkronizasyon kaydı yok"
          desc="result_sync_runs tablosu boş. Senkronizasyon henüz hiç çalışmamış."
        />
      ) : (
        <div className="bg-navy-950 border border-navy-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-navy-800 bg-navy-900/60">
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium">Başlangıç</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium w-28">Durum</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden sm:table-cell w-24">Güncellenen</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden sm:table-cell w-20">Olay</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden md:table-cell w-20">Kadro</th>
                <th className="px-3 py-2.5 text-left text-navy-500 font-medium hidden lg:table-cell w-32">Bitiş</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-navy-800/50 hover:bg-navy-900/30 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-navy-300">{fmt(r.started_at)}</td>
                  <td className="px-3 py-2.5"><RunStatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5 hidden sm:table-cell font-mono text-white">{r.matches_updated}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell font-mono text-navy-400">{r.events_processed}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell font-mono text-navy-400">{r.lineups_processed}</td>
                  <td className="px-3 py-2.5 hidden lg:table-cell font-mono text-navy-600">{fmt(r.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function WcLiveEnginePage() {
  const [tab, setTab]         = useState<TabId>('overview');
  const [status, setStatus]   = useState<EngineStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError]     = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true); setStatusError(null);
    try {
      const { data, error: err } = await supabase.rpc('wc2026_get_live_engine_status');
      if (err) throw err;
      const rows = data as EngineStatus[] | null;
      setStatus(rows && rows.length > 0 ? rows[0] : null);
    } catch (e: unknown) {
      setStatusError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const isEngineActive = !!status?.last_engine_run_at;
  const isSyncActive   = !!status?.last_sync_run_at;
  const anyActive      = isEngineActive || isSyncActive;

  return (
    <div className="min-h-screen bg-navy-950 text-readable p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Radio className="w-4 h-4 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold text-white">Canlı Maç Motoru</h1>
              <div className="flex items-center gap-1.5">
                {anyActive
                  ? <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[10px] text-emerald-400 font-medium">Aktif</span></>
                  : <><span className="w-2 h-2 rounded-full bg-navy-600" /><span className="text-[10px] text-navy-500">Pasif</span></>
                }
              </div>
            </div>
            <p className="text-xs text-navy-500">WC2026 canlı maç motoru hazırlık ve tanı panosu</p>
          </div>
          <button
            onClick={loadStatus}
            disabled={loadingStatus}
            className="flex items-center gap-2 px-4 py-2 bg-navy-800 hover:bg-navy-700 text-navy-300 rounded-xl text-sm transition-all disabled:opacity-50 self-start"
          >
            <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-3 flex-wrap mb-5 px-4 py-2.5 bg-navy-900 border border-navy-800 rounded-xl text-[11px]">
          <StatusDot
            ok={isEngineActive && (staleMins(status?.last_engine_run_at ?? null) ?? 999) < 10}
            warn={isEngineActive && (staleMins(status?.last_engine_run_at ?? null) ?? 999) >= 10}
            label={`Motor: ${isEngineActive ? status?.last_engine_status : 'Veri Yok'}`}
          />
          <span className="text-navy-700">|</span>
          <StatusDot
            ok={isSyncActive && (staleMins(status?.last_sync_run_at ?? null) ?? 999) < 20}
            warn={isSyncActive && (staleMins(status?.last_sync_run_at ?? null) ?? 999) >= 20}
            label={`Senkronizasyon: ${isSyncActive ? status?.last_sync_status : 'Veri Yok'}`}
          />
          <span className="text-navy-700">|</span>
          {(status?.stale_count ?? 0) > 0 ? (
            <StatusDot ok={false} warn label={`Bayat Uyarı: ${status!.stale_count}`} />
          ) : (
            <StatusDot ok label="Bayat Veri Yok" />
          )}
          {!anyActive && !loadingStatus && (
            <>
              <span className="text-navy-700">|</span>
              <span className="flex items-center gap-1 text-navy-500">
                <HelpCircle className="w-3 h-3" /> Maç Başlamadı — Veri Bekleniyor
              </span>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-navy-800 overflow-x-auto">
          {([
            { id: 'overview'    as TabId, label: 'Canlı Veri Durumu', icon: Activity },
            { id: 'fixtures'    as TabId, label: 'Fikstür Durumu',    icon: Calendar },
            { id: 'engine-runs' as TabId, label: 'Motor Geçmişi',     icon: Zap },
            { id: 'sync-runs'   as TabId, label: 'Senkronizasyon Log', icon: Radio },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px whitespace-nowrap ${
                tab === id
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-navy-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview'    && (
          <OverviewTab
            status={status}
            loading={loadingStatus}
            error={statusError}
            onRefresh={loadStatus}
          />
        )}
        {tab === 'fixtures'    && <FixturesTab />}
        {tab === 'engine-runs' && <EngineRunsTab />}
        {tab === 'sync-runs'   && <SyncRunsTab />}
      </div>
    </div>
  );
}
