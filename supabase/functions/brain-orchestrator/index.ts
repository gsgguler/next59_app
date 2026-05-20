import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrainConfig {
  brain_key: string;
  display_name: string;
  system_prompt: string;
  default_weight: number;
  input_spec: Record<string, string>;
  output_spec: Record<string, unknown>;
  is_active: boolean;
  is_live_only: boolean;
}

interface WeightProfile {
  profile_key: string;
  weights: Record<string, number>;
}

interface BrainInput {
  match_id: string;
  match_context: Record<string, unknown>;
  brain_key: string;
  system_prompt: string;
  is_live: boolean;
  match_minute: number | null;
}

interface BrainOutput {
  brain_key: string;
  status: "success" | "failed" | "skipped";
  latency_ms: number;
  output: {
    winner_prob: { home: number; draw: number; away: number };
    confidence: number;
    [key: string]: unknown;
  } | null;
  error: string | null;
}

interface OrchestratorRequest {
  match_id: string;
  run_type: "prematch" | "live_revision" | "manual";
  match_minute?: number;
  force_profile?: string;
  triggered_by?: string;
}

// ─── Dynamic weight computation ───────────────────────────────────────────────

function resolveWeightProfile(
  context: Record<string, unknown>,
  profiles: WeightProfile[],
  forceProfile?: string
): { profile_key: string; weights: Record<string, number> } {
  if (forceProfile) {
    const forced = profiles.find((p) => p.profile_key === forceProfile);
    if (forced) return { profile_key: forced.profile_key, weights: { ...forced.weights } };
  }

  const matchMinute = (context.match_minute as number | null) ?? null;
  const isLive = matchMinute !== null && matchMinute > 0;
  const isDerby = Boolean(context.is_derby);
  const isCupFinal = Boolean(context.is_cup_final);
  const weatherExtreme = Boolean(context.weather_extreme);
  const transferChaos = Boolean(context.transfer_window_chaos);

  let profileKey = "league_standard";
  if (isLive && matchMinute !== null && matchMinute >= 60) profileKey = "live_60min";
  else if (weatherExtreme) profileKey = "weather_extreme";
  else if (transferChaos) profileKey = "transfer_window_chaos";
  else if (isCupFinal) profileKey = "cup_final";
  else if (isDerby) profileKey = "derby_match";

  const profile = profiles.find((p) => p.profile_key === profileKey)
    ?? profiles.find((p) => p.profile_key === "league_standard")
    ?? profiles[0];

  const weights = { ...profile.weights };

  // Apply live multiplier: as minute advances, increase live brain weight
  if (isLive && matchMinute !== null && profileKey !== "live_60min") {
    const liveMultiplier = Math.min(3.0, 0.5 + matchMinute / 45);
    weights["live"] = Math.min(0.45, (weights["live"] ?? 0.10) * liveMultiplier);
  }

  // Normalize to sum = 1.0
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  if (total > 0) {
    for (const k of Object.keys(weights)) {
      weights[k] = parseFloat((weights[k] / total).toFixed(4));
    }
  }

  return { profile_key: profileKey, weights };
}

// ─── Brain runner (calls Claude API per brain) ────────────────────────────────

async function runBrain(input: BrainInput, anthropicKey: string): Promise<BrainOutput> {
  const t0 = Date.now();
  try {
    const userMessage = JSON.stringify({
      instruction: "Analyze the following match context and return your prediction as valid JSON matching the output specification.",
      match_context: input.match_context,
      is_live: input.is_live,
      match_minute: input.match_minute,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: input.system_prompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { brain_key: input.brain_key, status: "failed", latency_ms: Date.now() - t0, output: null, error: `HTTP ${response.status}: ${err.slice(0, 200)}` };
    }

    const data = await response.json();
    const rawText: string = data.content?.[0]?.text ?? "";

    // Extract JSON from the response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { brain_key: input.brain_key, status: "failed", latency_ms: Date.now() - t0, output: null, error: "No JSON found in brain response" };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate winner_prob exists and sums to ~1
    const wp = parsed.winner_prob;
    if (!wp || typeof wp.home !== "number" || typeof wp.draw !== "number" || typeof wp.away !== "number") {
      return { brain_key: input.brain_key, status: "failed", latency_ms: Date.now() - t0, output: null, error: "Invalid winner_prob in brain response" };
    }

    // Normalize probabilities
    const sum = wp.home + wp.draw + wp.away;
    if (sum > 0) {
      parsed.winner_prob = {
        home: parseFloat((wp.home / sum).toFixed(4)),
        draw: parseFloat((wp.draw / sum).toFixed(4)),
        away: parseFloat((wp.away / sum).toFixed(4)),
      };
    }

    // Clamp confidence
    parsed.confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.5));

    return { brain_key: input.brain_key, status: "success", latency_ms: Date.now() - t0, output: parsed, error: null };
  } catch (err) {
    return { brain_key: input.brain_key, status: "failed", latency_ms: Date.now() - t0, output: null, error: String(err).slice(0, 300) };
  }
}

// ─── Fusion: weighted average with confidence weighting ───────────────────────

function fuseResults(
  results: BrainOutput[],
  weights: Record<string, number>
): { home: number; draw: number; away: number; confidence: number; uncertainty_low: number; uncertainty_high: number } {
  let totalWeight = 0;
  let sumHome = 0;
  let sumDraw = 0;
  let sumAway = 0;
  let sumConf = 0;
  const homeProbs: number[] = [];

  for (const r of results) {
    if (r.status !== "success" || !r.output) continue;
    const w = (weights[r.brain_key] ?? 0) * r.output.confidence;
    if (w <= 0) continue;
    sumHome += r.output.winner_prob.home * w;
    sumDraw += r.output.winner_prob.draw * w;
    sumAway += r.output.winner_prob.away * w;
    sumConf += r.output.confidence * w;
    totalWeight += w;
    homeProbs.push(r.output.winner_prob.home);
  }

  if (totalWeight === 0) {
    return { home: 0.45, draw: 0.27, away: 0.28, confidence: 0.1, uncertainty_low: 0.3, uncertainty_high: 0.6 };
  }

  const home = parseFloat((sumHome / totalWeight).toFixed(4));
  const draw = parseFloat((sumDraw / totalWeight).toFixed(4));
  const away = parseFloat((1 - home - draw).toFixed(4));
  const confidence = parseFloat((sumConf / totalWeight).toFixed(3));

  // Uncertainty interval from variance across brain home predictions
  const variance = homeProbs.length > 1
    ? homeProbs.reduce((s, p) => s + Math.pow(p - home, 2), 0) / homeProbs.length
    : 0.02;
  const stdDev = Math.sqrt(variance);
  const uncertainty_low = parseFloat(Math.max(0, home - 1.645 * stdDev).toFixed(4));
  const uncertainty_high = parseFloat(Math.min(1, home + 1.645 * stdDev).toFixed(4));

  return { home, draw, away, confidence, uncertainty_low, uncertainty_high };
}

// ─── Build explanation JSON ───────────────────────────────────────────────────

function buildExplanation(results: BrainOutput[], weights: Record<string, number>, fused: ReturnType<typeof fuseResults>) {
  const successBrains = results.filter((r) => r.status === "success" && r.output);
  const dominantBrain = successBrains.reduce<BrainOutput | null>((best, r) => {
    const w = weights[r.brain_key] ?? 0;
    const bestW = best ? weights[best.brain_key] ?? 0 : 0;
    return w > bestW ? r : best;
  }, null);

  const homeProbs = successBrains.map((r) => r.output!.winner_prob.home);
  const range = homeProbs.length > 1 ? Math.max(...homeProbs) - Math.min(...homeProbs) : 0;
  const consensusLevel = range < 0.10 ? "high" : range < 0.20 ? "medium" : "low";

  const keyFactors = successBrains.flatMap((r) => {
    const f = r.output as Record<string, unknown>;
    return Array.isArray(f.key_factors) ? f.key_factors.slice(0, 2) : [];
  }).slice(0, 8);

  return {
    dominant_brain: dominantBrain?.brain_key ?? null,
    consensus_level: consensusLevel,
    brain_agreement_range: parseFloat(range.toFixed(4)),
    key_factors: keyFactors,
    brains_succeeded: successBrains.length,
    brains_failed: results.filter((r) => r.status === "failed").length,
    fused_home_prob: fused.home,
    uncertainty_spread: parseFloat((fused.uncertainty_high - fused.uncertainty_low).toFixed(4)),
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: OrchestratorRequest = await req.json();
    const { match_id, run_type, match_minute = null, force_profile, triggered_by = "api" } = body;

    if (!match_id || !run_type) {
      return new Response(JSON.stringify({ error: "match_id and run_type are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load brain configs
    const { data: brainConfigs, error: bcErr } = await supabase
      .from("brain_configs")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    if (bcErr || !brainConfigs?.length) {
      return new Response(JSON.stringify({ error: "Failed to load brain configs", detail: bcErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load weight profiles
    const { data: weightProfiles } = await supabase
      .from("brain_weight_profiles")
      .select("profile_key, weights");

    const profiles: WeightProfile[] = (weightProfiles ?? []) as WeightProfile[];

    // Load match context
    const { data: match } = await supabase
      .from("matches")
      .select(`
        id, timestamp, status_short,
        home_team:teams!matches_home_team_id_fkey(id, name),
        away_team:teams!matches_away_team_id_fkey(id, name),
        venue:venues(name, city),
        competition_season:competition_seasons(
          competition:competitions(name, country:countries(name))
        )
      `)
      .eq("id", match_id)
      .maybeSingle();

    if (!match) {
      return new Response(JSON.stringify({ error: "Match not found", match_id }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load ELO context
    const { data: eloData } = await supabase
      .schema("model_lab")
      .from("team_elo_ratings")
      .select("team_id, elo_rating, uncertainty")
      .in("team_id", [(match.home_team as { id: string }).id, (match.away_team as { id: string }).id]);

    const matchContext: Record<string, unknown> = {
      match_id,
      home_team: match.home_team,
      away_team: match.away_team,
      venue: match.venue,
      competition: match.competition_season,
      kickoff_at: match.timestamp,
      status: match.status_short,
      match_minute,
      is_live: run_type === "live_revision",
      elo_ratings: eloData ?? [],
    };

    // Resolve weight profile
    const { profile_key, weights } = resolveWeightProfile(matchContext, profiles, force_profile);

    // Create orchestra run record
    const { data: runRow, error: runInsertErr } = await supabase
      .from("brain_orchestra_runs")
      .insert({
        match_id,
        run_type,
        triggered_by,
        weight_profile_key: profile_key,
        effective_weights: weights,
        match_minute,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (runInsertErr || !runRow) {
      return new Response(JSON.stringify({ error: "Failed to create orchestra run", detail: runInsertErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const runId = runRow.id;

    // Run all active brains in parallel
    const isLive = run_type === "live_revision";
    const brainsToRun = (brainConfigs as BrainConfig[]).filter(
      (b) => !b.is_live_only || isLive
    );

    const brainPromises = brainsToRun.map((brain) =>
      runBrain({ match_id, match_context: matchContext, brain_key: brain.brain_key, system_prompt: brain.system_prompt, is_live: isLive, match_minute }, anthropicKey)
    );

    const results: BrainOutput[] = await Promise.all(brainPromises);

    // For inactive brains (live-only skipped), add skipped entries
    const allResults: BrainOutput[] = (brainConfigs as BrainConfig[]).map((brain) => {
      const found = results.find((r) => r.brain_key === brain.brain_key);
      if (found) return found;
      return { brain_key: brain.brain_key, status: "skipped" as const, latency_ms: 0, output: null, error: "skipped: not applicable for run type" };
    });

    // Fuse results
    const fused = fuseResults(allResults, weights);

    // Build explanation
    const explanation = buildExplanation(allResults, weights, fused);

    // Determine next snapshot version
    const { data: existingSnaps } = await supabase
      .from("ensemble_prediction_snapshots")
      .select("snapshot_version")
      .eq("match_id", match_id)
      .order("snapshot_version", { ascending: false })
      .limit(1);

    const nextVersion = existingSnaps?.length ? (existingSnaps[0].snapshot_version + 1) : 1;

    const { data: prevSnap } = await supabase
      .from("ensemble_prediction_snapshots")
      .select("id")
      .eq("match_id", match_id)
      .eq("snapshot_version", nextVersion - 1)
      .maybeSingle();

    // Insert snapshot
    const snapshotType = run_type === "prematch" ? "prematch" : "live";
    const brainOutputsMap: Record<string, unknown> = {};
    for (const r of allResults) {
      brainOutputsMap[r.brain_key] = {
        status: r.status,
        latency_ms: r.latency_ms,
        output: r.output,
        error: r.error,
      };
    }

    const { data: snapshot, error: snapErr } = await supabase
      .from("ensemble_prediction_snapshots")
      .insert({
        match_id,
        snapshot_version: nextVersion,
        snapshot_type: snapshotType,
        match_minute,
        weight_profile_key: profile_key,
        brain_outputs: brainOutputsMap,
        effective_weights: weights,
        home_prob: fused.home,
        draw_prob: fused.draw,
        away_prob: fused.away,
        ensemble_confidence: fused.confidence,
        uncertainty_low: fused.uncertainty_low,
        uncertainty_high: fused.uncertainty_high,
        is_locked: false,
        previous_snapshot_id: prevSnap?.id ?? null,
        explanation_json: explanation,
      })
      .select("id")
      .single();

    if (snapErr || !snapshot) {
      await supabase
        .from("brain_orchestra_runs")
        .update({ status: "failed", error_message: snapErr?.message ?? "snapshot insert failed", completed_at: new Date().toISOString() })
        .eq("id", runId);

      return new Response(JSON.stringify({ error: "Failed to create snapshot", detail: snapErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const completedAt = new Date().toISOString();
    const totalLatency = allResults.reduce((s, r) => s + r.latency_ms, 0);
    const completed = allResults.filter((r) => r.status === "success").length;
    const failed = allResults.filter((r) => r.status === "failed").length;

    // Update orchestra run
    await supabase
      .from("brain_orchestra_runs")
      .update({
        brain_results: allResults,
        brains_completed: completed,
        brains_failed: failed,
        final_home_prob: fused.home,
        final_draw_prob: fused.draw,
        final_away_prob: fused.away,
        ensemble_confidence: fused.confidence,
        uncertainty_low: fused.uncertainty_low,
        uncertainty_high: fused.uncertainty_high,
        snapshot_id: snapshot.id,
        completed_at: completedAt,
        total_latency_ms: totalLatency,
        status: failed > 0 && completed === 0 ? "failed" : failed > 0 ? "partial" : "completed",
      })
      .eq("id", runId);

    const responsePayload = {
      run_id: runId,
      snapshot_id: snapshot.id,
      match_id,
      run_type,
      weight_profile: profile_key,
      effective_weights: weights,
      brains_completed: completed,
      brains_failed: failed,
      result: {
        home_prob: fused.home,
        draw_prob: fused.draw,
        away_prob: fused.away,
        predicted_outcome: fused.home >= fused.draw && fused.home >= fused.away ? "home_win"
          : fused.away >= fused.draw ? "away_win" : "draw",
        confidence: fused.confidence,
        uncertainty_low: fused.uncertainty_low,
        uncertainty_high: fused.uncertainty_high,
      },
      explanation,
      brain_results: allResults.map((r) => ({
        brain_key: r.brain_key,
        status: r.status,
        latency_ms: r.latency_ms,
        winner_prob: r.output?.winner_prob ?? null,
        confidence: r.output?.confidence ?? null,
        error: r.error,
      })),
    };

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
