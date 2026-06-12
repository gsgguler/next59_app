import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apiFootballGet,
  assertWc2026FixtureScope,
  createSyncRun,
  finishSyncRun,
  normalizeName,
} from "../_shared/apiFootballClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface FixtureApiResponse {
  fixture: {
    id:       number;
    referee:  string | null;
    date:     string;
    status:   { short: string };
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
}

interface UpcomingFixture {
  id:                      string;
  api_football_fixture_id: number;
  home_team_name:          string | null;
  away_team_name:          string | null;
  referee_name_raw?:       string | null;
}

// ─── Referee card score computation ──────────────────────────────────────────

interface CardStats {
  matches:             number;
  yellow_cards:        number;
  red_cards:           number;
  penalties:           number;
  fouls_total:         number;
}

function computeRefereeCardScore(stats: CardStats): {
  referee_card_score: number | null;
  confidence: number;
  status: string;
} {
  if (stats.matches === 0) {
    return { referee_card_score: null, confidence: 0, status: "insufficient_data" };
  }

  const yellPerMatch  = stats.yellow_cards / stats.matches;
  const redPerMatch   = stats.red_cards / stats.matches;
  const penPerMatch   = stats.penalties / stats.matches;
  const foulsPerMatch = stats.fouls_total > 0 ? stats.fouls_total / stats.matches : 0;

  const base = Math.min(100,
    yellPerMatch  * 12 +
    redPerMatch   * 35 +
    penPerMatch   * 20 +
    foulsPerMatch * 0.7,
  );

  const confidence =
    stats.matches >= 30 ? 0.95 :
    stats.matches >= 15 ? 0.80 :
    stats.matches >= 5  ? 0.55 :
    0.25;

  return {
    referee_card_score: Math.round(base),
    confidence,
    status: stats.matches >= 5 ? "computed" : "low_sample",
  };
}

// ─── Fetch referee name from fixture if not known ─────────────────────────────

async function getRefereeFromFixture(afId: number): Promise<string | null> {
  const result = await apiFootballGet<FixtureApiResponse>(
    "fixtures",
    { id: afId },
    { jobName: "wc2026-referee-enrichment", apiFootballFixtureId: afId, isWc2026Scope: true },
  );
  const referee = result.data[0]?.fixture.referee;
  if (!referee) return null;
  // Strip trailing country codes like " (Germany)"
  return referee.replace(/\s*\([^)]+\)\s*$/, "").trim() || null;
}

// ─── Derive card stats from DB history ───────────────────────────────────────

async function deriveStatsFromDb(
  supabase: ReturnType<typeof createClient>,
  normalizedName: string,
): Promise<CardStats> {
  // Count from wc_fixture_events (Card events)
  const { data: eventRows } = await supabase
    .from("wc_fixture_events")
    .select("api_football_fixture_id")
    .eq("type", "Card")
    .ilike("detail", "%yellow%")
    .filter("raw->>referee", "ilike", `%${normalizedName}%`);

  // Count from wc_fixture_statistics (direct card stat rows)
  const { data: statRows } = await supabase
    .from("wc_fixture_statistics")
    .select("value, type, api_football_fixture_id")
    .in("type", ["Yellow Cards", "Red Cards", "Fouls"]);

  // Also look for referee matches via wc_match_prediction_inputs
  const { data: refRows } = await supabase
    .from("wc_match_prediction_inputs")
    .select("api_football_fixture_id, referee_name")
    .not("referee_name", "is", null);

  const matchedFixtureIds = new Set<number>(
    (refRows ?? [])
      .filter(r => normalizeName(r.referee_name ?? "") === normalizedName)
      .map(r => r.api_football_fixture_id),
  );

  const matchCount = matchedFixtureIds.size;
  if (matchCount === 0) {
    return { matches: 0, yellow_cards: 0, red_cards: 0, penalties: 0, fouls_total: 0 };
  }

  let yellowCards = 0, redCards = 0, foulsTotal = 0;
  for (const row of statRows ?? []) {
    if (!matchedFixtureIds.has(row.api_football_fixture_id)) continue;
    const v = parseInt(row.value ?? "0", 10);
    if (row.type === "Yellow Cards") yellowCards += v;
    if (row.type === "Red Cards")    redCards    += v;
    if (row.type === "Fouls")        foulsTotal  += v;
  }

  // Events fallback for yellows
  const eventYellows = (eventRows ?? []).length;
  if (yellowCards === 0 && eventYellows > 0) yellowCards = eventYellows;

  return {
    matches:      matchCount,
    yellow_cards: yellowCards,
    red_cards:    redCards,
    penalties:    0,
    fouls_total:  foulsTotal,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const runId = await createSyncRun("wc2026-referee-enrichment");
  let processed = 0, apiCalls = 0;

  try {
    const supabase = getSupabase();

    // Get upcoming fixtures that need referee enrichment
    const { data: fixtures, error } = await supabase
      .from("wc2026_fixtures")
      .select("id, api_football_fixture_id, home_team_name, away_team_name")
      .not("api_football_fixture_id", "is", null)
      .not("fixture_status", "in", '("FT","AET","PEN")')
      .eq("is_closed", false)
      .order("match_date", { ascending: true })
      .limit(20) as { data: UpcomingFixture[] | null; error: unknown };

    if (error) throw error;
    if (!fixtures || fixtures.length === 0) {
      await finishSyncRun(runId, "skipped", { meta: { reason: "no fixtures to process" } });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const fixture of fixtures) {
      const afId = fixture.api_football_fixture_id;

      const scopeCheck = await assertWc2026FixtureScope(afId);
      if (!scopeCheck.isWc2026) continue;

      // Get referee name from existing prediction_inputs or fetch from API
      let refereeName: string | null = null;
      const { data: existingInput } = await supabase
        .from("wc_match_prediction_inputs")
        .select("referee_name")
        .eq("api_football_fixture_id", afId)
        .maybeSingle();

      refereeName = existingInput?.referee_name ?? null;

      if (!refereeName) {
        refereeName = await getRefereeFromFixture(afId);
        apiCalls++;
      }

      if (!refereeName) {
        console.log(`[referee-enrichment] fixture ${afId}: no referee found`);
        processed++;
        continue;
      }

      const normalizedName = normalizeName(refereeName);

      // Check if we already have a reasonably fresh profile
      const { data: existingProfile } = await supabase
        .from("wc_referee_profiles")
        .select("id, last_checked_at, referee_card_score")
        .ilike("name", refereeName)
        .maybeSingle();

      if (existingProfile?.last_checked_at) {
        const ageHours = (Date.now() - new Date(existingProfile.last_checked_at).getTime()) / 3_600_000;
        if (ageHours < 24) {
          console.log(`[referee-enrichment] ${refereeName}: fresh profile, skipping`);
          processed++;
          continue;
        }
      }

      // Derive stats from existing DB data
      const cardStats = await deriveStatsFromDb(supabase, normalizedName);
      const { referee_card_score, confidence, status: scoreStatus } = computeRefereeCardScore(cardStats);

      const now = new Date().toISOString();

      // Upsert wc_referee_profiles
      if (existingProfile) {
        await supabase
          .from("wc_referee_profiles")
          .update({
            matches:            cardStats.matches,
            yellow_cards:       cardStats.yellow_cards,
            direct_red_cards:   cardStats.red_cards,
            yellow_cards_per_match: cardStats.matches > 0 ? cardStats.yellow_cards / cardStats.matches : null,
            direct_red_cards_per_match: cardStats.matches > 0 ? cardStats.red_cards / cardStats.matches : null,
            fouls_total:        cardStats.fouls_total,
            penalties_per_match: cardStats.matches > 0 ? cardStats.penalties / cardStats.matches : null,
            referee_card_score,
            confidence,
            last_checked_at:    now,
          })
          .eq("id", existingProfile.id);
      } else {
        await supabase
          .from("wc_referee_profiles")
          .insert({
            name:               refereeName,
            matches:            cardStats.matches,
            yellow_cards:       cardStats.yellow_cards,
            direct_red_cards:   cardStats.red_cards,
            yellow_cards_per_match: cardStats.matches > 0 ? cardStats.yellow_cards / cardStats.matches : null,
            direct_red_cards_per_match: cardStats.matches > 0 ? cardStats.red_cards / cardStats.matches : null,
            fouls_total:        cardStats.fouls_total,
            penalties_per_match: cardStats.matches > 0 ? cardStats.penalties / cardStats.matches : null,
            referee_card_score,
            confidence,
            source:             "db_derived",
            last_checked_at:    now,
          });
      }

      processed++;
      console.log(`[referee-enrichment] ${refereeName}: score=${referee_card_score}, conf=${confidence}, status=${scoreStatus}`);
    }

    await finishSyncRun(runId, "completed", { fixturesProcessed: processed, apiCalls });
    return new Response(JSON.stringify({ ok: true, processed, apiCalls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-referee-enrichment] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed: processed, apiCalls });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
