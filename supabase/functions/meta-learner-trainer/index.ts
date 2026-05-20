import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Mode: "performance_update_only" | "full_retrain" | "check"
// Called by match-result-validator (performance_update_only) and nightly cron (check/full_retrain).
//
// performance_update_only: Recomputes rolling Brier scores per brain and upserts brain_performance_tracking.
// check: Checks if retraining is needed (Brier > 0.25 or 100+ new samples).
// full_retrain: Runs performance update + derives new learned_weights + inserts meta_learner_models row.

interface SnapRow {
  id: string;
  match_id: string;
  brier_score: number;
  was_correct: boolean;
  predicted_outcome: string;
  actual_outcome: string;
  brain_outputs: Record<string, {
    status: string;
    output: { winner_prob: { home: number; draw: number; away: number }; confidence: number } | null;
  }>;
  created_at: string;
}

function computeBrierForBrain(
  brainOutput: { winner_prob: { home: number; draw: number; away: number } },
  actual: string
): number {
  const ind = { home_win: actual === "home_win" ? 1 : 0, draw: actual === "draw" ? 1 : 0, away_win: actual === "away_win" ? 1 : 0 };
  return (
    Math.pow(brainOutput.winner_prob.home - ind.home_win, 2) +
    Math.pow(brainOutput.winner_prob.draw - ind.draw, 2) +
    Math.pow(brainOutput.winner_prob.away - ind.away_win, 2)
  );
}

function predictedOutcomeFor(wp: { home: number; draw: number; away: number }): string {
  if (wp.home >= wp.draw && wp.home >= wp.away) return "home_win";
  if (wp.away >= wp.draw) return "away_win";
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
    const mode: string = body.mode ?? "check";

    // Load evaluated snapshots (have actual_outcome set)
    const { data: snaps, error: snapErr } = await supabase
      .from("ensemble_prediction_snapshots")
      .select("id, match_id, brier_score, was_correct, predicted_outcome, actual_outcome, brain_outputs, created_at")
      .not("actual_outcome", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (snapErr) {
      return new Response(JSON.stringify({ error: "Failed to load evaluated snapshots", detail: snapErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = (snaps ?? []) as SnapRow[];
    const totalSamples = rows.length;

    if (totalSamples === 0) {
      return new Response(JSON.stringify({ mode, message: "No evaluated snapshots yet", samples: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Compute per-brain rolling metrics
    const brainKeys = ["tactical", "statistical", "psychological", "live", "conditions", "news"];
    const todayDate = now.toISOString().slice(0, 10);

    const performanceRows = brainKeys.map((bk) => {
      const compute = (subset: SnapRow[]) => {
        const valid = subset.filter((r) => {
          const bo = r.brain_outputs?.[bk];
          return bo?.status === "success" && bo.output?.winner_prob;
        });
        if (!valid.length) return { sample_count: 0, brier: null, accuracy: null };
        const brierScores = valid.map((r) => computeBrierForBrain(r.brain_outputs[bk].output!, r.actual_outcome));
        const brier = parseFloat((brierScores.reduce((s, v) => s + v, 0) / brierScores.length).toFixed(4));
        const correct = valid.filter((r) => predictedOutcomeFor(r.brain_outputs[bk].output!.winner_prob) === r.actual_outcome).length;
        const accuracy = parseFloat((correct / valid.length).toFixed(4));
        return { sample_count: valid.length, brier, accuracy };
      };

      const rows7d = rows.filter((r) => r.created_at >= cutoff7d);
      const rows30d = rows.filter((r) => r.created_at >= cutoff30d);
      const m7 = compute(rows7d);
      const m30 = compute(rows30d);
      const mAll = compute(rows);

      return {
        brain_key: bk,
        tracking_date: todayDate,
        sample_count_7d: m7.sample_count,
        brier_score_7d: m7.brier,
        accuracy_7d: m7.accuracy,
        sample_count_30d: m30.sample_count,
        brier_score_30d: m30.brier,
        accuracy_30d: m30.accuracy,
        sample_count_all: mAll.sample_count,
        brier_score_all: mAll.brier,
        accuracy_all: mAll.accuracy,
      };
    });

    // Upsert performance tracking
    if (mode !== "check") {
      for (const row of performanceRows) {
        await supabase
          .from("brain_performance_tracking")
          .upsert(row, { onConflict: "brain_key,tracking_date" });
      }
    }

    // Check retrain need
    const overallBrier = rows
      .slice(0, 100)
      .reduce((s, r) => s + (r.brier_score ?? 0), 0) / Math.min(rows.length, 100);
    const needsRetrain = overallBrier > 0.25 || totalSamples % 100 === 0;

    if (mode === "check") {
      return new Response(JSON.stringify({
        mode,
        samples: totalSamples,
        overall_brier_last100: parseFloat(overallBrier.toFixed(4)),
        needs_retrain: needsRetrain,
        performance_snapshot: performanceRows.map((r) => ({
          brain_key: r.brain_key,
          brier_7d: r.brier_score_7d,
          accuracy_7d: r.accuracy_7d,
        })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For full_retrain: derive new learned weights from inverse Brier scores
    let newModelVersion: string | null = null;
    if (mode === "full_retrain" && totalSamples >= 10) {
      const brierMap: Record<string, number> = {};
      for (const row of performanceRows) {
        brierMap[row.brain_key] = row.brier_score_all ?? 0.5;
      }

      // Inverse Brier: lower Brier → higher weight
      const inverseScores: Record<string, number> = {};
      for (const [k, b] of Object.entries(brierMap)) {
        inverseScores[k] = b > 0 ? 1 / b : 2.0;
      }
      const totalInverse = Object.values(inverseScores).reduce((s, v) => s + v, 0);
      const learnedWeights: Record<string, number> = {};
      for (const [k, v] of Object.entries(inverseScores)) {
        learnedWeights[k] = parseFloat((v / totalInverse).toFixed(4));
      }

      const featureImportance: Record<string, number> = {};
      for (const row of performanceRows) {
        featureImportance[row.brain_key] = parseFloat((1 - (row.brier_score_all ?? 0.5)).toFixed(4));
      }

      // Get current version number
      const { data: lastModel } = await supabase
        .from("meta_learner_models")
        .select("model_version")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastVersionNum = lastModel?.model_version
        ? parseInt(lastModel.model_version.replace("meta_v", ""), 10)
        : 1;
      newModelVersion = `meta_v${lastVersionNum + 1}`;

      const { error: insertErr } = await supabase
        .from("meta_learner_models")
        .insert({
          model_version: newModelVersion,
          model_type: "weighted_average",
          training_sample_count: totalSamples,
          training_from_date: rows[rows.length - 1]?.created_at?.slice(0, 10) ?? null,
          training_to_date: todayDate,
          feature_importance: featureImportance,
          learned_weights: learnedWeights,
          bayesian_priors: {
            alpha: 1.0,
            beta: 1.0,
            prior_home_win: 0.45,
            prior_draw: 0.26,
            prior_away_win: 0.29,
          },
          model_artifact: { type: "inverse_brier_weighting", version: lastVersionNum + 1, weights: learnedWeights },
          validation_brier: parseFloat(overallBrier.toFixed(4)),
          is_active: needsRetrain,
          activated_at: needsRetrain ? new Date().toISOString() : null,
          retrain_trigger: overallBrier > 0.25 ? "brier_threshold" : "scheduled",
          notes: `Auto-trained from ${totalSamples} evaluated snapshots. Brier=${overallBrier.toFixed(4)}.`,
        });

      if (insertErr) {
        return new Response(JSON.stringify({ error: "Failed to insert new model", detail: insertErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      mode,
      samples: totalSamples,
      overall_brier_last100: parseFloat(overallBrier.toFixed(4)),
      needs_retrain: needsRetrain,
      performance_rows_updated: performanceRows.length,
      new_model_version: newModelVersion,
      performance_snapshot: performanceRows.map((r) => ({
        brain_key: r.brain_key,
        brier_7d: r.brier_score_7d,
        accuracy_7d: r.accuracy_7d,
        brier_all: r.brier_score_all,
        accuracy_all: r.accuracy_all,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
