import { Link } from 'react-router-dom';
import { Clock, Eye } from 'lucide-react';
import type { Match } from '../../pages/MatchListPage';
import ShareMatchCard from '../ShareMatchCard';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Planlı', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  live: { label: 'Canlı', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  finished: { label: 'Bitti', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200' },
  postponed: { label: 'Ertelendi', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  cancelled: { label: 'İptal', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
};

function TeamDisplay({ name, tla, colors, side }: { name: string; tla: string; colors: string | null; side: 'home' | 'away' }) {
  const bgColor = colors?.split('/')[0]?.trim() || (side === 'home' ? '#0d2b4e' : '#374151');

  return (
    <div className={`flex items-center gap-3 ${side === 'away' ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm"
        style={{ backgroundColor: bgColor }}
      >
        <span className="text-[10px] font-bold text-white leading-none">{tla.slice(0, 3)}</span>
      </div>
      <span className="text-sm font-semibold text-gray-900 truncate">{name}</span>
    </div>
  );
}

export default function MatchCard({ match }: { match: Match }) {
  const status = statusConfig[match.status] ?? statusConfig.scheduled;
  const compName = match.competition_season?.competition?.short_name ?? match.competition_season?.competition?.name ?? '';

  const kickoffDate = match.kickoff_at
    ? new Date(match.kickoff_at)
    : null;

  const dateStr = kickoffDate
    ? kickoffDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Tarih belirlenmedi';

  const timeStr = kickoffDate
    ? kickoffDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="relative bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-gray-300 transition-all duration-200 group">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        {compName && (
          <span className="text-xs font-semibold text-navy-600 bg-navy-50 px-2 py-0.5 rounded">
            {compName}
          </span>
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${status.bg} ${status.color}`}>
          {status.label}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <TeamDisplay
              name={match.home_team?.short_name ?? match.home_team?.name ?? 'Ev Sahibi'}
              tla={match.home_team?.tla ?? match.home_team?.name?.slice(0, 3).toUpperCase() ?? '???'}
              colors={match.home_team?.club_colors ?? null}
              side="home"
            />
          </div>

          <div className="flex flex-col items-center px-3 shrink-0">
            {match.status === 'finished' ? (
              <div className="text-xl font-bold text-gray-900">
                {match.home_goals_ft ?? 0} - {match.away_goals_ft ?? 0}
              </div>
            ) : (
              <div className="text-center">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">VS</p>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <TeamDisplay
              name={match.away_team?.short_name ?? match.away_team?.name ?? 'Konuk'}
              tla={match.away_team?.tla ?? match.away_team?.name?.slice(0, 3).toUpperCase() ?? '???'}
              colors={match.away_team?.club_colors ?? null}
              side="away"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{dateStr}{timeStr && ` - ${timeStr}`}</span>
          </div>

          {match.matchweek && (
            <span className="text-xs text-gray-400">Hafta {match.matchweek}</span>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <Link
          to="/predictions"
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 active:bg-navy-800 transition-colors group-hover:bg-gold-500 group-hover:text-navy-900"
        >
          <Eye className="w-4 h-4" />
          Tahmin Gör
        </Link>
      </div>

      <ShareMatchCard
        matchId={match.id}
        homeTeam={match.home_team?.short_name ?? match.home_team?.name ?? 'Ev Sahibi'}
        awayTeam={match.away_team?.short_name ?? match.away_team?.name ?? 'Konuk'}
        prediction=""
        probability=""
        matchDate={match.kickoff_at ?? ''}
        league={compName}
      />
    </div>
  );
}
