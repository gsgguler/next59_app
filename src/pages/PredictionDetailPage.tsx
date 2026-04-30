import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Loader2, MessageSquare, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PredictionCard from '../components/predictions/PredictionCard';

interface PredictionData {
  id: string;
  match_id: string;
  prediction_type: string;
  predicted_outcome: string;
  confidence: number;
  odds_fair: number | null;
  explanation_json: Record<string, unknown> | null;
  is_elite_only: boolean;
  created_at: string;
  match: {
    id: string;
    match_date: string;
    match_time: string | null;
    status_short: string;
    round: string | null;
    home_score_ft: number | null;
    away_score_ft: number | null;
    home_team: { name: string; short_name: string | null; code: string | null } | null;
    away_team: { name: string; short_name: string | null; code: string | null } | null;
    competition_season: {
      season_code: string;
      competition: { name: string; short_name: string | null; code: string } | null;
    } | null;
  } | null;
}

export default function PredictionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchPrediction() {
      if (!id) return;

      const { data, error: err } = await supabase
        .from('predictions')
        .select(`
          id, match_id, prediction_type, predicted_outcome, confidence,
          odds_fair, explanation_json, is_elite_only, created_at,
          match:matches!predictions_match_id_fkey(
            id, match_date, match_time, status_short, round, home_score_ft, away_score_ft,
            home_team:teams!matches_home_team_id_fkey(name, short_name, code),
            away_team:teams!matches_away_team_id_fkey(name, short_name, code),
            competition_season:competition_seasons!matches_competition_season_id_fkey(
              season_code,
              competition:competitions(name, short_name, code)
            )
          )
        `)
        .eq('id', id)
        .is('superseded_by', null)
        .maybeSingle();

      if (err) {
        setError('Analiz yuklenirken hata olustu');
      } else if (!data) {
        setError('Analiz bulunamadi');
      } else {
        setPrediction(data as unknown as PredictionData);
      }
      setLoading(false);
    }

    fetchPrediction();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <BarChart3 className="w-12 h-12 mb-3" />
        <p className="text-lg font-medium text-gray-600">{error || 'Analiz bulunamadi'}</p>
        <Link to="/predictions" className="mt-4 text-sm text-navy-600 hover:text-navy-700 font-medium">
          Analizlere Dön
        </Link>
      </div>
    );
  }

  const match = prediction.match;
  const homeName = match?.home_team?.short_name ?? match?.home_team?.name ?? 'Ev Sahibi';
  const awayName = match?.away_team?.short_name ?? match?.away_team?.name ?? 'Konuk';
  const compName = match?.competition_season?.competition?.name ?? '';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 flex-wrap">
        <Link to="/" className="hover:text-gray-600 transition-colors">Dashboard</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to="/matches" className="hover:text-gray-600 transition-colors">Maclar</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-600">{homeName} vs {awayName}</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">Analiz</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maç Analizi</h1>
          <p className="text-gray-500 mt-0.5">{compName && `${compName} - `}{homeName} vs {awayName}</p>
        </div>
        <span className="text-sm font-mono text-gold-600 bg-gold-50 border border-gold-200 px-3 py-1.5 rounded-lg self-start">
          {prediction.prediction_type}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {match && (
            <MatchSummaryCard
              homeTeam={match.home_team}
              awayTeam={match.away_team}
              matchDate={match.match_date}
              matchTime={match.match_time}
              statusShort={match.status_short}
              round={match.round}
              compName={compName}
              homeGoals={match.home_score_ft}
              awayGoals={match.away_score_ft}
            />
          )}

          <PredictionCard
            prediction={prediction}
            homeTeam={match?.home_team}
            awayTeam={match?.away_team}
            userTier="free"
          />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <AccessLevelCard isEliteOnly={prediction.is_elite_only} />

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Gecmis Dogruluk</h3>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full border-4 border-emerald-200 flex items-center justify-center">
                <span className="text-lg font-bold text-emerald-600">68%</span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Bu model için ortalama model başarısı</p>
                <p className="text-xs text-gray-400 mt-1">Son 100 analize dayanmaktadır</p>
              </div>
            </div>
          </div>

          <Link
            to={`/debates/${prediction.id}`}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5 hover:border-navy-300 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center group-hover:bg-navy-100 transition-colors">
              <MessageSquare className="w-5 h-5 text-navy-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">AI Debate'i Gor</p>
              <p className="text-xs text-gray-500">Panel degerlendirmesini incele</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-navy-600 transition-colors" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function MatchSummaryCard({
  homeTeam,
  awayTeam,
  matchDate,
  matchTime,
  statusShort,
  round,
  compName,
  homeGoals,
  awayGoals,
}: {
  homeTeam: { name: string; short_name: string | null; code: string | null } | null;
  awayTeam: { name: string; short_name: string | null; code: string | null } | null;
  matchDate: string;
  matchTime: string | null;
  statusShort: string;
  round: string | null;
  compName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}) {
  const kickoffStr = matchTime ? `${matchDate}T${matchTime}` : matchDate;
  const dateStr = new Date(kickoffStr).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: matchTime ? '2-digit' : undefined,
    minute: matchTime ? '2-digit' : undefined,
  });

  const statusLabels: Record<string, { label: string; color: string }> = {
    ns: { label: 'Planli', color: 'text-blue-600 bg-blue-50' },
    ft: { label: 'Bitti', color: 'text-gray-600 bg-gray-100' },
    '1h': { label: 'Canli', color: 'text-red-600 bg-red-50' },
    '2h': { label: 'Canli', color: 'text-red-600 bg-red-50' },
    ht: { label: 'Devre Arasi', color: 'text-orange-600 bg-orange-50' },
    pst: { label: 'Ertelendi', color: 'text-orange-600 bg-orange-50' },
  };
  const st = statusLabels[statusShort.toLowerCase()] ?? statusLabels.ns;
  const isFinished = ['ft', 'aet', 'pen'].includes(statusShort.toLowerCase());

  return (
    <div className="bg-navy-700 rounded-xl p-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-navy-200 bg-navy-600 px-2.5 py-1 rounded">
          {compName}{round ? ` - ${round}` : ''}
        </span>
        <span className={`text-xs font-medium px-2.5 py-1 rounded ${st.color}`}>
          {st.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 text-center">
          <div className="w-14 h-14 rounded-full bg-navy-600 flex items-center justify-center mx-auto mb-2">
            <span className="text-sm font-bold">{homeTeam?.code ?? homeTeam?.name?.slice(0, 3).toUpperCase() ?? '???'}</span>
          </div>
          <p className="font-semibold text-sm">{homeTeam?.short_name ?? homeTeam?.name ?? 'Ev Sahibi'}</p>
        </div>

        <div className="text-center px-4">
          {isFinished ? (
            <p className="text-3xl font-bold">
              {homeGoals ?? 0} - {awayGoals ?? 0}
            </p>
          ) : (
            <p className="text-lg font-medium text-navy-300">VS</p>
          )}
        </div>

        <div className="flex-1 text-center">
          <div className="w-14 h-14 rounded-full bg-navy-600 flex items-center justify-center mx-auto mb-2">
            <span className="text-sm font-bold">{awayTeam?.code ?? awayTeam?.name?.slice(0, 3).toUpperCase() ?? '???'}</span>
          </div>
          <p className="font-semibold text-sm">{awayTeam?.short_name ?? awayTeam?.name ?? 'Konuk'}</p>
        </div>
      </div>

      <p className="text-center text-xs text-navy-300 mt-4">{dateStr}</p>
    </div>
  );
}

function AccessLevelCard({ isEliteOnly }: { isEliteOnly: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Erisim Seviyesi</h3>
      <div className="space-y-2">
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
          !isEliteOnly ? 'bg-gold-50 border border-gold-200 text-gold-700 font-semibold' : 'text-gray-500'
        }`}>
          <div className={`w-2 h-2 rounded-full ${!isEliteOnly ? 'bg-gold-500' : 'bg-gray-200'}`} />
          Ucretsiz
          {!isEliteOnly && (
            <span className="ml-auto text-xs bg-gold-100 text-gold-700 px-2 py-0.5 rounded">Bu analiz</span>
          )}
        </div>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
          isEliteOnly ? 'bg-gold-50 border border-gold-200 text-gold-700 font-semibold' : 'text-gray-500'
        }`}>
          <div className={`w-2 h-2 rounded-full ${isEliteOnly ? 'bg-gold-500' : 'bg-gray-200'}`} />
          Elite
          {isEliteOnly && (
            <span className="ml-auto text-xs bg-gold-100 text-gold-700 px-2 py-0.5 rounded">Bu analiz</span>
          )}
        </div>
      </div>
    </div>
  );
}
