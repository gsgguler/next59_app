import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Internal-Secret",
};

const SM_BASE = "https://api.sportmonks.com/v3";

// Match 1 constants
const MATCH_1_LOCAL_FIXTURE_ID = "eb0a1f0b-6a8a-454f-8706-6bbedcd77fe4";
const MATCH_1_AF_FIXTURE_ID = 1489369;
const MEX_AF_TEAM_ID = 16;
const RSA_AF_TEAM_ID = 1531;
const KICKOFF_DATE = "2026-06-11";
const MATCH_NUMBER = 1;
const CURRENT_SCENARIO_VERSION = 5;

// Mexico model priors (scenario v5)
const MODEL_HOME_PCT = 47.0;
const MODEL_DRAW_PCT = 27.0;
const MODEL_AWAY_PCT = 26.0;

const MEX_ALIASES = ["mexico", "meksika", "mex", "méxico"];
const RSA_ALIASES = ["south africa", "güney afrika", "south-africa", "rsa", "southafrica"];

type Action = "map_fixture" | "fetch_prematch_odds" | "run_match_odds_bundle";

interface RunLog {
  rows_inserted: number;
  rows_updated: number;
  notes: string[];
  errors: string[];
}

async function smFetch(path: string, apiKey: string): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${SM_BASE}${path}${sep}api_token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sportmonks ${path} → HTTP ${res.status}`);
  return res.json();
}

function normalizeTeamName(name: string): string {
  return (name ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function matchesAlias(name: string, aliases: string[]): boolean {
  const normalized = normalizeTeamName(name);
  return aliases.some((a) => normalizeTeamName(a) === normalized || normalized.includes(normalizeTeamName(a)));
}

function impliedProb(decimal: number): number {
  if (!decimal || decimal <= 0) return 0;
  return 1 / decimal;
}

function marginAdjust(home: number, draw: number, away: number): { home: number; draw: number; away: number } {
  const total = home + draw + away;
  if (total <= 0) return { home: 0, draw: 0, away: 0 };
  return {
    home: (home / total) * 100,
    draw: (draw / total) * 100,
    away: (away / total) * 100,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Internal-only auth check
  const internalSecret = req.headers.get("X-Internal-Secret");
  const adminSecret = Deno.env.get("ADMIN_JOB_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!internalSecret || internalSecret !== adminSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized — X-Internal-Secret required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const apiKey = Deno.env.get("SPORTMONKS_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "SPORTMONKS_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { action?: Action } = {};
  try { body = await req.json().catch(() => ({})); } catch { /* no-op */ }

  const action: Action = (body.action as Action) ?? "map_fixture";

  const runLog: RunLog = { rows_inserted: 0, rows_updated: 0, notes: [], errors: [] };
  const runStarted = new Date().toISOString();

  // Log this run
  const { data: runRow } = await supabase
    .from("wc2026_sportmonks_ingest_runs")
    .insert({
      match_number: MATCH_NUMBER,
      fixture_id: MATCH_1_LOCAL_FIXTURE_ID,
      action,
      status: "started",
      started_at: runStarted,
    })
    .select("id")
    .single();
  const runId = runRow?.id;

  async function completeRun(status: "ok" | "error") {
    if (!runId) return;
    await supabase.from("wc2026_sportmonks_ingest_runs").update({
      status,
      completed_at: new Date().toISOString(),
      rows_inserted: runLog.rows_inserted,
      rows_updated: runLog.rows_updated,
      error_text: runLog.errors.length ? runLog.errors.join("; ") : null,
      raw_response_summary: { notes: runLog.notes },
    }).eq("id", runId);
  }

  try {
    if (action === "map_fixture") {
      const result = await doMapFixture(supabase, apiKey, runLog);
      await completeRun("ok");
      return new Response(
        JSON.stringify({ action, status: "ok", run_id: runId, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "fetch_prematch_odds") {
      const result = await doFetchPrematchOdds(supabase, apiKey, runLog);
      await completeRun("ok");
      return new Response(
        JSON.stringify({ action, status: "ok", run_id: runId, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "run_match_odds_bundle") {
      const mapResult = await doMapFixture(supabase, apiKey, runLog);
      const oddsResult = await doFetchPrematchOdds(supabase, apiKey, runLog);
      await completeRun("ok");
      return new Response(
        JSON.stringify({ action, status: "ok", run_id: runId, map: mapResult, odds: oddsResult, log: runLog }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    runLog.errors.push((e as Error).message);
    await completeRun("error");
    return new Response(
      JSON.stringify({ action, status: "error", run_id: runId, error: (e as Error).message, log: runLog }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── map_fixture ────────────────────────────────────────────────────────────────
async function doMapFixture(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  log: RunLog
): Promise<Record<string, unknown>> {
  const raw = await smFetch(
    `/football/fixtures/date/${KICKOFF_DATE}?include=participants&per_page=50`,
    apiKey
  ) as { data?: unknown[]; errors?: unknown };

  if (raw.errors) throw new Error(`Sportmonks error: ${JSON.stringify(raw.errors)}`);

  const fixtures = raw.data ?? [];
  log.notes.push(`Sportmonks returned ${fixtures.length} fixtures for ${KICKOFF_DATE}`);

  let smFixtureId: number | null = null;
  let smFixtureRaw: unknown = null;
  let smMexId: number | null = null;
  let smRsaId: number | null = null;
  let smMexName: string | null = null;
  let smRsaName: string | null = null;

  for (const fx of fixtures as Array<Record<string, unknown>>) {
    const participants = (fx.participants as Array<Record<string, unknown>>) ?? [];
    const names = participants.map((p) => String(p.name ?? ""));
    const hasMex = names.some((n) => matchesAlias(n, MEX_ALIASES));
    const hasRsa = names.some((n) => matchesAlias(n, RSA_ALIASES));

    if (hasMex && hasRsa) {
      smFixtureId = fx.id as number;
      smFixtureRaw = fx;

      for (const p of participants) {
        const pName = String(p.name ?? "");
        if (matchesAlias(pName, MEX_ALIASES)) {
          smMexId = p.id as number;
          smMexName = pName;
        }
        if (matchesAlias(pName, RSA_ALIASES)) {
          smRsaId = p.id as number;
          smRsaName = pName;
        }
      }
      break;
    }
  }

  if (!smFixtureId) throw new Error(`Could not find Mexico vs South Africa on ${KICKOFF_DATE} in Sportmonks`);

  const now = new Date().toISOString();

  // Upsert fixture mapping
  const { data: existingFx } = await supabase
    .from("wc2026_sportmonks_id_map")
    .select("id")
    .eq("entity_type", "fixture")
    .eq("sportmonks_id", smFixtureId)
    .maybeSingle();

  if (existingFx) {
    await supabase.from("wc2026_sportmonks_id_map").update({
      local_fixture_id: MATCH_1_LOCAL_FIXTURE_ID,
      api_football_fixture_id: MATCH_1_AF_FIXTURE_ID,
      sportmonks_name: `Mexico vs South Africa`,
      confidence: 1.0,
      raw_json: smFixtureRaw,
      updated_at: now,
    }).eq("id", existingFx.id);
    log.rows_updated++;
  } else {
    await supabase.from("wc2026_sportmonks_id_map").insert({
      entity_type: "fixture",
      local_fixture_id: MATCH_1_LOCAL_FIXTURE_ID,
      api_football_fixture_id: MATCH_1_AF_FIXTURE_ID,
      sportmonks_id: smFixtureId,
      sportmonks_name: `Mexico vs South Africa`,
      confidence: 1.0,
      source: "auto",
      raw_json: smFixtureRaw,
      updated_at: now,
    });
    log.rows_inserted++;
  }

  // Upsert team mappings
  const teamMaps: Array<{ afId: number; smId: number; smName: string | null }> = [];
  if (smMexId) teamMaps.push({ afId: MEX_AF_TEAM_ID, smId: smMexId, smName: smMexName });
  if (smRsaId) teamMaps.push({ afId: RSA_AF_TEAM_ID, smId: smRsaId, smName: smRsaName });

  for (const tm of teamMaps) {
    const { data: existingTm } = await supabase
      .from("wc2026_sportmonks_id_map")
      .select("id")
      .eq("entity_type", "team")
      .eq("sportmonks_id", tm.smId)
      .maybeSingle();

    if (existingTm) {
      await supabase.from("wc2026_sportmonks_id_map").update({
        api_football_team_id: tm.afId,
        sportmonks_name: tm.smName,
        confidence: 1.0,
        updated_at: now,
      }).eq("id", existingTm.id);
      log.rows_updated++;
    } else {
      await supabase.from("wc2026_sportmonks_id_map").insert({
        entity_type: "team",
        api_football_team_id: tm.afId,
        sportmonks_id: tm.smId,
        sportmonks_name: tm.smName,
        confidence: 1.0,
        source: "auto",
        updated_at: now,
      });
      log.rows_inserted++;
    }
  }

  log.notes.push(`Mapped fixture SM_ID=${smFixtureId}, MEX SM_ID=${smMexId}, RSA SM_ID=${smRsaId}`);

  return {
    sportmonks_fixture_id: smFixtureId,
    sportmonks_mexico_id: smMexId,
    sportmonks_rsa_id: smRsaId,
    mexico_name_in_api: smMexName,
    rsa_name_in_api: smRsaName,
  };
}

// ── fetch_prematch_odds ────────────────────────────────────────────────────────
async function doFetchPrematchOdds(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  log: RunLog
): Promise<Record<string, unknown>> {
  // Look up the SM fixture ID we mapped
  const { data: fxMap } = await supabase
    .from("wc2026_sportmonks_id_map")
    .select("sportmonks_id")
    .eq("entity_type", "fixture")
    .eq("local_fixture_id", MATCH_1_LOCAL_FIXTURE_ID)
    .maybeSingle();

  if (!fxMap?.sportmonks_id) {
    throw new Error("No Sportmonks fixture mapping found — run map_fixture first");
  }

  const smFixtureId = fxMap.sportmonks_id;

  const raw = await smFetch(
    `/football/odds/pre-match/fixtures/${smFixtureId}?include=bookmaker;market`,
    apiKey
  ) as { data?: unknown[]; errors?: unknown };

  if (raw.errors) throw new Error(`Sportmonks odds error: ${JSON.stringify(raw.errors)}`);

  const oddsData = raw.data ?? [];
  log.notes.push(`Sportmonks returned ${oddsData.length} odds entries for fixture ${smFixtureId}`);

  if (!oddsData.length) {
    log.notes.push("No prematch odds available yet from Sportmonks");
    return { odds_rows: 0, bookmakers: 0, consensus: null };
  }

  // Ensure Sportmonks provider exists in odds_providers
  const { data: existingProvider } = await supabase
    .from("odds_providers")
    .select("id")
    .eq("code", "sportmonks")
    .maybeSingle();

  let providerId: string;
  if (existingProvider) {
    providerId = existingProvider.id;
  } else {
    const { data: newProvider } = await supabase
      .from("odds_providers")
      .insert({ name: "Sportmonks", code: "sportmonks" })
      .select("id")
      .single();
    providerId = newProvider!.id;
    log.rows_inserted++;
    log.notes.push("Created Sportmonks entry in odds_providers");
  }

  const now = new Date().toISOString();

  // Group by bookmaker and find 1X2 markets
  interface BookmakerOdds {
    bookmaker_id: number;
    bookmaker_name: string;
    home: number | null;
    draw: number | null;
    away: number | null;
  }

  const bookmakerMap = new Map<number, BookmakerOdds>();

  for (const entry of oddsData as Array<Record<string, unknown>>) {
    const marketInfo = entry.market as Record<string, unknown> ?? {};
    const marketName = String(marketInfo.name ?? entry.market_description ?? "").toLowerCase();

    // Only 1X2 / match winner / full time result
    if (!marketName.includes("1x2") && !marketName.includes("match winner") && !marketName.includes("full time result")) {
      continue;
    }

    const bookmakerInfo = entry.bookmaker as Record<string, unknown> ?? {};
    const bookmakerId = entry.bookmaker_id as number ?? (bookmakerInfo.id as number);
    const bookmakerName = String(bookmakerInfo.name ?? entry.bookmaker_name ?? bookmakerId ?? "unknown");

    const label = String(entry.label ?? entry.name ?? "").toLowerCase();
    const oddValue = parseFloat(String(entry.value ?? entry.odd ?? 0));

    if (!bookmakerId || !oddValue) continue;

    if (!bookmakerMap.has(bookmakerId)) {
      bookmakerMap.set(bookmakerId, { bookmaker_id: bookmakerId, bookmaker_name: bookmakerName, home: null, draw: null, away: null });
    }

    const bm = bookmakerMap.get(bookmakerId)!;

    if (label === "home" || label === "1" || label === "home win") {
      bm.home = oddValue;
    } else if (label === "draw" || label === "x") {
      bm.draw = oddValue;
    } else if (label === "away" || label === "2" || label === "away win") {
      bm.away = oddValue;
    }
  }

  // Process complete bookmakers (all 3 legs present)
  const completeBookmakers = Array.from(bookmakerMap.values()).filter(
    (bm) => bm.home !== null && bm.draw !== null && bm.away !== null
  );

  log.notes.push(`Found ${bookmakerMap.size} bookmakers total, ${completeBookmakers.length} with complete 1X2`);

  if (!completeBookmakers.length) {
    log.notes.push("No complete 1X2 bookmakers found in odds response");
    return { odds_rows: 0, bookmakers: 0, consensus: null };
  }

  // Write to wc2026_market_odds_snapshots + match_odds
  let oddsRowsInserted = 0;

  for (const bm of completeBookmakers) {
    const homeImplied = impliedProb(bm.home!);
    const drawImplied = impliedProb(bm.draw!);
    const awayImplied = impliedProb(bm.away!);
    const totalMargin = homeImplied + drawImplied + awayImplied;
    const margin = ((totalMargin - 1) * 100);
    const adj = marginAdjust(homeImplied, drawImplied, awayImplied);

    // Snapshot row
    await supabase.from("wc2026_market_odds_snapshots").insert({
      fixture_id: MATCH_1_LOCAL_FIXTURE_ID,
      provider: "sportmonks",
      bookmaker: bm.bookmaker_name,
      market_type: "1X2",
      home_odds: bm.home,
      draw_odds: bm.draw,
      away_odds: bm.away,
      captured_at: now,
      raw_json: bm,
      sportmonks_fixture_id: smFixtureId,
      bookmaker_id: bm.bookmaker_id,
      bookmaker_name: bm.bookmaker_name,
      margin: parseFloat(margin.toFixed(4)),
      internal_only: true,
    });
    log.rows_inserted++;

    // match_odds rows (Home / Draw / Away)
    for (const [selection, decimal, impliedPct] of [
      ["Home", bm.home!, adj.home],
      ["Draw", bm.draw!, adj.draw],
      ["Away", bm.away!, adj.away],
    ] as Array<[string, number, number]>) {
      await supabase.from("match_odds").insert({
        match_id: MATCH_1_LOCAL_FIXTURE_ID,
        provider_id: providerId,
        provider_name: "Sportmonks",
        market: "1X2",
        selection,
        odds: decimal,
        odds_type: "decimal",
        is_main: true,
        is_market_summary: false,
        snapshot_time: now,
      });
      oddsRowsInserted++;
      void impliedPct;
    }
  }

  // Write consensus (margin-adjusted average across all complete bookmakers)
  const avgHome = completeBookmakers.reduce((s, bm) => {
    const a = marginAdjust(impliedProb(bm.home!), impliedProb(bm.draw!), impliedProb(bm.away!));
    return s + a.home;
  }, 0) / completeBookmakers.length;

  const avgDraw = completeBookmakers.reduce((s, bm) => {
    const a = marginAdjust(impliedProb(bm.home!), impliedProb(bm.draw!), impliedProb(bm.away!));
    return s + a.draw;
  }, 0) / completeBookmakers.length;

  const avgAway = completeBookmakers.reduce((s, bm) => {
    const a = marginAdjust(impliedProb(bm.home!), impliedProb(bm.draw!), impliedProb(bm.away!));
    return s + a.away;
  }, 0) / completeBookmakers.length;

  await supabase.from("wc2026_market_consensus").insert({
    fixture_id: MATCH_1_LOCAL_FIXTURE_ID,
    captured_at: now,
    home_implied_pct: parseFloat(avgHome.toFixed(2)),
    draw_implied_pct: parseFloat(avgDraw.toFixed(2)),
    away_implied_pct: parseFloat(avgAway.toFixed(2)),
    bookmaker_count: completeBookmakers.length,
    margin_adjusted: true,
    source_snapshot_json: { provider: "sportmonks", bookmakers: completeBookmakers.length },
  });
  log.rows_inserted++;
  log.notes.push(`Consensus: home=${avgHome.toFixed(1)}% draw=${avgDraw.toFixed(1)}% away=${avgAway.toFixed(1)}%`);

  // Write model-market divergence (upsert on fixture_id + scenario_version)
  const homeDelta = parseFloat((MODEL_HOME_PCT - avgHome).toFixed(2));
  const drawDelta = parseFloat((MODEL_DRAW_PCT - avgDraw).toFixed(2));
  const awayDelta = parseFloat((MODEL_AWAY_PCT - avgAway).toFixed(2));
  const totalDivergence = parseFloat(((Math.abs(homeDelta) + Math.abs(drawDelta) + Math.abs(awayDelta)) / 2).toFixed(2));
  const severity = totalDivergence > 15 ? "HIGH" : totalDivergence > 8 ? "MEDIUM" : "LOW";

  // Check if row exists for this fixture + version
  const { data: existingDiv } = await supabase
    .from("wc2026_model_market_divergence")
    .select("id")
    .eq("fixture_id", MATCH_1_LOCAL_FIXTURE_ID)
    .eq("scenario_version", CURRENT_SCENARIO_VERSION)
    .maybeSingle();

  if (existingDiv) {
    await supabase.from("wc2026_model_market_divergence").update({
      market_home_pct: parseFloat(avgHome.toFixed(2)),
      market_draw_pct: parseFloat(avgDraw.toFixed(2)),
      market_away_pct: parseFloat(avgAway.toFixed(2)),
      home_delta: homeDelta,
      draw_delta: drawDelta,
      away_delta: awayDelta,
      total_divergence: totalDivergence,
      severity,
      notes: `Sportmonks consensus from ${completeBookmakers.length} bookmakers at ${now}`,
    }).eq("id", existingDiv.id);
    log.rows_updated++;
  } else {
    await supabase.from("wc2026_model_market_divergence").insert({
      fixture_id: MATCH_1_LOCAL_FIXTURE_ID,
      scenario_version: CURRENT_SCENARIO_VERSION,
      model_home_pct: MODEL_HOME_PCT,
      model_draw_pct: MODEL_DRAW_PCT,
      model_away_pct: MODEL_AWAY_PCT,
      market_home_pct: parseFloat(avgHome.toFixed(2)),
      market_draw_pct: parseFloat(avgDraw.toFixed(2)),
      market_away_pct: parseFloat(avgAway.toFixed(2)),
      home_delta: homeDelta,
      draw_delta: drawDelta,
      away_delta: awayDelta,
      total_divergence: totalDivergence,
      severity,
      notes: `Sportmonks consensus from ${completeBookmakers.length} bookmakers at ${now}`,
    });
    log.rows_inserted++;
  }

  log.notes.push(`Divergence: home_delta=${homeDelta}pp draw_delta=${drawDelta}pp away_delta=${awayDelta}pp severity=${severity}`);

  return {
    sportmonks_fixture_id: smFixtureId,
    odds_entries_raw: oddsData.length,
    bookmakers_complete: completeBookmakers.length,
    match_odds_rows_inserted: oddsRowsInserted,
    consensus: {
      home_pct: parseFloat(avgHome.toFixed(2)),
      draw_pct: parseFloat(avgDraw.toFixed(2)),
      away_pct: parseFloat(avgAway.toFixed(2)),
    },
    divergence: { home_delta: homeDelta, draw_delta: drawDelta, away_delta: awayDelta, severity },
    log,
  };
}
