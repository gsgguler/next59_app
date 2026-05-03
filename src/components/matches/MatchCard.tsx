import { Link } from 'react-router-dom';
import { Clock, Eye } from 'lucide-react';
import type { Match } from '../../pages/MatchListPage';
import ShareMatchCard from '../ShareMatchCard';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  ns:   { label: 'Planli',      color: 'text-blue-300',   bg: 'bg-blue-900/40 border-blue-700/50' },
  tbd:  { label: 'Planli',      color: 'text-blue-300',   bg: 'bg-blue-900/40 border-blue-700/50' },
  '1h': { label: 'Canli',       color: 'text-red-300',    bg: 'bg-red-900/40 border-red-700/50' },
  '2h': { label: 'Canli',       color: 'text-red-300',    bg: 'bg-red-900/40 border-red-700/50' },
  ht:   { label: 'Devre Arasi', color: 'text-amber-300',  bg: 'bg-amber-900/40 border-amber-700/50' },
  ft:   { label: 'Bitti',       color: 'text-slate-400',  bg: 'bg-navy-800/60 border-navy-700/50' },
  aet:  { label: 'Bitti',       color: 'text-slate-400',  bg: 'bg-navy-800/60 border-navy-700/50' },
  pen:  { label: 'Bitti',       color: 'text-slate-400',  bg: 'bg-navy-800/60 border-navy-700/50' },
  pst:  { label: 'Ertelendi',   color: 'text-amber-300',  bg: 'bg-amber-900/40 border-amber-700/50' },
  canc: { label: 'Iptal',       color: 'text-red-300',    bg: 'bg-red-900/40 border-red-700/50' },
};

function TeamDisplay({ name, code, side }: { name: string; code: string; side: 'home' | 'away' }) {
  return (
    <div className={`flex items-center gap-3 ${side === 'away' ? 'flex-row-reverse' : ''}`}>
      <div className="w-10 h-10 rounded-full bg-navy-800 border border-navy-700/60 flex items-center justify-center shrink-0 shadow-sm">
        <span className="text-[10px] font-bold text-white leading-none">{code.slice(0, 3)}</span>
      </div>
      <span className="text-sm font-semibold text-white truncate">{name}</span>
    </div>
  );
}

export default function MatchCard({ match }: { match: Match }) {
  const statusKey = (match.status_short ?? 'ns').toLowerCase();
  const status = statusConfig[statusKey] ?? statusConfig.ns;
  const compName = match.competition_season?.competition?.short_name ?? match.competition_season?.competition?.name ?? '';

  const kickoffDate = match.match_date
    ? new Date(match.match_time ? `${match.match_date}T${match.match_time}` : match.match_date)
    : null;

  const dateStr = kickoffDate
    ? kickoffDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Tarih belirlenmedi';

  const timeStr = match.match_time
    ? kickoffDate!.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '';

  const isFinished = ['ft', 'aet', 'pen'].includes(statusKey);

  return (
    <div className="relative bg-surface-card-solid rounded-xl border border-readable-soft overflow-hidden hover:shadow-lg hover:shadow-navy-950/50 hover:border-readable-hover transition-all duration-200 group">
      <div className="flex items-center justify-between px-4 py-2.5 bg-navy-800/50 border-b border-readable-soft">
        {compName && (
          <span className="text-xs font-semibold text-gold-400 bg-gold-500/10 border border-gold-500/20 px-2 py-0.5 rounded">
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
              code={match.home_team?.code ?? match.home_team?.name?.slice(0, 3).toUpperCase() ?? '???'}
              side="home"
            />
          </div>

          <div className="flex flex-col items-center px-3 shrink-0">
            {isFinished ? (
              <div className="text-xl font-bold text-white">
                {match.home_score_ft ?? 0} - {match.away_score_ft ?? 0}
              </div>
            ) : (
              <div className="text-center">
                <p className="text-xs font-medium text-readable-muted uppercase tracking-wide">VS</p>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <TeamDisplay
              name={match.away_team?.short_name ?? match.away_team?.name ?? 'Konuk'}
              code={match.away_team?.code ?? match.away_team?.name?.slice(0, 3).toUpperCase() ?? '???'}
              side="away"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-readable-soft">
          <div className="flex items-center gap-1.5 text-xs text-readable-muted">
            <Clock className="w-3.5 h-3.5" />
            <span>{dateStr}{timeStr && ` - ${timeStr}`}</span>
          </div>

          {match.round && (
            <span className="text-xs text-readable-muted">{match.round}</span>
          )}
        </div>
      </div>

      <div className="px-4 pb-4">
        <Link
          to={`/matches/${match.id}`}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 active:bg-navy-800 transition-colors group-hover:bg-gold-500 group-hover:text-navy-900"
        >
          <Eye className="w-4 h-4" />
          Maçı İncele
        </Link>
      </div>

      <ShareMatchCard
        matchId={match.id}
        homeTeam={match.home_team?.short_name ?? match.home_team?.name ?? 'Ev Sahibi'}
        awayTeam={match.away_team?.short_name ?? match.away_team?.name ?? 'Konuk'}
        prediction=""
        probability=""
        matchDate={match.match_date ?? ''}
        league={compName}
      />
    </div>
  );
}
