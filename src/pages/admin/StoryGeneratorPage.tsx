import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Shield, RefreshCw, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Eye, ThumbsUp, ThumbsDown, Send,
  XCircle, AlertTriangle, Ban, BookOpen, Link2, Clock, Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

// Matches model_lab.match_story_drafts.status values
type StoryStatus =
  | 'draft_generated'
  | 'pending_review'
  | 'approved_internal'
  | 'rejected'
  | 'published';

interface StoryDraft {
  id: string;
  match_id: string;
  prediction_draft_id: string | null;
  competition_name: string;
  season_label: string;
  match_date: string;
  home_team_name: string | null;
  away_team_name: string | null;
  model_version: string;
  feature_version: string;
  calibration_version: string;
  headline: string | null;
  tactical_summary: string | null;
  expected_tempo: string | null;
  key_pressure_zones: string | null;
  first_goal_sensitivity: string | null;
  draw_risk_analysis: string | null;
  favorite_fragility: string | null;
  late_goal_pressure: string | null;
  scenario_narrative: string | null;
  confidence_caveats: string | null;
  full_narrative_text: string | null;
  p_home: number | null;
  p_draw: number | null;
  p_away: number | null;
  confidence_tier: string | null;
  feature_quality_tier: string | null;
  status: StoryStatus;
  review_note: string | null;
  generated_at: string;
  version: number;
}

interface LinkedPrediction {
  id: string;
  status: string;
  prediction_formula: string;
  confidence_score: number;
  confidence_tier: string;
  has_calibration_warning: boolean;
  has_data_warning: boolean;
  generated_at: string;
}

// Return shape of ml_admin_get_matches_without_stories
interface PendingMatch {
  match_id: string;
  match_date: string;
  home_team: string;
  away_team: string;
  competition_name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<StoryStatus, string> = {
  draft_generated:   'Taslak',
  pending_review:    'İnceleme Bekliyor',
  approved_internal: 'İç Onay',
  rejected:          'Reddedildi',
  published:         'Yayınlandı',
};

const STATUS_COLORS: Record<StoryStatus, string> = {
  draft_generated:   'bg-navy-700/60 text-navy-300 border-navy-600',
  pending_review:    'bg-amber-500/15 text-amber-400 border-amber-500/25',
  approved_internal: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  rejected:          'bg-red-500/15 text-red-400 border-red-500/25',
  published:         'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
};

// Derived publish recommendation labels (not a DB column — derived from status)
const PUB_REC_LABELS: Record<string, string> = {
  publish_safe:    'Yayına Güvenli',
  review_required: 'İnceleme Gerekli',
  do_not_publish:  'Yayınlama',
};

const PUB_REC_COLORS: Record<string, string> = {
  publish_safe:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  review_required: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  do_not_publish:  'bg-red-500/15 text-red-400 border-red-500/25',
};

const STORY_SECTIONS: Array<{ key: keyof StoryDraft; label: string }> = [
  { key: 'headline',               label: 'Başlık' },
  { key: 'tactical_summary',       label: 'Taktik Özet' },
  { key: 'expected_tempo',         label: 'Beklenen Tempo' },
  { key: 'key_pressure_zones',     label: 'Baskı Bölgeleri' },
  { key: 'first_goal_sensitivity', label: 'İlk Gol Hassasiyeti' },
  { key: 'draw_risk_analysis',     label: 'Beraberlik Riski' },
  { key: 'favorite_fragility',     label: 'Favori Kırılganlığı' },
  { key: 'late_goal_pressure',     label: 'Son Dakika Baskısı' },
  { key: 'scenario_narrative',     label: 'Senaryo Anlatısı' },
  { key: 'confidence_caveats',     label: 'Güven Notları' },
];

type StatusFilter = StoryStatus | 'all';

// Derive publish recommendation from status (no column in DB)
function publishRec(d: StoryDraft): string {
  if (d.status === 'rejected') return 'do_not_publish';
  if (d.status === 'published' || d.status === 'approved_internal') return 'publish_safe';
  return 'review_required';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StoryGeneratorPage() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<StoryDraft[]>([]);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [loadingPending, setLoadingPending] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [actioning, setActioning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const setActionError = (id: string, msg: string) => {
    setActionErrors(prev => ({ ...prev, [id]: msg }));
    setTimeout(() => setActionErrors(prev => {
      const n = { ...prev }; delete n[id]; return n;
    }), 7000);
  };

  const loadDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    setFetchError(null);
    let q = supabase
      .schema('model_lab')
      .from('match_story_drafts')
      .select([
        'id', 'match_id', 'prediction_draft_id', 'competition_name', 'season_label',
        'match_date', 'home_team_name', 'away_team_name', 'model_version', 'feature_version',
        'calibration_version', 'headline', 'tactical_summary', 'expected_tempo',
        'key_pressure_zones', 'first_goal_sensitivity', 'draw_risk_analysis',
        'favorite_fragility', 'late_goal_pressure', 'scenario_narrative', 'confidence_caveats',
        'full_narrative_text', 'p_home', 'p_draw', 'p_away', 'confidence_tier',
        'feature_quality_tier', 'status', 'review_note', 'generated_at', 'version',
      ].join(', '))
      .order('generated_at', { ascending: false })
      .limit(100);
    if (filterStatus !== 'all') q = q.eq('status', filterStatus);
    const { data, error } = await q;
    if (error) setFetchError(error.message);
    else setDrafts((data as StoryDraft[]) ?? []);
    setLoadingDrafts(false);
  }, [filterStatus]);

  const loadPendingMatches = useCallback(async () => {
    setLoadingPending(true);
    const { data } = await supabase.rpc('ml_admin_get_matches_without_stories', { p_limit: 50 });
    setPendingMatches((data as PendingMatch[]) ?? []);
    setLoadingPending(false);
  }, []);

  useEffect(() => {
    document.title = 'Hikaye Üretici | Admin | Next59';
    loadDrafts();
    loadPendingMatches();
  }, [loadDrafts, loadPendingMatches]);

  const generateStory = async () => {
    if (!selectedMatchId) return;
    setGenerating(true);
    setGenerateError(null);
    const { error } = await supabase.rpc('ml_admin_generate_match_story', {
      p_match_id: selectedMatchId,
      p_generated_by: user?.id ?? null,
    });
    if (error) {
      setGenerateError(error.message);
    } else {
      setSelectedMatchId('');
      await Promise.all([loadDrafts(), loadPendingMatches()]);
    }
    setGenerating(false);
  };

  const updateStatus = async (draftId: string, newStatus: StoryStatus) => {
    setActioning(draftId);
    const update: Record<string, unknown> = { status: newStatus };
    const note = reviewNotes[draftId];
    if (note) update.review_note = note;
    if (newStatus === 'approved_internal') update.approved_at = new Date().toISOString();
    if (newStatus === 'published') update.published_at = new Date().toISOString();

    const { error } = await supabase
      .schema('model_lab')
      .from('match_story_drafts')
      .update(update)
      .eq('id', draftId);

    if (error) setActionError(draftId, 'Durum güncellenemedi: ' + error.message);
    else await loadDrafts();
    setActioning(null);
  };

  const stateCounts = drafts.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Safety banner */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Hikaye Üretici — Yalnızca Admin.</strong>{' '}
            Senaryo taslakları üretilir, incelenir, onaylanır. Hiçbir içerik otomatik yayınlanmaz.{' '}
            <em>Bu veri senaryosudur; kesin sonuç değildir.</em>
          </p>
        </div>

        {/* Page header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6 text-champagne" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Hikaye Üretici</h1>
            <p className="text-sm text-readable-muted mt-1">
              Senaryo Taslağı · Kaynak Tahmin Bağlantısı · İnceleme · Onay · Yayın
            </p>
          </div>
        </div>

        {fetchError && <ErrorBanner message={fetchError} />}

        {/* Generate panel */}
        <GeneratePanel
          pendingMatches={pendingMatches}
          loadingPending={loadingPending}
          selectedMatchId={selectedMatchId}
          onSelect={setSelectedMatchId}
          onGenerate={generateStory}
          generating={generating}
          error={generateError}
        />

        {/* Status filter tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(['all', 'draft_generated', 'pending_review', 'approved_internal', 'rejected', 'published'] as StatusFilter[]).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                filterStatus === s
                  ? 'bg-champagne/15 text-champagne border-champagne/30'
                  : 'bg-navy-800 text-navy-400 border-navy-700 hover:text-white'
              }`}
            >
              {s === 'all' ? 'Tümü' : STATUS_LABELS[s as StoryStatus]}
              {s !== 'all' && stateCounts[s] != null && (
                <span className="ml-1.5 text-[10px] opacity-70">{stateCounts[s]}</span>
              )}
            </button>
          ))}
          <button onClick={loadDrafts} disabled={loadingDrafts}
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loadingDrafts ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Drafts list */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Senaryo Taslakları ({drafts.length})
            </span>
            <span className="text-[11px] text-navy-600">Satıra tıkla → önizleme + kaynak tahmin + işlemler</span>
          </div>

          {loadingDrafts ? (
            <LoadingSkeleton rows={5} />
          ) : drafts.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="divide-y divide-navy-800/50">
              {drafts.map(draft => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  expanded={expandedId === draft.id}
                  onToggle={() => setExpandedId(expandedId === draft.id ? null : draft.id)}
                  onStatusChange={updateStatus}
                  actioning={actioning === draft.id}
                  reviewNote={reviewNotes[draft.id] ?? ''}
                  onReviewNoteChange={note => setReviewNotes(prev => ({ ...prev, [draft.id]: note }))}
                  actionError={actionErrors[draft.id] ?? null}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Generate Panel ───────────────────────────────────────────────────────────

function GeneratePanel({
  pendingMatches, loadingPending, selectedMatchId, onSelect, onGenerate, generating, error,
}: {
  pendingMatches: PendingMatch[];
  loadingPending: boolean;
  selectedMatchId: string;
  onSelect: (id: string) => void;
  onGenerate: () => void;
  generating: boolean;
  error: string | null;
}) {
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 mb-6">
      <div className="text-xs font-semibold text-readable-muted uppercase tracking-wider mb-4">
        Yeni Senaryo Taslağı Üret
      </div>

      {/* Disclaimer + rules */}
      <div className="bg-navy-800/60 border border-navy-700 rounded-lg px-4 py-2.5 mb-4 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-navy-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-navy-400 leading-relaxed">
          Üretim mevcut tahmin taslağını temel alır.{' '}
          <strong className="text-amber-400">Tahmin yoksa senaryo üretilemez.</strong>{' '}
          Her taslak &quot;Bu veri senaryosudur; kesin sonuç değildir.&quot; uyarısını taşır.
          Hiçbir içerik otomatik yayınlanmaz.
        </p>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <label className="block text-xs text-navy-400 mb-1.5">
            Maç Seç{' '}
            <span className="text-navy-600">
              ({loadingPending ? '…' : `${pendingMatches.length} senaryo bekleyen maç`})
            </span>
          </label>
          <div className="relative">
            <select
              value={selectedMatchId}
              onChange={e => onSelect(e.target.value)}
              disabled={loadingPending || generating}
              className="w-full appearance-none bg-navy-800 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-champagne/50 pr-8 disabled:opacity-50"
            >
              <option value="">
                {loadingPending
                  ? 'Yükleniyor...'
                  : pendingMatches.length === 0
                  ? 'Tüm maçların senaryosu mevcut'
                  : 'Maç seçin...'}
              </option>
              {pendingMatches.map(m => (
                <option key={m.match_id} value={m.match_id}>
                  {m.match_date.slice(0, 10)} — {m.home_team} vs {m.away_team} ({m.competition_name})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400 pointer-events-none" />
          </div>
        </div>

        <button
          onClick={onGenerate}
          disabled={!selectedMatchId || generating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-champagne/15 border border-champagne/30 text-champagne font-semibold text-sm hover:bg-champagne/25 transition-all disabled:opacity-40 shrink-0"
        >
          {generating
            ? <><RefreshCw className="w-4 h-4 animate-spin" />Üretiliyor...</>
            : <><FileText className="w-4 h-4" />Senaryo Taslağı Üret</>
          }
        </button>
      </div>

      {/* Üretim Hatası */}
      {error && (
        <div className="mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-[11px] font-semibold text-red-400 mb-0.5">Üretim Hatası</div>
            <div className="text-[11px] text-red-300 font-mono">{error}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Draft Row ────────────────────────────────────────────────────────────────

function DraftRow({
  draft, expanded, onToggle, onStatusChange, actioning,
  reviewNote, onReviewNoteChange, actionError,
}: {
  draft: StoryDraft;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (id: string, status: StoryStatus) => void;
  actioning: boolean;
  reviewNote: string;
  onReviewNoteChange: (note: string) => void;
  actionError: string | null;
}) {
  const hasContent = !!(draft.headline || draft.full_narrative_text);
  const rec = publishRec(draft);

  return (
    <div>
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-navy-800/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">
              {draft.home_team_name ?? '?'} <span className="text-navy-500">vs</span> {draft.away_team_name ?? '?'}
            </span>
            <span className="text-[11px] text-navy-500">{draft.match_date}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] text-navy-500">{draft.competition_name}</span>
            {draft.prediction_draft_id ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-400">
                <Link2 className="w-2.5 h-2.5" />Kaynak Tahmin Bağlı
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
                <XCircle className="w-2.5 h-2.5" />Kaynak Tahmin Yok
              </span>
            )}
            {!hasContent && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-500">
                <AlertTriangle className="w-2.5 h-2.5" />İçerik boş
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {draft.p_home != null && (
            <span className="text-[11px] font-mono text-navy-400 hidden sm:block tabular-nums">
              {(draft.p_home * 100).toFixed(0)}/{draft.p_draw != null ? (draft.p_draw * 100).toFixed(0) : '–'}/{draft.p_away != null ? (draft.p_away * 100).toFixed(0) : '–'}
            </span>
          )}
          <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${PUB_REC_COLORS[rec]}`}>
            {PUB_REC_LABELS[rec]}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_COLORS[draft.status]}`}>
            {STATUS_LABELS[draft.status]}
          </span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-navy-500" />
            : <ChevronDown className="w-4 h-4 text-navy-500" />
          }
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-navy-800/50 bg-navy-900/30">
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Left column: content */}
            <div className="lg:col-span-2 space-y-3">

              {/* Veri Eksikliği — no linked prediction */}
              {!draft.prediction_draft_id && (
                <div className="bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3 flex items-start gap-2">
                  <Ban className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-red-400 mb-0.5">Veri Eksikliği — Kaynak Tahmin Yok</div>
                    <div className="text-[11px] text-red-300">
                      Önce tahmin üretin: <em>PreMatch Ops → Üret</em>
                    </div>
                  </div>
                </div>
              )}

              {/* Disclaimer always visible */}
              <div className="bg-navy-800/40 border border-navy-700/50 rounded-lg px-4 py-2.5 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-navy-400 shrink-0" />
                <span className="text-[11px] text-navy-400 italic">
                  Bu veri senaryosudur; kesin sonuç değildir.
                </span>
              </div>

              {/* Story content or empty state */}
              {hasContent ? (
                <>
                  {STORY_SECTIONS.map(({ key, label }) => {
                    const val = draft[key] as string | null;
                    if (!val) return null;
                    return (
                      <div key={key} className="bg-navy-800/30 rounded-lg p-3">
                        <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-1.5">{label}</div>
                        <p className="text-sm text-navy-200 leading-relaxed">{val}</p>
                      </div>
                    );
                  })}
                  {draft.full_narrative_text && (
                    <div className="bg-navy-800/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Eye className="w-3.5 h-3.5 text-navy-400" />
                        <span className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Tam Narratif</span>
                      </div>
                      <p className="text-sm text-navy-200 leading-relaxed whitespace-pre-wrap">{draft.full_narrative_text}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg px-4 py-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-amber-400 mb-0.5">İçerik Boş</div>
                    <div className="text-[11px] text-amber-300">
                      Taslak henüz senaryo içeriği içermiyor. Üretim RPC bir iskelet oluşturur; içerik pipeline henüz çalışmamış olabilir.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right column: source prediction + actions */}
            <div className="space-y-4">

              {/* Kaynak Tahmin panel */}
              <SourcePredictionPanel predictionDraftId={draft.prediction_draft_id} />

              {/* Model info */}
              <div className="bg-navy-800/40 rounded-lg p-3">
                <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-2">Model Sürümleri</div>
                <div className="space-y-1">
                  <DetailRow label="Model"       value={draft.model_version} />
                  <DetailRow label="Öznitelik"   value={draft.feature_version} />
                  <DetailRow label="Kalibrasyon" value={draft.calibration_version} />
                  {draft.confidence_tier && <DetailRow label="Güven Tieri" value={draft.confidence_tier} />}
                  {draft.feature_quality_tier && <DetailRow label="Kalite Tieri" value={draft.feature_quality_tier} />}
                  <DetailRow label="Versiyon" value={`v${draft.version}`} />
                  <DetailRow label="Son Üretim" value={new Date(draft.generated_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} />
                </div>
              </div>

              {/* Actions panel */}
              <div className="bg-navy-800/40 rounded-lg p-3">
                <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-3">İşlemler</div>

                {/* Publish recommendation */}
                <div className="mb-3">
                  <div className="text-[11px] text-navy-500 mb-1">Yayın Önerisi</div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${PUB_REC_COLORS[rec]}`}>
                    {PUB_REC_LABELS[rec]}
                  </span>
                </div>

                {/* Review note */}
                <div className="text-[11px] text-navy-500 mb-1.5">İnceleme Notu</div>
                <textarea
                  value={reviewNote}
                  onChange={e => onReviewNoteChange(e.target.value)}
                  placeholder="İsteğe bağlı not..."
                  rows={2}
                  className="w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-xs text-white placeholder-navy-600 focus:outline-none focus:border-navy-600 resize-none mb-2"
                />
                {draft.review_note && (
                  <p className="text-[10px] text-navy-500 italic mb-3">Kayıtlı not: {draft.review_note}</p>
                )}

                {/* Workflow buttons */}
                <div className="flex flex-col gap-2">
                  <WorkflowButtons
                    draft={draft}
                    actioning={actioning}
                    onStatusChange={onStatusChange}
                  />
                </div>

                {actionError && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-400">
                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />{actionError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Source Prediction Panel ──────────────────────────────────────────────────

function SourcePredictionPanel({ predictionDraftId }: { predictionDraftId: string | null }) {
  const [pred, setPred] = useState<LinkedPrediction | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!predictionDraftId) { setPred(null); return; }
    setLoading(true);
    supabase
      .schema('model_lab')
      .from('prematch_prediction_drafts')
      .select('id, status, prediction_formula, confidence_score, confidence_tier, has_calibration_warning, has_data_warning, generated_at')
      .eq('id', predictionDraftId)
      .maybeSingle()
      .then(({ data }) => {
        setPred(data as LinkedPrediction | null);
        setLoading(false);
      });
  }, [predictionDraftId]);

  return (
    <div className="bg-navy-800/40 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Link2 className="w-3.5 h-3.5 text-navy-400" />
        <span className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Kaynak Tahmin</span>
      </div>

      {!predictionDraftId ? (
        <div className="flex items-start gap-1.5 text-[11px]">
          <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-red-400">Tahmin Bağlantısı Yok</div>
            <div className="text-red-300 mt-0.5">Önce tahmin üretin</div>
          </div>
        </div>
      ) : loading ? (
        <div className="text-[11px] text-navy-600 animate-pulse">Yükleniyor...</div>
      ) : pred ? (
        <div className="space-y-1.5">
          <DetailRow label="Formül"   value={pred.prediction_formula ?? '–'} />
          <DetailRow label="Durum"    value={predStatusLabel(pred.status)} />
          <DetailRow label="Güven"    value={`${(pred.confidence_score * 100).toFixed(0)}% (${pred.confidence_tier})`} />
          <DetailRow label="Üretildi" value={new Date(pred.generated_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} />
          {pred.has_calibration_warning && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400 pt-1">
              <AlertTriangle className="w-3 h-3" />Kalibrasyon uyarısı
            </div>
          )}
          {pred.has_data_warning && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400">
              <AlertTriangle className="w-3 h-3" />Veri kalitesi uyarısı
            </div>
          )}
          {pred.status !== 'published' && pred.status !== 'approved_internal' && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400 pt-1 border-t border-navy-700/50 mt-1">
              <AlertTriangle className="w-3 h-3" />Kaynak tahmin henüz onaylı değil
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-navy-600">Tahmin kaydı bulunamadı.</div>
      )}
    </div>
  );
}

// ─── Workflow Buttons ─────────────────────────────────────────────────────────

function WorkflowButtons({
  draft, actioning, onStatusChange,
}: {
  draft: StoryDraft;
  actioning: boolean;
  onStatusChange: (id: string, status: StoryStatus) => void;
}) {
  const s = draft.status;

  if (s === 'draft_generated') {
    return (
      <>
        <ActionButton label="İncelemeye Al" icon={<Eye className="w-3.5 h-3.5" />}
          onClick={() => onStatusChange(draft.id, 'pending_review')} loading={actioning} color="amber" />
        <ActionButton label="Onayla" icon={<ThumbsUp className="w-3.5 h-3.5" />}
          onClick={() => onStatusChange(draft.id, 'approved_internal')} loading={actioning} color="green" />
        <ActionButton label="Reddet" icon={<ThumbsDown className="w-3.5 h-3.5" />}
          onClick={() => onStatusChange(draft.id, 'rejected')} loading={actioning} color="red" />
      </>
    );
  }

  if (s === 'pending_review') {
    return (
      <>
        <ActionButton label="Onayla" icon={<ThumbsUp className="w-3.5 h-3.5" />}
          onClick={() => onStatusChange(draft.id, 'approved_internal')} loading={actioning} color="green" />
        <ActionButton label="Reddet" icon={<ThumbsDown className="w-3.5 h-3.5" />}
          onClick={() => onStatusChange(draft.id, 'rejected')} loading={actioning} color="red" />
      </>
    );
  }

  if (s === 'approved_internal') {
    // Block publish if no linked prediction — no fake stories ever
    const canPublish = !!draft.prediction_draft_id;
    return (
      <>
        {canPublish ? (
          <ActionButton label="Yayınla" icon={<Send className="w-3.5 h-3.5" />}
            onClick={() => onStatusChange(draft.id, 'published')} loading={actioning} color="blue" />
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border bg-red-500/10 border-red-500/25 text-red-400">
            <Ban className="w-3.5 h-3.5" />Önce tahmin üretin
          </div>
        )}
        <ActionButton label="Reddet" icon={<ThumbsDown className="w-3.5 h-3.5" />}
          onClick={() => onStatusChange(draft.id, 'rejected')} loading={actioning} color="red" />
      </>
    );
  }

  if (s === 'published') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" />Yayınlandı
      </div>
    );
  }

  if (s === 'rejected') {
    return (
      <ActionButton label="Taslağa Geri Al" icon={<RefreshCw className="w-3.5 h-3.5" />}
        onClick={() => onStatusChange(draft.id, 'draft_generated')} loading={actioning} color="gray" />
    );
  }

  return null;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function ActionButton({ label, icon, onClick, loading, color }: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  loading: boolean;
  color: 'amber' | 'green' | 'red' | 'blue' | 'gray';
}) {
  const colorMap = {
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20',
    green: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20',
    red:   'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20',
    blue:  'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20',
    gray:  'bg-navy-800 border-navy-700 text-navy-400 hover:text-white',
  };
  return (
    <button onClick={onClick} disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 ${colorMap[color]}`}>
      {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-navy-500">{label}</span>
      <span className="text-navy-300 font-mono truncate max-w-[140px]">{value}</span>
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
        <div key={i} className="h-12 bg-navy-800/40 rounded animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-10 text-center">
      <Clock className="w-8 h-8 text-navy-700 mx-auto mb-3" />
      <p className="text-sm text-readable-muted mb-1">Bu filtrede senaryo taslağı yok.</p>
      <p className="text-xs text-navy-600">Yukarıdan maç seçip "Senaryo Taslağı Üret" ile başlayın.</p>
    </div>
  );
}

function predStatusLabel(s: string): string {
  const m: Record<string, string> = {
    pending_review: 'İnceleme Bekliyor', approved_internal: 'İç Onay',
    rejected: 'Reddedildi', published: 'Yayınlandı', hidden: 'Gizlendi',
  };
  return m[s] ?? s;
}
