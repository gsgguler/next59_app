import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// AF publishes lineups ~60-75 min before kickoff. We fetch when kickoff is within 2h.
const FETCH_WINDOW_BEFORE_KICKOFF_SEC = 2 * 3600;   // 2 hours
const MIN_BEFORE_KICKOFF_SEC = 15 * 60;              // don't fetch if kickoff < 15 min away

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    // window_hours: how many hours before kickoff to start fetching (default 2, max 4)
    const windowHours: number = Math.min(body.window_hours ?? 2, 4);
    // chunk_size: max fixtures to process (default 20, max 50)
    const chunkSize: number = Math.min(body.chunk_size ?? 20, 50);

    const nowTs = Math.floor(Date.now() / 1000);
    const windowStart = nowTs + MIN_BEFORE_KICKOFF_SEC;
    const windowEnd = nowTs + windowHours * 3600;

    // Find NS matches with kickoff in the fetch window that don't yet have lineups
    const { data: candidates, error: queryErr } = await supabase
      .from("matches")
      .select("id, api_football_fixture_id, timestamp, match_date")
      .eq("status_short", "NS")
      .not("api_football_fixture_id", "is", null)
      .gte("timestamp", windowStart)
      .lte("timestamp", windowEnd)
      .limit(chunkSize);

    if (queryErr) throw queryErr;

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({
        window: { from: new Date(windowStart * 1000).toISOString(), to: new Date(windowEnd * 1000).toISOString() },
        candidates: 0,
        fetched: 0,
        skipped_cached: 0,
        message: "No NS matches in pre-kickoff window",
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let fetched = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    for (const match of candidates) {
      const fixtureId: number = match.api_football_fixture_id;
      const responseHash = `lineups-${fixtureId}`;

      // Check if lineup already stored
      const { data: existing } = await supabase
        .from("api_football_fixture_lineups_raw")
        .select("id, response_json")
        .eq("response_hash", responseHash)
        .maybeSingle();

      if (existing) {
        // Check if lineup actually has data (not empty)
        const lineups = existing.response_json?.lineups ?? [];
        if (lineups.length > 0) {
          skipped++;
          continue;
        }
        // Empty lineup stored before — re-fetch (teams may not have announced yet)
      }

      const endpoint = `https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`;
      let httpStatus = 0;

      try {
        const resp = await fetch(endpoint, {
          headers: { "x-apisports-key": AF_KEY },
        });
        httpStatus = resp.status;
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const json = await resp.json();
        const lineupsArray = json?.response ?? [];

        // Upsert — overwrite if previous fetch returned empty lineup
        const { error: upsertErr } = await supabase
          .from("api_football_fixture_lineups_raw")
          .upsert({
            match_id: match.id,
            api_football_fixture_id: fixtureId,
            endpoint,
            response_hash: responseHash,
            response_json: { fixture_id: fixtureId, lineups: lineupsArray },
            http_status: httpStatus,
            transform_status: lineupsArray.length > 0 ? "raw" : "empty",
          }, { onConflict: "response_hash", ignoreDuplicates: false });

        if (upsertErr && upsertErr.code !== "23505") throw upsertErr;

        fetched++;

        // If we got lineups, re-assess readiness (non-blocking)
        if (lineupsArray.length > 0) {
          EdgeRuntime.waitUntil(
            supabase.rpc("ml_assess_upcoming_match_readiness", { p_match_id: match.id }).catch(() => {})
          );
        }
      } catch (e: any) {
        failed++;
        errors.push(`fixture ${fixtureId}: ${e.message}`);

        await supabase.from("api_football_fixture_lineups_raw").insert({
          match_id: match.id,
          api_football_fixture_id: fixtureId,
          endpoint,
          response_hash: null,
          response_json: null,
          http_status: httpStatus,
          transform_status: "error",
        }).catch(() => {});
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(JSON.stringify({
      window: {
        from: new Date(windowStart * 1000).toISOString(),
        to: new Date(windowEnd * 1000).toISOString(),
      },
      candidates: candidates.length,
      fetched,
      skipped_cached: skipped,
      failed,
      errors: errors.slice(0, 10),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
