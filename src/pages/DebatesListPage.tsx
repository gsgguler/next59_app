import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Loader2, TrendingUp, Eye, ChevronRight, Shield, ArrowUpRight, Zap, Brain, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface DebateListItem {
  id: string;
  prediction_id: string;
  round_number: number;
  debate_status: string;
  consensus_reached: boolean | null;
  consensus_summary: string | null;
  completed_at: string | null;
  started_at: string;
  prediction: {
    cassandra_code: string;
    match: {
      home_team: { short_name: string; tla: string } | null;
      away_team: { short_name: string; tla: string } | null;
    } | null;
  } | null;
}

const statusBadge: Record<string, { label: string; color: string }> = {
  completed: { label: 'Tamamlandi', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  in_progress: { label: 'Devam Ediyor', color: 'text-gold-700 bg-gold-50 border-gold-200' },
  failed: { label: 'Basarisiz', color: 'text-red-700 bg-red-50 border-red-200' },
};

export default function DebatesListPage() {
  const { user } = useAuth();
  const [debates, setDebates] = useState<DebateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function fetchDebates() {
      setLoading(true);
      let query = supabase
        .from('debate_rounds')
        .select(`
          id, prediction_id, round_number, debate_status,
          consensus_reached, consensus_summary, completed_at, started_at,
          prediction:predictions(
            cassandra_code,
            match:matches(
              home_team:teams!matches_home_team_id_fkey(short_name, tla),
              away_team:teams!matches_away_team_id_fkey(short_name, tla)
            )
          )
        `)
        .order('started_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('debate_status', statusFilter);
      }

      const { data } = await query;
      setDebates((data as unknown as DebateListItem[]) ?? []);
      setLoading(false);
    }

    fetchDebates();
  }, [statusFilter]);

  const groupedByPrediction = debates.reduce<Record<string, DebateListItem[]>>((acc, d) => {
    const key = d.prediction_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  const predictionEntries = Object.entries(groupedByPrediction).map(([predId, rounds]) => {
    const sorted = rounds.sort((a, b) => a.round_number - b.round_number);
    const lastRound = sorted[sorted.length - 1];
    const firstRound = sorted[0];
    return {
      predictionId: predId,
      rounds: sorted,
      totalRounds: sorted.length,
      overallStatus: sorted.every((r) => r.debate_status === 'completed')
        ? 'completed'
        : sorted.some((r) => r.debate_status === 'failed')
        ? 'failed'
        : 'in_progress',
      consensus: lastRound.consensus_reached,
      cassandraCode: firstRound.prediction?.cassandra_code ?? '',
      homeTeam: firstRound.prediction?.match?.home_team,
      awayTeam: firstRound.prediction?.match?.away_team,
      date: firstRound.started_at,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-navy-600" />
            AI Panel Degerlendirmeleri
          </h1>
          <p className="text-gray-500 mt-1">{predictionEntries.length} degerlendirme</p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors self-start"
        >
          <option value="all">Tum Durumlar</option>
          <option value="completed">Tamamlandi</option>
          <option value="in_progress">Devam Ediyor</option>
          <option value="failed">Basarisiz</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
        </div>
      ) : predictionEntries.length === 0 ? (
        user ? (
          <div className="bg-gradient-to-br from-navy-800 via-navy-900 to-gray-900 rounded-2xl border border-navy-700 overflow-hidden">
            <div className="relative px-6 py-12 sm:px-12 sm:py-16">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gold-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-navy-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

              <div className="relative max-w-lg mx-auto text-center">
                <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center mb-6 shadow-lg shadow-gold-500/20">
                  <Shield className="w-10 h-10 text-navy-900" />
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-semibold tracking-wide uppercase mb-4">
                  <Zap className="w-3 h-3" />
                  Elite Ozellik
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                  AI Panel Degerlendirmesi
                </h2>
                <p className="text-gray-400 leading-relaxed mb-8 max-w-md mx-auto">
                  Birden fazla yapay zeka modelinin tahminleri tartistigi, oylama yaptigi ve uzlasma aradigi ozel degerlendirme surecimize erisim kazanin.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                    <Brain className="w-6 h-6 text-gold-400 mb-2 mx-auto" />
                    <p className="text-sm font-medium text-white">Coklu AI Modeli</p>
                    <p className="text-xs text-gray-500 mt-1">5 farkli uzman persona</p>
                  </div>
                  <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                    <Users className="w-6 h-6 text-gold-400 mb-2 mx-auto" />
                    <p className="text-sm font-medium text-white">Panel Oylama</p>
                    <p className="text-xs text-gray-500 mt-1">Onay, red, cekimser</p>
                  </div>
                  <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                    <MessageSquare className="w-6 h-6 text-gold-400 mb-2 mx-auto" />
                    <p className="text-sm font-medium text-white">Detayli Analiz</p>
                    <p className="text-xs text-gray-500 mt-1">Her turun tam metni</p>
                  </div>
                </div>

                <Link
                  to="/settings"
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 text-navy-900 font-bold text-sm hover:from-gold-400 hover:to-gold-500 transition-all shadow-lg shadow-gold-500/25"
                >
                  Elite Plana Yukselt
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <p className="text-xs text-gray-500 mt-3">
                  Mevcut planlar hakkinda bilgi almak icin Ayarlar sayfasini ziyaret edin.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <MessageSquare className="w-12 h-12 mb-3" />
            <p className="text-lg font-medium text-gray-600">Henuz panel degerlendirmesi yok</p>
            <p className="text-sm mt-1 mb-4">Tahminler olusturuldukca burada gorunecektir</p>
            <Link
              to="/predictions"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
            >
              <TrendingUp className="w-4 h-4" />
              Tahminlere Git
            </Link>
          </div>
        )
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Cassandra Kodu</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Mac</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Durum</th>
                  <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Tur</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Uzlasma</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Tarih</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Islem</th>
                </tr>
              </thead>
              <tbody>
                {predictionEntries.map((entry) => {
                  const st = statusBadge[entry.overallStatus] ?? statusBadge.in_progress;
                  return (
                    <tr key={entry.predictionId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gold-600 bg-gold-50 px-2 py-0.5 rounded border border-gold-200">
                          {entry.cassandraCode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-900 font-medium">
                          {entry.homeTeam?.short_name ?? '?'} vs {entry.awayTeam?.short_name ?? '?'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-gray-600">{entry.totalRounds}/3</span>
                      </td>
                      <td className="px-4 py-3">
                        {entry.overallStatus === 'completed' ? (
                          <span className={`text-xs font-medium ${entry.consensus ? 'text-emerald-600' : 'text-orange-600'}`}>
                            {entry.consensus ? 'Onay' : 'Red'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(entry.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/debates/${entry.predictionId}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-600 hover:text-navy-700 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Goruntule
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {predictionEntries.map((entry) => {
              const st = statusBadge[entry.overallStatus] ?? statusBadge.in_progress;
              return (
                <Link
                  key={entry.predictionId}
                  to={`/debates/${entry.predictionId}`}
                  className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-gold-600 bg-gold-50 px-2 py-0.5 rounded border border-gold-200">
                      {entry.cassandraCode}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {entry.homeTeam?.short_name ?? '?'} vs {entry.awayTeam?.short_name ?? '?'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{entry.totalRounds}/3 tur</span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
