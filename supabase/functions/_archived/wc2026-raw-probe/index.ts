import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, x-admin-job-secret",
};

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 1;
const SEASON = 2026;

// ─────────────────────────────────────────────────────────────────────────────
// Supabase client — service_role for DB writes
// ─────────────────────────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers — fail closed
// ─────────────────────────────────────────────────────────────────────────────

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

async function verifyAdminUser(token: string): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) return false;

    // Verify JWT using anon-key client to get user, then check role
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user }, error } = await anonClient.auth.getUser();
    if (error || !user) return false;

    // Check app_metadata role (cannot be set by user)
    const appRole = user.app_metadata?.role;
    if (appRole === "admin" || appRole === "super_admin") return true;

    // Check profiles table role as secondary check
    const serviceClient = getSupabase();
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return profile?.role === "admin" || profile?.role === "super_admin";
  } catch {
    return false;
  }
}

function verifyJobSecret(req: Request): boolean {
  const jobSecret = Deno.env.get("ADMIN_JOB_SECRET");
  // Fail closed: if ADMIN_JOB_SECRET is not configured, deny
  if (!jobSecret) return false;
  const provided = req.headers.get("x-admin-job-secret");
  if (!provided) return false;
  // Constant-time comparison to prevent timing attacks
  if (provided.length !== jobSecret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ jobSecret.charCodeAt(i);
  }
  return mismatch === 0;
}

async function requireWc2026IngestionAuth(
  req: Request,
): Promise<Response | null> {
  // Option A: valid x-admin-job-secret header
  if (verifyJobSecret(req)) return null;

  // Option B: admin JWT
  const token = getBearerToken(req);
  if (token) {
    const isAdmin = await verifyAdminUser(token);
    if (isAdmin) return null;
    // Token present but not admin
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // No credentials at all
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// API-Football caller — never logs the key
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Raw row type — maps to wc2026_api_football_raw_responses
// ─────────────────────────────────────────────────────────────────────────────

interface RawRow {
  endpoint: string;
  request_params: Record<string, unknown>;
  provider_entity_type: string;
  provider_entity_id: string | null;
  response_hash: string;
  response_json: unknown;
  http_status: number;
  fetched_at: string;
  transform_status: "raw" | "skipped";
  ingestion_run_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // ── Auth gate — must pass before any DB write or API call ──────────────────
  const authDenied = await requireWc2026IngestionAuth(req);
  if (authDenied) return authDenied;

  try {
    const supabase = getSupabase();
    const log: string[] = [];
    let apiCallsUsed = 0;
    let rowsRaw = 0;
    const errors: string[] = [];

    // Step 1: Create ingestion run in WC2026-specific table
    const { data: run, error: runErr } = await supabase
      .from("wc2026_ingestion_runs")
      .insert({
        provider_name: "api_football",
        ingestion_type: "wc2026_full_probe",
        run_status: "running",
      })
      .select("id")
      .single();

    if (runErr || !run) {
      throw new Error(`Failed to create ingestion run: ${runErr?.message}`);
    }

    const runId = run.id;
    log.push(`Ingestion run created: ${runId}`);

    // ── Helper: insert raw row with dedup handling ───────────────────────────
    async function insertRaw(row: RawRow): Promise<void> {
      const { error } = await supabase
        .from("wc2026_api_football_raw_responses")
        .insert(row);

      if (error) {
        if (error.code === "23505") {
          // Duplicate hash — already stored, not an error
          rowsRaw++;
          log.push(`Dedup hit: ${row.provider_entity_type} ${row.provider_entity_id ?? "bulk"}`);
        } else {
          errors.push(`Raw insert (${row.provider_entity_type}): ${error.message}`);
        }
      } else {
        rowsRaw++;
      }
    }

    // ── Helper: insert raw batch ─────────────────────────────────────────────
    async function insertRawBatch(rows: RawRow[]): Promise<void> {
      const BATCH = 50;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase
          .from("wc2026_api_football_raw_responses")
          .insert(batch);
        if (error) {
          if (error.code === "23505") {
            // Batch has at least one dup — insert individually to salvage the rest
            for (const row of batch) await insertRaw(row);
          } else {
            errors.push(`Raw batch (${batch[0]?.provider_entity_type}): ${error.message}`);
          }
        } else {
          rowsRaw += batch.length;
        }
      }
    }

    // ── Step 2: Fetch league metadata ────────────────────────────────────────
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

    await insertRaw({
      endpoint: "/leagues",
      request_params: { id: LEAGUE_ID },
      provider_entity_type: "league",
      provider_entity_id: String(LEAGUE_ID),
      response_hash: leagueHash,
      response_json: leagueRes.body,
      http_status: leagueRes.status,
      fetched_at: new Date().toISOString(),
      transform_status: "raw",
      ingestion_run_id: runId,
    });

    // ── Step 3: Fetch teams ───────────────────────────────────────────────────
    const teamsRes = await callApi(`/teams?league=${LEAGUE_ID}&season=${SEASON}`);
    apiCallsUsed++;
    const teamsJson = JSON.stringify(teamsRes.body);
    const teamsHash = await sha256(teamsJson);

    const teamsBody = teamsRes.body as {
      response?: Array<{ team?: { id: number; name: string } }>;
      results?: number;
    };
    const teamCount = teamsBody?.results ?? teamsBody?.response?.length ?? 0;
    log.push(`Teams fetched: ${teamCount} team(s), HTTP ${teamsRes.status}`);

    await insertRaw({
      endpoint: "/teams",
      request_params: { league: LEAGUE_ID, season: SEASON },
      provider_entity_type: "wc2026_teams",
      provider_entity_id: `${LEAGUE_ID}_${SEASON}`,
      response_hash: teamsHash,
      response_json: teamsRes.body,
      http_status: teamsRes.status,
      fetched_at: new Date().toISOString(),
      transform_status: "raw",
      ingestion_run_id: runId,
    });

    // Store individual team entries
    const teamEntries = teamsBody?.response ?? [];
    if (teamEntries.length > 0) {
      const teamRows: RawRow[] = [];
      for (const entry of teamEntries) {
        const entryHash = await sha256(JSON.stringify(entry));
        teamRows.push({
          endpoint: "/teams",
          request_params: { league: LEAGUE_ID, season: SEASON },
          provider_entity_type: "team",
          provider_entity_id: String((entry as { team?: { id: number } })?.team?.id ?? "unknown"),
          response_hash: entryHash,
          response_json: entry,
          http_status: teamsRes.status,
          fetched_at: new Date().toISOString(),
          transform_status: "raw",
          ingestion_run_id: runId,
        });
      }
      await insertRawBatch(teamRows);
      log.push(`${teamEntries.length} individual team rows stored`);
    }

    // ── Step 4: Fetch fixtures ────────────────────────────────────────────────
    const fixturesRes = await callApi(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`);
    apiCallsUsed++;
    const fixturesJson = JSON.stringify(fixturesRes.body);
    const fixturesHash = await sha256(fixturesJson);

    const fixturesBody = fixturesRes.body as {
      response?: Array<{ fixture?: { id: number; date: string; status?: { short: string } } }>;
      results?: number;
      paging?: { current: number; total: number };
    };
    const fixtureCount = fixturesBody?.results ?? fixturesBody?.response?.length ?? 0;
    const paging = fixturesBody?.paging ?? { current: 1, total: 1 };
    log.push(`Fixtures fetched: ${fixtureCount} fixture(s), HTTP ${fixturesRes.status}, page ${paging.current}/${paging.total}`);

    await insertRaw({
      endpoint: "/fixtures",
      request_params: { league: LEAGUE_ID, season: SEASON },
      provider_entity_type: "wc2026_fixtures",
      provider_entity_id: `${LEAGUE_ID}_${SEASON}`,
      response_hash: fixturesHash,
      response_json: fixturesRes.body,
      http_status: fixturesRes.status,
      fetched_at: new Date().toISOString(),
      transform_status: "raw",
      ingestion_run_id: runId,
    });

    // Handle pagination
    if (paging.total > 1) {
      for (let page = 2; page <= paging.total; page++) {
        const pageRes = await callApi(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}&page=${page}`);
        apiCallsUsed++;
        const pageHash = await sha256(JSON.stringify(pageRes.body));
        const pageBody = pageRes.body as { response?: unknown[]; results?: number };
        const pageCount = pageBody?.results ?? pageBody?.response?.length ?? 0;
        log.push(`Fixtures page ${page}: ${pageCount} fixture(s)`);

        await insertRaw({
          endpoint: "/fixtures",
          request_params: { league: LEAGUE_ID, season: SEASON, page },
          provider_entity_type: "wc2026_fixtures",
          provider_entity_id: `${LEAGUE_ID}_${SEASON}_p${page}`,
          response_hash: pageHash,
          response_json: pageRes.body,
          http_status: pageRes.status,
          fetched_at: new Date().toISOString(),
          transform_status: "raw",
          ingestion_run_id: runId,
        });
      }
    }

    // Store individual fixture entries
    const fixtureEntries = fixturesBody?.response ?? [];
    if (fixtureEntries.length > 0) {
      const fixRows: RawRow[] = [];
      for (const entry of fixtureEntries) {
        const e = entry as { fixture?: { id: number } };
        const entryHash = await sha256(JSON.stringify(entry));
        fixRows.push({
          endpoint: "/fixtures",
          request_params: { league: LEAGUE_ID, season: SEASON },
          provider_entity_type: "fixture",
          provider_entity_id: String(e?.fixture?.id ?? "unknown"),
          response_hash: entryHash,
          response_json: entry,
          http_status: fixturesRes.status,
          fetched_at: new Date().toISOString(),
          transform_status: "raw",
          ingestion_run_id: runId,
        });
      }
      await insertRawBatch(fixRows);
      log.push(`${fixtureEntries.length} individual fixture rows stored`);
    }

    // ── Step 5: Fetch players ─────────────────────────────────────────────────
    // ISOLATION: Writes ONLY to wc2026_player_profiles + wc2026_team_squads
    // NEVER touches public.players, player_teams, player_aliases, model_lab,
    // team_strength_ratings, predictions, or any domestic league table.
    const playersRes = await callApi(`/players?league=${LEAGUE_ID}&season=${SEASON}`);
    apiCallsUsed++;

    const playersBody = playersRes.body as {
      response?: Array<{
        player?: {
          id: number;
          name: string;
          firstname: string;
          lastname: string;
          age: number;
          birth?: { date: string; place: string; country: string };
          nationality: string;
          height: string;
          weight: string;
          injured: boolean;
          photo: string;
        };
        statistics?: Array<{
          team?: { id: number; name: string };
          games?: { position: string; number: number };
        }>;
      }>;
      results?: number;
      paging?: { current: number; total: number };
    };

    const playerCount = playersBody?.results ?? playersBody?.response?.length ?? 0;
    const playersPaging = playersBody?.paging ?? { current: 1, total: 1 };
    log.push(`Players fetched: ${playerCount} player(s), HTTP ${playersRes.status}, page ${playersPaging.current}/${playersPaging.total}`);

    // Store bulk raw
    await insertRaw({
      endpoint: "/players",
      request_params: { league: LEAGUE_ID, season: SEASON },
      provider_entity_type: "wc2026_players",
      provider_entity_id: `${LEAGUE_ID}_${SEASON}_p1`,
      response_hash: await sha256(JSON.stringify(playersRes.body)),
      response_json: playersRes.body,
      http_status: playersRes.status,
      fetched_at: new Date().toISOString(),
      transform_status: "raw",
      ingestion_run_id: runId,
    });

    // Handle players pagination
    let allPlayerEntries = [...(playersBody?.response ?? [])];
    if (playersPaging.total > 1) {
      for (let page = 2; page <= Math.min(playersPaging.total, 20); page++) {
        const pageRes = await callApi(`/players?league=${LEAGUE_ID}&season=${SEASON}&page=${page}`);
        apiCallsUsed++;
        const pageBody = pageRes.body as { response?: typeof playersBody.response; results?: number };
        const pageEntries = pageBody?.response ?? [];
        allPlayerEntries = allPlayerEntries.concat(pageEntries);

        await insertRaw({
          endpoint: "/players",
          request_params: { league: LEAGUE_ID, season: SEASON, page },
          provider_entity_type: "wc2026_players",
          provider_entity_id: `${LEAGUE_ID}_${SEASON}_p${page}`,
          response_hash: await sha256(JSON.stringify(pageRes.body)),
          response_json: pageRes.body,
          http_status: pageRes.status,
          fetched_at: new Date().toISOString(),
          transform_status: "raw",
          ingestion_run_id: runId,
        });

        log.push(`Players page ${page}: ${pageEntries.length} player(s)`);
      }
    }

    // Normalize into wc2026_player_profiles + wc2026_team_squads (WC-isolated tables only)
    let profilesInserted = 0;
    let squadRowsInserted = 0;
    const ingestionStatusByTeam: Record<number, { name: string; count: number; hasPos: boolean; hasNum: boolean }> = {};

    for (const entry of allPlayerEntries) {
      const p = entry?.player;
      const stats = entry?.statistics ?? [];
      const teamInfo = stats[0]?.team;
      const gameInfo = stats[0]?.games;

      if (!p?.id || !p?.name) continue;

      const teamId = teamInfo?.id ?? 0;
      const teamName = teamInfo?.name ?? "Unknown";
      if (!ingestionStatusByTeam[teamId]) {
        ingestionStatusByTeam[teamId] = { name: teamName, count: 0, hasPos: false, hasNum: false };
      }
      ingestionStatusByTeam[teamId].count++;
      if (gameInfo?.position) ingestionStatusByTeam[teamId].hasPos = true;
      if (gameInfo?.number) ingestionStatusByTeam[teamId].hasNum = true;

      const { error: profileErr } = await supabase
        .from("wc2026_player_profiles")
        .upsert({
          api_football_player_id: p.id,
          player_name: p.name,
          firstname: p.firstname ?? null,
          lastname: p.lastname ?? null,
          age: p.age ?? null,
          birth_date: p.birth?.date ?? null,
          birth_place: p.birth?.place ?? null,
          birth_country: p.birth?.country ?? null,
          nationality: p.nationality ?? null,
          height: p.height ?? null,
          weight: p.weight ?? null,
          injured: p.injured ?? false,
          photo_url: p.photo ?? null,
          raw_payload: entry,
          data_status: "raw_imported",
          updated_at: new Date().toISOString(),
        }, { onConflict: "api_football_player_id", ignoreDuplicates: false });

      if (profileErr) {
        errors.push(`Profile upsert player ${p.id}: ${profileErr.message}`);
        continue;
      }
      profilesInserted++;

      if (!teamInfo?.id) continue;

      const { data: profileRow } = await supabase
        .from("wc2026_player_profiles")
        .select("id")
        .eq("api_football_player_id", p.id)
        .maybeSingle();

      if (!profileRow?.id) continue;

      const { error: squadErr } = await supabase
        .from("wc2026_team_squads")
        .upsert({
          api_football_team_id: teamInfo.id,
          api_football_player_id: p.id,
          wc2026_player_profile_id: profileRow.id,
          player_name: p.name,
          position: gameInfo?.position ?? null,
          shirt_number: gameInfo?.number ?? null,
          squad_status: "provisional",
          source_endpoint: "/players?league=1&season=2026",
          source_checked_at: new Date().toISOString(),
          raw_payload: entry,
        }, { onConflict: "api_football_team_id,api_football_player_id", ignoreDuplicates: false });

      if (!squadErr) squadRowsInserted++;
      else errors.push(`Squad upsert player ${p.id} team ${teamInfo.id}: ${squadErr.message}`);
    }

    // Write per-team ingestion status
    for (const [teamId, info] of Object.entries(ingestionStatusByTeam)) {
      const completeness = info.count >= 23 ? "complete" : info.count > 0 ? "partial" : "missing";
      await supabase
        .from("wc2026_player_ingestion_status")
        .upsert({
          ingestion_run_id: runId,
          api_team_id: Number(teamId),
          team_name: info.name,
          player_count: info.count,
          has_positions: info.hasPos,
          has_numbers: info.hasNum,
          completeness_status: completeness,
          notes: info.count < 23 ? `Only ${info.count} players; provisional` : null,
        }, { onConflict: "api_team_id,ingestion_run_id", ignoreDuplicates: false });
    }

    log.push(`Players normalized: ${profilesInserted} profiles, ${squadRowsInserted} squad rows, ${Object.keys(ingestionStatusByTeam).length} teams`);

    // ── Step 6: Analyze fixture status distribution ───────────────────────────
    const statusDistribution: Record<string, number> = {};
    for (const entry of fixtureEntries) {
      const e = entry as { fixture?: { status?: { short: string } } };
      const st = e?.fixture?.status?.short ?? "unknown";
      statusDistribution[st] = (statusDistribution[st] ?? 0) + 1;
    }

    // ── Step 7: Finalize ingestion run ────────────────────────────────────────
    const finalStatus = errors.length > 0 ? "completed_with_errors" : "completed";
    await supabase
      .from("wc2026_ingestion_runs")
      .update({
        run_status: finalStatus,
        completed_at: new Date().toISOString(),
        api_calls_used: apiCallsUsed,
        rows_raw: rowsRaw,
        rows_transformed: profilesInserted + squadRowsInserted,
        error_summary: errors.length > 0 ? errors.slice(0, 20).join(" | ") : null,
      })
      .eq("id", runId);

    log.push(`Ingestion run ${runId} → ${finalStatus}`);

    return new Response(
      JSON.stringify({
        ingestion_run_id: runId,
        status: finalStatus,
        api_calls_used: apiCallsUsed,
        rows_raw: rowsRaw,
        rows_transformed: profilesInserted + squadRowsInserted,
        league: { count: leagueCount, http_status: leagueRes.status },
        teams: { count: teamCount, http_status: teamsRes.status },
        fixtures: {
          count: fixtureCount,
          http_status: fixturesRes.status,
          paging,
          status_distribution: statusDistribution,
        },
        players: {
          raw_count: allPlayerEntries.length,
          http_status: playersRes.status,
          paging: playersPaging,
          profiles_inserted: profilesInserted,
          squad_rows_inserted: squadRowsInserted,
          teams_with_data: Object.keys(ingestionStatusByTeam).length,
          isolation: "wc2026_player_profiles + wc2026_team_squads ONLY",
          squad_status: "provisional",
        },
        rate_limit: leagueRes.headers,
        errors: errors.slice(0, 20),
        log,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
