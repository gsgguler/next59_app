import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Finds matches within the T-12h window that have no prematch ensemble snapshot
// and triggers brain-orchestrator for each. Called hourly by cron.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const horizonHours: number = body.horizon_hours ?? 12;
    const limit: number = body.limit ?? 20;

    // Find upcoming matches within horizon that have no prematch snapshot yet
    const now = new Date();
    const horizon = new Date(now.getTime() + horizonHours * 60 * 60 * 1000);

    const { data: upcoming, error: fetchErr } = await supabase
      .from("matches")
      .select("id, kickoff_at, status")
      .eq("status", "NS") // Not Started
      .gte("kickoff_at", now.toISOString())
      .lte("kickoff_at", horizon.toISOString())
      .order("kickoff_at")
      .limit(limit);

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch upcoming matches", detail: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!upcoming?.length) {
      return new Response(JSON.stringify({ scheduled: 0, message: "No upcoming matches in window" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out matches that already have a prematch snapshot
    const matchIds = upcoming.map((m) => m.id);
    const { data: existingSnaps } = await supabase
      .from("ensemble_prediction_snapshots")
      .select("match_id")
      .in("match_id", matchIds)
      .eq("snapshot_type", "prematch");

    const alreadyScheduled = new Set((existingSnaps ?? []).map((s) => s.match_id));
    const toSchedule = upcoming.filter((m) => !alreadyScheduled.has(m.id));

    if (!toSchedule.length) {
      return new Response(JSON.stringify({ scheduled: 0, already_covered: matchIds.length, message: "All matches already have prematch snapshots" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Invoke brain-orchestrator for each match (staggered to avoid rate limits)
    const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/brain-orchestrator`;
    const results: Array<{ match_id: string; status: string; snapshot_id?: string; error?: string }> = [];

    for (const match of toSchedule) {
      try {
        const resp = await fetchWithRetry(orchestratorUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            match_id: match.id,
            run_type: "prematch",
            triggered_by: "prematch_scheduler",
          }),
        }, { maxRetries: 3, baseDelayMs: 1000 });

        if (resp.ok) {
          const data = await resp.json();
          results.push({ match_id: match.id, status: "scheduled", snapshot_id: data.snapshot_id });
        } else {
          const errText = await resp.text();
          results.push({ match_id: match.id, status: "failed", error: errText.slice(0, 200) });
        }
      } catch (err) {
        results.push({ match_id: match.id, status: "error", error: String(err).slice(0, 200) });
      }

      // Brief pause between matches to avoid hammering the orchestrator
      await new Promise((r) => setTimeout(r, 300));
    }

    const scheduled = results.filter((r) => r.status === "scheduled").length;
    const failed = results.filter((r) => r.status !== "scheduled").length;

    return new Response(JSON.stringify({
      scheduled,
      failed,
      already_covered: alreadyScheduled.size,
      horizon_hours: horizonHours,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
