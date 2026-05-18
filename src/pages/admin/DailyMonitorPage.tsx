import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Brain,
  BarChart3,
  Shield,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Eye,
  Ban,
  Zap,
  Target,
  Info,
  Radio,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'blocked' | 'confidence' | 'brains' | 'reality' | 'calibration';
type DateFilter = 'today' | 'tomorrow' | 'week' | 'all';

interface ReadinessRow {
  match_id: string;
  competition_name: string;
  season_label: string;
  match_date: string;
  kickoff_utc: string | null;
  home_team_name: string;
  away_team_name: string;
  elo_readiness: boolean;
  feature_readiness: boolean;
  calibration_readiness: boolean;
  lineup_availability: boolean;
  stats_availability: boolean;
  prediction_readiness: boolean;
  scenario_readiness: boolean;
  feature_quality_tier: string | null;
  elo_home: number | null;
  elo_away: number | null;
  home_l5_available: number | null;
  away_l5_available: number | null;
  calibration_brier_l50: number | null;
  prediction_status: string | null;
  warnings: string[] | null;
  overall_status: string | null;
  blocking_reasons: string[] | null;
  assessed_at: string | null;
}

interface PredictionDraft {
  id: string;
  match_id: string;
  competition_name: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  match_date: string | null;
  p_home: number | null;
  p_draw: number | null;
  p_away: number | null;
  confidence_score: number | null;
  confidence_tier: string | null;
  feature_quality_tier: string | null;
  has_calibration_warning: boolean | null;
  has_data_warning: boolean | null;
  warnings: string[] | null;
  status: string | null;
  generated_at: string | null;
}

interface BrainRun {
  id: string;
  match_id: string;
  status: string;
  generated_at: string;
}

interface MasterBrainRow {
  id: string;
  brain_run_id: string;
  final_readiness: string | null;
  final_confidence: string | null;
  scenario_tone: string | null;
  publish_recommendation: string | null;
  master_summary: string | null;
  warnings_json: unknown;
  created_at: string;
}

interface BrainOutput {
  brain_name: string;
  brain_version: string | null;
  output_json: unknown;
  confidence_score: number | null;
  warning_level: string | null;
  created_at: string;
}

interface EvalRow {
  id: string;
  match_id: string;
  competition_name: string | null;
  actual_result: string | null;
  home_score_ft: number | null;
  away_score_ft: number | null;
  p_home: number | null;
  p_draw: number | null;
  p_away: number | null;
  brier_score: number | null;
  log_loss: number | null;
  was_correct: boolean | null;
  was_overconfident: boolean | null;
  evaluated_at: string | null;
}

interface CalibrationRow {
  id: string;
  competition_name: string;
  rolling_brier_l50: number | null;
  home_bias_l50: number | null;
  draw_bias_l50: number | null;
  away_bias_l50: number | null;
  current_home_correction: number | null;
  matches_evaluated: number | null;
  updated_at: string | null;
}

interface ResultSyncRun {
  id: string;
  triggered_at: string;
  started_at: string | null;
  completed_at: string | null;
  mode: string;
  status: string | null;
  matches_found: number | null;
  matches_seen: number | null;
  updated: number | null;
  matches_updated: number | null;
  errors_json: unknown;
  http_status: number | null;
  duration_ms: number | null;
}

interface LiveSyncHealth {
  liveMatchCount: number;
  staleMatchCount: number;
  latestLiveRun: ResultSyncRun | null;
  latestRecentRun: ResultSyncRun | null;
  failedRunsLast1h: number;
}

interface EvalHealth {
  total: number;
  false_confidence: number;
  correct: number;
  avg_brier: number | null;
  last_evaluated_at: string | null;
}

interface PipelineRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  horizon_days: number | null;
  fixtures_seen: number | null;
  readiness_processed: number | null;
  features_generated: number | null;
  predictions_generated: number | null;
  brain_packages_generated: number | null;
  scenarios_generated: number | null;
  story_drafts_generated: number | null;
  skipped_existing: number | null;
  blocked_count: number | null;
  error_count: number | null;
  errors_json: unknown;
}

interface EnrichmentSyncEntry {
  sync_type: string;
  latest_at: string | null;
  rows_inserted_today: number;
  rows_updated_today: number;
  errors_today: number;
  last_status: string | null;
}

interface EnrichmentHealth {
  standings: EnrichmentSyncEntry;
  injuries: EnrichmentSyncEntry;
  team_statistics: EnrichmentSyncEntry;
  venues: EnrichmentSyncEntry;
  coverageUpcoming: { standings: number; injuries: number; team_stats: number; venue: number; total: number };
}

interface LiveMatchStateRow {
  fixture_id: string;
  api_football_fixture_id: number | null;
  status_short: string | null;
  elapsed: number | null;
  home_score: number;
  away_score: number;
  current_live_state: string;
  state_confidence: string;
  momentum_direction: string;
  chaos_score: number | null;
  desperation_level: number | null;
  late_goal_pressure: number | null;
  comeback_pressure_score: number | null;
  live_pressure_index_home: number | null;
  live_pressure_index_away: number | null;
  data_completeness_score: number | null;
  stale_warning: boolean;
  computed_at: string;
  engine_version: string;
}

interface LiveEngineRun {
  started_at: string;
  completed_at: string | null;
  status: string;
  live_matches_found: number | null;
  fixtures_processed: number | null;
  fixtures_errored: number | null;
  states_classified: Record<string, number> | null;
  duration_ms: number | null;
}

interface LiveEngineHealth {
  liveStates: LiveMatchStateRow[];
  latestRun: LiveEngineRun | null;
  engineRunCount1h: number;
}

interface KPIs {
  upcoming: number;
  ready: number;
  partial: number;
  blocked: number;
  predictionsGenerated: number;
  brainPackages: number;
  publishSafe: number;
  reviewRequired: number;
  doNotPublish: number;
  lowConfidence: number;
  missingLineup: number;
  calibrationWarnings: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(base: string, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(s: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function pct(n: number | null) {
  if (n == null) return '—';
  return (n * 100).toFixed(1) + '%';
}

function num(n: number | null, d = 3) {
  if (n == null) return '—';
  return n.toFixed(d);
}

// ── Pipeline run card ──────────────────────────────────────────────────────────

function PipelineRunCard({ run }: { run: PipelineRun | null }) {
  const STALE_HOURS = 25;
  const isStale = !run || (() => {
    const h = (Date.now() - new Date(run.started_at).getTime()) / 36e5;
    return h > STALE_HOURS;
  })();

  const statusColor = !run
    ? 'text-navy-500'
    : run.status === 'completed'
    ? 'text-emerald-400'
    : run.status === 'running'
    ? 'text-sky-400'
    : 'text-red-400';

  const statusIcon = !run
    ? <Clock className="w-3.5 h-3.5 text-navy-500" />
    : run.status === 'completed'
    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
    : run.status === 'running'
    ? <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
    : <XCircle className="w-3.5 h-3.5 text-red-400" />;

  function elapsed(start: string, end: string | null) {
    const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  return (
    <div className="mb-6 bg-navy-800 border border-navy-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-sky-400" />
        <span className="text-sm font-semibold text-white">Pipeline Son Kosu</span>
        {isStale && (
          <span className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-amber-900/40 border border-amber-700/50 text-amber-300 text-xs rounded-full">
            <AlertTriangle className="w-3 h-3" />
            Gecikme — {STALE_HOURS}h+ once
          </span>
        )}
        {!isStale && run && (
          <span className="ml-auto text-xs text-navy-500">
            {new Date(run.started_at).toLocaleString('tr-TR')}
          </span>
        )}
      </div>

      {!run ? (
        <p className="text-xs text-navy-500">Hic pipeline kosu bulunamadi.</p>
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center gap-1.5">
            {statusIcon}
            <span className={`text-xs font-semibold uppercase ${statusColor}`}>{run.status}</span>
            {run.completed_at && (
              <span className="text-xs text-navy-500 ml-1">({elapsed(run.started_at, run.completed_at)})</span>
            )}
          </div>
          <Stat label="Gorulen" value={run.fixtures_seen} color="text-sky-400" />
          <Stat label="Tahmin" value={run.predictions_generated} color="text-emerald-400" />
          <Stat label="Brain" value={run.brain_packages_generated} color="text-sky-300" />
          <Stat label="Hikaye" value={run.story_drafts_generated} color="text-teal-400" />
          <Stat label="Atlandı" value={run.skipped_existing} color="text-navy-400" />
          <Stat label="Bloke" value={run.blocked_count} color="text-amber-400" />
          {(run.error_count ?? 0) > 0 && (
            <Stat label="Hata" value={run.error_count} color="text-red-400" />
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-navy-500">{label}:</span>
      <span className={`text-xs font-bold ${color}`}>{value ?? '—'}</span>
    </div>
  );
}

// ── Live sync health card ──────────────────────────────────────────────────────

function LiveSyncHealthCard({ health }: { health: LiveSyncHealth }) {
  const { liveMatchCount, staleMatchCount, latestLiveRun, latestRecentRun, failedRunsLast1h } = health;

  function sinceStr(ts: string | null | undefined): string {
    if (!ts) return '—';
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 60) return `${mins}dk once`;
    return `${Math.floor(mins / 60)}s ${mins % 60}dk once`;
  }

  function latencyColor(ms: number | null): string {
    if (ms == null) return 'text-navy-400';
    if (ms < 5000) return 'text-emerald-400';
    if (ms < 15000) return 'text-amber-400';
    return 'text-red-400';
  }

  const hasProblems = staleMatchCount > 0 || failedRunsLast1h > 0;

  return (
    <div className={`bg-navy-800 border rounded-xl p-4 mb-4 ${hasProblems ? 'border-amber-700/60' : 'border-navy-700'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-white">Live Sync Sagligi</span>
        {hasProblems && (
          <span className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-amber-900/40 border border-amber-700/50 text-amber-300 text-xs rounded-full">
            <AlertTriangle className="w-3 h-3" />
            Dikkat
          </span>
        )}
        {!hasProblems && (
          <span className="ml-auto flex items-center gap-1 text-emerald-400 text-xs">
            <CheckCircle className="w-3 h-3" /> Normal
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Live match count */}
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Canli Mac</div>
          <div className={`text-lg font-bold ${liveMatchCount > 0 ? 'text-sky-400' : 'text-navy-500'}`}>
            {liveMatchCount}
          </div>
        </div>

        {/* Stale warnings */}
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Gecikme Uyarisi</div>
          <div className={`text-lg font-bold ${staleMatchCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {staleMatchCount}
          </div>
        </div>

        {/* Failed runs last 1h */}
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Basarisiz (1s)</div>
          <div className={`text-lg font-bold ${failedRunsLast1h > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {failedRunsLast1h}
          </div>
        </div>

        {/* Latest live sync */}
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Son Live Sync</div>
          <div className="text-xs font-semibold text-navy-300 truncate">
            {sinceStr(latestLiveRun?.started_at ?? latestLiveRun?.triggered_at)}
          </div>
          {latestLiveRun && (
            <div className="text-[10px] text-navy-500 mt-0.5">
              {latestLiveRun.matches_updated ?? latestLiveRun.updated ?? 0} guncellendi
            </div>
          )}
        </div>

        {/* Latest recent sync */}
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Son Recent Sync</div>
          <div className="text-xs font-semibold text-navy-300 truncate">
            {sinceStr(latestRecentRun?.started_at ?? latestRecentRun?.triggered_at)}
          </div>
          {latestRecentRun && (
            <div className="text-[10px] text-navy-500 mt-0.5">
              {latestRecentRun.matches_updated ?? latestRecentRun.updated ?? 0} guncellendi
            </div>
          )}
        </div>

        {/* Live sync latency */}
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Latency (live)</div>
          <div className={`text-xs font-bold ${latencyColor(latestLiveRun?.duration_ms ?? null)}`}>
            {latestLiveRun?.duration_ms != null ? `${latestLiveRun.duration_ms}ms` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Result sync + eval health card ────────────────────────────────────────────

function ResultSyncEvalCard({
  syncRun,
  evalHealth,
}: {
  syncRun: ResultSyncRun | null;
  evalHealth: EvalHealth;
}) {
  const SYNC_STALE_MINS = 20;
  const syncStale = !syncRun || (() => {
    const mins = (Date.now() - new Date(syncRun.triggered_at).getTime()) / 60000;
    return mins > SYNC_STALE_MINS;
  })();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
      {/* Result sync health */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-semibold text-white">Sonuc Sync</span>
          {syncStale ? (
            <span className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-amber-900/40 border border-amber-700/50 text-amber-300 text-xs rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {syncRun ? `${Math.round((Date.now() - new Date(syncRun.triggered_at).getTime()) / 60000)}dk` : 'Hic kosulmadi'}
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1 text-emerald-400 text-xs">
              <CheckCircle className="w-3 h-3" /> Guncel
            </span>
          )}
        </div>
        {!syncRun ? (
          <p className="text-xs text-navy-500">Sync kaydi bulunamadi.</p>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-navy-500">Son kos:</span>
              <span className="text-xs font-bold text-navy-300">
                {new Date(syncRun.triggered_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <Stat label="Bulunan" value={syncRun.matches_found} color="text-sky-400" />
            <Stat label="Guncellenen" value={syncRun.updated} color="text-emerald-400" />
            {syncRun.http_status != null && syncRun.http_status >= 400 && (
              <Stat label="HTTP" value={syncRun.http_status} color="text-red-400" />
            )}
          </div>
        )}
      </div>

      {/* Evaluation health */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-white">Tahmin Degerlendirme</span>
          {evalHealth.false_confidence > 0 && (
            <span className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-red-900/40 border border-red-700/50 text-red-300 text-xs rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {evalHealth.false_confidence} yanlis guven
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          <Stat label="Toplam eval" value={evalHealth.total} color="text-sky-400" />
          <Stat label="Dogru" value={evalHealth.correct} color="text-emerald-400" />
          <Stat label="Yanlis guven" value={evalHealth.false_confidence} color={evalHealth.false_confidence > 0 ? 'text-red-400' : 'text-navy-400'} />
          {evalHealth.avg_brier != null && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-navy-500">Ort. Brier:</span>
              <span className={`text-xs font-bold ${evalHealth.avg_brier > 0.32 ? 'text-amber-400' : 'text-navy-300'}`}>
                {evalHealth.avg_brier.toFixed(4)}
              </span>
            </div>
          )}
          {evalHealth.last_evaluated_at && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-navy-500">Son eval:</span>
              <span className="text-xs text-navy-400">
                {new Date(evalHealth.last_evaluated_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
              </span>
            </div>
          )}
          {evalHealth.total === 0 && (
            <span className="text-xs text-navy-500">Bitmis mac yok — bekleniyor.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Enrichment health card ─────────────────────────────────────────────────────

function EnrichmentHealthCard({ health }: { health: EnrichmentHealth }) {
  const STALE_HOURS: Record<string, number> = {
    standings: 2, injuries: 5, team_statistics: 13, venues: 25,
  };

  function sinceStr(ts: string | null | undefined): string {
    if (!ts) return 'Hic';
    const h = (Date.now() - new Date(ts).getTime()) / 36e5;
    if (h < 1) return `${Math.round(h * 60)}dk once`;
    if (h < 24) return `${h.toFixed(1)}s once`;
    return `${Math.floor(h / 24)}g once`;
  }

  function pctFmt(n: number, total: number) {
    if (total === 0) return '—';
    return `${Math.round((n / total) * 100)}%`;
  }

  const types: { key: keyof Pick<EnrichmentHealth, 'standings' | 'injuries' | 'team_statistics' | 'venues'>; label: string }[] = [
    { key: 'standings', label: 'Puan Tab.' },
    { key: 'injuries', label: 'Sakatlıklar' },
    { key: 'team_statistics', label: 'Takım İstat.' },
    { key: 'venues', label: 'Venüler' },
  ];

  const hasErrors = types.some(t => (health[t.key].errors_today ?? 0) > 0);
  const anyStale = types.some(t => {
    const e = health[t.key];
    if (!e.latest_at) return true;
    const h = (Date.now() - new Date(e.latest_at).getTime()) / 36e5;
    return h > STALE_HOURS[t.key];
  });

  const cov = health.coverageUpcoming;

  return (
    <div className={`bg-navy-800 border rounded-xl p-4 mb-4 ${hasErrors || anyStale ? 'border-amber-700/60' : 'border-navy-700'}`}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-sky-400" />
        <span className="text-sm font-semibold text-white">Enrichment Sagligi</span>
        {(hasErrors || anyStale) && (
          <span className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-amber-900/40 border border-amber-700/50 text-amber-300 text-xs rounded-full">
            <AlertTriangle className="w-3 h-3" />
            Eksik Veri
          </span>
        )}
        {!hasErrors && !anyStale && (
          <span className="ml-auto flex items-center gap-1 text-emerald-400 text-xs">
            <CheckCircle className="w-3 h-3" /> Normal
          </span>
        )}
      </div>

      {/* Per-type rows */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {types.map(({ key, label }) => {
          const e = health[key];
          const stale = !e.latest_at || (Date.now() - new Date(e.latest_at).getTime()) / 36e5 > STALE_HOURS[key];
          const hasErr = (e.errors_today ?? 0) > 0;
          return (
            <div key={key} className={`bg-navy-900/50 rounded-lg p-2.5 ${hasErr ? 'ring-1 ring-red-700/50' : ''}`}>
              <div className="text-[10px] text-navy-500 uppercase mb-1">{label}</div>
              <div className={`text-xs font-semibold ${stale ? 'text-amber-400' : 'text-navy-300'}`}>
                {sinceStr(e.latest_at)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-navy-500">+{e.rows_inserted_today ?? 0} yeni</span>
                {(e.errors_today ?? 0) > 0 && (
                  <span className="text-[10px] text-red-400">{e.errors_today} hata</span>
                )}
                {e.last_status && (
                  <span className={`text-[10px] ${e.last_status === 'completed' ? 'text-emerald-500' : e.last_status === 'failed' ? 'text-red-400' : 'text-navy-500'}`}>
                    {e.last_status}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Coverage for upcoming fixtures */}
      {cov.total > 0 && (
        <div className="border-t border-navy-700/50 pt-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-2">Yaklasan Mac Enrichment Kapsami ({cov.total} mac)</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Stat label="Puan tab." value={null} color="text-sky-400" />
            <span className="text-xs text-sky-400 font-bold -ml-3">{pctFmt(cov.standings, cov.total)}</span>
            <Stat label="Sakatlık" value={null} color="text-amber-400" />
            <span className="text-xs text-amber-400 font-bold -ml-3">{pctFmt(cov.injuries, cov.total)}</span>
            <Stat label="Takım ist." value={null} color="text-teal-400" />
            <span className="text-xs text-teal-400 font-bold -ml-3">{pctFmt(cov.team_stats, cov.total)}</span>
            <Stat label="Venü" value={null} color="text-navy-300" />
            <span className="text-xs text-navy-300 font-bold -ml-3">{pctFmt(cov.venue, cov.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Live Engine card ──────────────────────────────────────────────────────────

const LIVE_STATE_COLORS: Record<string, string> = {
  balanced: 'text-navy-300',
  high_press_home: 'text-sky-400',
  high_press_away: 'text-sky-400',
  low_block_home: 'text-teal-400',
  low_block_away: 'text-teal-400',
  transition_heavy: 'text-amber-400',
  desperation_home: 'text-orange-400',
  desperation_away: 'text-orange-400',
  game_killed: 'text-emerald-400',
  chaos_phase: 'text-red-400',
  late_pressure_home: 'text-amber-400',
  late_pressure_away: 'text-amber-400',
  comeback_mode_home: 'text-rose-400',
  comeback_mode_away: 'text-rose-400',
};

function SignalBar({ val, color }: { val: number | null; color: string }) {
  const v = Math.round((val ?? 0) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-navy-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-[10px] text-navy-400 tabular-nums w-5">{v}</span>
    </div>
  );
}

function LiveEngineCard({ health }: { health: LiveEngineHealth }) {
  const { liveStates, latestRun, engineRunCount1h } = health;
  const hasStale = liveStates.some(s => s.stale_warning);
  const hasRunErrors = (latestRun?.fixtures_errored ?? 0) > 0;
  const hasProblems = hasStale || hasRunErrors;

  function sinceStr(ts: string | null | undefined) {
    if (!ts) return '—';
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 60) return `${mins}dk once`;
    return `${Math.floor(mins / 60)}s ${mins % 60}dk`;
  }

  const stateCount = latestRun?.states_classified ?? {};

  return (
    <div className={`bg-navy-800 border rounded-xl p-4 mb-4 ${hasProblems ? 'border-amber-700/60' : 'border-navy-700'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-red-400" />
        <span className="text-sm font-semibold text-white">Live Match Engine</span>
        <span className="text-[10px] text-navy-500 font-mono ml-1">v1 · deterministik</span>
        {hasProblems ? (
          <span className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-amber-900/40 border border-amber-700/50 text-amber-300 text-xs rounded-full">
            <AlertTriangle className="w-3 h-3" /> Dikkat
          </span>
        ) : liveStates.length > 0 ? (
          <span className="ml-auto flex items-center gap-1.5 text-red-400 text-xs">
            <span className="inline-block w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
            {liveStates.length} CANLI
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1 text-navy-500 text-xs">
            <Clock className="w-3 h-3" /> Mac yok
          </span>
        )}
      </div>

      {/* Engine run summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Son Kos</div>
          <div className="text-xs font-semibold text-navy-300">{sinceStr(latestRun?.started_at)}</div>
          {latestRun?.duration_ms != null && (
            <div className="text-[10px] text-navy-500">{latestRun.duration_ms}ms</div>
          )}
        </div>
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Islenen</div>
          <div className={`text-lg font-bold ${(latestRun?.fixtures_processed ?? 0) > 0 ? 'text-sky-400' : 'text-navy-500'}`}>
            {latestRun?.fixtures_processed ?? 0}
          </div>
        </div>
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Hata</div>
          <div className={`text-lg font-bold ${(latestRun?.fixtures_errored ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {latestRun?.fixtures_errored ?? 0}
          </div>
        </div>
        <div className="bg-navy-900/50 rounded-lg p-2.5">
          <div className="text-[10px] text-navy-500 uppercase mb-1">Kos (1s)</div>
          <div className={`text-lg font-bold ${engineRunCount1h >= 8 ? 'text-emerald-400' : engineRunCount1h > 0 ? 'text-amber-400' : 'text-red-400'}`}>
            {engineRunCount1h}
          </div>
        </div>
      </div>

      {/* State distribution from last run */}
      {Object.keys(stateCount).length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Object.entries(stateCount).map(([state, count]) => (
            <span key={state} className={`text-[10px] px-2 py-0.5 bg-navy-900/60 rounded-full font-medium ${LIVE_STATE_COLORS[state] ?? 'text-navy-300'}`}>
              {state.replace(/_/g, ' ')} ×{count}
            </span>
          ))}
        </div>
      )}

      {/* Per-match live state rows */}
      {liveStates.length > 0 && (
        <div className="border-t border-navy-700/50 pt-3">
          <div className="text-[10px] text-navy-500 uppercase mb-2">Canli Maclar</div>
          <div className="space-y-2">
            {liveStates.map(s => (
              <div key={s.fixture_id} className={`bg-navy-900/40 rounded-lg p-2.5 ${s.stale_warning ? 'ring-1 ring-amber-700/60' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-white tabular-nums">
                    {s.home_score} — {s.away_score}
                  </span>
                  <span className="text-[10px] text-navy-500">
                    {s.status_short}{s.elapsed != null ? ` ${s.elapsed}'` : ''}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 bg-navy-800 rounded ${LIVE_STATE_COLORS[s.current_live_state] ?? 'text-navy-300'}`}>
                    {s.current_live_state.replace(/_/g, ' ')}
                  </span>
                  <span className={`text-[10px] ml-auto ${s.state_confidence === 'high' ? 'text-emerald-400' : s.state_confidence === 'medium' ? 'text-amber-400' : 'text-navy-500'}`}>
                    {s.state_confidence}
                  </span>
                  {s.stale_warning && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                  <div>
                    <div className="text-[9px] text-navy-600 mb-0.5">Kaos</div>
                    <SignalBar val={s.chaos_score} color="bg-red-500" />
                  </div>
                  <div>
                    <div className="text-[9px] text-navy-600 mb-0.5">Caresize</div>
                    <SignalBar val={s.desperation_level} color="bg-orange-500" />
                  </div>
                  <div>
                    <div className="text-[9px] text-navy-600 mb-0.5">Gec Gol</div>
                    <SignalBar val={s.late_goal_pressure} color="bg-amber-500" />
                  </div>
                  <div>
                    <div className="text-[9px] text-navy-600 mb-0.5">Geri Donus</div>
                    <SignalBar val={s.comeback_pressure_score} color="bg-rose-500" />
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-4 text-[10px]">
                  <span className="text-navy-600">Momentum: <span className={`font-semibold ${s.momentum_direction === 'home' ? 'text-sky-400' : s.momentum_direction === 'away' ? 'text-teal-400' : s.momentum_direction === 'chaotic' ? 'text-red-400' : 'text-navy-400'}`}>{s.momentum_direction}</span></span>
                  <span className="text-navy-600">Veri: <span className={`font-semibold ${(s.data_completeness_score ?? 0) >= 0.8 ? 'text-emerald-400' : (s.data_completeness_score ?? 0) >= 0.4 ? 'text-amber-400' : 'text-navy-500'}`}>{Math.round((s.data_completeness_score ?? 0) * 100)}%</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {liveStates.length === 0 && !latestRun && (
        <p className="text-xs text-navy-500">Engine hic kosulmamis. Cron: */5 * * * *</p>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-navy-800 rounded-xl border border-navy-700 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-navy-400 uppercase tracking-wide">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-navy-500">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-navy-500 text-xs">—</span>;
  const map: Record<string, string> = {
    ready: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700',
    partial: 'bg-amber-900/50 text-amber-400 border border-amber-700',
    blocked: 'bg-red-900/50 text-red-400 border border-red-700',
    completed: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700',
    pending: 'bg-navy-700 text-navy-300 border border-navy-600',
    publish_safe: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700',
    review_required: 'bg-amber-900/50 text-amber-400 border border-amber-700',
    do_not_publish: 'bg-red-900/50 text-red-400 border border-red-700',
    high: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700',
    medium: 'bg-amber-900/50 text-amber-400 border border-amber-700',
    low: 'bg-red-900/50 text-red-400 border border-red-700',
    insufficient: 'bg-red-900/50 text-red-400 border border-red-700',
    none: 'bg-navy-700 text-navy-300 border border-navy-600',
    warning: 'bg-amber-900/50 text-amber-400 border border-amber-700',
    critical: 'bg-red-900/50 text-red-400 border border-red-700',
  };
  const cls = map[status] ?? 'bg-navy-700 text-navy-300 border border-navy-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function BoolCell({ v, label }: { v: boolean | null; label: string }) {
  if (v == null) return <span className="text-navy-500 text-xs">—</span>;
  return v ? (
    <span className="flex items-center gap-1 text-emerald-400 text-xs">
      <CheckCircle className="w-3.5 h-3.5" /> {label}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-red-400 text-xs">
      <XCircle className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {count != null && (
        <span className="bg-navy-700 text-navy-300 text-xs px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

function ExpandableJson({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(p => !p)}
        className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {label}
      </button>
      {open && (
        <pre className="mt-1 p-2 bg-navy-900 rounded text-[11px] text-navy-300 overflow-x-auto max-h-60 leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function DriftTag({ diff, threshold }: { diff: number; threshold: number }) {
  if (Math.abs(diff) > threshold) {
    return (
      <span className="flex items-center gap-1 text-amber-400 text-xs">
        <AlertTriangle className="w-3 h-3" /> drift
      </span>
    );
  }
  return <span className="text-emerald-400 text-xs">ok</span>;
}

// ── Action button ──────────────────────────────────────────────────────────────

function ActionBtn({
  label,
  icon: Icon,
  onClick,
  disabled,
  disabledReason,
  loading,
  variant,
}: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  variant?: 'default' | 'danger';
}) {
  const base =
    variant === 'danger'
      ? 'border-red-700 text-red-400 hover:bg-red-900/30'
      : 'border-navy-600 text-navy-300 hover:bg-navy-700 hover:text-white';
  return (
    <div className="relative group inline-block">
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
          ${disabled || loading ? 'opacity-40 cursor-not-allowed' : base}`}
      >
        {loading ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Icon className="w-3.5 h-3.5" />
        )}
        {label}
      </button>
      {disabled && disabledReason && (
        <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-navy-900 border border-navy-600 rounded text-xs text-navy-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
          {disabledReason}
        </div>
      )}
    </div>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────────

function OverviewTab({
  readiness,
  predictions,
  masterBrains,
  brainRunMap,
  kpis,
  pipelineRun,
  syncRun,
  evalHealth,
  liveSyncHealth,
  enrichmentHealth,
  liveEngineHealth,
  onAction,
  actionLoading,
}: {
  readiness: ReadinessRow[];
  predictions: PredictionDraft[];
  masterBrains: MasterBrainRow[];
  brainRunMap: Map<string, BrainRun>;
  kpis: KPIs;
  pipelineRun: PipelineRun | null;
  syncRun: ResultSyncRun | null;
  evalHealth: EvalHealth;
  liveSyncHealth: LiveSyncHealth;
  enrichmentHealth: EnrichmentHealth;
  liveEngineHealth: LiveEngineHealth;
  onAction: (action: string, matchId: string) => void;
  actionLoading: Record<string, string>;
}) {
  const predMap = new Map(predictions.map(p => [p.match_id, p]));
  const masterMap = new Map<string, MasterBrainRow>();
  for (const [mid, run] of brainRunMap) {
    const mb = masterBrains.find(m => m.brain_run_id === run.id);
    if (mb) masterMap.set(mid, mb);
  }

  return (
    <div className="space-y-8">
      {/* Pipeline run status */}
      <PipelineRunCard run={pipelineRun} />

      {/* Live sync health */}
      <LiveSyncHealthCard health={liveSyncHealth} />

      {/* Live engine V1 */}
      <LiveEngineCard health={liveEngineHealth} />

      {/* Result sync + eval health */}
      <ResultSyncEvalCard syncRun={syncRun} evalHealth={evalHealth} />

      {/* Enrichment health */}
      <EnrichmentHealthCard health={enrichmentHealth} />

      {/* KPI Grid */}
      <div>
        <SectionHeader title="KPI Ozeti" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <KpiCard label="Upcoming" value={kpis.upcoming} color="text-sky-400" icon={Clock} />
          <KpiCard label="Ready" value={kpis.ready} color="text-emerald-400" icon={CheckCircle} />
          <KpiCard label="Partial" value={kpis.partial} color="text-amber-400" icon={AlertTriangle} />
          <KpiCard label="Blocked" value={kpis.blocked} color="text-red-400" icon={XCircle} />
          <KpiCard label="Predictions" value={kpis.predictionsGenerated} color="text-sky-400" icon={Target} />
          <KpiCard label="Brain Packages" value={kpis.brainPackages} color="text-sky-300" icon={Brain} />
          <KpiCard label="Publish Safe" value={kpis.publishSafe} color="text-emerald-400" icon={Shield} />
          <KpiCard label="Review Required" value={kpis.reviewRequired} color="text-amber-400" icon={Eye} />
          <KpiCard label="Do Not Publish" value={kpis.doNotPublish} color="text-red-400" icon={Ban} />
          <KpiCard label="Low Confidence" value={kpis.lowConfidence} color="text-amber-400" icon={TrendingDown} />
          <KpiCard label="No Lineup" value={kpis.missingLineup} color="text-orange-400" icon={AlertTriangle} />
          <KpiCard label="Cal Warnings" value={kpis.calibrationWarnings} color="text-amber-400" icon={Activity} />
        </div>
      </div>

      {/* Match Table */}
      <div>
        <SectionHeader title="Mac Listesi" count={readiness.length} />
        <div className="overflow-x-auto rounded-xl border border-navy-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700 bg-navy-800">
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Mac</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Lig</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Tarih</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Durum</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Tahmin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Brain</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Yayın</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase tracking-wide">Islemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/50">
              {readiness.map(row => {
                const pred = predMap.get(row.match_id);
                const mb = masterMap.get(row.match_id);
                const run = brainRunMap.get(row.match_id);
                const isBlocked = row.overall_status === 'blocked';
                const loading = actionLoading[row.match_id];
                return (
                  <tr key={row.match_id} className="hover:bg-navy-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white text-sm">
                        {row.home_team_name} — {row.away_team_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-navy-400">{row.competition_name}</td>
                    <td className="px-4 py-3 text-xs text-navy-400">
                      <div>{fmtDate(row.match_date)}</div>
                      {row.kickoff_utc && <div className="text-navy-500">{fmtTime(row.kickoff_utc)}</div>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={row.overall_status} /></td>
                    <td className="px-4 py-3">
                      {pred ? (
                        <div className="text-xs space-y-0.5">
                          <div className="text-navy-300">
                            {pct(pred.p_home)} / {pct(pred.p_draw)} / {pct(pred.p_away)}
                          </div>
                          <StatusBadge status={pred.confidence_tier} />
                        </div>
                      ) : (
                        <span className="text-navy-500 text-xs">Yok</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {run ? (
                        <StatusBadge status={run.status} />
                      ) : (
                        <span className="text-navy-500 text-xs">Yok</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {mb ? (
                        <StatusBadge status={mb.publish_recommendation} />
                      ) : (
                        <span className="text-navy-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <ActionBtn
                          label="Readiness"
                          icon={RefreshCw}
                          loading={loading === 'readiness'}
                          onClick={() => onAction('readiness', row.match_id)}
                        />
                        <ActionBtn
                          label="Tahmin"
                          icon={Target}
                          loading={loading === 'prediction'}
                          disabled={isBlocked}
                          disabledReason={isBlocked ? (row.blocking_reasons?.[0] ?? 'Bloke') : undefined}
                          onClick={() => onAction('prediction', row.match_id)}
                        />
                        <ActionBtn
                          label="Brain"
                          icon={Brain}
                          loading={loading === 'brain'}
                          disabled={isBlocked}
                          disabledReason={isBlocked ? (row.blocking_reasons?.[0] ?? 'Bloke') : undefined}
                          onClick={() => onAction('brain', row.match_id)}
                        />
                        <ActionBtn
                          label="Senaryo"
                          icon={Zap}
                          loading={loading === 'scenario'}
                          disabled={isBlocked}
                          disabledReason={isBlocked ? (row.blocking_reasons?.[0] ?? 'Bloke') : undefined}
                          onClick={() => onAction('scenario', row.match_id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {readiness.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-navy-500 text-sm">
                    Secilen tarih araliginda mac bulunamadi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Blocked ───────────────────────────────────────────────────────────────

function BlockedTab({ readiness }: { readiness: ReadinessRow[] }) {
  const blocked = readiness.filter(
    r => r.overall_status === 'blocked' || r.overall_status === 'partial'
  );
  return (
    <div>
      <SectionHeader title="Bloke & Eksik Maclar" count={blocked.length} />
      {blocked.length === 0 && (
        <div className="text-navy-500 text-sm py-8 text-center">
          Bloke ya da eksik mac yok.
        </div>
      )}
      <div className="space-y-4">
        {blocked.map(row => (
          <div key={row.match_id} className="bg-navy-800 border border-navy-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="font-semibold text-white">
                  {row.home_team_name} — {row.away_team_name}
                </div>
                <div className="text-xs text-navy-400 mt-0.5">
                  {row.competition_name} · {fmtDate(row.match_date)}
                  {row.kickoff_utc && ` · ${fmtTime(row.kickoff_utc)}`}
                </div>
              </div>
              <StatusBadge status={row.overall_status} />
            </div>

            {/* Readiness checklist */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">ELO</div>
                <BoolCell v={row.elo_readiness} label="Hazir" />
              </div>
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">Feature</div>
                <BoolCell v={row.feature_readiness} label="Hazir" />
              </div>
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">Kalibrasyon</div>
                <BoolCell v={row.calibration_readiness} label="Hazir" />
              </div>
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">Kadro</div>
                <BoolCell v={row.lineup_availability} label="Mevcut" />
              </div>
              <div className="bg-navy-900/60 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-navy-500 uppercase mb-1">Istatistik</div>
                <BoolCell v={row.stats_availability} label="Mevcut" />
              </div>
            </div>

            {/* Blocking reasons */}
            {row.blocking_reasons && row.blocking_reasons.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-red-400 mb-1.5">Engelleme Nedenleri</div>
                <div className="flex flex-wrap gap-1.5">
                  {row.blocking_reasons.map((r, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-red-900/30 border border-red-700/50 text-red-300 text-xs rounded"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {row.warnings && row.warnings.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-amber-400 mb-1.5">Uyarilar</div>
                <div className="flex flex-wrap gap-1.5">
                  {row.warnings.map((w, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-amber-900/20 border border-amber-700/40 text-amber-300 text-xs rounded"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Extra info */}
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-navy-500">
              {row.feature_quality_tier && <span>Quality tier: <span className="text-navy-300">{row.feature_quality_tier}</span></span>}
              {row.home_l5_available != null && <span>Home L5: <span className="text-navy-300">{row.home_l5_available}</span></span>}
              {row.away_l5_available != null && <span>Away L5: <span className="text-navy-300">{row.away_l5_available}</span></span>}
              {row.calibration_brier_l50 != null && <span>Cal Brier: <span className="text-navy-300">{num(row.calibration_brier_l50)}</span></span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Low Confidence ────────────────────────────────────────────────────────

function ConfidenceTab({
  predictions,
  masterBrains,
  brainRunMap,
}: {
  predictions: PredictionDraft[];
  masterBrains: MasterBrainRow[];
  brainRunMap: Map<string, BrainRun>;
}) {
  const low = predictions.filter(
    p => p.confidence_tier === 'low' || p.confidence_tier === 'insufficient' || p.has_calibration_warning || p.has_data_warning
  );

  const masterMap = new Map<string, MasterBrainRow>();
  for (const [mid, run] of brainRunMap) {
    const mb = masterBrains.find(m => m.brain_run_id === run.id);
    if (mb) masterMap.set(mid, mb);
  }

  return (
    <div>
      <SectionHeader title="Dusuk Guven Tahminleri" count={low.length} />
      {low.length === 0 && (
        <div className="text-navy-500 text-sm py-8 text-center">Dusuk guvenli tahmin yok.</div>
      )}
      <div className="space-y-4">
        {low.map(pred => {
          const mb = masterMap.get(pred.match_id);
          return (
            <div key={pred.id} className="bg-navy-800 border border-navy-700 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="font-semibold text-white">
                    {pred.home_team_name ?? '?'} — {pred.away_team_name ?? '?'}
                  </div>
                  <div className="text-xs text-navy-400 mt-0.5">
                    {pred.competition_name} · {fmtDate(pred.match_date)}
                  </div>
                </div>
                <StatusBadge status={pred.confidence_tier} />
              </div>

              {/* Probability bar */}
              <div className="mb-4">
                <div className="flex gap-0 rounded-lg overflow-hidden h-6 text-xs font-medium">
                  <div
                    className="bg-emerald-800 text-emerald-100 flex items-center justify-center"
                    style={{ width: `${(pred.p_home ?? 0) * 100}%` }}
                  >
                    {pct(pred.p_home)}
                  </div>
                  <div
                    className="bg-navy-600 text-navy-200 flex items-center justify-center"
                    style={{ width: `${(pred.p_draw ?? 0) * 100}%` }}
                  >
                    {pct(pred.p_draw)}
                  </div>
                  <div
                    className="bg-sky-900 text-sky-200 flex items-center justify-center"
                    style={{ width: `${(pred.p_away ?? 0) * 100}%` }}
                  >
                    {pct(pred.p_away)}
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-navy-500 mt-0.5">
                  <span>Ev sahibi</span><span>Beraberlik</span><span>Deplasman</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div>
                  <div className="text-[10px] text-navy-500 uppercase">Guven Skoru</div>
                  <div className="text-sm font-semibold text-white">{num(pred.confidence_score, 2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-navy-500 uppercase">Feature Tier</div>
                  <div className="text-sm font-semibold text-white">{pred.feature_quality_tier ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-navy-500 uppercase">Senaryo Tonu</div>
                  <div className="text-sm font-semibold text-white">{mb?.scenario_tone ?? '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-navy-500 uppercase">Yayin Tavsiyesi</div>
                  <div className="mt-0.5"><StatusBadge status={mb?.publish_recommendation ?? null} /></div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {pred.has_calibration_warning && (
                  <span className="px-2 py-0.5 bg-amber-900/30 border border-amber-700/50 text-amber-300 text-xs rounded">
                    Kalibrasyon uyarisi
                  </span>
                )}
                {pred.has_data_warning && (
                  <span className="px-2 py-0.5 bg-orange-900/30 border border-orange-700/50 text-orange-300 text-xs rounded">
                    Veri uyarisi
                  </span>
                )}
                {pred.warnings?.map((w, i) => (
                  <span key={i} className="px-2 py-0.5 bg-navy-700 text-navy-300 text-xs rounded">{w}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: Brain Summary ─────────────────────────────────────────────────────────

function BrainsTab({
  readiness,
  brainRunMap,
  masterBrains,
}: {
  readiness: ReadinessRow[];
  brainRunMap: Map<string, BrainRun>;
  masterBrains: MasterBrainRow[];
}) {
  const [outputs, setOutputs] = useState<Map<string, BrainOutput[]>>(new Map());
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);

  async function loadBrainOutputs(runId: string) {
    if (outputs.has(runId)) return;
    setLoadingRunId(runId);
    const { data } = await supabase
      .schema('model_lab')
      .from('prematch_brain_outputs')
      .select('brain_name, brain_version, output_json, confidence_score, warning_level, created_at')
      .eq('brain_run_id', runId)
      .order('brain_name');
    setOutputs(prev => new Map(prev).set(runId, (data as BrainOutput[]) ?? []));
    setLoadingRunId(null);
  }

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(mid: string, runId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(mid)) { next.delete(mid); }
      else { next.add(mid); loadBrainOutputs(runId); }
      return next;
    });
  }

  const masterMap = new Map<string, MasterBrainRow>();
  for (const [mid, run] of brainRunMap) {
    const mb = masterBrains.find(m => m.brain_run_id === run.id);
    if (mb) masterMap.set(mid, mb);
  }

  const withRuns = readiness.filter(r => brainRunMap.has(r.match_id));

  return (
    <div>
      <SectionHeader title="Brain Paketleri" count={withRuns.length} />
      {withRuns.length === 0 && (
        <div className="text-navy-500 text-sm py-8 text-center">
          Brain paketi bulunan mac yok. Oncelikle readiness guncelle ve brain uret.
        </div>
      )}
      <div className="space-y-3">
        {withRuns.map(row => {
          const run = brainRunMap.get(row.match_id)!;
          const mb = masterMap.get(row.match_id);
          const isOpen = expanded.has(row.match_id);
          const brainList = outputs.get(run.id);

          return (
            <div key={row.match_id} className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
              {/* Header row */}
              <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-navy-750 transition-colors text-left"
                onClick={() => toggle(row.match_id, run.id)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-medium text-white text-sm">
                      {row.home_team_name} — {row.away_team_name}
                    </div>
                    <div className="text-xs text-navy-400">{row.competition_name} · {fmtDate(row.match_date)}</div>
                  </div>
                  {mb && (
                    <div className="flex items-center gap-2">
                      <StatusBadge status={mb.final_readiness} />
                      <StatusBadge status={mb.final_confidence} />
                      <StatusBadge status={mb.publish_recommendation} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-navy-400">
                  <span className="text-xs">{brainList ? `${brainList.length} brain` : ''}</span>
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t border-navy-700 px-5 pb-5 pt-4">
                  {loadingRunId === run.id && (
                    <div className="text-navy-500 text-sm py-4 text-center">Yukleniyor...</div>
                  )}

                  {/* Master Brain summary */}
                  {mb && (
                    <div className="mb-4 bg-navy-900/60 rounded-lg p-4">
                      <div className="text-xs font-semibold text-sky-400 uppercase mb-2">Master Brain</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                        <div>
                          <div className="text-[10px] text-navy-500">Hazirlik</div>
                          <StatusBadge status={mb.final_readiness} />
                        </div>
                        <div>
                          <div className="text-[10px] text-navy-500">Guven</div>
                          <StatusBadge status={mb.final_confidence} />
                        </div>
                        <div>
                          <div className="text-[10px] text-navy-500">Senaryo Tonu</div>
                          <div className="text-xs text-white">{mb.scenario_tone ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-navy-500">Yayın Tavsiyesi</div>
                          <StatusBadge status={mb.publish_recommendation} />
                        </div>
                      </div>
                      {mb.master_summary && (
                        <p className="text-xs text-navy-300 leading-relaxed">{mb.master_summary}</p>
                      )}
                      <ExpandableJson label="Uyarilar JSON" data={mb.warnings_json} />
                    </div>
                  )}

                  {/* Sub-brain outputs */}
                  {brainList && brainList.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {brainList.map(b => (
                        <div key={b.brain_name} className="bg-navy-900/60 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-white capitalize">
                              {b.brain_name.replace(/_/g, ' ')}
                            </div>
                            <StatusBadge status={b.warning_level} />
                          </div>
                          <div className="flex items-center gap-3 mb-1">
                            <div>
                              <div className="text-[10px] text-navy-500">Guven</div>
                              <div className="text-xs text-white">{num(b.confidence_score, 2)}</div>
                            </div>
                          </div>
                          <ExpandableJson label="output JSON" data={b.output_json} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: Prediction vs Reality ─────────────────────────────────────────────────

function RealityTab({ evals }: { evals: EvalRow[] }) {
  const falsConf = evals.filter(e => e.was_overconfident && !e.was_correct);

  return (
    <div className="space-y-8">
      {falsConf.length > 0 && (
        <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2 text-red-400 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" />
            Yanlis Guven Uyarisi — {falsConf.length} mac
          </div>
          <p className="text-xs text-red-300">
            Bu maclarda model yuksek guvenle yanlis tahmin yapmistir. Kalibrasyon gozden gecirilmeli.
          </p>
        </div>
      )}

      <div>
        <SectionHeader title="Tahmin vs Gercek (Son 50)" count={evals.length} />
        <div className="overflow-x-auto rounded-xl border border-navy-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700 bg-navy-800">
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Mac</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Lig</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Tahmin H/B/D</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Sonuc</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Dogru?</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Brier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">LogLoss</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Yanlis Guven</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/50">
              {evals.map(e => {
                const isFalse = e.was_overconfident && !e.was_correct;
                return (
                  <tr key={e.id} className={`hover:bg-navy-800/50 transition-colors ${isFalse ? 'bg-red-950/20' : ''}`}>
                    <td className="px-4 py-3 text-xs text-white">
                      {e.home_score_ft != null && e.away_score_ft != null
                        ? `${e.home_score_ft} – ${e.away_score_ft}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-navy-400">{e.competition_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-navy-300">
                      {pct(e.p_home)} / {pct(e.p_draw)} / {pct(e.p_away)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={e.actual_result} />
                    </td>
                    <td className="px-4 py-3">
                      {e.was_correct == null ? (
                        <span className="text-navy-500 text-xs">—</span>
                      ) : e.was_correct ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" /> Evet
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-400 text-xs">
                          <XCircle className="w-3.5 h-3.5" /> Hayir
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-navy-300">{num(e.brier_score)}</td>
                    <td className="px-4 py-3 text-xs text-navy-300">{num(e.log_loss)}</td>
                    <td className="px-4 py-3">
                      {isFalse ? (
                        <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> EVET
                        </span>
                      ) : (
                        <span className="text-navy-500 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {evals.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-navy-500 text-sm">
                    Degerlendirilen mac bulunamadi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Calibration Drift ─────────────────────────────────────────────────────

function CalibrationTab({ calibration }: { calibration: CalibrationRow[] }) {
  return (
    <div>
      <SectionHeader title="Kalibrasyon Drift Durumu" count={calibration.length} />
      <div className="overflow-x-auto rounded-xl border border-navy-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-700 bg-navy-800">
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Lig</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Brier L50</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Home Bias</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Draw Bias</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Away Bias</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Home Duzeltme</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Mac Sayisi</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Son Guncelleme</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-400 uppercase">Drift</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700/50">
            {calibration.map(row => {
              const brierWarn = (row.rolling_brier_l50 ?? 0) > 0.32;
              const homeWarn = Math.abs(row.home_bias_l50 ?? 0) > 0.08;
              const drawWarn = Math.abs(row.draw_bias_l50 ?? 0) > 0.05;
              const anyWarn = brierWarn || homeWarn || drawWarn;
              return (
                <tr key={row.id} className={`hover:bg-navy-800/50 transition-colors ${anyWarn ? 'bg-amber-950/10' : ''}`}>
                  <td className="px-4 py-3 font-medium text-white text-sm">{row.competition_name}</td>
                  <td className={`px-4 py-3 text-xs font-mono ${brierWarn ? 'text-amber-400 font-semibold' : 'text-navy-300'}`}>
                    {num(row.rolling_brier_l50)}
                    {brierWarn && <AlertTriangle className="inline w-3 h-3 ml-1" />}
                  </td>
                  <td className={`px-4 py-3 text-xs font-mono ${homeWarn ? 'text-amber-400 font-semibold' : 'text-navy-300'}`}>
                    {num(row.home_bias_l50)}
                    {homeWarn && <AlertTriangle className="inline w-3 h-3 ml-1" />}
                  </td>
                  <td className={`px-4 py-3 text-xs font-mono ${drawWarn ? 'text-amber-400 font-semibold' : 'text-navy-300'}`}>
                    {num(row.draw_bias_l50)}
                    {drawWarn && <AlertTriangle className="inline w-3 h-3 ml-1" />}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-navy-300">{num(row.away_bias_l50)}</td>
                  <td className="px-4 py-3 text-xs font-mono text-navy-300">{num(row.current_home_correction)}</td>
                  <td className="px-4 py-3 text-xs text-navy-400">{row.matches_evaluated ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-navy-500">{fmtDate(row.updated_at)}</td>
                  <td className="px-4 py-3">
                    {anyWarn ? (
                      <span className="flex items-center gap-1 text-amber-400 text-xs font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" /> UYARI
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle className="w-3.5 h-3.5" /> Temiz
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {calibration.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-navy-500 text-sm">
                  Kalibrasyon verisi bulunamadi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drift thresholds legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-navy-500">
        <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-amber-400" /> Brier L50 &gt; 0.32</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-amber-400" /> |Home Bias| &gt; 0.08</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-amber-400" /> |Draw Bias| &gt; 0.05</span>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Genel Bakis', icon: LayoutDashboardIcon },
  { id: 'blocked', label: 'Bloke & Eksik', icon: XCircle },
  { id: 'confidence', label: 'Dusuk Guven', icon: TrendingDown },
  { id: 'brains', label: 'Brain Ozeti', icon: Brain },
  { id: 'reality', label: 'Tahmin vs Gercek', icon: Target },
  { id: 'calibration', label: 'Kalibrasyon Drift', icon: BarChart3 },
];

function LayoutDashboardIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

export default function DailyMonitorPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [dateFilter, setDateFilter] = useState<DateFilter>('week');

  const [readiness, setReadiness] = useState<ReadinessRow[]>([]);
  const [predictions, setPredictions] = useState<PredictionDraft[]>([]);
  const [brainRunMap, setBrainRunMap] = useState<Map<string, BrainRun>>(new Map());
  const [masterBrains, setMasterBrains] = useState<MasterBrainRow[]>([]);
  const [evals, setEvals] = useState<EvalRow[]>([]);
  const [calibration, setCalibration] = useState<CalibrationRow[]>([]);
  const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
  const [syncRun, setSyncRun] = useState<ResultSyncRun | null>(null);
  const [liveSyncHealth, setLiveSyncHealth] = useState<LiveSyncHealth>({
    liveMatchCount: 0, staleMatchCount: 0,
    latestLiveRun: null, latestRecentRun: null, failedRunsLast1h: 0,
  });
  const [evalHealth, setEvalHealth] = useState<EvalHealth>({
    total: 0, false_confidence: 0, correct: 0, avg_brier: null, last_evaluated_at: null,
  });

  const emptyEnrichEntry = (): EnrichmentSyncEntry => ({
    sync_type: '', latest_at: null, rows_inserted_today: 0, rows_updated_today: 0, errors_today: 0, last_status: null,
  });
  const [enrichmentHealth, setEnrichmentHealth] = useState<EnrichmentHealth>({
    standings: emptyEnrichEntry(),
    injuries: emptyEnrichEntry(),
    team_statistics: emptyEnrichEntry(),
    venues: emptyEnrichEntry(),
    coverageUpcoming: { standings: 0, injuries: 0, team_stats: 0, venue: 0, total: 0 },
  });

  const [liveEngineHealth, setLiveEngineHealth] = useState<LiveEngineHealth>({
    liveStates: [],
    latestRun: null,
    engineRunCount1h: 0,
  });

  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Date window — null means no date filter (show all)
  const dateRange = useCallback((): { start: string | null; end: string | null } => {
    const today = todayStr();
    if (dateFilter === 'today') return { start: today, end: today };
    if (dateFilter === 'tomorrow') {
      const t = addDays(today, 1);
      return { start: t, end: t };
    }
    if (dateFilter === 'all') return { start: null, end: null };
    // 'week': ±30 days so existing test/historical rows are always visible
    return { start: addDays(today, -30), end: addDays(today, 30) };
  }, [dateFilter]);

  const [queryErrors, setQueryErrors] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setQueryErrors([]);
    const errors: string[] = [];
    const { start, end } = dateRange();

    // 1. Readiness — apply date filter only when not 'all'
    let rdQuery = supabase
      .schema('model_lab')
      .from('upcoming_match_readiness')
      .select('*')
      .order('match_date', { ascending: true });
    if (start) rdQuery = rdQuery.gte('match_date', start);
    if (end) rdQuery = rdQuery.lte('match_date', end);

    const { data: rdData, error: rdErr } = await rdQuery;
    if (rdErr) {
      console.error('[DailyMonitor] upcoming_match_readiness:', rdErr);
      errors.push(`readiness: ${rdErr.message}`);
    }
    const rdRows = (rdData as ReadinessRow[]) ?? [];
    setReadiness(rdRows);

    const matchIds = rdRows.map(r => r.match_id);

    // 2. Predictions (latest per match)
    let predRows: PredictionDraft[] = [];
    if (matchIds.length > 0) {
      const { data: pData, error: pErr } = await supabase
        .schema('model_lab')
        .from('prematch_prediction_drafts')
        .select(
          'id, match_id, competition_name, home_team_name, away_team_name, match_date, p_home, p_draw, p_away, confidence_score, confidence_tier, feature_quality_tier, has_calibration_warning, has_data_warning, warnings, status, generated_at'
        )
        .in('match_id', matchIds)
        .order('generated_at', { ascending: false });
      if (pErr) {
        console.error('[DailyMonitor] prematch_prediction_drafts:', pErr);
        errors.push(`predictions: ${pErr.message}`);
      }
      // Dedup by match_id — keep latest
      const seen = new Set<string>();
      for (const p of (pData as PredictionDraft[]) ?? []) {
        if (!seen.has(p.match_id)) { predRows.push(p); seen.add(p.match_id); }
      }
    }
    setPredictions(predRows);

    // 3. Brain runs (latest completed per match)
    const runMap = new Map<string, BrainRun>();
    if (matchIds.length > 0) {
      const { data: runData, error: runErr } = await supabase
        .schema('model_lab')
        .from('prematch_brain_runs')
        .select('id, match_id, status, generated_at')
        .in('match_id', matchIds)
        .eq('status', 'completed')
        .order('generated_at', { ascending: false });
      if (runErr) {
        console.error('[DailyMonitor] prematch_brain_runs:', runErr);
        errors.push(`brain_runs: ${runErr.message}`);
      }
      for (const r of (runData as BrainRun[]) ?? []) {
        if (!runMap.has(r.match_id)) runMap.set(r.match_id, r);
      }
    }
    setBrainRunMap(runMap);

    // 4. Master brain outputs for those run IDs
    const runIds = Array.from(runMap.values()).map(r => r.id);
    let mbRows: MasterBrainRow[] = [];
    if (runIds.length > 0) {
      const { data: mbData, error: mbErr } = await supabase
        .schema('model_lab')
        .from('prematch_master_brain_outputs')
        .select('*')
        .in('brain_run_id', runIds);
      if (mbErr) {
        console.error('[DailyMonitor] prematch_master_brain_outputs:', mbErr);
        errors.push(`master_brains: ${mbErr.message}`);
      }
      mbRows = (mbData as MasterBrainRow[]) ?? [];
    }
    setMasterBrains(mbRows);

    // 5. Evaluations (last 50)
    const { data: evalData, error: evalErr } = await supabase
      .schema('model_lab')
      .from('replay_match_evaluations')
      .select(
        'id, match_id, competition_name, actual_result, home_score_ft, away_score_ft, p_home, p_draw, p_away, brier_score, log_loss, was_correct, was_overconfident, evaluated_at'
      )
      .order('evaluated_at', { ascending: false })
      .limit(50);
    if (evalErr) {
      console.error('[DailyMonitor] replay_match_evaluations:', evalErr);
      errors.push(`evaluations: ${evalErr.message}`);
    }
    setEvals((evalData as EvalRow[]) ?? []);

    // 6. Calibration state
    const { data: calData, error: calErr } = await supabase
      .schema('model_lab')
      .from('league_calibration_state')
      .select(
        'id, competition_name, rolling_brier_l50, home_bias_l50, draw_bias_l50, away_bias_l50, current_home_correction, matches_evaluated, updated_at'
      )
      .order('competition_name');
    if (calErr) {
      console.error('[DailyMonitor] league_calibration_state:', calErr);
      errors.push(`calibration: ${calErr.message}`);
    }
    setCalibration((calData as CalibrationRow[]) ?? []);

    // 7. Latest pipeline run
    const { data: prData, error: prErr } = await supabase
      .schema('model_lab')
      .from('prematch_pipeline_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prErr) {
      console.error('[DailyMonitor] prematch_pipeline_runs:', prErr);
      errors.push(`pipeline_run: ${prErr.message}`);
    }
    setPipelineRun((prData as PipelineRun) ?? null);

    // 8+9. Live sync health — last live + recent run, stale warnings, live match count
    const oneHourAgo = new Date(Date.now() - 36e5).toISOString();
    const [liveRunRes, recentRunRes, staleRes, failedRes, liveMatchRes] = await Promise.allSettled([
      supabase.schema('model_lab').from('result_sync_runs')
        .select('*').eq('mode', 'live').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.schema('model_lab').from('result_sync_runs')
        .select('*').eq('mode', 'recent').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.schema('model_lab').from('live_match_stale_warnings')
        .select('id', { count: 'exact', head: true }).eq('resolved', false),
      supabase.schema('model_lab').from('result_sync_runs')
        .select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('started_at', oneHourAgo),
      supabase.from('matches')
        .select('id', { count: 'exact', head: true })
        .in('status_short', ['1H','HT','2H','ET','BT','P','SUSP','INT','LIVE']),
    ]);
    setLiveSyncHealth({
      liveMatchCount: liveMatchRes.status === 'fulfilled' ? (liveMatchRes.value.count ?? 0) : 0,
      staleMatchCount: staleRes.status === 'fulfilled' ? (staleRes.value.count ?? 0) : 0,
      latestLiveRun: liveRunRes.status === 'fulfilled' ? ((liveRunRes.value.data as ResultSyncRun) ?? null) : null,
      latestRecentRun: recentRunRes.status === 'fulfilled' ? ((recentRunRes.value.data as ResultSyncRun) ?? null) : null,
      failedRunsLast1h: failedRes.status === 'fulfilled' ? (failedRes.value.count ?? 0) : 0,
    });
    // Keep syncRun pointing to whichever is newest overall
    const lrData = liveRunRes.status === 'fulfilled' ? (liveRunRes.value.data as ResultSyncRun | null) : null;
    const rrData = recentRunRes.status === 'fulfilled' ? (recentRunRes.value.data as ResultSyncRun | null) : null;
    const newestRun = (!lrData && !rrData) ? null
      : !lrData ? rrData
      : !rrData ? lrData
      : new Date(lrData.started_at ?? lrData.triggered_at) > new Date(rrData.started_at ?? rrData.triggered_at)
        ? lrData : rrData;
    setSyncRun(newestRun);

    // 10. Evaluation health summary
    const { data: ehData, error: ehErr } = await supabase
      .schema('model_lab')
      .from('prediction_evaluations')
      .select('was_correct, false_confidence, brier_score, evaluated_at');
    if (ehErr) {
      console.error('[DailyMonitor] prediction_evaluations:', ehErr);
      errors.push(`eval_health: ${ehErr.message}`);
    }
    const ehRows = (ehData as { was_correct: boolean; false_confidence: boolean; brier_score: number | null; evaluated_at: string }[]) ?? [];
    const briersValid = ehRows.map(r => r.brier_score).filter((b): b is number => b != null);
    setEvalHealth({
      total: ehRows.length,
      false_confidence: ehRows.filter(r => r.false_confidence).length,
      correct: ehRows.filter(r => r.was_correct).length,
      avg_brier: briersValid.length > 0 ? briersValid.reduce((a, b) => a + b, 0) / briersValid.length : null,
      last_evaluated_at: ehRows.length > 0
        ? ehRows.sort((a, b) => new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime())[0].evaluated_at
        : null,
    });

    // 11. Enrichment health — per-type sync log summary + upcoming coverage
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const [standingsLogRes, injuriesLogRes, teamStatsLogRes, venuesLogRes] = await Promise.allSettled([
        supabase.schema('model_lab').from('enrichment_sync_log')
          .select('sync_type, started_at, status, rows_inserted, rows_updated, errors_json')
          .eq('sync_type', 'standings').order('started_at', { ascending: false }).limit(10),
        supabase.schema('model_lab').from('enrichment_sync_log')
          .select('sync_type, started_at, status, rows_inserted, rows_updated, errors_json')
          .eq('sync_type', 'injuries').order('started_at', { ascending: false }).limit(10),
        supabase.schema('model_lab').from('enrichment_sync_log')
          .select('sync_type, started_at, status, rows_inserted, rows_updated, errors_json')
          .eq('sync_type', 'team_statistics').order('started_at', { ascending: false }).limit(10),
        supabase.schema('model_lab').from('enrichment_sync_log')
          .select('sync_type, started_at, status, rows_inserted, rows_updated, errors_json')
          .eq('sync_type', 'venues').order('started_at', { ascending: false }).limit(10),
      ]);

      function summarize(res: PromiseSettledResult<{ data: any; error: any }>): EnrichmentSyncEntry {
        if (res.status === 'rejected' || !res.value.data?.length) return emptyEnrichEntry();
        const rows = res.value.data as Array<{
          sync_type: string; started_at: string; status: string;
          rows_inserted: number; rows_updated: number; errors_json: unknown;
        }>;
        const latest = rows[0];
        const todayRows = rows.filter(r => r.started_at?.startsWith(todayIso));
        const errorsToday = todayRows.reduce((acc, r) => {
          const arr = Array.isArray(r.errors_json) ? r.errors_json : [];
          return acc + arr.length;
        }, 0);
        return {
          sync_type: latest.sync_type,
          latest_at: latest.started_at,
          rows_inserted_today: todayRows.reduce((a, r) => a + (r.rows_inserted ?? 0), 0),
          rows_updated_today: todayRows.reduce((a, r) => a + (r.rows_updated ?? 0), 0),
          errors_today: errorsToday,
          last_status: latest.status,
        };
      }

      const stHealth = summarize(standingsLogRes);
      const injHealth = summarize(injuriesLogRes);
      const tsHealth = summarize(teamStatsLogRes);
      const venHealth = summarize(venuesLogRes);

      // Coverage: count upcoming matches that have enrichment data
      const { start: upStart, end: upEnd } = dateRange();
      const { data: covRows } = await supabase
        .schema('model_lab')
        .from('prematch_upcoming_feature_snapshots')
        .select('match_id, has_standings_features, has_injuries_features, has_team_stats_features, has_venue_features')
        .gte('match_date', upStart ?? todayIso)
        .lte('match_date', upEnd ?? addDays(todayIso, 30));

      const covTotal = covRows?.length ?? 0;
      setEnrichmentHealth({
        standings: stHealth,
        injuries: injHealth,
        team_statistics: tsHealth,
        venues: venHealth,
        coverageUpcoming: {
          total: covTotal,
          standings: covRows?.filter((r: any) => r.has_standings_features).length ?? 0,
          injuries: covRows?.filter((r: any) => r.has_injuries_features).length ?? 0,
          team_stats: covRows?.filter((r: any) => r.has_team_stats_features).length ?? 0,
          venue: covRows?.filter((r: any) => r.has_venue_features).length ?? 0,
        },
      });
    } catch (enrichErr) {
      console.warn('[DailyMonitor] enrichment_health:', enrichErr);
    }

    // 12. Live Engine health
    try {
      const oneHourAgo = new Date(Date.now() - 36e5).toISOString();
      const [liveStatesRes, engineRunRes, engineRunCountRes] = await Promise.allSettled([
        supabase.rpc('admin_get_live_match_states'),
        supabase.schema('model_lab').from('live_engine_runs')
          .select('started_at, completed_at, status, live_matches_found, fixtures_processed, fixtures_errored, states_classified, duration_ms')
          .order('started_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.schema('model_lab').from('live_engine_runs')
          .select('id', { count: 'exact', head: true })
          .gte('started_at', oneHourAgo),
      ]);
      setLiveEngineHealth({
        liveStates: liveStatesRes.status === 'fulfilled' && !liveStatesRes.value.error
          ? ((liveStatesRes.value.data as LiveMatchStateRow[]) ?? [])
          : [],
        latestRun: engineRunRes.status === 'fulfilled'
          ? (engineRunRes.value.data as LiveEngineRun | null) ?? null
          : null,
        engineRunCount1h: engineRunCountRes.status === 'fulfilled'
          ? (engineRunCountRes.value.count ?? 0)
          : 0,
      });
    } catch (liveEngineErr) {
      console.warn('[DailyMonitor] live_engine_health:', liveEngineErr);
    }

    setQueryErrors(errors);
    setLastRefresh(new Date());
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── KPI computation ──
  const kpis: KPIs = {
    upcoming: readiness.length,
    ready: readiness.filter(r => r.overall_status === 'ready').length,
    partial: readiness.filter(r => r.overall_status === 'partial').length,
    blocked: readiness.filter(r => r.overall_status === 'blocked').length,
    predictionsGenerated: predictions.length,
    brainPackages: brainRunMap.size,
    publishSafe: masterBrains.filter(m => m.publish_recommendation === 'publish_safe').length,
    reviewRequired: masterBrains.filter(m => m.publish_recommendation === 'review_required').length,
    doNotPublish: masterBrains.filter(m => m.publish_recommendation === 'do_not_publish').length,
    lowConfidence: predictions.filter(p => p.confidence_tier === 'low' || p.confidence_tier === 'insufficient').length,
    missingLineup: readiness.filter(r => !r.lineup_availability).length,
    calibrationWarnings: calibration.filter(c =>
      (c.rolling_brier_l50 ?? 0) > 0.32 ||
      Math.abs(c.home_bias_l50 ?? 0) > 0.08 ||
      Math.abs(c.draw_bias_l50 ?? 0) > 0.05
    ).length,
  };

  // ── Actions ──
  async function handleAction(action: string, matchId: string) {
    setActionLoading(prev => ({ ...prev, [matchId]: action }));
    setActionMsg(null);
    try {
      let rpcName = '';
      const params: Record<string, unknown> = { p_match_id: matchId };
      if (action === 'readiness') {
        rpcName = 'ml_assess_upcoming_match_readiness';
      } else if (action === 'prediction') {
        rpcName = 'ml_generate_prematch_prediction';
        params.p_triggered_by = 'admin_daily_monitor';
      } else if (action === 'brain') {
        rpcName = 'ml_generate_prematch_brain_package';
        params.p_triggered_by = 'admin_daily_monitor';
      } else if (action === 'scenario') {
        rpcName = 'ml_generate_full_prematch_package';
        params.p_triggered_by = 'admin_daily_monitor';
      }
      if (!rpcName) return;
      const { error } = await supabase.rpc(rpcName, params);
      if (error) {
        setActionMsg({ text: `Hata (${action}): ${error.message}`, ok: false });
      } else {
        setActionMsg({ text: `${action} islemi tamamlandi. Sayfa yenileniyor...`, ok: true });
        await loadData();
      }
    } catch (err) {
      setActionMsg({ text: `Beklenmeyen hata: ${String(err)}`, ok: false });
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[matchId]; return n; });
    }
  }

  return (
    <div className="min-h-screen bg-navy-900">
      {/* Internal ops banner */}
      <div className="bg-amber-950/60 border-b border-amber-800/50 px-6 py-2.5">
        <div className="flex items-center gap-2 text-amber-300 text-xs">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold">DAHILI OPERASYON MODU</span>
          <span className="text-amber-500">—</span>
          <span>Bu sayfa sadece admin kullanimine yoneliktir. Otomatik yayın devre disidir.</span>
        </div>
      </div>

      <div className="px-6 py-6 max-w-screen-2xl mx-auto">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Gunluk Izleme Paneli</h1>
            <div className="text-xs text-navy-400 mt-0.5">
              {lastRefresh
                ? `Son guncelleme: ${lastRefresh.toLocaleTimeString('tr-TR')}`
                : 'Yukleniyor...'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Date filter */}
            <div className="flex rounded-lg border border-navy-700 overflow-hidden text-xs">
              {(
                [
                  { id: 'today', label: 'Bugun' },
                  { id: 'tomorrow', label: 'Yarin' },
                  { id: 'week', label: '±30 Gun' },
                  { id: 'all', label: 'Tum' },
                ] as { id: DateFilter; label: string }[]
              ).map(f => (
                <button
                  key={f.id}
                  onClick={() => setDateFilter(f.id)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    dateFilter === f.id
                      ? 'bg-sky-700 text-white'
                      : 'text-navy-400 hover:text-white hover:bg-navy-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-navy-600 text-navy-300 hover:bg-navy-700 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>

        {/* Query errors banner */}
        {queryErrors.length > 0 && (
          <div className="mb-4 px-4 py-3 rounded-lg border bg-red-950/40 border-red-700/50 text-red-300 text-sm">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Sorgu hatalari — PostgREST erisim sorunu olabilir
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              {queryErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* Action message */}
        {actionMsg && (
          <div
            className={`mb-4 px-4 py-3 rounded-lg border text-sm flex items-center gap-2 ${
              actionMsg.ok
                ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                : 'bg-red-950/40 border-red-700/50 text-red-300'
            }`}
          >
            {actionMsg.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {actionMsg.text}
            <button onClick={() => setActionMsg(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">
              Kapat
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 mb-6 border-b border-navy-700 overflow-x-auto pb-px">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  tab === t.id
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-navy-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {/* Badge counts */}
                {t.id === 'blocked' && kpis.blocked > 0 && (
                  <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{kpis.blocked}</span>
                )}
                {t.id === 'confidence' && kpis.lowConfidence > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{kpis.lowConfidence}</span>
                )}
                {t.id === 'calibration' && kpis.calibrationWarnings > 0 && (
                  <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{kpis.calibrationWarnings}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-navy-400">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="text-sm">Veriler yukleniyor...</span>
            </div>
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <OverviewTab
                readiness={readiness}
                predictions={predictions}
                masterBrains={masterBrains}
                brainRunMap={brainRunMap}
                kpis={kpis}
                pipelineRun={pipelineRun}
                syncRun={syncRun}
                evalHealth={evalHealth}
                liveSyncHealth={liveSyncHealth}
                enrichmentHealth={enrichmentHealth}
                liveEngineHealth={liveEngineHealth}
                onAction={handleAction}
                actionLoading={actionLoading}
              />
            )}
            {tab === 'blocked' && <BlockedTab readiness={readiness} />}
            {tab === 'confidence' && (
              <ConfidenceTab
                predictions={predictions}
                masterBrains={masterBrains}
                brainRunMap={brainRunMap}
              />
            )}
            {tab === 'brains' && (
              <BrainsTab
                readiness={readiness}
                brainRunMap={brainRunMap}
                masterBrains={masterBrains}
              />
            )}
            {tab === 'reality' && <RealityTab evals={evals} />}
            {tab === 'calibration' && <CalibrationTab calibration={calibration} />}
          </>
        )}

        {/* Publish Safety Ratio footer */}
        {!loading && (masterBrains.length > 0) && (
          <div className="mt-8 bg-navy-800 border border-navy-700 rounded-xl p-4 flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-xs text-navy-400 uppercase tracking-wide mb-1">Yayin Guvenlik Orani</div>
              <div className="text-lg font-bold text-white">
                {((kpis.publishSafe / masterBrains.length) * 100).toFixed(0)}%
                <span className="text-xs text-navy-400 font-normal ml-1">
                  ({kpis.publishSafe} / {masterBrains.length})
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-navy-400 uppercase tracking-wide mb-1">Inceleme Gerektiren</div>
              <div className="text-lg font-bold text-amber-400">
                {((kpis.reviewRequired / masterBrains.length) * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-navy-400 uppercase tracking-wide mb-1">Yayinlama</div>
              <div className="text-xs text-red-400 font-semibold flex items-center gap-1.5 mt-1">
                <Ban className="w-3.5 h-3.5" />
                Otomatik yayın devre disi. Manuel onay gereklidir.
              </div>
            </div>
            {evals.length > 0 && (
              <div>
                <div className="text-xs text-navy-400 uppercase tracking-wide mb-1">Yanlis Guven (Son 50)</div>
                <div className="text-lg font-bold text-red-400">
                  {evals.filter(e => e.was_overconfident && !e.was_correct).length}
                  <span className="text-xs text-navy-400 font-normal ml-1">mac</span>
                </div>
              </div>
            )}
            <div className="ml-auto flex items-center">
              <span className="flex items-center gap-1.5 text-xs text-navy-500">
                <Info className="w-3.5 h-3.5" />
                Veri kaynagi: model_lab schema, depolanan tablolar
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}