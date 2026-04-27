import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Eye, BarChart3, Radio, ArrowLeft } from 'lucide-react';
import { MOCK_MATCHES } from '../data/mockMatches';
import MatchHeader from '../components/match-detail/MatchHeader';
import PreMatchOracle from '../components/match-detail/PreMatchOracle';
import PowerBalance from '../components/match-detail/PowerBalance';
import LivePulse from '../components/match-detail/LivePulse';

const tabs = [
  { id: 'oracle' as const, label: 'Maç Öncesi Kehanet', icon: Eye },
  { id: 'power' as const, label: 'Güç Dengesi', icon: BarChart3 },
  { id: 'live' as const, label: 'Canlı Nabız', icon: Radio },
];

type TabId = (typeof tabs)[number]['id'];

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const [activeTab, setActiveTab] = useState<TabId>('oracle');

  const match = useMemo(
    () => MOCK_MATCHES.find((m) => m.id === matchId),
    [matchId],
  );

  useEffect(() => {
    if (match) {
      document.title = `${match.home_team.name} vs ${match.away_team.name} — 2026 Dünya Kupası Analizi | Next59`;
    } else {
      document.title = 'Maç Bulunamadı | Next59';
    }
  }, [match]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [matchId]);

  if (!match) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-white mb-3">
          Maç Bulunamadı
        </h1>
        <p className="text-sm text-navy-400 mb-6">
          Aradığınız maç mevcut değil veya kaldırılmış olabilir.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-champagne hover:text-champagne-light transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Tüm Maçlara Dön
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Schema.org */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SportsEvent',
            name: `${match.home_team.name} vs ${match.away_team.name}`,
            startDate: match.kickoff_at,
            eventStatus: 'https://schema.org/EventScheduled',
            homeTeam: { '@type': 'SportsTeam', name: match.home_team.name },
            awayTeam: { '@type': 'SportsTeam', name: match.away_team.name },
            ...(match.stadium && {
              location: {
                '@type': 'Place',
                name: match.stadium.name,
                address: { '@type': 'PostalAddress', addressLocality: match.stadium.city },
              },
            }),
          }),
        }}
      />

      {/* Match header */}
      <MatchHeader match={match} />

      {/* Tab bar */}
      <div className="sticky top-16 z-40 bg-navy-950/95 backdrop-blur-md border-b border-navy-800/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-champagne'
                      : 'text-navy-400 hover:text-white'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ').slice(-1)[0]}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-champagne rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'oracle' && <PreMatchOracle match={match} />}
        {activeTab === 'power' && <PowerBalance match={match} />}
        {activeTab === 'live' && <LivePulse match={match} />}
      </div>
    </>
  );
}
