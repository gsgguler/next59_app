import { Link } from 'react-router-dom';
import { Lock, ChevronRight } from 'lucide-react';
import ConfidenceBadge from './ConfidenceBadge';

interface PredictionListCardProps {
  prediction: {
    id: string;
    statement: string;
    probability: number;
    confidence_label: string;
    access_level: string;
    cassandra_code: string;
    generated_at: string;
    match: {
      home_team: { short_name: string; tla: string } | null;
      away_team: { short_name: string; tla: string } | null;
    } | null;
  };
  userTier: string;
}

const tierHierarchy: Record<string, number> = {
  free: 1, pro: 2, elite: 3, b2b_only: 4,
};

const accessBadge: Record<string, { label: string; color: string }> = {
  free: { label: 'Ucretsiz', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  pro: { label: 'Pro', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  elite: { label: 'Elite', color: 'text-gold-700 bg-gold-50 border-gold-200' },
  b2b_only: { label: 'B2B', color: 'text-gray-700 bg-gray-50 border-gray-200' },
};

export default function PredictionListCard({ prediction, userTier }: PredictionListCardProps) {
  const userLevel = tierHierarchy[userTier] ?? 1;
  const reqLevel = tierHierarchy[prediction.access_level] ?? 1;
  const hasAccess = userLevel >= reqLevel;
  const badge = accessBadge[prediction.access_level] ?? accessBadge.free;

  const pct = Math.round(prediction.probability * 100);
  const homeTla = prediction.match?.home_team?.tla ?? '???';
  const awayTla = prediction.match?.away_team?.tla ?? '???';
  const homeName = prediction.match?.home_team?.short_name ?? '';
  const awayName = prediction.match?.away_team?.short_name ?? '';

  return (
    <Link
      to={`/predictions/${prediction.id}`}
      className="block bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 overflow-hidden group"
    >
      <div className="flex items-center gap-4 p-4">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-full bg-navy-100 flex items-center justify-center">
            <span className="text-[10px] font-bold text-navy-700">{homeTla}</span>
          </div>
          <span className="text-xs text-gray-400 font-medium">vs</span>
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <span className="text-[10px] font-bold text-gray-600">{awayTla}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs text-gray-500">{homeName} vs {awayName}</p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${badge.color}`}>
              {badge.label}
            </span>
          </div>
          {hasAccess ? (
            <p className="text-sm font-medium text-gray-900 truncate">{prediction.statement}</p>
          ) : (
            <p className="text-sm font-medium text-gray-400 truncate blur-sm select-none">
              {prediction.statement}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {hasAccess ? (
            <>
              <div className="text-right hidden sm:block">
                <p className="text-lg font-bold text-gray-900">%{pct}</p>
                <ConfidenceBadge level={prediction.confidence_label as 'low' | 'medium' | 'high'} size="sm" />
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-navy-500 transition-colors" />
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                <Lock className="w-5 h-5 text-gray-300" />
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-navy-500 transition-colors" />
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
