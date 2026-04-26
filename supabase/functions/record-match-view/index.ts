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

    const { match_id } = (await req.json()) as { match_id: string };
    if (!match_id) {
      return new Response(
        JSON.stringify({ error: "match_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: matchExists } = await supabase
      .from("matches")
      .select("id")
      .eq("id", match_id)
      .maybeSingle();

    if (!matchExists) {
      return new Response(
        JSON.stringify({ error: "Match not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    // ANON PATH
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Sign up required", code: "AUTH_REQUIRED" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve tier
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select(
        "tier_id, subscription_tiers(code, tier_code, daily_match_views, analysis_depth, has_featured_match)",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    let tierCode = "free";
    let dailyLimit = 3;
    let analysisDepth = "first_30min";
    let hasFeaturedMatch = true;

    if (sub?.subscription_tiers) {
      const t = sub.subscription_tiers as unknown as {
        code: string;
        tier_code: string;
        daily_match_views: number;
        analysis_depth: string;
        has_featured_match: boolean;
      };
      tierCode = t.tier_code;
      dailyLimit = t.daily_match_views;
      analysisDepth = t.analysis_depth;
      hasFeaturedMatch = t.has_featured_match;
    } else {
      // Auto-create free subscription
      const { data: freeTier } = await supabase
        .from("subscription_tiers")
        .select("id")
        .eq("code", "free")
        .maybeSingle();

      if (freeTier) {
        await supabase.from("user_subscriptions").insert({
          user_id: user.id,
          tier_id: freeTier.id,
          is_active: true,
        });
      }
    }

    const isUnlimited = dailyLimit === -1;
    const today = getIstanbulToday();

    const { data: usage } = await supabase
      .from("user_daily_usage")
      .select("id, matches_viewed, match_ids_viewed, featured_match_id")
      .eq("user_id", user.id)
      .eq("usage_date", today)
      .maybeSingle();

    const currentViews = usage?.matches_viewed ?? 0;
    const viewedIds: string[] = usage?.match_ids_viewed ?? [];
    const existingFeatured = usage?.featured_match_id ?? null;

    // Already viewed -- idempotent
    if (viewedIds.includes(match_id)) {
      const isFeatured = existingFeatured === match_id;
      const effectiveDepth =
        isFeatured || tierCode === "pro" ? "full" : analysisDepth;

      return new Response(
        JSON.stringify({
          allowed: true,
          views_used: currentViews,
          views_remaining: isUnlimited
            ? -1
            : Math.max(0, dailyLimit - currentViews),
          analysis_depth: effectiveDepth,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Quota check
    if (!isUnlimited && currentViews >= dailyLimit) {
      return new Response(
        JSON.stringify({
          error: "Daily limit reached",
          code: "DAILY_LIMIT_REACHED",
          allowed: false,
          views_used: currentViews,
          views_remaining: 0,
          analysis_depth: analysisDepth,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Record the view
    const newViews = currentViews + 1;
    const newViewedIds = [...viewedIds, match_id];

    let featuredMatchId = existingFeatured;
    if (hasFeaturedMatch && tierCode === "free" && !existingFeatured) {
      featuredMatchId = match_id;
    }

    const isFeatured = featuredMatchId === match_id;

    const resetAt = new Date(today + "T00:00:00+03:00");
    resetAt.setDate(resetAt.getDate() + 1);

    if (usage) {
      const { error: updateErr } = await supabase
        .from("user_daily_usage")
        .update({
          matches_viewed: newViews,
          match_ids_viewed: newViewedIds,
          featured_match_id: featuredMatchId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", usage.id);

      if (updateErr)
        throw new Error(`Failed to update usage: ${updateErr.message}`);
    } else {
      const { error: insertErr } = await supabase
        .from("user_daily_usage")
        .insert({
          user_id: user.id,
          usage_date: today,
          matches_viewed: newViews,
          match_ids_viewed: newViewedIds,
          featured_match_id: featuredMatchId,
          tier_at_time: tierCode,
          reset_at: resetAt.toISOString(),
        });

      if (insertErr)
        throw new Error(`Failed to insert usage: ${insertErr.message}`);
    }

    const effectiveDepth =
      isFeatured || tierCode === "pro" ? "full" : analysisDepth;

    return new Response(
      JSON.stringify({
        allowed: true,
        views_used: newViews,
        views_remaining: isUnlimited
          ? -1
          : Math.max(0, dailyLimit - newViews),
        analysis_depth: effectiveDepth,
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
