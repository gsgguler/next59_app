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

    // Gap-analysis probe steps
    } else if (step === "gap-leagues") {
      // Discover league IDs for all 7 primary leagues
      const searches = [
        { name: "Premier League",  query: "/leagues?country=England&season=2024&type=League" },
        { name: "La Liga",         query: "/leagues?country=Spain&season=2024&type=League" },
        { name: "Serie A",         query: "/leagues?country=Italy&season=2024&type=League" },
        { name: "Bundesliga",      query: "/leagues?country=Germany&season=2024&type=League" },
        { name: "Ligue 1",         query: "/leagues?country=France&season=2024&type=League" },
        { name: "Eredivisie",      query: "/leagues?country=Netherlands&season=2024&type=League" },
        { name: "Sueper Lig",      query: "/leagues?country=Turkey&season=2024&type=League" },
      ];
      const out: Record<string, unknown> = {};
      for (const s of searches) {
        const r = await callApi(s.query);
        const leagues = (r.body as { response?: Array<{ league: { id: number; name: string } }> }).response ?? [];
        out[s.name] = leagues.map(l => ({ id: l.league.id, name: l.league.name })).slice(0, 5);
      }
      result = out;

    } else if (step === "gap-fixture-stats") {
      // Fetch stats for one known PL fixture to see field richness
      // Liverpool vs Crystal Palace 2025-05-25 — need to find fixture ID first
      const fixtureId = url.searchParams.get("id") ?? "1208087";
      const [fixtureRes, statsRes, eventsRes, lineupsRes] = await Promise.all([
        callApi(`/fixtures?id=${fixtureId}`),
        callApi(`/fixtures/statistics?fixture=${fixtureId}`),
        callApi(`/fixtures/events?fixture=${fixtureId}`),
        callApi(`/fixtures/lineups?fixture=${fixtureId}`),
      ]);
      // Return only field keys + counts, not raw payloads
      const statsBody = statsRes.body as { response?: Array<{ statistics: Array<{ type: string; value: unknown }> }> };
      const statsFields = (statsBody.response ?? []).flatMap(t => t.statistics.map(s => s.type));
      const eventsBody = eventsRes.body as { response?: Array<{ type: string; detail: string }> };
      const eventTypes = [...new Set((eventsBody.response ?? []).map(e => `${e.type}/${e.detail}`))];
      const lineupsBody = lineupsRes.body as { response?: Array<{ formation: string; startXI: unknown[]; substitutes: unknown[] }> };
      const lineupsAvail = (lineupsBody.response ?? []).map(l => ({
        formation: l.formation,
        startXI_count: l.startXI?.length ?? 0,
        subs_count: l.substitutes?.length ?? 0,
      }));
      const fixtureBody = fixtureRes.body as { response?: Array<{ fixture: Record<string, unknown>; league: Record<string, unknown> }> };
      const fixtureFields = Object.keys((fixtureBody.response?.[0]?.fixture ?? {}));
      result = {
        fixture_id: fixtureId,
        fixture_top_fields: fixtureFields,
        stats_fields_available: [...new Set(statsFields)],
        event_types: eventTypes,
        event_count: (eventsBody.response ?? []).length,
        lineups: lineupsAvail,
        api_calls: 4,
      };

    } else if (step === "gap-find-fixture") {
      // Find API-Football fixture ID by league+season+date+teams
      const league  = url.searchParams.get("league")  ?? "39";
      const season  = url.searchParams.get("season")  ?? "2024";
      const date    = url.searchParams.get("date")    ?? "2025-05-25";
      const r = await callApi(`/fixtures?league=${league}&season=${season}&date=${date}`);
      const body = r.body as { response?: Array<{ fixture: { id: number; date: string }; teams: { home: { name: string }; away: { name: string } } }> };
      result = (body.response ?? []).map(f => ({
        id: f.fixture.id,
        date: f.fixture.date,
        home: f.teams.home.name,
        away: f.teams.away.name,
      }));

    } else if (step === "player-fixture") {
      const fixtureId = url.searchParams.get("id") ?? "1208024";
      const r = await callApi(`/fixtures/players?fixture=${fixtureId}`);
      const body = r.body as { response?: Array<{ team: { id: number; name: string }; players: Array<{ player: { id: number; name: string }; statistics: unknown[] }> }> };
      const teams = body.response ?? [];
      result = {
        fixture_id: fixtureId,
        teams_count: teams.length,
        players_per_team: teams.map(t => ({ team: t.team.name, player_count: t.players.length })),
        sample_player_stat_keys: teams[0]?.players[0]?.statistics[0] ? Object.keys(teams[0].players[0].statistics[0] as object) : [],
        sample_player_keys: teams[0]?.players[0] ? Object.keys(teams[0].players[0].player) : [],
      };

    } else if (step === "player-season") {
      const league = url.searchParams.get("league") ?? "39";
      const season = url.searchParams.get("season") ?? "2024";
      const page = url.searchParams.get("page") ?? "1";
      const r = await callApi(`/players?league=${league}&season=${season}&page=${page}`);
      const body = r.body as { paging?: { current: number; total: number }; response?: Array<{ player: { id: number; name: string; birth: { date: string }; nationality: string }; statistics: Array<Record<string, unknown>> }> };
      const players = body.response ?? [];
      result = {
        paging: body.paging,
        player_count: players.length,
        sample_player_profile_keys: players[0] ? Object.keys(players[0].player) : [],
        sample_stat_section_keys: players[0]?.statistics[0] ? Object.keys(players[0].statistics[0]) : [],
        sample_games_keys: players[0]?.statistics[0] ? Object.keys((players[0].statistics[0] as Record<string, unknown>).games as object ?? {}) : [],
      };

    } else if (step === "player-status") {
      result = await callApi("/status");

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
