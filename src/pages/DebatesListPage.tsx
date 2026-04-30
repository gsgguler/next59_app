import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Loader2, TrendingUp, Eye, ChevronRight, Shield, ArrowUpRight, Zap, Brain, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface DebateRound {
  id: string;
  match_id: string;
  round_number: number;
  persona: string;
  argument_text: string;
  confidence_score: number | null;
  created_at: string;
  match: {
    home_team: { name: string; short_name: string | null; code: string | null } | null;
    away_team: { name: string; short_name: string | null; code: string | null } | null;
  } | null;
}

interface MatchDebateGroup {
  matchId: string;
  rounds: DebateRound[];
  totalRounds: number;
  homeTeam: { name: string; short_name: string | null; code: string | null } | null;
  awayTeam: { name: string; short_name: string | null; code: string | null } | null;
  date: string;
}

export default function DebatesListPage() {
  const { user } = useAuth();
  const [debates, setDebates] = useState<DebateRound[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDebates() {
      setLoading(true);
      const { data } = await supabase
        .from('debate_rounds')
        .select(`
          id, match_id, round_number, persona, argument_text,
          confidence_score, created_at,
          match:matches!debate_rounds_match_id_fkey(
            home_team:teams!matches_home_team_id_fkey(name, short_name, code),
            away_team:teams!matches_away_team_id_fkey(name, short_name, code)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      setDebates((data as unknown as DebateRound[]) ?? []);
      setLoading(false);
    }

    fetchDebates();
  }, []);

  const grouped = debates.reduce<Record<string, DebateRound[]>>((acc, d) => {
    if (!acc[d.match_id]) acc[d.match_id] = [];
    acc[d.match_id].push(d);
    return acc;
  }, {});

  const matchEntries: MatchDebateGroup[] = Object.entries(grouped).map(([matchId, rounds]) => {
    const sorted = rounds.sort((a, b) => a.round_number - b.round_number);
    const first = sorted[0];
    return {
      matchId,
      rounds: sorted,
      totalRounds: sorted.length,
      homeTeam: first.match?.home_team ?? null,
      awayTeam: first.match?.away_team ?? null,
      date: first.created_at,
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
          <p className="text-gray-500 mt-1">{matchEntries.length} degerlendirme</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
        </div>
      ) : matchEntries.length === 0 ? (
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
                  Birden fazla yapay zeka modelinin değerlendirmeleri tartıştığı, oylama yaptığı ve uzlaşma aradığı özel inceleme sürecimize erişim kazanın.
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
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <MessageSquare className="w-12 h-12 mb-3" />
            <p className="text-lg font-medium text-gray-600">Henuz panel degerlendirmesi yok</p>
            <p className="text-sm mt-1 mb-4">Analizler olusturuldukca burada gorunecektir</p>
            <Link
              to="/predictions"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
            >
              <TrendingUp className="w-4 h-4" />
              Analizlere Git
            </Link>
          </div>
        )
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Mac</th>
                  <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Tur Sayisi</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Tarih</th>
                  <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Islem</th>
                </tr>
              </thead>
              <tbody>
                {matchEntries.map((entry) => (
                  <tr key={entry.matchId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900 font-medium">
                        {entry.homeTeam?.short_name ?? entry.homeTeam?.name ?? '?'} vs {entry.awayTeam?.short_name ?? entry.awayTeam?.name ?? '?'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-600">{entry.totalRounds}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(entry.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/debates/${entry.matchId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-600 hover:text-navy-700 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Goruntule
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {matchEntries.map((entry) => (
              <Link
                key={entry.matchId}
                to={`/debates/${entry.matchId}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <p className="text-sm font-medium text-gray-900 mb-1">
                  {entry.homeTeam?.short_name ?? entry.homeTeam?.name ?? '?'} vs {entry.awayTeam?.short_name ?? entry.awayTeam?.name ?? '?'}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{entry.totalRounds} tur</span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
