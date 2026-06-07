import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle,
  Shield, Globe, Filter, ChevronDown, ChevronUp, Database,
  AlertCircle, Activity, Search, Zap, Flag,
  Info, Lock, RotateCcw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamPoolRow {
  api_football_team_id:   number;
  team_name:              string;
  fifa_code:              string | null;
  iso2:                   string | null;
  confederation:          string | null;
  squad_status:           string;
  squad_player_count:     number;
  squad_last_fetched_at:  string | null;
  squad_valid_until:      string | null;
  squad_source:           string | null;
  lineup_status:          string;
  lineup_last_fetched_at: string | null;
  perf_snapshot_status:   string;
  perf_snapshot_date:     string | null;
  overall_status:         string;
  stale_warning:          boolean;
  missing_warning:        boolean;
  manual_review:          boolean;
  probable_squad_count:   number;
  player_pool_count:      number;
  team_squads_count:      number;
  last_fetch_status:      string | null;
  last_fetch_at:          string | null;
  notes:                  string | null;
}

interface FetchLogRow {
  id:                      string;
  provider:                string;
  endpoint:                string;
  data_type:               string;
  fetch_status:            string;
  rows_received:           number;
  rows_inserted:           number;
  rows_skipped:            number;
  error_detail:            string | null;
  api_football_team_id:    number | null;
  api_football_fixture_id: number | null;
  triggered_by:            string;
  fetched_at:              string;
  duration_ms:             number | null;
}

interface PlayerPoolRow {
  id:                  string;
  api_football_team_id: number | null;
  player_name:         string;
  position:            string | null;
  shirt_number:        number | null;
  nationality:         string | null;
  club_team_name:      string | null;
  club_league:         string | null;
  availability_status: string;
  data_status:         string;
  mapping_confidence:  string;
  fetched_at:          string;
}

type TabId = 'teams' | 'players' | 'logs';
type ConfFilter = 'tumu' | 'UEFA' | 'CONMEBOL' | 'CAF' | 'AFC' | 'CONCACAF' | 'OFC';
type StatusFilter = 'tumu' | 'pending' | 'partial' | 'complete' | 'stale' | 'error' | 'manual_review';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { tr: string; color: string }> = {
  pending:       { tr: 'Bekliyor',         color: 'bg-navy-700 text-navy-300' },
  partial:       { tr: 'Kısmi',            color: 'bg-amber-500/15 text-amber-400 border border-amber-500/25' },
  complete:      { tr: 'Tam',              color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' },
  stale:         { tr: 'Bayat',            color: 'bg-orange-500/15 text-orange-400 border border-orange-500/25' },
  error:         { tr: 'Hata',             color: 'bg-red-500/15 text-red-400 border border-red-500/25' },
  probable:      { tr: 'Muhtemel',         color: 'bg-blue-500/15 text-blue-400 border border-blue-500/25' },
  confirmed:     { tr: 'Onaylı',           color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' },
  unavailable:   { tr: 'Mevcut Değil',     color: 'bg-navy-700 text-navy-400' },
  manual_review: { tr: 'Manuel Kontrol',   color: 'bg-amber-500/15 text-amber-400 border border-amber-500/25' },
  missing_mapping: { tr: 'Eşleşme Yok',   color: 'bg-red-500/15 text-red-400 border border-red-500/25' },
  success:       { tr: 'Başarılı',         color: 'bg-emerald-500/15 text-emerald-400' },
  rate_limited:  { tr: 'Limit Aşıldı',     color: 'bg-orange-500/15 text-orange-400' },
  available:     { tr: 'Hazır',            color: 'bg-emerald-500/15 text-emerald-400' },
  injured:       { tr: 'Sakatlı',          color: 'bg-red-500/15 text-red-400' },
  suspended:     { tr: 'Cezalı',           color: 'bg-amber-500/15 text-amber-400' },
  unknown:       { tr: 'Bilinmiyor',       color: 'bg-navy-700 text-navy-400' },
  none:          { tr: 'Yok',              color: 'bg-navy-700 text-navy-400' },
  low:           { tr: 'Düşük',            color: 'bg-red-500/15 text-red-400' },
  medium:        { tr: 'Orta',             color: 'bg-amber-500/15 text-amber-400' },
  high:          { tr: 'Yüksek',           color: 'bg-emerald-500/15 text-emerald-400' },
};

// ─── Shared primitive components ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-navy-600 text-[11px]">–</span>;
  const cfg = STATUS_META[status] ?? { tr: status, color: 'bg-navy-700 text-navy-400' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
      {cfg.tr}
    </span>
  );
}

function DataReadinessIcon({
  status,
  count,
}: {
  status: string;
  count?: number;
}) {
  const isReady = status === 'complete' || status === 'confirmed' || status === 'available';
  const isPartial = status === 'partial' || status === 'probable';
  const _isMissing = status === 'pending' || status === 'none' || !status;

  if (isReady) return (
    <div className="flex flex-col items-center gap-0.5">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
      {count != null && count > 0 && <span className="text-[10px] text-emerald-400 font-mono">{count}</span>}
    </div>
  );
  if (isPartial) return (
    <div className="flex flex-col items-center gap-0.5">
      <Clock className="w-3.5 h-3.5 text-amber-400" />
      {count != null && count > 0 && <span className="text-[10px] text-amber-400 font-mono">{count}</span>}
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-0.5">
      <XCircle className="w-3.5 h-3.5 text-navy-600" />
      {count != null && count > 0 && <span className="text-[10px] text-navy-500 font-mono">{count}</span>}
    </div>
  );
}

function fmt(ts: string | null): string {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function SmallStat({ label, value, accent }: {
  label: string;
  value: number | string;
  accent?: 'green' | 'amber' | 'orange' | 'red' | 'blue';
}) {
  const color = accent === 'green' ? 'text-emerald-400'
    : accent === 'amber' ? 'text-amber-400'
    : accent === 'orange' ? 'text-orange-400'
    : accent === 'red' ? 'text-red-400'
    : accent === 'blue' ? 'text-blue-400'
    : 'text-white';
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: 'warn' | 'ok' | 'error' }) {
  const valColor = highlight === 'warn' ? 'text-amber-400'
    : highlight === 'ok' ? 'text-emerald-400'
    : highlight === 'error' ? 'text-red-400'
    : 'text-navy-300';
  return (
    <div className="flex items-start justify-between text-[11px] mb-1.5">
      <span className="text-navy-500 shrink-0 mr-2">{label}</span>
      <span className={`font-mono text-right ${valColor}`}>{value}</span>
    </div>
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

function DisabledAction({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="relative group inline-flex">
      <button
        disabled
        className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-navy-800/50 border border-navy-700/50 text-navy-600 cursor-not-allowed"
      >
        <Lock className="w-3 h-3" />
        {label}
      </button>
      <div className="absolute bottom-full left-0 mb-1 w-52 bg-navy-800 border border-navy-700 rounded-lg px-2.5 py-2 text-[10px] text-navy-300 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
        {reason}
      </div>
    </div>
  );
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="p-5 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-navy-800/40 rounded animate-pulse" />
      ))}
    </div>
  );
}

// ─── Provider limit notice ────────────────────────────────────────────────────

function ProviderLimitNotice() {
  return (
    <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-xs text-amber-300/80 space-y-1">
        <p className="font-semibold text-amber-300">Veri Sağlayıcı Limitleri</p>
        <p>
          API-Football kadro çekme işlevi <strong>import-wc2026</strong> edge function üzerinden yapılır.
          Kadro çekme butonu bu edge function'ı tetikler — API anahtarı yapılandırılmamışsa veya
          günlük limit dolmuşsa istek <span className="font-mono">rate_limited</span> döner.
          Mevcut veri yokken "Onaylı" veya "Hazır" gösterilmez.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WcSquadOpsPage() {
  const [tab, setTab] = useState<TabId>('teams');

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-7xl mx-auto">

        <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl px-5 py-3 mb-6 flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-300">
            <strong>Dünya Kupası 2026 — Kadro İstihbarat Katmanı.</strong>{' '}
            Tüm veriler muhtemel/aday statüsündedir. Resmi kadro açıklanana kadar hiçbir veri kesinleşmez.
            Buton aktif olmasa bile bu bir hata değil — veri sağlayıcı bağlantısı gerektirir.
          </p>
        </div>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Globe className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">DK 2026 Kadro Operasyonları</h1>
            <p className="text-sm text-readable-muted mt-1">
              Takım Havuzu · Oyuncu Havuzu · Aday Kadro · Onaylı Kadro · Oyuncu Eşleşmesi · Performans Verisi
            </p>
          </div>
        </div>

        <ProviderLimitNotice />

        <div className="flex items-center gap-1 mb-6 border-b border-navy-800">
          {([
            { id: 'teams'   as TabId, label: 'Millî Takımlar',   icon: Globe },
            { id: 'players' as TabId, label: 'Oyuncu Havuzu',    icon: Users },
            { id: 'logs'    as TabId, label: 'Veri Kaynağı Log', icon: Database },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                tab === id
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-navy-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'teams'   && <TeamsTab />}
        {tab === 'players' && <PlayersTab />}
        {tab === 'logs'    && <FetchLogsTab />}
      </div>
    </div>
  );
}

// ─── Teams Tab ────────────────────────────────────────────────────────────────

function TeamsTab() {
  const [rows, setRows]             = useState<TeamPoolRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [confFilter, setConfFilter] = useState<ConfFilter>('tumu');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('tumu');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState<number | null>(null);
  const [actionMsg, setActionMsg]   = useState<{ teamId: number; msg: string; ok: boolean } | null>(null);
  const [fetchingTeam, setFetchingTeam] = useState<number | null>(null);
  const [markingTeam, setMarkingTeam]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('wc2026_get_team_pool_overview_v2');
    if (err) { setError(err.message); setLoading(false); return; }
    setRows((data as TeamPoolRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fetch squads via edge function (requires API-Football key configured)
  const fetchSquad = async (teamId: number, teamName: string) => {
    setFetchingTeam(teamId);
    setActionMsg(null);
    try {
      const { data, error: err } = await supabase.functions.invoke('import-wc2026', {
        body: { mode: 'squad', team_id: teamId },
      });
      if (err) {
        setActionMsg({ teamId, msg: `Hata: ${err.message}`, ok: false });
      } else {
        const r = data as { status?: string; rows_inserted?: number; error?: string } | null;
        if (r?.error) {
          setActionMsg({ teamId, msg: `Hata: ${r.error}`, ok: false });
        } else {
          setActionMsg({ teamId, msg: `${teamName}: ${r?.rows_inserted ?? 0} oyuncu eklendi`, ok: true });
          await load();
        }
      }
    } catch (e) {
      setActionMsg({ teamId, msg: `Hata: ${e instanceof Error ? e.message : String(e)}`, ok: false });
    }
    setFetchingTeam(null);
  };

  const markManualReview = async (teamId: number) => {
    setMarkingTeam(teamId);
    setActionMsg(null);
    const { data, error: err } = await supabase.rpc('wc2026_mark_manual_review', {
      p_api_team_id: teamId,
      p_reason: 'Admin UI üzerinden işaretlendi',
    });
    if (err) {
      setActionMsg({ teamId, msg: `Hata: ${err.message}`, ok: false });
    } else {
      const r = data as { success: boolean; team_name: string } | null;
      if (r?.success) {
        setActionMsg({ teamId, msg: `${r.team_name} manuel kontrol olarak işaretlendi`, ok: true });
        await load();
      }
    }
    setMarkingTeam(null);
  };

  const clearManualReview = async (teamId: number) => {
    setMarkingTeam(teamId);
    setActionMsg(null);
    const { data, error: err } = await supabase.rpc('wc2026_clear_manual_review', {
      p_api_team_id: teamId,
    });
    if (err) {
      setActionMsg({ teamId, msg: `Hata: ${err.message}`, ok: false });
    } else {
      const r = data as { success: boolean } | null;
      if (r?.success) {
        setActionMsg({ teamId, msg: 'Manuel kontrol kaldırıldı', ok: true });
        await load();
      }
    }
    setMarkingTeam(null);
  };

  const filtered = rows.filter(r => {
    if (confFilter !== 'tumu' && r.confederation !== confFilter) return false;
    if (statusFilter !== 'tumu' && r.overall_status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.team_name.toLowerCase().includes(q) && !(r.fifa_code ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const summary = {
    total:         rows.length,
    complete:      rows.filter(r => r.overall_status === 'complete').length,
    partial:       rows.filter(r => r.overall_status === 'partial').length,
    pending:       rows.filter(r => r.overall_status === 'pending').length,
    manual_review: rows.filter(r => r.manual_review).length,
    stale:         rows.filter(r => r.stale_warning).length,
    missing:       rows.filter(r => r.missing_warning).length,
    with_players:  rows.filter(r => r.player_pool_count > 0).length,
  };

  const CONF_OPTIONS: ConfFilter[] = ['tumu', 'UEFA', 'CONMEBOL', 'CAF', 'AFC', 'CONCACAF', 'OFC'];
  const STATUS_OPTIONS: StatusFilter[] = ['tumu', 'pending', 'partial', 'complete', 'stale', 'error', 'manual_review'];

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-6">
        <SmallStat label="Takım Havuzu"   value={`${summary.total}/48`} />
        <SmallStat label="Tam"            value={summary.complete}      accent="green" />
        <SmallStat label="Kısmi"          value={summary.partial}       accent="amber" />
        <SmallStat label="Bekliyor"       value={summary.pending} />
        <SmallStat label="Oyuncu Var"     value={summary.with_players}  accent={summary.with_players > 0 ? 'blue' : undefined} />
        <SmallStat label="Manuel Kontrol" value={summary.manual_review} accent={summary.manual_review > 0 ? 'amber' : undefined} />
        <SmallStat label="Bayat Uyarı"    value={summary.stale}         accent={summary.stale > 0 ? 'orange' : undefined} />
        <SmallStat label="Eksik Uyarı"    value={summary.missing}       accent={summary.missing > 0 ? 'red' : undefined} />
      </div>

      {/* Global action message */}
      {actionMsg && (
        <div className={`mb-4 text-xs rounded-lg px-3 py-2 font-mono flex items-center gap-2 ${
          actionMsg.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {actionMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {actionMsg.msg}
        </div>
      )}

      {/* Filters */}
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-navy-400" />
          <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Filtreler</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-[160px] bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5">
            <Search className="w-3 h-3 text-navy-500 shrink-0" />
            <input
              type="text"
              placeholder="Takım veya kod ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none placeholder-navy-600 w-full"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {CONF_OPTIONS.map(c => (
              <button key={c} onClick={() => setConfFilter(c)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  confFilter === c
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {c === 'tumu' ? 'Tüm Kıta' : c}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  statusFilter === s
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {s === 'tumu' ? 'Tüm Durum' : STATUS_META[s]?.tr ?? s}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {!loading && rows.length === 0 && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-10 text-center">
          <Globe className="w-10 h-10 text-navy-700 mx-auto mb-3" />
          <p className="text-sm text-readable-muted mb-2">Takım havuzu verisi bulunamadı.</p>
          <p className="text-xs text-navy-600">
            48 millî takım kaydı wc2026_team_pool tablosuna eklendiğinde burada görünecek.
          </p>
        </div>
      )}

      {(loading || filtered.length > 0) && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Takım Havuzu ({filtered.length} / {rows.length})
            </span>
            <span className="text-[10px] text-navy-600 flex items-center gap-1">
              <Info className="w-3 h-3" /> Satıra tıkla → detay + aksiyonlar
            </span>
          </div>

          {loading ? <LoadingSkeleton rows={8} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Millî Takım</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Genel</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Aday Kadro</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Oyuncu Havuzu</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell">Muhtemel 11</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell">Performans Verisi</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Son Güncelleme</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Uyarı</th>
                    <th className="text-right px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => {
                    const isExpanded = expanded === row.api_football_team_id;
                    return (
                      <>
                        <tr
                          key={row.api_football_team_id}
                          className={`border-b border-navy-800/40 transition-colors cursor-pointer ${
                            isExpanded ? 'bg-navy-800/30' : 'hover:bg-navy-800/20'
                          } ${row.manual_review ? 'border-l-2 border-l-amber-500/40' : ''}`}
                          onClick={() => setExpanded(isExpanded ? null : row.api_football_team_id)}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {row.iso2 && (
                                <span className={`fi fi-${row.iso2.toLowerCase()} w-5 h-3.5 rounded-sm shrink-0 overflow-hidden`} />
                              )}
                              <div>
                                <div className="text-white font-medium leading-tight flex items-center gap-1.5">
                                  {row.team_name}
                                  {row.manual_review && (
                                    <Flag className="w-3 h-3 text-amber-400 shrink-0" aria-label="Manuel Kontrol Gerekli" />
                                  )}
                                </div>
                                <div className="text-navy-500 text-[10px] mt-0.5">
                                  {row.fifa_code ?? '–'} · {row.confederation ?? '–'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <StatusBadge status={row.overall_status} />
                          </td>
                          <td className="px-3 py-3 text-center hidden md:table-cell">
                            <div className="flex flex-col items-center gap-0.5">
                              <StatusBadge status={row.squad_status} />
                              {row.squad_player_count > 0 && (
                                <span className="text-[10px] text-navy-500">{row.squad_player_count} kişi</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center hidden md:table-cell">
                            <DataReadinessIcon
                              status={row.player_pool_count > 0 ? 'complete' : 'pending'}
                              count={row.player_pool_count > 0 ? row.player_pool_count : undefined}
                            />
                          </td>
                          <td className="px-3 py-3 text-center hidden lg:table-cell">
                            <DataReadinessIcon status={row.lineup_status} />
                          </td>
                          <td className="px-3 py-3 text-center hidden lg:table-cell">
                            <DataReadinessIcon status={row.perf_snapshot_status} />
                          </td>
                          <td className="px-3 py-3 text-center hidden sm:table-cell">
                            <span className="text-[11px] text-navy-500 tabular-nums">
                              {row.last_fetch_at ? fmt(row.last_fetch_at) : fmt(row.squad_last_fetched_at)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {row.stale_warning
                              ? <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mx-auto" aria-label="Bayat veri" />
                              : row.missing_warning
                                ? <AlertCircle className="w-3.5 h-3.5 text-red-400 mx-auto" aria-label="Eksik veri" />
                                : <CheckCircle2 className="w-3.5 h-3.5 text-navy-700 mx-auto" />
                            }
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : row.api_football_team_id); }}
                              className="p-1 text-navy-500 hover:text-white transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${row.api_football_team_id}-detail`} className="border-b border-navy-800/40 bg-navy-900/30">
                            <td colSpan={9} className="px-5 py-4">
                              <TeamDetail
                                row={row}
                                isFetching={fetchingTeam === row.api_football_team_id}
                                isMarking={markingTeam === row.api_football_team_id}
                                onFetchSquad={() => fetchSquad(row.api_football_team_id, row.team_name)}
                                onMarkReview={() => markManualReview(row.api_football_team_id)}
                                onClearReview={() => clearManualReview(row.api_football_team_id)}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Team Detail Panel ────────────────────────────────────────────────────────

function TeamDetail({
  row,
  isFetching,
  isMarking,
  onFetchSquad,
  onMarkReview,
  onClearReview,
}: {
  row: TeamPoolRow;
  isFetching: boolean;
  isMarking: boolean;
  onFetchSquad: () => void;
  onMarkReview: () => void;
  onClearReview: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Data cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Takım Havuzu / Aday Kadro */}
        <div className="bg-navy-800/40 rounded-lg p-3">
          <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Aday Kadro</div>
          <DetailRow label="Durum"           value={STATUS_META[row.squad_status]?.tr ?? row.squad_status} />
          <DetailRow label="Kayıtlı Oyuncu"  value={row.squad_player_count.toString()}
            highlight={row.squad_player_count > 0 ? 'ok' : undefined} />
          <DetailRow label="Son Çekme"       value={fmt(row.squad_last_fetched_at)} />
          <DetailRow label="Geçerlilik Sonu" value={fmt(row.squad_valid_until)} />
          <DetailRow label="Aday Taslak"     value={row.probable_squad_count.toString()} />
          <DetailRow label="Veri Kaynağı"    value={row.squad_source ?? '–'} />
        </div>

        {/* Oyuncu Havuzu + Eşleşme */}
        <div className="bg-navy-800/40 rounded-lg p-3">
          <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Oyuncu Havuzu</div>
          <DetailRow label="Oyuncu Sayısı"
            value={row.player_pool_count > 0 ? `${row.player_pool_count} oyuncu` : 'Veri yok'}
            highlight={row.player_pool_count > 0 ? 'ok' : undefined} />
          <DetailRow label="Kadro Girişi"    value={row.team_squads_count > 0 ? `${row.team_squads_count} giriş` : 'Yok'} />
          <div className="mt-2 pt-2 border-t border-navy-700">
            <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-1.5">Oyuncu Eşleşmesi</div>
            {row.player_pool_count === 0
              ? <p className="text-[11px] text-navy-600 italic">Oyuncu havuzu boş — eşleşme yapılamaz</p>
              : <DetailRow label="Durum" value="Kadro çekildikten sonra kontrol edin" />
            }
          </div>
        </div>

        {/* Muhtemel 11 + Performans */}
        <div className="bg-navy-800/40 rounded-lg p-3">
          <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Muhtemel İlk 11</div>
          <DetailRow label="Durum"       value={STATUS_META[row.lineup_status]?.tr ?? row.lineup_status} />
          <DetailRow label="Son Çekme"   value={fmt(row.lineup_last_fetched_at)} />
          <div className="mt-2 pt-2 border-t border-navy-700">
            <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-1.5">Performans Verisi</div>
            <DetailRow label="Durum"          value={STATUS_META[row.perf_snapshot_status]?.tr ?? row.perf_snapshot_status} />
            <DetailRow label="Anlık Görüntü"  value={row.perf_snapshot_date ?? '–'} />
          </div>
        </div>

        {/* Veri Kaynağı + Uyarılar */}
        <div className="bg-navy-800/40 rounded-lg p-3">
          <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Veri Kaynağı</div>
          <DetailRow label="Son Güncelleme"   value={fmt(row.last_fetch_at)} />
          <DetailRow label="Son Durum"
            value={STATUS_META[row.last_fetch_status ?? '']?.tr ?? (row.last_fetch_status ?? '–')}
            highlight={row.last_fetch_status === 'success' ? 'ok' : row.last_fetch_status === 'error' ? 'error' : row.last_fetch_status === 'rate_limited' ? 'warn' : undefined} />
          <DetailRow label="Bayat Uyarı"      value={row.stale_warning ? 'Evet' : 'Hayır'}
            highlight={row.stale_warning ? 'warn' : 'ok'} />
          <DetailRow label="Eksik Uyarı"      value={row.missing_warning ? 'Evet' : 'Hayır'}
            highlight={row.missing_warning ? 'error' : 'ok'} />
          <DetailRow label="Manuel Kontrol"   value={row.manual_review ? 'İşaretli' : 'Temiz'}
            highlight={row.manual_review ? 'warn' : 'ok'} />
          {row.notes && (
            <div className="mt-2 pt-2 border-t border-navy-700">
              <p className="text-[10px] text-navy-500 font-mono leading-relaxed">{row.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        <span className="text-[11px] text-navy-500 self-center mr-1 font-medium uppercase tracking-wider">Aksiyonlar:</span>

        {/* Fetch squads — wired to import-wc2026 edge function */}
        <button
          onClick={onFetchSquad}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-40 font-medium"
        >
          {isFetching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          Kadro Çek
        </button>

        {/* Mark / clear manual review — wired to wc2026_mark_manual_review RPC */}
        {row.manual_review ? (
          <button
            onClick={onClearReview}
            disabled={isMarking}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40"
          >
            {isMarking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Manuel Kontrolü Kaldır
          </button>
        ) : (
          <button
            onClick={onMarkReview}
            disabled={isMarking}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-40"
          >
            {isMarking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3" />}
            Manuel Kontrol Gerekli
          </button>
        )}

        {/* View provider logs — disabled with clear explanation */}
        <DisabledAction
          label="Oyuncu Eşleşmesi Zorla"
          reason="Oyuncu havuzu boş — önce kadro çekme işlemi yapılmalı. API-Football player ID eşleşmesi otomatik çalışır."
        />

        <DisabledAction
          label="Performans Güncelle"
          reason="af-player-season-stats edge function ile sağlanır. Kadro verisi olmadan çalışmaz."
        />
      </div>
    </div>
  );
}

// ─── Players Tab ──────────────────────────────────────────────────────────────

function PlayersTab() {
  const [players, setPlayers]   = useState<PlayerPoolRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [availFilter, setAvailFilter] = useState('tumu');
  const [mappingFilter, setMappingFilter] = useState('tumu');
  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from('wc2026_player_pool')
      .select('id, api_football_team_id, player_name, position, shirt_number, nationality, club_team_name, club_league, availability_status, data_status, mapping_confidence, fetched_at')
      .order('nationality', { ascending: true })
      .order('player_name', { ascending: true })
      .limit(1000);
    if (availFilter !== 'tumu') q = q.eq('availability_status', availFilter);
    if (mappingFilter !== 'tumu') q = q.eq('mapping_confidence', mappingFilter);
    const { data, error: err } = await q;
    if (err) { setError(err.message); setLoading(false); return; }
    setPlayers((data as PlayerPoolRow[]) ?? []);
    setLoading(false);
  }, [availFilter, mappingFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? players.filter(p =>
        p.player_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.club_team_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (p.nationality ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : players;

  const POS_ORDER: (string | null)[] = ['Goalkeeper', 'Defender', 'Midfielder', 'Attacker', null];
  const grouped: Record<string, PlayerPoolRow[]> = {};
  for (const pos of POS_ORDER) {
    const key = pos ?? 'Bilinmiyor';
    grouped[key] = filtered.filter(p => p.position === pos);
  }

  const POS_TR: Record<string, string> = {
    Goalkeeper: 'Kaleci',
    Defender:   'Defans',
    Midfielder: 'Orta Saha',
    Attacker:   'Forvet',
    Bilinmiyor: 'Pozisyon Bilinmiyor',
  };

  const mappingSummary = {
    high:    players.filter(p => p.mapping_confidence === 'high').length,
    medium:  players.filter(p => p.mapping_confidence === 'medium').length,
    low:     players.filter(p => p.mapping_confidence === 'low').length,
    none:    players.filter(p => !p.mapping_confidence || p.mapping_confidence === 'none').length,
  };

  return (
    <div>
      {players.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <SmallStat label="Toplam Oyuncu"   value={players.length} />
          <SmallStat label="Yüksek Eşleşme"  value={mappingSummary.high}   accent="green" />
          <SmallStat label="Orta Eşleşme"    value={mappingSummary.medium} accent="amber" />
          <SmallStat label="Düşük/Yok"       value={mappingSummary.low + mappingSummary.none}
            accent={(mappingSummary.low + mappingSummary.none) > 0 ? 'red' : undefined} />
        </div>
      )}

      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-[180px] bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5">
            <Search className="w-3 h-3 text-navy-500 shrink-0" />
            <input
              type="text"
              placeholder="Oyuncu, kulüp veya ülke ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none placeholder-navy-600 w-full"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="text-[11px] text-navy-500 self-center mr-1">Hazırlık:</span>
            {['tumu', 'available', 'injured', 'suspended', 'unknown'].map(s => (
              <button key={s} onClick={() => setAvailFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  availFilter === s
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {s === 'tumu' ? 'Tümü' : STATUS_META[s]?.tr ?? s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="text-[11px] text-navy-500 self-center mr-1">Eşleşme:</span>
            {['tumu', 'high', 'medium', 'low'].map(s => (
              <button key={s} onClick={() => setMappingFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  mappingFilter === s
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {s === 'tumu' ? 'Tümü' : STATUS_META[s]?.tr ?? s}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {!loading && players.length === 0 && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-12 text-center">
          <Users className="w-12 h-12 text-navy-700 mx-auto mb-4" />
          <p className="text-sm font-medium text-readable-muted mb-2">Oyuncu Havuzu Boş</p>
          <p className="text-xs text-navy-600 max-w-sm mx-auto leading-relaxed">
            API-Football entegrasyonu aktif olduğunda 48 ülkenin aday kadro verileri burada listelenecek.
            Millî Takımlar sekmesindeki <strong className="text-navy-400">"Kadro Çek"</strong> butonu
            ile takım bazında veri çekilebilir.
          </p>
        </div>
      )}

      {loading && <LoadingSkeleton rows={10} />}

      {!loading && filtered.length > 0 && (
        <div className="space-y-4">
          {POS_ORDER.map(pos => {
            const key = pos ?? 'Bilinmiyor';
            const group = grouped[key];
            if (!group || group.length === 0) return null;
            return (
              <div key={key} className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-navy-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
                      {POS_TR[key] ?? key}
                    </span>
                    <span className="text-[11px] text-navy-500">({group.length})</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-navy-800">
                        <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Oyuncu</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Ülke</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Kulüp</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Hazırlık</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell">Oyuncu Eşleşmesi</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden xl:table-cell">Veri Durumu</th>
                        <th className="text-right px-5 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Son Güncelleme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.map(p => (
                        <tr key={p.id} className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
                          <td className="px-5 py-2.5">
                            <div className="text-white font-medium">{p.player_name}</div>
                            {p.shirt_number != null && (
                              <span className="text-[10px] text-navy-600">#{p.shirt_number}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-navy-400 hidden sm:table-cell">
                            {p.nationality ?? '–'}
                          </td>
                          <td className="px-3 py-2.5 text-center hidden md:table-cell">
                            <div className="text-navy-300 text-[11px]">{p.club_team_name ?? '–'}</div>
                            {p.club_league && <div className="text-navy-600 text-[10px]">{p.club_league}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <StatusBadge status={p.availability_status} />
                          </td>
                          <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                            <StatusBadge status={p.mapping_confidence} />
                          </td>
                          <td className="px-3 py-2.5 text-center hidden xl:table-cell">
                            <StatusBadge status={p.data_status} />
                          </td>
                          <td className="px-5 py-2.5 text-right text-navy-500 tabular-nums hidden sm:table-cell">
                            {fmt(p.fetched_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Fetch Logs Tab ───────────────────────────────────────────────────────────

function FetchLogsTab() {
  const [logs, setLogs]         = useState<FetchLogRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('tumu');
  const [statusFilter, setStatusFilter] = useState('tumu');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from('wc2026_provider_fetch_logs')
      .select('id, provider, endpoint, data_type, fetch_status, rows_received, rows_inserted, rows_skipped, error_detail, api_football_team_id, api_football_fixture_id, triggered_by, fetched_at, duration_ms')
      .order('fetched_at', { ascending: false })
      .limit(300);
    if (typeFilter !== 'tumu') q = q.eq('data_type', typeFilter);
    if (statusFilter !== 'tumu') q = q.eq('fetch_status', statusFilter);
    const { data, error: err } = await q;
    if (err) { setError(err.message); setLoading(false); return; }
    setLogs((data as FetchLogRow[]) ?? []);
    setLoading(false);
  }, [typeFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const DATA_TYPES = ['tumu', 'squad', 'lineup', 'player_stats', 'fixtures', 'injuries', 'recent_form'];
  const DATA_TYPE_TR: Record<string, string> = {
    squad: 'Kadro', lineup: 'İlk 11', player_stats: 'Oyuncu Stat.',
    fixtures: 'Fikstür', injuries: 'Sakatlık', recent_form: 'Son Form',
  };

  const summary = {
    total:   logs.length,
    success: logs.filter(l => l.fetch_status === 'success').length,
    error:   logs.filter(l => l.fetch_status === 'error').length,
    limited: logs.filter(l => l.fetch_status === 'rate_limited').length,
  };

  return (
    <div>
      {logs.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <SmallStat label="Toplam İstek"  value={summary.total} />
          <SmallStat label="Başarılı"      value={summary.success} accent="green" />
          <SmallStat label="Hata"          value={summary.error}   accent={summary.error > 0 ? 'red' : undefined} />
          <SmallStat label="Limit Aşıldı"  value={summary.limited} accent={summary.limited > 0 ? 'orange' : undefined} />
        </div>
      )}

      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-wrap gap-1">
            <span className="text-[11px] text-navy-500 self-center mr-1">Veri Tipi:</span>
            {DATA_TYPES.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  typeFilter === t
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {t === 'tumu' ? 'Tümü' : DATA_TYPE_TR[t] ?? t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="text-[11px] text-navy-500 self-center mr-1">Durum:</span>
            {['tumu', 'success', 'error', 'rate_limited'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  statusFilter === s
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {s === 'tumu' ? 'Tümü' : STATUS_META[s]?.tr ?? s}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {!loading && logs.length === 0 && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-12 text-center">
          <Activity className="w-12 h-12 text-navy-700 mx-auto mb-4" />
          <p className="text-sm font-medium text-readable-muted mb-2">Henüz Veri Kaynağı Kaydı Yok</p>
          <p className="text-xs text-navy-600 max-w-sm mx-auto leading-relaxed">
            API-Football entegrasyonundan ilk veri çekildiğinde loglar burada görünecek.
            Millî Takımlar sekmesindeki <strong className="text-navy-400">"Kadro Çek"</strong> butonu
            ile tetiklenebilir.
          </p>
        </div>
      )}

      {(loading || logs.length > 0) && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800">
            <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Veri Kaynağı Log ({logs.length})
            </span>
          </div>
          {loading ? <LoadingSkeleton rows={8} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Endpoint</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Veri Tipi</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Durum</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Alınan / Eklenen</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Sağlayıcı</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Tetikleyen</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Son Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="text-navy-300 font-mono text-[11px] truncate max-w-[200px]">{l.endpoint}</div>
                        {l.error_detail && (
                          <div className="text-red-400 text-[10px] mt-0.5 font-mono truncate max-w-[200px]">{l.error_detail}</div>
                        )}
                        {l.duration_ms != null && (
                          <div className="text-navy-600 text-[10px]">{l.duration_ms}ms</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-navy-400">
                        {DATA_TYPE_TR[l.data_type] ?? l.data_type}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StatusBadge status={l.fetch_status} />
                      </td>
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        <span className="text-navy-300 font-mono">{l.rows_received}</span>
                        <span className="text-navy-600"> / </span>
                        <span className={`font-mono ${l.rows_inserted > 0 ? 'text-emerald-400' : 'text-navy-500'}`}>
                          {l.rows_inserted}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-navy-500 hidden md:table-cell">
                        {l.provider}
                      </td>
                      <td className="px-3 py-3 text-center text-navy-500 hidden md:table-cell">
                        {l.triggered_by}
                      </td>
                      <td className="px-5 py-3 text-right text-navy-500 tabular-nums">
                        {fmt(l.fetched_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
