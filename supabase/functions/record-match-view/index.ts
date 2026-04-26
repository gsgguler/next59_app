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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

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
