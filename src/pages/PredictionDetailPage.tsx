import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Loader2, MessageSquare, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PredictionCard from '../components/predictions/PredictionCard';

interface PredictionData {
  id: string;
  match_id: string;
  statement: string;
  probability: number;
  confidence_label: string;
  access_level: string;
  cassandra_code: string;
  generated_at: string;
  generation_source: string;
  version: number;
  category: string;
  match: {
    id: string;
    kickoff_at: string;
    status: string;
    matchweek: number | null;
    home_goals_ft: number | null;
    away_goals_ft: number | null;
    home_team: { name: string; short_name: string; tla: string; city: string | null } | null;
    away_team: { name: string; short_name: string; tla: string; city: string | null } | null;
    competition_season: {
      season_code: string;
      competition: { name: string; short_name: string; code: string } | null;
    } | null;
  } | null;
}

export default function PredictionDetailPage() {
  const { id, lang } = useParams<{ id: string; lang: string }>();
  const [prediction, setPrediction] = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchPrediction() {
      if (!id) return;

      const { data, error: err } = await supabase
        .from('predictions')
        .select(`
          id, match_id, statement, probability, confidence_label,
          access_level, cassandra_code, generated_at, generation_source,
          version, category,
          match:matches(
            id, kickoff_at, status, matchweek, home_goals_ft, away_goals_ft,
            home_team:teams!matches_home_team_id_fkey(name, short_name, tla, city),
            away_team:teams!matches_away_team_id_fkey(name, short_name, tla, city),
            competition_season:competition_seasons(
              season_code,
              competition:competitions(name, short_name, code)
            )
          )
        `)
        .eq('id', id)
        .eq('is_current', true)
        .maybeSingle();

      if (err) {
        setError('Tahmin yüklenirken hata oluştu');
      } else if (!data) {
        setError('Tahmin bulunamadı');
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
        <p className="text-lg font-medium text-gray-600">{error || 'Tahmin bulunamadı'}</p>
        <Link to={`/${lang}/predictions`} className="mt-4 text-sm text-navy-600 hover:text-navy-700 font-medium">
          Tahminlere dön
        </Link>
      </div>
    );
  }

  const match = prediction.match;
  const homeName = match?.home_team?.short_name ?? 'Ev Sahibi';
  const awayName = match?.away_team?.short_name ?? 'Konuk';
  const compName = match?.competition_season?.competition?.name ?? '';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 flex-wrap">
        <Link to={`/${lang}`} className="hover:text-gray-600 transition-colors">Dashboard</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to={`/${lang}/matches`} className="hover:text-gray-600 transition-colors">Maçlar</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-600">{homeName} vs {awayName}</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">Tahmin</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maç Tahmini</h1>
          <p className="text-gray-500 mt-0.5">{compName && `${compName} - `}{homeName} vs {awayName}</p>
        </div>
        <span className="text-sm font-mono text-gold-600 bg-gold-50 border border-gold-200 px-3 py-1.5 rounded-lg self-start">
          {prediction.cassandra_code}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {match && (
            <MatchSummaryCard
              homeTeam={match.home_team}
              awayTeam={match.away_team}
              kickoffAt={match.kickoff_at}
              status={match.status}
              matchweek={match.matchweek}
              compName={compName}
              homeGoals={match.home_goals_ft}
              awayGoals={match.away_goals_ft}
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
          <AccessLevelCard accessLevel={prediction.access_level} />

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Geçmiş Doğruluk</h3>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full border-4 border-emerald-200 flex items-center justify-center">
                <span className="text-lg font-bold text-emerald-600">68%</span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Bu model için ortalama doğruluk oranı</p>
                <p className="text-xs text-gray-400 mt-1">Son 100 tahmine dayanmaktadir</p>
              </div>
            </div>
          </div>

          <Link
            to={`/${lang}/debates/${prediction.id}`}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-5 hover:border-navy-300 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center group-hover:bg-navy-100 transition-colors">
              <MessageSquare className="w-5 h-5 text-navy-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">AI Debate'i Gör</p>
              <p className="text-xs text-gray-500">Panel değerlendirmesini incele</p>
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
  kickoffAt,
  status,
  matchweek,
  compName,
  homeGoals,
  awayGoals,
}: {
  homeTeam: { name: string; short_name: string; tla: string; city: string | null } | null;
  awayTeam: { name: string; short_name: string; tla: string; city: string | null } | null;
  kickoffAt: string;
  status: string;
  matchweek: number | null;
  compName: string;
  homeGoals: number | null;
  awayGoals: number | null;
}) {
  const dateStr = new Date(kickoffAt).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const statusLabels: Record<string, { label: string; color: string }> = {
    scheduled: { label: 'Planlı', color: 'text-blue-600 bg-blue-50' },
    live: { label: 'Canlı', color: 'text-red-600 bg-red-50' },
    finished: { label: 'Bitti', color: 'text-gray-600 bg-gray-100' },
    postponed: { label: 'Ertelendi', color: 'text-orange-600 bg-orange-50' },
  };
  const st = statusLabels[status] ?? statusLabels.scheduled;

  return (
    <div className="bg-navy-700 rounded-xl p-6 text-white">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-navy-200 bg-navy-600 px-2.5 py-1 rounded">
          {compName}{matchweek ? ` - Hafta ${matchweek}` : ''}
        </span>
        <span className={`text-xs font-medium px-2.5 py-1 rounded ${st.color}`}>
          {st.label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 text-center">
          <div className="w-14 h-14 rounded-full bg-navy-600 flex items-center justify-center mx-auto mb-2">
            <span className="text-sm font-bold">{homeTeam?.tla ?? '???'}</span>
          </div>
          <p className="font-semibold text-sm">{homeTeam?.short_name ?? 'Ev Sahibi'}</p>
          <p className="text-xs text-navy-300">{homeTeam?.city ?? ''}</p>
        </div>

        <div className="text-center px-4">
          {status === 'finished' ? (
            <p className="text-3xl font-bold">
              {homeGoals ?? 0} - {awayGoals ?? 0}
            </p>
          ) : (
            <p className="text-lg font-medium text-navy-300">VS</p>
          )}
        </div>

        <div className="flex-1 text-center">
          <div className="w-14 h-14 rounded-full bg-navy-600 flex items-center justify-center mx-auto mb-2">
            <span className="text-sm font-bold">{awayTeam?.tla ?? '???'}</span>
          </div>
          <p className="font-semibold text-sm">{awayTeam?.short_name ?? 'Konuk'}</p>
          <p className="text-xs text-navy-300">{awayTeam?.city ?? ''}</p>
        </div>
      </div>

      <p className="text-center text-xs text-navy-300 mt-4">{dateStr}</p>
    </div>
  );
}

function AccessLevelCard({ accessLevel }: { accessLevel: string }) {
  const levels = [
    { code: 'free', label: 'Ücretsiz', tier: 1 },
    { code: 'pro', label: 'Pro', tier: 2 },
    { code: 'elite', label: 'Elite', tier: 3 },
    { code: 'b2b_only', label: 'B2B', tier: 4 },
  ];

  const currentIdx = levels.findIndex((l) => l.code === accessLevel);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Erişim Seviyesi</h3>
      <div className="space-y-2">
        {levels.map((level, i) => {
          const isActive = i === currentIdx;
          const isPast = i < currentIdx;
          return (
            <div
              key={level.code}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-gold-50 border border-gold-200 text-gold-700 font-semibold'
                  : isPast
                  ? 'text-gray-400'
                  : 'text-gray-500'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${
                isActive ? 'bg-gold-500' : isPast ? 'bg-gray-300' : 'bg-gray-200'
              }`} />
              {level.label}
              {isActive && (
                <span className="ml-auto text-xs bg-gold-100 text-gold-700 px-2 py-0.5 rounded">
                  Bu tahmin
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
