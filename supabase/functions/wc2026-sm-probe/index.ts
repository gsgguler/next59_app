import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SM_BASE = "https://api.sportmonks.com/v3";

async function smFetch(path: string, key: string): Promise<{ status: number; body: unknown }> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${SM_BASE}${path}${sep}api_token=${key}`;
  const res = await fetch(url);
  const body = await res.json();
  return { status: res.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const smKey = Deno.env.get("SPORTMONKS_API_KEY") ?? "";
  if (!smKey) {
    return new Response(JSON.stringify({ error: "SPORTMONKS_API_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Record<string, unknown> = { probe_started: new Date().toISOString(), key_length: smKey.length };

  // Probe 1: My subscription info
  try {
    const r = await smFetch("/core/my-subscriptions", smKey);
    results.probe_subscription = { http_status: r.status, data: r.body };
  } catch (e) { results.probe_subscription_error = String(e); }

  await new Promise(r => setTimeout(r, 600));

  // Probe 2: Leagues available (check if WC 2026 is covered)
  try {
    const r = await smFetch("/football/leagues?per_page=25", smKey);
    const data = r.body as { data?: Array<Record<string, unknown>>; errors?: unknown };
    results.probe_leagues = {
      http_status: r.status,
      errors: data.errors,
      count: data.data?.length,
      sample: data.data?.slice(0, 10).map(l => ({ id: l.id, name: l.name, short_code: l.short_code, type: l.type })),
    };
  } catch (e) { results.probe_leagues_error = String(e); }

  await new Promise(r => setTimeout(r, 600));

  // Probe 3: Search for FIFA World Cup 2026 league
  try {
    const r = await smFetch("/football/leagues/search/world+cup", smKey);
    const data = r.body as { data?: Array<Record<string, unknown>>; errors?: unknown };
    results.probe_wc_search = {
      http_status: r.status,
      errors: data.errors,
      count: data.data?.length,
      results: data.data?.map(l => ({ id: l.id, name: l.name, type: l.type, active: l.active })),
    };
  } catch (e) { results.probe_wc_search_error = String(e); }

  await new Promise(r => setTimeout(r, 600));

  // Probe 4: Fixtures by date 2026-06-11 (no per_page limit — check pagination)
  try {
    const r = await smFetch("/football/fixtures/date/2026-06-11?per_page=50&page=1", smKey);
    const data = r.body as { data?: unknown[]; errors?: unknown; meta?: unknown; pagination?: unknown };
    results.probe_fixtures_date_raw = {
      http_status: r.status,
      errors: data.errors,
      count: data.data?.length,
      meta: data.meta,
      pagination: data.pagination,
      sample: (data.data ?? []).slice(0, 5),
    };
  } catch (e) { results.probe_fixtures_date_error = String(e); }

  await new Promise(r => setTimeout(r, 600));

  // Probe 5: Try fixture search by team (Mexico team search)
  try {
    const r = await smFetch("/football/teams/search/mexico", smKey);
    const data = r.body as { data?: Array<Record<string, unknown>>; errors?: unknown };
    results.probe_mexico_team = {
      http_status: r.status,
      errors: data.errors,
      count: data.data?.length,
      results: data.data?.slice(0, 5).map(t => ({ id: t.id, name: t.name, short_code: t.short_code })),
    };
  } catch (e) { results.probe_mexico_team_error = String(e); }

  await new Promise(r => setTimeout(r, 600));

  // Probe 6: Try South Africa team search
  try {
    const r = await smFetch("/football/teams/search/south+africa", smKey);
    const data = r.body as { data?: Array<Record<string, unknown>>; errors?: unknown };
    results.probe_rsa_team = {
      http_status: r.status,
      errors: data.errors,
      count: data.data?.length,
      results: data.data?.slice(0, 5).map(t => ({ id: t.id, name: t.name, short_code: t.short_code })),
    };
  } catch (e) { results.probe_rsa_team_error = String(e); }

  await new Promise(r => setTimeout(r, 600));

  // Probe 7: Upcoming fixtures (today+)
  try {
    const r = await smFetch("/football/fixtures/upcoming?per_page=20", smKey);
    const data = r.body as { data?: Array<Record<string, unknown>>; errors?: unknown };
    results.probe_upcoming = {
      http_status: r.status,
      errors: data.errors,
      count: data.data?.length,
      sample: data.data?.slice(0, 5).map(f => ({
        id: f.id, name: f.name, starting_at: f.starting_at,
        state_id: f.state_id, league_id: f.league_id,
      })),
    };
  } catch (e) { results.probe_upcoming_error = String(e); }

  await new Promise(r => setTimeout(r, 600));

  // Probe 8: Try getting WC 2026 season (league 1)
  try {
    const r = await smFetch("/football/seasons?per_page=20&filters=leagueId:1", smKey);
    const data = r.body as { data?: Array<Record<string, unknown>>; errors?: unknown };
    results.probe_wc_seasons = {
      http_status: r.status,
      errors: data.errors,
      count: data.data?.length,
      results: data.data?.map(s => ({ id: s.id, name: s.name, league_id: s.league_id, starting_at: s.starting_at, ending_at: s.ending_at })),
    };
  } catch (e) { results.probe_wc_seasons_error = String(e); }

  await new Promise(r => setTimeout(r, 600));

  // Probe 9: Standings (WC 2026 season if exists)
  // Probe the schedule — try fixtures by between dates
  try {
    const r = await smFetch("/football/fixtures/between/2026-06-10/2026-06-12?per_page=50", smKey);
    const data = r.body as { data?: Array<Record<string, unknown>>; errors?: unknown };
    results.probe_fixtures_between = {
      http_status: r.status,
      errors: data.errors,
      count: data.data?.length,
      sample: data.data?.slice(0, 10).map(f => ({
        id: f.id, name: f.name, starting_at: f.starting_at,
        league_id: f.league_id, state_id: f.state_id,
      })),
    };
  } catch (e) { results.probe_fixtures_between_error = String(e); }

  results.probe_completed = new Date().toISOString();

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
