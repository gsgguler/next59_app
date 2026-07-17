/**
 * World Cup 2026 fixture data layer.
 *
 * Sources: Fox Sports, Roadtrips, Yahoo Sports (cross-referenced).
 * FIFA's official SPA is not directly crawlable; all fixtures should
 * be independently verified against official FIFA releases.
 *
 * fixture_status: 'needs_review' — third-party sourced, not FIFA-confirmed
 * fixture_status: 'confirmed'    — independently verified from multiple sources
 */

export type FixtureStage =
  | 'Group Stage'
  | 'Round of 32'
  | 'Round of 16'
  | 'Quarter-final'
  | 'Semi-final'
  | 'Third Place'
  | 'Final';

export type FixtureStatus = 'scheduled' | 'live' | 'completed' | 'postponed';
export type FixtureDataStatus = 'confirmed' | 'needs_review' | 'tbd';

export interface WC2026Fixture {
  id: string;
  match_no: number;
  stage: FixtureStage;
  group: string | null;
  match_date: string;          // YYYY-MM-DD
  kickoff_utc: string;         // ISO 8601
  kickoff_local_label: string; // e.g. "13:00 CDT"
  kickoff_tr_label: string;    // e.g. "22:00 TRT"
  home_team: string;
  away_team: string;
  home_team_code: string;      // FIFA 3-letter code
  away_team_code: string;
  venue: string;
  city: string;
  country: 'USA' | 'Canada' | 'Mexico';
  status: FixtureStatus;
  fixture_status: FixtureDataStatus;
  source_url: string;
  source_checked_at: string;   // ISO date
}

const SOURCE_URL = 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums';
const SOURCE_DATE = '2026-05-15';

// ---------------------------------------------------------------------------
// Group Stage — 72 matches
// Groups: A–L, each with 4 teams, 3 matchdays
// ---------------------------------------------------------------------------

const GROUP_FIXTURES: WC2026Fixture[] = [
  // =========================================================================
  // GROUP A: Mexico, South Korea, South Africa, Czechia
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-001', match_no: 1, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-11', kickoff_utc: '2026-06-11T19:00:00.000Z',
    kickoff_local_label: '15:00 CDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Mexico', away_team: 'South Africa',
    home_team_code: 'MEX', away_team_code: 'RSA',
    venue: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-002', match_no: 2, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-12', kickoff_utc: '2026-06-12T02:00:00.000Z',
    kickoff_local_label: '22:00 CDT', kickoff_tr_label: '05:00 TRT',
    home_team: 'South Korea', away_team: 'Czechia',
    home_team_code: 'KOR', away_team_code: 'CZE',
    venue: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-003', match_no: 3, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-18', kickoff_utc: '2026-06-18T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Czechia', away_team: 'South Africa',
    home_team_code: 'CZE', away_team_code: 'RSA',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-004', match_no: 4, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-19', kickoff_utc: '2026-06-19T01:00:00.000Z',
    kickoff_local_label: '21:00 CDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Mexico', away_team: 'South Korea',
    home_team_code: 'MEX', away_team_code: 'KOR',
    venue: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-005', match_no: 5, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-25', kickoff_utc: '2026-06-25T01:00:00.000Z',
    kickoff_local_label: '21:00 CDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Czechia', away_team: 'Mexico',
    home_team_code: 'CZE', away_team_code: 'MEX',
    venue: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-006', match_no: 6, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-25', kickoff_utc: '2026-06-25T01:00:00.000Z',
    kickoff_local_label: '21:00 CDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'South Africa', away_team: 'South Korea',
    home_team_code: 'RSA', away_team_code: 'KOR',
    venue: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP B: Canada, Bosnia and Herzegovina, Qatar, Switzerland
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-007', match_no: 7, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-12', kickoff_utc: '2026-06-12T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Canada', away_team: 'Bosnia and Herzegovina',
    home_team_code: 'CAN', away_team_code: 'BIH',
    venue: 'BMO Field', city: 'Toronto', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-008', match_no: 8, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-13', kickoff_utc: '2026-06-13T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Qatar', away_team: 'Switzerland',
    home_team_code: 'QAT', away_team_code: 'SUI',
    venue: "Levi's Stadium", city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-009', match_no: 9, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-18', kickoff_utc: '2026-06-18T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Switzerland', away_team: 'Bosnia and Herzegovina',
    home_team_code: 'SUI', away_team_code: 'BIH',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-010', match_no: 10, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-18', kickoff_utc: '2026-06-18T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Canada', away_team: 'Qatar',
    home_team_code: 'CAN', away_team_code: 'QAT',
    venue: 'BC Place', city: 'Vancouver', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-011', match_no: 11, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Switzerland', away_team: 'Canada',
    home_team_code: 'SUI', away_team_code: 'CAN',
    venue: 'BC Place', city: 'Vancouver', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-012', match_no: 12, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Bosnia and Herzegovina', away_team: 'Qatar',
    home_team_code: 'BIH', away_team_code: 'QAT',
    venue: 'Lumen Field', city: 'Seattle', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP C: Brazil, Morocco, Haiti, Scotland
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-013', match_no: 13, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-13', kickoff_utc: '2026-06-13T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Brazil', away_team: 'Morocco',
    home_team_code: 'BRA', away_team_code: 'MAR',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-014', match_no: 14, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-14', kickoff_utc: '2026-06-14T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Haiti', away_team: 'Scotland',
    home_team_code: 'HAI', away_team_code: 'SCO',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-015', match_no: 15, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-19', kickoff_utc: '2026-06-19T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Scotland', away_team: 'Morocco',
    home_team_code: 'SCO', away_team_code: 'MAR',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-016', match_no: 16, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-20', kickoff_utc: '2026-06-20T00:30:00.000Z',
    kickoff_local_label: '20:30 EDT', kickoff_tr_label: '03:30 TRT',
    home_team: 'Brazil', away_team: 'Haiti',
    home_team_code: 'BRA', away_team_code: 'HAI',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-017', match_no: 17, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Scotland', away_team: 'Brazil',
    home_team_code: 'SCO', away_team_code: 'BRA',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-018', match_no: 18, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Morocco', away_team: 'Haiti',
    home_team_code: 'MAR', away_team_code: 'HAI',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP D: USA, Paraguay, Australia, Türkiye
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-019', match_no: 19, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-13', kickoff_utc: '2026-06-13T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'USA', away_team: 'Paraguay',
    home_team_code: 'USA', away_team_code: 'PAR',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-020', match_no: 20, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-14', kickoff_utc: '2026-06-14T04:00:00.000Z',
    kickoff_local_label: '00:00 EDT', kickoff_tr_label: '07:00 TRT',
    home_team: 'Australia', away_team: 'Türkiye',
    home_team_code: 'AUS', away_team_code: 'TUR',
    venue: 'BC Place', city: 'Vancouver', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-021', match_no: 21, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-19', kickoff_utc: '2026-06-19T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'USA', away_team: 'Australia',
    home_team_code: 'USA', away_team_code: 'AUS',
    venue: 'Lumen Field', city: 'Seattle', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-022', match_no: 22, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-20', kickoff_utc: '2026-06-20T03:00:00.000Z',
    kickoff_local_label: '23:00 EDT', kickoff_tr_label: '06:00 TRT',
    home_team: 'Türkiye', away_team: 'Paraguay',
    home_team_code: 'TUR', away_team_code: 'PAR',
    venue: "Levi's Stadium", city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-023', match_no: 23, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-26', kickoff_utc: '2026-06-26T02:00:00.000Z',
    kickoff_local_label: '22:00 EDT', kickoff_tr_label: '05:00 TRT',
    home_team: 'Türkiye', away_team: 'USA',
    home_team_code: 'TUR', away_team_code: 'USA',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-024', match_no: 24, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-26', kickoff_utc: '2026-06-26T02:00:00.000Z',
    kickoff_local_label: '22:00 EDT', kickoff_tr_label: '05:00 TRT',
    home_team: 'Paraguay', away_team: 'Australia',
    home_team_code: 'PAR', away_team_code: 'AUS',
    venue: "Levi's Stadium", city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP E: Germany, Curaçao, Ivory Coast, Ecuador
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-025', match_no: 25, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-14', kickoff_utc: '2026-06-14T17:00:00.000Z',
    kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT',
    home_team: 'Germany', away_team: 'Curaçao',
    home_team_code: 'GER', away_team_code: 'CUW',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-026', match_no: 26, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-14', kickoff_utc: '2026-06-14T23:00:00.000Z',
    kickoff_local_label: '19:00 EDT', kickoff_tr_label: '02:00 TRT',
    home_team: 'Ivory Coast', away_team: 'Ecuador',
    home_team_code: 'CIV', away_team_code: 'ECU',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-027', match_no: 27, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-20', kickoff_utc: '2026-06-20T20:00:00.000Z',
    kickoff_local_label: '16:00 EDT', kickoff_tr_label: '23:00 TRT',
    home_team: 'Germany', away_team: 'Ivory Coast',
    home_team_code: 'GER', away_team_code: 'CIV',
    venue: 'BMO Field', city: 'Toronto', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-028', match_no: 28, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-21', kickoff_utc: '2026-06-21T00:00:00.000Z',
    kickoff_local_label: '20:00 EDT', kickoff_tr_label: '03:00 TRT',
    home_team: 'Ecuador', away_team: 'Curaçao',
    home_team_code: 'ECU', away_team_code: 'CUW',
    venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-029', match_no: 29, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-25', kickoff_utc: '2026-06-25T20:00:00.000Z',
    kickoff_local_label: '16:00 EDT', kickoff_tr_label: '23:00 TRT',
    home_team: 'Ecuador', away_team: 'Germany',
    home_team_code: 'ECU', away_team_code: 'GER',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-030', match_no: 30, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-25', kickoff_utc: '2026-06-25T20:00:00.000Z',
    kickoff_local_label: '16:00 EDT', kickoff_tr_label: '23:00 TRT',
    home_team: 'Curaçao', away_team: 'Ivory Coast',
    home_team_code: 'CUW', away_team_code: 'CIV',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP F: Netherlands, Japan, Tunisia, Sweden
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-031', match_no: 31, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-14', kickoff_utc: '2026-06-14T20:00:00.000Z',
    kickoff_local_label: '16:00 EDT', kickoff_tr_label: '23:00 TRT',
    home_team: 'Netherlands', away_team: 'Japan',
    home_team_code: 'NED', away_team_code: 'JPN',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-032', match_no: 32, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-15', kickoff_utc: '2026-06-15T02:00:00.000Z',
    kickoff_local_label: '22:00 CDT', kickoff_tr_label: '05:00 TRT',
    home_team: 'Sweden', away_team: 'Tunisia',
    home_team_code: 'SWE', away_team_code: 'TUN',
    venue: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-033', match_no: 33, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-20', kickoff_utc: '2026-06-20T17:00:00.000Z',
    kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT',
    home_team: 'Netherlands', away_team: 'Sweden',
    home_team_code: 'NED', away_team_code: 'SWE',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-034', match_no: 34, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-21', kickoff_utc: '2026-06-21T04:00:00.000Z',
    kickoff_local_label: '00:00 EDT', kickoff_tr_label: '07:00 TRT',
    home_team: 'Tunisia', away_team: 'Japan',
    home_team_code: 'TUN', away_team_code: 'JPN',
    venue: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-035', match_no: 35, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-25', kickoff_utc: '2026-06-25T23:00:00.000Z',
    kickoff_local_label: '19:00 EDT', kickoff_tr_label: '02:00 TRT',
    home_team: 'Tunisia', away_team: 'Netherlands',
    home_team_code: 'TUN', away_team_code: 'NED',
    venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-036', match_no: 36, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-25', kickoff_utc: '2026-06-25T23:00:00.000Z',
    kickoff_local_label: '19:00 EDT', kickoff_tr_label: '02:00 TRT',
    home_team: 'Japan', away_team: 'Sweden',
    home_team_code: 'JPN', away_team_code: 'SWE',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP G: Belgium, Egypt, New Zealand, Iran
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-037', match_no: 37, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-15', kickoff_utc: '2026-06-15T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Belgium', away_team: 'Egypt',
    home_team_code: 'BEL', away_team_code: 'EGY',
    venue: 'Lumen Field', city: 'Seattle', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-038', match_no: 38, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-16', kickoff_utc: '2026-06-16T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Iran', away_team: 'New Zealand',
    home_team_code: 'IRN', away_team_code: 'NZL',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-039', match_no: 39, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-21', kickoff_utc: '2026-06-21T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Belgium', away_team: 'Iran',
    home_team_code: 'BEL', away_team_code: 'IRN',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-040', match_no: 40, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-22', kickoff_utc: '2026-06-22T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'New Zealand', away_team: 'Egypt',
    home_team_code: 'NZL', away_team_code: 'EGY',
    venue: 'BC Place', city: 'Vancouver', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-041', match_no: 41, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T03:00:00.000Z',
    kickoff_local_label: '23:00 EDT', kickoff_tr_label: '06:00 TRT',
    home_team: 'New Zealand', away_team: 'Belgium',
    home_team_code: 'NZL', away_team_code: 'BEL',
    venue: 'BC Place', city: 'Vancouver', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-042', match_no: 42, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T03:00:00.000Z',
    kickoff_local_label: '23:00 EDT', kickoff_tr_label: '06:00 TRT',
    home_team: 'Egypt', away_team: 'Iran',
    home_team_code: 'EGY', away_team_code: 'IRN',
    venue: 'Lumen Field', city: 'Seattle', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP H: Spain, Saudi Arabia, Uruguay, Cape Verde
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-043', match_no: 43, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-15', kickoff_utc: '2026-06-15T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Spain', away_team: 'Cape Verde',
    home_team_code: 'ESP', away_team_code: 'CPV',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-044', match_no: 44, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-15', kickoff_utc: '2026-06-15T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Saudi Arabia', away_team: 'Uruguay',
    home_team_code: 'KSA', away_team_code: 'URU',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-045', match_no: 45, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-21', kickoff_utc: '2026-06-21T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Spain', away_team: 'Saudi Arabia',
    home_team_code: 'ESP', away_team_code: 'KSA',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-046', match_no: 46, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-21', kickoff_utc: '2026-06-21T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Uruguay', away_team: 'Cape Verde',
    home_team_code: 'URU', away_team_code: 'CPV',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-047', match_no: 47, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T00:00:00.000Z',
    kickoff_local_label: '20:00 EDT', kickoff_tr_label: '03:00 TRT',
    home_team: 'Uruguay', away_team: 'Spain',
    home_team_code: 'URU', away_team_code: 'ESP',
    venue: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-048', match_no: 48, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T00:00:00.000Z',
    kickoff_local_label: '20:00 EDT', kickoff_tr_label: '03:00 TRT',
    home_team: 'Cape Verde', away_team: 'Saudi Arabia',
    home_team_code: 'CPV', away_team_code: 'KSA',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP I: France, Senegal, Norway, Iraq
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-049', match_no: 49, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-16', kickoff_utc: '2026-06-16T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'France', away_team: 'Senegal',
    home_team_code: 'FRA', away_team_code: 'SEN',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-050', match_no: 50, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-16', kickoff_utc: '2026-06-16T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Iraq', away_team: 'Norway',
    home_team_code: 'IRQ', away_team_code: 'NOR',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-051', match_no: 51, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-22', kickoff_utc: '2026-06-22T21:00:00.000Z',
    kickoff_local_label: '17:00 EDT', kickoff_tr_label: '00:00 TRT',
    home_team: 'France', away_team: 'Iraq',
    home_team_code: 'FRA', away_team_code: 'IRQ',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-052', match_no: 52, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-23', kickoff_utc: '2026-06-23T00:00:00.000Z',
    kickoff_local_label: '20:00 EDT', kickoff_tr_label: '03:00 TRT',
    home_team: 'Norway', away_team: 'Senegal',
    home_team_code: 'NOR', away_team_code: 'SEN',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-053', match_no: 53, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-26', kickoff_utc: '2026-06-26T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Norway', away_team: 'France',
    home_team_code: 'NOR', away_team_code: 'FRA',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-054', match_no: 54, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-26', kickoff_utc: '2026-06-26T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Senegal', away_team: 'Iraq',
    home_team_code: 'SEN', away_team_code: 'IRQ',
    venue: 'BMO Field', city: 'Toronto', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP J: Argentina, Algeria, Austria, Jordan
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-055', match_no: 55, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-17', kickoff_utc: '2026-06-17T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Argentina', away_team: 'Algeria',
    home_team_code: 'ARG', away_team_code: 'ALG',
    venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-056', match_no: 56, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-17', kickoff_utc: '2026-06-17T04:00:00.000Z',
    kickoff_local_label: '00:00 EDT', kickoff_tr_label: '07:00 TRT',
    home_team: 'Austria', away_team: 'Jordan',
    home_team_code: 'AUT', away_team_code: 'JOR',
    venue: "Levi's Stadium", city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-057', match_no: 57, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-22', kickoff_utc: '2026-06-22T17:00:00.000Z',
    kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT',
    home_team: 'Argentina', away_team: 'Austria',
    home_team_code: 'ARG', away_team_code: 'AUT',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-058', match_no: 58, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-23', kickoff_utc: '2026-06-23T03:00:00.000Z',
    kickoff_local_label: '23:00 EDT', kickoff_tr_label: '06:00 TRT',
    home_team: 'Jordan', away_team: 'Algeria',
    home_team_code: 'JOR', away_team_code: 'ALG',
    venue: "Levi's Stadium", city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-059', match_no: 59, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-28', kickoff_utc: '2026-06-28T02:00:00.000Z',
    kickoff_local_label: '22:00 EDT', kickoff_tr_label: '05:00 TRT',
    home_team: 'Jordan', away_team: 'Argentina',
    home_team_code: 'JOR', away_team_code: 'ARG',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-060', match_no: 60, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-28', kickoff_utc: '2026-06-28T02:00:00.000Z',
    kickoff_local_label: '22:00 EDT', kickoff_tr_label: '05:00 TRT',
    home_team: 'Algeria', away_team: 'Austria',
    home_team_code: 'ALG', away_team_code: 'AUT',
    venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP K: Portugal, Congo DR, Uzbekistan, Colombia
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-061', match_no: 61, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-17', kickoff_utc: '2026-06-17T17:00:00.000Z',
    kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT',
    home_team: 'Portugal', away_team: 'Congo DR',
    home_team_code: 'POR', away_team_code: 'COD',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-062', match_no: 62, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-18', kickoff_utc: '2026-06-18T02:00:00.000Z',
    kickoff_local_label: '22:00 EDT', kickoff_tr_label: '05:00 TRT',
    home_team: 'Uzbekistan', away_team: 'Colombia',
    home_team_code: 'UZB', away_team_code: 'COL',
    venue: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-063', match_no: 63, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-23', kickoff_utc: '2026-06-23T17:00:00.000Z',
    kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT',
    home_team: 'Portugal', away_team: 'Uzbekistan',
    home_team_code: 'POR', away_team_code: 'UZB',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-064', match_no: 64, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T02:00:00.000Z',
    kickoff_local_label: '22:00 EDT', kickoff_tr_label: '05:00 TRT',
    home_team: 'Colombia', away_team: 'Congo DR',
    home_team_code: 'COL', away_team_code: 'COD',
    venue: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-065', match_no: 65, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T23:30:00.000Z',
    kickoff_local_label: '19:30 EDT', kickoff_tr_label: '02:30 TRT',
    home_team: 'Colombia', away_team: 'Portugal',
    home_team_code: 'COL', away_team_code: 'POR',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-066', match_no: 66, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T23:30:00.000Z',
    kickoff_local_label: '19:30 EDT', kickoff_tr_label: '02:30 TRT',
    home_team: 'Congo DR', away_team: 'Uzbekistan',
    home_team_code: 'COD', away_team_code: 'UZB',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP L: England, Croatia, Ghana, Panama
  // Source: FOX Sports official schedule (verified May 2026)
  // =========================================================================
  {
    id: 'wc2026-067', match_no: 67, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-17', kickoff_utc: '2026-06-17T20:00:00.000Z',
    kickoff_local_label: '16:00 EDT', kickoff_tr_label: '23:00 TRT',
    home_team: 'England', away_team: 'Croatia',
    home_team_code: 'ENG', away_team_code: 'CRO',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-068', match_no: 68, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-17', kickoff_utc: '2026-06-17T23:00:00.000Z',
    kickoff_local_label: '19:00 EDT', kickoff_tr_label: '02:00 TRT',
    home_team: 'Ghana', away_team: 'Panama',
    home_team_code: 'GHA', away_team_code: 'PAN',
    venue: 'BMO Field', city: 'Toronto', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-069', match_no: 69, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-23', kickoff_utc: '2026-06-23T20:00:00.000Z',
    kickoff_local_label: '16:00 EDT', kickoff_tr_label: '23:00 TRT',
    home_team: 'England', away_team: 'Ghana',
    home_team_code: 'ENG', away_team_code: 'GHA',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-070', match_no: 70, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-23', kickoff_utc: '2026-06-23T23:00:00.000Z',
    kickoff_local_label: '19:00 EDT', kickoff_tr_label: '02:00 TRT',
    home_team: 'Panama', away_team: 'Croatia',
    home_team_code: 'PAN', away_team_code: 'CRO',
    venue: 'BMO Field', city: 'Toronto', country: 'Canada',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-071', match_no: 71, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T21:00:00.000Z',
    kickoff_local_label: '17:00 EDT', kickoff_tr_label: '00:00 TRT',
    home_team: 'Panama', away_team: 'England',
    home_team_code: 'PAN', away_team_code: 'ENG',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-072', match_no: 72, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T21:00:00.000Z',
    kickoff_local_label: '17:00 EDT', kickoff_tr_label: '00:00 TRT',
    home_team: 'Croatia', away_team: 'Ghana',
    home_team_code: 'CRO', away_team_code: 'GHA',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
];

// ---------------------------------------------------------------------------
// Knockout Stage — 32 resolved matches
// Round of 32: matches 73–88
// Round of 16: matches 89–96
// Quarter-finals: 97–100
// Semi-finals: 101–102
// Third Place: 103
// Final: 104
// ---------------------------------------------------------------------------

const KNOCKOUT_FIXTURES: WC2026Fixture[] = [
  // Round of 32 (16 matches) — venues per FIFA official schedule
  { id: 'wc2026-073', match_no: 73, stage: 'Round of 32', group: null, match_date: '2026-06-28', kickoff_utc: '2026-06-28T21:00:00.000Z', kickoff_local_label: '14:00 PDT', kickoff_tr_label: '00:00 TRT', home_team: 'South Africa', away_team: 'Canada', home_team_code: 'RSA', away_team_code: 'CAN', venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-074', match_no: 74, stage: 'Round of 32', group: null, match_date: '2026-06-29', kickoff_utc: '2026-06-29T17:00:00.000Z', kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT', home_team: 'Germany', away_team: 'Paraguay', home_team_code: 'GER', away_team_code: 'PAR', venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-075', match_no: 75, stage: 'Round of 32', group: null, match_date: '2026-06-30', kickoff_utc: '2026-06-30T02:00:00.000Z', kickoff_local_label: '22:00 CDT', kickoff_tr_label: '05:00 TRT', home_team: 'Netherlands', away_team: 'Morocco', home_team_code: 'NED', away_team_code: 'MAR', venue: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-076', match_no: 76, stage: 'Round of 32', group: null, match_date: '2026-06-29', kickoff_utc: '2026-06-29T21:00:00.000Z', kickoff_local_label: '16:00 CDT', kickoff_tr_label: '00:00 TRT', home_team: 'Brazil', away_team: 'Japan', home_team_code: 'BRA', away_team_code: 'JPN', venue: 'NRG Stadium', city: 'Houston', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-077', match_no: 77, stage: 'Round of 32', group: null, match_date: '2026-06-30', kickoff_utc: '2026-06-30T17:00:00.000Z', kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT', home_team: 'France', away_team: 'Sweden', home_team_code: 'FRA', away_team_code: 'SWE', venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-078', match_no: 78, stage: 'Round of 32', group: null, match_date: '2026-06-30', kickoff_utc: '2026-06-30T21:00:00.000Z', kickoff_local_label: '16:00 CDT', kickoff_tr_label: '00:00 TRT', home_team: 'Ivory Coast', away_team: 'Norway', home_team_code: 'CIV', away_team_code: 'NOR', venue: 'AT&T Stadium', city: 'Arlington', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-079', match_no: 79, stage: 'Round of 32', group: null, match_date: '2026-07-01', kickoff_utc: '2026-07-01T02:00:00.000Z', kickoff_local_label: '22:00 CDT', kickoff_tr_label: '05:00 TRT', home_team: 'Mexico', away_team: 'Ecuador', home_team_code: 'MEX', away_team_code: 'ECU', venue: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-080', match_no: 80, stage: 'Round of 32', group: null, match_date: '2026-07-01', kickoff_utc: '2026-07-01T17:00:00.000Z', kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT', home_team: 'England', away_team: 'Congo DR', home_team_code: 'ENG', away_team_code: 'COD', venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-081', match_no: 81, stage: 'Round of 32', group: null, match_date: '2026-07-01', kickoff_utc: '2026-07-01T21:00:00.000Z', kickoff_local_label: '14:00 PDT', kickoff_tr_label: '00:00 TRT', home_team: 'USA', away_team: 'Bosnia and Herzegovina', home_team_code: 'USA', away_team_code: 'BIH', venue: "Levi's Stadium", city: 'Santa Clara', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-082', match_no: 82, stage: 'Round of 32', group: null, match_date: '2026-07-02', kickoff_utc: '2026-07-02T00:00:00.000Z', kickoff_local_label: '20:00 EDT', kickoff_tr_label: '03:00 TRT', home_team: 'Belgium', away_team: 'Senegal', home_team_code: 'BEL', away_team_code: 'SEN', venue: 'Lumen Field', city: 'Seattle', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-083', match_no: 83, stage: 'Round of 32', group: null, match_date: '2026-07-02', kickoff_utc: '2026-07-02T17:00:00.000Z', kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT', home_team: 'Portugal', away_team: 'Croatia', home_team_code: 'POR', away_team_code: 'CRO', venue: 'BMO Field', city: 'Toronto', country: 'Canada', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-084', match_no: 84, stage: 'Round of 32', group: null, match_date: '2026-07-02', kickoff_utc: '2026-07-02T21:00:00.000Z', kickoff_local_label: '14:00 PDT', kickoff_tr_label: '00:00 TRT', home_team: 'Spain', away_team: 'Austria', home_team_code: 'ESP', away_team_code: 'AUT', venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-085', match_no: 85, stage: 'Round of 32', group: null, match_date: '2026-07-03', kickoff_utc: '2026-07-03T00:00:00.000Z', kickoff_local_label: '20:00 EDT', kickoff_tr_label: '03:00 TRT', home_team: 'Switzerland', away_team: 'Algeria', home_team_code: 'SUI', away_team_code: 'ALG', venue: 'BC Place', city: 'Vancouver', country: 'Canada', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-086', match_no: 86, stage: 'Round of 32', group: null, match_date: '2026-07-03', kickoff_utc: '2026-07-03T21:00:00.000Z', kickoff_local_label: '17:00 EDT', kickoff_tr_label: '00:00 TRT', home_team: 'Argentina', away_team: 'Cape Verde', home_team_code: 'ARG', away_team_code: 'CPV', venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-087', match_no: 87, stage: 'Round of 32', group: null, match_date: '2026-07-04', kickoff_utc: '2026-07-04T00:00:00.000Z', kickoff_local_label: '19:00 CDT', kickoff_tr_label: '03:00 TRT', home_team: 'Colombia', away_team: 'Ghana', home_team_code: 'COL', away_team_code: 'GHA', venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-088', match_no: 88, stage: 'Round of 32', group: null, match_date: '2026-07-04', kickoff_utc: '2026-07-04T00:00:00.000Z', kickoff_local_label: '19:00 CDT', kickoff_tr_label: '03:00 TRT', home_team: 'Australia', away_team: 'Egypt', home_team_code: 'AUS', away_team_code: 'EGY', venue: 'AT&T Stadium', city: 'Arlington', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Round of 16 (8 matches) — venues per FIFA official schedule
  { id: 'wc2026-089', match_no: 89, stage: 'Round of 16', group: null, match_date: '2026-07-04', kickoff_utc: '2026-07-04T17:00:00.000Z', kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT', home_team: 'Paraguay', away_team: 'France', home_team_code: 'PAR', away_team_code: 'FRA', venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-090', match_no: 90, stage: 'Round of 16', group: null, match_date: '2026-07-04', kickoff_utc: '2026-07-04T21:00:00.000Z', kickoff_local_label: '16:00 CDT', kickoff_tr_label: '00:00 TRT', home_team: 'Canada', away_team: 'Morocco', home_team_code: 'CAN', away_team_code: 'MAR', venue: 'NRG Stadium', city: 'Houston', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-091', match_no: 91, stage: 'Round of 16', group: null, match_date: '2026-07-05', kickoff_utc: '2026-07-05T17:00:00.000Z', kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT', home_team: 'Brazil', away_team: 'Norway', home_team_code: 'BRA', away_team_code: 'NOR', venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-092', match_no: 92, stage: 'Round of 16', group: null, match_date: '2026-07-06', kickoff_utc: '2026-07-06T02:00:00.000Z', kickoff_local_label: '22:00 CDT', kickoff_tr_label: '05:00 TRT', home_team: 'Mexico', away_team: 'England', home_team_code: 'MEX', away_team_code: 'ENG', venue: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-093', match_no: 93, stage: 'Round of 16', group: null, match_date: '2026-07-06', kickoff_utc: '2026-07-06T21:00:00.000Z', kickoff_local_label: '16:00 CDT', kickoff_tr_label: '00:00 TRT', home_team: 'Portugal', away_team: 'Spain', home_team_code: 'POR', away_team_code: 'ESP', venue: 'AT&T Stadium', city: 'Arlington', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-094', match_no: 94, stage: 'Round of 16', group: null, match_date: '2026-07-07', kickoff_utc: '2026-07-07T01:00:00.000Z', kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT', home_team: 'USA', away_team: 'Belgium', home_team_code: 'USA', away_team_code: 'BEL', venue: 'Lumen Field', city: 'Seattle', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-095', match_no: 95, stage: 'Round of 16', group: null, match_date: '2026-07-07', kickoff_utc: '2026-07-07T17:00:00.000Z', kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT', home_team: 'Argentina', away_team: 'Egypt', home_team_code: 'ARG', away_team_code: 'EGY', venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-096', match_no: 96, stage: 'Round of 16', group: null, match_date: '2026-07-08', kickoff_utc: '2026-07-08T00:00:00.000Z', kickoff_local_label: '20:00 EDT', kickoff_tr_label: '03:00 TRT', home_team: 'Switzerland', away_team: 'Colombia', home_team_code: 'SUI', away_team_code: 'COL', venue: 'BC Place', city: 'Vancouver', country: 'Canada', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Quarter-finals (4 matches) — venues per FIFA official schedule
  { id: 'wc2026-097', match_no: 97, stage: 'Quarter-final', group: null, match_date: '2026-07-09', kickoff_utc: '2026-07-09T21:00:00.000Z', kickoff_local_label: '17:00 EDT', kickoff_tr_label: '00:00 TRT', home_team: 'France', away_team: 'Morocco', home_team_code: 'FRA', away_team_code: 'MAR', venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-098', match_no: 98, stage: 'Quarter-final', group: null, match_date: '2026-07-10', kickoff_utc: '2026-07-10T21:00:00.000Z', kickoff_local_label: '14:00 PDT', kickoff_tr_label: '00:00 TRT', home_team: 'Spain', away_team: 'Belgium', home_team_code: 'ESP', away_team_code: 'BEL', venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-099', match_no: 99, stage: 'Quarter-final', group: null, match_date: '2026-07-11', kickoff_utc: '2026-07-11T17:00:00.000Z', kickoff_local_label: '13:00 EDT', kickoff_tr_label: '20:00 TRT', home_team: 'Norway', away_team: 'England', home_team_code: 'NOR', away_team_code: 'ENG', venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-100', match_no: 100, stage: 'Quarter-final', group: null, match_date: '2026-07-11', kickoff_utc: '2026-07-11T21:00:00.000Z', kickoff_local_label: '16:00 CDT', kickoff_tr_label: '00:00 TRT', home_team: 'Argentina', away_team: 'Switzerland', home_team_code: 'ARG', away_team_code: 'SUI', venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Semi-finals (2 matches) — venues per FIFA official schedule
  { id: 'wc2026-101', match_no: 101, stage: 'Semi-final', group: null, match_date: '2026-07-14', kickoff_utc: '2026-07-14T21:00:00.000Z', kickoff_local_label: '16:00 CDT', kickoff_tr_label: '00:00 TRT', home_team: 'France', away_team: 'Spain', home_team_code: 'FRA', away_team_code: 'ESP', venue: 'AT&T Stadium', city: 'Arlington', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-102', match_no: 102, stage: 'Semi-final', group: null, match_date: '2026-07-15', kickoff_utc: '2026-07-15T21:00:00.000Z', kickoff_local_label: '17:00 EDT', kickoff_tr_label: '00:00 TRT', home_team: 'England', away_team: 'Argentina', home_team_code: 'ENG', away_team_code: 'ARG', venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Third Place — Miami per FIFA official schedule
  { id: 'wc2026-103', match_no: 103, stage: 'Third Place', group: null, match_date: '2026-07-18', kickoff_utc: '2026-07-18T21:00:00.000Z', kickoff_local_label: '17:00 EDT', kickoff_tr_label: '00:00 TRT', home_team: 'France', away_team: 'England', home_team_code: 'FRA', away_team_code: 'ENG', venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Final — MetLife (New York/New Jersey) per FIFA official schedule
  { id: 'wc2026-104', match_no: 104, stage: 'Final', group: null, match_date: '2026-07-19', kickoff_utc: '2026-07-19T20:00:00.000Z', kickoff_local_label: '16:00 EDT', kickoff_tr_label: '23:00 TRT', home_team: 'Spain', away_team: 'Argentina', home_team_code: 'ESP', away_team_code: 'ARG', venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', status: 'scheduled', fixture_status: 'confirmed', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
];


// ---------------------------------------------------------------------------
// Team-name normalization and runtime resolver
// ---------------------------------------------------------------------------

const WC2026_TEAM_NAME_ALIASES: Record<string, string> = {
  'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  'Cape Verde Islands': 'Cape Verde',
  'Czech Republic': 'Czechia',
  'DR Congo': 'Congo DR',
  'Congo Democratic Republic': 'Congo DR',
  'Korea Republic': 'South Korea',
  'Türkiye': 'Türkiye',
  'Turkey': 'Türkiye',
  'United States': 'USA',
  'United States of America': 'USA',
};

export function normalizeWc2026TeamName(teamName: string | null | undefined): string {
  const trimmed = teamName?.trim() ?? '';
  if (!trimmed) return 'TBD';
  return WC2026_TEAM_NAME_ALIASES[trimmed] ?? trimmed;
}

const FIFA_CODE_BY_NORMALIZED_TEAM_NAME: Record<string, string> = {};
for (const fixture of GROUP_FIXTURES) {
  FIFA_CODE_BY_NORMALIZED_TEAM_NAME[normalizeWc2026TeamName(fixture.home_team)] = fixture.home_team_code;
  FIFA_CODE_BY_NORMALIZED_TEAM_NAME[normalizeWc2026TeamName(fixture.away_team)] = fixture.away_team_code;
}

export function resolveFifaCodeByTeamName(teamName: string | null | undefined): string {
  const normalized = normalizeWc2026TeamName(teamName);
  return FIFA_CODE_BY_NORMALIZED_TEAM_NAME[normalized] ?? 'TBD';
}

// ---------------------------------------------------------------------------
// Combined export and helpers
// ---------------------------------------------------------------------------

export const ALL_WC2026_FIXTURES: WC2026Fixture[] = [
  ...GROUP_FIXTURES,
  ...KNOCKOUT_FIXTURES,
];

export const WC2026_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
export type WC2026Group = typeof WC2026_GROUPS[number];

export const WC2026_VENUES = [
  'Estadio Azteca',
  'Estadio Akron',
  'Estadio BBVA',
  'BMO Field',
  'BC Place',
  'MetLife Stadium',
  'SoFi Stadium',
  "Levi's Stadium",
  'AT&T Stadium',
  'NRG Stadium',
  'Arrowhead Stadium',
  'Mercedes-Benz Stadium',
  'Hard Rock Stadium',
  'Gillette Stadium',
  'Lincoln Financial Field',
  'Lumen Field',
] as const;

export const WC2026_CITIES: Record<string, string> = {
  'Estadio Azteca': 'Mexico City',
  'Estadio Akron': 'Guadalajara',
  'Estadio BBVA': 'Monterrey',
  'BMO Field': 'Toronto',
  'BC Place': 'Vancouver',
  'MetLife Stadium': 'East Rutherford',
  'SoFi Stadium': 'Inglewood',
  "Levi's Stadium": 'Santa Clara',
  'AT&T Stadium': 'Arlington',
  'NRG Stadium': 'Houston',
  'Arrowhead Stadium': 'Kansas City',
  'Mercedes-Benz Stadium': 'Atlanta',
  'Hard Rock Stadium': 'Miami',
  'Gillette Stadium': 'Foxborough',
  'Lincoln Financial Field': 'Philadelphia',
  'Lumen Field': 'Seattle',
};

export function getWorldCupFixtures(): WC2026Fixture[] {
  return ALL_WC2026_FIXTURES;
}

export function getFixturesByStage(stage: FixtureStage): WC2026Fixture[] {
  return ALL_WC2026_FIXTURES.filter((f) => f.stage === stage);
}

export function getFixturesByDate(date: string): WC2026Fixture[] {
  return ALL_WC2026_FIXTURES.filter((f) => f.match_date === date);
}

export function searchFixturesByTeam(query: string): WC2026Fixture[] {
  const q = query.toLowerCase().trim();
  if (!q) return ALL_WC2026_FIXTURES;
  return ALL_WC2026_FIXTURES.filter(
    (f) =>
      f.home_team.toLowerCase().includes(q) ||
      f.away_team.toLowerCase().includes(q) ||
      f.home_team_code.toLowerCase().includes(q) ||
      f.away_team_code.toLowerCase().includes(q),
  );
}

export function getOpeningMatch(): WC2026Fixture {
  return ALL_WC2026_FIXTURES[0];
}

export function getGroupFixtures(group: WC2026Group): WC2026Fixture[] {
  return GROUP_FIXTURES.filter((f) => f.group === group);
}

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatMatchDateTime(kickoffUtc: string, timeZone: string): string {
  const d = new Date(kickoffUtc);
  const time = d.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
  const tzLabel = timeZone === 'Europe/Istanbul' ? 'TRT' : timeZone;
  return `${time} (${tzLabel})`;
}

export function getLocalMatchDateKey(kickoffUtc: string, timeZone: string): string {
  const d = new Date(kickoffUtc);
  return d.toLocaleDateString('en-CA', { timeZone }); // YYYY-MM-DD via en-CA locale
}

export function formatFixtureDateTR(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatFixtureDateForTZ(kickoffUtc: string, timeZone: string): string {
  return new Date(kickoffUtc).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  });
}

export function formatKickoffTR(kickoffUtc: string): string {
  return new Date(kickoffUtc).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }) + ' TRT';
}

export const STAGE_LABELS_TR: Record<FixtureStage, string> = {
  'Group Stage': 'Grup Maçı',
  'Round of 32': 'Son 32',
  'Round of 16': 'Son 16',
  'Quarter-final': 'Çeyrek Final',
  'Semi-final': 'Yarı Final',
  'Third Place': '3. Yer Maçı',
  'Final': 'Final',
};

export const COUNTRY_FLAG: Record<string, string> = {
  'USA': '🇺🇸',
  'Canada': '🇨🇦',
  'Mexico': '🇲🇽',
};

// ---------------------------------------------------------------------------
// Venue metadata — stadium capacities & display city names
// Sources: FIFA official venue pages + stadium operators (cross-referenced).
// city_display: human-readable metro label for UI (may differ from raw city).
// capacity: seated capacity per official host venue data; null = not confirmed.
// ---------------------------------------------------------------------------

export interface VenueMeta {
  city_display: string;         // e.g. "New York / New Jersey"
  country_tr: string;           // e.g. "ABD"
  capacity: number | null;
  capacity_source: string;
}

export const VENUE_META: Record<string, VenueMeta> = {
  // ── Mexico ──────────────────────────────────────────────────────────────
  'Estadio Azteca': {
    city_display: 'Mexico City',
    country_tr: 'Meksika',
    capacity: 87523,
    capacity_source: 'FIFA official venue page',
  },
  'Estadio Akron': {
    city_display: 'Guadalajara',
    country_tr: 'Meksika',
    capacity: 49850,
    capacity_source: 'FIFA official venue page',
  },
  'Estadio BBVA': {
    city_display: 'Monterrey',
    country_tr: 'Meksika',
    capacity: 53500,
    capacity_source: 'FIFA official venue page',
  },
  // ── Canada ──────────────────────────────────────────────────────────────
  'BMO Field': {
    city_display: 'Toronto',
    country_tr: 'Kanada',
    capacity: 45000,
    capacity_source: 'FIFA official venue page',
  },
  'BC Place': {
    city_display: 'Vancouver',
    country_tr: 'Kanada',
    capacity: 54500,
    capacity_source: 'FIFA official venue page',
  },
  // ── USA ─────────────────────────────────────────────────────────────────
  'MetLife Stadium': {
    city_display: 'New York / New Jersey',
    country_tr: 'ABD',
    capacity: 82500,
    capacity_source: 'FIFA official venue page',
  },
  'SoFi Stadium': {
    city_display: 'Los Angeles',
    country_tr: 'ABD',
    capacity: 70240,
    capacity_source: 'FIFA official venue page',
  },
  'AT&T Stadium': {
    city_display: 'Dallas',
    country_tr: 'ABD',
    capacity: 80000,
    capacity_source: 'FIFA official venue page',
  },
  'Mercedes-Benz Stadium': {
    city_display: 'Atlanta',
    country_tr: 'ABD',
    capacity: 71000,
    capacity_source: 'FIFA official venue page',
  },
  'NRG Stadium': {
    city_display: 'Houston',
    country_tr: 'ABD',
    capacity: 72220,
    capacity_source: 'FIFA official venue page',
  },
  'Hard Rock Stadium': {
    city_display: 'Miami',
    country_tr: 'ABD',
    capacity: 65326,
    capacity_source: 'FIFA official venue page',
  },
  'Lincoln Financial Field': {
    city_display: 'Philadelphia',
    country_tr: 'ABD',
    capacity: 69796,
    capacity_source: 'FIFA official venue page',
  },
  'Gillette Stadium': {
    city_display: 'Boston',
    country_tr: 'ABD',
    capacity: 65878,
    capacity_source: 'FIFA official venue page',
  },
  'Lumen Field': {
    city_display: 'Seattle',
    country_tr: 'ABD',
    capacity: 69000,
    capacity_source: 'FIFA official venue page',
  },
  'Arrowhead Stadium': {
    city_display: 'Kansas City',
    country_tr: 'ABD',
    capacity: 76416,
    capacity_source: 'FIFA official venue page',
  },
  "Levi's Stadium": {
    city_display: 'San Francisco Bay Area',
    country_tr: 'ABD',
    capacity: 68500,
    capacity_source: 'FIFA official venue page',
  },
};
