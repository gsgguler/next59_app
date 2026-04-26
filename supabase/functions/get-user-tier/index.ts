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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({
          tier: "anon",
          daily_limit: 2,
          views_used_today: 0,
          views_remaining: 2,
          analysis_depth: "none",
          can_view_predictions: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select(
        "tier_id, subscription_tiers(id, code, tier_code, daily_match_views, analysis_depth, can_view_predictions)",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    let tierCode = "free";
    let dailyLimit = 3;
    let analysisDepth = "first_30min";
    let canViewPredictions = true;
    let tierId: string | null = null;

    if (sub?.subscription_tiers) {
      const t = sub.subscription_tiers as unknown as {
        id: string;
        code: string;
        tier_code: string;
        daily_match_views: number;
        analysis_depth: string;
        can_view_predictions: boolean;
      };
      tierCode = t.tier_code;
      dailyLimit = t.daily_match_views;
      analysisDepth = t.analysis_depth;
      canViewPredictions = t.can_view_predictions;
    } else {
      // Auto-create free tier subscription
      const { data: freeTier } = await supabase
        .from("subscription_tiers")
        .select("id, tier_code, daily_match_views, analysis_depth, can_view_predictions")
        .eq("code", "free")
        .maybeSingle();

      if (freeTier) {
        tierId = freeTier.id;
        tierCode = freeTier.tier_code;
        dailyLimit = freeTier.daily_match_views;
        analysisDepth = freeTier.analysis_depth;
        canViewPredictions = freeTier.can_view_predictions;

        await supabase.from("user_subscriptions").insert({
          user_id: user.id,
          tier_id: freeTier.id,
          is_active: true,
        });
      }
    }

    const today = getIstanbulToday();

    const { data: usage } = await supabase
      .from("user_daily_usage")
      .select("matches_viewed")
      .eq("user_id", user.id)
      .eq("usage_date", today)
      .maybeSingle();

    const viewsUsedToday = usage?.matches_viewed ?? 0;
    const isUnlimited = dailyLimit === -1;
    const viewsRemaining = isUnlimited
      ? -1
      : Math.max(0, dailyLimit - viewsUsedToday);

    return new Response(
      JSON.stringify({
        tier: tierCode,
        daily_limit: dailyLimit,
        views_used_today: viewsUsedToday,
        views_remaining: viewsRemaining,
        analysis_depth: analysisDepth,
        can_view_predictions: canViewPredictions,
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
