import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  apiFootballGet,
  createSyncRun,
  finishSyncRun,
} from "../_shared/apiFootballClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const WC2026_LEAGUE_ID = 1;
const WC2026_SEASON    = 2026;

// Confidence thresholds
const CONF_AUTO_BIND    = 0.85;
const CONF_DATE_ROUND_CLOSE   = 0.95; // same date + same round + kickoff within 90 min
const CONF_DATE_ROUND_LOOSE   = 0.85; // same date + same round + kickoff within 3 h
const CONF_ROUND_DATE_UNCERTAIN = 0.75; // uncertain round + same date + kickoff within 90 min
const CONF_DATE_ONLY    = 0.50; // same date only

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiFixture {
  fixture: {
    id:     number;
    date:   string;
    status: { short: string };
  };
  league: { round: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
}

interface PlaceholderFixture {
  id:                      string;
  match_date:              string;
  round_label:             string | null;
  stage_code:              string | null;
  home_team_placeholder:   string | null;
  away_team_placeholder:   string | null;
  knockout_binding_status: string;
}

interface BindingCandidate {
  api_fixture_id: number;
  confidence:     number;
  reason:         string;
  home_team_id:   number;
  home_team_name: string;
  away_team_id:   number;
  away_team_name: string;
  api_date:       string;
  api_round:      string;
}

// ─── Round label normalizer ───────────────────────────────────────────────────

const ROUND_ALIASES: Record<string, string[]> = {
  "Round of 32":    ["round of 32", "1/16-finals", "last 32"],
  "Round of 16":    ["round of 16", "1/8-finals", "last 16"],
  "Quarter-finals": ["quarter-finals", "quarterfinals", "qf"],
  "Semi-finals":    ["semi-finals", "semifinals", "sf"],
  "Third place":    ["third place", "3rd place", "play-off for third place"],
  "Final":          ["final", "grand final"],
};

function normalizeRound(raw: string): string {
  const lower = raw.toLowerCase();
  for (const [canonical, aliases] of Object.entries(ROUND_ALIASES)) {
    if (aliases.some(a => lower.includes(a))) return canonical;
  }
  return raw;
}

function roundsMatch(dbRound: string | null, apiRound: string): boolean {
  if (!dbRound) return false;
  return normalizeRound(dbRound) === normalizeRound(apiRound);
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

function scoreCandidate(
  placeholder: PlaceholderFixture,
  apiFixture: ApiFixture,
): number {
  const dbDate  = new Date(placeholder.match_date).getTime();
  const apiDate = new Date(apiFixture.fixture.date).getTime();

  const sameDateDay =
    new Date(placeholder.match_date).toISOString().slice(0, 10) ===
    new Date(apiFixture.fixture.date).toISOString().slice(0, 10);

  if (!sameDateDay) return 0;

  const diffMs      = Math.abs(dbDate - apiDate);
  const diffMinutes = diffMs / 60000;
  const sameRound   = roundsMatch(placeholder.round_label, apiFixture.league.round);

  if (sameRound && diffMinutes <= 90)  return CONF_DATE_ROUND_CLOSE;
  if (sameRound && diffMinutes <= 180) return CONF_DATE_ROUND_LOOSE;
  if (!sameRound && diffMinutes <= 90) return CONF_ROUND_DATE_UNCERTAIN;
  return CONF_DATE_ONLY;
}

// ─── Supabase client ──────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url    = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  const runId = await createSyncRun("wc2026-knockout-fixture-binder");

  let placeholdersChecked = 0;
  let apiFixturesSeen     = 0;
  let candidatesFound     = 0;
  let fixturesBound       = 0;
  let ambiguousCount      = 0;
  let notFoundCount       = 0;
  let apiCalls            = 0;

  const bindingPreview: Record<string, unknown>[] = [];

  try {
    const supabase = getSupabase();

    // Load placeholder fixtures that still need binding
    const lookbackDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: placeholders, error: phErr } = await supabase
      .from("wc2026_fixtures")
      .select("id, match_date, round_label, stage_code, home_team_placeholder, away_team_placeholder, knockout_binding_status")
      .is("api_football_fixture_id", null)
      .in("knockout_binding_status", ["pending", "not_found", "ambiguous", "failed"])
      .gte("match_date", lookbackDate)
      .order("match_date", { ascending: true }) as {
        data: PlaceholderFixture[] | null;
        error: unknown;
      };

    if (phErr) throw phErr;

    if (!placeholders || placeholders.length === 0) {
      await finishSyncRun(runId, "skipped", {
        meta: { reason: "no_placeholder_fixtures_needing_binding", dryRun },
      });
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "no_placeholder_fixtures_needing_binding", dryRun }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    placeholdersChecked = placeholders.length;

    // Fetch all WC2026 fixtures for this season from API-Football
    const apiResult = await apiFootballGet<ApiFixture>(
      "fixtures",
      { league: String(WC2026_LEAGUE_ID), season: String(WC2026_SEASON) },
      { jobName: "wc2026-knockout-fixture-binder", isWc2026Scope: true },
    );
    apiCalls++;
    apiFixturesSeen = apiResult.data.length;

    // Only consider API fixtures that have no DB match yet (exclude already-bound API IDs)
    const { data: boundRows } = await supabase
      .from("wc2026_fixtures")
      .select("api_football_fixture_id")
      .not("api_football_fixture_id", "is", null);

    const alreadyBoundIds = new Set((boundRows ?? []).map(r => Number(r.api_football_fixture_id)));

    // Only unbound API fixtures are candidates
    const candidatePool = apiResult.data.filter(f => !alreadyBoundIds.has(f.fixture.id));

    const now = new Date().toISOString();

    for (const placeholder of placeholders) {
      const candidates: BindingCandidate[] = [];

      for (const apiF of candidatePool) {
        const confidence = scoreCandidate(placeholder, apiF);
        if (confidence === 0) continue;

        candidates.push({
          api_fixture_id: apiF.fixture.id,
          confidence,
          reason:         `date_match+round:${roundsMatch(placeholder.round_label, apiF.league.round)}+diff:${Math.round(Math.abs(new Date(placeholder.match_date).getTime() - new Date(apiF.fixture.date).getTime()) / 60000)}min`,
          home_team_id:   apiF.teams.home.id,
          home_team_name: apiF.teams.home.name,
          away_team_id:   apiF.teams.away.id,
          away_team_name: apiF.teams.away.name,
          api_date:       apiF.fixture.date,
          api_round:      apiF.league.round,
        });
      }

      candidatesFound += candidates.length;

      // Sort by confidence desc
      candidates.sort((a, b) => b.confidence - a.confidence);

      const topConf      = candidates[0]?.confidence ?? 0;
      const topCandidates = candidates.filter(c => c.confidence === topConf);
      const best          = candidates[0];

      let newStatus: string;
      let adminReview = false;

      if (candidates.length === 0) {
        newStatus   = "not_found";
        notFoundCount++;
      } else if (topConf >= CONF_AUTO_BIND && topCandidates.length === 1) {
        newStatus = "bound";
        fixturesBound++;
      } else if (topConf >= CONF_AUTO_BIND && topCandidates.length > 1) {
        newStatus   = "ambiguous";
        adminReview = true;
        ambiguousCount++;
      } else {
        // Low confidence — flag for admin
        newStatus   = "ambiguous";
        adminReview = true;
        ambiguousCount++;
      }

      bindingPreview.push({
        fixture_id:    placeholder.id,
        match_date:    placeholder.match_date,
        round_label:   placeholder.round_label,
        new_status:    newStatus,
        best_candidate: best ?? null,
        candidates_count: candidates.length,
        dryRun,
      });

      if (!dryRun) {
        const baseUpdate: Record<string, unknown> = {
          knockout_binding_status:      newStatus,
          knockout_binding_confidence:  best?.confidence ?? null,
          knockout_binding_reason:      best
            ? { reason: best.reason, round: best.api_round, date: best.api_date }
            : {},
          api_binding_candidates:       candidates.slice(0, 5),
          updated_at:                   now,
        };

        if (newStatus === "bound" && best) {
          baseUpdate.api_football_fixture_id = best.api_fixture_id;
          baseUpdate.home_api_team_id        = best.home_team_id;
          baseUpdate.away_api_team_id        = best.away_team_id;
          baseUpdate.home_team_name          = best.home_team_name;
          baseUpdate.away_team_name          = best.away_team_name;
          baseUpdate.knockout_bound_at       = now;
          baseUpdate.api_binding_source      = "wc2026-knockout-fixture-binder";
          baseUpdate.fixture_status          = "NS";

          // Remove this API ID from candidatePool so it's not reused
          const idx = candidatePool.findIndex(f => f.fixture.id === best.api_fixture_id);
          if (idx !== -1) candidatePool.splice(idx, 1);
          alreadyBoundIds.add(best.api_fixture_id);
        }

        if (adminReview) {
          baseUpdate.admin_review_required = true;
        }

        await supabase
          .from("wc2026_fixtures")
          .update(baseUpdate)
          .eq("id", placeholder.id);
      }

      console.log(`[knockout-binder] ${placeholder.id} (${placeholder.round_label}) → ${newStatus} (conf: ${best?.confidence ?? 0}, candidates: ${candidates.length})${dryRun ? " [dryRun]" : ""}`);
    }

    await finishSyncRun(runId, "completed", {
      fixturesProcessed: placeholdersChecked,
      apiCalls,
      meta: {
        placeholders_checked: placeholdersChecked,
        api_fixtures_seen:    apiFixturesSeen,
        candidates_found:     candidatesFound,
        fixtures_bound:       fixturesBound,
        ambiguous_count:      ambiguousCount,
        not_found_count:      notFoundCount,
        dryRun,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        placeholdersChecked,
        apiFixturesSeen,
        candidatesFound,
        fixturesBound,
        ambiguousCount,
        notFoundCount,
        apiCalls,
        dryRun,
        preview: dryRun ? bindingPreview : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc2026-knockout-fixture-binder] fatal:", msg);
    await finishSyncRun(runId, "error", {
      error: msg,
      fixturesProcessed: placeholdersChecked,
      apiCalls,
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
