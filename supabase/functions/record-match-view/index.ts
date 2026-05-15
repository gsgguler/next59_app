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

    // Require authenticated user — reject anonymous access
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({})) as { match_id?: unknown };
    const match_id = typeof body.match_id === "string" ? body.match_id.trim() : "";
    if (!match_id) {
      return new Response(
        JSON.stringify({ error: "match_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate match_id is a UUID to prevent enumeration via arbitrary strings
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(match_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid match_id" }),
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
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Analytics-only logging (no quota enforcement)
    if (user) {
      const today = getIstanbulToday();

      const { data: usage } = await supabase
        .from("user_daily_usage")
        .select("id, match_ids_viewed")
        .eq("user_id", user.id)
        .eq("usage_date", today)
        .maybeSingle();

      const viewedIds: string[] = usage?.match_ids_viewed ?? [];

      if (!viewedIds.includes(match_id)) {
        const newViewedIds = [...viewedIds, match_id];

        if (usage) {
          await supabase
            .from("user_daily_usage")
            .update({
              match_ids_viewed: newViewedIds,
              updated_at: new Date().toISOString(),
            })
            .eq("id", usage.id);
        } else {
          await supabase.from("user_daily_usage").insert({
            user_id: user.id,
            usage_date: today,
            matches_viewed: 0,
            match_ids_viewed: newViewedIds,
            tier_at_time: "free",
            reset_at: new Date(
              today + "T00:00:00+03:00",
            ).toISOString(),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        allowed: true,
        views_used: 0,
        views_remaining: -1,
        analysis_depth: "full",
        quota_enforced: false,
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
