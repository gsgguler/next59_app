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

    const { match_id } = await req.json() as { match_id: string };
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

    const today = getIstanbulToday();

    // ── ANON PATH ──
    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Authentication required to view matches. Sign up for free to get 3 daily match views.",
          code: "AUTH_REQUIRED",
          limit: 2,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── AUTHENTICATED PATH ──
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("tier_id, subscription_tiers(code, daily_match_views, has_featured_match)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    let tierCode = "free";
    let dailyLimit = 3;
    let hasFeaturedMatch = true;

    if (sub?.subscription_tiers) {
      const t = sub.subscription_tiers as unknown as {
        code: string;
        daily_match_views: number;
        has_featured_match: boolean;
      };
      tierCode = t.code;
      dailyLimit = t.daily_match_views;
      hasFeaturedMatch = t.has_featured_match;
    }

    const isUnlimited = dailyLimit === -1;

    const { data: usage } = await supabase
      .from("user_daily_usage")
      .select("id, matches_viewed, match_ids_viewed, featured_match_id")
      .eq("user_id", user.id)
      .eq("usage_date", today)
      .maybeSingle();

    const currentViews = usage?.matches_viewed ?? 0;
    const viewedIds: string[] = usage?.match_ids_viewed ?? [];
    const existingFeatured = usage?.featured_match_id ?? null;

    // Already viewed this match today — no-op, return success
    if (viewedIds.includes(match_id)) {
      const isFeatured = existingFeatured === match_id;
      return new Response(
        JSON.stringify({
          status: "already_viewed",
          tier: tierCode,
          matches_viewed_today: currentViews,
          remaining_views: isUnlimited ? -1 : Math.max(0, dailyLimit - currentViews),
          is_featured_match: isFeatured,
          featured_match_id: existingFeatured,
          access_level: isFeatured || tierCode === "pro" ? "full" : "preview",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check quota (non-unlimited tiers)
    if (!isUnlimited && currentViews >= dailyLimit) {
      return new Response(
        JSON.stringify({
          error: "Daily match view limit reached. Upgrade to Pro for unlimited access.",
          code: "DAILY_LIMIT_REACHED",
          tier: tierCode,
          limit: dailyLimit,
          matches_viewed_today: currentViews,
          remaining_views: 0,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Record the view
    const newViews = currentViews + 1;
    const newViewedIds = [...viewedIds, match_id];

    // Featured match: first match of the day for free-tier users
    let featuredMatchId = existingFeatured;
    if (hasFeaturedMatch && tierCode === "free" && !existingFeatured) {
      featuredMatchId = match_id;
    }

    const isFeatured = featuredMatchId === match_id;

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

      if (updateErr) {
        throw new Error(`Failed to update usage: ${updateErr.message}`);
      }
    } else {
      const { error: insertErr } = await supabase
        .from("user_daily_usage")
        .insert({
          user_id: user.id,
          usage_date: today,
          matches_viewed: newViews,
          match_ids_viewed: newViewedIds,
          featured_match_id: featuredMatchId,
        });

      if (insertErr) {
        throw new Error(`Failed to insert usage: ${insertErr.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        status: "recorded",
        tier: tierCode,
        matches_viewed_today: newViews,
        remaining_views: isUnlimited ? -1 : Math.max(0, dailyLimit - newViews),
        is_featured_match: isFeatured,
        featured_match_id: featuredMatchId,
        access_level: isFeatured || tierCode === "pro" ? "full" : "preview",
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
