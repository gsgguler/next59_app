import { Link } from 'react-router-dom';
import { Lock, ChevronRight } from 'lucide-react';

interface PredictionListCardProps {
  prediction: {
    id: string;
    prediction_type: string;
    predicted_outcome: string;
    confidence: number;
    is_elite_only: boolean;
    created_at: string;
    match: {
      home_team: { name: string; short_name: string | null; code: string | null } | null;
      away_team: { name: string; short_name: string | null; code: string | null } | null;
    } | null;
  };
  userTier: string;
}

export default function PredictionListCard({ prediction, userTier }: PredictionListCardProps) {
  const hasAccess = !prediction.is_elite_only || userTier === 'elite';

  const pct = Math.round(prediction.confidence * 100);
  const homeCode = prediction.match?.home_team?.code ?? prediction.match?.home_team?.name?.slice(0, 3).toUpperCase() ?? '???';
  const awayCode = prediction.match?.away_team?.code ?? prediction.match?.away_team?.name?.slice(0, 3).toUpperCase() ?? '???';
  const homeName = prediction.match?.home_team?.short_name ?? prediction.match?.home_team?.name ?? '';
  const awayName = prediction.match?.away_team?.short_name ?? prediction.match?.away_team?.name ?? '';

  const typeLabel: Record<string, string> = {
    match_result: 'Mac Sonucu',
    over_under: 'Gol Ustu/Alti',
    btts: 'KG Var/Yok',
  };

  return (
    <Link
      to={`/predictions/${prediction.id}`}
      className="block bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 overflow-hidden group"
    >
      <div className="flex items-center gap-4 p-4">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-full bg-navy-100 flex items-center justify-center">
            <span className="text-[10px] font-bold text-navy-700">{homeCode}</span>
          </div>
          <span className="text-xs text-gray-400 font-medium">vs</span>
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <span className="text-[10px] font-bold text-gray-600">{awayCode}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs text-gray-500">{homeName} vs {awayName}</p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
              prediction.is_elite_only
                ? 'text-gold-700 bg-gold-50 border-gold-200'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200'
            }`}>
              {prediction.is_elite_only ? 'Elite' : 'Ucretsiz'}
            </span>
          </div>
          {hasAccess ? (
            <p className="text-sm font-medium text-gray-900 truncate">
              {typeLabel[prediction.prediction_type] ?? prediction.prediction_type}: {prediction.predicted_outcome}
            </p>
          ) : (
            <p className="text-sm font-medium text-gray-400 truncate blur-sm select-none">
              {typeLabel[prediction.prediction_type] ?? prediction.prediction_type}: Kilitli
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {hasAccess ? (
            <>
              <div className="text-right hidden sm:block">
                <p className="text-lg font-bold text-gray-900">%{pct}</p>
                <span className="text-[10px] text-gray-500">guven</span>
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
