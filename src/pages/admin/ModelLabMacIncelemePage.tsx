import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Database, ChevronRight, ChevronDown, Search, Filter, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getDataAvailability, getEraBucket } from '../../lib/modelLab/helpers';
import type { ArchiveMatch } from '../../lib/modelLab/types';

interface PredictionRow {
  id: string;
  match_id: string;
  p_home: number;
  p_draw: number;
  p_away: number;
  expected_home_goals: number;
  expected_away_goals: number;
  p_over_2_5: number;
  p_btts: number;
  predicted_result: string;
  confidence_score: number;
  confidence_grade: string;
  decision_summary: string;
  feature_snapshot: Record<string, unknown>;
  model_debug: Record<string, unknown>;
  feature_cutoff_date: string;
  trained_until_date: string;
  era_bucket: string;
  season_label: string;
  competition_name: string;
  model_versions: { version_key: string } | null;
}

interface EvaluationRow {
  actual_result: string;
  predicted_result: string;
  is_result_correct: boolean;
  brier_1x2: number;
  log_loss_1x2: number;
  over_2_5_correct: boolean;
  btts_correct: boolean;
  error_category: string;
  error_notes: string;
  calibration_bucket: string;
}

const PAGE_SIZE = 30;

export default function ModelLabMacIncelemePage() {
  const [matches, setMatches] = useState<ArchiveMatch[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionRow | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationRow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Filters
  const [compSearch, setCompSearch] = useState('');
  const [seasonSearch, setSeasonSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('');

  useEffect(() => {
    document.title = 'Maç İnceleme | Model Lab | Admin | Next59';
  }, []);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('v_historical_match_archive')
      .select('*', { count: 'exact' })
      .eq('season_label', '2018-2019')
      .order('match_date', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (compSearch) query = query.ilike('competition_name', `%${compSearch}%`);
    if (seasonSearch) query = query.ilike('season_label', `%${seasonSearch}%`);
    if (resultFilter) query = query.eq('result', resultFilter);

    const { data, count } = await query;
    setMatches((data as ArchiveMatch[]) ?? []);
    setTotal(count ?? null);
    setLoading(false);
  }, [page, compSearch, seasonSearch, resultFilter]);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  async function selectMatch(matchId: string) {
    setSelectedMatchId(matchId);
    setShowDebug(false);
    setLoadingDetail(true);
    setPrediction(null);
    setEvaluation(null);

    const { data: result } = await supabase.rpc('ml_get_match_prediction', {
      p_match_id: matchId,
    });

    const payload = result as { prediction: PredictionRow | null; evaluation: EvaluationRow | null } | null;
    if (payload?.prediction) {
      setPrediction(payload.prediction);
      setEvaluation(payload.evaluation ?? null);
    }
    setLoadingDetail(false);
  }

  const selectedMatch = matches.find((m) => m.match_id === selectedMatchId);
  const totalPages = total !== null ? Math.ceil(total / PAGE_SIZE) : null;

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-navy-500 mb-6">
          <Link to="/admin/model-lab" className="hover:text-champagne transition-colors">Model Lab</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-navy-400">Maç İnceleme</span>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5 mb-6 flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">Bu alan yalnızca model araştırma içindir. Public kullanıcıya gösterilmez.</p>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-champagne" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Maç İnceleme</h1>
              <p className="text-xs text-navy-400">Validasyon sezonu: 2018-2019 | Gerçek sonuç + Model kararı karşılaştırması</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Filter className="w-3.5 h-3.5 text-navy-500" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-500" />
            <input type="text" placeholder="Lig ara..." value={compSearch} onChange={(e) => { setCompSearch(e.target.value); setPage(0); }}
              className="bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pl-8 pr-3 py-2 w-36 placeholder-navy-600 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all" />
          </div>
          <select value={resultFilter} onChange={(e) => { setResultFilter(e.target.value); setPage(0); }}
            className="appearance-none bg-navy-900 border border-navy-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-champagne/40 transition-all">
            <option value="">Tüm Sonuçlar</option>
            <option value="H">Ev Kazandı (H)</option>
            <option value="D">Beraberlik (D)</option>
            <option value="A">Deplasman Kazandı (A)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Match list */}
          <div className="lg:col-span-2">
            {loading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 bg-navy-900/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : matches.length === 0 ? (
              <p className="text-sm text-navy-500 text-center py-12">Maç bulunamadı.</p>
            ) : (
              <>
                <div className="space-y-1.5 mb-4">
                  {matches.map((m) => (
                    <button
                      key={m.match_id}
                      onClick={() => selectMatch(m.match_id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        selectedMatchId === m.match_id
                          ? 'bg-champagne/10 border-champagne/30'
                          : 'bg-navy-900/50 border-navy-800/60 hover:border-navy-700'
                      }`}
                    >
                      <div className="text-[10px] text-navy-500 mb-1">
                        {m.match_date} · {m.competition_name}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium text-white">
                        <span className="truncate flex-1 text-right">{m.home_team_name}</span>
                        <span className="shrink-0 text-navy-400">
                          {m.has_ft_score ? `${m.home_score_ft}–${m.away_score_ft}` : '?–?'}
                        </span>
                        <span className="truncate flex-1">{m.away_team_name}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {totalPages !== null && totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                      className="text-xs text-navy-400 hover:text-white disabled:opacity-30 transition-colors px-3 py-1.5 rounded-lg border border-navy-700 hover:border-navy-600">
                      ← Önceki
                    </button>
                    <span className="text-xs text-navy-600">{page + 1} / {totalPages}</span>
                    <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="text-xs text-navy-400 hover:text-white disabled:opacity-30 transition-colors px-3 py-1.5 rounded-lg border border-navy-700 hover:border-navy-600">
                      Sonraki →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-3 space-y-4">
            {!selectedMatch ? (
              <div className="flex flex-col items-center justify-center py-20 border border-navy-800 rounded-xl">
                <Database className="w-8 h-8 text-navy-700 mb-3" />
                <p className="text-sm text-navy-500">Soldaki listeden bir maç seçin.</p>
              </div>
            ) : (
              <>
                {/* Section A: Actual historical result */}
                <SectionCard title="A — Gerçek Tarihsel Sonuç" subtitle="Kaynak: public.v_historical_match_archive">
                  <MatchActual match={selectedMatch} />
                </SectionCard>

                {/* Section B: Model decision */}
                <SectionCard title="B — Modelin Maçtan Önceki Kararı" subtitle="Kaynak: model_lab.match_model_predictions">
                  {loadingDetail ? (
                    <p className="text-xs text-navy-500 animate-pulse">Yükleniyor...</p>
                  ) : !prediction ? (
                    <p className="text-sm text-navy-600">Bu maç için henüz model tahmini yok. Backtest çalıştırılmamış veya bu maç kapsama alınmamış.</p>
                  ) : (
                    <ModelDecision prediction={prediction} showDebug={showDebug} onToggleDebug={() => setShowDebug(!showDebug)} />
                  )}
                </SectionCard>

                {/* Section C: Evaluation */}
                {evaluation && (
                  <SectionCard title="C — Hata / Doğruluk Analizi" subtitle="Kaynak: model_lab.match_model_evaluations">
                    <EvaluationDetail evaluation={evaluation} />
                  </SectionCard>
                )}

                {/* Section D: Data availability */}
                <SectionCard title="D — Veri Durumu" subtitle="Era bucket ve alan mevcudiyeti">
                  <DataAvailabilityPanel match={selectedMatch} />
                </SectionCard>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-4">
      <div className="mb-3">
        <p className="text-xs font-semibold text-champagne/80">{title}</p>
        <p className="text-[10px] text-navy-600">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function MatchActual({ match }: { match: ArchiveMatch }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm font-semibold text-white text-right truncate">{match.home_team_name}</span>
        <div className="text-center shrink-0">
          <div className="text-lg font-bold text-white tabular-nums">
            {match.has_ft_score ? `${match.home_score_ft}–${match.away_score_ft}` : '?–?'}
          </div>
          {match.home_score_ht !== null && (
            <div className="text-[10px] text-navy-500">İY {match.home_score_ht}–{match.away_score_ht}</div>
          )}
        </div>
        <span className="flex-1 text-sm font-semibold text-white text-left truncate">{match.away_team_name}</span>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-navy-500">
        <span>{match.match_date}</span>
        <span>·</span>
        <span>{match.competition_name}</span>
        <span>·</span>
        <span>{match.season_label}</span>
        {match.referee && <><span>·</span><span>Hakem: {match.referee}</span></>}
      </div>

      {(match.has_shot_data || match.has_card_data || match.has_corner_data) && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-navy-800/50">
          {match.home_total_shots !== null && match.away_total_shots !== null && (
            <Chip label="Şut" h={match.home_total_shots} a={match.away_total_shots} />
          )}
          {match.home_shots_on_goal !== null && match.away_shots_on_goal !== null && (
            <Chip label="İsabetli" h={match.home_shots_on_goal} a={match.away_shots_on_goal} />
          )}
          {match.home_corner_kicks !== null && match.away_corner_kicks !== null && (
            <Chip label="Korner" h={match.home_corner_kicks} a={match.away_corner_kicks} />
          )}
          {match.home_fouls !== null && match.away_fouls !== null && (
            <Chip label="Faul" h={match.home_fouls} a={match.away_fouls} />
          )}
          {match.home_yellow_cards !== null && match.away_yellow_cards !== null && (
            <Chip label="Sarı" h={match.home_yellow_cards} a={match.away_yellow_cards} />
          )}
          {match.home_red_cards !== null && match.away_red_cards !== null && (
            <Chip label="Kırmızı" h={match.home_red_cards} a={match.away_red_cards} />
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, h, a }: { label: string; h: number; a: number }) {
  return (
    <span className="text-[10px] bg-navy-800/80 border border-navy-700/60 text-navy-300 px-2 py-0.5 rounded-full">
      {label}: {h}–{a}
    </span>
  );
}

function ModelDecision({
  prediction,
  showDebug,
  onToggleDebug,
}: {
  prediction: PredictionRow;
  showDebug: boolean;
  onToggleDebug: () => void;
}) {
  const gradeCls =
    prediction.confidence_grade === 'A' || prediction.confidence_grade === 'B+'
      ? 'text-emerald-400'
      : prediction.confidence_grade === 'B' || prediction.confidence_grade === 'C'
        ? 'text-amber-400'
        : 'text-navy-400';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <ProbCell label="Ev" value={prediction.p_home} result="H" predicted={prediction.predicted_result} />
        <ProbCell label="Ber" value={prediction.p_draw} result="D" predicted={prediction.predicted_result} />
        <ProbCell label="Dep" value={prediction.p_away} result="A" predicted={prediction.predicted_result} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-400">
        <span>Beklenen gol: <strong className="text-white">{Number(prediction.expected_home_goals).toFixed(2)}–{Number(prediction.expected_away_goals).toFixed(2)}</strong></span>
        <span>2.5 üst: <strong className="text-white">{(prediction.p_over_2_5 * 100).toFixed(1)}%</strong></span>
        <span>BTTS: <strong className="text-white">{(prediction.p_btts * 100).toFixed(1)}%</strong></span>
        <span className={`font-bold ${gradeCls}`}>Güven: {prediction.confidence_grade} ({(prediction.confidence_score * 100).toFixed(1)}%)</span>
      </div>

      <div className="text-[10px] text-navy-600 font-mono">
        <span>Cutoff: {prediction.feature_cutoff_date} | Eğitim: {prediction.trained_until_date} | Era: {prediction.era_bucket}</span>
      </div>

      <button onClick={onToggleDebug}
        className="flex items-center gap-1 text-xs text-navy-500 hover:text-white transition-colors">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDebug ? 'rotate-180' : ''}`} />
        Feature Snapshot
      </button>

      {showDebug && (
        <pre className="bg-navy-950 border border-navy-800 rounded-lg p-3 text-[10px] text-navy-400 font-mono overflow-auto max-h-48 whitespace-pre-wrap">
          {JSON.stringify(prediction.feature_snapshot, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ProbCell({ label, value, result, predicted }: { label: string; value: number; result: string; predicted: string }) {
  const isChosen = result === predicted;
  return (
    <div className={`rounded-lg px-3 py-2 border ${isChosen ? 'bg-champagne/10 border-champagne/30' : 'bg-navy-800/50 border-navy-700/50'}`}>
      <div className="text-[10px] text-navy-500 mb-0.5">{label}</div>
      <div className={`text-base font-bold tabular-nums ${isChosen ? 'text-champagne' : 'text-white'}`}>
        {(value * 100).toFixed(1)}%
      </div>
    </div>
  );
}

function EvaluationDetail({ evaluation }: { evaluation: EvaluationRow }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-navy-400">Gerçek: <strong className="text-white">{evaluation.actual_result}</strong></span>
        <span className="text-navy-400">Tahmin: <strong className="text-white">{evaluation.predicted_result}</strong></span>
        <span className={`font-bold ${evaluation.is_result_correct ? 'text-emerald-400' : 'text-red-400'}`}>
          {evaluation.is_result_correct ? 'Doğru' : 'Yanlış'}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-500">
        <span>Brier: {Number(evaluation.brier_1x2).toFixed(4)}</span>
        <span>Log Loss: {Number(evaluation.log_loss_1x2).toFixed(4)}</span>
        <span>2.5Ü: {evaluation.over_2_5_correct ? '✓' : '✗'}</span>
        <span>BTTS: {evaluation.btts_correct ? '✓' : '✗'}</span>
      </div>
      {evaluation.error_category && (
        <div className="text-[10px] text-navy-600">
          Hata: <span className="text-navy-400">{evaluation.error_category}</span>
          {evaluation.error_notes && <span> — {evaluation.error_notes}</span>}
        </div>
      )}
    </div>
  );
}

function DataAvailabilityPanel({ match }: { match: ArchiveMatch }) {
  const avail = getDataAvailability(match);
  const era = getEraBucket(match.season_year, match.season_label);

  const fields: [string, boolean][] = [
    ['FT Skor', avail.has_ft_score],
    ['HT Skor', avail.has_ht_score],
    ['Sonuç', avail.has_result],
    ['Hakem', avail.has_referee],
    ['Şut', avail.has_shot_data],
    ['İsabetli Şut', avail.has_shots_on_goal_data],
    ['Korner', avail.has_corner_data],
    ['Faul', avail.has_foul_data],
    ['Kart', avail.has_card_data],
    ['Kırmızı Kart', avail.has_red_card_data],
  ];

  return (
    <div>
      <div className="text-xs text-navy-500 mb-2">
        Era: <span className="text-champagne font-mono">{era}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {fields.map(([label, val]) => (
          <span key={label} className={`text-[10px] px-2 py-0.5 rounded-full border ${val ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-navy-800 text-navy-600 border-navy-700'}`}>
            {label}: {val ? '✓' : '–'}
          </span>
        ))}
      </div>
    </div>
  );
}
