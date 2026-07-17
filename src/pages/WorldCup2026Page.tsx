import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Trophy,
  Search,
  Filter,
  Calendar,
  Globe,
  ChevronDown,
  Info,
  History,
  ChevronRight,
} from "lucide-react";
import {
  ALL_WC2026_FIXTURES,
  WC2026_GROUPS,
  formatFixtureDateForTZ,
  getUserTimeZone,
  getLocalMatchDateKey,
  formatMatchDateTime,
  VENUE_META,
  normalizeWc2026TeamName,
  resolveFifaCodeByTeamName,
  type WC2026Fixture,
  type FixtureStage,
} from "../data/worldCup2026Fixtures";
import { COUNTRY_BY_FIFA } from "../data/worldCup2026Countries";
import { WC2026FixtureCard } from "../components/wc/WC2026FixtureCard";
import WcPredictionAuditTable from "../components/wc/WcPredictionAuditTable";
import { useWcScenarios } from "../hooks/useWcScenarios";
import Countdown from "../components/Countdown";
import SEO from "../components/seo/SEO";
import { getActiveCountdownFixture } from "../lib/worldCupCountdown";
import { supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const STAGE_FILTER_OPTIONS = [
  { label: "Tüm Maçlar", value: "" },
  { label: "Grup Maçları", value: "Group Stage" },
  { label: "Son 32", value: "Round of 32" },
  { label: "Son 16", value: "Round of 16" },
  { label: "Çeyrek Final", value: "Quarter-final" },
  { label: "Yarı Final", value: "Semi-final" },
  { label: "Final", value: "Final" },
];

const GROUP_FILTER_OPTIONS = [
  { label: "Tüm Gruplar", value: "" },
  ...WC2026_GROUPS.map((g) => ({ label: `Grup ${g}`, value: g })),
];

const LOCATION_GROUPS = [
  {
    label: "ABD",
    options: [
      { label: "Atlanta", value: "Atlanta" },
      { label: "Boston", value: "Foxborough" },
      { label: "Dallas", value: "Arlington" },
      { label: "Houston", value: "Houston" },
      { label: "Kansas City", value: "Kansas City" },
      { label: "Los Angeles", value: "Inglewood" },
      { label: "Miami", value: "Miami" },
      { label: "New York / New Jersey", value: "East Rutherford" },
      { label: "Philadelphia", value: "Philadelphia" },
      { label: "San Francisco Bay Area", value: "Santa Clara" },
      { label: "Seattle", value: "Seattle" },
    ],
  },
  {
    label: "Kanada",
    options: [
      { label: "Toronto", value: "Toronto" },
      { label: "Vancouver", value: "Vancouver" },
    ],
  },
  {
    label: "Meksika",
    options: [
      { label: "Guadalajara", value: "Guadalajara" },
      { label: "Mexico City", value: "Mexico City" },
      { label: "Monterrey", value: "Monterrey" },
    ],
  },
];

const userTZ = getUserTimeZone();

function groupByDate(fixtures: WC2026Fixture[]): Map<string, WC2026Fixture[]> {
  const sorted = [...fixtures].sort((a, b) => {
    const t = a.kickoff_utc.localeCompare(b.kickoff_utc);
    return t !== 0 ? t : a.match_no - b.match_no;
  });
  const map = new Map<string, WC2026Fixture[]>();
  for (const f of sorted) {
    const key = getLocalMatchDateKey(f.kickoff_utc, userTZ);
    const arr = map.get(key);
    if (arr) arr.push(f);
    else map.set(key, [f]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Filter select components
// ---------------------------------------------------------------------------

function FilterSelect({
  icon,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div className="relative">
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none">
        {icon}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-navy-400 pointer-events-none"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M2 4l4 4 4-4" />
      </svg>
    </div>
  );
}

function LocationFilterSelect({
  icon,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400 pointer-events-none">
        {icon}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all cursor-pointer"
      >
        <option value="">Tüm Karşılaşma Yerleri</option>
        {LOCATION_GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-navy-400 pointer-events-none"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M2 4l4 4 4-4" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tournament info cards
// ---------------------------------------------------------------------------

const TOURNAMENT_STATS = [
  { label: "Katılan Takım", value: "48", sub: "tarihte en fazla" },
  { label: "Toplam Maç", value: "104", sub: "72 grup + 32 eleme" },
  { label: "Stadyum", value: "16", sub: "3 ülkede" },
  { label: "Şehir", value: "16", sub: "ABD, Kanada, Meksika" },
];

const HOST_COUNTRIES = [
  { name: "ABD", iso2: "us", venues: 11, note: "Ana ev sahibi" },
  { name: "Kanada", iso2: "ca", venues: 2, note: "Toronto · Vancouver" },
  { name: "Meksika", iso2: "mx", venues: 3, note: "CDMX · GDL · MTY" },
];

// ---------------------------------------------------------------------------
// Group brackets quick view
// ---------------------------------------------------------------------------

// fifa_code arrays — keyed by group letter
const GROUPS_DATA: Record<string, string[]> = {
  A: ["MEX", "RSA", "KOR", "CZE"],
  B: ["CAN", "SUI", "QAT", "BIH"],
  C: ["BRA", "MAR", "SCO", "HAI"],
  D: ["USA", "AUS", "PAR", "TUR"],
  E: ["GER", "CIV", "ECU", "CUW"],
  F: ["NED", "JPN", "SWE", "TUN"],
  G: ["BEL", "EGY", "NZL", "IRN"],
  H: ["ESP", "KSA", "URU", "CPV"],
  I: ["FRA", "SEN", "NOR", "IRQ"],
  J: ["ARG", "ALG", "AUT", "JOR"],
  K: ["POR", "COL", "UZB", "COD"],
  L: ["ENG", "CRO", "GHA", "PAN"],
};

// ---------------------------------------------------------------------------
// Featured fixture card (dynamic)
// ---------------------------------------------------------------------------

const FINISHED_STATUSES_CARD = new Set(["FT", "AET", "PEN", "completed"]);

function FeaturedFixtureCard({
  fixture,
  badgeLabel,
  liveScore,
}: {
  fixture: WC2026Fixture;
  badgeLabel: string;
  liveScore?: {
    status_short: string;
    home_score: number | null;
    away_score: number | null;
  };
}) {
  const home = COUNTRY_BY_FIFA[fixture.home_team_code];
  const away = COUNTRY_BY_FIFA[fixture.away_team_code];
  const homeIsTBD =
    fixture.home_team_code === "TBD" || fixture.home_team === "TBD";
  const awayIsTBD =
    fixture.away_team_code === "TBD" || fixture.away_team === "TBD";
  const venue = VENUE_META[fixture.venue];
  const trTime = formatMatchDateTime(fixture.kickoff_utc, getUserTimeZone());
  const isFinished =
    liveScore != null && FINISHED_STATUSES_CARD.has(liveScore.status_short);
  const hasScore =
    isFinished &&
    liveScore!.home_score != null &&
    liveScore!.away_score != null;
  const statusLabel =
    liveScore?.status_short === "AET"
      ? "UZS"
      : liveScore?.status_short === "PEN"
        ? "PEN"
        : "MS";

  return (
    <Link
      to={`/world-cup-2026/mac/${fixture.id}`}
      className="inline-flex items-center gap-4 bg-navy-800/60 border border-navy-700/60 backdrop-blur-sm rounded-2xl px-6 py-4 hover:border-champagne/30 hover:bg-navy-800/80 transition-all group"
    >
      <div className="flex flex-col items-end gap-1 min-w-0">
        {home ? (
          <>
            <span
              className={`fi fi-${home.iso2} w-8 h-[22px] rounded-[3px] shadow-sm`}
              style={{ display: "inline-block" }}
            />
            <span className="text-sm font-semibold text-white leading-tight">
              {home.name_en}
            </span>
            <span className="text-xs text-slate-400">{home.name_tr}</span>
          </>
        ) : (
          <span className="text-xs text-slate-400 italic">
            {homeIsTBD ? "TBD" : fixture.home_team}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center px-4 shrink-0">
        <span className="text-xs font-bold text-champagne/80 tracking-widest uppercase mb-1">
          {badgeLabel}
        </span>
        {hasScore ? (
          <div className="flex items-center gap-2 my-1">
            <span className="text-xl font-black font-mono text-champagne tabular-nums">
              {liveScore!.home_score} – {liveScore!.away_score}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 border border-slate-600/40 text-slate-300 font-mono">
              {statusLabel}
            </span>
          </div>
        ) : (
          <span className="text-xs text-slate-300 mt-1">{trTime}</span>
        )}
        {venue && (
          <span className="text-xs text-slate-400 mt-0.5">
            {venue.city_display}
          </span>
        )}
        <span className="text-xs text-champagne/60 mt-1 group-hover:text-champagne transition-colors flex items-center gap-1">
          Detay <ChevronRight className="w-3 h-3" />
        </span>
      </div>
      <div className="flex flex-col items-start gap-1 min-w-0">
        {away ? (
          <>
            <span
              className={`fi fi-${away.iso2} w-8 h-[22px] rounded-[3px] shadow-sm`}
              style={{ display: "inline-block" }}
            />
            <span className="text-sm font-semibold text-white leading-tight">
              {away.name_en}
            </span>
            <span className="text-xs text-slate-400">{away.name_tr}</span>
          </>
        ) : (
          <span className="text-xs text-slate-400 italic">
            {awayIsTBD ? "TBD" : fixture.away_team}
          </span>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const INITIAL_DATES = 6;

export default function WorldCup2026Page() {
  const [teamSearch, setTeamSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [visibleDates, setVisibleDates] = useState(INITIAL_DATES);
  const [groupsExpanded, setGroupsExpanded] = useState(false);

  const { scenarios } = useWcScenarios();

  const [resolvedFixtures, setResolvedFixtures] =
    useState<WC2026Fixture[]>(ALL_WC2026_FIXTURES);
  const [liveDbStatuses, setLiveDbStatuses] = useState<Map<string, string>>(
    new Map(),
  );
  const [liveScores, setLiveScores] = useState<
    Map<
      string,
      {
        status_short: string;
        home_score: number | null;
        away_score: number | null;
      }
    >
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      const { data: fixRows, error: fixtureError } = await supabase
        .from("wc2026_fixtures")
        .select(
          `
          id,
          public_fixture_key,
          match_number,
          home_team_name,
          away_team_name,
          final_home_score,
          final_away_score,
          home_score,
          away_score,
          is_live,
          is_closed
        `,
        )
        .order("match_number", { ascending: true });

      if (fixtureError) {
        console.error("WC2026 fixtures could not be loaded:", fixtureError);
        return;
      }
      if (!fixRows || cancelled) return;

      const dbByMatchNumber = new Map<number, (typeof fixRows)[number]>();
      const uuidToKey = new Map<string, string>();
      const scoreMap = new Map<
        string,
        {
          status_short: string;
          home_score: number | null;
          away_score: number | null;
        }
      >();
      const statusMap = new Map<string, string>();

      for (const row of fixRows) {
        if (row.match_number != null)
          dbByMatchNumber.set(Number(row.match_number), row);

        const staticFixture = ALL_WC2026_FIXTURES.find(
          (fixture) => fixture.match_no === Number(row.match_number),
        );
        const key = row.public_fixture_key ?? staticFixture?.id;
        if (!key) continue;

        uuidToKey.set(row.id, key);

        const finalHome = row.final_home_score ?? row.home_score;
        const finalAway = row.final_away_score ?? row.away_score;
        if (row.is_closed && finalHome != null && finalAway != null) {
          scoreMap.set(key, {
            status_short: "FT",
            home_score: finalHome,
            away_score: finalAway,
          });
          statusMap.set(key, "FT");
        } else if (row.is_live) {
          statusMap.set(key, "LIVE");
        }
      }

      const mergedFixtures = ALL_WC2026_FIXTURES.map((staticFixture) => {
        const row = dbByMatchNumber.get(staticFixture.match_no);
        if (!row) return staticFixture;

        const homeTeam =
          normalizeWc2026TeamName(row.home_team_name) ||
          staticFixture.home_team;
        const awayTeam =
          normalizeWc2026TeamName(row.away_team_name) ||
          staticFixture.away_team;
        const resolvedHomeCode = resolveFifaCodeByTeamName(homeTeam);
        const resolvedAwayCode = resolveFifaCodeByTeamName(awayTeam);

        return {
          ...staticFixture,
          home_team: homeTeam !== "TBD" ? homeTeam : staticFixture.home_team,
          away_team: awayTeam !== "TBD" ? awayTeam : staticFixture.away_team,
          home_team_code:
            resolvedHomeCode !== "TBD"
              ? resolvedHomeCode
              : staticFixture.home_team_code,
          away_team_code:
            resolvedAwayCode !== "TBD"
              ? resolvedAwayCode
              : staticFixture.away_team_code,
          status: row.is_closed
            ? "completed"
            : row.is_live
              ? "live"
              : staticFixture.status,
          fixture_status:
            homeTeam !== "TBD" && awayTeam !== "TBD"
              ? "confirmed"
              : staticFixture.fixture_status,
        } satisfies WC2026Fixture;
      });

      const { data: stateRows, error: stateError } = await supabase
        .from("wc2026_live_match_state_public")
        .select("fixture_id, status_short, home_score, away_score");

      if (stateError) {
        console.error("WC2026 live state could not be loaded:", stateError);
      } else if (stateRows) {
        for (const row of stateRows) {
          const key = uuidToKey.get(row.fixture_id);
          if (!key) continue;

          statusMap.set(key, row.status_short);
          if (row.home_score != null && row.away_score != null) {
            scoreMap.set(key, {
              status_short: row.status_short,
              home_score: row.home_score,
              away_score: row.away_score,
            });
          }
        }
      }

      if (!cancelled) {
        setResolvedFixtures(mergedFixtures);
        setLiveDbStatuses(statusMap);
        setLiveScores(scoreMap);
      }
    }

    void load();
    timer = setInterval(() => void load(), 60_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const active = getActiveCountdownFixture(
    resolvedFixtures,
    liveDbStatuses,
    Date.now(),
  );

  const filtered = useMemo(() => {
    let list = [...resolvedFixtures];

    if (stageFilter) {
      list = list.filter((f) => f.stage === (stageFilter as FixtureStage));
    }
    if (groupFilter) {
      list = list.filter((f) => f.group === groupFilter);
    }
    if (cityFilter) {
      list = list.filter((f) => f.city === cityFilter);
    }
    if (teamSearch.trim()) {
      const q = teamSearch.toLowerCase();
      list = list.filter(
        (f) =>
          f.home_team.toLowerCase().includes(q) ||
          f.away_team.toLowerCase().includes(q) ||
          f.home_team_code.toLowerCase().includes(q) ||
          f.away_team_code.toLowerCase().includes(q),
      );
    }

    return list;
  }, [resolvedFixtures, teamSearch, stageFilter, groupFilter, cityFilter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const dateKeys = useMemo(() => Array.from(grouped.keys()).sort(), [grouped]);
  const visibleKeys = dateKeys.slice(0, visibleDates);
  const hasMore = visibleDates < dateKeys.length;

  useEffect(() => {
    setVisibleDates(INITIAL_DATES);
  }, [teamSearch, stageFilter, groupFilter, cityFilter]);

  const clearFilters = () => {
    setTeamSearch("");
    setStageFilter("");
    setGroupFilter("");
    setCityFilter("");
  };

  const hasActiveFilter =
    teamSearch || stageFilter || groupFilter || cityFilter;

  return (
    <div className="min-h-screen">
      <SEO
        title="2026 Dünya Kupası Fikstürü ve Senaryoları — Next59"
        description="2026 Dünya Kupası fikstürü, gruplar, maç tarihleri ve Next59 model senaryoları."
        canonical="/world-cup-2026"
      />
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 py-20 sm:py-28">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-champagne/4 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-champagne/10 border border-champagne/20 text-champagne text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Trophy className="w-3.5 h-3.5" />
            FIFA Dünya Kupası 2026
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4">
            World Cup 2026
            <br />
            <span className="text-champagne">Fikstür & Gruplar</span>
          </h1>

          <p className="text-navy-300 text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
            48 takım, 104 maç, 3 ülke. 11 Haziran 2026'da başlıyor.
          </p>

          {/* Countdown */}
          <div className="flex justify-center mb-6">
            <Countdown />
          </div>

          {/* Dynamic featured fixture card */}
          {active.fixture && (
            <div className="flex justify-center mb-6">
              <FeaturedFixtureCard
                fixture={active.fixture}
                badgeLabel={active.badgeLabel}
                liveScore={liveScores.get(active.fixture.id)}
              />
            </div>
          )}

          {/* History link */}
          <div className="flex justify-center mb-10">
            <Link
              to="/world-cup/tarihce"
              className="inline-flex items-center gap-2 text-sm text-navy-400 hover:text-champagne border border-navy-700/60 hover:border-champagne/30 bg-navy-900/60 hover:bg-navy-900 px-4 py-2 rounded-full transition-all"
            >
              <History className="w-3.5 h-3.5" />
              Geçmiş Turnuvalar: 1930–2022 Arşivi
            </Link>
          </div>
        </div>
      </section>

      {/* ── Tournament stats ── */}
      <section className="bg-navy-900 border-y border-navy-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {TOURNAMENT_STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-black text-champagne tabular-nums">
                  {s.value}
                </div>
                <div className="text-xs font-semibold text-white mt-0.5">
                  {s.label}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Host countries ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-3 gap-4">
          {HOST_COUNTRIES.map((c) => (
            <div
              key={c.name}
              className="bg-navy-900 border border-navy-800 rounded-xl p-4 flex items-center gap-3"
            >
              <span
                className={`fi fi-${c.iso2} w-9 h-6 rounded-[3px] shadow-sm shrink-0`}
                style={{ display: "inline-block" }}
              />
              <div>
                <div className="text-sm font-bold text-white">{c.name}</div>
                <div className="text-xs text-slate-400">
                  {c.venues} stadyum · {c.note}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Groups ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <button
          onClick={() => setGroupsExpanded((v) => !v)}
          className="w-full flex items-center justify-between bg-navy-900 border border-navy-800 rounded-xl px-5 py-4 text-left hover:border-champagne/20 transition-colors"
        >
          <span className="text-sm font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-champagne" />
            Grup Tablosu (A–L)
          </span>
          <ChevronDown
            className={`w-4 h-4 text-navy-400 transition-transform duration-200 ${groupsExpanded ? "rotate-180" : ""}`}
          />
        </button>

        {groupsExpanded && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 animate-fade-in">
            {Object.entries(GROUPS_DATA).map(([group, teams]) => (
              <div
                key={group}
                className="bg-navy-900 border border-navy-800 rounded-xl overflow-hidden"
              >
                <div className="bg-navy-800/60 px-3 py-2">
                  <span className="text-xs font-bold text-champagne uppercase tracking-wide">
                    Grup {group}
                  </span>
                </div>
                <div className="divide-y divide-navy-800">
                  {teams.map((fifaCode) => {
                    const c = COUNTRY_BY_FIFA[fifaCode];
                    return (
                      <div
                        key={fifaCode}
                        className="flex items-center gap-2 px-3 py-2"
                      >
                        {c ? (
                          <span
                            className={`fi fi-${c.iso2} w-5 h-[14px] rounded-[2px] shadow-sm shrink-0`}
                            style={{ display: "inline-block" }}
                          />
                        ) : (
                          <span className="w-5 h-[14px] bg-navy-700 rounded-[2px] shrink-0 inline-block" />
                        )}
                        <div className="min-w-0">
                          <span className="text-xs text-navy-200 truncate block leading-tight">
                            {c?.name_en ?? fifaCode}
                          </span>
                          {c && (
                            <span className="text-xs text-slate-400 truncate block leading-tight">
                              {c.name_tr}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Prediction audit ── */}
      <WcPredictionAuditTable />

      {/* ── Fixture module ── */}
      <section className="border-t border-navy-800">
        {/* Sticky filter bar */}
        <div className="sticky top-14 sm:top-16 z-40 bg-navy-950/95 backdrop-blur-md border-b border-navy-800/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-navy-400 uppercase tracking-wider shrink-0">
                <Filter className="w-3.5 h-3.5" />
                Filtrele
              </div>

              <FilterSelect
                icon={<Trophy className="w-3.5 h-3.5" />}
                value={stageFilter}
                onChange={setStageFilter}
                options={STAGE_FILTER_OPTIONS}
              />

              <FilterSelect
                icon={<Calendar className="w-3.5 h-3.5" />}
                value={groupFilter}
                onChange={setGroupFilter}
                options={GROUP_FILTER_OPTIONS}
              />

              <LocationFilterSelect
                icon={<Globe className="w-3.5 h-3.5" />}
                value={cityFilter}
                onChange={setCityFilter}
              />

              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy-400" />
                <input
                  type="text"
                  placeholder="Takım Ara..."
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="w-full bg-navy-900 border border-navy-700 text-white text-xs rounded-lg pl-8 pr-3 py-2 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all"
                />
              </div>

              {hasActiveFilter && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-navy-400 hover:text-champagne transition-colors shrink-0"
                >
                  Temizle
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Fixture list */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex items-center gap-3 mb-8">
            <Calendar className="w-5 h-5 text-champagne" />
            <h2 className="text-lg font-bold text-white">Tüm Maçlar</h2>
            <span className="text-xs text-slate-400 font-mono ml-auto">
              {filtered.length} maç
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-navy-400 text-sm">
                Aramanızla eşleşen maç bulunamadı.
              </p>
              <button
                onClick={clearFilters}
                className="mt-3 text-xs text-champagne hover:text-champagne-light transition-colors"
              >
                Filtreleri Temizle
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              {visibleKeys.map((dateKey) => (
                <div key={dateKey} className="animate-fade-in">
                  <h3 className="text-sm font-semibold text-champagne/80 uppercase tracking-wider mb-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-navy-800" />
                    <span className="shrink-0">
                      {formatFixtureDateForTZ(dateKey + "T12:00:00Z", "UTC")}
                    </span>
                    <span className="h-px flex-1 bg-navy-800" />
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {grouped.get(dateKey)!.map((f) => (
                      <WC2026FixtureCard
                        key={f.id}
                        fixture={f}
                        scenario={scenarios.get(
                          `${f.home_team}||${f.away_team}`,
                        )}
                        liveState={liveScores.get(f.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {hasMore && (
                <div className="text-center pt-4">
                  <button
                    onClick={() => setVisibleDates((v) => v + 6)}
                    className="inline-flex items-center gap-2 bg-navy-900 border border-navy-700 hover:border-champagne/30 text-navy-300 hover:text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-all"
                  >
                    Daha Fazla Göster
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Editorial note ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-5 flex gap-3">
          <Info className="w-4 h-4 text-readable-muted shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">
              Fikstür Kaynağı:
            </span>{" "}
            Maç saatleri ve eşleşmeler Fox Sports, Roadtrips ve Yahoo Sports
            üzerinden çapraz doğrulanmıştır. FIFA'nın resmi dijital kanalı
            doğrudan erişime kapalı olduğundan tüm veriler üçüncü taraf
            kaynaklara dayanmaktadır. Resmi açıklamalar çıktıkça
            güncellenecektir. Naklen yayın saatleri Türkiye saatiyle (TRT,
            UTC+3) gösterilmektedir.
          </div>
        </div>
      </section>
    </div>
  );
}
