import { useEffect, useState } from 'react';
import { Trophy, TrendingUp, MessageSquare, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface StatCard {
  title: string;
  value: string;
  icon: typeof Trophy;
  color: string;
  bgColor: string;
}

export default function DashboardHome() {
  const [stats, setStats] = useState({
    activeMatches: 0,
    predictions: 0,
    debates: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const [wcRes, predictionsRes, debatesRes] = await Promise.all([
        supabase
          .from('wc2026_fixtures')
          .select('id', { count: 'exact', head: true })
          .eq('stage_code', 'Group Stage'),
        supabase
          .from('predictions')
          .select('id', { count: 'exact', head: true })
          .is('superseded_by', null),
        supabase
          .from('debate_rounds')
          .select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        activeMatches: wcRes.count ?? 0,
        predictions: predictionsRes.count ?? 0,
        debates: debatesRes.count ?? 0,
      });
      setLoading(false);
    }

    fetchStats();
  }, []);

  const cards: StatCard[] = [
    {
      title: 'WC2026 Grup Fikstürü',
      value: loading ? '-' : String(stats.activeMatches),
      icon: Trophy,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      title: 'Aktif Tahmin',
      value: loading ? '-' : String(stats.predictions),
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'AI Debate',
      value: loading ? '-' : String(stats.debates),
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
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Yaklaşan Maçlar</h2>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Son Analizler</h2>
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

interface UpcomingWcFixture {
  id: string;
  match_date: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  group_label: string | null;
  round_label: string | null;
  stage_code: string;
}

function UpcomingMatchesList() {
  const [fixtures, setFixtures] = useState<UpcomingWcFixture[]>([]);

  useEffect(() => {
    async function fetchFixtures() {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('wc2026_fixtures')
        .select('id, match_date, home_team_name, away_team_name, group_label, round_label, stage_code')
        .gte('match_date', today)
        .order('match_date', { ascending: true })
        .limit(5);
      setFixtures((data as UpcomingWcFixture[]) ?? []);
    }
    fetchFixtures();
  }, []);

  if (fixtures.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">Yaklaşan WC2026 fikstürü bulunamadı</p>;
  }

  return (
    <>
      {fixtures.map((f) => {
        const homeName = f.home_team_name ?? 'TBD';
        const awayName = f.away_team_name ?? 'TBD';
        const label = f.group_label ? `Grup ${f.group_label}` : (f.round_label ?? f.stage_code);
        return (
          <div key={f.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <TeamBadge name={homeName.slice(0, 3).toUpperCase()} />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {homeName} - {awayName}
                </p>
                <p className="text-xs text-gray-400">
                  {f.match_date
                    ? new Date(f.match_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'TBD'}
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-navy-700 bg-navy-100 px-2 py-1 rounded shrink-0">
              {label}
            </span>
          </div>
        );
      })}
    </>
  );
}

interface RecentPrediction {
  id: string;
  match_id: string;
  prediction_type: string;
  predicted_outcome: string | null;
  confidence: number;
  created_at: string;
}

function RecentPredictionsList() {
  const [predictions, setPredictions] = useState<RecentPrediction[]>([]);

  useEffect(() => {
    async function fetchPredictions() {
      const { data } = await supabase
        .from('predictions')
        .select('id, match_id, prediction_type, predicted_outcome, confidence, created_at')
        .is('superseded_by', null)
        .order('created_at', { ascending: false })
        .limit(5);
      setPredictions((data as RecentPrediction[]) ?? []);
    }
    fetchPredictions();
  }, []);

  if (predictions.length === 0) {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center mb-3">
          <Lock className="w-5 h-5 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-600 mb-1">Tahmin bulunamadı</p>
        <p className="text-xs text-gray-400">
          Model kalibrasyon süreci tamamlandıktan sonra tahminler burada görünecek.
        </p>
      </div>
    );
  }

  return (
    <>
      {predictions.map((p) => (
        <div key={p.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
          <div className="flex-1 min-w-0 mr-3">
            <p className="text-sm font-medium text-gray-900 truncate font-mono">
              {p.prediction_type}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {p.predicted_outcome ?? '—'} · %{Math.round(p.confidence * 100)} güven
            </p>
          </div>
          <span className="text-xs font-medium px-2 py-1 rounded bg-gray-50 text-gray-500">
            {new Date(p.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
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
