import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const API_BASE = "https://v3.football.api-sports.io";

async function callApi(endpoint: string): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY not configured");
  }

  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  const rateLimitHeaders: Record<string, string> = {};
  for (const [key, value] of res.headers.entries()) {
    if (key.startsWith("x-ratelimit") || key.startsWith("x-request")) {
      rateLimitHeaders[key] = value;
    }
  }

  const body = await res.json();
  return { status: res.status, headers: rateLimitHeaders, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const step = url.searchParams.get("step") || "status";

    let result: unknown;

    if (step === "status") {
      result = await callApi("/status");
    } else if (step === "wc-leagues") {
      result = await callApi("/leagues?search=World Cup");
    } else if (step === "wc-teams") {
      const leagueId = url.searchParams.get("league") || "1";
      result = await callApi(`/teams?league=${leagueId}&season=2026`);
    } else if (step === "wc-fixtures") {
      const leagueId = url.searchParams.get("league") || "1";
      result = await callApi(`/fixtures?league=${leagueId}&season=2026`);
    } else if (step === "epl-leagues") {
      result = await callApi("/leagues?search=Premier League&code=GB&season=2024");
    } else if (step === "epl-teams") {
      result = await callApi("/teams?league=39&season=2024");
    } else if (step === "epl-fixtures") {
      result = await callApi("/fixtures?league=39&season=2024&from=2024-08-16&to=2024-08-20");
    } else if (step === "epl-fixture-sample") {
      result = await callApi("/fixtures?league=39&season=2024&from=2024-08-17&to=2024-08-17");
    } else {
      result = { error: "Unknown step" };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
