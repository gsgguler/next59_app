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
  const jobSecret = Deno.env.get("ADMIN_JOB_SECRET");
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
async function runEvents(sb: Sb, year: number, limit = 30) {
  const runId = (await rpc(sb, "wch_create_ingestion_run", {
    p_provider: "api_football", p_run_type: "pilot_events",
    p_edition_year: year, p_endpoint: "/fixtures/events",
  })) as string;

  const { data: matchRows } = await sb.rpc("wch_get_match_ids_by_year", { p_year: year });
  const matches = ((matchRows ?? []) as Array<{ id: string; provider_fixture_id: number }>).slice(0, limit);

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
async function runStatistics(sb: Sb, year: number, limit = 20) {
  const runId = (await rpc(sb, "wch_create_ingestion_run", {
    p_provider: "api_football", p_run_type: "pilot_statistics",
    p_edition_year: year, p_endpoint: "/fixtures/statistics",
  })) as string;

  const { data: matchRows } = await sb.rpc("wch_get_match_ids_by_year", { p_year: year });
  const matches = ((matchRows ?? []) as Array<{ id: string; provider_fixture_id: number }>).slice(0, limit);

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

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (!verifyJobSecret(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url  = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "report";
  const year = parseInt(url.searchParams.get("year") ?? "0");

  try {
    const sb = getSupabase();
    let result: unknown;

    switch (mode) {
      case "coverage":   result = await runCoverage(sb);            break;
      case "fixtures":   result = await runFixtures(sb, year);      break;
      case "events":     result = await runEvents(sb, year, 30);    break;
      case "statistics": result = await runStatistics(sb, year, 20); break;
      case "report":     result = await runReport(sb);              break;
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
