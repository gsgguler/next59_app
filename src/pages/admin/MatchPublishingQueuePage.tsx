import { useState, useEffect, useCallback } from 'react';
import {
  Send, Shield, RefreshCw, AlertCircle, CheckCircle2,
  FileText, BarChart2, Clock, Filter, XCircle, AlertTriangle,
  Ban, Eye, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  prediction_draft_id: string | null;
  has_story: boolean;
  story_state: string | null;
  story_draft_id: string | null;
  story_has_content: boolean;
  has_publication: boolean;
  publication_visible: boolean;
  publication_id: string | null;
}

type FilterMode = 'all' | 'needs_prediction' | 'needs_story' | 'needs_review' | 'ready_to_publish' | 'published';

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<FilterMode, string> = {
  all:               'Tümü',
  needs_prediction:  'Eksik Tahmin',
  needs_story:       'Eksik Senaryo',
  needs_review:      'İnceleme Bekliyor',
  ready_to_publish:  'Yayına Hazır',
  published:         'Yayınlandı',
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

const PRED_STATUS_LABELS: Record<string, string> = {
  pending_review:    'İnceleme Bekliyor',
  approved_internal: 'İç Onay',
  rejected:          'Reddedildi',
  published:         'Yayınlandı',
  hidden:            'Gizlendi',
};

const STORY_STATUS_LABELS: Record<string, string> = {
  draft_generated:   'Taslak',
  pending_review:    'İnceleme Bekliyor',
  approved_internal: 'İç Onay',
  rejected:          'Reddedildi',
  published:         'Yayınlandı',
};

// Derive blockers for a row — returns array of human-readable reasons
function getBlockers(row: QueueRow): string[] {
  const blockers: string[] = [];
  if (row.has_publication) {
    blockers.push('Zaten yayınlandı — tekrar yayınlanamaz');
    return blockers;
  }
  if (!row.has_prediction) blockers.push('Eksik Tahmin — tahmin taslağı yok');
  if (row.has_prediction && row.prediction_state === 'rejected') blockers.push('Tahmin reddedildi');
  if (row.has_prediction && row.prediction_state === 'pending_review') blockers.push('Tahmin henüz incelenmedi');
  if (!row.has_story) blockers.push('Eksik Senaryo — hikaye taslağı yok');
  if (row.has_story && !row.story_has_content) blockers.push('Senaryo içeriği boş');
  if (row.has_story && row.story_state === 'rejected') blockers.push('Senaryo reddedildi');
  if (row.has_story && row.story_state === 'pending_review') blockers.push('Senaryo henüz incelenmedi');
  if (row.has_story && row.story_state === 'draft_generated') blockers.push('Senaryo onaylanmamış (taslak)');
  return blockers;
}

function isReadyToPublish(row: QueueRow): boolean {
  return (
    !row.has_publication &&
    row.has_prediction &&
    row.prediction_state !== 'rejected' &&
    row.prediction_state !== 'pending_review' &&
    row.has_story &&
    row.story_has_content &&
    row.story_state === 'approved_internal' &&
    !!row.story_draft_id
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MatchPublishingQueuePage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedComp, setSelectedComp] = useState('Tümü');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [publishing, setPublishing] = useState<string | null>(null);
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
  const [publishSuccess, setPublishSuccess] = useState<Record<string, string>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<string | null>(null);

  const setPublishError = (id: string, msg: string) => {
    setPublishErrors(prev => ({ ...prev, [id]: msg }));
    setTimeout(() => setPublishErrors(prev => { const n = { ...prev }; delete n[id]; return n; }), 8000);
  };

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
    document.title = 'Yayın Kuyruğu | Admin | Next59';
    load();
  }, [load]);

  const publishStory = async (row: QueueRow) => {
    if (!row.story_draft_id || !user?.id) return;
    setPublishing(row.match_id);
    setConfirmRow(null);

    const { data, error: err } = await supabase.rpc('ml_admin_publish_story', {
      p_story_draft_id: row.story_draft_id,
      p_published_by:   user.id,
    });

    if (err) {
      setPublishError(row.match_id, err.message);
    } else {
      const result = data as { success: boolean; error?: string; publication_id?: string };
      if (!result.success) {
        setPublishError(row.match_id, result.error ?? 'Yayın başarısız');
      } else {
        setPublishSuccess(prev => ({ ...prev, [row.match_id]: result.publication_id ?? 'ok' }));
        await load();
      }
    }
    setPublishing(null);
  };

  const summary = {
    total:           queue.length,
    hasPrediction:   queue.filter(r => r.has_prediction).length,
    hasStory:        queue.filter(r => r.has_story).length,
    readyToPublish:  queue.filter(r => isReadyToPublish(r)).length,
    needsReview:     queue.filter(r => r.prediction_state === 'pending_review' || r.story_state === 'pending_review').length,
    published:       queue.filter(r => r.has_publication && r.publication_visible).length,
  };

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Safety banner */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Yayın Kuyruğu — Yalnızca Admin.</strong>{' '}
            Yayın işlemi geri alınamaz. Yalnızca onaylı senaryo + bağlı tahmin olan maçlar yayınlanabilir.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Send className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Yayın Kuyruğu</h1>
              <p className="text-sm text-readable-muted mt-1">
                Tahmin · Senaryo · Yayın durumu — Blokaj kontrolü · Onaylı yayın akışı
              </p>
            </div>
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40 shrink-0">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          <SmallStat label="Toplam"           value={summary.total} />
          <SmallStat label="Tahmin Var"       value={summary.hasPrediction}  accent="blue" />
          <SmallStat label="Senaryo Var"      value={summary.hasStory}       accent="blue" />
          <SmallStat label="İnceleme Bekliyor" value={summary.needsReview}   accent={summary.needsReview > 0 ? 'amber' : undefined} />
          <SmallStat label="Yayına Hazır"     value={summary.readyToPublish} accent={summary.readyToPublish > 0 ? 'green' : undefined} />
          <SmallStat label="Yayınlandı"       value={summary.published}      accent="green" />
        </div>

        {/* Filters */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-3.5 h-3.5 text-navy-400" />
            <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Filtreler</span>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-1 flex-wrap">
              {(Object.keys(FILTER_LABELS) as FilterMode[]).map(f => (
                <button key={f} onClick={() => setFilterMode(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    filterMode === f
                      ? 'bg-champagne/15 text-champagne border-champagne/30'
                      : 'bg-navy-800 text-navy-400 border-navy-700 hover:text-white'
                  }`}
                >
                  {FILTER_LABELS[f]}
                  {f === 'ready_to_publish' && summary.readyToPublish > 0 && (
                    <span className="ml-1.5 text-[10px] text-emerald-400">{summary.readyToPublish}</span>
                  )}
                  {f === 'needs_review' && summary.needsReview > 0 && (
                    <span className="ml-1.5 text-[10px] text-amber-400">{summary.needsReview}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <select value={selectedComp} onChange={e => setSelectedComp(e.target.value)}
                className="appearance-none bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
                {COMPETITION_OPTIONS.map(c => <option key={c}>{c}</option>)}
              </select>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none" />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none" />
            </div>
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        {/* Queue table */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Yayın Kuyruğu ({queue.length})
            </span>
            <span className="text-[11px] text-navy-600">Satıra tıkla → blokaj detayı</span>
          </div>

          {loading ? (
            <LoadingSkeleton rows={8} />
          ) : queue.length === 0 ? (
            <EmptyState filter={filterMode} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-navy-800">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Maç</th>
                    <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden md:table-cell">Lig / Tarih</th>
                    <th className="text-left px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider hidden sm:table-cell">Sonuç</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Tahmin</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Senaryo</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Yayın</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-navy-400 uppercase tracking-wider">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map(row => (
                    <QueueRow
                      key={row.match_id}
                      row={row}
                      expanded={expandedRow === row.match_id}
                      onToggle={() => setExpandedRow(expandedRow === row.match_id ? null : row.match_id)}
                      publishing={publishing === row.match_id}
                      publishError={publishErrors[row.match_id] ?? null}
                      publishSuccess={!!publishSuccess[row.match_id]}
                      confirmPending={confirmRow === row.match_id}
                      onRequestConfirm={() => setConfirmRow(row.match_id)}
                      onCancelConfirm={() => setConfirmRow(null)}
                      onPublish={() => publishStory(row)}
                    />
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

// ─── Queue Row ────────────────────────────────────────────────────────────────

function QueueRow({
  row, expanded, onToggle, publishing, publishError, publishSuccess,
  confirmPending, onRequestConfirm, onCancelConfirm, onPublish,
}: {
  row: QueueRow;
  expanded: boolean;
  onToggle: () => void;
  publishing: boolean;
  publishError: string | null;
  publishSuccess: boolean;
  confirmPending: boolean;
  onRequestConfirm: () => void;
  onCancelConfirm: () => void;
  onPublish: () => void;
}) {
  const blockers = getBlockers(row);
  const ready = isReadyToPublish(row);
  const hasBlockers = blockers.length > 0;

  return (
    <>
      <tr
        className={`border-b border-navy-800/40 transition-colors cursor-pointer ${
          row.has_publication ? 'hover:bg-emerald-900/5' :
          hasBlockers ? 'hover:bg-red-900/5' :
          ready ? 'hover:bg-emerald-900/5' : 'hover:bg-navy-800/15'
        }`}
        onClick={onToggle}
      >
        {/* Match */}
        <td className="px-5 py-3">
          <div className="text-white font-medium">
            {row.home_team} <span className="text-navy-500">vs</span> {row.away_team}
          </div>
          {hasBlockers && !row.has_publication && (
            <div className="flex items-center gap-1 mt-0.5">
              <Ban className="w-2.5 h-2.5 text-red-400" />
              <span className="text-[10px] text-red-400">Yayın Blokajı ({blockers.length})</span>
            </div>
          )}
        </td>

        {/* Lig / Tarih */}
        <td className="px-3 py-3 hidden md:table-cell">
          <div className="text-navy-400">{row.competition_name}</div>
          <div className="text-navy-600 tabular-nums text-[11px]">{row.match_date?.slice(0, 10)}</div>
        </td>

        {/* Sonuç */}
        <td className="px-3 py-3 hidden sm:table-cell">
          {row.home_score != null
            ? <span className="font-mono text-champagne font-medium">{row.home_score}–{row.away_score}</span>
            : <span className="text-navy-600">–</span>
          }
        </td>

        {/* Tahmin */}
        <td className="px-3 py-3 text-center">
          <PredictionCell row={row} />
        </td>

        {/* Senaryo */}
        <td className="px-3 py-3 text-center">
          <StoryCell row={row} />
        </td>

        {/* Yayın */}
        <td className="px-3 py-3 text-center">
          <PublicationCell row={row} />
        </td>

        {/* İşlem */}
        <td className="px-5 py-3 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 justify-end flex-wrap">

            {/* Already published */}
            {row.has_publication && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />Yayınlandı
              </span>
            )}

            {/* Blockers — no publish button */}
            {!row.has_publication && hasBlockers && (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                <Ban className="w-3 h-3" />Yayın Blokajı
              </span>
            )}

            {/* Ready — confirm flow */}
            {!row.has_publication && ready && !confirmPending && (
              <button
                onClick={onRequestConfirm}
                disabled={publishing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-40"
              >
                <Send className="w-3 h-3" />Yayınla
              </button>
            )}

            {/* Confirm step — irreversible warning */}
            {!row.has_publication && ready && confirmPending && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-amber-400 font-medium">Geri alınamaz —</span>
                <button
                  onClick={onPublish}
                  disabled={publishing}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 transition-all disabled:opacity-40"
                >
                  {publishing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Onayla
                </button>
                <button onClick={onCancelConfirm}
                  className="px-2 py-1 rounded-lg text-[11px] border bg-navy-800 border-navy-700 text-navy-400 hover:text-white transition-all">
                  İptal
                </button>
              </div>
            )}

            {/* Expand toggle */}
            <button onClick={onToggle} className="p-1 text-navy-500 hover:text-white transition-colors">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Publish error */}
          {publishError && (
            <div className="mt-1.5 flex items-start gap-1 text-[10px] text-red-400 text-right justify-end max-w-[240px] ml-auto">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="font-mono">{publishError}</span>
            </div>
          )}
          {publishSuccess && (
            <div className="mt-1 text-[10px] text-emerald-400 text-right">Yayın başarıyla oluşturuldu.</div>
          )}
        </td>
      </tr>

      {/* Expanded blocker + detail row */}
      {expanded && (
        <tr className="border-b border-navy-800/40 bg-navy-900/20">
          <td colSpan={7} className="px-5 py-4">
            <ExpandedDetail row={row} blockers={blockers} ready={ready} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Expanded Detail ──────────────────────────────────────────────────────────

function ExpandedDetail({ row, blockers, ready }: {
  row: QueueRow;
  blockers: string[];
  ready: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

      {/* Yayın Durumu */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Yayın Durumu</div>
        {row.has_publication ? (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-semibold">Yayınlandı</span>
            {row.publication_visible && <span className="text-[10px] text-emerald-500">· Görünür</span>}
          </div>
        ) : ready ? (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />Yayına Hazır
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-red-400 text-xs">
            <Ban className="w-3.5 h-3.5" />Yayına Hazır Değil
          </div>
        )}

        {/* Blockers list */}
        {blockers.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-[11px] font-semibold text-red-400 mb-1">Yayın Blokajı</div>
            {blockers.map((b, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-300">
                <XCircle className="w-3 h-3 shrink-0 mt-0.5" />{b}
              </div>
            ))}
          </div>
        )}

        {ready && (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-400">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            Yayın işlemi geri alınamaz uyarısı onaylandıktan sonra gerçekleşir.
          </div>
        )}
      </div>

      {/* Tahmin detayı */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart2 className="w-3.5 h-3.5 text-navy-400" />
          <span className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Tahmin</span>
        </div>
        {!row.has_prediction ? (
          <div className="flex items-center gap-1.5 text-[11px] text-red-400">
            <XCircle className="w-3.5 h-3.5" />Eksik Tahmin — tahmin taslağı yok
          </div>
        ) : (
          <div className="space-y-1">
            <DetailRow label="Durum" value={PRED_STATUS_LABELS[row.prediction_state ?? ''] ?? (row.prediction_state ?? '–')} />
            {row.prediction_confidence != null && (
              <DetailRow label="Güven" value={`${(row.prediction_confidence * 100).toFixed(0)}%`} />
            )}
            <DetailRow label="ID" value={row.prediction_draft_id ? row.prediction_draft_id.slice(0, 8) + '…' : '–'} />
            {(row.prediction_state === 'pending_review') && (
              <div className="flex items-center gap-1 text-[10px] text-amber-400 pt-1">
                <AlertTriangle className="w-3 h-3" />Tahmin onaylı değil
              </div>
            )}
          </div>
        )}
      </div>

      {/* Senaryo detayı */}
      <div className="bg-navy-800/40 rounded-lg p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <FileText className="w-3.5 h-3.5 text-navy-400" />
          <span className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Senaryo</span>
        </div>
        {!row.has_story ? (
          <div className="flex items-center gap-1.5 text-[11px] text-red-400">
            <XCircle className="w-3.5 h-3.5" />Eksik Senaryo — hikaye taslağı yok
          </div>
        ) : (
          <div className="space-y-1">
            <DetailRow label="Durum" value={STORY_STATUS_LABELS[row.story_state ?? ''] ?? (row.story_state ?? '–')} />
            <DetailRow label="İçerik" value={row.story_has_content ? 'Mevcut' : 'Boş'} />
            <DetailRow label="ID" value={row.story_draft_id ? row.story_draft_id.slice(0, 8) + '…' : '–'} />
            {!row.story_has_content && (
              <div className="flex items-center gap-1 text-[10px] text-red-400 pt-1">
                <AlertTriangle className="w-3 h-3" />Senaryo içeriği boş — yayınlanamaz
              </div>
            )}
            {row.story_state !== 'approved_internal' && row.story_state !== 'published' && row.has_story && (
              <div className="flex items-center gap-1 text-[10px] text-amber-400 pt-1">
                <AlertTriangle className="w-3 h-3" />Senaryo onaylı değil
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cell Components ──────────────────────────────────────────────────────────

function PredictionCell({ row }: { row: QueueRow }) {
  if (!row.has_prediction) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <XCircle className="w-3.5 h-3.5 text-navy-700" />
        <span className="text-[9px] text-red-400">Eksik Tahmin</span>
      </div>
    );
  }
  const s = row.prediction_state;
  const color = s === 'approved_internal' || s === 'published' ? 'text-emerald-400' :
                s === 'pending_review' ? 'text-amber-400' :
                s === 'rejected' ? 'text-red-400' : 'text-navy-400';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <BarChart2 className={`w-3.5 h-3.5 ${color}`} />
      <span className={`text-[9px] ${color}`}>
        {PRED_STATUS_LABELS[s ?? ''] ?? s ?? '–'}
      </span>
      {row.prediction_confidence != null && (
        <span className="text-[9px] text-navy-500 font-mono">
          {(row.prediction_confidence * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function StoryCell({ row }: { row: QueueRow }) {
  if (!row.has_story) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <XCircle className="w-3.5 h-3.5 text-navy-700" />
        <span className="text-[9px] text-red-400">Eksik Senaryo</span>
      </div>
    );
  }
  const s = row.story_state;
  const color = s === 'approved_internal' || s === 'published' ? 'text-emerald-400' :
                s === 'pending_review' ? 'text-amber-400' :
                s === 'rejected' ? 'text-red-400' : 'text-navy-400';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <FileText className={`w-3.5 h-3.5 ${color}`} />
      <span className={`text-[9px] ${color}`}>
        {STORY_STATUS_LABELS[s ?? ''] ?? s ?? '–'}
      </span>
      {!row.story_has_content && (
        <span className="text-[9px] text-red-400">boş</span>
      )}
    </div>
  );
}

function PublicationCell({ row }: { row: QueueRow }) {
  if (!row.has_publication) {
    return <span className="text-navy-700 text-[11px]">–</span>;
  }
  return (
    <div className="flex flex-col items-center gap-0.5">
      {row.publication_visible
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        : <Eye className="w-3.5 h-3.5 text-navy-500" />
      }
      <span className={`text-[9px] ${row.publication_visible ? 'text-emerald-400' : 'text-navy-500'}`}>
        {row.publication_visible ? 'Yayınlandı' : 'Gizli'}
      </span>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-navy-500">{label}</span>
      <span className="text-navy-300 font-mono">{value}</span>
    </div>
  );
}

function SmallStat({ label, value, accent }: {
  label: string; value: number; accent?: 'green' | 'amber' | 'blue';
}) {
  const color = accent === 'green' ? 'text-emerald-400' : accent === 'amber' ? 'text-amber-400' :
    accent === 'blue' ? 'text-blue-400' : 'text-white';
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-4 text-xs text-red-400 font-mono flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />{message}
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

function EmptyState({ filter }: { filter: FilterMode }) {
  const msgs: Partial<Record<FilterMode, string>> = {
    needs_prediction:  'Tahmin eksik maç yok.',
    needs_story:       'Senaryo eksik maç yok.',
    needs_review:      'İnceleme bekleyen içerik yok.',
    ready_to_publish:  'Yayına hazır maç yok. Senaryo onaylandıktan sonra buraya gelir.',
    published:         'Henüz yayınlanmış maç yok.',
    all:               'Maç bulunamadı.',
  };
  return (
    <div className="p-10 text-center">
      <Clock className="w-8 h-8 text-navy-700 mx-auto mb-3" />
      <p className="text-sm text-readable-muted">{msgs[filter] ?? 'Bu filtrede kayıt yok.'}</p>
    </div>
  );
}
