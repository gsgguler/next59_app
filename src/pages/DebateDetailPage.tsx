import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Loader2, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import DebateTimeline from '../components/debate/DebateTimeline';
import type { DebateRound } from '../components/debate/DebateTimeline';
import ConsensusPanel from '../components/debate/ConsensusPanel';
import { mockDebateRounds, mockSealRetrievalKey } from '../data/mockDebate';

interface PredictionInfo {
  id: string;
  cassandra_code: string;
  statement: string;
  match: {
    id: string;
    home_team: { short_name: string } | null;
    away_team: { short_name: string } | null;
  } | null;
}

export default function DebateDetailPage() {
  const { predictionId, lang } = useParams<{ predictionId: string; lang: string }>();
  const [rounds, setRounds] = useState<DebateRound[]>([]);
  const [prediction, setPrediction] = useState<PredictionInfo | null>(null);
  const [sealKey, setSealKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!predictionId) return;

      const [predRes, roundsRes] = await Promise.all([
        supabase
          .from('predictions')
          .select(`
            id, cassandra_code, statement,
            match:matches(
              id,
              home_team:teams!matches_home_team_id_fkey(short_name),
              away_team:teams!matches_away_team_id_fkey(short_name)
            )
          `)
          .eq('id', predictionId)
          .eq('is_current', true)
          .maybeSingle(),
        supabase
          .from('debate_rounds')
          .select(`
            id, round_number, debate_status, consensus_reached,
            consensus_summary, started_at, completed_at,
            persona_outputs(
              id, persona, analysis_text, vote, confidence,
              tokens_input, tokens_output, estimated_cost_usd
            )
          `)
          .eq('prediction_id', predictionId)
          .order('round_number', { ascending: true }),
      ]);

      if (predRes.data) {
        setPrediction(predRes.data as unknown as PredictionInfo);
      }

      const fetchedRounds = (roundsRes.data as unknown as DebateRound[]) ?? [];

      if (fetchedRounds.length > 0) {
        setRounds(fetchedRounds);
        setUseMock(false);

        const matchId = (predRes.data as unknown as PredictionInfo | null)?.match?.id;
        if (matchId) {
          const { data: seal } = await supabase
            .from('match_seals')
            .select('retrieval_key')
            .eq('match_id', matchId)
            .eq('seal_type', 'debate_snapshot')
            .maybeSingle();
          if (seal) setSealKey(seal.retrieval_key);
        }
      } else {
        setRounds(mockDebateRounds);
        setUseMock(true);
        setSealKey(mockSealRetrievalKey);
      }

      setLoading(false);
    }

    fetchData();
  }, [predictionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
      </div>
    );
  }

  const homeName = prediction?.match?.home_team?.short_name ?? '';
  const awayName = prediction?.match?.away_team?.short_name ?? '';
  const cassCode = prediction?.cassandra_code ?? '';

  const lastRound = rounds[rounds.length - 1];
  const debateCompleted = lastRound?.debate_status === 'completed' && lastRound?.consensus_summary;

  const overallStatus = rounds.every((r) => r.debate_status === 'completed')
    ? 'completed'
    : rounds.some((r) => r.debate_status === 'failed')
    ? 'failed'
    : 'ongoing';

  const statusConfig: Record<string, { label: string; color: string }> = {
    completed: { label: 'Tamamlandı', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    ongoing: { label: 'Devam Ediyor', color: 'text-gold-700 bg-gold-50 border-gold-200' },
    failed: { label: 'Başarısız', color: 'text-red-700 bg-red-50 border-red-200' },
  };
  const stCfg = statusConfig[overallStatus] ?? statusConfig.ongoing;

  const avgConfidence = rounds.length > 0
    ? rounds.flatMap((r) => r.persona_outputs)
        .filter((po) => po.confidence !== null)
        .reduce((sum, po, _, arr) => sum + (po.confidence ?? 0) / arr.length, 0)
    : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 flex-wrap">
        <Link to={`/${lang}`} className="hover:text-gray-600 transition-colors">Dashboard</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to={`/${lang}/predictions`} className="hover:text-gray-600 transition-colors">Tahminler</Link>
        {cassCode && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link
              to={`/${lang}/predictions/${predictionId}`}
              className="hover:text-gray-600 transition-colors"
            >
              {cassCode}
            </Link>
          </>
        )}
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">AI Debate</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-navy-600" />
            AI Panel Değerlendirmesi
          </h1>
          <p className="text-gray-500 mt-0.5">
            {homeName && awayName ? `${homeName} vs ${awayName}` : 'Maç değerlendirmesi'}
            {cassCode && ` - ${cassCode}`}
          </p>
        </div>
        <span className={`text-xs font-medium px-3 py-1.5 rounded-lg border self-start ${stCfg.color}`}>
          {stCfg.label}
        </span>
      </div>

      {useMock && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          Gerçek debate verisi bulunamadı. Demo veriler gösterilmektedir.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Değerlendirme Süreci</h2>
            <DebateTimeline rounds={rounds} />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {prediction && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Tahmin Özeti</h3>
              <div className="border-l-4 border-gold-500 pl-3 py-1 mb-3">
                <p className="text-sm text-gray-700 italic leading-relaxed">
                  "{prediction.statement}"
                </p>
              </div>
              <Link
                to={`/${lang}/predictions/${predictionId}`}
                className="text-xs font-medium text-navy-600 hover:text-navy-700 transition-colors"
              >
                Tahmin detayına git
              </Link>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Tur Özeti</h3>
            <div className="space-y-2">
              {rounds.map((r) => {
                const votes = r.persona_outputs.filter((po) => po.vote);
                const onay = votes.filter((po) => po.vote === 'onay').length;
                const red = votes.filter((po) => po.vote === 'red').length;
                const cekimser = votes.filter((po) => po.vote === 'cekimser').length;
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-600">Round {r.round_number}</span>
                    <div className="flex items-center gap-2 text-xs">
                      {onay > 0 && <span className="text-emerald-600 font-medium">{onay} onay</span>}
                      {red > 0 && <span className="text-red-600 font-medium">{red} red</span>}
                      {cekimser > 0 && <span className="text-gray-500 font-medium">{cekimser} cek.</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {debateCompleted && lastRound.consensus_summary && (
            <ConsensusPanel
              consensusSummary={lastRound.consensus_summary}
              consensusReached={lastRound.consensus_reached ?? false}
              averageConfidence={avgConfidence}
              sealRetrievalKey={sealKey}
            />
          )}
        </div>
      </div>
    </div>
  );
}
