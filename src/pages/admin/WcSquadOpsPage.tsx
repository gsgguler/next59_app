import { useState, useEffect, useCallback } from 'react';
import {
  Users, RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle,
  Shield, Globe, Filter, ChevronDown, ChevronUp, Database,
  AlertCircle, Activity, Eye,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamPoolRow {
  api_football_team_id:  number;
  team_name:             string;
  fifa_code:             string | null;
  confederation:         string | null;
  squad_status:          string;
  squad_player_count:    number;
  squad_last_fetched_at: string | null;
  squad_valid_until:     string | null;
  lineup_status:         string;
  lineup_last_fetched_at: string | null;
  perf_snapshot_status:  string;
  perf_snapshot_date:    string | null;
  overall_status:        string;
  stale_warning:         boolean;
  missing_warning:       boolean;
  probable_squad_count:  number;
  player_pool_count:     number;
  last_fetch_status:     string | null;
  last_fetch_at:         string | null;
  notes:                 string | null;
}

interface FetchLogRow {
  id:                       string;
  provider:                 string;
  endpoint:                 string;
  data_type:                string;
  fetch_status:             string;
  rows_received:            number;
  rows_inserted:            number;
  rows_skipped:             number;
  error_detail:             string | null;
  api_football_team_id:     number | null;
  api_football_fixture_id:  number | null;
  triggered_by:             string;
  fetched_at:               string;
  duration_ms:              number | null;
}

interface PlayerPoolRow {
  id:                   string;
  player_name:          string;
  position:             string | null;
  shirt_number:         number | null;
  club_team_name:       string | null;
  availability_status:  string;
  data_status:          string;
  mapping_confidence:   string;
  fetched_at:           string;
}

type TabId = 'teams' | 'players' | 'logs';
type ConfFilter = 'tumu' | 'UEFA' | 'CONMEBOL' | 'CAF' | 'AFC' | 'CONCACAF' | 'OFC';
type StatusFilter = 'tumu' | 'pending' | 'partial' | 'complete' | 'stale' | 'error';

const STATUS_LABELS: Record<string, { tr: string; color: string }> = {
  pending:       { tr: 'Bekliyor',   color: 'bg-navy-700 text-navy-300' },
  partial:       { tr: 'Kısmi',      color: 'bg-amber-500/15 text-amber-400 border border-amber-500/25' },
  complete:      { tr: 'Tam',        color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' },
  stale:         { tr: 'Bayat',      color: 'bg-orange-500/15 text-orange-400 border border-orange-500/25' },
  error:         { tr: 'Hata',       color: 'bg-red-500/15 text-red-400 border border-red-500/25' },
  probable:      { tr: 'Muhtemel',   color: 'bg-blue-500/15 text-blue-400 border border-blue-500/25' },
  confirmed:     { tr: 'Onaylı',     color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' },
  unavailable:   { tr: 'Mevcut Değil', color: 'bg-navy-700 text-navy-400' },
  manual_review: { tr: 'İnceleme',   color: 'bg-amber-500/15 text-amber-400 border border-amber-500/25' },
  success:       { tr: 'Başarılı',   color: 'bg-emerald-500/15 text-emerald-400' },
  rate_limited:  { tr: 'Limit',      color: 'bg-orange-500/15 text-orange-400' },
  available:     { tr: 'Hazır',      color: 'bg-emerald-500/15 text-emerald-400' },
  injured:       { tr: 'Sakatlı',    color: 'bg-red-500/15 text-red-400' },
  suspended:     { tr: 'Cezalı',     color: 'bg-amber-500/15 text-amber-400' },
  unknown:       { tr: 'Bilinmiyor', color: 'bg-navy-700 text-navy-400' },
  none:          { tr: 'Yok',        color: 'bg-navy-700 text-navy-400' },
  low:           { tr: 'Düşük',      color: 'bg-red-500/15 text-red-400' },
  medium:        { tr: 'Orta',       color: 'bg-amber-500/15 text-amber-400' },
  high:          { tr: 'Yüksek',     color: 'bg-emerald-500/15 text-emerald-400' },
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-navy-600 text-[11px]">–</span>;
  const cfg = STATUS_LABELS[status] ?? { tr: status, color: 'bg-navy-700 text-navy-400' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color}`}>
      {cfg.tr}
    </span>
  );
}

function WarnIcon({ stale, missing }: { stale: boolean; missing: boolean }) {
  if (stale) return <AlertTriangle className="w-3.5 h-3.5 text-orange-400" title="Bayat veri" />;
  if (missing) return <AlertCircle className="w-3.5 h-3.5 text-red-400" title="Eksik veri" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/40" />;
}

function fmt(ts: string | null): string {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WcSquadOpsPage() {
  const [tab, setTab] = useState<TabId>('teams');

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-7xl mx-auto">

        <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-300">
            <strong>Dünya Kupası 2026 — Kadro İstihbarat Katmanı.</strong>{' '}
            Tüm veriler muhtemel/aday statüsündedir. Resmi kadro açıklanana kadar hiçbir veri kesinleşmez.
          </p>
        </div>

        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Globe className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">DK 2026 Kadro Operasyonları</h1>
            <p className="text-sm text-readable-muted mt-1">
              Muhtemel İlk 11 · Yedek Oyuncular · Aday Kadro · Onaylı Kadro · Veri Kaynağı Takibi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-6 border-b border-navy-800">
          {([
            { id: 'teams'   as TabId, label: 'Millî Takımlar',  icon: Globe },
            { id: 'players' as TabId, label: 'Oyuncu Havuzu',   icon: Users },
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
  const [expanded, setExpanded]     = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('wc2026_get_team_pool_overview');
    if (err) { setError(err.message); setLoading(false); return; }
    setRows((data as TeamPoolRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => {
    if (confFilter !== 'tumu' && r.confederation !== confFilter) return false;
    if (statusFilter !== 'tumu' && r.overall_status !== statusFilter) return false;
    return true;
  });

  const summary = {
    total:    rows.length,
    complete: rows.filter(r => r.overall_status === 'complete').length,
    partial:  rows.filter(r => r.overall_status === 'partial').length,
    pending:  rows.filter(r => r.overall_status === 'pending').length,
    stale:    rows.filter(r => r.stale_warning).length,
    missing:  rows.filter(r => r.missing_warning).length,
  };

  const CONF_OPTIONS: ConfFilter[] = ['tumu', 'UEFA', 'CONMEBOL', 'CAF', 'AFC', 'CONCACAF', 'OFC'];
  const STATUS_OPTIONS: StatusFilter[] = ['tumu', 'pending', 'partial', 'complete', 'stale', 'error'];

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        <SmallStat label="Toplam Takım"   value={summary.total} />
        <SmallStat label="Tam"            value={summary.complete} accent="green" />
        <SmallStat label="Kısmi"          value={summary.partial}  accent="amber" />
        <SmallStat label="Bekliyor"       value={summary.pending} />
        <SmallStat label="Bayat Uyarı"    value={summary.stale}    accent={summary.stale > 0 ? 'orange' : undefined} />
        <SmallStat label="Eksik Uyarı"    value={summary.missing}  accent={summary.missing > 0 ? 'red' : undefined} />
      </div>

      {/* Filters */}
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-navy-400" />
          <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Filtreler</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Confederation filter */}
          <div className="flex flex-wrap gap-1">
            {CONF_OPTIONS.map(c => (
              <button key={c} onClick={() => setConfFilter(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  confFilter === c
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {c === 'tumu' ? 'Tümü' : c}
              </button>
            ))}
          </div>
          {/* Status filter */}
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  statusFilter === s
                    ? 'bg-champagne/15 text-champagne border border-champagne/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {s === 'tumu' ? 'Tüm Durum' : STATUS_LABELS[s]?.tr ?? s}
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

      {/* Empty state when no teams exist yet */}
      {!loading && rows.length === 0 && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-10 text-center">
          <Globe className="w-10 h-10 text-navy-700 mx-auto mb-3" />
          <p className="text-sm text-readable-muted mb-2">Henüz takım havuzu verisi yok.</p>
          <p className="text-xs text-navy-600">
            48 millî takım kaydı wc2026_team_pool tablosuna eklendiğinde burada görünecek.
          </p>
        </div>
      )}

      {/* Table */}
      {(loading || filtered.length > 0) && (
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Millî Takım Durumu ({filtered.length})
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
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Muhtemel İlk 11</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell">Performans</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Son Güncelleme</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Uyarı</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <>
                      <tr
                        key={row.api_football_team_id}
                        className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors cursor-pointer"
                        onClick={() => setExpanded(expanded === row.api_football_team_id ? null : row.api_football_team_id)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {row.iso2 && (
                              <span
                                className={`fi fi-${row.iso2.toLowerCase()} w-4 h-3 rounded-sm shrink-0`}
                              />
                            )}
                            <div>
                              <div className="text-white font-medium leading-tight">{row.team_name}</div>
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
                              <span className="text-[10px] text-navy-500">{row.squad_player_count} oyuncu</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center hidden md:table-cell">
                          <StatusBadge status={row.lineup_status} />
                        </td>
                        <td className="px-3 py-3 text-center hidden lg:table-cell">
                          <StatusBadge status={row.perf_snapshot_status} />
                        </td>
                        <td className="px-3 py-3 text-center hidden sm:table-cell">
                          <span className="text-[11px] text-navy-500 tabular-nums">
                            {fmt(row.squad_last_fetched_at)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <WarnIcon stale={row.stale_warning} missing={row.missing_warning} />
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={e => { e.stopPropagation(); setExpanded(expanded === row.api_football_team_id ? null : row.api_football_team_id); }}
                            className="p-1 text-navy-500 hover:text-white transition-colors"
                          >
                            {expanded === row.api_football_team_id
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />
                            }
                          </button>
                        </td>
                      </tr>
                      {expanded === row.api_football_team_id && (
                        <tr key={`${row.api_football_team_id}-detail`} className="border-b border-navy-800/40 bg-navy-900/30">
                          <td colSpan={8} className="px-5 py-4">
                            <TeamDetail row={row} />
                          </td>
                        </tr>
                      )}
                    </>
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

function TeamDetail({ row }: { row: TeamPoolRow }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Aday Kadro</div>
        <DetailRow label="Durum"           value={STATUS_LABELS[row.squad_status]?.tr ?? row.squad_status} />
        <DetailRow label="Oyuncu Sayısı"   value={row.squad_player_count.toString()} />
        <DetailRow label="Son Çekme"       value={fmt(row.squad_last_fetched_at)} />
        <DetailRow label="Geçerlilik Sonu" value={fmt(row.squad_valid_until)} />
        <DetailRow label="Taslak Sayısı"   value={row.probable_squad_count.toString()} />
      </div>
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Muhtemel İlk 11</div>
        <DetailRow label="Durum"           value={STATUS_LABELS[row.lineup_status]?.tr ?? row.lineup_status} />
        <DetailRow label="Son Çekme"       value={fmt(row.lineup_last_fetched_at)} />
      </div>
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Performans Anlık Görüntüsü</div>
        <DetailRow label="Durum"           value={STATUS_LABELS[row.perf_snapshot_status]?.tr ?? row.perf_snapshot_status} />
        <DetailRow label="Anlık Görüntü"   value={row.perf_snapshot_date ?? '–'} />
        <DetailRow label="Oyuncu Havuzu"   value={row.player_pool_count.toString()} />
      </div>
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Veri Kaynağı</div>
        <DetailRow label="Son Çekme"       value={fmt(row.last_fetch_at)} />
        <DetailRow label="Son Durum"       value={STATUS_LABELS[row.last_fetch_status ?? '']?.tr ?? (row.last_fetch_status ?? '–')} />
        <DetailRow label="Bayat Uyarı"     value={row.stale_warning ? 'Evet' : 'Hayır'} />
        <DetailRow label="Eksik Uyarı"     value={row.missing_warning ? 'Evet' : 'Hayır'} />
        {row.notes && <DetailRow label="Not" value={row.notes} />}
      </div>
    </div>
  );
}

// ─── Players Tab ──────────────────────────────────────────────────────────────

function PlayersTab() {
  const [players, setPlayers] = useState<PlayerPoolRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('tumu');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from('wc2026_player_pool')
      .select('id, player_name, position, shirt_number, club_team_name, availability_status, data_status, mapping_confidence, fetched_at')
      .order('player_name', { ascending: true })
      .limit(500);
    if (statusFilter !== 'tumu') q = q.eq('data_status', statusFilter);
    const { data, error: err } = await q;
    if (err) { setError(err.message); setLoading(false); return; }
    setPlayers((data as PlayerPoolRow[]) ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = teamFilter
    ? players.filter(p => p.club_team_name?.toLowerCase().includes(teamFilter.toLowerCase()) || p.player_name.toLowerCase().includes(teamFilter.toLowerCase()))
    : players;

  const POS_ORDER = ['Goalkeeper', 'Defender', 'Midfielder', 'Attacker', null];
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
    Bilinmiyor: 'Bilinmiyor',
  };

  return (
    <div>
      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Oyuncu veya kulüp ara..."
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
            className="flex-1 min-w-[180px] bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50 placeholder-navy-600"
          />
          <div className="flex flex-wrap gap-1">
            {['tumu', 'probable', 'confirmed', 'unavailable', 'stale', 'manual_review'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  statusFilter === s
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {s === 'tumu' ? 'Tümü' : STATUS_LABELS[s]?.tr ?? s}
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
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-10 text-center">
          <Users className="w-10 h-10 text-navy-700 mx-auto mb-3" />
          <p className="text-sm text-readable-muted mb-2">Henüz oyuncu havuzu verisi yok.</p>
          <p className="text-xs text-navy-600">
            API-Football entegrasyonu aktif olduğunda 48 ülkenin oyuncu verileri burada listelenecek.
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
                <div className="px-5 py-3 border-b border-navy-800 flex items-center gap-2">
                  <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
                    {POS_TR[key] ?? key}
                  </span>
                  <span className="text-[11px] text-navy-500">({group.length})</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-navy-800">
                        <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Oyuncu</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Kulüp</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Durum</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Hazırlık</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden lg:table-cell">Eşleşme Güveni</th>
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
                            {p.club_team_name ?? '–'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <StatusBadge status={p.availability_status} />
                          </td>
                          <td className="px-3 py-2.5 text-center hidden md:table-cell">
                            <StatusBadge status={p.data_status} />
                          </td>
                          <td className="px-3 py-2.5 text-center hidden lg:table-cell">
                            <StatusBadge status={p.mapping_confidence} />
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from('wc2026_provider_fetch_logs')
      .select('id, provider, endpoint, data_type, fetch_status, rows_received, rows_inserted, rows_skipped, error_detail, api_football_team_id, api_football_fixture_id, triggered_by, fetched_at, duration_ms')
      .order('fetched_at', { ascending: false })
      .limit(200);
    if (typeFilter !== 'tumu') q = q.eq('data_type', typeFilter);
    const { data, error: err } = await q;
    if (err) { setError(err.message); setLoading(false); return; }
    setLogs((data as FetchLogRow[]) ?? []);
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  const DATA_TYPES = ['tumu', 'squad', 'lineup', 'player_stats', 'fixtures', 'injuries'];
  const DATA_TYPE_TR: Record<string, string> = {
    squad: 'Kadro', lineup: 'Kadro Dizilimi', player_stats: 'Oyuncu İstatistik',
    fixtures: 'Fikstür', injuries: 'Sakatlık',
  };

  const summary = {
    total:   logs.length,
    success: logs.filter(l => l.fetch_status === 'success').length,
    error:   logs.filter(l => l.fetch_status === 'error').length,
    limited: logs.filter(l => l.fetch_status === 'rate_limited').length,
  };

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <SmallStat label="Toplam İstek"  value={summary.total} />
        <SmallStat label="Başarılı"      value={summary.success} accent="green" />
        <SmallStat label="Hata"          value={summary.error}   accent={summary.error > 0 ? 'red' : undefined} />
        <SmallStat label="Limit Aşıldı"  value={summary.limited} accent={summary.limited > 0 ? 'orange' : undefined} />
      </div>

      <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-wrap gap-1">
            {DATA_TYPES.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  typeFilter === t
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                }`}>
                {t === 'tumu' ? 'Tümü' : DATA_TYPE_TR[t] ?? t}
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
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-10 text-center">
          <Activity className="w-10 h-10 text-navy-700 mx-auto mb-3" />
          <p className="text-sm text-readable-muted mb-2">Henüz veri çekme kaydı yok.</p>
          <p className="text-xs text-navy-600">
            API-Football entegrasyonundan ilk veri çekildiğinde loglar burada görünecek.
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
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Tetikleyen</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Zaman</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="text-navy-300 font-mono text-[11px]">{l.endpoint}</div>
                        {l.error_detail && (
                          <div className="text-red-400 text-[10px] mt-0.5 font-mono truncate max-w-[240px]">{l.error_detail}</div>
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
                        <span className="text-emerald-400 font-mono">{l.rows_inserted}</span>
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

// ─── Shared UI Components ─────────────────────────────────────────────────────

function SmallStat({ label, value, accent }: {
  label: string;
  value: number;
  accent?: 'green' | 'amber' | 'orange' | 'red';
}) {
  const color = accent === 'green' ? 'text-emerald-400'
    : accent === 'amber' ? 'text-amber-400'
    : accent === 'orange' ? 'text-orange-400'
    : accent === 'red' ? 'text-red-400'
    : 'text-white';
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between text-[11px] mb-1.5">
      <span className="text-navy-500 shrink-0 mr-2">{label}</span>
      <span className="text-navy-300 font-mono text-right">{value}</span>
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

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="p-5 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-navy-800/40 rounded animate-pulse" />
      ))}
    </div>
  );
}
