import { useState } from 'react';
import { Check, Clock, Circle } from 'lucide-react';
import PersonaCard from './PersonaCard';

interface PersonaOutput {
  id: string;
  persona: string;
  analysis_text: string;
  vote: string | null;
  confidence: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  estimated_cost_usd: number | null;
}

export interface DebateRound {
  id: string;
  round_number: number;
  debate_status: string;
  consensus_reached: boolean | null;
  consensus_summary: string | null;
  started_at: string;
  completed_at: string | null;
  persona_outputs: PersonaOutput[];
}

interface DebateTimelineProps {
  rounds: DebateRound[];
}

const roundLabels: Record<number, string> = {
  1: 'Veri Analizi',
  2: 'Strateji Değerlendirmesi',
  3: 'Final Değerlendirmesi',
};

export default function DebateTimeline({ rounds }: DebateTimelineProps) {
  const [expandedRound, setExpandedRound] = useState<string | null>(
    rounds.length > 0 ? rounds[rounds.length - 1].id : null
  );

  return (
    <div className="relative">
      {rounds.map((round, i) => {
        const isLast = i === rounds.length - 1;
        const isExpanded = expandedRound === round.id;
        const isCompleted = round.debate_status === 'completed';
        const isInProgress = round.debate_status === 'in_progress';

        return (
          <div key={round.id} className="relative flex gap-4">
            <div className="flex flex-col items-center shrink-0">
              <button
                onClick={() => setExpandedRound(isExpanded ? null : round.id)}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm z-10 transition-all
                  ${isCompleted
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : isInProgress
                    ? 'bg-gold-500 text-navy-900 ring-4 ring-gold-200 animate-pulse hover:animate-none'
                    : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                  }
                `}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : isInProgress ? (
                  <Clock className="w-5 h-5" />
                ) : isLast && round.round_number >= 3 ? (
                  <span className="text-xs font-bold">F</span>
                ) : (
                  <span>{round.round_number}</span>
                )}
              </button>
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-[24px] ${isCompleted ? 'bg-emerald-300' : 'bg-gray-200'}`} />
              )}
            </div>

            <div className="flex-1 pb-6 min-w-0">
              <button
                onClick={() => setExpandedRound(isExpanded ? null : round.id)}
                className="flex items-center gap-2 mb-2 group"
              >
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-navy-700 transition-colors">
                  Round {round.round_number}: {roundLabels[round.round_number] ?? `Tur ${round.round_number}`}
                </h3>
                <StatusDot status={round.debate_status} />
              </button>

              {round.completed_at && (
                <p className="text-xs text-gray-400 mb-3">
                  {new Date(round.completed_at).toLocaleDateString('tr-TR', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}

              {isExpanded && round.persona_outputs.length > 0 && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {round.persona_outputs.map((po) => (
                    <PersonaCard
                      key={po.id}
                      persona={po.persona}
                      analysisText={po.analysis_text}
                      vote={po.vote}
                      confidence={po.confidence}
                      tokensInput={po.tokens_input}
                      tokensOutput={po.tokens_output}
                      estimatedCostUsd={po.estimated_cost_usd}
                    />
                  ))}
                </div>
              )}

              {isExpanded && round.persona_outputs.length === 0 && (
                <div className="p-4 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-400 flex items-center gap-2">
                  <Circle className="w-4 h-4" />
                  Henüz analiz başlamadı
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === 'completed') {
    return <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Tamamlandı</span>;
  }
  if (status === 'in_progress') {
    return <span className="text-[10px] font-medium text-gold-700 bg-gold-50 px-1.5 py-0.5 rounded">Devam ediyor</span>;
  }
  if (status === 'failed') {
    return <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Başarısız</span>;
  }
  return <span className="text-[10px] font-medium text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">Bekliyor</span>;
}
