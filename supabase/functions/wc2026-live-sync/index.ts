import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AF_BASE = "https://v3.football.api-sports.io";

const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"];

// WC2026 fixtures to track: AF fixture ID → { fixture_id (uuid), fixture_key }
// Expand this list as the tournament progresses
const WC2026_FIXTURES: Record<number, { fixture_id: string; fixture_key: string }> = {
  1489369: { fixture_id: "eb0a1f0b-6a8a-454f-8706-6bbedcd77fe4", fixture_key: "wc2026-001" },
};

// Fetch from API-Football with a single retry on 5xx
async function afFetch(path: string, key: string): Promise<Response> {
  const url = `${AF_BASE}${path}`;
  const headers = { "x-apisports-key": key };
  let resp = await fetch(url, { headers });
  if (!resp.ok && resp.status >= 500) {
    await new Promise((r) => setTimeout(r, 1200));
    resp = await fetch(url, { headers });
  }
  return resp;
}

// ── Rule-based live scenario generator ──────────────────────────────────────────
// Produces a Turkish-language narrative without any odds or betting language.

function buildLiveNarrative(opts: {
  elapsed: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homePossession: number;
  awayPossession: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homeYellow: number;
  awayYellow: number;
  homeRed: number;
  awayRed: number;
  homeCorners: number;
  awayCorners: number;
  homeFouls: number;
  awayFouls: number;
  homeXg: number;
  awayXg: number;
}): string {
  const {
    elapsed,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    homePossession,
    homeShotsOnTarget,
    awayShotsOnTarget,
    homeYellow,
    awayYellow,
    homeRed,
    awayRed,
    homeCorners,
    awayCorners,
    homeFouls,
    awayFouls,
    homeXg,
    awayXg,
  } = opts;

  const scoreDiff = homeScore - awayScore;
  const dominantTeam = homePossession >= 52 ? homeTeam : awayTeam;
  const pressureTeam = homeShotsOnTarget >= awayShotsOnTarget + 2
    ? homeTeam
    : awayShotsOnTarget >= homeShotsOnTarget + 2
    ? awayTeam
    : null;

  const parts: string[] = [];

  // Minute context
  if (elapsed <= 15) {
    parts.push(`${elapsed}. dakikada maç tempolu bir başlangıç yaptı.`);
  } else if (elapsed <= 45) {
    parts.push(`İlk yarının ortasında, ${elapsed}. dakikada,`);
  } else if (elapsed === 45 || elapsed === 46) {
    parts.push(`İlk yarı sona ererken`);
  } else if (elapsed <= 60) {
    parts.push(`İkinci yarının açılış bölümünde, ${elapsed}. dakikada,`);
  } else if (elapsed <= 75) {
    parts.push(`${elapsed}. dakikada kritik bir bölüme girildi;`);
  } else {
    parts.push(`Son bölümde, ${elapsed}. dakikada,`);
  }

  // Scoreline context
  if (homeScore === 0 && awayScore === 0) {
    parts.push(`skor henüz açılmamış durumda.`);
  } else if (scoreDiff > 1) {
    parts.push(`${homeTeam} ${homeScore}-${awayScore} öne geçmiş durumda.`);
  } else if (scoreDiff < -1) {
    parts.push(`${awayTeam} ${awayScore}-${homeScore} üstünlüğünü koruyor.`);
  } else if (scoreDiff === 1) {
    parts.push(`${homeTeam} ${homeScore}-${awayScore} dar farkla önde.`);
  } else if (scoreDiff === -1) {
    parts.push(`${awayTeam} ${awayScore}-${homeScore} dar farkla önde.`);
  } else {
    parts.push(`${homeScore}-${awayScore} beraberlik devam ediyor.`);
  }

  // Possession / pressure narrative
  if (pressureTeam) {
    parts.push(`${pressureTeam} isabetli vuruş üstünlüğüyle baskı kuruyor.`);
  } else if (homePossession >= 55) {
    parts.push(`${homeTeam} topa sahip olmada belirgin üstünlük sağlıyor (%${homePossession}).`);
  } else if (homePossession <= 45) {
    parts.push(`${awayTeam} topa sahip olma avantajını kullanmaya çalışıyor (%${100 - homePossession}).`);
  }

  // xG signal
  if (homeXg > 0 || awayXg > 0) {
    const xgLeader = homeXg > awayXg + 0.3 ? homeTeam : awayXg > homeXg + 0.3 ? awayTeam : null;
    if (xgLeader) {
      parts.push(`Model beklenen gol sinyali ${xgLeader} lehine (${xgLeader === homeTeam ? homeXg.toFixed(1) : awayXg.toFixed(1)} bGOL).`);
    }
  }

  // Card risk
  const totalYellow = homeYellow + awayYellow;
  const totalRed = homeRed + awayRed;
  if (totalRed > 0) {
    parts.push(`Kırmızı kart nedeniyle sayısal üstünlük/azınlık maç dengesini değiştirdi.`);
  } else if (totalYellow >= 4) {
    parts.push(`Sarı kart sayısı (${totalYellow}) yüksek seyrediyor; kart riski kritik seviyede.`);
  } else if (homeYellow >= 2 || awayYellow >= 2) {
    const riskyTeam = homeYellow >= awayYellow ? homeTeam : awayTeam;
    parts.push(`${riskyTeam} oyuncularında sarı kart yükü birikmeye başladı.`);
  }

  // Corners / set piece
  const totalCorners = homeCorners + awayCorners;
  if (totalCorners >= 8) {
    const cornerTeam = homeCorners >= awayCorners ? homeTeam : awayTeam;
    parts.push(`${cornerTeam} korner sayısı (${Math.max(homeCorners, awayCorners)}) ile duran top baskısı oluşturuyor.`);
  }

  // Foul intensity
  const totalFouls = homeFouls + awayFouls;
  if (totalFouls >= 20) {
    parts.push(`Maç fiziksel yoğunlukta seyrediyor (toplam ${totalFouls} faul).`);
  }

  return parts.join(" ").trim();
}

// ── Compute derived risk metrics from live stats ─────────────────────────────────

function computeLiveRisks(
  homeStats: Record<string, number>,
  awayStats: Record<string, number>,
  elapsed: number,
): {
  goalRiskHome: number;
  goalRiskAway: number;
  cardRisk: number;
  cornerRisk: number;
  foulIntensity: number;
  momentumSide: string;
} {
  const minutesRemaining = Math.max(1, 90 - elapsed);
  const pace = elapsed > 0 ? 90 / elapsed : 1;

  // Project xG rate
  const homeXg = homeStats.expected_goals ?? 0;
  const awayXg = awayStats.expected_goals ?? 0;
  const homeXgRate = (homeXg / Math.max(elapsed, 1)) * minutesRemaining;
  const awayXgRate = (awayXg / Math.max(elapsed, 1)) * minutesRemaining;

  // Normalise to 0-1 range (0.5 = average goal chance)
  const goalRiskHome = Math.min(0.95, homeXgRate / 2.5);
  const goalRiskAway = Math.min(0.95, awayXgRate / 2.5);

  // Card risk: yellow count projected
  const totalYellow = (homeStats.yellow_cards ?? 0) + (awayStats.yellow_cards ?? 0);
  const cardRisk = Math.min(0.95, (totalYellow * pace) / 6);

  // Corner risk
  const totalCorners = (homeStats.corner_kicks ?? 0) + (awayStats.corner_kicks ?? 0);
  const cornerRisk = Math.min(0.95, (totalCorners * pace) / 14);

  // Foul intensity
  const totalFouls = (homeStats.fouls ?? 0) + (awayStats.fouls ?? 0);
  const foulIntensity = Math.min(0.95, (totalFouls * pace) / 28);

  // Momentum: who has more shots on target + xG
  const homeSignal = (homeStats.shots_on_goal ?? 0) * 0.4 + homeXg * 0.6;
  const awaySignal = (awayStats.shots_on_goal ?? 0) * 0.4 + awayXg * 0.6;
  const momentumSide =
    homeSignal > awaySignal + 0.5
      ? "home"
      : awaySignal > homeSignal + 0.5
      ? "away"
      : "neutral";

  return {
    goalRiskHome: parseFloat(goalRiskHome.toFixed(3)),
    goalRiskAway: parseFloat(goalRiskAway.toFixed(3)),
    cardRisk: parseFloat(cardRisk.toFixed(3)),
    cornerRisk: parseFloat(cornerRisk.toFixed(3)),
    foulIntensity: parseFloat(foulIntensity.toFixed(3)),
    momentumSide,
  };
}

// ── Parse raw AF statistics array into flat number map ──────────────────────────

function parseAfStats(statsArr: { type: string; value: string | number | null }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const s of statsArr ?? []) {
    if (s.value === null || s.value === undefined) continue;
    const raw = typeof s.value === "string"
      ? parseFloat(s.value.replace("%", ""))
      : s.value;
    if (!isNaN(raw)) {
      const key = s.type
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/_+$/, "");
      result[key] = raw;
    }
  }
  return result;
}

// ── 5-minute window for a given elapsed minute ───────────────────────────────────

function fiveMinWindow(elapsed: number): { start: number; end: number } {
  const start = Math.floor(elapsed / 5) * 5;
  return { start, end: start + 5 };
}

// ── Main handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    // Allow caller to restrict to a single AF fixture ID for targeted sync
    const targetAfId: number | null = body.af_fixture_id ?? null;

    const fixtureEntries = targetAfId
      ? Object.entries(WC2026_FIXTURES).filter(([id]) => Number(id) === targetAfId)
      : Object.entries(WC2026_FIXTURES);

    if (fixtureEntries.length === 0) {
      return new Response(JSON.stringify({ message: "No matching fixtures configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, unknown>[] = [];

    for (const [afIdStr, meta] of fixtureEntries) {
      const afId = Number(afIdStr);
      const fixtureResult: Record<string, unknown> = { af_fixture_id: afId, fixture_key: meta.fixture_key };

      try {
        // ── 1. Fetch fixture (score + status) ────────────────────────────────────
        const fixResp = await afFetch(`/fixtures?id=${afId}`, AF_KEY);
        if (!fixResp.ok) throw new Error(`AF /fixtures HTTP ${fixResp.status}`);
        const fixJson = await fixResp.json();
        const fix = fixJson?.response?.[0];
        if (!fix) throw new Error(`No fixture data for AF ID ${afId}`);

        const statusShort: string = fix.fixture?.status?.short ?? "NS";
        const elapsed: number = fix.fixture?.status?.elapsed ?? 0;
        const homeScore: number = fix.goals?.home ?? 0;
        const awayScore: number = fix.goals?.away ?? 0;
        const homeTeamName: string = fix.teams?.home?.name ?? "Ev Sahibi";
        const awayTeamName: string = fix.teams?.away?.name ?? "Deplasman";

        // ── 2. Upsert live match state ────────────────────────────────────────────
        const { error: stateErr } = await supabase
          .from("wc2026_live_match_state")
          .upsert({
            fixture_id: meta.fixture_id,
            fixture_key: meta.fixture_key,
            api_football_fixture_id: afId,
            status_short: statusShort,
            status_long: fix.fixture?.status?.long ?? null,
            elapsed_minute: elapsed,
            period: fix.fixture?.periods?.second ? 2 : fix.fixture?.periods?.first ? 1 : null,
            home_score: homeScore,
            away_score: awayScore,
            home_score_ht: fix.score?.halftime?.home ?? null,
            away_score_ht: fix.score?.halftime?.away ?? null,
            home_score_et: fix.score?.extratime?.home ?? null,
            away_score_et: fix.score?.extratime?.away ?? null,
            home_score_pen: fix.score?.penalty?.home ?? null,
            away_score_pen: fix.score?.penalty?.away ?? null,
            raw_fixture_json: fix,
            synced_at: new Date().toISOString(),
          }, { onConflict: "api_football_fixture_id" });

        if (stateErr) throw new Error(`State upsert: ${stateErr.message}`);
        fixtureResult.state_synced = true;

        // ── 3. If live: fetch events + statistics ─────────────────────────────────
        let homeStatMap: Record<string, number> = {};
        let awayStatMap: Record<string, number> = {};
        let homeTeamApiId = fix.teams?.home?.id ?? 0;
        let awayTeamApiId = fix.teams?.away?.id ?? 0;

        if (LIVE_STATUSES.includes(statusShort) && elapsed > 0) {
          // Events
          const evResp = await afFetch(`/fixtures/events?fixture=${afId}`, AF_KEY);
          if (evResp.ok) {
            const evJson = await evResp.json();
            const events: unknown[] = evJson?.response ?? [];

            // Delete existing and re-insert fresh snapshot
            await supabase
              .from("wc2026_live_events")
              .delete()
              .eq("api_football_fixture_id", afId);

            if (events.length > 0) {
              const rows = (events as Record<string, unknown>[]).map((ev) => {
                const evTyped = ev as {
                  time?: { elapsed?: number; extra?: number };
                  team?: { name?: string; id?: number };
                  player?: { name?: string; id?: number };
                  assist?: { name?: string; id?: number };
                  type?: string;
                  detail?: string;
                  comments?: string;
                };
                return {
                  fixture_id: meta.fixture_id,
                  api_football_fixture_id: afId,
                  event_time_elapsed: evTyped.time?.elapsed ?? null,
                  event_time_extra: evTyped.time?.extra ?? null,
                  team_name: evTyped.team?.name ?? null,
                  team_api_id: evTyped.team?.id ?? null,
                  player_name: evTyped.player?.name ?? null,
                  player_api_id: evTyped.player?.id ?? null,
                  assist_name: evTyped.assist?.name ?? null,
                  assist_api_id: evTyped.assist?.id ?? null,
                  event_type: evTyped.type ?? null,
                  event_detail: evTyped.detail ?? null,
                  event_comments: evTyped.comments ?? null,
                  raw_event_json: ev,
                  synced_at: new Date().toISOString(),
                };
              });
              await supabase.from("wc2026_live_events").insert(rows);
            }
            fixtureResult.events_synced = events.length;
          }

          await new Promise((r) => setTimeout(r, 300));

          // Statistics
          const statResp = await afFetch(`/fixtures/statistics?fixture=${afId}`, AF_KEY);
          if (statResp.ok) {
            const statJson = await statResp.json();
            const statsArr: unknown[] = statJson?.response ?? [];

            // Delete existing and re-insert
            await supabase
              .from("wc2026_live_statistics")
              .delete()
              .eq("api_football_fixture_id", afId);

            if (statsArr.length > 0) {
              const rows = (statsArr as Record<string, unknown>[]).map((teamStats) => {
                const ts = teamStats as {
                  team?: { name?: string; id?: number };
                  statistics?: { type: string; value: string | number | null }[];
                };
                const flat = parseAfStats(ts.statistics ?? []);

                // Keep parsed stats for scenario generation
                if (ts.team?.id === homeTeamApiId) homeStatMap = flat;
                if (ts.team?.id === awayTeamApiId) awayStatMap = flat;

                return {
                  fixture_id: meta.fixture_id,
                  api_football_fixture_id: afId,
                  team_name: ts.team?.name ?? null,
                  team_api_id: ts.team?.id ?? null,
                  shots_on_goal: flat.shots_on_goal ?? null,
                  shots_off_goal: flat.shots_off_goal ?? null,
                  total_shots: flat.total_shots ?? null,
                  blocked_shots: flat.blocked_shots ?? null,
                  shots_inside_box: flat.shots_inside_box ?? null,
                  shots_outside_box: flat.shots_outside_box ?? null,
                  fouls: flat.fouls ?? null,
                  corner_kicks: flat.corner_kicks ?? null,
                  offsides: flat.offsides ?? null,
                  ball_possession: flat.ball_possession ?? null,
                  yellow_cards: flat.yellow_cards ?? null,
                  red_cards: flat.red_cards ?? null,
                  goalkeeper_saves: flat.goalkeeper_saves ?? null,
                  total_passes: flat.total_passes ?? null,
                  passes_accurate: flat.passes_accurate ?? null,
                  passes_pct: flat.passes ?? null,
                  expected_goals: flat.expected_goals ?? null,
                  raw_statistics_json: teamStats,
                  synced_at: new Date().toISOString(),
                };
              });
              await supabase.from("wc2026_live_statistics").insert(rows);
            }
            fixtureResult.stats_synced = statsArr.length;
          }

          // ── 4. Generate rule-based live 5-min scenario ──────────────────────────
          if (elapsed > 0 && Object.keys(homeStatMap).length > 0) {
            const window = fiveMinWindow(elapsed);
            const risks = computeLiveRisks(homeStatMap, awayStatMap, elapsed);

            const homePossession = homeStatMap.ball_possession ?? 50;
            const narrative = buildLiveNarrative({
              elapsed,
              homeTeam: homeTeamName,
              awayTeam: awayTeamName,
              homeScore,
              awayScore,
              homePossession,
              awayPossession: awayStatMap.ball_possession ?? (100 - homePossession),
              homeShots: homeStatMap.total_shots ?? 0,
              awayShots: awayStatMap.total_shots ?? 0,
              homeShotsOnTarget: homeStatMap.shots_on_goal ?? 0,
              awayShotsOnTarget: awayStatMap.shots_on_goal ?? 0,
              homeYellow: homeStatMap.yellow_cards ?? 0,
              awayYellow: awayStatMap.yellow_cards ?? 0,
              homeRed: homeStatMap.red_cards ?? 0,
              awayRed: awayStatMap.red_cards ?? 0,
              homeCorners: homeStatMap.corner_kicks ?? 0,
              awayCorners: awayStatMap.corner_kicks ?? 0,
              homeFouls: homeStatMap.fouls ?? 0,
              awayFouls: awayStatMap.fouls ?? 0,
              homeXg: homeStatMap.expected_goals ?? 0,
              awayXg: awayStatMap.expected_goals ?? 0,
            });

            const snapshotJson = {
              home_stats: homeStatMap,
              away_stats: awayStatMap,
              elapsed,
              status: statusShort,
              generated_by: "rule_based_v1",
            };

            // Mark all existing current rows as not current
            await supabase
              .from("wc2026_live_5min_scenarios")
              .update({ is_current: false })
              .eq("api_football_fixture_id", afId)
              .eq("is_current", true);

            // Upsert the new scenario row
            const { error: scenErr } = await supabase
              .from("wc2026_live_5min_scenarios")
              .upsert({
                fixture_id: meta.fixture_id,
                fixture_key: meta.fixture_key,
                api_football_fixture_id: afId,
                live_minute: elapsed,
                period_start: window.start,
                period_end: window.end,
                home_score: homeScore,
                away_score: awayScore,
                momentum_side: risks.momentumSide,
                goal_risk_home: risks.goalRiskHome,
                goal_risk_away: risks.goalRiskAway,
                card_risk: risks.cardRisk,
                corner_risk: risks.cornerRisk,
                foul_intensity: risks.foulIntensity,
                narrative_text: narrative,
                source_snapshot_json: snapshotJson,
                is_current: true,
                is_public: true,
                generated_at: new Date().toISOString(),
              }, { onConflict: "api_football_fixture_id,period_start,period_end,live_minute" });

            if (scenErr) {
              fixtureResult.scenario_error = scenErr.message;
            } else {
              fixtureResult.scenario_generated = true;
              fixtureResult.scenario_minute = elapsed;
              fixtureResult.scenario_window = `${window.start}-${window.end}`;
            }
          }
        }

        fixtureResult.status_short = statusShort;
        fixtureResult.elapsed = elapsed;
        fixtureResult.score = `${homeScore}-${awayScore}`;
      } catch (fixtureErr: unknown) {
        fixtureResult.error = fixtureErr instanceof Error ? fixtureErr.message : String(fixtureErr);
      }

      results.push(fixtureResult);
    }

    return new Response(JSON.stringify({
      synced_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      fixtures: results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
