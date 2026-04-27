import { Helmet } from 'react-helmet-async';

interface Props {
  match: {
    home_team: string; away_team: string; home_team_logo?: string; away_team_logo?: string;
    venue?: string; venue_address?: string; competition: string; kickoff_at: string;
    status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  };
}

export function SportsEventSchema({ match }: Props) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${match.home_team} vs ${match.away_team}`,
    description: `${match.competition} match: ${match.home_team} - ${match.away_team}`,
    startDate: match.kickoff_at,
    eventStatus: match.status === 'FINISHED' ? 'https://schema.org/EventCompleted' : match.status === 'LIVE' ? 'https://schema.org/EventInProgress' : 'https://schema.org/EventScheduled',
    location: match.venue ? { '@type': 'Place', name: match.venue, address: match.venue_address } : undefined,
    homeTeam: { '@type': 'SportsTeam', name: match.home_team, logo: match.home_team_logo },
    awayTeam: { '@type': 'SportsTeam', name: match.away_team, logo: match.away_team_logo },
    sport: 'Football',
    organizer: { '@type': 'Organization', name: match.competition },
  };

  return <Helmet><script type="application/ld+json">{JSON.stringify(schema)}</script></Helmet>;
}
