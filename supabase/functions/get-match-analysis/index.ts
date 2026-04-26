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
  statement: string;
}

interface MatchRow {
  id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  stage: string;
  round_name: string;
  matchweek: number;
  status: string;
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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch match
    const { data: match } = await supabase
      .from("matches")
      .select(
        "id, home_team_id, away_team_id, kickoff_at, stage, round_name, matchweek, status",
      )
      .eq("id", matchId)
      .maybeSingle();

    if (!match) {
      return new Response(
        JSON.stringify({ error: "Match not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch current prediction
    const { data: prediction } = await supabase
      .from("predictions")
      .select(
        "id, match_id, cassandra_code, category, probability, confidence_label, model_version, model_output_raw, access_level, is_current, statement",
      )
      .eq("match_id", matchId)
      .eq("is_current", true)
      .maybeSingle();

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    const matchData = {
      id: (match as MatchRow).id,
      home_team_id: (match as MatchRow).home_team_id,
      away_team_id: (match as MatchRow).away_team_id,
      kickoff_at: (match as MatchRow).kickoff_at,
      stage: (match as MatchRow).stage,
      round_name: (match as MatchRow).round_name,
      matchweek: (match as MatchRow).matchweek,
      status: (match as MatchRow).status,
    };

    // ANON PATH
    if (!user) {
      return new Response(
        JSON.stringify({
          match: matchData,
          prediction: prediction
            ? buildPredictionPreview(prediction as PredictionRow)
            : null,
          analysis: {
            available_text: null,
            full_analysis_locked: true,
            upgrade_cta: "Sign up for free to unlock match analysis",
          },
          quota: { views_used: 0, views_remaining: 2, tier: "anon" },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve tier
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select(
        "tier_id, subscription_tiers(code, tier_code, daily_match_views, analysis_depth, has_full_analysis, has_featured_match)",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    let tierCode = "free";
    let dailyLimit = 3;
    let hasFullAnalysis = false;
    let hasFeaturedMatch = true;

    if (sub?.subscription_tiers) {
      const t = sub.subscription_tiers as unknown as {
        code: string;
        tier_code: string;
        daily_match_views: number;
        analysis_depth: string;
        has_full_analysis: boolean;
        has_featured_match: boolean;
      };
      tierCode = t.tier_code;
      dailyLimit = t.daily_match_views;
      hasFullAnalysis = t.has_full_analysis;
      hasFeaturedMatch = t.has_featured_match;
    }

    const today = getIstanbulToday();
    const { data: usage } = await supabase
      .from("user_daily_usage")
      .select("matches_viewed, featured_match_id")
      .eq("user_id", user.id)
      .eq("usage_date", today)
      .maybeSingle();

    const viewsUsed = usage?.matches_viewed ?? 0;
    const isUnlimited = dailyLimit === -1;
    const viewsRemaining = isUnlimited
      ? -1
      : Math.max(0, dailyLimit - viewsUsed);
    const featuredMatchId = usage?.featured_match_id ?? null;

    const quota = {
      views_used: viewsUsed,
      views_remaining: viewsRemaining,
      tier: tierCode,
    };

    // PRO: full analysis
    if (hasFullAnalysis) {
      return new Response(
        JSON.stringify({
          match: matchData,
          prediction: prediction
            ? buildPredictionFull(prediction as PredictionRow)
            : null,
          analysis: {
            available_text: prediction?.model_output_raw ?? null,
            full_analysis_locked: false,
            upgrade_cta: null,
          },
          quota,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // FREE: featured match gets full
    if (hasFeaturedMatch && featuredMatchId === matchId) {
      return new Response(
        JSON.stringify({
          match: matchData,
          prediction: prediction
            ? buildPredictionFull(prediction as PredictionRow)
            : null,
          analysis: {
            available_text: prediction?.model_output_raw ?? null,
            full_analysis_locked: false,
            upgrade_cta: null,
          },
          quota,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // FREE: non-featured, preview only
    return new Response(
      JSON.stringify({
        match: matchData,
        prediction: prediction
          ? buildPredictionPreview(prediction as PredictionRow)
          : null,
        analysis: {
          available_text: prediction
            ? truncateStatement(prediction as PredictionRow)
            : null,
          full_analysis_locked: true,
          upgrade_cta: "Get Pro for full analysis",
        },
        quota,
      }),
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

function buildPredictionPreview(p: PredictionRow) {
  return {
    cassandra_code: p.cassandra_code,
    category: p.category,
    confidence_label: p.confidence_label,
    probability: p.probability,
  };
}

function buildPredictionFull(p: PredictionRow) {
  return {
    cassandra_code: p.cassandra_code,
    category: p.category,
    confidence_label: p.confidence_label,
    probability: p.probability,
    model_version: p.model_version,
    model_output_raw: p.model_output_raw,
    statement: p.statement,
  };
}

function truncateStatement(p: PredictionRow): string | null {
  if (!p.statement) return null;
  if (p.statement.length <= 200) return p.statement;
  return p.statement.substring(0, 200) + "...";
}
