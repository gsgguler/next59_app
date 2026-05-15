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
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({
          tier: "free",
          unlimited: false,
          views_used_today: 0,
          views_remaining: 3,
          analysis_depth: "basic",
          can_view_predictions: false,
          can_view_elo: false,
          is_authenticated: false,
          quota_enforced: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Look up active subscription
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("id, status, tier_id, current_period_end, subscription_tiers(slug, name, features_json)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .maybeSingle();

    const today = getIstanbulToday();

    // Look up today's usage
    const { data: usage } = await supabase
      .from("user_daily_usage")
      .select("matches_viewed")
      .eq("user_id", user.id)
      .eq("usage_date", today)
      .maybeSingle();

    const viewsUsedToday = usage?.matches_viewed ?? 0;

    // Soft-launch mode: all tiers get unlimited access regardless of subscription
    // When quota enforcement is re-enabled, remove the SOFT_LAUNCH_UNLIMITED override.
    const SOFT_LAUNCH_UNLIMITED = true;

    if (SOFT_LAUNCH_UNLIMITED) {
      const tierSlug = (sub?.subscription_tiers as { slug?: string } | null)?.slug ?? "free";
      return new Response(
        JSON.stringify({
          tier: tierSlug,
          unlimited: true,
          views_used_today: viewsUsedToday,
          views_remaining: -1,
          analysis_depth: "full",
          can_view_predictions: true,
          can_view_elo: true,
          is_authenticated: true,
          quota_enforced: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Real tier logic (active when soft-launch mode is disabled)
    if (!sub) {
      return new Response(
        JSON.stringify({
          tier: "free",
          unlimited: false,
          views_used_today: viewsUsedToday,
          views_remaining: Math.max(0, 5 - viewsUsedToday),
          analysis_depth: "basic",
          can_view_predictions: false,
          can_view_elo: false,
          is_authenticated: true,
          quota_enforced: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tierSlug = (sub.subscription_tiers as { slug?: string } | null)?.slug ?? "free";
    const features = (sub.subscription_tiers as { features_json?: Record<string, unknown> } | null)?.features_json ?? {};
    const dailyLimit = (features.daily_match_views as number) ?? -1;
    const unlimited = dailyLimit === -1;
    const viewsRemaining = unlimited ? -1 : Math.max(0, dailyLimit - viewsUsedToday);
    const canViewPredictions = tierSlug !== "free";
    const analysisDepth = tierSlug === "elite" || tierSlug === "pro" ? "full" : "basic";

    return new Response(
      JSON.stringify({
        tier: tierSlug,
        unlimited,
        views_used_today: viewsUsedToday,
        views_remaining: viewsRemaining,
        analysis_depth: analysisDepth,
        can_view_predictions: canViewPredictions,
        can_view_elo: canViewPredictions,
        is_authenticated: true,
        quota_enforced: !unlimited,
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
