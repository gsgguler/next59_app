import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Shield, RefreshCw, CheckCircle, AlertCircle,
  ChevronDown, Eye, ThumbsUp, ThumbsDown, Send, Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type WorkflowState = 'draft_generated' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'hidden';

interface StoryDraft {
  id: string;
  match_id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  competition_name: string;
  workflow_state: WorkflowState;
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
  confidence: number | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PendingMatch {
  match_id: string;
  match_date: string;
  home_team: string;
  away_team: string;
  competition_name: string;
}

const STATE_LABELS: Record<WorkflowState, string> = {
  draft_generated: 'Taslak',
  pending_review: 'İnceleme Bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  published: 'Yayınlandı',
  hidden: 'Gizlendi',
};

const STATE_COLORS: Record<WorkflowState, string> = {
  draft_generated: 'bg-navy-700 text-navy-300',
  pending_review: 'bg-amber-500/15 text-amber-400',
  approved: 'bg-emerald-500/15 text-emerald-400',
  rejected: 'bg-red-500/15 text-red-400',
  published: 'bg-blue-500/15 text-blue-400',
  hidden: 'bg-navy-700 text-navy-500',
};

export default function StoryGeneratorPage() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<StoryDraft[]>([]);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<WorkflowState | 'all'>('all');

  const loadDrafts = useCallback(async () => {
    setLoadingDrafts(true);

    const query = supabase
      .from('match_story_drafts' as 'prematch_prediction_drafts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const { data, error: err } = await query;
    if (!err && data) setDrafts(data as unknown as StoryDraft[]);
    if (err) setError(err.message);
    setLoadingDrafts(false);
  }, []);

  const loadPendingMatches = useCallback(async () => {
    const { data } = await supabase.rpc('ml_admin_get_matches_without_stories', { p_limit: 50 });
    if (data) setPendingMatches(data as PendingMatch[]);
  }, []);

  useEffect(() => {
    document.title = 'Story Generator | Admin | Next59';
    loadDrafts();
    loadPendingMatches();
  }, [loadDrafts, loadPendingMatches]);

  async function generateStory() {
    if (!selectedMatchId) return;
    setGenerating(true);
    setError(null);

    const { error: err } = await supabase.rpc('ml_admin_generate_match_story', {
      p_match_id: selectedMatchId,
      p_generated_by: user?.id,
    });

    if (err) setError(err.message);
    else {
      await loadDrafts();
      await loadPendingMatches();
      setSelectedMatchId('');
    }
    setGenerating(false);
  }

  async function updateState(draftId: string, newState: WorkflowState) {
    setActionLoading(draftId);
    const notes = reviewNotes[draftId] ?? null;

    const update: Record<string, unknown> = { workflow_state: newState, updated_at: new Date().toISOString() };
    if (notes) update.reviewer_notes = notes;
    if (newState === 'published') {
      update.published_at = new Date().toISOString();
      update.published_by = user?.id;
    }
    if (newState === 'approved' || newState === 'rejected') {
      update.reviewed_by = user?.id;
      update.reviewed_at = new Date().toISOString();
    }

    const { error: err } = await supabase
      .from('match_story_drafts' as 'prematch_prediction_drafts')
      .update(update)
      .eq('id', draftId);

    if (err) setError(err.message);
    else await loadDrafts();
    setActionLoading(null);
  }

  const filteredDrafts = filterState === 'all'
    ? drafts
    : drafts.filter(d => d.workflow_state === filterState);

  const stateCounts = drafts.reduce<Record<string, number>>((acc, d) => {
    acc[d.workflow_state] = (acc[d.workflow_state] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Admin warning */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Story Generator — Admin Only.</strong> Maç hikayeleri oluştur, incele ve yayınla. Yayınlanan hikayeler authenticated kullanıcılara görünür.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-champagne" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Story Generator</h1>
            <p className="text-sm text-readable-muted mt-1">
              90 dakika narratifi · İnceleme · Onay · Yayın
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-6 text-xs text-red-400 font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Generate new story */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 mb-6">
          <h2 className="text-xs font-semibold text-readable-muted uppercase tracking-wider mb-4">Yeni Hikaye Üret</h2>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-navy-400 mb-1.5">Maç Seç (hikayesi olmayan son 50 maç)</label>
              <div className="relative">
                <select
                  value={selectedMatchId}
                  onChange={e => setSelectedMatchId(e.target.value)}
                  className="w-full appearance-none bg-navy-800 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-champagne/50 pr-8"
                >
                  <option value="">Maç seçin... ({pendingMatches.length} bekleyen)</option>
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
              onClick={generateStory}
              disabled={!selectedMatchId || generating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-champagne/15 border border-champagne/30 text-champagne font-semibold text-sm hover:bg-champagne/25 transition-all disabled:opacity-40 shrink-0"
            >
              {generating
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Üretiliyor...</>
                : <><FileText className="w-4 h-4" />Hikaye Üret</>
              }
            </button>
          </div>
        </div>

        {/* State filter tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(['all', 'draft_generated', 'pending_review', 'approved', 'rejected', 'published', 'hidden'] as const).map(state => (
            <button
              key={state}
              onClick={() => setFilterState(state)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filterState === state
                  ? 'bg-champagne/15 text-champagne border border-champagne/30'
                  : 'bg-navy-800 text-navy-400 border border-navy-700 hover:text-white'
              }`}
            >
              {state === 'all' ? 'Tümü' : STATE_LABELS[state]}
              {state !== 'all' && stateCounts[state] != null && (
                <span className="ml-1.5 text-[11px] opacity-70">{stateCounts[state]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Drafts list */}
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-800">
            <h2 className="text-xs font-semibold text-readable-muted uppercase tracking-wider">
              Hikaye Taslakları ({filteredDrafts.length})
            </h2>
          </div>

          {loadingDrafts ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-navy-800/40 rounded animate-pulse" />
              ))}
            </div>
          ) : filteredDrafts.length === 0 ? (
            <div className="p-8 text-center text-sm text-readable-muted">
              Henüz hikaye taslağı yok.
            </div>
          ) : (
            <div className="divide-y divide-navy-800/50">
              {filteredDrafts.map(draft => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  expanded={expandedDraft === draft.id}
                  onToggle={() => setExpandedDraft(expandedDraft === draft.id ? null : draft.id)}
                  onStateChange={updateState}
                  actionLoading={actionLoading === draft.id}
                  reviewNote={reviewNotes[draft.id] ?? ''}
                  onReviewNoteChange={note => setReviewNotes(prev => ({ ...prev, [draft.id]: note }))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftRow({
  draft,
  expanded,
  onToggle,
  onStateChange,
  actionLoading,
  reviewNote,
  onReviewNoteChange,
}: {
  draft: StoryDraft;
  expanded: boolean;
  onToggle: () => void;
  onStateChange: (id: string, state: WorkflowState) => void;
  actionLoading: boolean;
  reviewNote: string;
  onReviewNoteChange: (note: string) => void;
}) {
  const storyFields = [
    { key: 'headline', label: 'Başlık' },
    { key: 'tactical_summary', label: 'Taktik Özet' },
    { key: 'expected_tempo', label: 'Beklenen Tempo' },
    { key: 'key_pressure_zones', label: 'Baskı Bölgeleri' },
    { key: 'first_goal_sensitivity', label: 'İlk Gol Hassasiyeti' },
    { key: 'draw_risk_analysis', label: 'Beraberlik Riski' },
    { key: 'favorite_fragility', label: 'Favori Kırılganlığı' },
    { key: 'late_goal_pressure', label: 'Son Dakika Baskısı' },
    { key: 'scenario_narrative', label: 'Senaryo' },
    { key: 'confidence_caveats', label: 'Güven Notları' },
  ] as const;

  return (
    <div>
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-navy-800/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {draft.home_team} vs {draft.away_team}
            </span>
            <span className="text-xs text-navy-400 shrink-0">{draft.match_date?.slice(0, 10)}</span>
          </div>
          <div className="text-[11px] text-navy-400 mt-0.5 truncate">{draft.competition_name}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {draft.p_home != null && (
            <span className="text-xs font-mono text-navy-400 hidden sm:block">
              {(draft.p_home * 100).toFixed(0)}/{(draft.p_draw! * 100).toFixed(0)}/{(draft.p_away! * 100).toFixed(0)}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATE_COLORS[draft.workflow_state]}`}>
            {STATE_LABELS[draft.workflow_state]}
          </span>
          <ChevronDown className={`w-4 h-4 text-navy-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-navy-800/50 bg-navy-900/30">
          {/* Story sections */}
          <div className="mt-4 space-y-3">
            {storyFields.map(f => {
              const val = draft[f.key];
              if (!val) return null;
              return (
                <div key={f.key}>
                  <div className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-1">{f.label}</div>
                  <p className="text-sm text-navy-200 leading-relaxed">{val}</p>
                </div>
              );
            })}
          </div>

          {draft.full_narrative_text && (
            <div className="mt-4 pt-4 border-t border-navy-800">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-3.5 h-3.5 text-navy-400" />
                <span className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Tam Narratif</span>
              </div>
              <p className="text-sm text-navy-200 leading-relaxed whitespace-pre-wrap">{draft.full_narrative_text}</p>
            </div>
          )}

          {/* Review notes */}
          <div className="mt-4 pt-4 border-t border-navy-800">
            <label className="block text-[11px] font-semibold text-navy-400 uppercase tracking-wider mb-1.5">
              İnceleme Notu
            </label>
            <textarea
              value={reviewNote}
              onChange={e => onReviewNoteChange(e.target.value)}
              placeholder="İsteğe bağlı not..."
              rows={2}
              className="w-full bg-navy-800 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white placeholder-navy-500 focus:outline-none focus:border-navy-600 resize-none"
            />
            {draft.reviewer_notes && (
              <p className="mt-1 text-xs text-navy-400 italic">Mevcut not: {draft.reviewer_notes}</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {draft.workflow_state === 'draft_generated' && (
              <ActionButton
                label="İncelemeye Al"
                icon={<Eye className="w-3.5 h-3.5" />}
                onClick={() => onStateChange(draft.id, 'pending_review')}
                loading={actionLoading}
                color="amber"
              />
            )}
            {(draft.workflow_state === 'pending_review' || draft.workflow_state === 'draft_generated') && (
              <>
                <ActionButton
                  label="Onayla"
                  icon={<ThumbsUp className="w-3.5 h-3.5" />}
                  onClick={() => onStateChange(draft.id, 'approved')}
                  loading={actionLoading}
                  color="green"
                />
                <ActionButton
                  label="Reddet"
                  icon={<ThumbsDown className="w-3.5 h-3.5" />}
                  onClick={() => onStateChange(draft.id, 'rejected')}
                  loading={actionLoading}
                  color="red"
                />
              </>
            )}
            {draft.workflow_state === 'approved' && (
              <ActionButton
                label="Yayınla"
                icon={<Send className="w-3.5 h-3.5" />}
                onClick={() => onStateChange(draft.id, 'published')}
                loading={actionLoading}
                color="blue"
              />
            )}
            {draft.workflow_state === 'published' && (
              <ActionButton
                label="Gizle"
                icon={<Clock className="w-3.5 h-3.5" />}
                onClick={() => onStateChange(draft.id, 'hidden')}
                loading={actionLoading}
                color="gray"
              />
            )}
            {draft.workflow_state === 'rejected' && (
              <ActionButton
                label="Taslağa Al"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={() => onStateChange(draft.id, 'draft_generated')}
                loading={actionLoading}
                color="gray"
              />
            )}
          </div>

          <div className="mt-3 text-[11px] text-navy-600">
            Oluşturuldu: {new Date(draft.created_at).toLocaleString('tr-TR')}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label, icon, onClick, loading, color,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  loading: boolean;
  color: 'amber' | 'green' | 'red' | 'blue' | 'gray';
}) {
  const colorMap = {
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/15',
    green: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15',
    red:   'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/15',
    blue:  'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/15',
    gray:  'bg-navy-800 border-navy-700 text-navy-400 hover:text-white',
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 ${colorMap[color]}`}
    >
      {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

// used in action flow
void CheckCircle;
