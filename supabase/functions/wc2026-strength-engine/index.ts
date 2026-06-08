import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const API_BASE = "https://v3.football.api-sports.io";
// WC 2026 host nation API-Football team IDs
const WC_HOST_API_IDS = new Set([2384, 16, 5529]); // USA, Mexico, Canada

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function callApi(
  endpoint: string,
): Promise<{ status: number; body: unknown }> {
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  if (!apiKey) throw new Error("API_FOOTBALL_KEY not configured");
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15000);
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "x-apisports-key": apiKey },
    signal: ctrl.signal,
  });
  clearTimeout(timeout);
  const body = await res.json();
  return { status: res.status, body };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface FixtureResponse {
  fixture: { id: number; date: string; venue?: { country?: string }; status?: { short: string } };
  league: { country?: string };
  teams: { home: { id: number }; away: { id: number } };
  goals: { home: number | null; away: number | null };
}

interface WcFixture {
  id: string;
  api_football_fixture_id: number;
  home_team_name: string;
  away_team_name: string;
  home_api_team_id: number;
  away_api_team_id: number;
  stage_code: string;
  group_label: string | null;
  match_date: string;
}

interface TeamStats {
  elo: number;
  matchCount: number;
  form5: number;
  form10: number;
  attackScore: number;
  defenseScore: number;
  winRate: number;
  goalDiffAvg: number;
  totalMatches: number;
  lastMatchAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  goalsFor: number;
  goalsAgainst: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = getSupabase();
  const log: string[] = [];
  const errors: string[] = [];

  // ═══════════════════════════════════════
  // PHASE 0 — CREATE RUN TRACKING RECORDS
  // ═══════════════════════════════════════

  let ingestionRunId: string | null = null;
  let calibrationRunId: string | null = null;

  try {
    const { data: ingRun, error: ingErr } = await supabase
      .from("wc2026_ingestion_runs")
      .insert({
        provider_name: "api-football",
        ingestion_type: "national_team_history_strength",
        run_status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (ingErr || !ingRun) throw new Error(`Ingestion run create failed: ${ingErr?.message}`);
    ingestionRunId = ingRun.id;
    log.push(`Ingestion run: ${ingestionRunId}`);

    const { data: calRun, error: calErr } = await supabase
      .from("wc2026_calibration_runs")
      .insert({
        run_type: "strength_engine",
        triggered_by: "edge_function",
        run_status: "running",
        data_version: "wc2026_v1",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (calErr || !calRun) throw new Error(`Calibration run create failed: ${calErr?.message}`);
    calibrationRunId = calRun.id;
    log.push(`Calibration run: ${calibrationRunId}`);

    // ═══════════════════════════════════════
    // PHASE 1 — LOAD WC FIXTURES + TEAMS
    // ═══════════════════════════════════════

    const { data: wcFixtures, error: fixturesErr } = await supabase
      .from("wc2026_fixtures")
      .select("id, api_football_fixture_id, home_team_name, away_team_name, home_api_team_id, away_api_team_id, stage_code, group_label, match_date")
      .eq("fixture_status", "verified_official")
      .order("match_date");

    if (fixturesErr || !wcFixtures) throw new Error(`Failed to load WC fixtures: ${fixturesErr?.message}`);
    log.push(`Verified official fixtures: ${wcFixtures.length}`);

    // Collect unique API team IDs and build name map from fixtures
    const apiTeamIds = new Set<number>();
    const apiIdToName = new Map<number, string>();
    for (const f of wcFixtures as WcFixture[]) {
      if (f.home_api_team_id) {
        apiTeamIds.add(f.home_api_team_id);
        apiIdToName.set(f.home_api_team_id, f.home_team_name);
      }
      if (f.away_api_team_id) {
        apiTeamIds.add(f.away_api_team_id);
        apiIdToName.set(f.away_api_team_id, f.away_team_name);
      }
    }

    log.push(`Unique WC teams: ${apiTeamIds.size}`);

    // Look up internal team UUIDs for strength_ratings upsert (best-effort)
    const { data: teamRows } = await supabase
      .from("teams")
      .select("id, api_football_id, name")
      .in("api_football_id", [...apiTeamIds]);

    const apiIdToUuid = new Map<number, { id: string; name: string }>();
    for (const t of teamRows ?? []) {
      apiIdToUuid.set(t.api_football_id, { id: t.id, name: t.name });
    }
    log.push(`Teams with internal UUIDs: ${apiIdToUuid.size}`);

    // ═══════════════════════════════════════
    // PHASE 2 — FETCH LAST 30 FIXTURES PER TEAM
    // ═══════════════════════════════════════

    let apiCallsUsed = 0;
    let rowsRaw = 0;
    const failedTeams: number[] = [];

    // team_id (API int) → list of finished fixtures
    const teamFixtures = new Map<number, FixtureResponse[]>();

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (const apiTeamId of apiTeamIds) {
      if (apiCallsUsed > 0) await delay(1800); // stay under 10 req/min free-tier limit
      try {
        const res = await callApi(`/fixtures?team=${apiTeamId}&last=30`);
        apiCallsUsed++;

        const resJson = JSON.stringify(res.body);
        const resHash = await sha256(resJson);

        const { error: rawErr } = await supabase
          .from("wc2026_api_football_raw_responses")
          .insert({
            endpoint: "/fixtures",
            request_params: { team: apiTeamId, last: 30 },
            provider_entity_type: "fixture_list",
            provider_entity_id: `team_${apiTeamId}_last30`,
            response_hash: resHash,
            response_json: res.body,
            http_status: res.status,
            fetched_at: new Date().toISOString(),
            transform_status: "pending",
            ingestion_run_id: ingestionRunId,
          });

        if (rawErr && rawErr.code !== "23505") {
          errors.push(`Raw store team ${apiTeamId}: ${rawErr.message}`);
        } else {
          rowsRaw++;
        }

        const body = res.body as { response?: FixtureResponse[] };
        const finished = (body?.response ?? []).filter(
          (f) => f.fixture?.status?.short === "FT" && f.goals?.home !== null && f.goals?.away !== null,
        );
        teamFixtures.set(apiTeamId, finished);
      } catch (err) {
        failedTeams.push(apiTeamId);
        errors.push(`Fetch team ${apiTeamId}: ${(err as Error).message}`);
        teamFixtures.set(apiTeamId, []);
      }
    }

    log.push(`API calls: ${apiCallsUsed} | Raw rows: ${rowsRaw} | Failed: ${failedTeams.length}`);

    // Update ingestion run with raw fetch stats
    await supabase
      .from("wc2026_ingestion_runs")
      .update({ api_calls_used: apiCallsUsed, rows_raw: rowsRaw })
      .eq("id", ingestionRunId);

    // ═══════════════════════════════════════
    // PHASE 3 — ELO COMPUTATION (chronological)
    // ═══════════════════════════════════════

    // Deduplicate all matches across all teams, sort by date
    const allMatchesMap = new Map<number, FixtureResponse>();
    for (const [, fixtures] of teamFixtures) {
      for (const f of fixtures) {
        if (!allMatchesMap.has(f.fixture.id)) allMatchesMap.set(f.fixture.id, f);
      }
    }

    const sortedMatches = [...allMatchesMap.values()].sort(
      (a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime(),
    );
    log.push(`Unique historical fixtures for ELO: ${sortedMatches.length}`);

    const eloByApiId = new Map<number, number>();
    const matchCountByApiId = new Map<number, number>();
    for (const apiId of apiTeamIds) {
      eloByApiId.set(apiId, 1500);
      matchCountByApiId.set(apiId, 0);
    }

    const K = 30;
    for (const f of sortedMatches) {
      const hId = f.teams.home.id;
      const aId = f.teams.away.id;
      const hG = f.goals.home!;
      const aG = f.goals.away!;

      const hR = eloByApiId.get(hId) ?? 1500;
      const aR = eloByApiId.get(aId) ?? 1500;

      // Home advantage only if venue country matches league country (neutral venue otherwise)
      const venueC = f.fixture.venue?.country?.toLowerCase() ?? "";
      const leagueC = f.league?.country?.toLowerCase() ?? "";
      const homeAdv = venueC && leagueC && venueC === leagueC ? 60 : 0;

      const eH = 1 / (1 + Math.pow(10, (aR - (hR + homeAdv)) / 400));
      const sH = hG > aG ? 1 : hG === aG ? 0.5 : 0;
      const sA = 1 - sH;

      if (eloByApiId.has(hId)) {
        eloByApiId.set(hId, hR + K * (sH - eH));
        matchCountByApiId.set(hId, (matchCountByApiId.get(hId) ?? 0) + 1);
      }
      if (eloByApiId.has(aId)) {
        eloByApiId.set(aId, aR + K * (sA - (1 - eH)));
        matchCountByApiId.set(aId, (matchCountByApiId.get(aId) ?? 0) + 1);
      }
    }

    // ═══════════════════════════════════════
    // PHASE 4 — PER-TEAM STATS + STRENGTH INDEX
    // ═══════════════════════════════════════

    const teamStats = new Map<number, TeamStats>();

    for (const apiTeamId of apiTeamIds) {
      const fixtures = teamFixtures.get(apiTeamId) ?? [];
      const sorted = [...fixtures].sort(
        (a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime(),
      );

      const results: number[] = [];
      let totalGF = 0;
      let totalGA = 0;
      let wins = 0;

      for (const f of sorted) {
        const isHome = f.teams.home.id === apiTeamId;
        const gf = isHome ? f.goals.home! : f.goals.away!;
        const ga = isHome ? f.goals.away! : f.goals.home!;
        totalGF += gf;
        totalGA += ga;
        if (gf > ga) { results.push(3); wins++; }
        else if (gf === ga) results.push(1);
        else results.push(0);
      }

      const last5 = results.slice(0, 5);
      const last10 = results.slice(0, 10);
      const form5 = last5.length > 0 ? last5.reduce((a, b) => a + b, 0) / (last5.length * 3) : 0;
      const form10 = last10.length > 0 ? last10.reduce((a, b) => a + b, 0) / (last10.length * 3) : 0;
      const matchCount = matchCountByApiId.get(apiTeamId) ?? 0;
      const avgGF = sorted.length > 0 ? totalGF / sorted.length : 0;
      const avgGA = sorted.length > 0 ? totalGA / sorted.length : 0;
      const winRate = sorted.length > 0 ? wins / sorted.length : 0;
      const goalDiffAvg = sorted.length > 0 ? (totalGF - totalGA) / sorted.length : 0;
      const dates = sorted.map((f) => f.fixture.date);

      teamStats.set(apiTeamId, {
        elo: eloByApiId.get(apiTeamId) ?? 1500,
        matchCount,
        form5: parseFloat(form5.toFixed(3)),
        form10: parseFloat(form10.toFixed(3)),
        attackScore: parseFloat(avgGF.toFixed(3)),
        defenseScore: parseFloat(clamp(2.0 - avgGA, 0, 2.0).toFixed(3)),
        winRate: parseFloat(winRate.toFixed(3)),
        goalDiffAvg: parseFloat(goalDiffAvg.toFixed(3)),
        totalMatches: sorted.length,
        lastMatchAt: dates[0] ?? null,
        windowStart: dates[dates.length - 1] ?? null,
        windowEnd: dates[0] ?? null,
        goalsFor: totalGF,
        goalsAgainst: totalGA,
      });
    }

    // Compute strength index (same weighted formula)
    function strengthIndex(apiTeamId: number): number {
      const s = teamStats.get(apiTeamId);
      if (!s) return 750;
      const venueBonus = WC_HOST_API_IDS.has(apiTeamId) ? 0.1 : 0.0;
      return (
        s.elo * 0.40 +
        s.form5 * 1500 * 0.25 +
        s.attackScore * 750 * 0.15 +
        s.defenseScore * 750 * 0.15 +
        venueBonus * 1500 * 0.05
      );
    }

    // ═══════════════════════════════════════
    // PHASE 5 — UPSERT TEAM CALIBRATION PROFILES
    // ═══════════════════════════════════════

    let teamProfilesInserted = 0;

    for (const [apiTeamId, stats] of teamStats) {
      const teamName = apiIdToUuid.get(apiTeamId)?.name ?? apiIdToName.get(apiTeamId) ?? `Team ${apiTeamId}`;

      const si = strengthIndex(apiTeamId);
      const normalizedSI = parseFloat((si / 1500).toFixed(4));

      let confLabel: string;
      if (stats.matchCount >= 20) confLabel = "high";
      else if (stats.matchCount >= 10) confLabel = "medium";
      else if (stats.matchCount >= 5) confLabel = "low";
      else confLabel = "insufficient";

      const { error: tcpErr } = await supabase
        .from("wc2026_team_calibration_profiles")
        .insert({
          calibration_run_id: calibrationRunId,
          api_football_team_id: apiTeamId,
          team_name: teamName,
          recent_matches_available: stats.matchCount,
          recent_win_rate: stats.winRate,
          recent_goal_diff_avg: stats.goalDiffAvg,
          form_data_source: "api-football",
          historical_elo_rating: parseFloat(stats.elo.toFixed(2)),
          wc2026_team_strength_index: normalizedSI,
          wc2026_scenario_confidence: stats.matchCount >= 10 ? 0.70 : stats.matchCount >= 5 ? 0.50 : 0.30,
          wc2026_late_goal_risk: clamp(0.30 + (2.0 - stats.defenseScore) * 0.10, 0.10, 0.70),
          wc2026_chaos_probability: clamp(0.25 + (1.0 - stats.form5) * 0.20, 0.10, 0.60),
          wc2026_fatigue_risk: 0.30, // default; updated post-group stage
          calibration_confidence: confLabel,
          calibration_formula_version: "strength_engine_v1",
          calibrated_at: new Date().toISOString(),
          data_coverage_flags: { has_recent_form: stats.totalMatches >= 5, elo_calculated: stats.matchCount > 0 },
        });

      if (tcpErr) {
        errors.push(`Team profile ${apiTeamId}: ${tcpErr.message}`);
      } else {
        teamProfilesInserted++;
      }
    }

    log.push(`Team calibration profiles inserted: ${teamProfilesInserted}`);

    // Also upsert team_strength_ratings for teams with internal UUIDs
    let ratingsUpserted = 0;
    for (const [apiTeamId, stats] of teamStats) {
      const internal = apiIdToUuid.get(apiTeamId);
      if (!internal) continue;

      const venueScore = WC_HOST_API_IDS.has(apiTeamId) ? 0.1 : 0.0;
      const matchCount = stats.matchCount;
      const confidence = matchCount >= 20 ? 0.85 : matchCount >= 15 ? 0.75 : matchCount >= 10 ? 0.60 : matchCount >= 5 ? 0.45 : matchCount >= 1 ? 0.25 : 0.10;

      const { error: srErr } = await supabase
        .from("team_strength_ratings")
        .upsert(
          {
            team_id: internal.id,
            provider_name: "api-football",
            rating_scope: "national_team_recent",
            rating_version: "wc2026_v1",
            elo_rating: parseFloat(stats.elo.toFixed(2)),
            form_score: stats.form5,
            attack_score: stats.attackScore,
            defense_score: stats.defenseScore,
            market_score: null,
            venue_score: venueScore,
            match_count: matchCount,
            last_match_at: stats.lastMatchAt,
            data_window_start: stats.windowStart ? stats.windowStart.substring(0, 10) : null,
            data_window_end: stats.windowEnd ? stats.windowEnd.substring(0, 10) : null,
            confidence_score: clamp(confidence, 0.10, 1.00),
            metadata: {
              ingestion_run_id: ingestionRunId,
              calibration_run_id: calibrationRunId,
              goals_for: stats.goalsFor,
              goals_against: stats.goalsAgainst,
              win_rate: stats.winRate,
              form_last_10: stats.form10,
              is_host: WC_HOST_API_IDS.has(apiTeamId),
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "team_id,provider_name,rating_scope,rating_version" },
        );

      if (srErr) errors.push(`Strength rating ${apiTeamId}: ${srErr.message}`);
      else ratingsUpserted++;
    }

    log.push(`Strength ratings upserted: ${ratingsUpserted}`);

    // ═══════════════════════════════════════
    // PHASE 6 — MATCH SCENARIO CALIBRATION
    // ═══════════════════════════════════════

    let scenariosInserted = 0;
    const samplePredictions: unknown[] = [];

    for (const fixture of wcFixtures as WcFixture[]) {
      const hId = fixture.home_api_team_id;
      const aId = fixture.away_api_team_id;

      if (!hId || !aId) {
        errors.push(`Fixture ${fixture.api_football_fixture_id}: missing team IDs`);
        continue;
      }

      const hStats = teamStats.get(hId);
      const aStats = teamStats.get(aId);

      const hSI = strengthIndex(hId);
      const aSI = strengthIndex(aId);
      const siDiff = hSI - aSI;

      // 1X2 probabilities from strength difference
      let rawH = 0.33 + (siDiff / 400) * 0.15;
      let rawA = 0.33 + (-siDiff / 400) * 0.15;
      let rawD = 1.0 - rawH - rawA;
      rawH = Math.max(rawH, 0.10);
      rawA = Math.max(rawA, 0.10);
      rawD = Math.max(rawD, 0.10);
      const tot = rawH + rawD + rawA;
      const pHome = parseFloat((rawH / tot).toFixed(3));
      const pDraw = parseFloat((rawD / tot).toFixed(3));
      const pAway = parseFloat((rawA / tot).toFixed(3));

      // Predicted score based on attack/defense
      const hAttack = hStats?.attackScore ?? 1.2;
      const aAttack = aStats?.attackScore ?? 1.2;
      const hDef = hStats?.defenseScore ?? 1.0;
      const aDef = aStats?.defenseScore ?? 1.0;
      const predictedHome = Math.round(clamp(hAttack * (2.0 - aDef) * 0.7, 0, 5));
      const predictedAway = Math.round(clamp(aAttack * (2.0 - hDef) * 0.7, 0, 5));

      // Confidence based on data availability
      const hCount = hStats?.matchCount ?? 0;
      const aCount = aStats?.matchCount ?? 0;
      const minCount = Math.min(hCount, aCount);
      const confLabel = minCount >= 15 ? "high" : minCount >= 8 ? "medium" : "low";
      const scenarioConf = minCount >= 15 ? 0.75 : minCount >= 8 ? 0.55 : 0.35;

      // WC-specific indices
      const hForm = hStats?.form5 ?? 0.5;
      const aForm = aStats?.form5 ?? 0.5;
      const lateGoalRisk = parseFloat(clamp(0.30 + (2.0 - (hDef + aDef) / 2) * 0.15, 0.15, 0.65).toFixed(3));
      const chaosProbability = parseFloat(clamp(0.25 + (Math.abs(pHome - pAway) < 0.10 ? 0.15 : 0), 0.10, 0.60).toFixed(3));
      const fatigueRisk = 0.25; // base; increases in KO rounds

      const missingWarnings: string[] = [];
      if (hCount < 5) missingWarnings.push(`home_low_history:${fixture.home_team_name}`);
      if (aCount < 5) missingWarnings.push(`away_low_history:${fixture.away_team_name}`);

      const { error: scErr } = await supabase
        .from("wc2026_match_scenario_calibration")
        .insert({
          calibration_run_id: calibrationRunId,
          api_football_fixture_id: fixture.api_football_fixture_id,
          home_team_name: fixture.home_team_name,
          away_team_name: fixture.away_team_name,
          stage_code: fixture.stage_code,
          group_label: fixture.group_label,
          home_team_strength_index: parseFloat(hSI.toFixed(2)),
          away_team_strength_index: parseFloat(aSI.toFixed(2)),
          strength_diff: parseFloat(siDiff.toFixed(2)),
          home_win_probability: pHome,
          draw_probability: pDraw,
          away_win_probability: pAway,
          predicted_score_home: predictedHome,
          predicted_score_away: predictedAway,
          first_15_tempo: hForm > 0.65 || aForm > 0.65 ? "high" : "medium",
          first_15_pressure: parseFloat(clamp((hForm + aForm) / 2, 0.20, 0.80).toFixed(3)),
          first_half_pressure_dominant: hSI > aSI ? fixture.home_team_name : fixture.away_team_name,
          first_half_goal_probability: parseFloat(clamp(0.35 + (hAttack + aAttack) * 0.05, 0.20, 0.70).toFixed(3)),
          first_half_card_risk: Math.abs(siDiff) > 200 ? "medium" : "low",
          second_half_fatigue_factor: parseFloat(fatigueRisk.toFixed(3)),
          second_half_momentum_shift_risk: parseFloat(clamp(0.25 + (1.0 - scenarioConf) * 0.20, 0.10, 0.55).toFixed(3)),
          late_game_chaos_score: chaosProbability,
          late_goal_probability: lateGoalRisk,
          late_card_risk: lateGoalRisk > 0.45 ? "high" : "medium",
          comeback_probability: parseFloat(clamp(0.15 + (1.0 - Math.abs(pHome - pAway)) * 0.10, 0.05, 0.40).toFixed(3)),
          set_piece_threat: hAttack + aAttack > 2.5 ? "high" : "medium",
          wc2026_scenario_confidence: parseFloat(scenarioConf.toFixed(3)),
          wc2026_late_goal_risk: lateGoalRisk,
          wc2026_chaos_probability: chaosProbability,
          wc2026_fatigue_risk: parseFloat(fatigueRisk.toFixed(3)),
          calibration_confidence: confLabel,
          missing_data_warnings: missingWarnings.length > 0 ? missingWarnings : [],
          calibration_formula_version: "strength_engine_v1",
          calibrated_at: new Date().toISOString(),
        });

      if (scErr) {
        errors.push(`Scenario ${fixture.home_team_name} vs ${fixture.away_team_name}: ${scErr.message}`);
      } else {
        scenariosInserted++;
        if (samplePredictions.length < 5) {
          samplePredictions.push({
            fixture: `${fixture.home_team_name} vs ${fixture.away_team_name}`,
            date: fixture.match_date?.substring(0, 10),
            stage: fixture.stage_code,
            home_si: parseFloat(hSI.toFixed(1)),
            away_si: parseFloat(aSI.toFixed(1)),
            probs: { home: pHome, draw: pDraw, away: pAway },
            predicted_score: `${predictedHome}-${predictedAway}`,
            confidence: confLabel,
          });
        }
      }
    }

    log.push(`Match scenarios inserted: ${scenariosInserted}`);

    // ═══════════════════════════════════════
    // PHASE 7 — FINALIZE RUN RECORDS
    // ═══════════════════════════════════════

    const finalStatus = errors.length > 0 ? "partial_error" : "completed";
    const errorSummary = errors.length > 0 ? errors.slice(0, 20).join("; ") : null;

    await supabase
      .from("wc2026_ingestion_runs")
      .update({
        run_status: finalStatus,
        completed_at: new Date().toISOString(),
        rows_transformed: teamProfilesInserted,
        error_summary: errorSummary,
      })
      .eq("id", ingestionRunId);

    await supabase
      .from("wc2026_calibration_runs")
      .update({
        run_status: finalStatus,
        completed_at: new Date().toISOString(),
        teams_processed: apiTeamIds.size,
        teams_updated: teamProfilesInserted,
        teams_skipped: apiTeamIds.size - teamProfilesInserted,
        matches_processed: scenariosInserted,
        error_summary: errorSummary,
      })
      .eq("id", calibrationRunId);

    // Build ELO rankings
    const rankings = [...teamStats.entries()]
      .map(([apiId, s]) => ({
        api_id: apiId,
        name: apiIdToUuid.get(apiId)?.name ?? apiIdToName.get(apiId) ?? `Team ${apiId}`,
        elo: parseFloat(s.elo.toFixed(1)),
        form5: s.form5,
        match_count: s.matchCount,
        strength_index: parseFloat(strengthIndex(apiId).toFixed(1)),
      }))
      .sort((a, b) => b.strength_index - a.strength_index);

    return new Response(
      JSON.stringify(
        {
          status: finalStatus === "completed" ? "GO" : "CONDITIONAL",
          ingestion_run_id: ingestionRunId,
          calibration_run_id: calibrationRunId,
          summary: {
            wc_fixtures_loaded: (wcFixtures as WcFixture[]).length,
            unique_teams: apiTeamIds.size,
            api_calls_used: apiCallsUsed,
            failed_teams: failedTeams.length,
            unique_historical_fixtures: sortedMatches.length,
            team_profiles_inserted: teamProfilesInserted,
            strength_ratings_upserted: ratingsUpserted,
            match_scenarios_inserted: scenariosInserted,
          },
          top_10: rankings.slice(0, 10),
          bottom_5: rankings.slice(-5),
          sample_predictions: samplePredictions,
          errors: errors.slice(0, 20),
          log,
        },
        null,
        2,
      ),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message;

    // Best-effort: mark runs as failed
    if (ingestionRunId) {
      await supabase.from("wc2026_ingestion_runs").update({ run_status: "failed", error_summary: message, completed_at: new Date().toISOString() }).eq("id", ingestionRunId);
    }
    if (calibrationRunId) {
      await supabase.from("wc2026_calibration_runs").update({ run_status: "failed", error_summary: message, completed_at: new Date().toISOString() }).eq("id", calibrationRunId);
    }

    return new Response(
      JSON.stringify({ error: message, log, errors }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
