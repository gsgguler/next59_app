import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AF_BASE = "https://v3.football.api-sports.io";
const SM_BASE = "https://api.sportmonks.com/v3/football";
const SLEEP_MS = 1200; // ~50 req/min safety margin

type Mode =
  | "discovery"
  | "sync_fixtures"
  | "sync_details"
  | "sync_standings"
  | "build_summary"
  | "validate"
  | "full_backfill";

interface SyncRequest {
  mode: Mode;
  provider?: "api_football" | "sportmonks" | "both";
  confederation?: string;
  competition_id?: string;
  max_fixtures?: number;
  batch_offset?: number;
  dry_run?: boolean;
  fixture_ids?: string[];
  force_refetch?: boolean;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function confFromLeagueName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("europe")) return "UEFA";
  if (n.includes("south america")) return "CONMEBOL";
  if (n.includes("concacaf") || n.includes("north america")) return "CONCACAF";
  if (n.includes("africa")) return "CAF";
  if (n.includes("asia")) return "AFC";
  if (n.includes("oceania")) return "OFC";
  if (n.includes("intercontinental")) return "Intercontinental";
  return "Unknown";
}

// Keep for country-based fallback
function confFromCountry(country: string): string {
  const c = country.toLowerCase();
  if (c.includes("europe")) return "UEFA";
  if (c.includes("south america")) return "CONMEBOL";
  if (c.includes("north america") || c.includes("central america") || c.includes("caribbean")) return "CONCACAF";
  if (c.includes("africa")) return "CAF";
  if (c.includes("asia")) return "AFC";
  if (c.includes("oceania")) return "OFC";
  if (c === "world") return "Intercontinental";
  return country;
}

async function afGet(path: string, apiKey: string): Promise<{ data: unknown; status: number }> {
  const url = `${AF_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
  });
  const data = await res.json();
  return { data, status: res.status };
}

async function smGet(path: string, apiKey: string): Promise<{ data: unknown; status: number }> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${SM_BASE}${path}${sep}api_token=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  return { data, status: res.status };
}

// ── Discovery ─────────────────────────────────────────────────────────────────

async function runDiscovery(
  supabase: ReturnType<typeof createClient>,
  afKey: string,
  smKey: string,
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = { af_competitions: [], sm_competitions: [], upserted: 0, errors: [] };

  // API-Football discovery
  await sleep(SLEEP_MS);
  const { data: afLeagues, status: afStatus } = await afGet("/leagues?search=World Cup - Qualification", afKey);
  if (afStatus !== 200) {
    (report.errors as string[]).push(`AF /leagues returned ${afStatus}`);
  } else {
    const leagues = (afLeagues as { response?: unknown[] }).response ?? [];
    (report.af_competitions as unknown[]).push(...leagues);

    if (!dryRun) {
      for (const item of leagues as Array<{
        league: { id: number; name: string; type: string };
        country: { name: string };
        seasons: Array<{ year: number; coverage: unknown }>;
      }>) {
        const { league, country, seasons } = item;
        const confederation = confFromLeagueName(league.name);
        for (const season of seasons) {
          if (season.year < 2023) continue; // skip WC 2022 qualifiers
          const { error } = await supabase
            .from("wc_qualifier_competitions")
            .upsert(
              {
                provider: "api_football",
                provider_competition_id: String(league.id),
                provider_season_id: String(season.year),
                competition_name: league.name,
                confederation,
                season_label: String(season.year),
                coverage_json: season.coverage ?? null,
                raw_json: item,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "provider,provider_competition_id,provider_season_id" },
            );
          if (error) (report.errors as string[]).push(`upsert competition: ${error.message}`);
          else (report as { upserted: number }).upserted++;
        }
      }
    }
  }

  // Sportmonks discovery
  await sleep(SLEEP_MS);
  try {
    const { data: smLeagues, status: smStatus } = await smGet("/leagues/search/World Cup Qualification", smKey);
    if (smStatus === 200) {
      const smData = (smLeagues as { data?: unknown[] }).data ?? [];
      (report.sm_competitions as unknown[]).push(...smData);

      if (!dryRun) {
        for (const item of smData as Array<{ id: number; name: string; country_id?: number }>) {
          const { error } = await supabase
            .from("wc_qualifier_competitions")
            .upsert(
              {
                provider: "sportmonks",
                provider_competition_id: String(item.id),
                competition_name: item.name,
                raw_json: item,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "provider,provider_competition_id,provider_season_id" },
            );
          if (error) (report.errors as string[]).push(`sm upsert: ${error.message}`);
          else (report as { upserted: number }).upserted++;
        }
      }
    }
  } catch (_e) {
    (report.errors as string[]).push("Sportmonks discovery failed");
  }

  return report;
}

// ── Sync Fixtures ─────────────────────────────────────────────────────────────

async function runSyncFixtures(
  supabase: ReturnType<typeof createClient>,
  afKey: string,
  confederation?: string,
  competitionId?: string,
  dryRun = false,
): Promise<Record<string, unknown>> {
  const report = { competitions_processed: 0, fixtures_upserted: 0, errors: [] as string[] };

  // Fetch competitions to sync
  let query = supabase
    .from("wc_qualifier_competitions")
    .select("id, provider_competition_id, provider_season_id, confederation, competition_name")
    .eq("provider", "api_football");

  if (confederation) query = query.eq("confederation", confederation);
  if (competitionId) query = query.eq("id", competitionId);

  const { data: competitions, error: compErr } = await query;
  if (compErr || !competitions) {
    return { ...report, errors: [compErr?.message ?? "no competitions"] };
  }

  for (const comp of competitions) {
    report.competitions_processed++;
    await sleep(SLEEP_MS);

    const path = `/fixtures?league=${comp.provider_competition_id}&season=${comp.provider_season_id}`;
    const { data, status } = await afGet(path, afKey);

    if (status !== 200) {
      report.errors.push(`AF fixtures ${comp.provider_competition_id}/${comp.provider_season_id}: HTTP ${status}`);
      continue;
    }

    const fixtures = (data as { response?: unknown[] }).response ?? [];
    if (fixtures.length === 0) continue;

    if (!dryRun) {
      for (const f of fixtures as Array<{
        fixture: {
          id: number;
          date?: string;
          status?: { short?: string; long?: string; elapsed?: number };
          venue?: { id?: number; name?: string; city?: string };
          referee?: string;
        };
        league: { round?: string };
        teams: {
          home: { id: number; name: string };
          away: { id: number; name: string };
          winner?: { id?: number };
        };
        goals: { home?: number | null; away?: number | null };
        score: {
          halftime?: { home?: number | null; away?: number | null };
          extratime?: { home?: number | null; away?: number | null };
          penalty?: { home?: number | null; away?: number | null };
        };
      }>) {
        const { fixture, league, teams, goals, score } = f;
        const { error } = await supabase
          .from("wc_qualifier_fixtures")
          .upsert(
            {
              provider: "api_football",
              provider_fixture_id: String(fixture.id),
              competition_id: comp.id,
              confederation: comp.confederation,
              season_label: comp.provider_season_id,
              round: league.round ?? null,
              fixture_date: fixture.date ?? null,
              status_short: fixture.status?.short ?? null,
              status_long: fixture.status?.long ?? null,
              elapsed: fixture.status?.elapsed ?? null,
              venue_id: fixture.venue?.id ? String(fixture.venue.id) : null,
              venue_name: fixture.venue?.name ?? null,
              venue_city: fixture.venue?.city ?? null,
              referee: fixture.referee ?? null,
              home_provider_team_id: String(teams.home.id),
              away_provider_team_id: String(teams.away.id),
              home_team_name: teams.home.name,
              away_team_name: teams.away.name,
              home_score: goals.home ?? null,
              away_score: goals.away ?? null,
              halftime_home_score: score.halftime?.home ?? null,
              halftime_away_score: score.halftime?.away ?? null,
              extratime_home_score: score.extratime?.home ?? null,
              extratime_away_score: score.extratime?.away ?? null,
              penalty_home_score: score.penalty?.home ?? null,
              penalty_away_score: score.penalty?.away ?? null,
              winner_provider_team_id: teams.winner?.id ? String(teams.winner.id) : null,
              raw_json: f,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "provider,provider_fixture_id" },
          );
        if (error) report.errors.push(`fixture ${fixture.id}: ${error.message}`);
        else report.fixtures_upserted++;
      }
    } else {
      report.fixtures_upserted += fixtures.length;
    }
  }

  return report;
}

// ── Sync Fixture Details (stats + events + lineups + players) ─────────────────

async function runSyncDetails(
  supabase: ReturnType<typeof createClient>,
  afKey: string,
  opts: {
    maxFixtures: number;
    offset: number;
    confederation?: string;
    forceRefetch?: boolean;
    fixtureIds?: string[];
    dryRun: boolean;
  },
): Promise<Record<string, unknown>> {
  const report = {
    fixtures_processed: 0,
    stats_rows: 0,
    event_rows: 0,
    lineup_rows: 0,
    lineup_player_rows: 0,
    player_stat_rows: 0,
    empty_endpoints: 0,
    errors: [] as string[],
  };

  // Build query for fixtures needing enrichment
  let query = supabase
    .from("wc_qualifier_fixtures")
    .select("provider_fixture_id, confederation, status_short")
    .eq("provider", "api_football");

  if (!opts.forceRefetch) {
    query = query.or("has_stats.eq.false,has_events.eq.false,has_lineups.eq.false");
  }
  if (opts.confederation) query = query.eq("confederation", opts.confederation);
  if (opts.fixtureIds?.length) {
    query = query.in("provider_fixture_id", opts.fixtureIds);
  } else {
    // Only process finished fixtures
    query = query.in("status_short", ["FT", "AET", "PEN", "SUSP"]);
  }

  query = query.range(opts.offset, opts.offset + opts.maxFixtures - 1);

  const { data: fixtures, error } = await query;
  if (error || !fixtures) return { ...report, errors: [error?.message ?? "no fixtures"] };

  for (const fix of fixtures) {
    const fid = fix.provider_fixture_id;
    let hasStats = false;
    let hasEvents = false;
    let hasLineups = false;
    let hasPlayers = false;

    if (!opts.dryRun) {
      // Stats
      await sleep(SLEEP_MS);
      const { data: statsData, status: statStatus } = await afGet(`/fixtures/statistics?fixture=${fid}`, afKey);
      if (statStatus === 200) {
        const statsArr = (statsData as { response?: unknown[] }).response ?? [];
        if (statsArr.length === 0) {
          report.empty_endpoints++;
        } else {
          hasStats = true;
          for (const teamStat of statsArr as Array<{
            team: { id: number; name: string };
            statistics: Array<{ type: string; value: unknown }>;
            side?: string;
          }>) {
            const statMap = Object.fromEntries(
              teamStat.statistics.map((s) => [s.type.toLowerCase().replace(/\s+/g, "_"), s.value]),
            );
            const xgVal =
              statMap["expected_goals"] != null ? Number(statMap["expected_goals"]) : null;

            // Determine side from fixture data
            const fixtureRow = fixtures.find((f) => f.provider_fixture_id === fid);
            const homeTeamId = statsArr.indexOf(teamStat) === 0 ? teamStat.team.id.toString() : null;

            const { error: stErr } = await supabase.from("wc_qualifier_team_match_stats").upsert(
              {
                provider: "api_football",
                provider_fixture_id: fid,
                provider_team_id: String(teamStat.team.id),
                team_name: teamStat.team.name,
                shots_on_goal: statMap["shots_on_goal"] ?? null,
                shots_off_goal: statMap["shots_off_goal"] ?? null,
                total_shots: statMap["total_shots"] ?? null,
                blocked_shots: statMap["blocked_shots"] ?? null,
                shots_insidebox: statMap["shots_insidebox"] ?? null,
                shots_outsidebox: statMap["shots_outsidebox"] ?? null,
                fouls: statMap["fouls"] ?? null,
                corner_kicks: statMap["corner_kicks"] ?? null,
                offsides: statMap["offsides"] ?? null,
                ball_possession_pct: statMap["ball_possession"]
                  ? Number(String(statMap["ball_possession"]).replace("%", ""))
                  : null,
                yellow_cards: statMap["yellow_cards"] ?? null,
                red_cards: statMap["red_cards"] ?? null,
                goalkeeper_saves: statMap["goalkeeper_saves"] ?? null,
                total_passes: statMap["total_passes"] ?? null,
                passes_accurate: statMap["passes_accurate"] ?? null,
                passes_pct: statMap["passes_%"]
                  ? Number(String(statMap["passes_%"]).replace("%", ""))
                  : null,
                expected_goals: xgVal,
                provider_xg: xgVal,
                xg_source: xgVal != null ? "api_football" : null,
                statistics_json: statMap,
                raw_json: teamStat,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "provider,provider_fixture_id,provider_team_id" },
            );
            if (stErr) report.errors.push(`stats ${fid}: ${stErr.message}`);
            else report.stats_rows++;
          }
        }
      } else {
        report.errors.push(`AF stats ${fid}: HTTP ${statStatus}`);
      }

      // Events — delete-then-insert (COALESCE-based unique index not supported by PostgREST onConflict)
      await sleep(SLEEP_MS);
      const { data: evData, status: evStatus } = await afGet(`/fixtures/events?fixture=${fid}`, afKey);
      if (evStatus === 200) {
        const evArr = (evData as { response?: unknown[] }).response ?? [];
        if (evArr.length === 0) {
          report.empty_endpoints++;
        } else {
          hasEvents = true;
          // Delete existing rows for this fixture before re-inserting
          await supabase
            .from("wc_qualifier_events")
            .delete()
            .eq("provider", "api_football")
            .eq("provider_fixture_id", fid);

          const eventRows = (evArr as Array<{
            time?: { elapsed?: number; extra?: number };
            team?: { id?: number; name?: string };
            player?: { id?: number; name?: string };
            assist?: { id?: number; name?: string };
            type?: string;
            detail?: string;
            comments?: string;
          }>).map((ev) => {
            const elapsed = ev.time?.elapsed ?? 0;
            const extra = ev.time?.extra ?? 0;
            const evType = (ev.type ?? "").toLowerCase();
            const evDetail = (ev.detail ?? "").toLowerCase();
            const minuteLabel = extra > 0 ? `${elapsed}+${extra}` : String(elapsed);
            return {
              provider: "api_football",
              provider_fixture_id: fid,
              provider_team_id: ev.team?.id ? String(ev.team.id) : null,
              team_name: ev.team?.name ?? null,
              provider_player_id: ev.player?.id ? String(ev.player.id) : null,
              player_name: ev.player?.name ?? null,
              provider_assist_id: ev.assist?.id ? String(ev.assist.id) : null,
              assist_name: ev.assist?.name ?? null,
              elapsed,
              extra,
              minute_label: minuteLabel,
              event_type: ev.type ?? "unknown",
              event_detail: ev.detail ?? null,
              comments: ev.comments ?? null,
              is_goal: evType === "goal" && !evDetail.includes("miss"),
              is_card: evType === "card",
              is_red_card: evType === "card" && (evDetail.includes("red") || evDetail.includes("second yellow")),
              is_substitution: evType === "subst",
              is_penalty: evDetail.includes("penalty"),
              is_var: evType === "var",
              raw_json: ev,
              updated_at: new Date().toISOString(),
            };
          });

          const { error: evErr } = await supabase.from("wc_qualifier_events").insert(eventRows);
          if (evErr) report.errors.push(`events ${fid}: ${evErr.message}`);
          else report.event_rows += eventRows.length;
        }
      } else {
        report.errors.push(`AF events ${fid}: HTTP ${evStatus}`);
      }

      // Lineups
      await sleep(SLEEP_MS);
      const { data: luData, status: luStatus } = await afGet(`/fixtures/lineups?fixture=${fid}`, afKey);
      if (luStatus === 200) {
        const luArr = (luData as { response?: unknown[] }).response ?? [];
        if (luArr.length === 0) {
          report.empty_endpoints++;
        } else {
          hasLineups = true;
          for (const lu of luArr as Array<{
            team: { id: number; name: string };
            formation?: string;
            coach?: { id?: number; name?: string };
            startXI?: Array<{ player?: { id?: number; name?: string; number?: number; pos?: string; grid?: string } }>;
            substitutes?: Array<{
              player?: { id?: number; name?: string; number?: number; pos?: string; grid?: string };
            }>;
          }>) {
            const { error: luErr } = await supabase.from("wc_qualifier_lineups").upsert(
              {
                provider: "api_football",
                provider_fixture_id: fid,
                provider_team_id: String(lu.team.id),
                team_name: lu.team.name,
                formation: lu.formation ?? null,
                coach_provider_id: lu.coach?.id ? String(lu.coach.id) : null,
                coach_name: lu.coach?.name ?? null,
                raw_json: lu,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "provider,provider_fixture_id,provider_team_id" },
            );
            if (luErr) report.errors.push(`lineup ${fid}: ${luErr.message}`);
            else report.lineup_rows++;

            // Lineup players — delete-then-insert per team (COALESCE index not PostgREST-compatible)
            await supabase
              .from("wc_qualifier_lineup_players")
              .delete()
              .eq("provider", "api_football")
              .eq("provider_fixture_id", fid)
              .eq("provider_team_id", String(lu.team.id));

            const allPlayers = [
              ...(lu.startXI ?? []).map((p) => ({ ...p.player, is_starting: true, is_substitute: false })),
              ...(lu.substitutes ?? []).map((p) => ({ ...p.player, is_starting: false, is_substitute: true })),
            ].filter((pl) => pl.name);

            if (allPlayers.length > 0) {
              const lpRows = allPlayers.map((pl) => ({
                provider: "api_football",
                provider_fixture_id: fid,
                provider_team_id: String(lu.team.id),
                provider_player_id: pl.id ? String(pl.id) : null,
                player_name: pl.name,
                number: pl.number ?? null,
                position: pl.pos ?? null,
                grid: pl.grid ?? null,
                is_starting: pl.is_starting,
                is_substitute: pl.is_substitute,
                raw_json: pl,
                updated_at: new Date().toISOString(),
              }));
              const { error: lpErr } = await supabase.from("wc_qualifier_lineup_players").insert(lpRows);
              if (lpErr) report.errors.push(`lineup_players ${fid}: ${lpErr.message}`);
              else report.lineup_player_rows += lpRows.length;
            }
          }
        }
      } else {
        report.errors.push(`AF lineups ${fid}: HTTP ${luStatus}`);
      }

      // Player stats
      await sleep(SLEEP_MS);
      const { data: psData, status: psStatus } = await afGet(`/fixtures/players?fixture=${fid}`, afKey);
      if (psStatus === 200) {
        const psArr = (psData as { response?: unknown[] }).response ?? [];
        if (psArr.length === 0) {
          report.empty_endpoints++;
        } else {
          hasPlayers = true;
          for (const teamPs of psArr as Array<{
            team: { id: number; name: string };
            players: Array<{
              player?: { id?: number; name?: string };
              statistics?: Array<{
                games?: {
                  minutes?: number;
                  rating?: string;
                  captain?: boolean;
                  substitute?: boolean;
                };
                offsides?: number;
                shots?: { total?: number; on?: number };
                goals?: { total?: number; conceded?: number; assists?: number; saves?: number };
                passes?: { total?: number; key?: number; accuracy?: string };
                tackles?: { total?: number; blocks?: number; interceptions?: number };
                duels?: { total?: number; won?: number };
                dribbles?: { attempts?: number; success?: number; past?: number };
                fouls?: { drawn?: number; committed?: number };
                cards?: { yellow?: number; red?: number };
                penalty?: {
                  won?: number;
                  committed?: number;
                  scored?: number;
                  missed?: number;
                  saved?: number;
                };
              }>;
            }>;
          }>) {
            for (const player of teamPs.players) {
              if (!player.player?.id || !player.statistics?.[0]) continue;
              const st = player.statistics[0];
              const { error: psErr } = await supabase.from("wc_qualifier_player_match_stats").upsert(
                {
                  provider: "api_football",
                  provider_fixture_id: fid,
                  provider_team_id: String(teamPs.team.id),
                  provider_player_id: String(player.player.id),
                  player_name: player.player.name ?? null,
                  minutes: st.games?.minutes ?? null,
                  rating: st.games?.rating ? Number(st.games.rating) : null,
                  captain: st.games?.captain ?? null,
                  substitute: st.games?.substitute ?? null,
                  offsides: st.offsides ?? null,
                  shots_total: st.shots?.total ?? null,
                  shots_on: st.shots?.on ?? null,
                  goals_total: st.goals?.total ?? null,
                  goals_conceded: st.goals?.conceded ?? null,
                  assists: st.goals?.assists ?? null,
                  saves: st.goals?.saves ?? null,
                  passes_total: st.passes?.total ?? null,
                  passes_key: st.passes?.key ?? null,
                  passes_accuracy_pct: st.passes?.accuracy
                    ? Number(String(st.passes.accuracy).replace("%", ""))
                    : null,
                  tackles_total: st.tackles?.total ?? null,
                  tackles_blocks: st.tackles?.blocks ?? null,
                  tackles_interceptions: st.tackles?.interceptions ?? null,
                  duels_total: st.duels?.total ?? null,
                  duels_won: st.duels?.won ?? null,
                  dribbles_attempts: st.dribbles?.attempts ?? null,
                  dribbles_success: st.dribbles?.success ?? null,
                  dribbles_past: st.dribbles?.past ?? null,
                  fouls_drawn: st.fouls?.drawn ?? null,
                  fouls_committed: st.fouls?.committed ?? null,
                  yellow_cards: st.cards?.yellow ?? null,
                  red_cards: st.cards?.red ?? null,
                  penalty_won: st.penalty?.won ?? null,
                  penalty_committed: st.penalty?.committed ?? null,
                  penalty_scored: st.penalty?.scored ?? null,
                  penalty_missed: st.penalty?.missed ?? null,
                  penalty_saved: st.penalty?.saved ?? null,
                  raw_json: player,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "provider,provider_fixture_id,provider_player_id" },
              );
              if (psErr) report.errors.push(`player_stat ${fid}: ${psErr.message}`);
              else report.player_stat_rows++;
            }
          }
        }
      } else {
        report.errors.push(`AF players ${fid}: HTTP ${psStatus}`);
      }

      // Update fixture enrichment flags
      await supabase
        .from("wc_qualifier_fixtures")
        .update({
          has_stats: hasStats,
          has_events: hasEvents,
          has_lineups: hasLineups,
          has_players: hasPlayers,
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "api_football")
        .eq("provider_fixture_id", fid);
    }

    report.fixtures_processed++;
  }

  return report;
}

// ── Sync Standings ────────────────────────────────────────────────────────────

async function runSyncStandings(
  supabase: ReturnType<typeof createClient>,
  afKey: string,
  confederation?: string,
  dryRun = false,
): Promise<Record<string, unknown>> {
  const report = { competitions_processed: 0, standings_rows: 0, errors: [] as string[] };

  let query = supabase
    .from("wc_qualifier_competitions")
    .select("id, provider_competition_id, provider_season_id, confederation")
    .eq("provider", "api_football");

  if (confederation) query = query.eq("confederation", confederation);

  const { data: competitions } = await query;
  if (!competitions) return { ...report, errors: ["no competitions"] };

  for (const comp of competitions) {
    await sleep(SLEEP_MS);
    const { data, status } = await afGet(
      `/standings?league=${comp.provider_competition_id}&season=${comp.provider_season_id}`,
      afKey,
    );

    if (status !== 200) {
      report.errors.push(`standings ${comp.provider_competition_id}: HTTP ${status}`);
      continue;
    }

    const standingsData = (data as { response?: unknown[] }).response ?? [];
    if (standingsData.length === 0) continue;

    report.competitions_processed++;

    for (const item of standingsData as Array<{ league?: { standings?: unknown[][] } }>) {
      const groups = item.league?.standings ?? [];
      for (const group of groups) {
        for (const entry of group as Array<{
          rank?: number;
          team?: { id?: number; name?: string };
          group?: string;
          points?: number;
          goalsDiff?: number;
          form?: string;
          all?: {
            played?: number;
            win?: number;
            draw?: number;
            lose?: number;
            goals?: { for?: number; against?: number };
          };
        }>) {
          if (!entry.team?.id) continue;
          if (!dryRun) {
            const { error } = await supabase.from("wc_qualifier_standings").upsert(
              {
                provider: "api_football",
                competition_id: comp.id,
                provider_team_id: String(entry.team.id),
                team_name: entry.team.name ?? null,
                group_name: entry.group ?? null,
                rank: entry.rank ?? null,
                played: entry.all?.played ?? null,
                wins: entry.all?.win ?? null,
                draws: entry.all?.draw ?? null,
                losses: entry.all?.lose ?? null,
                goals_for: entry.all?.goals?.for ?? null,
                goals_against: entry.all?.goals?.against ?? null,
                goal_difference: entry.goalsDiff ?? null,
                points: entry.points ?? null,
                form: entry.form ?? null,
                raw_json: entry,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "provider,competition_id,provider_team_id,group_name" },
            );
            if (error) report.errors.push(`standing: ${error.message}`);
            else report.standings_rows++;
          } else {
            report.standings_rows++;
          }
        }
      }
    }
  }

  return report;
}

// ── Build Team Summary ────────────────────────────────────────────────────────

async function runBuildSummary(
  supabase: ReturnType<typeof createClient>,
  confederation?: string,
  dryRun = false,
): Promise<Record<string, unknown>> {
  const report = { teams_processed: 0, rows_upserted: 0, errors: [] as string[] };

  // Get distinct teams from fixtures
  let query = supabase
    .from("wc_qualifier_fixtures")
    .select("home_provider_team_id, away_provider_team_id, confederation, competition_id, season_label")
    .eq("provider", "api_football")
    .eq("status_short", "FT");

  if (confederation) query = query.eq("confederation", confederation);

  const { data: fixtures, error } = await query;
  if (error || !fixtures) return { ...report, errors: [error?.message ?? "no fixtures"] };

  // Build team set per confederation
  const teamMap = new Map<string, { teamId: string; confederation: string; teamName: string }>();
  for (const f of fixtures) {
    const key_h = `${f.home_provider_team_id}::${f.confederation}`;
    const key_a = `${f.away_provider_team_id}::${f.confederation}`;
    if (!teamMap.has(key_h)) {
      teamMap.set(key_h, { teamId: f.home_provider_team_id, confederation: f.confederation, teamName: "" });
    }
    if (!teamMap.has(key_a)) {
      teamMap.set(key_a, { teamId: f.away_provider_team_id, confederation: f.confederation, teamName: "" });
    }
  }

  for (const [, team] of teamMap) {
    // Aggregate from stats
    const { data: statsRows } = await supabase
      .from("wc_qualifier_team_match_stats")
      .select(
        "provider_fixture_id,total_shots,shots_on_goal,ball_possession_pct,corner_kicks,fouls,yellow_cards,red_cards,provider_xg",
      )
      .eq("provider", "api_football")
      .eq("provider_team_id", team.teamId);

    // Aggregate from fixtures (W/D/L)
    const homeFix = fixtures.filter(
      (f) => f.home_provider_team_id === team.teamId && f.confederation === team.confederation,
    );
    const awayFix = fixtures.filter(
      (f) => f.away_provider_team_id === team.teamId && f.confederation === team.confederation,
    );

    // Fetch fixture details to get scores
    const { data: homeDetails } = await supabase
      .from("wc_qualifier_fixtures")
      .select("home_score,away_score,home_team_name,provider_fixture_id,status_short")
      .eq("provider", "api_football")
      .in(
        "provider_fixture_id",
        homeFix.map((f) => f.home_provider_team_id),
      );

    const { data: homeFixtures } = await supabase
      .from("wc_qualifier_fixtures")
      .select("home_score,away_score,home_team_name,away_team_name")
      .eq("provider", "api_football")
      .eq("home_provider_team_id", team.teamId)
      .eq("status_short", "FT");

    const { data: awayFixtures } = await supabase
      .from("wc_qualifier_fixtures")
      .select("home_score,away_score,home_team_name,away_team_name")
      .eq("provider", "api_football")
      .eq("away_provider_team_id", team.teamId)
      .eq("status_short", "FT");

    let wins = 0,
      draws = 0,
      losses = 0,
      gf = 0,
      ga = 0,
      cleanSheets = 0,
      failedToScore = 0;
    let teamName = team.teamName;

    for (const f of homeFixtures ?? []) {
      if (!teamName) teamName = f.home_team_name ?? "";
      const hs = f.home_score ?? 0;
      const as_ = f.away_score ?? 0;
      gf += hs;
      ga += as_;
      if (hs > as_) wins++;
      else if (hs === as_) draws++;
      else losses++;
      if (as_ === 0) cleanSheets++;
      if (hs === 0) failedToScore++;
    }
    for (const f of awayFixtures ?? []) {
      if (!teamName) teamName = f.away_team_name ?? "";
      const hs = f.home_score ?? 0;
      const as_ = f.away_score ?? 0;
      gf += as_;
      ga += hs;
      if (as_ > hs) wins++;
      else if (as_ === hs) draws++;
      else losses++;
      if (hs === 0) cleanSheets++;
      if (as_ === 0) failedToScore++;
    }

    const played = wins + draws + losses;
    if (played === 0) continue;

    const points = wins * 3 + draws;
    const gd = gf - ga;

    // Average stats
    const stRows = statsRows ?? [];
    const avgShots =
      stRows.length > 0
        ? stRows.reduce((s, r) => s + Number(r.total_shots ?? 0), 0) / stRows.length
        : null;
    const avgShotsOn =
      stRows.length > 0
        ? stRows.reduce((s, r) => s + Number(r.shots_on_goal ?? 0), 0) / stRows.length
        : null;
    const avgPoss =
      stRows.filter((r) => r.ball_possession_pct != null).length > 0
        ? stRows.reduce((s, r) => s + Number(r.ball_possession_pct ?? 0), 0) /
          stRows.filter((r) => r.ball_possession_pct != null).length
        : null;
    const avgCorners =
      stRows.length > 0
        ? stRows.reduce((s, r) => s + Number(r.corner_kicks ?? 0), 0) / stRows.length
        : null;
    const avgFouls =
      stRows.length > 0 ? stRows.reduce((s, r) => s + Number(r.fouls ?? 0), 0) / stRows.length : null;
    const avgYellow =
      stRows.length > 0
        ? stRows.reduce((s, r) => s + Number(r.yellow_cards ?? 0), 0) / stRows.length
        : null;
    const avgRed =
      stRows.length > 0 ? stRows.reduce((s, r) => s + Number(r.red_cards ?? 0), 0) / stRows.length : null;
    const xgRows = stRows.filter((r) => r.provider_xg != null);
    const totalXg = xgRows.length > 0 ? xgRows.reduce((s, r) => s + Number(r.provider_xg), 0) : null;

    if (!dryRun) {
      const { error: sumErr } = await supabase.from("wc_qualifier_team_summary").upsert(
        {
          provider: "api_football",
          provider_team_id: team.teamId,
          team_name: teamName,
          confederation: team.confederation,
          matches_played: played,
          wins,
          draws,
          losses,
          goals_for: gf,
          goals_against: ga,
          goal_difference: gd,
          points,
          points_per_match: played > 0 ? Number((points / played).toFixed(3)) : 0,
          win_rate: played > 0 ? Number((wins / played).toFixed(3)) : 0,
          draw_rate: played > 0 ? Number((draws / played).toFixed(3)) : 0,
          loss_rate: played > 0 ? Number((losses / played).toFixed(3)) : 0,
          goals_for_per_match: played > 0 ? Number((gf / played).toFixed(3)) : 0,
          goals_against_per_match: played > 0 ? Number((ga / played).toFixed(3)) : 0,
          clean_sheets: cleanSheets,
          failed_to_score: failedToScore,
          avg_possession_pct: avgPoss != null ? Number(avgPoss.toFixed(1)) : null,
          avg_total_shots: avgShots != null ? Number(avgShots.toFixed(2)) : null,
          avg_shots_on_goal: avgShotsOn != null ? Number(avgShotsOn.toFixed(2)) : null,
          avg_corners: avgCorners != null ? Number(avgCorners.toFixed(2)) : null,
          avg_fouls: avgFouls != null ? Number(avgFouls.toFixed(2)) : null,
          avg_yellow_cards: avgYellow != null ? Number(avgYellow.toFixed(2)) : null,
          avg_red_cards: avgRed != null ? Number(avgRed.toFixed(2)) : null,
          total_xg: totalXg != null ? Number(totalXg.toFixed(3)) : null,
          xg_per_match: totalXg != null && played > 0 ? Number((totalXg / played).toFixed(3)) : null,
          raw_sources_json: { fixture_count: played, stats_rows: stRows.length },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider,provider_team_id,confederation" },
      );
      if (sumErr) report.errors.push(`summary ${team.teamId}: ${sumErr.message}`);
      else report.rows_upserted++;
    } else {
      report.rows_upserted++;
    }

    report.teams_processed++;
  }

  return report;
}

// ── Validate Coverage ─────────────────────────────────────────────────────────

async function runValidate(
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  const [compsRes, fixturesRes, statsRes, summaryRes] = await Promise.all([
    supabase
      .from("wc_qualifier_competitions")
      .select("provider, confederation")
      .eq("provider", "api_football"),
    supabase
      .from("wc_qualifier_fixtures")
      .select("confederation, status_short, has_stats, has_events, has_lineups, has_players")
      .eq("provider", "api_football"),
    supabase.from("wc_qualifier_team_summary").select("provider, confederation, team_name, matches_played"),
    supabase
      .from("wc_qualifier_team_summary")
      .select("team_name, xg_per_match")
      .eq("provider", "api_football")
      .not("xg_per_match", "is", null),
  ]);

  const fixtures = fixturesRes.data ?? [];
  const finished = fixtures.filter((f) => ["FT", "AET", "PEN"].includes(f.status_short ?? ""));
  const withStats = finished.filter((f) => f.has_stats);
  const withEvents = finished.filter((f) => f.has_events);
  const withLineups = finished.filter((f) => f.has_lineups);

  const byConf: Record<string, { total: number; finished: number; has_stats: number; has_lineups: number }> = {};
  for (const f of fixtures) {
    const c = f.confederation ?? "unknown";
    if (!byConf[c]) byConf[c] = { total: 0, finished: 0, has_stats: 0, has_lineups: 0 };
    byConf[c].total++;
    if (["FT", "AET", "PEN"].includes(f.status_short ?? "")) {
      byConf[c].finished++;
      if (f.has_stats) byConf[c].has_stats++;
      if (f.has_lineups) byConf[c].has_lineups++;
    }
  }

  return {
    competitions: {
      total: compsRes.data?.length ?? 0,
      by_provider: "api_football",
    },
    fixtures: {
      total: fixtures.length,
      finished: finished.length,
      with_stats: withStats.length,
      with_events: withEvents.length,
      with_lineups: withLineups.length,
      stats_coverage_pct:
        finished.length > 0 ? Math.round((withStats.length / finished.length) * 100) : 0,
    },
    by_confederation: byConf,
    team_summaries: {
      total: summaryRes.data?.length ?? 0,
      with_xg: statsRes.data?.length ?? 0,
    },
    verdict:
      finished.length === 0
        ? "FAIL: no finished fixtures"
        : withStats.length / Math.max(finished.length, 1) > 0.7
          ? "PASS"
          : "PARTIAL",
  };
}

// ── Main Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const afKey = Deno.env.get("API_FOOTBALL_KEY") ?? "";
  const smKey = Deno.env.get("SPORTMONKS_API_KEY") ?? "";

  if (!afKey) {
    return new Response(JSON.stringify({ error: "API_FOOTBALL_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: SyncRequest;
  try {
    body = await req.json();
  } catch {
    body = { mode: "validate" };
  }

  const {
    mode,
    provider = "api_football",
    confederation,
    competition_id,
    max_fixtures = 50,
    batch_offset = 0,
    dry_run = false,
    fixture_ids,
    force_refetch = false,
  } = body;

  // Create sync run record
  let syncRunId: string | null = null;
  if (!dry_run && mode !== "validate") {
    const { data: runRow } = await supabase
      .from("wc_qualifier_sync_runs")
      .insert({
        provider,
        run_type: mode,
        status: "running",
        notes: `mode=${mode} confederation=${confederation ?? "all"} max=${max_fixtures} offset=${batch_offset}`,
      })
      .select("id")
      .single();
    syncRunId = runRow?.id ?? null;
  }

  let result: Record<string, unknown> = {};
  let status = "completed";

  try {
    switch (mode) {
      case "discovery":
        result = await runDiscovery(supabase, afKey, smKey, dry_run);
        break;
      case "sync_fixtures":
        result = await runSyncFixtures(supabase, afKey, confederation, competition_id, dry_run);
        break;
      case "sync_details":
        result = await runSyncDetails(supabase, afKey, {
          maxFixtures: max_fixtures,
          offset: batch_offset,
          confederation,
          forceRefetch: force_refetch,
          fixtureIds: fixture_ids,
          dryRun: dry_run,
        });
        break;
      case "sync_standings":
        result = await runSyncStandings(supabase, afKey, confederation, dry_run);
        break;
      case "build_summary":
        result = await runBuildSummary(supabase, confederation, dry_run);
        break;
      case "validate":
        result = await runValidate(supabase);
        break;
      case "full_backfill":
        {
          const d = await runDiscovery(supabase, afKey, smKey, dry_run);
          const f = await runSyncFixtures(supabase, afKey, confederation, undefined, dry_run);
          const st = await runSyncStandings(supabase, afKey, confederation, dry_run);
          const det = await runSyncDetails(supabase, afKey, {
            maxFixtures: max_fixtures,
            offset: batch_offset,
            confederation,
            forceRefetch: force_refetch,
            dryRun: dry_run,
          });
          const sum = await runBuildSummary(supabase, confederation, dry_run);
          const val = await runValidate(supabase);
          result = { discovery: d, fixtures: f, standings: st, details: det, summary: sum, validation: val };
        }
        break;
      default:
        result = { error: `unknown mode: ${mode}` };
        status = "failed";
    }
  } catch (e) {
    status = "failed";
    result = { error: String(e) };
  }

  // Update sync run
  if (syncRunId) {
    await supabase
      .from("wc_qualifier_sync_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        fixtures_processed: (result.fixtures_processed as number) ?? (result.fixtures_upserted as number) ?? 0,
        statistics_rows: (result.stats_rows as number) ?? 0,
        event_rows: (result.event_rows as number) ?? 0,
        lineup_rows: (result.lineup_rows as number) ?? 0,
        lineup_player_rows: (result.lineup_player_rows as number) ?? 0,
        player_stat_rows: (result.player_stat_rows as number) ?? 0,
        standings_rows: (result.standings_rows as number) ?? 0,
        errors_count: Array.isArray(result.errors) ? (result.errors as string[]).length : 0,
        raw_summary_json: result,
      })
      .eq("id", syncRunId);
  }

  return new Response(JSON.stringify({ mode, status, sync_run_id: syncRunId, result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
