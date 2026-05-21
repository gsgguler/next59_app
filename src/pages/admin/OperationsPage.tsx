import { useState, useEffect, useCallback, useRef } from 'react';
import { ListChecks, RefreshCw, AlertTriangle, Activity, Search, CheckCircle2, XCircle, Clock, Minus, ChevronDown, ChevronUp, Database, Zap, Eye, Filter, BarChart3, Wifi, ShieldAlert, MoreVertical, ArrowRight, RotateCcw, Trash2, AlertCircle, Wrench as WrenchIcon, PlayCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchReadinessRow = {
  id: string;
  match_date: string;
  match_time: string | null;
  home_team: string;
  away_team: string;
  competition: string;
  status_short: string;
  has_prediction: boolean;
  has_narrative: boolean;
  has_events: boolean;
  has_lineup: boolean;
  has_stats: boolean;
  has_elo: boolean;
};

type IngestRunRow = {
  id: string;
  run_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_found: number | null;
  records_inserted: number | null;
  error_log: Record<string, unknown> | null;
};

type JobRunRow = {
  id: string;
  job_name: string;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type ReviewQueueRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type CoverageGapRow = {
  id: string;
  match_date: string;
  home_team: string;
  away_team: string;
  competition: string;
  missing: string[];
};

// ─── Error Message Formatter ──────────────────────────────────────────────────

interface ActionableError {
  message: string;
  action: string;
  actionLabel: string;
  severity: 'critical' | 'warning' | 'info';
}

function formatErrorMessage(raw: string | null | undefined): ActionableError {
  if (!raw) {
    return {
      message: 'Bilinmeyen hata oluştu.',
      action: 'retry',
      actionLabel: 'Yeniden Dene',
      severity: 'warning',
    };
  }

  const lower = raw.toLowerCase();

  // Unique/conflict violations
  if (lower.includes('unique') || lower.includes('duplicate') || lower.includes('conflict') || lower.includes('23505')) {
    return {
      message: 'Çakışan kayıt var — bu veri zaten mevcut.',
      action: 'skip',
      actionLabel: 'Çakışmayı Atla',
      severity: 'info',
    };
  }

  // Foreign key violations
  if (lower.includes('foreign key') || lower.includes('23503') || lower.includes('fk_')) {
    return {
      message: 'Bağımlı kayıt bulunamadı — önce bağlantılı veriyi kontrol edin.',
      action: 'inspect',
      actionLabel: 'Veriyi İncele',
      severity: 'warning',
    };
  }

  // Network / timeout errors
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('network') || lower.includes('fetch')) {
    return {
      message: 'Ağ zaman aşımı — bağlantı sorunu veya API gecikmesi.',
      action: 'retry',
      actionLabel: 'Yeniden Dene',
      severity: 'warning',
    };
  }

  // Rate limit
  if (lower.includes('rate limit') || lower.includes('too many') || lower.includes('429')) {
    return {
      message: 'API kota sınırına ulaşıldı — bir süre bekleyin.',
      action: 'wait',
      actionLabel: 'Bekle ve Tekrarla',
      severity: 'critical',
    };
  }

  // Auth errors
  if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('403') || lower.includes('jwt')) {
    return {
      message: 'Yetkilendirme hatası — API anahtarını veya token\'ı kontrol edin.',
      action: 'inspect',
      actionLabel: 'Ayarları Kontrol Et',
      severity: 'critical',
    };
  }

  // Not found
  if (lower.includes('not found') || lower.includes('404') || lower.includes('no rows')) {
    return {
      message: 'Kayıt bulunamadı — veri silinmiş veya henüz işlenmemiş olabilir.',
      action: 'skip',
      actionLabel: 'Veriyi Temizle',
      severity: 'info',
    };
  }

  // Null/missing value errors
  if (lower.includes('null') || lower.includes('not null') || lower.includes('23502')) {
    return {
      message: 'Zorunlu alan eksik — eksik alanı doldurun veya kaynağı güncelleyin.',
      action: 'inspect',
      actionLabel: 'Kaynağı İncele',
      severity: 'warning',
    };
  }

  // Stale / no data
  if (lower.includes('stale') || lower.includes('bayat') || lower.includes('no data')) {
    return {
      message: 'Veri bayatlamış — yenileme işlemi tetiklenebilir.',
      action: 'retry',
      actionLabel: 'Yenile',
      severity: 'warning',
    };
  }

  // Generic fallback
  return {
    message: raw.length > 100 ? raw.slice(0, 100) + '…' : raw,
    action: 'retry',
    actionLabel: 'Yeniden Dene',
    severity: 'warning',
  };
}

// ─── ActionMenu component ─────────────────────────────────────────────────────

interface ActionMenuItem {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-navy-600 text-navy-400 hover:text-white hover:border-navy-500 transition-colors"
      >
        <WrenchIcon className="w-3 h-3" />
        Aksiyon
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-navy-800 border border-navy-600 rounded-xl shadow-xl z-20 overflow-hidden">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick(); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors hover:bg-navy-700 ${
                item.variant === 'danger' ? 'text-red-400 hover:text-red-300' : 'text-navy-200 hover:text-white'
              }`}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Actionable Items Panel ───────────────────────────────────────────────────

interface ActionableItem {
  id: string;
  title: string;
  detail: string;
  actionLabel: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
}

function ActionableItemsPanel({ items }: { items: ActionableItem[] }) {
  if (items.length === 0) return null;

  const critical = items.filter(i => i.severity === 'critical');
  const warnings  = items.filter(i => i.severity === 'warning');
  const infos     = items.filter(i => i.severity === 'info');

  const severityConfig = {
    critical: { bg: 'bg-red-500/8 border-red-500/25',    icon: XCircle,        color: 'text-red-400',    label: 'Kritik' },
    warning:  { bg: 'bg-amber-500/8 border-amber-500/20', icon: AlertTriangle,  color: 'text-amber-400',  label: 'Uyarı' },
    info:     { bg: 'bg-blue-500/8 border-blue-500/20',   icon: AlertCircle,    color: 'text-blue-400',   label: 'Bilgi' },
  };

  const all = [...critical, ...warnings, ...infos];

  return (
    <div className="bg-navy-900 border border-navy-700/60 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-navy-700/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-navy-800 border border-navy-700/60 flex items-center justify-center">
            <WrenchIcon className="w-4 h-4 text-champagne" />
          </div>
          <span className="text-sm font-semibold text-white">Aksiyon Bekleyen Öğeler</span>
          <span className="text-xs bg-red-500/15 border border-red-500/30 text-red-400 px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {critical.length > 0 && <span className="text-red-400">{critical.length} kritik</span>}
          {warnings.length > 0 && <span className="text-amber-400">{warnings.length} uyarı</span>}
        </div>
      </div>
      <div className="divide-y divide-navy-700/40">
        {all.map(item => {
          const cfg = severityConfig[item.severity];
          const Icon = cfg.icon;
          return (
            <div key={item.id} className={`flex items-start gap-3 px-5 py-3.5 ${cfg.bg} border-l-2 ${
              item.severity === 'critical' ? 'border-l-red-500' : item.severity === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500'
            }`}>
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>
                    {cfg.label} · {item.category}
                  </span>
                </div>
                <p className="text-xs font-medium text-white">{item.title}</p>
                <p className="text-[11px] text-navy-400 mt-0.5">{item.detail}</p>
              </div>
              <span className={`shrink-0 text-[11px] font-semibold flex items-center gap-1 ${cfg.color}`}>
                <ArrowRight className="w-3 h-3" />
                {item.actionLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ReadinessLevel = 'ready' | 'partial' | 'blocked';

function getReadiness(row: MatchReadinessRow): ReadinessLevel {
  if (!row.has_prediction) return 'blocked';
  const dataScore = [row.has_events, row.has_lineup, row.has_stats].filter(Boolean).length;
  if (dataScore === 3) return 'ready';
  if (dataScore >= 1) return 'partial';
  return 'blocked';
}

function getReadinessDetail(row: MatchReadinessRow): string {
  if (!row.has_prediction) return 'Tahmin eksik — üretim engellidir';
  const missing: string[] = [];
  if (!row.has_events) missing.push('Olaylar');
  if (!row.has_lineup) missing.push('Kadro');
  if (!row.has_stats) missing.push('İstatistik');
  if (missing.length === 0) return 'Tüm operasyonel veriler mevcut';
  return `Eksik: ${missing.join(', ')}`;
}

function ReadinessBadge({ level, detail }: { level: ReadinessLevel; detail?: string }) {
  if (level === 'ready')
    return (
      <span title={detail} className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full cursor-default">
        <CheckCircle2 className="w-3 h-3" /> Hazır
      </span>
    );
  if (level === 'partial')
    return (
      <span title={detail} className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full cursor-default">
        <Clock className="w-3 h-3" /> Kısmi Hazır
      </span>
    );
  return (
    <span title={detail} className="inline-flex items-center gap-1 text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full cursor-default">
      <XCircle className="w-3 h-3" /> Engelli
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
  ) : (
    <Minus className="w-4 h-4 text-navy-500 shrink-0" />
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const base = 'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border';
  if (status === 'success' || status === 'completed')
    return <span className={`${base} bg-emerald-500/15 text-emerald-400 border-emerald-500/30`}>OK</span>;
  if (status === 'running' || status === 'in_progress')
    return <span className={`${base} bg-blue-500/15 text-blue-400 border-blue-500/30`}>Running</span>;
  if (status === 'failed' || status === 'error')
    return <span className={`${base} bg-red-500/15 text-red-400 border-red-500/30`}>Failed</span>;
  return <span className={`${base} bg-navy-700/50 text-navy-400 border-navy-600/30`}>{status}</span>;
}

function formatRelative(ts: string | null): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, count, alertCount, children, defaultOpen = true,
}: {
  title: string; icon: React.ElementType; count?: number; alertCount?: number;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-navy-900 border border-navy-700/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-navy-800/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-navy-800 border border-navy-700/60 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-champagne" />
          </div>
          <span className="text-sm font-semibold text-white">{title}</span>
          {count !== undefined && (
            <span className="text-xs text-navy-400 bg-navy-800 border border-navy-700/60 px-2 py-0.5 rounded-full">{count}</span>
          )}
          {alertCount !== undefined && alertCount > 0 && (
            <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">{alertCount} hata</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-navy-400" /> : <ChevronDown className="w-4 h-4 text-navy-400" />}
      </button>
      {open && <div className="border-t border-navy-700/60">{children}</div>}
    </div>
  );
}

// ─── Active Match Selector ────────────────────────────────────────────────────

interface MatchOption {
  id: string;
  label: string;
  date: string;
  competition: string;
}

function ActiveMatchSelector({
  value,
  onChange,
  matches,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  matches: MatchReadinessRow[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const options: MatchOption[] = matches.map(m => ({
    id: m.id,
    label: `${m.home_team} vs ${m.away_team}`,
    date: m.match_date,
    competition: m.competition,
  }));

  const filtered = options.filter(o =>
    search.length < 2 || o.label.toLowerCase().includes(search.toLowerCase())
  );

  const selected = options.find(o => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 min-w-[260px] px-3 py-2 rounded-lg border border-navy-600 bg-navy-800 text-sm text-left text-white hover:border-navy-500 transition-colors"
      >
        <Search className="w-3.5 h-3.5 text-navy-400 shrink-0" />
        <span className="flex-1 truncate">
          {selected ? selected.label : <span className="text-navy-500">Maç seçin…</span>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-navy-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-80 bg-navy-800 border border-navy-600 rounded-xl shadow-xl z-20 overflow-hidden">
          <div className="p-2 border-b border-navy-700">
            <input
              autoFocus
              type="text"
              placeholder="Takım adı ile ara…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 bg-navy-700 border border-navy-600 rounded-lg text-sm text-white placeholder-navy-500 focus:outline-none focus:border-champagne/50"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {value && (
              <button
                onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-navy-400 hover:bg-navy-700 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" /> Seçimi Temizle
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-navy-500">Maç bulunamadı</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.id}
                  onClick={() => { onChange(o.id); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-navy-700 ${
                    o.id === value ? 'bg-champagne/10 text-champagne' : 'text-white'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{o.label}</p>
                    <p className="text-[10px] text-navy-500 mt-0.5">{o.date} · {o.competition}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Match Publishing Queue ───────────────────────────────────────────────────

type QueueFilter = 'today' | 'tomorrow' | 'upcoming' | 'missing_prediction' | 'all';

function MatchPublishingQueue({ onActionableItems }: { onActionableItems: (items: ActionableItem[]) => void }) {
  const [rows, setRows] = useState<MatchReadinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QueueFilter>('today');
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const threeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

    let fromDate = today;
    let toDate = today;
    if (filter === 'tomorrow') { fromDate = tomorrow; toDate = tomorrow; }
    else if (filter === 'upcoming' || filter === 'missing_prediction' || filter === 'all') {
      fromDate = today; toDate = threeDays;
    }

    const { data, error } = await supabase.rpc('admin_match_readiness', { p_from: fromDate, p_to: toDate });

    if (error || !data) {
      const { data: matches } = await supabase
        .from('matches')
        .select(`id, match_date, match_time, status_short,
          home_team:teams!home_team_id(name),
          away_team:teams!away_team_id(name),
          competition:competition_seasons!competition_season_id(competitions(name)),
          home_elo, away_elo`)
        .gte('match_date', fromDate).lte('match_date', toDate)
        .order('match_date', { ascending: true }).order('match_time', { ascending: true }).limit(100);

      if (!matches) { setLoading(false); return; }
      const matchIds = matches.map((m: Record<string, unknown>) => m.id as string);
      const [predRes, evtRes, lineupRes, statsRes] = await Promise.all([
        supabase.from('predictions').select('match_id').in('match_id', matchIds).is('superseded_by', null),
        supabase.from('match_events').select('match_id').in('match_id', matchIds),
        supabase.from('lineups').select('match_id').in('match_id', matchIds),
        supabase.from('match_stats').select('match_id').in('match_id', matchIds),
      ]);
      const predSet = new Set((predRes.data ?? []).map((r: Record<string, unknown>) => r.match_id as string));
      const evtSet = new Set((evtRes.data ?? []).map((r: Record<string, unknown>) => r.match_id as string));
      const lineupSet = new Set((lineupRes.data ?? []).map((r: Record<string, unknown>) => r.match_id as string));
      const statsSet = new Set((statsRes.data ?? []).map((r: Record<string, unknown>) => r.match_id as string));
      const built: MatchReadinessRow[] = matches.map((m: Record<string, unknown>) => {
        const homeTeam = m.home_team as { name: string } | null;
        const awayTeam = m.away_team as { name: string } | null;
        const csObj = m.competition as { competitions: { name: string } } | null;
        return {
          id: m.id as string, match_date: m.match_date as string, match_time: m.match_time as string | null,
          home_team: homeTeam?.name ?? '—', away_team: awayTeam?.name ?? '—',
          competition: csObj?.competitions?.name ?? '—', status_short: (m.status_short as string) ?? '',
          has_prediction: predSet.has(m.id as string), has_narrative: false,
          has_events: evtSet.has(m.id as string), has_lineup: lineupSet.has(m.id as string),
          has_stats: statsSet.has(m.id as string), has_elo: m.home_elo != null && m.away_elo != null,
        };
      });
      const filtered = filter === 'missing_prediction' ? built.filter(r => !r.has_prediction) : built;
      setRows(filtered);

      // Build actionable items from blocked matches
      const actionable: ActionableItem[] = filtered
        .filter(r => getReadiness(r) !== 'ready')
        .slice(0, 8)
        .map(r => ({
          id: r.id,
          title: `${r.home_team} vs ${r.away_team}`,
          detail: getReadinessDetail(r),
          actionLabel: !r.has_prediction ? 'Tahmin Üret' : 'Veri Çek',
          severity: !r.has_prediction ? 'critical' : 'warning' as ActionableItem['severity'],
          category: 'Yayın Kuyruğu',
        }));
      onActionableItems(actionable);
      setLoading(false);
      return;
    }

    const filtered = filter === 'missing_prediction'
      ? (data as MatchReadinessRow[]).filter(r => !r.has_prediction)
      : (data as MatchReadinessRow[]);
    setRows(filtered);
    const actionable: ActionableItem[] = filtered
      .filter(r => getReadiness(r) !== 'ready')
      .slice(0, 8)
      .map(r => ({
        id: r.id,
        title: `${r.home_team} vs ${r.away_team}`,
        detail: getReadinessDetail(r),
        actionLabel: !r.has_prediction ? 'Tahmin Üret' : 'Veri Çek',
        severity: !r.has_prediction ? 'critical' : 'warning' as ActionableItem['severity'],
        category: 'Yayın Kuyruğu',
      }));
    onActionableItems(actionable);
    setLoading(false);
  }, [filter, onActionableItems]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Display only the selected match if one is chosen
  const displayRows = selectedMatch ? rows.filter(r => r.id === selectedMatch) : rows;

  const filterButtons: { key: QueueFilter; label: string }[] = [
    { key: 'today', label: 'Bugün' },
    { key: 'tomorrow', label: 'Yarın' },
    { key: 'upcoming', label: '3 Gün' },
    { key: 'missing_prediction', label: 'Tahmin Yok' },
    { key: 'all', label: 'Tümü' },
  ];

  const readyCnt   = rows.filter(r => getReadiness(r) === 'ready').length;
  const partialCnt = rows.filter(r => getReadiness(r) === 'partial').length;
  const blockedCnt = rows.filter(r => getReadiness(r) === 'blocked').length;

  return (
    <Section title="Yayın Kuyruğu" icon={ListChecks} count={rows.length} alertCount={blockedCnt}>
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-navy-400 shrink-0" />
          {filterButtons.map(btn => (
            <button key={btn.key} onClick={() => setFilter(btn.key)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === btn.key
                  ? 'bg-champagne/15 border-champagne/40 text-champagne'
                  : 'bg-navy-800/50 border-navy-700/50 text-navy-400 hover:text-white hover:border-navy-600'
              }`}>{btn.label}</button>
          ))}
          <button onClick={fetchData} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
        </div>

        {/* Active Match Selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-navy-400 shrink-0">Maç Filtrele:</span>
          <ActiveMatchSelector value={selectedMatch} onChange={setSelectedMatch} matches={rows} />
          {selectedMatch && (
            <button onClick={() => setSelectedMatch(null)} className="text-xs text-navy-400 hover:text-white flex items-center gap-1 transition-colors">
              <XCircle className="w-3.5 h-3.5" /> Temizle
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Hazır', count: readyCnt, color: 'text-emerald-400' },
            { label: 'Kısmi Hazır', count: partialCnt, color: 'text-amber-400' },
            { label: 'Engelli', count: blockedCnt, color: 'text-red-400' },
          ].map(s => (
            <div key={s.label} className="bg-navy-800/50 border border-navy-700/40 rounded-lg px-4 py-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-xs text-navy-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Yükleniyor…</div>
        ) : displayRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-navy-400">Bu filtre için maç bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-navy-700/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-700/40 bg-navy-800/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Tarih</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Maç</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Lig</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Tahmin</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Olaylar</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Kadro</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">İstat</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400" title="Hazır = tahmin + tüm veriler">Durum ⓘ</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-navy-400">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => {
                  const level = getReadiness(row);
                  const actionItems: ActionMenuItem[] = [];
                  if (!row.has_prediction) actionItems.push({ label: 'Tahmin Üret', icon: PlayCircle, onClick: () => {} });
                  if (!row.has_events) actionItems.push({ label: 'Olayları Çek', icon: Zap, onClick: () => {} });
                  if (!row.has_lineup) actionItems.push({ label: 'Kadroyu Çek', icon: Database, onClick: () => {} });
                  if (!row.has_stats) actionItems.push({ label: 'İstatistik Çek', icon: BarChart3, onClick: () => {} });
                  if (level !== 'blocked') actionItems.push({ label: 'Veriyi Temizle', icon: Trash2, onClick: () => {}, variant: 'danger' });

                  return (
                    <tr key={row.id} className={`border-b border-navy-700/30 transition-colors hover:bg-navy-800/30 ${i % 2 === 0 ? '' : 'bg-navy-800/20'}`}>
                      <td className="px-4 py-2.5 text-xs text-navy-300 whitespace-nowrap">
                        {row.match_date}
                        {row.match_time && <span className="text-navy-500 ml-1">{String(row.match_time).slice(0, 5)}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-white font-medium whitespace-nowrap">
                        {row.home_team} <span className="text-navy-500">vs</span> {row.away_team}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-navy-400 whitespace-nowrap max-w-[120px] truncate">{row.competition}</td>
                      <td className="px-4 py-2.5 text-center"><StatusDot ok={row.has_prediction} /></td>
                      <td className="px-4 py-2.5 text-center"><StatusDot ok={row.has_events} /></td>
                      <td className="px-4 py-2.5 text-center"><StatusDot ok={row.has_lineup} /></td>
                      <td className="px-4 py-2.5 text-center"><StatusDot ok={row.has_stats} /></td>
                      <td className="px-4 py-2.5 text-center">
                        <ReadinessBadge level={level} detail={getReadinessDetail(row)} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <ActionMenu items={actionItems} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Data Freshness Monitor ───────────────────────────────────────────────────

type FreshnessRow = {
  label: string; lastRun: string | null; status: string;
  recordsFound: number | null; error: boolean;
};

function DataFreshnessMonitor() {
  const [rows, setRows] = useState<FreshnessRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: ingestions } = await supabase
      .from('ingestion_runs')
      .select('run_type, status, started_at, completed_at, records_found, error_log')
      .order('started_at', { ascending: false }).limit(200);
    if (!ingestions) { setLoading(false); return; }
    const byType = new Map<string, IngestRunRow>();
    for (const r of ingestions as IngestRunRow[]) {
      if (!byType.has(r.run_type)) byType.set(r.run_type, r);
    }
    const built: FreshnessRow[] = Array.from(byType.entries()).map(([type, run]) => ({
      label: type, lastRun: run.completed_at ?? run.started_at,
      status: run.status, recordsFound: run.records_found,
      error: run.status === 'failed' || run.status === 'error',
    }));
    setRows(built.sort((a, b) => (b.lastRun ?? '').localeCompare(a.lastRun ?? '')));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const staleCount = rows.filter(r => {
    if (!r.lastRun) return true;
    return (Date.now() - new Date(r.lastRun).getTime()) / 3600000 > 24;
  }).length;
  const errorCount = rows.filter(r => r.error).length;

  return (
    <Section title="Veri Tazeliği İzleme" icon={Database} count={rows.length} alertCount={errorCount + staleCount} defaultOpen={false}>
      <div className="p-4 space-y-3">
        <div className="flex justify-end">
          <button onClick={fetchData} className="text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-navy-400">Henüz ingestion kaydı bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-navy-700/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-700/40 bg-navy-800/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Tür</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Son Çalışma</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Kayıt</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const hoursAgo = row.lastRun ? (Date.now() - new Date(row.lastRun).getTime()) / 3600000 : Infinity;
                  const stale = hoursAgo > 24;
                  return (
                    <tr key={row.label} className={`border-b border-navy-700/30 hover:bg-navy-800/30 transition-colors ${i % 2 === 0 ? '' : 'bg-navy-800/20'}`}>
                      <td className="px-4 py-2.5 text-xs text-white font-mono">{row.label}</td>
                      <td className={`px-4 py-2.5 text-xs ${stale ? 'text-amber-400' : 'text-navy-300'}`}>
                        {formatRelative(row.lastRun)}
                        {stale && <span className="ml-1 text-amber-500/60">• bayat</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-navy-400">{row.recordsFound ?? '—'}</td>
                      <td className="px-4 py-2.5 text-center"><JobStatusBadge status={row.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Failed Jobs / Error Center ───────────────────────────────────────────────

function FailedJobsCenter({ onActionableItems }: { onActionableItems: (items: ActionableItem[]) => void }) {
  const [jobs, setJobs] = useState<JobRunRow[]>([]);
  const [ingestions, setIngestions] = useState<IngestRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [jobRes, ingestRes] = await Promise.all([
      supabase.from('job_runs').select('id, job_name, status, error_message, started_at, completed_at')
        .in('status', ['failed', 'error']).order('started_at', { ascending: false }).limit(50),
      supabase.from('ingestion_runs').select('id, run_type, status, started_at, completed_at, records_found, error_log')
        .in('status', ['failed', 'error']).order('started_at', { ascending: false }).limit(50),
    ]);
    setJobs((jobRes.data ?? []) as JobRunRow[]);
    setIngestions((ingestRes.data ?? []) as IngestRunRow[]);

    // Build actionable items
    const errorItems: ActionableItem[] = [
      ...(ingestRes.data ?? []).slice(0, 4).map((r: Record<string, unknown>) => {
        const raw = r.error_log ? JSON.stringify(r.error_log) : null;
        const fmt = formatErrorMessage(raw);
        return {
          id: r.id as string,
          title: `${r.run_type as string} ingestion başarısız`,
          detail: fmt.message,
          actionLabel: fmt.actionLabel,
          severity: fmt.severity,
          category: 'Ingestion Hatası',
        };
      }),
      ...(jobRes.data ?? []).slice(0, 4).map((r: Record<string, unknown>) => {
        const fmt = formatErrorMessage(r.error_message as string | null);
        return {
          id: r.id as string,
          title: `${r.job_name as string} başarısız`,
          detail: fmt.message,
          actionLabel: fmt.actionLabel,
          severity: fmt.severity,
          category: 'Job Hatası',
        };
      }),
    ];
    onActionableItems(errorItems);
    setLoading(false);
  }, [onActionableItems]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalErrors = jobs.length + ingestions.length;
  const displayJobs = showAll ? jobs : jobs.slice(0, 5);
  const displayIngestions = showAll ? ingestions : ingestions.slice(0, 5);

  return (
    <Section title="Başarısız İşler / Hata Merkezi" icon={AlertTriangle} alertCount={totalErrors} defaultOpen={false}>
      <div className="p-4 space-y-4">
        <div className="flex justify-end">
          <button onClick={fetchData} className="text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Yükleniyor…</div>
        ) : totalErrors === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-navy-400">Başarısız iş bulunmuyor.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayIngestions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-2">
                  İngestion Hataları ({ingestions.length})
                </p>
                <div className="space-y-2">
                  {displayIngestions.map(r => {
                    const raw = r.error_log ? JSON.stringify(r.error_log) : null;
                    const fmt = formatErrorMessage(raw);
                    const actionItems: ActionMenuItem[] = [
                      { label: fmt.actionLabel, icon: RotateCcw, onClick: () => {} },
                      { label: 'Kaydı Sil', icon: Trash2, onClick: () => {}, variant: 'danger' },
                    ];
                    return (
                      <div key={r.id} className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-mono text-red-300">{r.run_type}</span>
                            <span className="text-xs text-navy-500 ml-2">{formatRelative(r.started_at)}</span>
                            <p className="text-xs text-amber-300 mt-1 font-medium">{fmt.message}</p>
                            {raw && (
                              <p className="text-[10px] text-red-400/60 mt-0.5 font-mono truncate">{raw.slice(0, 80)}</p>
                            )}
                          </div>
                          <ActionMenu items={actionItems} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {displayJobs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-2">
                  Job Hataları ({jobs.length})
                </p>
                <div className="space-y-2">
                  {displayJobs.map(r => {
                    const fmt = formatErrorMessage(r.error_message);
                    const actionItems: ActionMenuItem[] = [
                      { label: fmt.actionLabel, icon: RotateCcw, onClick: () => {} },
                      { label: 'Kaydı Sil', icon: Trash2, onClick: () => {}, variant: 'danger' },
                    ];
                    return (
                      <div key={r.id} className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-mono text-red-300">{r.job_name}</span>
                            <span className="text-xs text-navy-500 ml-2">{formatRelative(r.started_at)}</span>
                            <p className="text-xs text-amber-300 mt-1 font-medium">{fmt.message}</p>
                          </div>
                          <ActionMenu items={actionItems} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(jobs.length > 5 || ingestions.length > 5) && (
              <button onClick={() => setShowAll(!showAll)} className="w-full text-xs text-navy-400 hover:text-white py-2 transition-colors">
                {showAll ? 'Daha Az Göster' : `Tümünü Göster (${totalErrors})`}
              </button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Coverage Gap Detector ────────────────────────────────────────────────────

function CoverageGapDetector() {
  const [gaps, setGaps] = useState<CoverageGapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [daysAhead, setDaysAhead] = useState(3);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
    const { data: matches } = await supabase
      .from('matches')
      .select(`id, match_date, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name),
        competition:competition_seasons!competition_season_id(competitions(name)), home_elo, away_elo`)
      .gte('match_date', today).lte('match_date', future).order('match_date', { ascending: true }).limit(200);
    if (!matches) { setLoading(false); return; }
    const matchIds = matches.map((m: Record<string, unknown>) => m.id as string);
    if (matchIds.length === 0) { setGaps([]); setLoading(false); return; }
    const [predRes, evtRes, lineupRes, statsRes] = await Promise.all([
      supabase.from('predictions').select('match_id').in('match_id', matchIds).is('superseded_by', null),
      supabase.from('match_events').select('match_id').in('match_id', matchIds),
      supabase.from('lineups').select('match_id').in('match_id', matchIds),
      supabase.from('match_stats').select('match_id').in('match_id', matchIds),
    ]);
    const predSet = new Set((predRes.data ?? []).map((r: Record<string, unknown>) => r.match_id as string));
    const evtSet = new Set((evtRes.data ?? []).map((r: Record<string, unknown>) => r.match_id as string));
    const lineupSet = new Set((lineupRes.data ?? []).map((r: Record<string, unknown>) => r.match_id as string));
    const statsSet = new Set((statsRes.data ?? []).map((r: Record<string, unknown>) => r.match_id as string));
    const gapRows: CoverageGapRow[] = [];
    for (const m of matches as Record<string, unknown>[]) {
      const missing: string[] = [];
      if (!predSet.has(m.id as string)) missing.push('Tahmin');
      if (!evtSet.has(m.id as string)) missing.push('Olaylar');
      if (!lineupSet.has(m.id as string)) missing.push('Kadro');
      if (!statsSet.has(m.id as string)) missing.push('İstatistik');
      if (m.home_elo == null || m.away_elo == null) missing.push('ELO');
      if (missing.length > 0) {
        const homeTeam = m.home_team as { name: string } | null;
        const awayTeam = m.away_team as { name: string } | null;
        const csObj = m.competition as { competitions: { name: string } } | null;
        gapRows.push({
          id: m.id as string, match_date: m.match_date as string,
          home_team: homeTeam?.name ?? '—', away_team: awayTeam?.name ?? '—',
          competition: csObj?.competitions?.name ?? '—', missing,
        });
      }
    }
    setGaps(gapRows);
    setLoading(false);
  }, [daysAhead]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Section title="Kapsam Boşluğu Dedektörü" icon={Search} count={gaps.length}
      alertCount={gaps.filter(g => g.missing.includes('Tahmin')).length} defaultOpen={false}>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-navy-400">Görünüm penceresi:</span>
          {[1, 3, 7].map(d => (
            <button key={d} onClick={() => setDaysAhead(d)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                daysAhead === d ? 'bg-champagne/15 border-champagne/40 text-champagne' : 'bg-navy-800/50 border-navy-700/50 text-navy-400 hover:text-white'
              }`}>{d} gün</button>
          ))}
          <button onClick={fetchData} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Tara
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Taranıyor…</div>
        ) : gaps.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-navy-400">Bu aralıkta kapsam boşluğu bulunamadı.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-navy-700/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-700/40 bg-navy-800/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Tarih</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Maç</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Lig</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Eksik Veriler</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-navy-400">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((row, i) => {
                  const actionItems: ActionMenuItem[] = row.missing.map(m => ({
                    label: `${m} Çek`,
                    icon: Database,
                    onClick: () => {},
                  }));
                  return (
                    <tr key={row.id} className={`border-b border-navy-700/30 hover:bg-navy-800/30 transition-colors ${i % 2 === 0 ? '' : 'bg-navy-800/20'}`}>
                      <td className="px-4 py-2.5 text-xs text-navy-300 whitespace-nowrap">{row.match_date}</td>
                      <td className="px-4 py-2.5 text-xs text-white font-medium whitespace-nowrap">
                        {row.home_team} <span className="text-navy-500">vs</span> {row.away_team}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-navy-400 whitespace-nowrap max-w-[120px] truncate">{row.competition}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.missing.map(m => (
                            <span key={m} className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded">{m}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <ActionMenu items={actionItems} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Prediction Review Workflow ───────────────────────────────────────────────

type ReviewFilter = 'pending' | 'approved' | 'rejected' | 'all';

function PredictionReviewWorkflow() {
  const [items, setItems] = useState<ReviewQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReviewFilter>('pending');

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('review_queue')
      .select('id, entity_type, entity_id, status, review_note, created_at, reviewed_at')
      .order('created_at', { ascending: false }).limit(100);
    if (filter !== 'all') query = query.eq('status', filter);
    const { data } = await query;
    setItems((data ?? []) as ReviewQueueRow[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pendingCount = items.filter(r => r.status === 'pending').length;

  return (
    <Section title="Tahmin İnceleme Kuyruğu" icon={Eye} count={items.length} alertCount={pendingCount} defaultOpen={false}>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {(['pending', 'approved', 'rejected', 'all'] as ReviewFilter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f ? 'bg-champagne/15 border-champagne/40 text-champagne' : 'bg-navy-800/50 border-navy-700/50 text-navy-400 hover:text-white'
              }`}>
              {f === 'pending' ? 'Bekleyen' : f === 'approved' ? 'Onaylı' : f === 'rejected' ? 'Reddedilen' : 'Tümü'}
            </button>
          ))}
          <button onClick={fetchData} className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Yükleniyor…</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-navy-400">Bu filtre için kayıt bulunamadı.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-navy-700/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-700/40 bg-navy-800/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Tür</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Durum</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Not</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Oluşturulma</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={row.id} className={`border-b border-navy-700/30 hover:bg-navy-800/30 transition-colors ${i % 2 === 0 ? '' : 'bg-navy-800/20'}`}>
                    <td className="px-4 py-2.5 text-xs font-mono text-navy-300">{row.entity_type}</td>
                    <td className="px-4 py-2.5 text-center"><JobStatusBadge status={row.status} /></td>
                    <td className="px-4 py-2.5 text-xs text-navy-400 max-w-[200px] truncate">{row.review_note ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-navy-500">{formatRelative(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── System Observability ─────────────────────────────────────────────────────

type ObsStats = {
  totalMatches: number; matchesWithPrediction: number; matchesWithElo: number;
  activeSubscriptions: number; pushSubscriptions: number;
  ingestRunsLast24h: number; failedRunsLast24h: number;
};

function SystemObservability() {
  const [stats, setStats] = useState<ObsStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const [matchRes, predRes, eloRes, subRes, pushRes, ingestRes, failedRes] = await Promise.all([
      supabase.from('matches').select('id', { count: 'exact', head: true }).gte('match_date', today).lte('match_date', future),
      supabase.from('predictions').select('match_id', { count: 'exact', head: true }).is('superseded_by', null),
      supabase.from('matches').select('id', { count: 'exact', head: true }).not('home_elo', 'is', null),
      supabase.from('user_subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('ingestion_runs').select('id', { count: 'exact', head: true }).gte('started_at', yesterday),
      supabase.from('ingestion_runs').select('id', { count: 'exact', head: true }).gte('started_at', yesterday).in('status', ['failed', 'error']),
    ]);
    setStats({
      totalMatches: matchRes.count ?? 0, matchesWithPrediction: predRes.count ?? 0,
      matchesWithElo: eloRes.count ?? 0, activeSubscriptions: subRes.count ?? 0,
      pushSubscriptions: pushRes.count ?? 0, ingestRunsLast24h: ingestRes.count ?? 0,
      failedRunsLast24h: failedRes.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const statCards = stats ? [
    { label: 'Yaklaşan Maçlar (7g)', value: stats.totalMatches, icon: ListChecks, alert: false },
    { label: 'Tahminli Maçlar', value: stats.matchesWithPrediction, icon: Zap, alert: false },
    { label: 'ELO Kapsanan', value: stats.matchesWithElo, icon: BarChart3, alert: false },
    { label: 'Aktif Abonelik', value: stats.activeSubscriptions, icon: Eye, alert: false },
    { label: 'Push Abonesi', value: stats.pushSubscriptions, icon: Activity, alert: false },
    { label: 'Ingest (24s)', value: stats.ingestRunsLast24h, icon: Database, alert: false },
    { label: 'Başarısız (24s)', value: stats.failedRunsLast24h, icon: AlertTriangle, alert: stats.failedRunsLast24h > 0 },
  ] : [];

  return (
    <Section title="Sistem Gözlemlenebilirliği" icon={Activity} defaultOpen={true}>
      <div className="p-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Yükleniyor…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statCards.map(card => (
              <div key={card.label} className={`rounded-lg border px-4 py-3 ${card.alert ? 'bg-red-500/5 border-red-500/30' : 'bg-navy-800/40 border-navy-700/40'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <card.icon className={`w-3.5 h-3.5 ${card.alert ? 'text-red-400' : 'text-navy-400'}`} />
                  <p className="text-xs text-navy-400 truncate">{card.label}</p>
                </div>
                <p className={`text-2xl font-bold ${card.alert ? 'text-red-400' : 'text-white'}`}>{card.value.toLocaleString('tr-TR')}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button onClick={fetchData} className="text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile
          </button>
        </div>
      </div>
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperationsPage() {
  const [queueActionable, setQueueActionable] = useState<ActionableItem[]>([]);
  const [errorActionable, setErrorActionable] = useState<ActionableItem[]>([]);

  const allActionable = [...queueActionable, ...errorActionable];

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center">
          <Activity className="w-5 h-5 text-champagne" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Operasyonlar</h1>
          <p className="text-sm text-navy-400">Canlı yayın yönetimi, veri kalitesi ve sistem sağlığı</p>
        </div>
      </div>

      <SystemObservability />
      <ActionableItemsPanel items={allActionable} />
      <MatchPublishingQueue onActionableItems={setQueueActionable} />
      <CoverageGapDetector />
      <DataFreshnessMonitor />
      <FailedJobsCenter onActionableItems={setErrorActionable} />
      <PredictionReviewWorkflow />
      <ProviderHealthCenter />
    </div>
  );
}

// ─── Provider Health Center ───────────────────────────────────────────────────

function ProviderHealthCenter() {
  return (
    <Section title="Sağlayıcı Sağlığı" icon={ShieldAlert} defaultOpen={false}>
      <div className="p-5">
        <div className="flex items-start gap-3 bg-navy-800/40 border border-navy-700/50 rounded-xl p-4">
          <Wifi className="w-5 h-5 text-champagne shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white mb-1">Sağlayıcı sağlık takibi taşındı</p>
            <p className="text-xs text-navy-400 mb-3">
              API çağrı durumu, bayatlık tespiti ve hata logları artık ayrı bir sayfada.
            </p>
            <a href="/admin/saglayici-sagligi"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-champagne hover:text-white transition-colors border border-champagne/30 hover:border-champagne/60 rounded-lg px-3 py-1.5 bg-champagne/5 hover:bg-champagne/10">
              <Activity className="w-3.5 h-3.5" />
              Sağlayıcı Sağlığı sayfasına git
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}
