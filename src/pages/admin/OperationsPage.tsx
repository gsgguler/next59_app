import { useState, useEffect, useCallback } from 'react';
import {
  ListChecks,
  RefreshCw,
  AlertTriangle,
  Activity,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Minus,
  ChevronDown,
  ChevronUp,
  Database,
  Zap,
  Eye,
  Filter,
  BarChart3,
  Wifi,
  WifiOff,
  ShieldAlert,
} from 'lucide-react';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ReadinessLevel = 'ready' | 'partial' | 'blocked';

function getReadiness(row: MatchReadinessRow): ReadinessLevel {
  // has_elo is always false (ELO columns don't exist on matches); exclude from score
  const score = [row.has_prediction, row.has_narrative, row.has_events, row.has_lineup, row.has_stats]
    .filter(Boolean).length;
  if (score === 5) return 'ready';
  if (score >= 2) return 'partial';
  return 'blocked';
}

function ReadinessBadge({ level }: { level: ReadinessLevel }) {
  if (level === 'ready')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> READY
      </span>
    );
  if (level === 'partial')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" /> PARTIAL
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> BLOCKED
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
  title,
  icon: Icon,
  count,
  alertCount,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  alertCount?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
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
            <span className="text-xs text-navy-400 bg-navy-800 border border-navy-700/60 px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
          {alertCount !== undefined && alertCount > 0 && (
            <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
              {alertCount} hata
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-navy-400" /> : <ChevronDown className="w-4 h-4 text-navy-400" />}
      </button>
      {open && <div className="border-t border-navy-700/60">{children}</div>}
    </div>
  );
}

// ─── Match Publishing Queue ───────────────────────────────────────────────────

type QueueFilter = 'today' | 'tomorrow' | 'upcoming' | 'missing_prediction' | 'all';

function MatchPublishingQueue() {
  const [rows, setRows] = useState<MatchReadinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QueueFilter>('today');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const threeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

    let fromDate = today;
    let toDate = today;
    if (filter === 'tomorrow') { fromDate = tomorrow; toDate = tomorrow; }
    else if (filter === 'upcoming') { fromDate = today; toDate = threeDays; }
    else if (filter === 'missing_prediction' || filter === 'all') { fromDate = today; toDate = threeDays; }

    const { data, error } = await supabase.rpc('admin_match_readiness', {
      p_from: fromDate,
      p_to: toDate,
    });

    if (error || !data) {
      // Fallback: raw query
      const { data: matches } = await supabase
        .from('matches')
        .select(`
          id, match_date, match_time, status_short,
          home_team:teams!home_team_id(name),
          away_team:teams!away_team_id(name),
          competition:competition_seasons!competition_season_id(competitions(name)),
          home_elo,
          away_elo
        `)
        .gte('match_date', fromDate)
        .lte('match_date', toDate)
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true })
        .limit(100);

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
          id: m.id as string,
          match_date: m.match_date as string,
          match_time: m.match_time as string | null,
          home_team: homeTeam?.name ?? '—',
          away_team: awayTeam?.name ?? '—',
          competition: csObj?.competitions?.name ?? '—',
          status_short: (m.status_short as string) ?? '',
          has_prediction: predSet.has(m.id as string),
          has_narrative: false,
          has_events: evtSet.has(m.id as string),
          has_lineup: lineupSet.has(m.id as string),
          has_stats: statsSet.has(m.id as string),
          has_elo: m.home_elo != null && m.away_elo != null,
        };
      });

      const filtered =
        filter === 'missing_prediction' ? built.filter((r) => !r.has_prediction) : built;
      setRows(filtered);
      setLoading(false);
      return;
    }

    const filtered =
      filter === 'missing_prediction'
        ? (data as MatchReadinessRow[]).filter((r) => !r.has_prediction)
        : (data as MatchReadinessRow[]);
    setRows(filtered);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filterButtons: { key: QueueFilter; label: string }[] = [
    { key: 'today', label: 'Bugün' },
    { key: 'tomorrow', label: 'Yarın' },
    { key: 'upcoming', label: '3 Gün' },
    { key: 'missing_prediction', label: 'Tahmin Yok' },
    { key: 'all', label: 'Tümü' },
  ];

  const readyCnt = rows.filter((r) => getReadiness(r) === 'ready').length;
  const partialCnt = rows.filter((r) => getReadiness(r) === 'partial').length;
  const blockedCnt = rows.filter((r) => getReadiness(r) === 'blocked').length;

  return (
    <Section
      title="Yayın Kuyruğu"
      icon={ListChecks}
      count={rows.length}
      alertCount={blockedCnt}
    >
      <div className="p-4 space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-navy-400 shrink-0" />
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === btn.key
                  ? 'bg-champagne/15 border-champagne/40 text-champagne'
                  : 'bg-navy-800/50 border-navy-700/50 text-navy-400 hover:text-white hover:border-navy-600'
              }`}
            >
              {btn.label}
            </button>
          ))}
          <button
            onClick={fetchData}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Hazır', count: readyCnt, color: 'text-emerald-400' },
            { label: 'Kısmi', count: partialCnt, color: 'text-amber-400' },
            { label: 'Eksik', count: blockedCnt, color: 'text-red-400' },
          ].map((s) => (
            <div key={s.label} className="bg-navy-800/50 border border-navy-700/40 rounded-lg px-4 py-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-xs text-navy-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Yükleniyor…</div>
        ) : rows.length === 0 ? (
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
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Anlatı</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Olaylar</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Kadro</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">İstat</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-navy-700/30 transition-colors hover:bg-navy-800/30 ${
                      i % 2 === 0 ? '' : 'bg-navy-800/20'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-xs text-navy-300 whitespace-nowrap">
                      {row.match_date}
                      {row.match_time && (
                        <span className="text-navy-500 ml-1">
                          {String(row.match_time).slice(0, 5)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-white font-medium whitespace-nowrap">
                      {row.home_team} <span className="text-navy-500">vs</span> {row.away_team}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-navy-400 whitespace-nowrap max-w-[120px] truncate">
                      {row.competition}
                    </td>
                    <td className="px-4 py-2.5 text-center"><StatusDot ok={row.has_prediction} /></td>
                    <td className="px-4 py-2.5 text-center"><StatusDot ok={row.has_narrative} /></td>
                    <td className="px-4 py-2.5 text-center"><StatusDot ok={row.has_events} /></td>
                    <td className="px-4 py-2.5 text-center"><StatusDot ok={row.has_lineup} /></td>
                    <td className="px-4 py-2.5 text-center"><StatusDot ok={row.has_stats} /></td>
                    <td className="px-4 py-2.5 text-center">
                      <ReadinessBadge level={getReadiness(row)} />
                    </td>
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

// ─── Data Freshness Monitor ───────────────────────────────────────────────────

type FreshnessRow = {
  label: string;
  lastRun: string | null;
  status: string;
  recordsFound: number | null;
  error: boolean;
};

function DataFreshnessMonitor() {
  const [rows, setRows] = useState<FreshnessRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: ingestions } = await supabase
      .from('ingestion_runs')
      .select('run_type, status, started_at, completed_at, records_found, error_log')
      .order('started_at', { ascending: false })
      .limit(200);

    if (!ingestions) { setLoading(false); return; }

    const byType = new Map<string, IngestRunRow>();
    for (const r of ingestions as IngestRunRow[]) {
      if (!byType.has(r.run_type)) byType.set(r.run_type, r);
    }

    const built: FreshnessRow[] = Array.from(byType.entries()).map(([type, run]) => ({
      label: type,
      lastRun: run.completed_at ?? run.started_at,
      status: run.status,
      recordsFound: run.records_found,
      error: run.status === 'failed' || run.status === 'error',
    }));

    setRows(built.sort((a, b) => (b.lastRun ?? '').localeCompare(a.lastRun ?? '')));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const staleCount = rows.filter((r) => {
    if (!r.lastRun) return true;
    const hours = (Date.now() - new Date(r.lastRun).getTime()) / 3600000;
    return hours > 24;
  }).length;

  const errorCount = rows.filter((r) => r.error).length;

  return (
    <Section
      title="Veri Tazeliği İzleme"
      icon={Database}
      count={rows.length}
      alertCount={errorCount + staleCount}
      defaultOpen={false}
    >
      <div className="p-4 space-y-3">
        <div className="flex justify-end">
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-navy-400">
            Henüz ingestion kaydı bulunamadı.
          </div>
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
                  const hoursAgo = row.lastRun
                    ? (Date.now() - new Date(row.lastRun).getTime()) / 3600000
                    : Infinity;
                  const stale = hoursAgo > 24;
                  return (
                    <tr
                      key={row.label}
                      className={`border-b border-navy-700/30 hover:bg-navy-800/30 transition-colors ${
                        i % 2 === 0 ? '' : 'bg-navy-800/20'
                      }`}
                    >
                      <td className="px-4 py-2.5 text-xs text-white font-mono">{row.label}</td>
                      <td className={`px-4 py-2.5 text-xs ${stale ? 'text-amber-400' : 'text-navy-300'}`}>
                        {formatRelative(row.lastRun)}
                        {stale && <span className="ml-1 text-amber-500/60">• bayat</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-navy-400">
                        {row.recordsFound ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <JobStatusBadge status={row.status} />
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

// ─── Failed Jobs / Error Center ───────────────────────────────────────────────

function FailedJobsCenter() {
  const [jobs, setJobs] = useState<JobRunRow[]>([]);
  const [ingestions, setIngestions] = useState<IngestRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [jobRes, ingestRes] = await Promise.all([
      supabase
        .from('job_runs')
        .select('id, job_name, status, error_message, started_at, completed_at')
        .in('status', ['failed', 'error'])
        .order('started_at', { ascending: false })
        .limit(50),
      supabase
        .from('ingestion_runs')
        .select('id, run_type, status, started_at, completed_at, records_found, error_log')
        .in('status', ['failed', 'error'])
        .order('started_at', { ascending: false })
        .limit(50),
    ]);
    setJobs((jobRes.data ?? []) as JobRunRow[]);
    setIngestions((ingestRes.data ?? []) as IngestRunRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalErrors = jobs.length + ingestions.length;
  const displayJobs = showAll ? jobs : jobs.slice(0, 5);
  const displayIngestions = showAll ? ingestions : ingestions.slice(0, 5);

  return (
    <Section
      title="Başarısız İşler / Hata Merkezi"
      icon={AlertTriangle}
      alertCount={totalErrors}
      defaultOpen={false}
    >
      <div className="p-4 space-y-4">
        <div className="flex justify-end">
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
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
                  {displayIngestions.map((r) => (
                    <div key={r.id} className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-red-300">{r.run_type}</span>
                        <span className="text-xs text-navy-500">{formatRelative(r.started_at)}</span>
                      </div>
                      {r.error_log && (
                        <p className="text-xs text-red-400/70 mt-1 font-mono truncate">
                          {JSON.stringify(r.error_log).slice(0, 120)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {displayJobs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-2">
                  Job Hataları ({jobs.length})
                </p>
                <div className="space-y-2">
                  {displayJobs.map((r) => (
                    <div key={r.id} className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-red-300">{r.job_name}</span>
                        <span className="text-xs text-navy-500">{formatRelative(r.started_at)}</span>
                      </div>
                      {r.error_message && (
                        <p className="text-xs text-red-400/70 mt-1 font-mono truncate">{r.error_message}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(jobs.length > 5 || ingestions.length > 5) && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="w-full text-xs text-navy-400 hover:text-white py-2 transition-colors"
              >
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
      .select(`
        id, match_date,
        home_team:teams!home_team_id(name),
        away_team:teams!away_team_id(name),
        competition:competition_seasons!competition_season_id(competitions(name)),
        home_elo,
        away_elo
      `)
      .gte('match_date', today)
      .lte('match_date', future)
      .order('match_date', { ascending: true })
      .limit(200);

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
          id: m.id as string,
          match_date: m.match_date as string,
          home_team: homeTeam?.name ?? '—',
          away_team: awayTeam?.name ?? '—',
          competition: csObj?.competitions?.name ?? '—',
          missing,
        });
      }
    }

    setGaps(gapRows);
    setLoading(false);
  }, [daysAhead]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <Section
      title="Kapsam Boşluğu Dedektörü"
      icon={Search}
      count={gaps.length}
      alertCount={gaps.filter((g) => g.missing.includes('Tahmin')).length}
      defaultOpen={false}
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-navy-400">Görünüm penceresi:</span>
          {[1, 3, 7].map((d) => (
            <button
              key={d}
              onClick={() => setDaysAhead(d)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                daysAhead === d
                  ? 'bg-champagne/15 border-champagne/40 text-champagne'
                  : 'bg-navy-800/50 border-navy-700/50 text-navy-400 hover:text-white'
              }`}
            >
              {d} gün
            </button>
          ))}
          <button
            onClick={fetchData}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Tara
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
                </tr>
              </thead>
              <tbody>
                {gaps.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-navy-700/30 hover:bg-navy-800/30 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-navy-800/20'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-xs text-navy-300 whitespace-nowrap">{row.match_date}</td>
                    <td className="px-4 py-2.5 text-xs text-white font-medium whitespace-nowrap">
                      {row.home_team} <span className="text-navy-500">vs</span> {row.away_team}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-navy-400 whitespace-nowrap max-w-[120px] truncate">
                      {row.competition}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {row.missing.map((m) => (
                          <span
                            key={m}
                            className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 px-1.5 py-0.5 rounded"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
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

// ─── Prediction Review Workflow ───────────────────────────────────────────────

type ReviewFilter = 'pending' | 'approved' | 'rejected' | 'all';

function PredictionReviewWorkflow() {
  const [items, setItems] = useState<ReviewQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReviewFilter>('pending');

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('review_queue')
      .select('id, entity_type, entity_id, status, review_note, created_at, reviewed_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'all') query = query.eq('status', filter);

    const { data } = await query;
    setItems((data ?? []) as ReviewQueueRow[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pendingCount = items.filter((r) => r.status === 'pending').length;

  return (
    <Section
      title="Tahmin İnceleme Kuyruğu"
      icon={Eye}
      count={items.length}
      alertCount={pendingCount}
      defaultOpen={false}
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {(['pending', 'approved', 'rejected', 'all'] as ReviewFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                filter === f
                  ? 'bg-champagne/15 border-champagne/40 text-champagne'
                  : 'bg-navy-800/50 border-navy-700/50 text-navy-400 hover:text-white'
              }`}
            >
              {f === 'pending' ? 'Bekleyen' : f === 'approved' ? 'Onaylı' : f === 'rejected' ? 'Reddedilen' : 'Tümü'}
            </button>
          ))}
          <button
            onClick={fetchData}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
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
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Varlık ID</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Durum</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Not</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Oluşturulma</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-navy-700/30 hover:bg-navy-800/30 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-navy-800/20'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-xs font-mono text-navy-300">{row.entity_type}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-navy-500 max-w-[120px] truncate">
                      {row.entity_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <JobStatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-navy-400 max-w-[200px] truncate">
                      {row.review_note ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-navy-500">
                      {formatRelative(row.created_at)}
                    </td>
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
  totalMatches: number;
  matchesWithPrediction: number;
  matchesWithElo: number;
  activeSubscriptions: number;
  pushSubscriptions: number;
  ingestRunsLast24h: number;
  failedRunsLast24h: number;
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
      totalMatches: matchRes.count ?? 0,
      matchesWithPrediction: predRes.count ?? 0,
      matchesWithElo: eloRes.count ?? 0,
      activeSubscriptions: subRes.count ?? 0,
      pushSubscriptions: pushRes.count ?? 0,
      ingestRunsLast24h: ingestRes.count ?? 0,
      failedRunsLast24h: failedRes.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const statCards = stats
    ? [
        { label: 'Yaklaşan Maçlar (7g)', value: stats.totalMatches, icon: ListChecks, alert: false },
        { label: 'Tahminli Maçlar', value: stats.matchesWithPrediction, icon: Zap, alert: false },
        { label: 'ELO Kapsanan', value: stats.matchesWithElo, icon: BarChart3, alert: false },
        { label: 'Aktif Abonelik', value: stats.activeSubscriptions, icon: Eye, alert: false },
        { label: 'Push Abonesi', value: stats.pushSubscriptions, icon: Activity, alert: false },
        { label: 'Ingest (24s)', value: stats.ingestRunsLast24h, icon: Database, alert: false },
        {
          label: 'Başarısız (24s)',
          value: stats.failedRunsLast24h,
          icon: AlertTriangle,
          alert: stats.failedRunsLast24h > 0,
        },
      ]
    : [];

  return (
    <Section title="Sistem Gözlemlenebilirliği" icon={Activity} defaultOpen={true}>
      <div className="p-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Yükleniyor…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statCards.map((card) => (
              <div
                key={card.label}
                className={`rounded-lg border px-4 py-3 ${
                  card.alert
                    ? 'bg-red-500/5 border-red-500/30'
                    : 'bg-navy-800/40 border-navy-700/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <card.icon className={`w-3.5 h-3.5 ${card.alert ? 'text-red-400' : 'text-navy-400'}`} />
                  <p className="text-xs text-navy-400 truncate">{card.label}</p>
                </div>
                <p className={`text-2xl font-bold ${card.alert ? 'text-red-400' : 'text-white'}`}>
                  {card.value.toLocaleString('tr-TR')}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperationsPage() {
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
      <MatchPublishingQueue />
      <CoverageGapDetector />
      <DataFreshnessMonitor />
      <FailedJobsCenter />
      <PredictionReviewWorkflow />

      <ProviderHealthCenter />
    </div>
  );
}

// ─── Provider Health Center ────────────────────────────────────────────────────

const PROVIDER_DEFS = [
  { key: 'af_fixtures',    label: 'AF Fixtures',        staleHours: 6 },
  { key: 'af_statistics',  label: 'AF Statistics',       staleHours: 12 },
  { key: 'af_lineups',     label: 'AF Lineups',          staleHours: 12 },
  { key: 'af_events',      label: 'AF Events',           staleHours: 12 },
  { key: 'af_uefa',        label: 'AF UEFA',             staleHours: 24 },
  { key: 'understat_xg',   label: 'Understat xG',        staleHours: 48 },
  { key: 'wc2026_import',  label: 'WC 2026 Import',      staleHours: 168 },
] as const;

type ProviderKey = typeof PROVIDER_DEFS[number]['key'];

type ProviderStatus = 'ok' | 'stale' | 'error' | 'no_data';

interface ProviderRow {
  key: ProviderKey;
  label: string;
  staleHours: number;
  lastRun: string | null;
  status: string;
  recordsInserted: number | null;
  providerStatus: ProviderStatus;
}

function getProviderStatus(row: { lastRun: string | null; status: string; staleHours: number }): ProviderStatus {
  if (!row.lastRun) return 'no_data';
  if (row.status === 'failed' || row.status === 'error') return 'error';
  const hoursAgo = (Date.now() - new Date(row.lastRun).getTime()) / 3600000;
  if (hoursAgo > row.staleHours) return 'stale';
  return 'ok';
}

function ProviderStatusBadge({ status }: { status: ProviderStatus }) {
  if (status === 'ok')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
        <Wifi className="w-3 h-3" /> Aktif
      </span>
    );
  if (status === 'stale')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" /> Bayat
      </span>
    );
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
        <WifiOff className="w-3 h-3" /> Hata
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-navy-700/50 text-navy-400 border border-navy-600/30 px-2 py-0.5 rounded-full">
      <Minus className="w-3 h-3" /> Veri Yok
    </span>
  );
}

function ProviderHealthCenter() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: ingestions } = await supabase
      .from('ingestion_runs')
      .select('run_type, status, started_at, completed_at, records_inserted')
      .order('started_at', { ascending: false })
      .limit(300);

    const byType = new Map<string, { status: string; lastRun: string | null; recordsInserted: number | null }>();
    for (const r of (ingestions ?? []) as { run_type: string; status: string; started_at: string; completed_at: string | null; records_inserted: number | null }[]) {
      if (!byType.has(r.run_type)) {
        byType.set(r.run_type, {
          status: r.status,
          lastRun: r.completed_at ?? r.started_at,
          recordsInserted: r.records_inserted,
        });
      }
    }

    const built: ProviderRow[] = PROVIDER_DEFS.map((def) => {
      const match = Array.from(byType.entries()).find(([k]) => k.includes(def.key));
      const run = match?.[1] ?? null;
      const providerStatus = getProviderStatus({
        lastRun: run?.lastRun ?? null,
        status: run?.status ?? '',
        staleHours: def.staleHours,
      });
      return {
        key: def.key,
        label: def.label,
        staleHours: def.staleHours,
        lastRun: run?.lastRun ?? null,
        status: run?.status ?? 'no_data',
        recordsInserted: run?.recordsInserted ?? null,
        providerStatus,
      };
    });

    setRows(built);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const alertCount = rows.filter((r) => r.providerStatus === 'error' || r.providerStatus === 'stale').length;

  return (
    <Section
      title="Provider Sağlık Merkezi"
      icon={ShieldAlert}
      count={rows.length}
      alertCount={alertCount}
      defaultOpen={false}
    >
      <div className="p-4 space-y-3">
        <div className="flex justify-end">
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded-lg border border-navy-700/50 bg-navy-800/50 text-navy-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-navy-400">Yükleniyor…</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-navy-700/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-700/40 bg-navy-800/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Provider</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Son Çalışma</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Eklenen</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-navy-400">Bayat Eşiği</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-navy-400">Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.key}
                    className={`border-b border-navy-700/30 hover:bg-navy-800/30 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-navy-800/20'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-xs font-medium text-white">{row.label}</td>
                    <td className={`px-4 py-2.5 text-xs ${row.providerStatus === 'stale' ? 'text-amber-400' : 'text-navy-300'}`}>
                      {formatRelative(row.lastRun)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-navy-400">
                      {row.recordsInserted ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-navy-500">
                      {row.staleHours < 24 ? `${row.staleHours}s` : `${row.staleHours / 24}g`}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <ProviderStatusBadge status={row.providerStatus} />
                    </td>
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


