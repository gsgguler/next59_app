import { useState, useEffect, useCallback } from 'react';
import {
  Send, Shield, RefreshCw, AlertCircle, CheckCircle,
  FileText, FlaskConical, Clock, Filter,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface QueueRow {
  match_id: string;
  match_date: string;
  competition_name: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  has_prediction: boolean;
  prediction_state: string | null;
  prediction_confidence: number | null;
  has_story: boolean;
  story_state: string | null;
  has_publication: boolean;
  publication_visible: boolean;
}

type FilterMode = 'all' | 'needs_prediction' | 'needs_story' | 'needs_review' | 'published';

const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'Tümü',
  needs_prediction: 'Tahmin Yok',
  needs_story: 'Hikaye Yok',
  needs_review: 'İnceleme Bekliyor',
  published: 'Yayınlandı',
};

const COMPETITION_OPTIONS = [
  'Tümü',
  'English Premier League',
  'English Championship',
  'German Bundesliga',
  'Spanish La Liga',
  'Italian Serie A',
  'French Ligue 1',
  'Turkish Super Lig',
];

export default function MatchPublishingQueuePage() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedComp, setSelectedComp] = useState<string>('Tümü');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params: Record<string, unknown> = {
      p_limit: 200,
      p_filter: filterMode !== 'all' ? filterMode : null,
    };
    if (selectedComp !== 'Tümü') params.p_competition = selectedComp;
    if (dateFrom) params.p_date_from = dateFrom;
    if (dateTo) params.p_date_to = dateTo;

    const { data, error: err } = await supabase.rpc('ml_admin_get_publishing_queue', params);

    if (err) setError(err.message);
    else setQueue((data as QueueRow[]) ?? []);
    setLoading(false);
  }, [filterMode, selectedComp, dateFrom, dateTo]);

  useEffect(() => {
    document.title = 'Publishing Queue | Admin | Next59';
    load();
  }, [load]);

  const filteredQueue = queue;

  const summary = {
    total: queue.length,
    hasPrediction: queue.filter(r => r.has_prediction).length,
    hasStory: queue.filter(r => r.has_story).length,
    published: queue.filter(r => r.has_publication && r.publication_visible).length,
    needsReview: queue.filter(r =>
      r.prediction_state === 'pending_review' || r.story_state === 'pending_review'
    ).length,
  };

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Admin warning */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Publishing Queue — Admin Only.</strong> Maç tahminleri ve hikayelerin yayın durumu.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Send className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Publishing Queue</h1>
              <p className="text-sm text-readable-muted mt-1">
                Maç bazında tahmin · hikaye · yayın durumu takibi
              </p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40 shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <SmallStat label="Toplam Maç" value={summary.total} />
          <SmallStat label="Tahmin Var" value={summary.hasPrediction} accent="blue" />
          <SmallStat label="Hikaye Var" value={summary.hasStory} accent="blue" />
          <SmallStat label="İnceleme Bekliyor" value={summary.needsReview} accent={summary.needsReview > 0 ? 'amber' : undefined} />
          <SmallStat label="Yayınlandı" value={summary.published} accent="green" />
        </div>

        {/* Filters */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-3.5 h-3.5 text-navy-400" />
            <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Filtreler</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {/* State filter */}
            <div className="flex items-center gap-1 flex-wrap">
              {(Object.keys(FILTER_LABELS) as FilterMode[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterMode(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    filterMode === f
                      ? 'bg-champagne/15 text-champagne border border-champagne/30'
                      : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
                  }`}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {/* Competition filter */}
              <select
                value={selectedComp}
                onChange={e => setSelectedComp(e.target.value)}
                className="appearance-none bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
              >
                {COMPETITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Date range */}
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                placeholder="Başlangıç"
              />
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                placeholder="Bitiş"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-4 text-xs text-red-400 font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Queue table */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800">
            <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Maç Listesi ({filteredQueue.length})
            </span>
          </div>

          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 bg-navy-800/40 rounded animate-pulse" />
              ))}
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="p-8 text-center text-sm text-readable-muted">
              Bu filtreyle maç bulunamadı.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Tarih</th>
                    <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Maç</th>
                    <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Lig</th>
                    <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Sonuç</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Tahmin</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Hikaye</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Yayın</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.map(row => (
                    <QueueTableRow key={row.match_id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueTableRow({ row }: { row: QueueRow }) {
  return (
    <tr className="border-b border-navy-800/40 hover:bg-navy-800/20 transition-colors">
      <td className="px-5 py-3 text-navy-300 tabular-nums whitespace-nowrap">
        {row.match_date?.slice(0, 10) ?? '–'}
      </td>
      <td className="px-3 py-3">
        <div className="text-white font-medium">
          {row.home_team} <span className="text-navy-500">vs</span> {row.away_team}
        </div>
      </td>
      <td className="px-3 py-3 text-navy-400 hidden md:table-cell whitespace-nowrap">
        {row.competition_name}
      </td>
      <td className="px-3 py-3 hidden sm:table-cell">
        {row.home_score != null
          ? <span className="font-mono text-champagne font-medium">{row.home_score}–{row.away_score}</span>
          : <span className="text-navy-600">–</span>
        }
      </td>
      <td className="px-3 py-3 text-center">
        <StatusDot
          present={row.has_prediction}
          state={row.prediction_state}
          icon={<FlaskConical className="w-3.5 h-3.5" />}
          label={row.prediction_confidence != null ? `${(row.prediction_confidence * 100).toFixed(0)}%` : undefined}
        />
      </td>
      <td className="px-3 py-3 text-center">
        <StatusDot
          present={row.has_story}
          state={row.story_state}
          icon={<FileText className="w-3.5 h-3.5" />}
        />
      </td>
      <td className="px-3 py-3 text-center">
        {row.has_publication
          ? row.publication_visible
            ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle className="w-3.5 h-3.5" />Yayında</span>
            : <span className="inline-flex items-center gap-1 text-navy-500"><Clock className="w-3.5 h-3.5" />Gizli</span>
          : <span className="text-navy-600">–</span>
        }
      </td>
    </tr>
  );
}

function StatusDot({
  present, state, icon, label,
}: {
  present: boolean;
  state: string | null;
  icon: React.ReactNode;
  label?: string;
}) {
  if (!present) return <span className="text-navy-600">–</span>;

  const colorMap: Record<string, string> = {
    draft_generated: 'text-navy-400',
    pending_review: 'text-amber-400',
    approved: 'text-emerald-400',
    rejected: 'text-red-400',
    published: 'text-blue-400',
    hidden: 'text-navy-500',
  };

  const color = state ? (colorMap[state] ?? 'text-navy-300') : 'text-navy-300';

  return (
    <span className={`inline-flex items-center gap-1 ${color}`}>
      {icon}
      {label && <span className="text-[11px] font-mono">{label}</span>}
      {state && <span className="text-[11px] hidden lg:inline">{state.replace(/_/g, ' ')}</span>}
    </span>
  );
}

function SmallStat({
  label, value, accent,
}: {
  label: string;
  value: number;
  accent?: 'green' | 'amber' | 'blue';
}) {
  const valueColor =
    accent === 'green' ? 'text-emerald-400' :
    accent === 'amber' ? 'text-amber-400' :
    accent === 'blue'  ? 'text-blue-400' :
    'text-white';

  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
    </div>
  );
}
