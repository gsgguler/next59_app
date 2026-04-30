import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Eye, BarChart3, Radio, ArrowLeft } from 'lucide-react';
import { useMatch } from '../hooks/useMatch';
import MatchHeader from '../components/match-detail/MatchHeader';
import PreMatchOracle from '../components/match-detail/PreMatchOracle';
import PowerBalance from '../components/match-detail/PowerBalance';
import LivePulse from '../components/match-detail/LivePulse';
import MatchDetailSkeleton from '../components/ui/MatchDetailSkeleton';
import FetchError from '../components/ui/FetchError';

function setMetaTag(attr: 'property' | 'name', key: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

const tabs = [
  { id: 'oracle' as const, label: 'Mac Oncesi Kehanet', icon: Eye },
  { id: 'power' as const, label: 'Guc Dengesi', icon: BarChart3 },
  { id: 'live' as const, label: 'Canli Nabiz', icon: Radio },
];

type TabId = (typeof tabs)[number]['id'];

export default function MatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { match, loading, error } = useMatch(matchId);
  const [activeTab, setActiveTab] = useState<TabId>('oracle');

  useEffect(() => {
    if (match) {
      const title = `${match.home_team.name} vs ${match.away_team.name} | next59 Maç Analizi`;
      document.title = title;

      const ogParams = new URLSearchParams({
        homeTeam: match.home_team.name,
        awayTeam: match.away_team.name,
        prediction: match.prediction
          ? match.prediction.home_prob > match.prediction.away_prob
            ? match.prediction.home_prob > match.prediction.draw_prob ? 'Galibiyet' : 'Beraberlik'
            : match.prediction.away_prob > match.prediction.draw_prob ? 'Maglubiyet' : 'Beraberlik'
          : '',
        probability: match.prediction
          ? String(Math.round(Math.max(match.prediction.home_prob, match.prediction.draw_prob, match.prediction.away_prob)))
          : '',
        matchDate: match.kickoff_at,
        league: '2026 Dunya Kupasi',
      });
      const ogImageUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-match?${ogParams.toString()}`;
      const matchUrl = `https://www.next59.com/mac/${match.id}`;
      const description = `${match.home_team.name} vs ${match.away_team.name} maç analizi ve 90 dakika senaryosu.`;

      setMetaTag('property', 'og:title', title);
      setMetaTag('property', 'og:description', description);
      setMetaTag('property', 'og:image', ogImageUrl);
      setMetaTag('property', 'og:url', matchUrl);
      setMetaTag('property', 'og:type', 'article');
      setMetaTag('name', 'twitter:card', 'summary_large_image');
      setMetaTag('name', 'twitter:title', title);
      setMetaTag('name', 'twitter:description', description);
      setMetaTag('name', 'twitter:image', ogImageUrl);
    } else if (!loading) {
      document.title = 'Mac Bulunamadi | Next59';
    }

    return () => {
      document.title = 'Next59 \u2014 kehanet k\u00e2tibi';
      setMetaTag('property', 'og:title', 'Next59 \u2014 kehanet k\u00e2tibi');
      setMetaTag('property', 'og:description', 'Ma\u00e7\u0131n 90 dakikas\u0131n\u0131, ilk d\u00fcd\u00fckten \u00f6nce yaz\u0131yoruz.');
      setMetaTag('property', 'og:image', 'https://www.next59.com/favicon-512.png');
      setMetaTag('property', 'og:url', 'https://www.next59.com');
      setMetaTag('name', 'twitter:card', 'summary_large_image');
      setMetaTag('name', 'twitter:title', 'Next59 \u2014 kehanet k\u00e2tibi');
      setMetaTag('name', 'twitter:description', 'Ma\u00e7\u0131n 90 dakikas\u0131n\u0131, ilk d\u00fcd\u00fckten \u00f6nce yaz\u0131yoruz.');
      setMetaTag('name', 'twitter:image', 'https://www.next59.com/favicon-512.png');
    };
  }, [match, loading]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [matchId]);

  if (loading) {
    return <MatchDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20">
        <FetchError message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-white mb-3">
          Mac Bulunamadi
        </h1>
        <p className="text-sm text-navy-400 mb-6">
          Aradiginiz mac mevcut degil veya kaldirilmis olabilir.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-champagne hover:text-champagne-light transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Tum Maclara Don
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
