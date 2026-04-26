import { Clock, Sparkles } from 'lucide-react';
import ConfidenceBadge from './ConfidenceBadge';
import AccessLevelLock from './AccessLevelLock';

interface Team {
  name: string;
  short_name: string;
  tla: string;
  city: string | null;
}

interface PredictionCardProps {
  prediction: {
    id: string;
    statement: string;
    probability: number;
    confidence_label: string;
    access_level: string;
    cassandra_code: string;
    generated_at: string;
    generation_source: string;
    version: number;
    category: string;
  };
  homeTeam?: Team | null;
  awayTeam?: Team | null;
  userTier: string;
}

const tierHierarchy: Record<string, number> = {
  free: 1,
  pro: 2,
  elite: 3,
  b2b_only: 4,
};

function ProbabilityMeter({ probability }: { probability: number }) {
  const pct = Math.round(probability * 100);
  let barColor = 'bg-red-500';
  if (pct > 60) barColor = 'bg-emerald-500';
  else if (pct > 30) barColor = 'bg-yellow-500';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">Olasılık</span>
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

export default function PredictionCard({ prediction, homeTeam, awayTeam, userTier }: PredictionCardProps) {
  const userLevel = tierHierarchy[userTier] ?? 1;
  const reqLevel = tierHierarchy[prediction.access_level] ?? 1;
  const hasAccess = userLevel >= reqLevel;

  const content = (
    <div className="space-y-6">
      <div className="border-l-4 border-gold-500 pl-4 py-1">
        <p className="text-lg font-medium text-gray-900 leading-relaxed italic">
          "{prediction.statement}"
        </p>
      </div>

      <ProbabilityMeter probability={prediction.probability} />

      <div className="flex items-center gap-3 flex-wrap">
        <ConfidenceBadge level={prediction.confidence_label as 'low' | 'medium' | 'high'} />
        <span className="text-xs font-mono text-gold-600 bg-gold-50 px-2.5 py-1 rounded border border-gold-200">
          {prediction.cassandra_code}
        </span>
      </div>

      <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-400 text-xs mb-0.5">Oluşturulma</p>
          <p className="text-gray-700 font-medium">
            {new Date(prediction.generated_at).toLocaleDateString('tr-TR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-0.5">Kaynak</p>
          <p className="text-gray-700 font-medium flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-gold-500" />
            {prediction.generation_source.replace(/_/g, ' ')}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-0.5">Versiyon</p>
          <p className="text-gray-700 font-medium">v{prediction.version}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs mb-0.5">Kategori</p>
          <p className="text-gray-700 font-medium capitalize">{prediction.category.replace(/_/g, ' ')}</p>
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
        <AccessLevelLock requiredTier={prediction.access_level} userTier={userTier}>
          {content}
        </AccessLevelLock>
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
          <span className="text-[10px] font-bold text-navy-700">{homeTeam.tla}</span>
        </div>
        <span className="text-sm font-semibold text-gray-900">{homeTeam.short_name}</span>
      </div>
      <div className="flex items-center gap-1">
        <Clock className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-xs text-gray-400 font-medium">VS</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">{awayTeam.short_name}</span>
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-[10px] font-bold text-gray-600">{awayTeam.tla}</span>
        </div>
      </div>
    </div>
  );
}
