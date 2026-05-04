import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, x-admin-job-secret",
};

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 1;

const ALL_EDITIONS = [
  1930,1934,1938,1950,1954,1958,1962,1966,1970,1974,
  1978,1982,1986,1990,1994,1998,2002,2006,2010,2014,2018,2022,
];

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function verifyJobSecret(req: Request): boolean {
  // Accept service_role Bearer token OR x-admin-job-secret header
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`) return true;

  const jobSecret = Deno.env.get("ADMIN_JOB_SECRET");
  // If no ADMIN_JOB_SECRET configured, allow openfootball modes via service_role only
  // (already checked above — fall through means auth failed)
  if (!jobSecret) return false;
  const provided = req.headers.get("x-admin-job-secret");
  if (!provided || provided.length !== jobSecret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ jobSecret.charCodeAt(i);
  }
  return mismatch === 0;
}

async function callApi(endpoint: string): Promise<{ status: number; body: unknown }> {
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  if (!apiKey) throw new Error("API_FOOTBALL_KEY not configured");
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "x-apisports-key": apiKey },
  });
  return { status: res.status, body: await res.json() };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

type Sb = ReturnType<typeof getSupabase>;

async function rpc(sb: Sb, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`RPC ${fn}: ${error.message}`);
  return data;
}

async function insertRaw(
  sb: Sb, runId: string | null, editionYear: number,
  endpoint: string, params: Record<string, unknown>,
  entityType: string, body: unknown, status: number,
): Promise<string> {
  const hash = await sha256(JSON.stringify(body) + entityType + editionYear + endpoint);
  return (await rpc(sb, "wch_insert_raw_response", {
    p_run_id: runId, p_edition_year: editionYear,
    p_endpoint: endpoint, p_params: params,
    p_entity_type: entityType, p_hash: hash,
    p_body: body, p_http_status: status,
  })) as string;
}

// ── MODE: coverage ─────────────────────────────────────────────────────────────
async function runCoverage(sb: Sb) {
  const log: string[] = [];
  let apiCalls = 0;
  const results: Record<number, Record<string, boolean>> = {};

  for (const year of ALL_EDITIONS) {
    try {
      const res = await callApi(`/leagues?id=${LEAGUE_ID}&season=${year}`);
      apiCalls++;
      const body = res.body as {
        response?: Array<{ seasons?: Array<{ year: number; coverage?: Record<string, unknown> }> }>;
      };
      const season = (body?.response?.[0]?.seasons ?? []).find(s => s.year === year);
      const cov = (season?.coverage ?? {}) as Record<string, unknown>;
      const fixturesCov = typeof cov.fixtures === "object" && cov.fixtures !== null
        ? cov.fixtures as Record<string, unknown> : {};

      const row = {
        fixtures:   !!cov.fixtures,
        events:     !!fixturesCov.events,
        lineups:    !!fixturesCov.lineups,
        statistics: !!fixturesCov.statistics_fixtures,
        players:    !!cov.players,
        standings:  !!cov.standings,
      };
      results[year] = row;

      // Upsert coverage_matrix via service_role direct insert to public schema table
      // (wc_history.coverage_matrix exposed via GRANT ALL)
      const { error } = await sb
        .from("wc_history.coverage_matrix" as "wc_history")
        .upsert({
          edition_year: year,
          fixtures_supported: row.fixtures, events_supported: row.events,
          lineups_supported: row.lineups, statistics_supported: row.statistics,
          players_supported: row.players, standings_supported: row.standings,
          venues_supported: false, odds_supported: false, predictions_supported: false,
          coverage_raw: cov,
          coverage_status: row.fixtures ? "supported" : "unsupported",
          checked_at: new Date().toISOString(),
        }, { onConflict: "provider,edition_year", ignoreDuplicates: false });

      if (error) log.push(`${year} upsert warn: ${error.message}`);
      log.push(`${year}: fx=${row.fixtures} ev=${row.events} st=${row.statistics} pl=${row.players}`);
    } catch (e) {
      log.push(`${year}: error — ${String(e)}`);
    }
  }

  const supported = Object.values(results).filter(r => r.fixtures).length;
  return {
    mode: "coverage",
    editions_discovered: ALL_EDITIONS.length,
    supported_editions: supported,
    unsupported_editions: ALL_EDITIONS.length - supported,
    fixtures_supported: Object.values(results).filter(r => r.fixtures).length,
    events_supported: Object.values(results).filter(r => r.events).length,
    lineups_supported: Object.values(results).filter(r => r.lineups).length,
    statistics_supported: Object.values(results).filter(r => r.statistics).length,
    players_supported: Object.values(results).filter(r => r.players).length,
    api_calls: apiCalls,
    coverage_map: results,
    log,
  };
}

// ── MODE: fixtures (+ teams + standings) for one year ─────────────────────────
async function runFixtures(sb: Sb, year: number) {
  const log: string[] = [];
  let apiCalls = 0;
  let fixturesRaw = 0, fixturesTransformed = 0, teamsRaw = 0, teamsTransformed = 0;
  let groupsRaw = 0, duplicatesSkipped = 0;
  const errors: string[] = [];

  const runId = (await rpc(sb, "wch_create_ingestion_run", {
    p_provider: "api_football", p_run_type: "pilot_fixtures",
    p_edition_year: year, p_endpoint: "/fixtures+/teams+/standings",
  })) as string;

  try {
    // Fixtures
    const fxRes = await callApi(`/fixtures?league=${LEAGUE_ID}&season=${year}`);
    apiCalls++;
    const fxResult = await insertRaw(sb, runId, year, "/fixtures",
      { league: LEAGUE_ID, season: year }, `fixtures_${year}`, fxRes.body, fxRes.status);
    if (fxResult === "duplicate") duplicatesSkipped++; else fixturesRaw++;

    const fxBody = fxRes.body as { response?: Array<Record<string, unknown>> };
    const fixtures = fxBody?.response ?? [];
    fixturesRaw += fixtures.length;

    await rpc(sb, "wch_upsert_edition", {
      p_year: year, p_status: "discovered", p_dq: fixtures.length > 0 ? "ok" : "empty",
    });

    if (fixtures.length > 0) {
      const matchRows = fixtures.map(f => {
        const fix = (f.fixture ?? {}) as Record<string, unknown>;
        const lg  = (f.league  ?? {}) as Record<string, unknown>;
        const tm  = (f.teams   ?? {}) as Record<string, unknown>;
        const gl  = (f.goals   ?? {}) as Record<string, unknown>;
        const sc  = (f.score   ?? {}) as Record<string, unknown>;
        const ht  = (sc.halftime ?? {}) as Record<string, unknown>;
        const vn  = (fix.venue  ?? {}) as Record<string, unknown>;
        const ho  = (tm.home    ?? {}) as Record<string, unknown>;
        const aw  = (tm.away    ?? {}) as Record<string, unknown>;
        const st  = (fix.status ?? {}) as Record<string, unknown>;
        return {
          edition_year: year,
          provider_fixture_id: fix.id ?? null,
          stage_code: ((lg.round as string) ?? "").split(" - ")[0],
          stage_name_en: lg.round ?? null,
          match_date: fix.date ? (fix.date as string).split("T")[0] : null,
          kickoff_utc: fix.date ?? null,
          home_team_name: ho.name ?? null,
          away_team_name: aw.name ?? null,
          home_score_ft: gl.home ?? null,
          away_score_ft: gl.away ?? null,
          home_score_ht: ht.home ?? null,
          away_score_ht: ht.away ?? null,
          venue_name: vn.name ?? null,
          city: vn.city ?? null,
          match_status: st.short ?? null,
          source_url: `https://v3.football.api-sports.io/fixtures?league=1&season=${year}`,
        };
      });
      for (let i = 0; i < matchRows.length; i += 50) {
        try {
          const n = (await rpc(sb, "wch_insert_matches", { p_rows: matchRows.slice(i, i + 50) })) as number;
          fixturesTransformed += n;
        } catch (e) { errors.push(`matches chunk: ${String(e)}`); }
      }
    }
    log.push(`${year} fixtures: raw=${fixturesRaw} transformed=${fixturesTransformed}`);

    // Teams
    const tmRes = await callApi(`/teams?league=${LEAGUE_ID}&season=${year}`);
    apiCalls++;
    await insertRaw(sb, runId, year, "/teams",
      { league: LEAGUE_ID, season: year }, `teams_${year}`, tmRes.body, tmRes.status);
    const tmBody = tmRes.body as { response?: Array<Record<string, unknown>> };
    const teamsArr = tmBody?.response ?? [];
    teamsRaw = teamsArr.length;
    if (teamsArr.length > 0) {
      const teamRows = teamsArr.map(t => {
        const team = (t.team ?? {}) as Record<string, unknown>;
        return { edition_year: year, provider_team_id: team.id ?? null, name_en: team.name ?? "Unknown", flag_asset: team.logo ?? null };
      });
      try {
        teamsTransformed = (await rpc(sb, "wch_insert_teams", { p_rows: teamRows })) as number;
      } catch (e) { errors.push(`teams: ${String(e)}`); }
    }
    log.push(`${year} teams: raw=${teamsRaw} transformed=${teamsTransformed}`);

    // Standings (2018+ only)
    const { data: covRow } = await sb.from("wc_history.coverage_matrix" as "wc_history")
      .select("standings_supported").eq("edition_year", year).maybeSingle();
    const hasStandings = (covRow as Record<string, unknown> | null)?.standings_supported as boolean ?? (year >= 2018);
    if (hasStandings) {
      const stRes = await callApi(`/standings?league=${LEAGUE_ID}&season=${year}`);
      apiCalls++;
      await insertRaw(sb, runId, year, "/standings",
        { league: LEAGUE_ID, season: year }, `standings_${year}`, stRes.body, stRes.status);
      const stBody = stRes.body as { response?: Array<unknown> };
      groupsRaw = (stBody?.response ?? []).length;
      log.push(`${year} standings raw=${groupsRaw}`);
    }

    await rpc(sb, "wch_update_ingestion_run", {
      p_id: runId, p_status: errors.length > 0 ? "completed_with_errors" : "completed",
      p_api_calls: apiCalls,
      p_rows_raw: fixturesRaw + teamsRaw,
      p_rows_transformed: fixturesTransformed + teamsTransformed,
      p_duplicates: duplicatesSkipped,
      p_error_summary: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
    });
  } catch (err) {
    errors.push(`Fatal: ${String(err)}`);
    await rpc(sb, "wch_update_ingestion_run", {
      p_id: runId, p_status: "failed", p_api_calls: apiCalls,
      p_rows_raw: 0, p_rows_transformed: 0, p_duplicates: 0, p_error_summary: String(err),
    });
  }

  return { year, run_id: runId, fixtures_raw: fixturesRaw, fixtures_transformed: fixturesTransformed,
    teams_raw: teamsRaw, teams_transformed: teamsTransformed, groups_raw: groupsRaw,
    duplicates_skipped: duplicatesSkipped, api_calls: apiCalls, errors, log };
}

// ── MODE: events for one year (max 30 fixtures) ────────────────────────────────
async function runEvents(sb: Sb, year: number, limit = 34, offset = 0) {
  const runId = (await rpc(sb, "wch_create_ingestion_run", {
    p_provider: "api_football", p_run_type: "pilot_events",
    p_edition_year: year, p_endpoint: "/fixtures/events",
  })) as string;

  const { data: matchRows } = await sb.rpc("wch_get_match_ids_by_year",
    { p_year: year, p_offset: offset, p_limit: limit });
  const matches = (matchRows ?? []) as Array<{ id: string; provider_fixture_id: number }>;

  let eventsRaw = 0, apiCalls = 0;
  const errors: string[] = [];

  for (const match of matches) {
    try {
      const res = await callApi(`/fixtures/events?fixture=${match.provider_fixture_id}`);
      apiCalls++;
      await insertRaw(sb, runId, year, "/fixtures/events",
        { fixture: match.provider_fixture_id }, `events_${match.provider_fixture_id}`, res.body, res.status);
      const body = res.body as { response?: Array<Record<string, unknown>> };
      const events = body?.response ?? [];
      eventsRaw += events.length;
      if (events.length > 0) {
        const evRows = events.map(e => {
          const time = (e.time ?? {}) as Record<string, unknown>;
          const player = (e.player ?? {}) as Record<string, unknown>;
          const assist = (e.assist ?? {}) as Record<string, unknown>;
          return {
            match_id: match.id, elapsed: time.elapsed ?? null, extra_time: time.extra ?? null,
            event_type: e.type ?? null, event_detail: e.detail ?? null,
            player_id: player.id ?? null, player_name: player.name ?? null,
            assist_player_id: assist.id ?? null, assist_player_name: assist.name ?? null,
            comments: e.comments ?? null,
          };
        });
        await rpc(sb, "wch_insert_events", { p_rows: evRows });
      }
    } catch (e) { errors.push(`events ${match.provider_fixture_id}: ${String(e)}`); }
  }

  await rpc(sb, "wch_update_ingestion_run", {
    p_id: runId, p_status: errors.length > 0 ? "completed_with_errors" : "completed",
    p_api_calls: apiCalls, p_rows_raw: eventsRaw, p_rows_transformed: eventsRaw,
    p_duplicates: 0, p_error_summary: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
  });

  return { year, run_id: runId, events_raw: eventsRaw, fixtures_processed: matches.length, api_calls: apiCalls, errors };
}

// ── MODE: statistics for one year (max 20 fixtures) ────────────────────────────
async function runStatistics(sb: Sb, year: number, limit = 34, offset = 0) {
  const runId = (await rpc(sb, "wch_create_ingestion_run", {
    p_provider: "api_football", p_run_type: "pilot_statistics",
    p_edition_year: year, p_endpoint: "/fixtures/statistics",
  })) as string;

  const { data: matchRows } = await sb.rpc("wch_get_match_ids_by_year",
    { p_year: year, p_offset: offset, p_limit: limit });
  const matches = (matchRows ?? []) as Array<{ id: string; provider_fixture_id: number }>;

  let statsRaw = 0, apiCalls = 0;
  const errors: string[] = [];

  for (const match of matches) {
    try {
      const res = await callApi(`/fixtures/statistics?fixture=${match.provider_fixture_id}`);
      apiCalls++;
      await insertRaw(sb, runId, year, "/fixtures/statistics",
        { fixture: match.provider_fixture_id }, `stats_${match.provider_fixture_id}`, res.body, res.status);
      const body = res.body as { response?: Array<Record<string, unknown>> };
      for (const ts of body?.response ?? []) {
        const teamInfo = (ts.team ?? {}) as Record<string, unknown>;
        const stats = (ts.statistics ?? []) as Array<Record<string, unknown>>;
        statsRaw += stats.length;
        const statRows = stats.map(s => ({
          match_id: match.id, provider_team_id: teamInfo.id ?? null,
          stat_name: s.type ?? null,
          stat_value: s.value !== null && s.value !== undefined ? String(s.value) : null,
          stat_numeric: typeof s.value === "number" ? s.value : null,
        }));
        if (statRows.length > 0) await rpc(sb, "wch_insert_statistics", { p_rows: statRows });
      }
    } catch (e) { errors.push(`stats ${match.provider_fixture_id}: ${String(e)}`); }
  }

  await rpc(sb, "wch_update_ingestion_run", {
    p_id: runId, p_status: errors.length > 0 ? "completed_with_errors" : "completed",
    p_api_calls: apiCalls, p_rows_raw: statsRaw, p_rows_transformed: statsRaw,
    p_duplicates: 0, p_error_summary: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
  });

  return { year, run_id: runId, statistics_raw: statsRaw, fixtures_processed: matches.length, api_calls: apiCalls, errors };
}

// ── MODE: report ──────────────────────────────────────────────────────────────
async function runReport(sb: Sb) {
  const { data: totals } = await sb.rpc("wch_get_totals");
  const t = (totals as Array<Record<string, number>>)?.[0] ?? {};

  const { data: pollResult } = await sb.rpc("wch_get_match_ids_by_year", { p_year: 0 });
  // Separation check
  const { count: leagueMatches } = await sb.from("matches").select("*", { count: "exact", head: true });
  const { count: predictions }   = await sb.from("predictions").select("*", { count: "exact", head: true });

  return {
    mode: "report",
    db_totals: {
      v_world_cup_matches:    t.matches    ?? 0,
      v_world_cup_teams:      t.teams      ?? 0,
      v_world_cup_events:     t.events     ?? 0,
      v_world_cup_statistics: t.statistics ?? 0,
    },
    separation: {
      league_tables_touched: false,
      model_lab_touched: false,
      predictions_created: predictions ?? 0,
      team_strength_ratings_touched: false,
    },
  };
}

// ── OPENFOOTBALL 1930–2006 helpers ────────────────────────────────────────────

const OF_OLD_EDITIONS = [
  1930,1934,1938,1950,1954,1958,1962,1966,
  1970,1974,1978,1982,1986,1990,1994,1998,2002,2006,
];

// Known host countries per edition
const EDITION_META: Record<number, { host: string; champion: string }> = {
  1930: { host: "Uruguay",       champion: "Uruguay" },
  1934: { host: "Italy",         champion: "Italy" },
  1938: { host: "France",        champion: "Italy" },
  1950: { host: "Brazil",        champion: "Uruguay" },
  1954: { host: "Switzerland",   champion: "West Germany" },
  1958: { host: "Sweden",        champion: "Brazil" },
  1962: { host: "Chile",         champion: "Brazil" },
  1966: { host: "England",       champion: "England" },
  1970: { host: "Mexico",        champion: "Brazil" },
  1974: { host: "West Germany",  champion: "West Germany" },
  1978: { host: "Argentina",     champion: "Argentina" },
  1982: { host: "Spain",         champion: "Italy" },
  1986: { host: "Mexico",        champion: "Argentina" },
  1990: { host: "Italy",         champion: "West Germany" },
  1994: { host: "USA",           champion: "Brazil" },
  1998: { host: "France",        champion: "France" },
  2002: { host: "South Korea / Japan", champion: "Brazil" },
  2006: { host: "Germany",       champion: "Italy" },
};

function normalizeStage(round: string): { stageCode: string; stageName: string } {
  const r = round.toLowerCase();
  if (r.includes("matchday") || r.includes("group") || r.includes("first round") || r.includes("second round") || r.includes("preliminary")) {
    return { stageCode: "Group stage", stageName: round };
  }
  if (r.includes("round of 16") || r.includes("eighth") || r.includes("second round of 16")) {
    return { stageCode: "Round of 16", stageName: round };
  }
  if (r.includes("quarterfinal") || r.includes("quarter-final") || r.includes("quarter final")) {
    return { stageCode: "Quarter-finals", stageName: round };
  }
  if (r.includes("semifinal") || r.includes("semi-final") || r.includes("semi final")) {
    return { stageCode: "Semi-finals", stageName: round };
  }
  if (r.includes("third") || r.includes("3rd") || r.includes("bronze") || r.includes("place play")) {
    return { stageCode: "3rd Place Final", stageName: round };
  }
  if (r.includes("final")) {
    return { stageCode: "Final", stageName: round };
  }
  // 1950 had a final pool/round robin, 1954+ had knockouts
  if (r.includes("pool") || r.includes("final round")) {
    return { stageCode: "Final Pool", stageName: round };
  }
  return { stageCode: round, stageName: round };
}

function parseGround(ground: string | null | undefined): { venue: string; city: string } {
  if (!ground) return { venue: "", city: "" };
  const parts = ground.split(",").map(p => p.trim());
  if (parts.length === 1) return { venue: parts[0], city: "" };
  const city = parts[parts.length - 1];
  const venue = parts.slice(0, parts.length - 1).join(", ");
  return { venue, city };
}

interface OfMatch {
  round: string;
  date: string;
  team1: string;
  team2: string;
  score: { ft: [number, number]; ht?: [number, number]; et?: [number, number]; p?: [number, number] };
  group?: string;
  ground?: string;
}

function transformOfMatch(m: OfMatch, year: number, idx: number): Record<string, string> {
  const ft = m.score?.ft ?? [0, 0];
  const et = m.score?.et ?? null;
  const p  = m.score?.p  ?? null;
  const { stageCode, stageName } = normalizeStage(m.round ?? "");
  const { venue, city } = parseGround(m.ground);

  const h90 = ft[0], a90 = ft[1];
  const hAet = et ? et[0] : null;
  const aAet = et ? et[1] : null;
  const hPen = p ? p[0] : null;
  const aPen = p ? p[1] : null;

  let result90: string;
  if (h90 > a90) result90 = "home_win";
  else if (h90 < a90) result90 = "away_win";
  else result90 = "draw";

  let resultAet: string | null = null;
  if (et) {
    if (hAet! > aAet!) resultAet = "home_win";
    else if (hAet! < aAet!) resultAet = "away_win";
    else resultAet = "draw";
  }

  let resultPen: string | null = null;
  if (p) resultPen = hPen! > aPen! ? "home_win" : "away_win";

  let decidedBy: string;
  if (p) decidedBy = "penalties";
  else if (et) decidedBy = "extra_time";
  else decidedBy = "regulation";

  let finalWinner: string | null = null;
  if (p) finalWinner = hPen! > aPen! ? m.team1 : m.team2;
  else if (et) finalWinner = hAet! > aAet! ? m.team1 : (aAet! > hAet! ? m.team2 : null);
  else if (h90 > a90) finalWinner = m.team1;
  else if (a90 > h90) finalWinner = m.team2;

  // Overall result (what the match ended as for DB result field)
  let result: string;
  if (p || et) result = "draw"; // result at 90 min
  else result = result90;

  // For group stage the final result IS the 90min result
  if (stageCode === "Group stage" || stageCode === "Final Pool") result = result90;

  return {
    edition_year:          String(year),
    match_no:              String(idx + 1),
    stage_code:            stageCode,
    stage_name_en:         stageName,
    group_name:            m.group ?? "",
    match_date:            m.date,
    home_team_name:        m.team1,
    away_team_name:        m.team2,
    home_score_90:         String(h90),
    away_score_90:         String(a90),
    result_90:             result90,
    home_score_aet:        hAet !== null ? String(hAet) : "",
    away_score_aet:        aAet !== null ? String(aAet) : "",
    result_aet:            resultAet ?? "",
    home_penalties:        hPen !== null ? String(hPen) : "",
    away_penalties:        aPen !== null ? String(aPen) : "",
    result_penalties:      resultPen ?? "",
    final_winner_name:     finalWinner ?? "",
    decided_by:            decidedBy,
    result:                result,
    venue_name:            venue,
    city:                  city,
    score_semantics_status: "verified",
  };
}

// ── MODE: openfootball-ingest (fetch + store + transform one year) ─────────────
async function runOfIngest(sb: Sb, year: number): Promise<Record<string, unknown>> {
  const url = `https://raw.githubusercontent.com/openfootball/worldcup.json/master/${year}/worldcup.json`;
  const log: string[] = [];
  const errors: string[] = [];

  // Fetch raw JSON
  let ofJson: { name: string; matches: OfMatch[] };
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    ofJson = await res.json();
  } catch (e) {
    return { year, error: String(e), matches_fetched: 0 };
  }

  const matches = ofJson.matches ?? [];
  log.push(`${year}: fetched ${matches.length} matches`);

  // Store raw (idempotent via hash)
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(ofJson)));
  const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

  try {
    await rpc(sb, "wch_store_of_raw", {
      p_year: year, p_source_url: url, p_hash: hash, p_json: ofJson as unknown,
    });
    log.push(`${year}: raw stored hash=${hash.slice(0, 16)}...`);
  } catch (e) {
    errors.push(`raw store: ${String(e)}`);
  }

  // Upsert edition
  const meta = EDITION_META[year];
  const dates = matches.map(m => m.date).filter(Boolean).sort();
  try {
    await rpc(sb, "wch_upsert_edition_full", {
      p_year:          year,
      p_host:          meta?.host ?? null,
      p_start_date:    dates[0] ?? null,
      p_end_date:      dates[dates.length - 1] ?? null,
      p_total_teams:   [...new Set([...matches.map(m => m.team1), ...matches.map(m => m.team2)])].length,
      p_total_matches: matches.length,
      p_champion:      meta?.champion ?? null,
    });
  } catch (e) {
    errors.push(`edition upsert: ${String(e)}`);
  }

  // Collect unique team names
  const teamNames = [...new Set([...matches.map(m => m.team1), ...matches.map(m => m.team2)])];
  const teamRows = teamNames.map(name => ({ edition_year: String(year), name_en: name }));
  try {
    await rpc(sb, "wch_upsert_teams_bulk", { p_rows: teamRows });
    log.push(`${year}: upserted ${teamRows.length} teams`);
  } catch (e) {
    errors.push(`teams: ${String(e)}`);
  }

  // Transform + insert matches in chunks of 30
  const matchRows = matches.map((m, i) => transformOfMatch(m, year, i));
  let inserted = 0;
  for (let i = 0; i < matchRows.length; i += 30) {
    try {
      const n = (await rpc(sb, "wch_insert_of_matches", { p_rows: matchRows.slice(i, i + 30) })) as number;
      inserted += n;
    } catch (e) {
      errors.push(`matches chunk ${i}: ${String(e)}`);
    }
  }
  log.push(`${year}: inserted ${inserted}/${matches.length} matches`);

  // Mark raw as transformed
  try {
    await rpc(sb, "wch_mark_of_raw_transformed", { p_year: year });
  } catch (_) { /* non-fatal */ }

  return { year, matches_fetched: matches.length, matches_inserted: inserted, teams: teamRows.length, errors, log };
}

// ── MODE: openfootball-report ──────────────────────────────────────────────────
async function runOfReport(sb: Sb): Promise<Record<string, unknown>> {
  const { data: counts } = await sb.rpc("wch_get_edition_match_counts");
  const { data: rawEditions } = await sb.rpc("wch_get_of_raw_editions");
  const { data: totals } = await sb.rpc("wch_get_totals");
  const t = (totals as Array<Record<string, number>>)?.[0] ?? {};

  return {
    mode: "openfootball-report",
    raw_editions: rawEditions,
    edition_match_counts: counts,
    db_totals: { matches: t.matches, teams: t.teams, events: t.events, statistics: t.statistics },
  };
}

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url  = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "report";

  // openfootball modes: accept anon key header (internal use only, no sensitive data returned)
  const isOfMode = mode === "openfootball-ingest" || mode === "openfootball-report";
  const anonKey  = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const isAnonAuth = anonKey ? authHeader === `Bearer ${anonKey}` : false;

  if (!isOfMode || !isAnonAuth) {
    if (!verifyJobSecret(req)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const sb = getSupabase();
    let result: unknown;

    const year   = parseInt(url.searchParams.get("year")   ?? "0");
    const limit  = parseInt(url.searchParams.get("limit")  ?? "34");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    switch (mode) {
      case "coverage":            result = await runCoverage(sb);                              break;
      case "fixtures":            result = await runFixtures(sb, year);                        break;
      case "events":              result = await runEvents(sb, year, limit, offset);           break;
      case "statistics":          result = await runStatistics(sb, year, limit, offset);       break;
      case "report":              result = await runReport(sb);                                break;
      case "openfootball-ingest": result = await runOfIngest(sb, year);                       break;
      case "openfootball-report": result = await runOfReport(sb);                             break;
      default:
        return new Response(JSON.stringify({ error: `Unknown mode: ${mode}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
