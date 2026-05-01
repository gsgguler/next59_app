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

const SOURCE_URL = 'https://www.foxsports.com/soccer/fifa-world-cup';
const SOURCE_DATE = '2026-05-01';

// ---------------------------------------------------------------------------
// Group Stage — 72 matches
// Groups: A–L, each with 4 teams, 3 matchdays
// ---------------------------------------------------------------------------

const GROUP_FIXTURES: WC2026Fixture[] = [
  // =========================================================================
  // GROUP A: Mexico, South Africa, South Korea, Czechia
  // =========================================================================
  {
    id: 'wc2026-001', match_no: 1, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-11', kickoff_utc: '2026-06-11T19:00:00.000Z',
    kickoff_local_label: '13:00 CDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Mexico', away_team: 'South Africa',
    home_team_code: 'MEX', away_team_code: 'RSA',
    venue: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico',
    status: 'scheduled', fixture_status: 'confirmed',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-002', match_no: 2, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-11', kickoff_utc: '2026-06-11T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'South Korea', away_team: 'Czechia',
    home_team_code: 'KOR', away_team_code: 'CZE',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-003', match_no: 3, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-15', kickoff_utc: '2026-06-15T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'South Africa', away_team: 'South Korea',
    home_team_code: 'RSA', away_team_code: 'KOR',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-004', match_no: 4, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-15', kickoff_utc: '2026-06-16T01:00:00.000Z',
    kickoff_local_label: '19:00 CDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Mexico', away_team: 'Czechia',
    home_team_code: 'MEX', away_team_code: 'CZE',
    venue: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-005', match_no: 5, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-19', kickoff_utc: '2026-06-19T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'South Korea', away_team: 'Mexico',
    home_team_code: 'KOR', away_team_code: 'MEX',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-006', match_no: 6, stage: 'Group Stage', group: 'A',
    match_date: '2026-06-19', kickoff_utc: '2026-06-20T01:00:00.000Z',
    kickoff_local_label: '19:00 CDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Czechia', away_team: 'South Africa',
    home_team_code: 'CZE', away_team_code: 'RSA',
    venue: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP B: Canada, Switzerland, Qatar, Bosnia and Herzegovina
  // =========================================================================
  {
    id: 'wc2026-007', match_no: 7, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-12', kickoff_utc: '2026-06-12T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Canada', away_team: 'Switzerland',
    home_team_code: 'CAN', away_team_code: 'SUI',
    venue: 'BMO Field', city: 'Toronto', country: 'Canada',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-008', match_no: 8, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-12', kickoff_utc: '2026-06-12T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Qatar', away_team: 'Bosnia and Herzegovina',
    home_team_code: 'QAT', away_team_code: 'BIH',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-009', match_no: 9, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-16', kickoff_utc: '2026-06-16T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Switzerland', away_team: 'Qatar',
    home_team_code: 'SUI', away_team_code: 'QAT',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-010', match_no: 10, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-16', kickoff_utc: '2026-06-16T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Canada', away_team: 'Bosnia and Herzegovina',
    home_team_code: 'CAN', away_team_code: 'BIH',
    venue: 'BMO Field', city: 'Toronto', country: 'Canada',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-011', match_no: 11, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-20', kickoff_utc: '2026-06-20T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Bosnia and Herzegovina', away_team: 'Switzerland',
    home_team_code: 'BIH', away_team_code: 'SUI',
    venue: 'BC Place', city: 'Vancouver', country: 'Canada',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-012', match_no: 12, stage: 'Group Stage', group: 'B',
    match_date: '2026-06-20', kickoff_utc: '2026-06-20T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Qatar', away_team: 'Canada',
    home_team_code: 'QAT', away_team_code: 'CAN',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP C: Brazil, Morocco, Scotland, Haiti
  // =========================================================================
  {
    id: 'wc2026-013', match_no: 13, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-12', kickoff_utc: '2026-06-13T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Brazil', away_team: 'Morocco',
    home_team_code: 'BRA', away_team_code: 'MAR',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-014', match_no: 14, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-13', kickoff_utc: '2026-06-13T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Scotland', away_team: 'Haiti',
    home_team_code: 'SCO', away_team_code: 'HAI',
    venue: 'Lumen Field', city: 'Seattle', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-015', match_no: 15, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-17', kickoff_utc: '2026-06-17T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Morocco', away_team: 'Scotland',
    home_team_code: 'MAR', away_team_code: 'SCO',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-016', match_no: 16, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-17', kickoff_utc: '2026-06-17T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Brazil', away_team: 'Haiti',
    home_team_code: 'BRA', away_team_code: 'HAI',
    venue: 'Levi\'s Stadium', city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-017', match_no: 17, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-21', kickoff_utc: '2026-06-21T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Haiti', away_team: 'Morocco',
    home_team_code: 'HAI', away_team_code: 'MAR',
    venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-018', match_no: 18, stage: 'Group Stage', group: 'C',
    match_date: '2026-06-21', kickoff_utc: '2026-06-21T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Scotland', away_team: 'Brazil',
    home_team_code: 'SCO', away_team_code: 'BRA',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP D: USA, Australia, Paraguay, Türkiye
  // =========================================================================
  {
    id: 'wc2026-019', match_no: 19, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-13', kickoff_utc: '2026-06-13T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'USA', away_team: 'Australia',
    home_team_code: 'USA', away_team_code: 'AUS',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-020', match_no: 20, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-14', kickoff_utc: '2026-06-14T19:00:00.000Z',
    kickoff_local_label: '14:00 CDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Paraguay', away_team: 'Türkiye',
    home_team_code: 'PAR', away_team_code: 'TUR',
    venue: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-021', match_no: 21, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-18', kickoff_utc: '2026-06-18T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Australia', away_team: 'Paraguay',
    home_team_code: 'AUS', away_team_code: 'PAR',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-022', match_no: 22, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-18', kickoff_utc: '2026-06-18T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'USA', away_team: 'Türkiye',
    home_team_code: 'USA', away_team_code: 'TUR',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-023', match_no: 23, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-22', kickoff_utc: '2026-06-22T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Türkiye', away_team: 'Australia',
    home_team_code: 'TUR', away_team_code: 'AUS',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-024', match_no: 24, stage: 'Group Stage', group: 'D',
    match_date: '2026-06-22', kickoff_utc: '2026-06-22T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Paraguay', away_team: 'USA',
    home_team_code: 'PAR', away_team_code: 'USA',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP E: Germany, Ivory Coast, Ecuador, Curaçao
  // =========================================================================
  {
    id: 'wc2026-025', match_no: 25, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-14', kickoff_utc: '2026-06-14T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Germany', away_team: 'Ivory Coast',
    home_team_code: 'GER', away_team_code: 'CIV',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-026', match_no: 26, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-14', kickoff_utc: '2026-06-14T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Ecuador', away_team: 'Curaçao',
    home_team_code: 'ECU', away_team_code: 'CUW',
    venue: 'Levi\'s Stadium', city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-027', match_no: 27, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-18', kickoff_utc: '2026-06-18T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Ivory Coast', away_team: 'Ecuador',
    home_team_code: 'CIV', away_team_code: 'ECU',
    venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-028', match_no: 28, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-19', kickoff_utc: '2026-06-19T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Germany', away_team: 'Curaçao',
    home_team_code: 'GER', away_team_code: 'CUW',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-029', match_no: 29, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-22', kickoff_utc: '2026-06-23T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Curaçao', away_team: 'Ivory Coast',
    home_team_code: 'CUW', away_team_code: 'CIV',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-030', match_no: 30, stage: 'Group Stage', group: 'E',
    match_date: '2026-06-23', kickoff_utc: '2026-06-23T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Ecuador', away_team: 'Germany',
    home_team_code: 'ECU', away_team_code: 'GER',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP F: Netherlands, Japan, Sweden, Tunisia
  // =========================================================================
  {
    id: 'wc2026-031', match_no: 31, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-14', kickoff_utc: '2026-06-15T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Netherlands', away_team: 'Japan',
    home_team_code: 'NED', away_team_code: 'JPN',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-032', match_no: 32, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-15', kickoff_utc: '2026-06-15T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Sweden', away_team: 'Tunisia',
    home_team_code: 'SWE', away_team_code: 'TUN',
    venue: 'BC Place', city: 'Vancouver', country: 'Canada',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-033', match_no: 33, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-19', kickoff_utc: '2026-06-19T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Japan', away_team: 'Sweden',
    home_team_code: 'JPN', away_team_code: 'SWE',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-034', match_no: 34, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-19', kickoff_utc: '2026-06-19T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Netherlands', away_team: 'Tunisia',
    home_team_code: 'NED', away_team_code: 'TUN',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-035', match_no: 35, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-23', kickoff_utc: '2026-06-23T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Tunisia', away_team: 'Japan',
    home_team_code: 'TUN', away_team_code: 'JPN',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-036', match_no: 36, stage: 'Group Stage', group: 'F',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Sweden', away_team: 'Netherlands',
    home_team_code: 'SWE', away_team_code: 'NED',
    venue: 'Lumen Field', city: 'Seattle', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP G: Belgium, Egypt, New Zealand, Iran
  // =========================================================================
  {
    id: 'wc2026-037', match_no: 37, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-15', kickoff_utc: '2026-06-15T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Belgium', away_team: 'Egypt',
    home_team_code: 'BEL', away_team_code: 'EGY',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-038', match_no: 38, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-16', kickoff_utc: '2026-06-16T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'New Zealand', away_team: 'Iran',
    home_team_code: 'NZL', away_team_code: 'IRN',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-039', match_no: 39, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-20', kickoff_utc: '2026-06-20T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Egypt', away_team: 'New Zealand',
    home_team_code: 'EGY', away_team_code: 'NZL',
    venue: 'Levi\'s Stadium', city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-040', match_no: 40, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-20', kickoff_utc: '2026-06-21T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Belgium', away_team: 'Iran',
    home_team_code: 'BEL', away_team_code: 'IRN',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-041', match_no: 41, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Iran', away_team: 'Belgium',
    home_team_code: 'IRN', away_team_code: 'BEL',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-042', match_no: 42, stage: 'Group Stage', group: 'G',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'New Zealand', away_team: 'Egypt',
    home_team_code: 'NZL', away_team_code: 'EGY',
    venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP H: Spain, Saudi Arabia, Uruguay, Cape Verde
  // =========================================================================
  {
    id: 'wc2026-043', match_no: 43, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-15', kickoff_utc: '2026-06-16T01:00:00.000Z',
    kickoff_local_label: '19:00 CDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Spain', away_team: 'Saudi Arabia',
    home_team_code: 'ESP', away_team_code: 'KSA',
    venue: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-044', match_no: 44, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-16', kickoff_utc: '2026-06-16T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Uruguay', away_team: 'Cape Verde',
    home_team_code: 'URU', away_team_code: 'CPV',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-045', match_no: 45, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-20', kickoff_utc: '2026-06-21T00:00:00.000Z',
    kickoff_local_label: '19:00 CDT', kickoff_tr_label: '03:00 TRT',
    home_team: 'Saudi Arabia', away_team: 'Uruguay',
    home_team_code: 'KSA', away_team_code: 'URU',
    venue: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-046', match_no: 46, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-21', kickoff_utc: '2026-06-21T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Spain', away_team: 'Cape Verde',
    home_team_code: 'ESP', away_team_code: 'CPV',
    venue: 'Lumen Field', city: 'Seattle', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-047', match_no: 47, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-25', kickoff_utc: '2026-06-25T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Cape Verde', away_team: 'Saudi Arabia',
    home_team_code: 'CPV', away_team_code: 'KSA',
    venue: 'BC Place', city: 'Vancouver', country: 'Canada',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-048', match_no: 48, stage: 'Group Stage', group: 'H',
    match_date: '2026-06-25', kickoff_utc: '2026-06-25T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Uruguay', away_team: 'Spain',
    home_team_code: 'URU', away_team_code: 'ESP',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP I: France, Senegal, Norway, Iraq
  // =========================================================================
  {
    id: 'wc2026-049', match_no: 49, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-17', kickoff_utc: '2026-06-17T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'France', away_team: 'Senegal',
    home_team_code: 'FRA', away_team_code: 'SEN',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-050', match_no: 50, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-18', kickoff_utc: '2026-06-18T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Norway', away_team: 'Iraq',
    home_team_code: 'NOR', away_team_code: 'IRQ',
    venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-051', match_no: 51, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-22', kickoff_utc: '2026-06-22T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Senegal', away_team: 'Norway',
    home_team_code: 'SEN', away_team_code: 'NOR',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-052', match_no: 52, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-22', kickoff_utc: '2026-06-23T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'France', away_team: 'Iraq',
    home_team_code: 'FRA', away_team_code: 'IRQ',
    venue: 'Levi\'s Stadium', city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-053', match_no: 53, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-26', kickoff_utc: '2026-06-26T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Iraq', away_team: 'Senegal',
    home_team_code: 'IRQ', away_team_code: 'SEN',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-054', match_no: 54, stage: 'Group Stage', group: 'I',
    match_date: '2026-06-26', kickoff_utc: '2026-06-26T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Norway', away_team: 'France',
    home_team_code: 'NOR', away_team_code: 'FRA',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP J: Argentina, Algeria, Austria, Jordan
  // =========================================================================
  {
    id: 'wc2026-055', match_no: 55, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-17', kickoff_utc: '2026-06-18T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Argentina', away_team: 'Algeria',
    home_team_code: 'ARG', away_team_code: 'ALG',
    venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-056', match_no: 56, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-18', kickoff_utc: '2026-06-18T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Austria', away_team: 'Jordan',
    home_team_code: 'AUT', away_team_code: 'JOR',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-057', match_no: 57, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-22', kickoff_utc: '2026-06-22T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Algeria', away_team: 'Austria',
    home_team_code: 'ALG', away_team_code: 'AUT',
    venue: 'Lumen Field', city: 'Seattle', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-058', match_no: 58, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-23', kickoff_utc: '2026-06-23T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Argentina', away_team: 'Jordan',
    home_team_code: 'ARG', away_team_code: 'JOR',
    venue: 'BC Place', city: 'Vancouver', country: 'Canada',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-059', match_no: 59, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Jordan', away_team: 'Algeria',
    home_team_code: 'JOR', away_team_code: 'ALG',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-060', match_no: 60, stage: 'Group Stage', group: 'J',
    match_date: '2026-06-27', kickoff_utc: '2026-06-27T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Austria', away_team: 'Argentina',
    home_team_code: 'AUT', away_team_code: 'ARG',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP K: Portugal, Colombia, Uzbekistan, DR Congo
  // =========================================================================
  {
    id: 'wc2026-061', match_no: 61, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-18', kickoff_utc: '2026-06-19T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Portugal', away_team: 'Colombia',
    home_team_code: 'POR', away_team_code: 'COL',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-062', match_no: 62, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-19', kickoff_utc: '2026-06-19T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Uzbekistan', away_team: 'DR Congo',
    home_team_code: 'UZB', away_team_code: 'COD',
    venue: 'BMO Field', city: 'Toronto', country: 'Canada',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-063', match_no: 63, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-23', kickoff_utc: '2026-06-23T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Colombia', away_team: 'Uzbekistan',
    home_team_code: 'COL', away_team_code: 'UZB',
    venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-064', match_no: 64, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T16:00:00.000Z',
    kickoff_local_label: '12:00 EDT', kickoff_tr_label: '19:00 TRT',
    home_team: 'Portugal', away_team: 'DR Congo',
    home_team_code: 'POR', away_team_code: 'COD',
    venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-065', match_no: 65, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-28', kickoff_utc: '2026-06-28T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'DR Congo', away_team: 'Colombia',
    home_team_code: 'COD', away_team_code: 'COL',
    venue: 'NRG Stadium', city: 'Houston', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-066', match_no: 66, stage: 'Group Stage', group: 'K',
    match_date: '2026-06-28', kickoff_utc: '2026-06-28T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'Uzbekistan', away_team: 'Portugal',
    home_team_code: 'UZB', away_team_code: 'POR',
    venue: 'AT&T Stadium', city: 'Arlington', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },

  // =========================================================================
  // GROUP L: England, Croatia, Ghana, Panama
  // =========================================================================
  {
    id: 'wc2026-067', match_no: 67, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-19', kickoff_utc: '2026-06-19T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'England', away_team: 'Croatia',
    home_team_code: 'ENG', away_team_code: 'CRO',
    venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-068', match_no: 68, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-20', kickoff_utc: '2026-06-20T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Ghana', away_team: 'Panama',
    home_team_code: 'GHA', away_team_code: 'PAN',
    venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-069', match_no: 69, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Croatia', away_team: 'Ghana',
    home_team_code: 'CRO', away_team_code: 'GHA',
    venue: 'Levi\'s Stadium', city: 'Santa Clara', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-070', match_no: 70, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-24', kickoff_utc: '2026-06-24T22:00:00.000Z',
    kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT',
    home_team: 'England', away_team: 'Panama',
    home_team_code: 'ENG', away_team_code: 'PAN',
    venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-071', match_no: 71, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-28', kickoff_utc: '2026-06-29T01:00:00.000Z',
    kickoff_local_label: '21:00 EDT', kickoff_tr_label: '04:00 TRT',
    home_team: 'Panama', away_team: 'Croatia',
    home_team_code: 'PAN', away_team_code: 'CRO',
    venue: 'BMO Field', city: 'Toronto', country: 'Canada',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
  {
    id: 'wc2026-072', match_no: 72, stage: 'Group Stage', group: 'L',
    match_date: '2026-06-29', kickoff_utc: '2026-06-29T19:00:00.000Z',
    kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT',
    home_team: 'Ghana', away_team: 'England',
    home_team_code: 'GHA', away_team_code: 'ENG',
    venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA',
    status: 'scheduled', fixture_status: 'needs_review',
    source_url: SOURCE_URL, source_checked_at: SOURCE_DATE,
  },
];

// ---------------------------------------------------------------------------
// Knockout Stage — 32 matches (TBD teams)
// Round of 32: matches 73–88
// Round of 16: matches 89–96
// Quarter-finals: 97–100
// Semi-finals: 101–102
// Third Place: 103
// Final: 104
// ---------------------------------------------------------------------------

const KNOCKOUT_FIXTURES: WC2026Fixture[] = [
  // Round of 32 (16 matches)
  { id: 'wc2026-073', match_no: 73, stage: 'Round of 32', group: null, match_date: '2026-07-04', kickoff_utc: '2026-07-04T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-074', match_no: 74, stage: 'Round of 32', group: null, match_date: '2026-07-04', kickoff_utc: '2026-07-04T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'AT&T Stadium', city: 'Arlington', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-075', match_no: 75, stage: 'Round of 32', group: null, match_date: '2026-07-05', kickoff_utc: '2026-07-05T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-076', match_no: 76, stage: 'Round of 32', group: null, match_date: '2026-07-05', kickoff_utc: '2026-07-05T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Levi\'s Stadium', city: 'Santa Clara', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-077', match_no: 77, stage: 'Round of 32', group: null, match_date: '2026-07-06', kickoff_utc: '2026-07-06T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-078', match_no: 78, stage: 'Round of 32', group: null, match_date: '2026-07-06', kickoff_utc: '2026-07-06T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-079', match_no: 79, stage: 'Round of 32', group: null, match_date: '2026-07-07', kickoff_utc: '2026-07-07T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'NRG Stadium', city: 'Houston', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-080', match_no: 80, stage: 'Round of 32', group: null, match_date: '2026-07-07', kickoff_utc: '2026-07-07T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-081', match_no: 81, stage: 'Round of 32', group: null, match_date: '2026-07-08', kickoff_utc: '2026-07-08T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Gillette Stadium', city: 'Foxborough', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-082', match_no: 82, stage: 'Round of 32', group: null, match_date: '2026-07-08', kickoff_utc: '2026-07-08T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-083', match_no: 83, stage: 'Round of 32', group: null, match_date: '2026-07-09', kickoff_utc: '2026-07-09T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Lumen Field', city: 'Seattle', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-084', match_no: 84, stage: 'Round of 32', group: null, match_date: '2026-07-09', kickoff_utc: '2026-07-09T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'BC Place', city: 'Vancouver', country: 'Canada', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-085', match_no: 85, stage: 'Round of 32', group: null, match_date: '2026-07-10', kickoff_utc: '2026-07-10T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'BMO Field', city: 'Toronto', country: 'Canada', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-086', match_no: 86, stage: 'Round of 32', group: null, match_date: '2026-07-10', kickoff_utc: '2026-07-10T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-087', match_no: 87, stage: 'Round of 32', group: null, match_date: '2026-07-11', kickoff_utc: '2026-07-11T19:00:00.000Z', kickoff_local_label: '14:00 CDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-088', match_no: 88, stage: 'Round of 32', group: null, match_date: '2026-07-11', kickoff_utc: '2026-07-12T01:00:00.000Z', kickoff_local_label: '19:00 CDT', kickoff_tr_label: '04:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Round of 16 (8 matches)
  { id: 'wc2026-089', match_no: 89, stage: 'Round of 16', group: null, match_date: '2026-07-14', kickoff_utc: '2026-07-14T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-090', match_no: 90, stage: 'Round of 16', group: null, match_date: '2026-07-14', kickoff_utc: '2026-07-14T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'AT&T Stadium', city: 'Arlington', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-091', match_no: 91, stage: 'Round of 16', group: null, match_date: '2026-07-15', kickoff_utc: '2026-07-15T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-092', match_no: 92, stage: 'Round of 16', group: null, match_date: '2026-07-15', kickoff_utc: '2026-07-15T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'NRG Stadium', city: 'Houston', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-093', match_no: 93, stage: 'Round of 16', group: null, match_date: '2026-07-16', kickoff_utc: '2026-07-16T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-094', match_no: 94, stage: 'Round of 16', group: null, match_date: '2026-07-16', kickoff_utc: '2026-07-16T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Levi\'s Stadium', city: 'Santa Clara', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-095', match_no: 95, stage: 'Round of 16', group: null, match_date: '2026-07-17', kickoff_utc: '2026-07-17T19:00:00.000Z', kickoff_local_label: '15:00 EDT', kickoff_tr_label: '22:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-096', match_no: 96, stage: 'Round of 16', group: null, match_date: '2026-07-17', kickoff_utc: '2026-07-17T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Quarter-finals (4 matches)
  { id: 'wc2026-097', match_no: 97, stage: 'Quarter-final', group: null, match_date: '2026-07-21', kickoff_utc: '2026-07-21T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-098', match_no: 98, stage: 'Quarter-final', group: null, match_date: '2026-07-22', kickoff_utc: '2026-07-22T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-099', match_no: 99, stage: 'Quarter-final', group: null, match_date: '2026-07-23', kickoff_utc: '2026-07-23T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'AT&T Stadium', city: 'Arlington', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-100', match_no: 100, stage: 'Quarter-final', group: null, match_date: '2026-07-24', kickoff_utc: '2026-07-24T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'NRG Stadium', city: 'Houston', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Semi-finals (2 matches)
  { id: 'wc2026-101', match_no: 101, stage: 'Semi-final', group: null, match_date: '2026-07-28', kickoff_utc: '2026-07-28T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
  { id: 'wc2026-102', match_no: 102, stage: 'Semi-final', group: null, match_date: '2026-07-29', kickoff_utc: '2026-07-29T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'SoFi Stadium', city: 'Inglewood', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Third Place
  { id: 'wc2026-103', match_no: 103, stage: 'Third Place', group: null, match_date: '2026-08-01', kickoff_utc: '2026-08-01T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'Hard Rock Stadium', city: 'Miami', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },

  // Final
  { id: 'wc2026-104', match_no: 104, stage: 'Final', group: null, match_date: '2026-08-02', kickoff_utc: '2026-08-02T22:00:00.000Z', kickoff_local_label: '18:00 EDT', kickoff_tr_label: '01:00 TRT', home_team: 'TBD', away_team: 'TBD', home_team_code: 'TBD', away_team_code: 'TBD', venue: 'MetLife Stadium', city: 'East Rutherford', country: 'USA', status: 'scheduled', fixture_status: 'needs_review', source_url: SOURCE_URL, source_checked_at: SOURCE_DATE },
];

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

export function formatFixtureDateTR(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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
