import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Every 15 minutes: finds finished matches with ensemble snapshots that haven't
// been evaluated yet. Computes actual_outcome, Brier score, was_correct,
// locks the final snapshot, and triggers brain performance tracking update.

function computeBrierScore(
  probs: { home: number; draw: number; away: number },
  actual: "home_win" | "draw" | "away_win"
): number {
  const indicator = {
    home_win: actual === "home_win" ? 1 : 0,
    draw: actual === "draw" ? 1 : 0,
    away_win: actual === "away_win" ? 1 : 0,
  };
  return parseFloat((
    Math.pow(probs.home - indicator.home_win, 2) +
    Math.pow(probs.draw - indicator.draw, 2) +
    Math.pow(probs.away - indicator.away_win, 2)
  ).toFixed(6));
}

function deriveActualOutcome(homeScore: number, awayScore: number): "home_win" | "draw" | "away_win" {
  if (homeScore > awayScore) return "home_win";
  if (awayScore > homeScore) return "away_win";
  return "draw";
}

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
    const limit: number = body.limit ?? 30;

    // Find finished matches with snapshots not yet evaluated
    const finishedStatuses = ["FT", "AET", "PEN"];
    const { data: finishedMatches, error: fetchErr } = await supabase
      .from("matches")
      .select("id, status, home_score, away_score")
      .in("status", finishedStatuses)
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .limit(limit * 3); // fetch more, filter below

    if (fetchErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch finished matches", detail: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!finishedMatches?.length) {
      return new Response(JSON.stringify({ evaluated: 0, message: "No finished matches" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchIds = finishedMatches.map((m) => m.id);

    // Find snapshots for these matches that are not yet evaluated
    const { data: pendingSnaps, error: snapErr } = await supabase
      .from("ensemble_prediction_snapshots")
      .select("id, match_id, snapshot_version, snapshot_type, home_prob, draw_prob, away_prob, predicted_outcome, is_locked, brain_outputs")
      .in("match_id", matchIds)
      .is("actual_outcome", null)
      .order("snapshot_version", { ascending: false })
      .limit(limit);

    if (snapErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch pending snapshots", detail: snapErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!pendingSnaps?.length) {
      return new Response(JSON.stringify({ evaluated: 0, message: "No pending snapshots to evaluate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build match score lookup
    const matchScores = new Map<string, { home: number; away: number }>(
      finishedMatches.map((m) => [m.id, { home: m.home_score, away: m.away_score }])
    );

    const evaluations: Array<{ snapshot_id: string; match_id: string; actual_outcome: string; brier_score: number; was_correct: boolean; status: string }> = [];

    for (const snap of pendingSnaps) {
      const scores = matchScores.get(snap.match_id);
      if (!scores) continue;

      const actualOutcome = deriveActualOutcome(scores.home, scores.away);
      const brierScore = computeBrierScore(
        { home: snap.home_prob, draw: snap.draw_prob, away: snap.away_prob },
        actualOutcome
      );
      const wasCorrect = snap.predicted_outcome === actualOutcome;

      // Update snapshot: set outcome + lock it
      const { error: updateErr } = await supabase
        .from("ensemble_prediction_snapshots")
        .update({
          actual_outcome: actualOutcome,
          brier_score: brierScore,
          was_correct: wasCorrect,
          is_locked: true,
          locked_at: new Date().toISOString(),
        })
        .eq("id", snap.id)
        .eq("is_locked", false); // only update unlocked; skip if already locked

      if (updateErr) {
        // Already locked or another process beat us — skip
        continue;
      }

      evaluations.push({
        snapshot_id: snap.id,
        match_id: snap.match_id,
        actual_outcome: actualOutcome,
        brier_score: brierScore,
        was_correct: wasCorrect,
        status: "evaluated",
      });
    }

    // If evaluations happened, trigger performance tracking refresh
    if (evaluations.length > 0) {
      EdgeRuntime.waitUntil(
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-learner-trainer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ mode: "performance_update_only" }),
        }).catch(() => { /* non-blocking */ })
      );
    }

    return new Response(JSON.stringify({
      evaluated: evaluations.length,
      skipped: pendingSnaps.length - evaluations.length,
      evaluations,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
