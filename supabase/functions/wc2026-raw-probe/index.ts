import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 1;
const SEASON = 2026;

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function callApi(
  endpoint: string,
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  if (!apiKey) throw new Error("API_FOOTBALL_KEY not configured");

  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
  });

  const rateLimitHeaders: Record<string, string> = {};
  for (const [key, value] of res.headers.entries()) {
    if (key.startsWith("x-ratelimit") || key.startsWith("x-request")) {
      rateLimitHeaders[key] = value;
    }
  }

  const body = await res.json();
  return { status: res.status, headers: rateLimitHeaders, body };
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface RawRow {
  endpoint: string;
  request_params: Record<string, unknown>;
  provider_entity_type: string;
  provider_entity_id: string | null;
  response_hash: string;
  response_json: unknown;
  http_status: number;
  fetched_at: string;
  season_code: string;
  league_code: string;
  fixture_id: string | null;
  ingestion_run_id: string;
  transform_status: "skipped";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();
    const log: string[] = [];
    let apiCallsUsed = 0;
    let rowsRaw = 0;
    const errors: string[] = [];

    // Step 1: Create ingestion run
    const { data: run, error: runErr } = await supabase
      .from("ingestion_runs")
      .insert({
        provider_name: "api-football",
        ingestion_type: "tournament_probe",
        league_code: "WC",
        season_code: "2026",
        status: "started",
        metadata: {
          description: "World Cup 2026 raw-only probe",
          api_football_league_id: LEAGUE_ID,
          api_football_season: SEASON,
        },
      })
      .select("id")
      .single();

    if (runErr || !run) {
      throw new Error(`Failed to create ingestion run: ${runErr?.message}`);
    }

    const runId = run.id;
    log.push(`Ingestion run created: ${runId}`);

    // Step 2: Fetch league metadata
    const leagueRes = await callApi(`/leagues?id=${LEAGUE_ID}`);
    apiCallsUsed++;
    const leagueJson = JSON.stringify(leagueRes.body);
    const leagueHash = await sha256(leagueJson);

    const leagueBody = leagueRes.body as {
      response?: Array<{ league?: { id: number; name: string }; country?: { name: string } }>;
      results?: number;
    };
    const leagueCount = leagueBody?.results ?? leagueBody?.response?.length ?? 0;
    log.push(`Leagues fetched: ${leagueCount} result(s), HTTP ${leagueRes.status}`);

    const leagueRow: RawRow = {
      endpoint: "/leagues",
      request_params: { id: LEAGUE_ID },
      provider_entity_type: "league",
      provider_entity_id: String(LEAGUE_ID),
      response_hash: leagueHash,
      response_json: leagueRes.body,
      http_status: leagueRes.status,
      fetched_at: new Date().toISOString(),
      season_code: "2026",
      league_code: "WC",
      fixture_id: null,
      ingestion_run_id: runId,
      transform_status: "skipped",
    };

    const { error: leagueInsertErr } = await supabase
      .from("api_football_raw_responses")
      .insert(leagueRow);

    if (leagueInsertErr) {
      if (leagueInsertErr.code === "23505") {
        rowsRaw++;
        log.push("League raw response already exists (dedup hit), counted");
      } else {
        errors.push(`League insert: ${leagueInsertErr.message}`);
        log.push(`ERROR inserting league raw: ${leagueInsertErr.message}`);
      }
    } else {
      rowsRaw++;
      log.push("League raw response stored");
    }

    // Step 3: Fetch teams
    const teamsRes = await callApi(
      `/teams?league=${LEAGUE_ID}&season=${SEASON}`,
    );
    apiCallsUsed++;
    const teamsJson = JSON.stringify(teamsRes.body);
    const teamsHash = await sha256(teamsJson);

    const teamsBody = teamsRes.body as {
      response?: Array<{ team?: { id: number; name: string } }>;
      results?: number;
    };
    const teamCount = teamsBody?.results ?? teamsBody?.response?.length ?? 0;
    log.push(`Teams fetched: ${teamCount} team(s), HTTP ${teamsRes.status}`);

    // Store the bulk response
    const teamsRow: RawRow = {
      endpoint: "/teams",
      request_params: { league: LEAGUE_ID, season: SEASON },
      provider_entity_type: "team_list",
      provider_entity_id: `${LEAGUE_ID}_${SEASON}`,
      response_hash: teamsHash,
      response_json: teamsRes.body,
      http_status: teamsRes.status,
      fetched_at: new Date().toISOString(),
      season_code: "2026",
      league_code: "WC",
      fixture_id: null,
      ingestion_run_id: runId,
      transform_status: "skipped",
    };

    const { error: teamsInsertErr } = await supabase
      .from("api_football_raw_responses")
      .insert(teamsRow);

    if (teamsInsertErr) {
      errors.push(`Teams insert: ${teamsInsertErr.message}`);
      log.push(`ERROR inserting teams raw: ${teamsInsertErr.message}`);
    } else {
      rowsRaw++;
      log.push("Teams raw response stored");
    }

    // Also store individual team entries for granularity
    const teamEntries = teamsBody?.response ?? [];
    if (teamEntries.length > 0) {
      const teamRows: RawRow[] = [];
      for (const entry of teamEntries) {
        const entryJson = JSON.stringify(entry);
        const entryHash = await sha256(entryJson);
        teamRows.push({
          endpoint: "/teams",
          request_params: { league: LEAGUE_ID, season: SEASON },
          provider_entity_type: "team",
          provider_entity_id: String(entry?.team?.id ?? "unknown"),
          response_hash: entryHash,
          response_json: entry,
          http_status: teamsRes.status,
          fetched_at: new Date().toISOString(),
          season_code: "2026",
          league_code: "WC",
          fixture_id: null,
          ingestion_run_id: runId,
          transform_status: "skipped",
        });
      }

      const { error: teamBatchErr } = await supabase
        .from("api_football_raw_responses")
        .insert(teamRows);

      if (teamBatchErr) {
        errors.push(`Team batch insert: ${teamBatchErr.message}`);
        log.push(`ERROR inserting individual team rows: ${teamBatchErr.message}`);
      } else {
        rowsRaw += teamRows.length;
        log.push(`${teamRows.length} individual team raw rows stored`);
      }
    }

    // Step 4: Fetch fixtures
    const fixturesRes = await callApi(
      `/fixtures?league=${LEAGUE_ID}&season=${SEASON}`,
    );
    apiCallsUsed++;
    const fixturesJson = JSON.stringify(fixturesRes.body);
    const fixturesHash = await sha256(fixturesJson);

    const fixturesBody = fixturesRes.body as {
      response?: Array<{ fixture?: { id: number; date: string; status?: { short: string } } }>;
      results?: number;
      paging?: { current: number; total: number };
    };
    const fixtureCount =
      fixturesBody?.results ?? fixturesBody?.response?.length ?? 0;
    const paging = fixturesBody?.paging ?? { current: 1, total: 1 };
    log.push(
      `Fixtures fetched: ${fixtureCount} fixture(s), HTTP ${fixturesRes.status}, page ${paging.current}/${paging.total}`,
    );

    // Store the bulk fixtures response
    const fixturesRow: RawRow = {
      endpoint: "/fixtures",
      request_params: { league: LEAGUE_ID, season: SEASON },
      provider_entity_type: "fixture_list",
      provider_entity_id: `${LEAGUE_ID}_${SEASON}`,
      response_hash: fixturesHash,
      response_json: fixturesRes.body,
      http_status: fixturesRes.status,
      fetched_at: new Date().toISOString(),
      season_code: "2026",
      league_code: "WC",
      fixture_id: null,
      ingestion_run_id: runId,
      transform_status: "skipped",
    };

    const { error: fixturesInsertErr } = await supabase
      .from("api_football_raw_responses")
      .insert(fixturesRow);

    if (fixturesInsertErr) {
      errors.push(`Fixtures insert: ${fixturesInsertErr.message}`);
      log.push(`ERROR inserting fixtures raw: ${fixturesInsertErr.message}`);
    } else {
      rowsRaw++;
      log.push("Fixtures bulk raw response stored");
    }

    // Handle pagination if needed
    if (paging.total > 1) {
      for (let page = 2; page <= paging.total; page++) {
        const pageRes = await callApi(
          `/fixtures?league=${LEAGUE_ID}&season=${SEASON}&page=${page}`,
        );
        apiCallsUsed++;
        const pageJson = JSON.stringify(pageRes.body);
        const pageHash = await sha256(pageJson);

        const pageBody = pageRes.body as {
          response?: unknown[];
          results?: number;
          paging?: { current: number; total: number };
        };
        const pageCount = pageBody?.results ?? pageBody?.response?.length ?? 0;
        log.push(
          `Fixtures page ${page}: ${pageCount} fixture(s), HTTP ${pageRes.status}`,
        );

        const pageRow: RawRow = {
          endpoint: "/fixtures",
          request_params: { league: LEAGUE_ID, season: SEASON, page },
          provider_entity_type: "fixture_list",
          provider_entity_id: `${LEAGUE_ID}_${SEASON}_p${page}`,
          response_hash: pageHash,
          response_json: pageRes.body,
          http_status: pageRes.status,
          fetched_at: new Date().toISOString(),
          season_code: "2026",
          league_code: "WC",
          fixture_id: null,
          ingestion_run_id: runId,
          transform_status: "skipped",
        };

        const { error: pageErr } = await supabase
          .from("api_football_raw_responses")
          .insert(pageRow);

        if (pageErr) {
          errors.push(`Fixtures page ${page}: ${pageErr.message}`);
        } else {
          rowsRaw++;
        }
      }
    }

    // Store individual fixture entries
    const fixtureEntries = fixturesBody?.response ?? [];
    if (fixtureEntries.length > 0) {
      const fixRows: RawRow[] = [];
      for (const entry of fixtureEntries) {
        const e = entry as {
          fixture?: { id: number; date: string; status?: { short: string } };
        };
        const entryJson = JSON.stringify(entry);
        const entryHash = await sha256(entryJson);
        fixRows.push({
          endpoint: "/fixtures",
          request_params: { league: LEAGUE_ID, season: SEASON },
          provider_entity_type: "fixture",
          provider_entity_id: String(e?.fixture?.id ?? "unknown"),
          response_hash: entryHash,
          response_json: entry,
          http_status: fixturesRes.status,
          fetched_at: new Date().toISOString(),
          season_code: "2026",
          league_code: "WC",
          fixture_id: String(e?.fixture?.id ?? null),
          ingestion_run_id: runId,
          transform_status: "skipped",
        });
      }

      // Insert in batches of 50 to avoid payload limits
      const batchSize = 50;
      let fixInserted = 0;
      for (let i = 0; i < fixRows.length; i += batchSize) {
        const batch = fixRows.slice(i, i + batchSize);
        const { error: batchErr } = await supabase
          .from("api_football_raw_responses")
          .insert(batch);

        if (batchErr) {
          errors.push(
            `Fixture batch ${Math.floor(i / batchSize) + 1}: ${batchErr.message}`,
          );
          log.push(
            `ERROR inserting fixture batch ${Math.floor(i / batchSize) + 1}: ${batchErr.message}`,
          );
        } else {
          fixInserted += batch.length;
        }
      }
      rowsRaw += fixInserted;
      log.push(`${fixInserted} individual fixture raw rows stored`);
    }

    // Step 5: Analyze response shapes
    const teamSample = teamEntries[0] ?? null;
    const fixtureSample = fixtureEntries[0] ?? null;

    const statusDistribution: Record<string, number> = {};
    for (const entry of fixtureEntries) {
      const e = entry as {
        fixture?: { status?: { short: string; long: string } };
      };
      const st = e?.fixture?.status?.short ?? "unknown";
      statusDistribution[st] = (statusDistribution[st] ?? 0) + 1;
    }

    // Step 6: Update ingestion run
    const finalStatus = errors.length > 0 ? "completed_with_errors" : "completed";
    const { error: updateErr } = await supabase
      .from("ingestion_runs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        api_calls_used: apiCallsUsed,
        rows_raw: rowsRaw,
        rows_transformed: 0,
        rows_failed: errors.length,
        error_summary: errors.length > 0 ? { errors } : null,
        metadata: {
          description: "World Cup 2026 raw-only probe",
          api_football_league_id: LEAGUE_ID,
          api_football_season: SEASON,
          team_count: teamCount,
          fixture_count: fixtureCount,
          fixture_status_distribution: statusDistribution,
          paging,
          rate_limit_headers: leagueRes.headers,
          team_sample_keys: teamSample ? Object.keys(teamSample) : [],
          fixture_sample_keys: fixtureSample
            ? Object.keys(fixtureSample as Record<string, unknown>)
            : [],
        },
      })
      .eq("id", runId);

    if (updateErr) {
      log.push(`ERROR updating ingestion run: ${updateErr.message}`);
    } else {
      log.push(`Ingestion run ${runId} updated to ${finalStatus}`);
    }

    // Build report
    const report = {
      ingestion_run_id: runId,
      status: finalStatus,
      api_calls_used: apiCallsUsed,
      rows_raw: rowsRaw,
      rows_transformed: 0,
      league: {
        count: leagueCount,
        http_status: leagueRes.status,
        data: leagueBody?.response?.[0]
          ? {
              name: leagueBody.response[0]?.league?.name,
              id: leagueBody.response[0]?.league?.id,
              country: leagueBody.response[0]?.country?.name,
            }
          : null,
      },
      teams: {
        count: teamCount,
        http_status: teamsRes.status,
        sample_keys: teamSample ? Object.keys(teamSample) : [],
      },
      fixtures: {
        count: fixtureCount,
        http_status: fixturesRes.status,
        paging,
        status_distribution: statusDistribution,
        sample_keys: fixtureSample
          ? Object.keys(fixtureSample as Record<string, unknown>)
          : [],
      },
      rate_limit: leagueRes.headers,
      errors,
      log,
    };

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
