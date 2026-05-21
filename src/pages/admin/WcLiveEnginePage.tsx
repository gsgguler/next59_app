import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, AlertTriangle, CheckCircle2, Activity, Database,
  Clock, Wifi, WifiOff, Play, ChevronDown,
  AlertCircle, Info, Zap, Radio, Calendar,
  BarChart2, Shield, HelpCircle, Search, MoreVertical,
  RotateCcw, Eye, Trash2, Download, X,
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

interface ActionableItem {
  id:          string;
  title:       string;
  description: string;
  severity:    'critical' | 'warning' | 'info';
  actionLabel: string;
  action:      string;
  category:    string;
}

interface ActionMenuItem {
  label:    string;
  icon:     React.ElementType;
  onClick:  () => void;
  variant?: 'default' | 'danger';
}

type TabId = 'overview' | 'fixtures' | 'engine-runs' | 'sync-runs';
type FixtureFilter = 'tumu' | 'live' | 'no_lineup' | 'no_events' | 'stale';

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

// ─── ActionMenu ───────────────────────────────────────────────────────────────

function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="flex items-center justify-center w-7 h-7 rounded-lg bg-navy-800 hover:bg-navy-700 text-navy-400 hover:text-white transition-colors"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-navy-800 border border-navy-700 rounded-xl shadow-2xl shadow-black/40 py-1 w-44 min-w-max">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); item.onClick(); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left ${
                  item.variant === 'danger'
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-navy-300 hover:bg-navy-700 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ActiveMatchSelector ──────────────────────────────────────────────────────

function ActiveMatchSelector({
  fixtures,
  selected,
  onChange,
}: {
  fixtures: FixtureStatus[];
  selected: number | null;
  onChange: (id: number | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const liveStatuses = ['1H', '2H', 'ET', 'P', 'BT', 'LIVE', 'HT'];

  const filtered = fixtures.filter(f => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      f.home_team_name.toLowerCase().includes(q) ||
      f.away_team_name.toLowerCase().includes(q)
    );
  });

  const selectedFixture = fixtures.find(f => f.api_football_fixture_id === selected);

  function handleSelect(id: number | null) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0 max-w-xs">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-navy-900 border border-navy-700 rounded-xl text-xs text-left hover:border-navy-600 transition-colors"
      >
        <Search className="w-3.5 h-3.5 text-navy-500 shrink-0" />
        <span className={`flex-1 truncate ${selectedFixture ? 'text-white' : 'text-navy-500'}`}>
          {selectedFixture
            ? `${selectedFixture.home_team_name} vs ${selectedFixture.away_team_name}`
            : 'Maç seç (takım adı ile ara)…'
          }
        </span>
        {selectedFixture && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); handleSelect(null); }}
            className="text-navy-500 hover:text-white transition-colors"
          >
            <X className="w-3 h-3" />
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-navy-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-50 bg-navy-800 border border-navy-700 rounded-xl shadow-2xl shadow-black/40 w-80 overflow-hidden">
          <div className="p-2 border-b border-navy-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-500" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Takım adı ara…"
                className="w-full bg-navy-900 border border-navy-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-navy-600 focus:outline-none focus:border-navy-600"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <button
              onClick={() => handleSelect(null)}
              className="w-full px-3 py-2 text-xs text-navy-500 hover:bg-navy-700 text-left transition-colors"
            >
              Tüm maçları göster
            </button>
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-navy-600 text-center">Sonuç yok</p>
            ) : (
              filtered.map(f => {
                const isLive = liveStatuses.includes(f.fixture_db_status);
                return (
                  <button
                    key={f.api_football_fixture_id}
                    onClick={() => handleSelect(f.api_football_fixture_id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                      selected === f.api_football_fixture_id
                        ? 'bg-navy-700 text-white'
                        : 'text-navy-300 hover:bg-navy-700 hover:text-white'
                    }`}
                  >
                    {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />}
                    <span className="flex-1 truncate">
                      {f.home_team_name} vs {f.away_team_name}
                    </span>
                    {f.is_stale && (
                      <span className="text-red-400 shrink-0">
                        <AlertTriangle className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ActionableItemsPanel ─────────────────────────────────────────────────────

function ActionableItemsPanel({ items }: { items: ActionableItem[] }) {
  if (items.length === 0) return null;

  const borderColor = (s: ActionableItem['severity']) =>
    s === 'critical' ? 'border-l-red-500' : s === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500';
  const badgeColor = (s: ActionableItem['severity']) =>
    s === 'critical' ? 'bg-red-500/10 text-red-400' : s === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400';
  const Icon = (s: ActionableItem['severity']) =>
    s === 'critical' ? AlertCircle : s === 'warning' ? AlertTriangle : Info;

  return (
    <div className="bg-navy-900/60 border border-navy-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-semibold text-white">Aksiyon Gerektiren Durumlar</span>
        <span className="ml-auto bg-amber-500/15 text-amber-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      {items.map(item => {
        const ItemIcon = Icon(item.severity);
        return (
          <div
            key={item.id}
            className={`bg-navy-900 border border-navy-800 border-l-4 ${borderColor(item.severity)} rounded-lg px-3 py-2.5 flex items-start gap-3`}
          >
            <ItemIcon className={`w-4 h-4 mt-0.5 shrink-0 ${badgeColor(item.severity).split(' ')[1]}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white mb-0.5">{item.title}</p>
              <p className="text-[11px] text-navy-400">{item.description}</p>
            </div>
            <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeColor(item.severity)}`}>
              {item.actionLabel}
        </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared UI components ─────────────────────────────────────────────────────

function StatusDot({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const color = ok ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-navy-700';
  const textColor = ok ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-navy-500';
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
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

  // Derive actionable items from status
  const actionable: ActionableItem[] = [];
  if (!loading && status) {
    if (engineWarning) {
      actionable.push({
        id: 'engine-stale',
        title: 'Canlı motor bayat veri',
        description: `Motor ${engineMinsSince} dakikadır çalışmadı. Canlı maçlar için 10 dk eşiği aşıldı.`,
        severity: 'warning',
        actionLabel: 'Cron Kontrol Et',
        action: 'check-cron',
        category: 'motor',
      });
    }
    if (syncWarning) {
      actionable.push({
        id: 'sync-stale',
        title: 'Senkronizasyon bayat',
        description: `Senkronizasyon ${syncMinsSince} dakikadır çalışmadı. 20 dk eşiği aşıldı.`,
        severity: 'warning',
        actionLabel: 'Edge Fn Kontrol Et',
        action: 'check-sync',
        category: 'sync',
      });
    }
    if ((status.stale_count ?? 0) > 0) {
      actionable.push({
        id: 'stale-matches',
        title: `${status.stale_count} bayat fikstür uyarısı`,
        description: 'Bu fikstürlerin canlı durumu güncellenmiyor. Fikstür sekmesine geçerek detayları inceleyin.',
        severity: 'critical',
        actionLabel: 'Fikstüre Git',
        action: 'go-fixtures',
        category: 'veri',
      });
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}
      {!loading && noLiveData && <WaitingBanner />}
      {actionable.length > 0 && <ActionableItemsPanel items={actionable} />}

      {/* Engine health cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Canlı Maç Motoru',
            value: status?.last_engine_status ?? '–',
            sub:   status?.last_engine_run_at ? `${engineMinsSince} dk önce` : 'Hiç çalışmadı',
            icon:  Zap,
            ok:    engineHealthy,
            warn:  engineWarning,
          },
          {
            label: 'Senkronizasyon',
            value: status?.last_sync_status ?? '–',
            sub:   status?.last_sync_run_at ? `${syncMinsSince} dk önce` : 'Hiç çalışmadı',
            icon:  Radio,
            ok:    syncHealthy,
            warn:  syncWarning,
          },
          {
            label: 'Bayat Maç Uyarısı',
            value: String(status?.stale_count ?? 0),
            sub:   status?.stale_count ? 'Çözümsüz uyarı' : 'Temiz',
            icon:  AlertTriangle,
            ok:    (status?.stale_count ?? 0) === 0,
            warn:  (status?.stale_count ?? 1) > 0,
          },
          {
            label: 'Canlı Durum Satırı',
            value: String(status?.live_match_state_count ?? 0),
            sub:   'live_match_states',
            icon:  Activity,
            ok:    (status?.live_match_state_count ?? 0) > 0,
            warn:  false,
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
          <EngineDetailRow label="Son Çalışma"     value={fmt(status?.last_sync_run_at ?? null)} />
          <EngineDetailRow label="Son Durum"       value={status?.last_sync_status ?? '–'} />
          <EngineDetailRow label="Güncellenen Maç" value={String(status?.last_sync_matches_updated ?? 0)} />
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
            { cron: 'Her 5 dk',  job: 'result-sync-live-5min',     desc: 'Canlı maç senkronizasyonu' },
            { cron: 'Her 5 dk',  job: 'detect-stale-live-5min',    desc: 'Bayat maç tespiti' },
            { cron: 'Her 15 dk', job: 'af-live-result-sync-15m',   desc: 'Son maç sonucu senkronizasyonu' },
            { cron: 'Her 30 dk', job: 'af-pre-kickoff-lineups-30m', desc: 'Yaklaşan maç kadroları' },
            { cron: 'Her 6 sa',  job: 'af-upcoming-fixtures-6h',   desc: 'Gelecek fikstür güncelleme' },
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

function buildFixtureActionItems(rows: FixtureStatus[]): ActionableItem[] {
  const items: ActionableItem[] = [];
  const liveStatuses = ['1H', '2H', 'ET', 'P', 'BT', 'LIVE', 'HT'];

  const stale = rows.filter(r => r.is_stale);
  if (stale.length > 0) {
    items.push({
      id: 'stale-fixtures',
      title: `${stale.length} fikstür bayat veri uyarısı`,
      description: 'Bu fikstürlerin canlı senkronizasyonu gecikiyor. Senkronizasyon cron\'unu kontrol edin.',
      severity: 'critical',
      actionLabel: 'Sync Kontrol Et',
      action: 'check-sync',
      category: 'fikstür',
    });
  }

  const liveNoState = rows.filter(r => liveStatuses.includes(r.fixture_db_status) && !r.has_live_state);
  if (liveNoState.length > 0) {
    items.push({
      id: 'live-no-state',
      title: `${liveNoState.length} canlı maçta canlı durum kaydı yok`,
      description: 'Motor bu maçları henüz işlemedi. 1-2 dk içinde tamamlanmalıdır.',
      severity: 'warning',
      actionLabel: 'Motor Geçmişi',
      action: 'go-engine-runs',
      category: 'motor',
    });
  }

  const liveNoLineup = rows.filter(r => liveStatuses.includes(r.fixture_db_status) && !r.has_lineups);
  if (liveNoLineup.length > 0) {
    items.push({
      id: 'live-no-lineup',
      title: `${liveNoLineup.length} canlı maçta kadro verisi eksik`,
      description: 'Kadro verisi maç başlamadan 60-75 dk içinde gelmelidir. Geç kaldıysa kadro çekimini tetikleyin.',
      severity: 'warning',
      actionLabel: 'Kadro Tetikle',
      action: 'trigger-lineup',
      category: 'kadro',
    });
  }

  return items;
}

function buildFixtureMenuItems(row: FixtureStatus): ActionMenuItem[] {
  const liveStatuses = ['1H', '2H', 'ET', 'P', 'BT', 'LIVE', 'HT'];
  const isLive = liveStatuses.includes(row.fixture_db_status);
  const items: ActionMenuItem[] = [];

  items.push({
    label: 'Detayı Görüntüle',
    icon: Eye,
    onClick: () => {},
  });

  if (row.is_stale) {
    items.push({
      label: 'Sync Tetikle',
      icon: RotateCcw,
      onClick: () => {},
    });
  }

  if (!row.has_lineups) {
    items.push({
      label: 'Kadro Çek',
      icon: Download,
      onClick: () => {},
    });
  }

  if (!row.has_events && isLive) {
    items.push({
      label: 'Olay Akışı Çek',
      icon: Zap,
      onClick: () => {},
    });
  }

  return items;
}

function FixturesTab() {
  const [rows, setRows]         = useState<FixtureStatus[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<FixtureFilter>('tumu');
  const [selectedId, setSelectedId] = useState<number | null>(null);

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

  const bySearch = selectedId !== null
    ? rows.filter(r => r.api_football_fixture_id === selectedId)
    : rows;

  const filtered = bySearch.filter(r => {
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

  const actionable = buildFixtureActionItems(rows);

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} />}
      {!loading && actionable.length > 0 && <ActionableItemsPanel items={actionable} />}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <ActiveMatchSelector
          fixtures={rows}
          selected={selectedId}
          onChange={id => { setSelectedId(id); setFilter('tumu'); }}
        />

        {([
          { id: 'tumu'      as FixtureFilter, label: `Tümü (${rows.length})`,               color: '' },
          { id: 'live'      as FixtureFilter, label: `Canlı (${liveCount})`,                color: liveCount > 0 ? 'text-emerald-400' : '' },
          { id: 'no_lineup' as FixtureFilter, label: `Kadro Yok (${noLineupCount})`,        color: noLineupCount > 0 ? 'text-amber-400' : '' },
          { id: 'no_events' as FixtureFilter, label: `Olay Yok (${noEventsCount})`,         color: noEventsCount > 0 ? 'text-amber-400' : '' },
          { id: 'stale'     as FixtureFilter, label: `Bayat (${staleCount})`,               color: staleCount > 0 ? 'text-red-400' : '' },
        ] as const).map(({ id, label, color }) => (
          <button
            key={id}
            onClick={() => { setFilter(id); setSelectedId(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === id && selectedId === null
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
          desc="wc2026_fixtures tablosu boş veya arama kriterine uyan fikstür yok."
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
                <th className="px-3 py-2.5 w-12 text-right text-navy-500 font-medium pr-4">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const isLive = liveStatuses.includes(row.fixture_db_status);
                const menuItems = buildFixtureMenuItems(row);
                return (
                  <tr
                    key={row.api_football_fixture_id}
                    className={`border-b border-navy-800/50 transition-colors ${
                      isLive ? 'bg-emerald-950/20' : 'hover:bg-navy-900/40'
                    } ${row.is_stale ? 'border-l-2 border-l-red-500/50' : ''}`}
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
                        {isLive && !row.has_live_state && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1">
                            <AlertCircle className="w-2 h-2" /> Durum Yok
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
                    <td className="px-3 py-2.5 text-right pr-4">
                      {menuItems.length > 0 && <ActionMenu items={menuItems} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

  // Actionable: repeated failures
  const failedRuns = rows.filter(r => r.status === 'failed' || r.status === 'error');
  const actionable: ActionableItem[] = failedRuns.length >= 3 ? [{
    id: 'repeated-engine-failures',
    title: `Son ${failedRuns.length} motor çalışması başarısız`,
    description: 'Sürekli hata motor konfigürasyonunu veya edge function hatasını işaret edebilir.',
    severity: 'critical',
    actionLabel: 'Edge Fn İncele',
    action: 'inspect-edge',
    category: 'motor',
  }] : [];

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {!loading && actionable.length > 0 && <ActionableItemsPanel items={actionable} />}
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
                <tr
                  key={r.id}
                  className={`border-b border-navy-800/50 transition-colors hover:bg-navy-900/30 ${
                    (r.status === 'failed' || r.status === 'error') ? 'border-l-2 border-l-red-500/40' : ''
                  }`}
                >
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

  const failedRuns = rows.filter(r => r.status === 'failed' || r.status === 'error');
  const actionable: ActionableItem[] = failedRuns.length >= 3 ? [{
    id: 'repeated-sync-failures',
    title: `Son ${failedRuns.length} senkronizasyon başarısız`,
    description: 'Tekrarlayan senkronizasyon hatası veri akışını kesintiye uğratıyor.',
    severity: 'critical',
    actionLabel: 'Sync Fn İncele',
    action: 'inspect-sync',
    category: 'sync',
  }] : [];

  return (
    <div className="space-y-3">
      {error && <ErrorBanner message={error} />}
      {!loading && actionable.length > 0 && <ActionableItemsPanel items={actionable} />}
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
                <tr
                  key={r.id}
                  className={`border-b border-navy-800/50 transition-colors hover:bg-navy-900/30 ${
                    (r.status === 'failed' || r.status === 'error') ? 'border-l-2 border-l-red-500/40' : ''
                  }`}
                >
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
