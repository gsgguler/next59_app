import { useEffect, useState } from 'react';
import { Trophy, TrendingUp, Target, MessageSquare, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface StatCard {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: typeof Trophy;
  color: string;
  bgColor: string;
}

export default function DashboardHome() {
  const [stats, setStats] = useState({
    activeMatches: 0,
    predictions: 0,
    accuracy: 0,
    debates: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const [matchesRes, predictionsRes, debatesRes] = await Promise.all([
        supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'scheduled'),
        supabase
          .from('predictions')
          .select('id', { count: 'exact', head: true })
          .eq('is_current', true),
        supabase
          .from('debate_rounds')
          .select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        activeMatches: matchesRes.count ?? 0,
        predictions: predictionsRes.count ?? 0,
        accuracy: 73,
        debates: debatesRes.count ?? 0,
      });
      setLoading(false);
    }

    fetchStats();
  }, []);

  const cards: StatCard[] = [
    {
      title: 'Aktif Maclar',
      value: loading ? '-' : String(stats.activeMatches),
      change: '+3 bu hafta',
      trend: 'up',
      icon: Trophy,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Yayinlanan Tahminler',
      value: loading ? '-' : String(stats.predictions),
      change: '+12 bu ay',
      trend: 'up',
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Dogruluk Orani',
      value: loading ? '-' : `%${stats.accuracy}`,
      change: '+2.1% gecen aya gore',
      trend: 'up',
      icon: Target,
      color: 'text-gold-600',
      bgColor: 'bg-gold-50',
    },
    {
      title: 'AI Debate',
      value: loading ? '-' : String(stats.debates),
      change: '5 aktif tartisma',
      trend: 'up',
      icon: MessageSquare,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Platformun genel durumu</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{card.title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {card.value}
                </p>
              </div>
              <div className={`${card.bgColor} p-2.5 rounded-lg`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3">
              {card.trend === 'up' ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-xs font-medium ${card.trend === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
                {card.change}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Yaklasan Maclar</h2>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))
            ) : (
              <UpcomingMatchesList />
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Son Tahminler</h2>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))
            ) : (
              <RecentPredictionsList />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UpcomingMatchesList() {
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('matches')
        .select(`
          id, kickoff_at, status, matchweek,
          home_team:teams!matches_home_team_id_fkey(name, short_name, tla),
          away_team:teams!matches_away_team_id_fkey(name, short_name, tla)
        `)
        .eq('status', 'scheduled')
        .order('kickoff_at', { ascending: true })
        .limit(5);

      setMatches(data ?? []);
    }
    fetch();
  }, []);

  if (matches.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">Yaklasan mac bulunamadi</p>;
  }

  return (
    <>
      {matches.map((m) => (
        <div key={m.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-3">
            <TeamBadge name={m.home_team?.tla || '?'} />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {m.home_team?.short_name || 'Ev Sahibi'} - {m.away_team?.short_name || 'Konuk'}
              </p>
              <p className="text-xs text-gray-400">
                {m.kickoff_at ? new Date(m.kickoff_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-navy-600 bg-navy-50 px-2 py-1 rounded">
            Hafta {m.matchweek || '-'}
          </span>
        </div>
      ))}
    </>
  );
}

function RecentPredictionsList() {
  const [predictions, setPredictions] = useState<any[]>([]);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('predictions')
        .select('id, statement, probability, confidence_label, access_level, generated_at')
        .eq('is_current', true)
        .order('generated_at', { ascending: false })
        .limit(5);

      setPredictions(data ?? []);
    }
    fetch();
  }, []);

  if (predictions.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">Tahmin bulunamadi</p>;
  }

  const confidenceColor: Record<string, string> = {
    high: 'text-emerald-600 bg-emerald-50',
    medium: 'text-yellow-600 bg-yellow-50',
    low: 'text-red-600 bg-red-50',
  };

  return (
    <>
      {predictions.map((p) => (
        <div key={p.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="flex-1 min-w-0 mr-3">
            <p className="text-sm font-medium text-gray-900 truncate">{p.statement}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              %{Math.round(p.probability * 100)} olasilik
            </p>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded capitalize ${confidenceColor[p.confidence_label] || 'text-gray-600 bg-gray-50'}`}>
            {p.confidence_label}
          </span>
        </div>
      ))}
    </>
  );
}

function TeamBadge({ name }: { name: string }) {
  return (
    <div className="w-9 h-9 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-navy-700">{name.slice(0, 3)}</span>
    </div>
  );
}
