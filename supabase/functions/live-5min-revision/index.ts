import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Every 5 minutes: finds live matches and triggers brain-orchestrator revisions.
// Locks the previous snapshot before creating the new one.

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
    const limit: number = body.limit ?? 20;

    // Find currently live matches
    const liveStatuses = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"];
    const { data: liveMatches, error: fetchErr } = await supabase
      .from("matches")
      .select("id, status, elapsed")
      .in("status", liveStatuses)
      .order("kickoff_at")
      .limit(limit);

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch live matches", detail: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!liveMatches?.length) {
      return new Response(JSON.stringify({ revised: 0, message: "No live matches" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/brain-orchestrator`;
    const results: Array<{ match_id: string; minute: number | null; status: string; snapshot_id?: string; locked_prev?: boolean; error?: string }> = [];

    for (const match of liveMatches) {
      const matchMinute = match.elapsed ?? null;

      try {
        // Lock the previous snapshot for this match before revision
        const { data: prevSnap } = await supabase
          .from("ensemble_prediction_snapshots")
          .select("id, is_locked, snapshot_version")
          .eq("match_id", match.id)
          .eq("is_locked", false)
          .order("snapshot_version", { ascending: false })
          .limit(1)
          .maybeSingle();

        let lockedPrev = false;
        if (prevSnap?.id) {
          const { error: lockErr } = await supabase
            .from("ensemble_prediction_snapshots")
            .update({ is_locked: true, locked_at: new Date().toISOString() })
            .eq("id", prevSnap.id)
            .eq("is_locked", false); // optimistic lock guard
          lockedPrev = !lockErr;
        }

        // Trigger revision
        const resp = await fetch(orchestratorUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            match_id: match.id,
            run_type: "live_revision",
            match_minute: matchMinute,
            triggered_by: "live_5min_revision",
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          results.push({ match_id: match.id, minute: matchMinute, status: "revised", snapshot_id: data.snapshot_id, locked_prev: lockedPrev });
        } else {
          const errText = await resp.text();
          results.push({ match_id: match.id, minute: matchMinute, status: "failed", locked_prev: lockedPrev, error: errText.slice(0, 200) });
        }
      } catch (err) {
        results.push({ match_id: match.id, minute: matchMinute, status: "error", error: String(err).slice(0, 200) });
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    const revised = results.filter((r) => r.status === "revised").length;
    const failed = results.filter((r) => r.status !== "revised").length;

    return new Response(JSON.stringify({ revised, failed, live_matches: liveMatches.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
