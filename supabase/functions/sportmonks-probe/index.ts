import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const API_BASE = "https://api.sportmonks.com/v3";

async function callApi(
  endpoint: string,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: unknown;
}> {
  const apiKey = Deno.env.get("SPORTMONKS_API_KEY");
  if (!apiKey) {
    throw new Error("SPORTMONKS_API_KEY not configured");
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${API_BASE}${endpoint}${separator}api_token=${apiKey}`;
  const res = await fetch(url);

  const rateLimitHeaders: Record<string, string> = {};
  for (const [key, value] of res.headers.entries()) {
    if (
      key.startsWith("x-ratelimit") ||
      key.startsWith("x-request") ||
      key.includes("rate") ||
      key.includes("limit") ||
      key.includes("remaining")
    ) {
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
    const step = url.searchParams.get("step") || "my";

    let result: unknown;

    if (step === "my") {
      result = await callApi("/my");
    } else if (step === "leagues-search-wc") {
      result = await callApi("/football/leagues/search/World Cup");
    } else if (step === "leagues-all") {
      result = await callApi("/football/leagues?per_page=50");
    } else if (step === "league-by-id") {
      const id = url.searchParams.get("id") || "1";
      result = await callApi(
        `/football/leagues/${id}?include=seasons`,
      );
    } else if (step === "seasons") {
      result = await callApi("/football/seasons?per_page=50&order=desc");
    } else if (step === "seasons-search") {
      const q = url.searchParams.get("q") || "2026";
      result = await callApi(
        `/football/seasons/search/${q}?per_page=50`,
      );
    } else if (step === "teams-by-season") {
      const seasonId = url.searchParams.get("season_id") || "";
      result = await callApi(
        `/football/teams/seasons/${seasonId}?per_page=50`,
      );
    } else if (step === "teams-by-country") {
      const countryId = url.searchParams.get("country_id") || "462";
      result = await callApi(
        `/football/teams/countries/${countryId}?per_page=50`,
      );
    } else if (step === "fixtures-by-date") {
      const date = url.searchParams.get("date") || "2024-08-17";
      result = await callApi(
        `/football/fixtures/date/${date}?per_page=50&include=scores;participants`,
      );
    } else if (step === "fixture-by-id") {
      const id = url.searchParams.get("id") || "1";
      result = await callApi(
        `/football/fixtures/${id}?include=scores;participants;venue;league;round;stage`,
      );
    } else if (step === "fixtures-by-range") {
      const start = url.searchParams.get("start") || "2024-08-16";
      const end = url.searchParams.get("end") || "2024-08-20";
      result = await callApi(
        `/football/fixtures/between/${start}/${end}?per_page=50&include=scores;participants`,
      );
    } else if (step === "leagues-by-country") {
      const countryId = url.searchParams.get("country_id") || "462";
      result = await callApi(
        `/football/leagues/countries/${countryId}?include=seasons`,
      );
    } else if (step === "types") {
      result = await callApi("/core/types");
    } else {
      result = { error: "Unknown step parameter" };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
