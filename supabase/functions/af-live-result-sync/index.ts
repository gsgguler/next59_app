import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TERMINAL_STATUSES = ["FT", "AET", "PEN", "AWD", "WO"];
const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"];

// AF league ID → competition_season_id (2025-2026)
const LEAGUE_SEASONS: Record<number, { cs_id: string; af_season: number }> = {
  39:  { cs_id: "f0f5f43c-55c4-44a1-9ca6-dbed10460097", af_season: 2025 }, // Premier League
  61:  { cs_id: "96b68baf-5368-43ed-93d4-05720a45a843", af_season: 2025 }, // Ligue 1
  78:  { cs_id: "dff96a19-a77a-42ae-bf04-bae1098e8411", af_season: 2025 }, // Bundesliga
  88:  { cs_id: "09af551c-9bae-48ed-aa01-28a328f0d5cb", af_season: 2025 }, // Eredivisie
  135: { cs_id: "160eb576-5b10-4803-be2c-e92eeb4afd82", af_season: 2025 }, // Serie A
  140: { cs_id: "60b9c7ec-ae43-4986-98e8-77ac6de3c3f2", af_season: 2025 }, // La Liga
  203: { cs_id: "fb898419-630e-439c-a709-003b9ac3bb34", af_season: 2025 }, // Süper Lig
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = new Date();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    const mode: "live" | "recent" = body.mode ?? "recent";
    const recentHours: number = Math.min(body.recent_hours ?? 3, 12);
    const leagueFilter: number | null = body.league_id ?? null;

    const nowTs = Math.floor(Date.now() / 1000);
    const windowStart = mode === "live"
      ? nowTs - 6 * 3600
      : nowTs - recentHours * 3600;

    const statusFilter = mode === "live"
      ? [...LIVE_STATUSES, "NS"]
      : [...TERMINAL_STATUSES, ...LIVE_STATUSES, "NS"];

    // ── 1. Find matches needing sync ────────────────────────────────────────
    let query = supabase
      .from("matches")
      .select("id, api_football_fixture_id, status_short, competition_season_id, timestamp")
      .not("api_football_fixture_id", "is", null)
      .in("status_short", statusFilter)
      .gte("timestamp", windowStart)
      .lte("timestamp", nowTs + 300);

    if (leagueFilter) {
      const csId = LEAGUE_SEASONS[leagueFilter]?.cs_id;
      if (csId) query = query.eq("competition_season_id", csId);
    }

    const { data: matchesToSync, error: queryErr } = await query.limit(100);
    if (queryErr) throw queryErr;

    const matchesSeen = matchesToSync?.length ?? 0;

    if (matchesSeen === 0) {
      await persistSyncRun(supabase, {
        mode, startedAt, status: "completed",
        matchesSeen: 0, matchesUpdated: 0, errors: [],
      });
      return new Response(JSON.stringify({
        mode, matches_seen: 0, matches_updated: 0, message: "No matches in sync window",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── 2. Batch AF API calls ───────────────────────────────────────────────
    const fixtureIds = (matchesToSync as any[]).map((m) => m.api_football_fixture_id);
    const chunks: number[][] = [];
    for (let i = 0; i < fixtureIds.length; i += 20) {
      chunks.push(fixtureIds.slice(i, i + 20));
    }

    let totalUpdated = 0;
    const errors: string[] = [];
    const updatedLiveMatchIds: string[] = [];

    for (const chunk of chunks) {
      const idsParam = chunk.join("-");
      const endpoint = `https://v3.football.api-sports.io/fixtures?ids=${idsParam}`;

      try {
        const resp = await fetchWithRetry(endpoint, {
          headers: { "x-apisports-key": AF_KEY },
        }, { maxRetries: 3, baseDelayMs: 1000 });
        if (!resp.ok) throw new Error(`AF API HTTP ${resp.status}`);
        const json = await resp.json();
        const fixtures: any[] = json?.response ?? [];

        for (const fix of fixtures) {
          // Per-fixture error isolation — never crash the whole loop
          try {
            const fixtureId: number = fix.fixture.id;
            const statusShort: string = fix.fixture.status.short;
            const elapsed: number | null = fix.fixture.status.elapsed ?? null;

            const dbMatch = (matchesToSync as any[]).find(
              (m) => m.api_football_fixture_id === fixtureId
            );
            if (!dbMatch) continue;

            // Skip unchanged non-terminal statuses
            if (
              dbMatch.status_short === statusShort &&
              !TERMINAL_STATUSES.includes(statusShort)
            ) continue;

            const ftHome: number | null = fix.score?.fulltime?.home ?? null;
            const ftAway: number | null = fix.score?.fulltime?.away ?? null;
            const htHome: number | null = fix.score?.halftime?.home ?? null;
            const htAway: number | null = fix.score?.halftime?.away ?? null;
            const etHome: number | null = fix.score?.extratime?.home ?? null;
            const etAway: number | null = fix.score?.extratime?.away ?? null;
            const penHome: number | null = fix.score?.penalty?.home ?? null;
            const penAway: number | null = fix.score?.penalty?.away ?? null;

            let result: string | null = null;
            if (TERMINAL_STATUSES.includes(statusShort) && ftHome !== null && ftAway !== null) {
              if (ftHome > ftAway) result = "H";
              else if (ftAway > ftHome) result = "A";
              else result = "D";
            }

            const updatePayload: Record<string, unknown> = {
              status_short: statusShort,
              status_long: fix.fixture.status.long ?? null,
              status_elapsed: elapsed,
              updated_at: new Date().toISOString(),
            };

            if (htHome !== null) { updatePayload.home_score_ht = htHome; updatePayload.away_score_ht = htAway; }
            if (ftHome !== null) { updatePayload.home_score_ft = ftHome; updatePayload.away_score_ft = ftAway; }
            if (etHome !== null) { updatePayload.home_score_et = etHome; updatePayload.away_score_et = etAway; }
            if (penHome !== null) { updatePayload.home_score_pen = penHome; updatePayload.away_score_pen = penAway; }
            if (result) updatePayload.result = result;

            const { error: updateErr } = await supabase
              .from("matches")
              .update(updatePayload)
              .eq("id", dbMatch.id);

            if (updateErr) {
              errors.push(`fixture_${fixtureId}: ${updateErr.message}`);
            } else {
              totalUpdated++;
              // Queue live engine compute for LIVE matches (not terminal)
              if (LIVE_STATUSES.includes(statusShort)) {
                updatedLiveMatchIds.push(dbMatch.id as string);
              }
            }
          } catch (perFixtureErr: unknown) {
            const msg = perFixtureErr instanceof Error ? perFixtureErr.message : String(perFixtureErr);
            errors.push(`per_fixture_error: ${msg}`);
          }
        }
      } catch (chunkErr: unknown) {
        const msg = chunkErr instanceof Error ? chunkErr.message : String(chunkErr);
        errors.push(`chunk_error: ${msg}`);
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    // ── 3. Trigger live engine for updated live matches ─────────────────────
    if (updatedLiveMatchIds.length > 0) {
      try {
        await supabase.rpc("run_live_match_engine_public");
      } catch (_) { /* best effort — never block sync log */ }
    }

    // ── 4. Persist sync run log ─────────────────────────────────────────────
    await persistSyncRun(supabase, {
      mode, startedAt, status: errors.length > 0 && totalUpdated === 0 ? "failed" : "completed",
      matchesSeen, matchesUpdated: totalUpdated, errors,
    });

    return new Response(JSON.stringify({
      mode,
      matches_seen: matchesSeen,
      matches_updated: totalUpdated,
      chunks: chunks.length,
      errors: errors.slice(0, 5),
      duration_ms: Date.now() - startedAt.getTime(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    // Persist failure — best effort
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await persistSyncRun(supabase, {
        mode: "unknown", startedAt, status: "failed",
        matchesSeen: 0, matchesUpdated: 0,
        errors: [`fatal: ${msg}`],
      });
    } catch (_) { /* best effort */ }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Persist run to model_lab.result_sync_runs ─────────────────────────────────

async function persistSyncRun(
  supabase: ReturnType<typeof createClient>,
  opts: {
    mode: string;
    startedAt: Date;
    status: string;
    matchesSeen: number;
    matchesUpdated: number;
    errors: string[];
  },
) {
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - opts.startedAt.getTime();

  // Truncate errors — no secrets, compact only
  const errorsJson = opts.errors
    .slice(0, 20)
    .map((e) => e.slice(0, 200));

  await supabase
    .schema("model_lab")
    .from("result_sync_runs")
    .insert({
      mode: opts.mode,
      started_at: opts.startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      status: opts.status,
      matches_seen: opts.matchesSeen,
      matches_updated: opts.matchesUpdated,
      events_processed: 0,
      stats_processed: 0,
      lineups_processed: 0,
      errors_json: errorsJson,
      duration_ms: durationMs,
      // legacy columns kept for backwards compat
      triggered_at: opts.startedAt.toISOString(),
      matches_found: opts.matchesSeen,
      updated: opts.matchesUpdated,
    });
}
