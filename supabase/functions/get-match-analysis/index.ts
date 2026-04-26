import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function getIstanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface PredictionRow {
  id: string;
  match_id: string;
  cassandra_code: string;
  category: string;
  probability: number;
  confidence_label: string;
  model_version: string;
  model_output_raw: Record<string, unknown> | null;
  access_level: string;
  is_current: boolean;
}

function buildPreviewPayload(prediction: PredictionRow) {
  return {
    match_id: prediction.match_id,
    cassandra_code: prediction.cassandra_code,
    category: prediction.category,
    confidence_label: prediction.confidence_label,
    access_level: "preview",
    headline_probability: prediction.probability,
    model_version: prediction.model_version,
    detail: null,
    message: "Upgrade to Pro or view as your featured match for full analysis.",
  };
}

function buildFullPayload(prediction: PredictionRow) {
  return {
    match_id: prediction.match_id,
    cassandra_code: prediction.cassandra_code,
    category: prediction.category,
    confidence_label: prediction.confidence_label,
    access_level: "full",
    headline_probability: prediction.probability,
    model_version: prediction.model_version,
    detail: prediction.model_output_raw,
    message: null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();

    const url = new URL(req.url);
    const matchId = url.searchParams.get("match_id");

    if (!matchId) {
      return new Response(
        JSON.stringify({ error: "match_id query parameter is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: prediction } = await supabase
      .from("predictions")
      .select("id, match_id, cassandra_code, category, probability, confidence_label, model_version, model_output_raw, access_level, is_current")
      .eq("match_id", matchId)
      .eq("is_current", true)
      .maybeSingle();

    if (!prediction) {
      return new Response(
        JSON.stringify({ error: "No prediction found for this match" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    // ── ANON PATH: always preview ──
    if (!user) {
      return new Response(
        JSON.stringify({
          ...buildPreviewPayload(prediction as PredictionRow),
          message: "Sign up for free to unlock your daily featured match with full analysis.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── AUTHENTICATED PATH ──
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("tier_id, subscription_tiers(code, has_full_analysis, has_featured_match)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    let tierCode = "free";
    let hasFullAnalysis = false;
    let hasFeaturedMatch = true;

    if (sub?.subscription_tiers) {
      const t = sub.subscription_tiers as unknown as {
        code: string;
        has_full_analysis: boolean;
        has_featured_match: boolean;
      };
      tierCode = t.code;
      hasFullAnalysis = t.has_full_analysis;
      hasFeaturedMatch = t.has_featured_match;
    }

    // Pro users always get full analysis
    if (hasFullAnalysis) {
      return new Response(
        JSON.stringify(buildFullPayload(prediction as PredictionRow)),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Free users: check if this is their featured match
    if (hasFeaturedMatch) {
      const today = getIstanbulToday();

      const { data: usage } = await supabase
        .from("user_daily_usage")
        .select("featured_match_id")
        .eq("user_id", user.id)
        .eq("usage_date", today)
        .maybeSingle();

      if (usage?.featured_match_id === matchId) {
        return new Response(
          JSON.stringify({
            ...buildFullPayload(prediction as PredictionRow),
            access_level: "full_featured",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Free user, non-featured match: preview only
    return new Response(
      JSON.stringify(buildPreviewPayload(prediction as PredictionRow)),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
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
