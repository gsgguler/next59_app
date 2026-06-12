import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apiFootballGet,
  createSyncRun,
  finishSyncRun,
  normalizeName,
  sleep,
} from "../_shared/apiFootballClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerStatResponse {
  player: {
    id: number;
    name: string;
    age: number | null;
    nationality: string | null;
    height: string | null;
    weight: string | null;
    photo: string | null;
  };
  statistics: Array<{
    team:   { id: number; name: string } | null;
    league: { id: number; name: string; season: number } | null;
    games: {
      appearences: number | null;
      lineups:     number | null;
      minutes:     number | null;
      rating:      string | null;
      position:    string | null;
      captain:     boolean | null;
    };
    goals:  { total: number | null; assists: number | null; conceded: number | null; saves: number | null };
    passes: { total: number | null; key: number | null; accuracy: number | null };
    tackles:{ total: number | null; blocks: number | null; interceptions: number | null };
    duels:  { total: number | null; won: number | null };
    dribbles: { attempts: number | null; success: number | null };
    fouls:    { drawn: number | null; committed: number | null };
    cards:    { yellow: number | null; red: number | null };
    penalty:  { scored: number | null; missed: number | null; saved: number | null };
  }>;
}

interface SquadPlayer {
  id:       number;
  name:     string;
  age:      number | null;
  number:   number | null;
  position: string | null;
  photo:    string | null;
}

interface EnrichmentProfile {
  id:             string;
  player_id:      number | null;
  player_name:    string;
  normalized_name: string | null;
  api_team_id:    number | null;
  lookup_status:  string;
}

// ─── Score computation ────────────────────────────────────────────────────────

function computePerformanceScore(
  stats: PlayerStatResponse["statistics"][0] | undefined,
  position: string | null,
): {
  rating: number | null;
  minutes_score: number;
  goals_score: number;
  assists_score: number;
  pass_score: number;
  defensive_score: number;
  discipline_score: number;
  goalkeeper_score: number;
  availability_score: number;
  final_performance_score: number;
  confidence: number;
  reason: Record<string, unknown>;
} {
  if (!stats) {
    return {
      rating: null, minutes_score: 0, goals_score: 0, assists_score: 0,
      pass_score: 0, defensive_score: 0, discipline_score: 0, goalkeeper_score: 0,
      availability_score: 0, final_performance_score: 0, confidence: 0,
      reason: { missing: "no_stats" },
    };
  }

  const g = stats.games;
  const rating = g.rating ? parseFloat(g.rating) : null;
  const pos = (position ?? g.position ?? "MF").toUpperCase();

  // Normalize each component to 0-100
  const ratingScore    = rating ? Math.min(100, ((rating - 5) / 4) * 100) : 50;
  const apps           = g.appearences ?? 0;
  const mins           = g.minutes ?? 0;
  const minutesScore   = apps > 0 ? Math.min(100, (mins / (apps * 90)) * 100) : 0;
  const goalsScore     = Math.min(100, ((stats.goals.total ?? 0) / Math.max(1, apps)) * 200);
  const assistsScore   = Math.min(100, ((stats.goals.assists ?? 0) / Math.max(1, apps)) * 150);
  const passAcc        = stats.passes.accuracy ?? 0;
  const passScore      = Math.min(100, passAcc);
  const tacklesPerApp  = apps > 0 ? (stats.tackles.total ?? 0) / apps : 0;
  const interPerApp    = apps > 0 ? (stats.tackles.interceptions ?? 0) / apps : 0;
  const defensiveScore = Math.min(100, (tacklesPerApp * 15 + interPerApp * 20));
  const yellPerApp     = apps > 0 ? (stats.cards.yellow ?? 0) / apps : 0;
  const redCards       = stats.cards.red ?? 0;
  const disciplineDeduction = Math.min(100, yellPerApp * 20 + redCards * 40);
  const disciplineScore = Math.max(0, 100 - disciplineDeduction);

  let gkScore = 0;
  if (pos === "G" || pos === "GK") {
    const savesPerApp  = apps > 0 ? (stats.goals.saves ?? 0) / apps : 0;
    const concPerApp   = apps > 0 ? (stats.goals.conceded ?? 0) / apps : 0;
    const penSaved     = stats.penalty.saved ?? 0;
    gkScore = Math.min(100, savesPerApp * 20 + Math.max(0, 50 - concPerApp * 10) + penSaved * 15);
  }

  const availScore = Math.min(100, (apps / 10) * 100);

  // Weighted final — position-aware
  let final: number;
  if (pos === "G" || pos === "GK") {
    final =
      ratingScore    * 0.30 +
      gkScore        * 0.30 +
      minutesScore   * 0.15 +
      disciplineScore * 0.10 +
      availScore     * 0.15;
  } else if (pos === "D" || pos === "DF") {
    final =
      ratingScore    * 0.35 +
      defensiveScore * 0.25 +
      minutesScore   * 0.15 +
      passScore      * 0.10 +
      disciplineScore * 0.10 +
      availScore     * 0.05;
  } else if (pos === "F" || pos === "FW") {
    final =
      ratingScore    * 0.35 +
      goalsScore     * 0.20 +
      assistsScore   * 0.15 +
      minutesScore   * 0.10 +
      passScore      * 0.05 +
      disciplineScore * 0.05 +
      availScore     * 0.10;
  } else {
    // MF default
    final =
      ratingScore    * 0.35 +
      passScore      * 0.15 +
      goalsScore     * 0.10 +
      assistsScore   * 0.10 +
      defensiveScore * 0.10 +
      minutesScore   * 0.10 +
      disciplineScore * 0.05 +
      availScore     * 0.05;
  }

  const confidence = rating ? (apps >= 5 ? 0.95 : 0.70) : 0.50;

  return {
    rating,
    minutes_score:     Math.round(minutesScore),
    goals_score:       Math.round(goalsScore),
    assists_score:     Math.round(assistsScore),
    pass_score:        Math.round(passScore),
    defensive_score:   Math.round(defensiveScore),
    discipline_score:  Math.round(disciplineScore),
    goalkeeper_score:  Math.round(gkScore),
    availability_score: Math.round(availScore),
    final_performance_score: Math.min(100, Math.round(final)),
    confidence,
    reason: { apps, mins, rating, pos },
  };
}

// ─── Lookup strategy ──────────────────────────────────────────────────────────

async function lookupPlayerStats(
  playerId: number | null,
  playerName: string,
  normalizedName: string,
  apiTeamId: number | null,
): Promise<{ stats: PlayerStatResponse | null; status: string; confidence: number }> {

  // Strategy 1: exact player_id lookup
  if (playerId) {
    for (const season of [2026, 2025]) {
      const result = await apiFootballGet<PlayerStatResponse>(
        "players",
        { id: playerId, season },
        { jobName: "wc2026-player-enrichment", isWc2026Scope: true },
      );
      if (result.data.length > 0) {
        return { stats: result.data[0], status: "found_by_id", confidence: 0.95 };
      }
    }
    return { stats: null, status: "api_player_stats_missing", confidence: 0.70 };
  }

  // Strategy 2: search by name + team
  if (apiTeamId) {
    for (const season of [2026, 2025]) {
      const result = await apiFootballGet<PlayerStatResponse>(
        "players",
        { search: playerName, team: apiTeamId, season },
        { jobName: "wc2026-player-enrichment", isWc2026Scope: true },
      );
      if (result.data.length === 1) {
        const candidate = result.data[0];
        const candNorm = normalizeName(candidate.player.name);
        if (candNorm === normalizedName) {
          return { stats: candidate, status: "found_by_search_exact", confidence: 0.85 };
        }
        return { stats: candidate, status: "found_by_search_approx", confidence: 0.60 };
      }
      if (result.data.length > 1) {
        // Multiple candidates — fuzzy match
        const exactMatch = result.data.find(r => normalizeName(r.player.name) === normalizedName);
        if (exactMatch) return { stats: exactMatch, status: "found_by_fuzzy_exact", confidence: 0.82 };
        // Ambiguous
        return { stats: null, status: "ambiguous", confidence: 0 };
      }
    }

    // Strategy 3: squad lookup + fuzzy
    const squadResult = await apiFootballGet<{ team: unknown; players: SquadPlayer[] }>(
      "players/squads",
      { team: apiTeamId },
      { jobName: "wc2026-player-enrichment", isWc2026Scope: true },
    );
    const allSquadPlayers = squadResult.data.flatMap(d => d.players ?? []);
    const exactSquad = allSquadPlayers.find(p => normalizeName(p.name) === normalizedName);
    if (exactSquad) {
      // Fetch stats by id
      const statsResult = await apiFootballGet<PlayerStatResponse>(
        "players",
        { id: exactSquad.id, season: 2025 },
        { jobName: "wc2026-player-enrichment", isWc2026Scope: true },
      );
      if (statsResult.data.length > 0) {
        return { stats: statsResult.data[0], status: "found_by_squad_fuzzy", confidence: 0.75 };
      }
      return { stats: null, status: "found_id_no_stats", confidence: 0.65 };
    }
  }

  return { stats: null, status: "player_not_found", confidence: 0 };
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

  const runId = await createSyncRun("wc2026-player-enrichment");
  let processed = 0, apiCalls = 0;

  try {
    const supabase = getSupabase();

    // Fetch pending enrichment profiles (batch 30 at a time to stay within API quota)
    const { data: profiles, error } = await supabase
      .from("wc_player_enrichment_profiles")
      .select("id, player_id, player_name, normalized_name, api_team_id, lookup_status")
      .eq("lookup_status", "pending")
      .order("created_at", { ascending: true })
      .limit(30) as { data: EnrichmentProfile[] | null; error: unknown };

    if (error) throw error;
    if (!profiles || profiles.length === 0) {
      await finishSyncRun(runId, "skipped", { meta: { reason: "no_pending_profiles" } });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const profile of profiles) {
      await sleep(300); // stay within rate limits
      const normalized = profile.normalized_name ?? normalizeName(profile.player_name);
      const { stats, status, confidence } = await lookupPlayerStats(
        profile.player_id,
        profile.player_name,
        normalized,
        profile.api_team_id,
      );
      apiCalls += stats ? 2 : 3;

      const now = new Date().toISOString();
      const scoreResult = computePerformanceScore(
        stats?.statistics?.[0],
        stats?.statistics?.[0]?.games.position ?? null,
      );

      // Update enrichment profile
      await supabase
        .from("wc_player_enrichment_profiles")
        .update({
          player_id:      stats?.player.id ?? profile.player_id,
          lookup_status:  confidence < 0.82 && status !== "api_player_stats_missing" && status !== "ambiguous"
            ? (status === "player_not_found" ? "missing" : status)
            : status,
          match_confidence: confidence,
          profile:        stats?.player ?? {},
          statistics:     stats?.statistics ?? [],
          derived_score:  scoreResult,
          last_checked_at: now,
          updated_at:     now,
        })
        .eq("id", profile.id);

      // Write performance score row
      if (stats) {
        await supabase
          .from("wc_player_performance_scores")
          .upsert({
            player_id:               stats.player.id,
            player_name:             stats.player.name,
            api_football_fixture_id: null,
            team_id:                 profile.api_team_id,
            season:                  stats.statistics?.[0]?.league?.season ?? 2025,
            source:                  "api_football",
            rating:                  scoreResult.rating,
            minutes_score:           scoreResult.minutes_score,
            goals_score:             scoreResult.goals_score,
            assists_score:           scoreResult.assists_score,
            pass_score:              scoreResult.pass_score,
            defensive_score:         scoreResult.defensive_score,
            discipline_score:        scoreResult.discipline_score,
            goalkeeper_score:        scoreResult.goalkeeper_score,
            availability_score:      scoreResult.availability_score,
            final_performance_score: scoreResult.final_performance_score,
            confidence:              scoreResult.confidence,
            reason:                  scoreResult.reason,
            updated_at:              now,
          }, {
            onConflict: "player_id,api_football_fixture_id,season",
          });
      }

      processed++;
      console.log(`[player-enrichment] ${profile.player_name}: ${status} (conf=${confidence.toFixed(2)})`);
    }

    await finishSyncRun(runId, "completed", { fixturesProcessed: processed, apiCalls });
    return new Response(JSON.stringify({ ok: true, processed, apiCalls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-player-enrichment] fatal:", msg);
    await finishSyncRun(runId, "error", { error: msg, fixturesProcessed: processed, apiCalls });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
