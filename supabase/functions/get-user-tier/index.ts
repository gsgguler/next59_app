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
  const now = new Date();
  const istanbul = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return istanbul;
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
          display_name: "Anonymous",
          daily_match_views: 2,
          has_full_analysis: false,
          has_featured_match: false,
          matches_viewed_today: 0,
          remaining_views: 2,
          featured_match_id: null,
          usage_date: getIstanbulToday(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("tier_id, subscription_tiers(code, display_name, daily_match_views, has_full_analysis, has_featured_match)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    let tierCode = "free";
    let tierDisplayName = "Free";
    let dailyMatchViews = 3;
    let hasFullAnalysis = false;
    let hasFeaturedMatch = true;

    if (sub?.subscription_tiers) {
      const t = sub.subscription_tiers as unknown as {
        code: string;
        display_name: string;
        daily_match_views: number;
        has_full_analysis: boolean;
        has_featured_match: boolean;
      };
      tierCode = t.code;
      tierDisplayName = t.display_name;
      dailyMatchViews = t.daily_match_views;
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

    const matchesViewedToday = usage?.matches_viewed ?? 0;
    const featuredMatchId = usage?.featured_match_id ?? null;

    const isUnlimited = dailyMatchViews === -1;
    const remainingViews = isUnlimited
      ? -1
      : Math.max(0, dailyMatchViews - matchesViewedToday);

    return new Response(
      JSON.stringify({
        tier: tierCode,
        display_name: tierDisplayName,
        daily_match_views: dailyMatchViews,
        has_full_analysis: hasFullAnalysis,
        has_featured_match: hasFeaturedMatch,
        matches_viewed_today: matchesViewedToday,
        remaining_views: remainingViews,
        featured_match_id: featuredMatchId,
        usage_date: today,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
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
