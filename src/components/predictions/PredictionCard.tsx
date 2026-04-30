import { Clock, Sparkles } from 'lucide-react';

interface Team {
  name: string;
  short_name: string | null;
  code: string | null;
}

interface PredictionCardProps {
  prediction: {
    id: string;
    prediction_type: string;
    predicted_outcome: string;
    confidence: number;
    odds_fair: number | null;
    is_elite_only: boolean;
    created_at: string;
  };
  homeTeam?: Team | null;
  awayTeam?: Team | null;
  userTier: string;
}

function ProbabilityMeter({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  let barColor = 'bg-red-500';
  if (pct > 60) barColor = 'bg-emerald-500';
  else if (pct > 30) barColor = 'bg-yellow-500';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">Guven</span>
        <span className="text-lg font-bold text-gray-900">%{pct}</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 font-medium">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

const typeLabels: Record<string, string> = {
  match_result: 'Mac Sonucu',
  over_under: 'Gol Ustu/Alti',
  btts: 'KG Var/Yok',
};

export default function PredictionCard({ prediction, homeTeam, awayTeam, userTier }: PredictionCardProps) {
  const hasAccess = !prediction.is_elite_only || userTier === 'elite';

  const content = (
    <div className="space-y-6">
      <div className="border-l-4 border-gold-500 pl-4 py-1">
        <p className="text-sm font-medium text-gray-500 mb-1">
          {typeLabels[prediction.prediction_type] ?? prediction.prediction_type}
        </p>
        <p className="text-lg font-medium text-gray-900 leading-relaxed">
          {prediction.predicted_outcome}
        </p>
      </div>

      <ProbabilityMeter confidence={prediction.confidence} />

      {prediction.odds_fair && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Adil Oran:</span>
          <span className="text-sm font-semibold text-gray-900">{prediction.odds_fair.toFixed(2)}</span>
        </div>
      )}

      <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-400 text-xs mb-0.5">Olusturulma</p>
          <p className="text-gray-700 font-medium flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-gold-500" />
            {new Date(prediction.created_at).toLocaleDateString('tr-TR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-0.5">Erisim</p>
          <p className="text-gray-700 font-medium">
            {prediction.is_elite_only ? 'Elite' : 'Ucretsiz'}
          </p>
        </div>
      </div>
    </div>
  );

  if (!hasAccess) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {homeTeam && awayTeam && (
          <MatchHeader homeTeam={homeTeam} awayTeam={awayTeam} />
        )}
        <div className="relative">
          <div className="blur-sm pointer-events-none select-none opacity-50">
            {content}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-gold-200 px-6 py-4 text-center shadow-lg">
              <p className="text-sm font-semibold text-gray-900">Elite Icerik</p>
              <p className="text-xs text-gray-500 mt-1">Bu tahmine erismek icin Elite plana yukseltme yapin</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:border-gold-300 transition-colors">
      {homeTeam && awayTeam && (
        <MatchHeader homeTeam={homeTeam} awayTeam={awayTeam} />
      )}
      {content}
    </div>
  );
}

function MatchHeader({ homeTeam, awayTeam }: { homeTeam: Team; awayTeam: Team }) {
  return (
    <div className="flex items-center justify-center gap-4 mb-6 pb-4 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center">
          <span className="text-[10px] font-bold text-navy-700">{homeTeam.code ?? '?'}</span>
        </div>
        <span className="text-sm font-semibold text-gray-900">{homeTeam.short_name ?? homeTeam.name}</span>
      </div>
      <div className="flex items-center gap-1">
        <Clock className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-xs text-gray-400 font-medium">VS</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">{awayTeam.short_name ?? awayTeam.name}</span>
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-[10px] font-bold text-gray-600">{awayTeam.code ?? '?'}</span>
        </div>
      </div>
    </div>
  );
}
