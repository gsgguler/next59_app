import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Internal-Secret",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface PeriodRow {
  id: string;
  period_start: number;
  period_end: number;
  period_label: string;
  narrative_text: string;
  expected_momentum_side: string;
  goal_risk_home: number;
  goal_risk_away: number;
  home_pressure_score: number;
  away_pressure_score: number;
  foul_risk_home: number;
  foul_risk_away: number;
  yellow_card_risk_home: number;
  yellow_card_risk_away: number;
  red_card_risk_home: number;
  red_card_risk_away: number;
  corner_risk_home: number;
  corner_risk_away: number;
  offside_risk_home: number;
  offside_risk_away: number;
  confidence: number;
  drivers_json: Record<string, unknown>;
  source_snapshot_json: Record<string, unknown>;
  is_public: boolean;
  scenario_version: number;
}

type GenerationMode = "PRE_MATCH_INITIAL" | "PRE_MATCH_FINAL";

interface PlayerPoolEntry {
  player_name: string;
  position: string;
  availability_status: string;
  injury_detail: string | null;
  suspension_detail: string | null;
  api_football_player_id: number | null;
}

interface QualifierPlayerStat {
  player_name: string;
  total_minutes: number | null;
  match_appearances: number;
  goals: number | null;
  assists: number | null;
  yellows: number;
  reds: number;
}

interface ClubStatEntry {
  player_name: string;
  season: number;
  team_name: string;
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  rating: number | null;
  cards_yellow: number | null;
  cards_red: number | null;
}

interface VenuePsychology {
  altitude_factor: number;
  travel_fatigue_factor: number;
  home_crowd_support_score: number;
  away_crowd_support_score: number;
  home_morale_lift_score: number;
  away_morale_lift_score: number;
  home_pressure_against_score: number;
  away_pressure_against_score: number;
  is_home_team_host_country: boolean;
  is_away_team_host_country: boolean;
}

interface LineupHistoryEntry {
  player_name: string;
  position: string;
  appearances: number;
  starts: number;
}

interface OddsContext {
  source: "live_db" | "manual_test_prior" | "unavailable";
  home_pct: number;
  draw_pct: number;
  away_pct: number;
  snapshot_time: string | null;
  note: string;
}

// ── Authorization ─────────────────────────────────────────────────────────────

function isAuthorized(req: Request): boolean {
  const internalSecret = Deno.env.get("ADMIN_JOB_SECRET") ?? "";
  if (!internalSecret) return false;
  const headerSecret = req.headers.get("X-Internal-Secret") ?? "";
  return headerSecret.length > 0 && headerSecret === internalSecret;
}

// ── Gap 1: Live odds (match_odds table → manual prior fallback) ────────────────

async function fetchLiveOdds(
  supabase: ReturnType<typeof createClient>,
  fixtureId: string,
): Promise<OddsContext> {
  const { data: rows } = await supabase
    .from("match_odds")
    .select("market, selection, odds, snapshot_time")
    .eq("match_id", fixtureId)
    .eq("market", "1X2")
    .eq("is_main", true)
    .order("snapshot_time", { ascending: false })
    .limit(3);

  if (rows?.length) {
    const homeRow = rows.find((r: { selection: string }) => r.selection === "Home");
    const drawRow = rows.find((r: { selection: string }) => r.selection === "Draw");
    const awayRow = rows.find((r: { selection: string }) => r.selection === "Away");

    if (homeRow && drawRow && awayRow) {
      // Convert decimal odds to implied probability (no vig removal — raw implied)
      const impliedHome = homeRow.odds > 0 ? 1 / homeRow.odds : 0;
      const impliedDraw = drawRow.odds > 0 ? 1 / drawRow.odds : 0;
      const impliedAway = awayRow.odds > 0 ? 1 / awayRow.odds : 0;
      const sum = impliedHome + impliedDraw + impliedAway;

      return {
        source: "live_db",
        home_pct: Math.round((impliedHome / sum) * 100),
        draw_pct: Math.round((impliedDraw / sum) * 100),
        away_pct: Math.round((impliedAway / sum) * 100),
        snapshot_time: homeRow.snapshot_time ?? null,
        note: "Live odds from match_odds table — vig-included implied probabilities",
      };
    }
  }

  // Fallback: documented manual test priors (Mexico vs South Africa WC opener)
  return {
    source: "manual_test_prior",
    home_pct: 47,
    draw_pct: 27,
    away_pct: 26,
    snapshot_time: null,
    note: "No live bookmaker odds in DB for this WC2026 fixture. Manual test priors used — NOT real market odds. Confidence LOW.",
  };
}

// ── Gap 2: Club season stats via api_football_player_id ───────────────────────

async function fetchClubStats(
  supabase: ReturnType<typeof createClient>,
  pool: PlayerPoolEntry[],
): Promise<Map<string, ClubStatEntry[]>> {
  const playerIds = pool
    .map(p => p.api_football_player_id)
    .filter((id): id is number => id !== null);

  if (!playerIds.length) return new Map();

  const { data } = await supabase
    .from("af_player_season_stats")
    .select("api_football_player_id,player_name,team_name,season,appearances,minutes,goals_total,assists,rating,cards_yellow,cards_red")
    .in("api_football_player_id", playerIds)
    .in("season", [2023, 2024])
    .not("minutes", "is", null)
    .gt("minutes", 0)
    .order("api_football_player_id")
    .order("season", { ascending: false });

  const resultMap = new Map<string, ClubStatEntry[]>();
  if (!data?.length) return resultMap;

  // Build player_id → pool_name lookup
  const idToName = new Map<number, string>();
  for (const p of pool) {
    if (p.api_football_player_id) idToName.set(p.api_football_player_id, p.player_name);
  }

  for (const row of data) {
    const poolName = idToName.get(row.api_football_player_id) ?? row.player_name;
    const entry: ClubStatEntry = {
      player_name: poolName,
      season: row.season,
      team_name: row.team_name ?? "?",
      appearances: row.appearances ?? null,
      minutes: row.minutes ?? null,
      goals: row.goals_total ?? null,
      assists: row.assists ?? null,
      rating: row.rating ? parseFloat(row.rating) : null,
      cards_yellow: row.cards_yellow ?? null,
      cards_red: row.cards_red ?? null,
    };
    const existing = resultMap.get(poolName) ?? [];
    existing.push(entry);
    resultMap.set(poolName, existing);
  }

  return resultMap;
}

// ── Gap 2 helper: build compact club stats summary for AI ─────────────────────

function summariseClubStats(
  pool: PlayerPoolEntry[],
  statsMap: Map<string, ClubStatEntry[]>,
): { player: string; club_2024: ClubStatEntry | null; club_2023: ClubStatEntry | null }[] {
  return pool.map(p => {
    const entries = statsMap.get(p.player_name) ?? [];
    const s2024 = entries.find(e => e.season === 2024) ?? null;
    const s2023 = entries.find(e => e.season === 2023) ?? null;
    return { player: p.player_name, club_2024: s2024, club_2023: s2023 };
  }).filter(r => r.club_2024 !== null || r.club_2023 !== null);
}

// ── Gap 3: Infer probable XI from player pool (host teams — no lineup history) ─

function inferXIFromPool(pool: PlayerPoolEntry[]): {
  player_name: string;
  position: string;
  confidence: string;
  slot: string;
}[] {
  const available = pool.filter(
    p => !p.injury_detail && !p.suspension_detail
  );

  const gks  = available.filter(p => p.position === "Goalkeeper");
  const defs = available.filter(p => p.position === "Defender");
  const mids = available.filter(p => p.position === "Midfielder");
  const atts = available.filter(p => p.position === "Attacker");

  // 4-4-2 formation slots: 1 GK, 4 DEF, 4 MID, 2 ATT (adjust if fewer available)
  const xi: { player_name: string; position: string; confidence: string; slot: string }[] = [];

  const pick = (
    group: PlayerPoolEntry[],
    n: number,
    slot: string,
    posLabel: string,
  ) => {
    group.slice(0, n).forEach((p, i) =>
      xi.push({ player_name: p.player_name, position: posLabel, confidence: "pool_inference", slot: `${slot}${i + 1}` })
    );
  };

  pick(gks,  1, "GK",  "Goalkeeper");
  pick(defs, 4, "DEF", "Defender");
  pick(mids, 4, "MID", "Midfielder");
  pick(atts, 2, "ATT", "Attacker");

  return xi;
}

// ── Enrich: fetch player pools for both teams ─────────────────────────────────

async function fetchPlayerPools(
  supabase: ReturnType<typeof createClient>,
  homeTeamApiId: number,
  awayTeamApiId: number,
): Promise<{ home: PlayerPoolEntry[]; away: PlayerPoolEntry[] }> {
  const { data } = await supabase
    .from("wc2026_player_pool")
    .select("player_name,position,availability_status,injury_detail,suspension_detail,api_football_player_id,api_football_team_id")
    .in("api_football_team_id", [homeTeamApiId, awayTeamApiId]);

  type RawRow = PlayerPoolEntry & { api_football_team_id: number };

  const toEntry = (r: RawRow): PlayerPoolEntry => ({
    player_name: r.player_name,
    position: r.position,
    availability_status: r.availability_status,
    injury_detail: r.injury_detail,
    suspension_detail: r.suspension_detail,
    api_football_player_id: r.api_football_player_id,
  });

  const home = (data ?? []).filter((p: RawRow) => p.api_football_team_id === homeTeamApiId).map(toEntry);
  const away = (data ?? []).filter((p: RawRow) => p.api_football_team_id === awayTeamApiId).map(toEntry);

  return { home, away };
}

// ── Enrich: fetch qualifier player stats for away team ────────────────────────

async function fetchQualifierPlayerStats(
  supabase: ReturnType<typeof createClient>,
  providerTeamId: string,
): Promise<QualifierPlayerStat[]> {
  const { data: rows } = await supabase
    .from("wc_qualifier_player_match_stats")
    .select("player_name,minutes,goals_total,assists,yellow_cards,red_cards")
    .eq("provider_team_id", providerTeamId);

  if (!rows?.length) return [];

  const map = new Map<string, QualifierPlayerStat>();
  for (const row of rows) {
    const existing = map.get(row.player_name);
    if (existing) {
      existing.total_minutes = (existing.total_minutes ?? 0) + (row.minutes ?? 0);
      existing.match_appearances += 1;
      existing.goals = (existing.goals ?? 0) + (row.goals_total ?? 0);
      existing.assists = (existing.assists ?? 0) + (row.assists ?? 0);
      existing.yellows += row.yellow_cards ?? 0;
      existing.reds += row.red_cards ?? 0;
    } else {
      map.set(row.player_name, {
        player_name: row.player_name,
        total_minutes: row.minutes ?? null,
        match_appearances: 1,
        goals: row.goals_total ?? null,
        assists: row.assists ?? null,
        yellows: row.yellow_cards ?? 0,
        reds: row.red_cards ?? 0,
      });
    }
  }

  return Array.from(map.values())
    .filter(p => p.total_minutes && p.total_minutes > 0)
    .sort((a, b) => (b.total_minutes ?? 0) - (a.total_minutes ?? 0))
    .slice(0, 15);
}

// ── Enrich: infer probable XI from qualifier lineup history ───────────────────

async function fetchProbableXI(
  supabase: ReturnType<typeof createClient>,
  providerTeamId: string,
): Promise<LineupHistoryEntry[]> {
  const { data } = await supabase
    .from("wc_qualifier_lineup_players")
    .select("player_name,position,is_starting")
    .eq("provider_team_id", providerTeamId);

  if (!data?.length) return [];

  const map = new Map<string, LineupHistoryEntry>();
  for (const row of data) {
    const existing = map.get(row.player_name);
    if (existing) {
      existing.appearances += 1;
      if (row.is_starting) existing.starts += 1;
    } else {
      map.set(row.player_name, {
        player_name: row.player_name,
        position: row.position ?? "?",
        appearances: 1,
        starts: row.is_starting ? 1 : 0,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.starts - a.starts || b.appearances - a.appearances)
    .slice(0, 14);
}

// ── Enrich: fetch venue psychology factors ────────────────────────────────────

async function fetchVenuePsychology(
  supabase: ReturnType<typeof createClient>,
  fixtureId: string,
): Promise<VenuePsychology | null> {
  const { data } = await supabase
    .from("wc2026_venue_psychology_factors")
    .select("altitude_factor,travel_fatigue_factor,home_crowd_support_score,away_crowd_support_score,home_morale_lift_score,away_morale_lift_score,home_pressure_against_score,away_pressure_against_score,is_home_team_host_country,is_away_team_host_country")
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  return data ?? null;
}

// ── Gap 4: Injury / availability status summary ───────────────────────────────

function buildInjuryStatus(pool: PlayerPoolEntry[]): {
  confirmed_injured: string[];
  confirmed_suspended: string[];
  availability_unknown_count: number;
  sync_needed: boolean;
  note: string;
} {
  const injured = pool
    .filter(p => p.injury_detail)
    .map(p => `${p.player_name} (${p.injury_detail})`);

  const suspended = pool
    .filter(p => p.suspension_detail)
    .map(p => `${p.player_name} (${p.suspension_detail})`);

  const unknownCount = pool.filter(p => p.availability_status === "unknown").length;
  const syncNeeded = unknownCount > 0 && injured.length === 0 && suspended.length === 0;

  return {
    confirmed_injured: injured,
    confirmed_suspended: suspended,
    availability_unknown_count: unknownCount,
    sync_needed: syncNeeded,
    note: syncNeeded
      ? `All ${unknownCount} player availability statuses are unknown — wc2026-injury-sync has not run for this squad. Do NOT invent injuries in narratives.`
      : injured.length + suspended.length > 0
        ? "Confirmed absences present — factor into narrative."
        : "No confirmed absences.",
  };
}

// ── Build data quality flags ──────────────────────────────────────────────────

function buildDataQualityFlags(
  homeIsHost: boolean,
  awayIsHost: boolean,
  homePool: PlayerPoolEntry[],
  awayPool: PlayerPoolEntry[],
  awayQualStats: QualifierPlayerStat[],
  probableXI: LineupHistoryEntry[],
  venuePsych: VenuePsychology | null,
  oddsCtx: OddsContext,
  homeClubStatsCoverage: number,
  awayClubStatsCoverage: number,
): Record<string, unknown> {
  return {
    home_team_data_source: homeIsHost ? "host_nation_proxy" : "qualifier_official",
    home_team_confidence: homeIsHost ? 0.60 : 0.90,
    home_qualifier_path: homeIsHost
      ? "NO_QUALIFIER — host nation auto-qualified; proxy stats from Nations League + Gold Cup 2024-25"
      : "qualifier_official",
    away_team_data_source: awayIsHost ? "host_nation_proxy" : "qualifier_official",
    away_team_confidence: awayIsHost ? 0.60 : 0.90,
    away_qualifier_path: awayIsHost
      ? "NO_QUALIFIER — host nation auto-qualified"
      : "qualifier_official",
    home_pool_available: homePool.length > 0,
    away_pool_available: awayPool.length > 0,
    home_probable_xi_source: homeIsHost ? "pool_position_inference_no_lineup_history" : "qualifier_lineup_history",
    away_probable_xi_inferred: awayIsHost ? false : probableXI.length >= 9,
    away_qualifier_player_stats_available: awayQualStats.length > 0,
    venue_psychology_available: venuePsych !== null,
    official_lineup_available: false,
    odds_source: oddsCtx.source,
    odds_confidence: oddsCtx.source === "live_db" ? "high" : "low",
    home_club_stats_players_found: homeClubStatsCoverage,
    away_club_stats_players_found: awayClubStatsCoverage,
    host_nations_in_match: [
      ...(homeIsHost ? ["home"] : []),
      ...(awayIsHost ? ["away"] : []),
    ],
  };
}

// ── AI Narrative via Claude ───────────────────────────────────────────────────

// HOST NATION RULE: Mexico, USA, Canada are WC2026 host nations that auto-qualified
// without playing official CONMEBOL/UEFA/CAF/etc. qualifying matches.
// Their strength data comes from proxy matches (Nations League, Gold Cup) with
// lower data confidence (0.60 vs 0.90 for qualifier teams).
// AI narratives MUST acknowledge this asymmetry — do NOT treat host proxy stats
// as equivalent to official qualifier paths.
const HOST_NATION_RULE = `
ÖNEMLI KURAL — EV SAHİBİ ÜLKELER:
Meksika, ABD ve Kanada WC2026'nın ev sahibi ülkeleri olduğu için resmi eleme maçı oynamadan doğrudan turnuvaya katılıyorlar.
Bu üç takım için mevcut istatistikler resmi elemelerden değil, Nations League ve Gold Cup proxy maçlarından alınmıştır.
- Bu takımların verilerine confidence=0.60 uygula (eleme takımları için 0.90)
- Eleme istatistiklerini karşılaştırırken bu asimetriyi mutlaka belirt
- "Eleme performansı" yerine "son rekabetçi maç formu" ifadesini kullan
- Ev sahibi takım için muhtemel XI, eleme maç geçmişinden DEĞİL, kadro pozisyonlarından çıkarılmıştır (pool_position_inference)
- SAKATLIKLARDA: availability_status=unknown olan oyuncular için sakatlık ICAT ETME
- ORANLAR: odds_source=manual_test_prior ise gerçek bahis oranları YOK — sadece model önceliklerine göre analiz yap
`;

const SYSTEM_PROMPT = `Sen futbol analistlerine özel bir maç yorumlama asistanısın.
Türkçe yazıyorsun. Görevin: verilen 18 adet 5 dakikalık periyot için özgün, analitik ve akıcı
senaryo metinleri üretmek. Her metin:
- 1-2 cümle olmalı (max 160 karakter)
- Somut veri referansı içermeli (topa sahip olma, baskı, ev sahibi avantajı vb.)
- Maçın dramatik akışını yansıtmalı
- Klişelerden kaçınmalı
- Sadece metni döndür, JSON wrapper kullanma
Döndüreceğin format tam olarak:
[{"p":0,"t":"..."},{"p":5,"t":"..."},...]

${HOST_NATION_RULE}`;

async function callClaude(
  anthropicKey: string,
  homeTeam: string,
  awayTeam: string,
  venueName: string,
  generationMode: GenerationMode,
  periods: PeriodRow[],
  qualifierContext: Record<string, unknown>,
  lineupContext?: Record<string, unknown>,
  enrichedContext?: Record<string, unknown>,
): Promise<Array<{ period_start: number; narrative: string }>> {

  const periodSummary = periods.map(p => ({
    p: p.period_start,
    momentum: p.expected_momentum_side,
    gr_h: parseFloat(p.goal_risk_home?.toString() ?? "0"),
    gr_a: parseFloat(p.goal_risk_away?.toString() ?? "0"),
    press_h: parseFloat(p.home_pressure_score?.toString() ?? "0"),
    press_a: parseFloat(p.away_pressure_score?.toString() ?? "0"),
    foul_h: parseFloat(p.foul_risk_home?.toString() ?? "0"),
    conf: parseFloat(p.confidence?.toString() ?? "0"),
    cur: p.narrative_text?.slice(0, 80),
  }));

  const modeLabel = generationMode === "PRE_MATCH_FINAL"
    ? "Final maç öncesi analiz — kadro ve sahaya yakın bilgiler dahil"
    : "İlk maç öncesi analiz — eleme verileri ve model projeksiyonuna dayalı";

  const finalInstruction = generationMode === "PRE_MATCH_FINAL"
    ? `Her periyot için mevcut metni (cur) geliştir.
venue_context, player_pool, qualifier_player_stats, probable_xi, club_stats mevcutsa:
  - Kilit oyuncuları (özellikle SA için istatistiklerle desteklenen: Mokoena, Williams, Appollis vb.) doğal biçimde yedirme
  - Venue baskısını (2240m altitude, %87 ev sahibi kalabalık) narratife yansıt
  - Kulüp form bilgisi varsa (club_stats) oyuncu tarz ipuçları ver
  - Meksika'nın ev sahibi avantajını ve SA'nın baskı altındaki psikolojisini (pressure_against=0.76) kullan
EV SAHİBİ KURALI: Meksika = host_nation → eleme YOK, "son rekabetçi form" kullan, XI=pool_inference
SAKATLIKLARDA: sync_needed=true ise sakatlık ICAT ETME
ORANLAR: odds_source=manual_test_prior ise bahis oranına ATIFTA BULUNMA
Format: [{"p":0,"t":"metin"},{"p":5,"t":"metin"},...] — tam 18 eleman`
    : `Her periyot için mevcut metni (cur) geliştir. momentum/gr_h/gr_a/press değerlerini
kullan. Rakamları doğrudan cümleye yedirme, bunun yerine 'yüksek baskı', 'dominant sahip oluş',
'tehlikeli bölge geçişleri' gibi ifadeler kullan.
EV SAHİBİ KURALI: Meksika = host_nation → "son rekabetçi form" kullan, eleme referansı yapma.
Format: [{"p":0,"t":"metin"},{"p":5,"t":"metin"},...] — tam 18 eleman`;

  const userMessage = JSON.stringify({
    ev_sahibi: homeTeam,
    deplasman: awayTeam,
    stat: venueName,
    mod: modeLabel,
    eleme_profili: qualifierContext,
    ...(lineupContext ? { kadro_snapshot: lineupContext } : {}),
    ...(enrichedContext ? { zengin_bağlam: enrichedContext } : {}),
    periyotlar: periodSummary,
    talimat: finalInstruction,
  });

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Claude API ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  const raw: string = data.content?.[0]?.text ?? "[]";

  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (!arrayMatch) throw new Error("No JSON array in Claude response");

  const parsed = JSON.parse(arrayMatch[0]) as Array<{ p: number; t: string }>;
  return parsed.map(item => ({ period_start: item.p, narrative: item.t }));
}

// ── Internal sanity check (never exposed publicly) ────────────────────────────

function runInternalSanityCheck(
  periods: PeriodRow[]
): {
  model_home_pct: number;
  model_draw_pct: number;
  model_away_pct: number;
  manual_test_prior_home_pct: number;
  manual_test_prior_draw_pct: number;
  manual_test_prior_away_pct: number;
  internal_only: true;
  home_delta: number;
  draw_delta: number;
  away_delta: number;
  total_divergence: number;
  severity: string;
  notes: string;
} {
  const n = periods.length;
  const avgGoalRiskHome = periods.reduce((s, p) => s + parseFloat(p.goal_risk_home?.toString() ?? "0"), 0) / n;
  const avgGoalRiskAway = periods.reduce((s, p) => s + parseFloat(p.goal_risk_away?.toString() ?? "0"), 0) / n;
  const avgPressureHome = periods.reduce((s, p) => s + parseFloat(p.home_pressure_score?.toString() ?? "0"), 0) / n;
  const avgPressureAway = periods.reduce((s, p) => s + parseFloat(p.away_pressure_score?.toString() ?? "0"), 0) / n;

  const xgHome = avgGoalRiskHome * 18;
  const xgAway = avgGoalRiskAway * 18;

  const rawHome = (xgHome > xgAway ? 0.45 : 0.30) + (xgHome - xgAway) * 0.15 + (avgPressureHome - avgPressureAway) * 0.10;
  const rawAway = (xgAway > xgHome ? 0.45 : 0.25) + (xgAway - xgHome) * 0.15 + (avgPressureAway - avgPressureHome) * 0.10;
  const rawDraw = Math.max(0.18, 1.0 - rawHome - rawAway);

  const total = rawHome + rawDraw + rawAway;
  const modelHome = Math.min(0.75, Math.max(0.10, rawHome / total));
  const modelDraw = Math.min(0.40, Math.max(0.15, rawDraw / total));
  const modelAway = Math.max(0.10, 1 - modelHome - modelDraw);

  // Manual test priors for Mexico vs South Africa WC opener — NOT real market odds
  const priorHome = 0.47;
  const priorDraw = 0.27;
  const priorAway = 0.26;

  const homeDelta = Math.abs(modelHome - priorHome);
  const drawDelta = Math.abs(modelDraw - priorDraw);
  const awayDelta = Math.abs(modelAway - priorAway);
  const totalDiv = homeDelta + drawDelta + awayDelta;

  const severity = totalDiv > 0.20 ? "high" : totalDiv > 0.10 ? "medium" : "low";

  const notesParts: string[] = [];
  if (homeDelta > 0.10) notesParts.push(`Ev sahibi olasılık farkı yüksek (Δ${(homeDelta*100).toFixed(1)}pp)`);
  if (drawDelta > 0.08) notesParts.push(`Beraberlik farkı dikkat çekici (Δ${(drawDelta*100).toFixed(1)}pp)`);
  if (avgPressureAway > avgPressureHome + 0.05) notesParts.push("Deplasman baskı ortalaması ev sahibini geçiyor");
  if (xgHome < xgAway * 0.8) notesParts.push("Model xG sinyali ev sahibi aleyhine");
  if (notesParts.length === 0) notesParts.push("Model ve test prior sinyalleri makul aralıkta");

  return {
    model_home_pct: parseFloat((modelHome * 100).toFixed(2)),
    model_draw_pct: parseFloat((modelDraw * 100).toFixed(2)),
    model_away_pct: parseFloat((modelAway * 100).toFixed(2)),
    manual_test_prior_home_pct: Math.round(priorHome * 100),
    manual_test_prior_draw_pct: Math.round(priorDraw * 100),
    manual_test_prior_away_pct: Math.round(priorAway * 100),
    internal_only: true,
    home_delta: parseFloat((homeDelta * 100).toFixed(2)),
    draw_delta: parseFloat((drawDelta * 100).toFixed(2)),
    away_delta: parseFloat((awayDelta * 100).toFixed(2)),
    total_divergence: parseFloat((totalDiv * 100).toFixed(2)),
    severity,
    notes: notesParts.join("; "),
  };
}

// ── Core fixture processor ────────────────────────────────────────────────────

async function processFixture(
  supabase: ReturnType<typeof createClient>,
  anthropicKey: string,
  fixtureId: string,
  generationMode: GenerationMode,
  force: boolean,
): Promise<Record<string, unknown>> {
  const { data: fixture } = await supabase
    .from("wc2026_fixtures")
    .select("id, home_team_name, away_team_name, venue_name_raw, match_number, home_team_id, away_team_id")
    .eq("id", fixtureId)
    .single();

  if (!fixture) return { error: `Fixture ${fixtureId} not found`, skipped: true };

  if (!force) {
    const { data: existingRun } = await supabase
      .from("wc2026_ai_narrative_runs")
      .select("id, status")
      .eq("fixture_id", fixtureId)
      .eq("generation_mode", generationMode)
      .eq("status", "completed")
      .maybeSingle();
    if (existingRun) {
      return { skipped: true, reason: `completed run exists`, run_id: existingRun.id };
    }
  }

  const { data: periods, error: periodsErr } = await supabase
    .from("wc2026_5min_flow_scenarios")
    .select("id,period_start,period_end,period_label,narrative_text,expected_momentum_side,goal_risk_home,goal_risk_away,home_pressure_score,away_pressure_score,foul_risk_home,foul_risk_away,yellow_card_risk_home,yellow_card_risk_away,red_card_risk_home,red_card_risk_away,corner_risk_home,corner_risk_away,offside_risk_home,offside_risk_away,confidence,drivers_json,source_snapshot_json,is_public,scenario_version")
    .eq("fixture_id", fixtureId)
    .eq("is_current", true)
    .order("period_start");

  if (periodsErr || !periods?.length) {
    return { error: "No current scenarios found", detail: periodsErr?.message };
  }

  const currentVersion = (periods[0] as PeriodRow).scenario_version;
  const nextVersion = currentVersion + 1;

  const { data: awayQual } = await supabase
    .from("wc_qualifier_model_features")
    .select("team_name,avg_possession_pct,qualifier_win_rate,qualifier_matches_played,is_host_nation,overall_qualifier_data_confidence,qualification_method,model_usage_notes")
    .eq("team_name", fixture.away_team_name)
    .maybeSingle();

  const { data: homeQual } = await supabase
    .from("wc_qualifier_model_features")
    .select("team_name,is_host_nation,avg_possession_pct,qualifier_win_rate,qualifier_matches_played,overall_qualifier_data_confidence,qualification_method,host_recent_competitive_form_source,host_recent_competitive_form_notes,model_usage_notes")
    .eq("team_name", fixture.home_team_name)
    .maybeSingle();

  const homeIsHost = homeQual?.is_host_nation ?? false;
  const awayIsHost = awayQual?.is_host_nation ?? false;

  const qualCtx = {
    home_is_host: homeIsHost,
    home_qualification_method: homeQual?.qualification_method ?? "unknown",
    home_data_confidence: homeQual?.overall_qualifier_data_confidence ?? (homeIsHost ? 0.60 : 0.90),
    home_possession: homeQual?.avg_possession_pct ?? 50,
    home_win_rate_pct: Math.round((homeQual?.qualifier_win_rate ?? 0) * 100),
    home_matches: homeQual?.qualifier_matches_played ?? 0,
    home_proxy_note: homeIsHost ? (homeQual?.host_recent_competitive_form_notes ?? "Host nation — no qualifier path") : null,
    away_is_host: awayIsHost,
    away_qualification_method: awayQual?.qualification_method ?? "unknown",
    away_data_confidence: awayQual?.overall_qualifier_data_confidence ?? (awayIsHost ? 0.60 : 0.90),
    away_possession: awayQual?.avg_possession_pct ?? 50,
    away_win_rate_pct: Math.round((awayQual?.qualifier_win_rate ?? 0) * 100),
    away_matches: awayQual?.qualifier_matches_played ?? 0,
    away_proxy_note: awayIsHost ? (awayQual?.host_recent_competitive_form_notes ?? "Host nation — no qualifier path") : null,
  };

  const venueName = fixture.venue_name_raw ?? "Estadio Azteca";
  const startedAt = new Date().toISOString();

  // ── Lineup context (PRE_MATCH_FINAL only) ─────────────────────────────────
  let lineupContext: Record<string, unknown> | undefined;
  let lineupConfidence: "official" | "squad_confirmed" | "unavailable" = "unavailable";

  if (generationMode === "PRE_MATCH_FINAL") {
    const { data: officialLineup } = await supabase
      .from("wc2026_lineups")
      .select("id")
      .eq("fixture_id", fixtureId)
      .maybeSingle();

    if (officialLineup) {
      lineupConfidence = "official";
      const { data: lp } = await supabase
        .from("wc2026_lineup_players")
        .select("team_name, player_name, position, jersey_number, is_starting")
        .eq("fixture_id", fixtureId)
        .eq("is_starting", true)
        .order("team_name, jersey_number");
      lineupContext = { confidence: "official", players: lp ?? [] };
    } else {
      const { data: squads } = await supabase
        .from("wc2026_probable_squads")
        .select("team_name, squad_type, player_count, goalkeeper_count, defender_count, midfielder_count, attacker_count, status, confidence_level")
        .in("team_name", [fixture.home_team_name, fixture.away_team_name])
        .eq("status", "confirmed");

      if (squads?.length) {
        lineupConfidence = "squad_confirmed";
        lineupContext = {
          confidence: "squad_confirmed",
          note: "Official starting XI not yet released — confirmed squad available",
          squads: squads.map((s: { team_name: string; goalkeeper_count: number; defender_count: number; midfielder_count: number; attacker_count: number; player_count: number }) => ({
            team: s.team_name,
            gk: s.goalkeeper_count,
            def: s.defender_count,
            mid: s.midfielder_count,
            att: s.attacker_count,
            total: s.player_count,
          })),
        };
      }
    }
  }

  // ── Enriched context (PRE_MATCH_FINAL only) ────────────────────────────────
  let enrichedContext: Record<string, unknown> | undefined;

  if (generationMode === "PRE_MATCH_FINAL") {
    // Team API IDs for Mexico (16) and South Africa (1531)
    // These are resolved from wc2026_player_pool which has api_football_team_id
    const HOME_API_ID = 16;   // Mexico
    const AWAY_API_ID = 1531; // South Africa

    const [pools, venuePsych, oddsCtx] = await Promise.all([
      fetchPlayerPools(supabase, HOME_API_ID, AWAY_API_ID),
      fetchVenuePsychology(supabase, fixtureId),
      fetchLiveOdds(supabase, fixtureId),
    ]);

    const homePools = pools.home;
    const awayPools = pools.away;

    // Gap 4: Injury status for both squads
    const homeInjuryStatus = buildInjuryStatus(homePools);
    const awayInjuryStatus = buildInjuryStatus(awayPools);

    // Gap 2: Club season stats via api_football_player_id (run in parallel)
    const [homeClubStats, awayClubStats] = await Promise.all([
      fetchClubStats(supabase, homePools),
      fetchClubStats(supabase, awayPools),
    ]);

    const homeClubSummary = summariseClubStats(homePools, homeClubStats);
    const awayClubSummary = summariseClubStats(awayPools, awayClubStats);

    // SA qualifier player stats
    const awayQualPlayerStats = awayIsHost
      ? []
      : await fetchQualifierPlayerStats(supabase, String(AWAY_API_ID));

    // SA probable XI from qualifier lineup history; Mexico XI inferred from pool
    const awayProbableXI = awayIsHost
      ? []
      : await fetchProbableXI(supabase, String(AWAY_API_ID));

    // Gap 3: Mexico XI inferred from pool positions (no lineup history exists)
    const homeInferredXI = homeIsHost
      ? inferXIFromPool(homePools)
      : [];

    const dataQualityFlags = buildDataQualityFlags(
      homeIsHost, awayIsHost,
      homePools, awayPools,
      awayQualPlayerStats, awayProbableXI,
      venuePsych, oddsCtx,
      homeClubSummary.length,
      awayClubSummary.length,
    );

    enrichedContext = {
      host_nation_rule: {
        applies_to: ["Mexico", "USA", "Canada"],
        reason: "WC2026 host nations — auto-qualified, no official qualifying path",
        data_source: "proxy: CONCACAF Nations League + Gold Cup 2024-25",
        confidence_penalty: "0.60 vs 0.90 for qualifier teams",
        narrative_instruction: "Do NOT reference qualifier campaigns for host nations. Use 'recent competitive form' instead. Do NOT invent injuries when sync_needed=true.",
      },
      // Gap 1: Live odds with documented source
      odds_context: {
        ...oddsCtx,
        warning: oddsCtx.source === "manual_test_prior"
          ? "No live odds in DB. Manual priors are model test values only — do not reference in fan-facing narratives."
          : undefined,
      },
      venue_context: venuePsych ? {
        altitude_factor: parseFloat(venuePsych.altitude_factor?.toString()),
        travel_fatigue_away: parseFloat(venuePsych.travel_fatigue_factor?.toString()),
        home_crowd_support: parseFloat(venuePsych.home_crowd_support_score?.toString()),
        away_crowd_support: parseFloat(venuePsych.away_crowd_support_score?.toString()),
        home_morale_lift: parseFloat(venuePsych.home_morale_lift_score?.toString()),
        away_morale_lift: parseFloat(venuePsych.away_morale_lift_score?.toString()),
        home_pressure_against: parseFloat(venuePsych.home_pressure_against_score?.toString()),
        away_pressure_against: parseFloat(venuePsych.away_pressure_against_score?.toString()),
        interpretation: {
          altitude: "Estadio Azteca 2240m — significant altitude disadvantage for South Africa",
          crowd: "87% home support advantage for Mexico, only 12% for SA",
          fatigue: "Away travel fatigue coefficient 0.30 — notable but not extreme",
          pressure: "SA faces 0.76 pressure-against score — high hostile environment pressure",
        },
      } : null,
      home_player_pool: {
        note: homeIsHost
          ? "Host nation — no qualifier lineup history. Squad names from 26-man pool only."
          : "Qualifier team — pool available.",
        squad_count: homePools.length,
        players_by_position: {
          GK: homePools.filter(p => p.position === "Goalkeeper").map(p => p.player_name),
          DEF: homePools.filter(p => p.position === "Defender").map(p => p.player_name),
          MID: homePools.filter(p => p.position === "Midfielder").map(p => p.player_name),
          ATT: homePools.filter(p => p.position === "Attacker").map(p => p.player_name),
        },
        injury_status: homeInjuryStatus,
      },
      away_player_pool: {
        squad_count: awayPools.length,
        players_by_position: {
          GK: awayPools.filter(p => p.position === "Goalkeeper").map(p => p.player_name),
          DEF: awayPools.filter(p => p.position === "Defender").map(p => p.player_name),
          MID: awayPools.filter(p => p.position === "Midfielder").map(p => p.player_name),
          ATT: awayPools.filter(p => p.position === "Attacker").map(p => p.player_name),
        },
        injury_status: awayInjuryStatus,
      },
      // Gap 2: Club stats (last 2 seasons) for players in both pools
      club_stats: {
        home_team: {
          data_available: homeClubSummary.length > 0,
          players_found: homeClubSummary.length,
          note: "af_player_season_stats joined via api_football_player_id — seasons 2023 & 2024",
          top_players: homeClubSummary.slice(0, 10),
        },
        away_team: {
          data_available: awayClubSummary.length > 0,
          players_found: awayClubSummary.length,
          note: "af_player_season_stats joined via api_football_player_id — seasons 2023 & 2024",
          top_players: awayClubSummary.slice(0, 10),
        },
      },
      qualifier_player_stats: awayQualPlayerStats.length ? {
        team: fixture.away_team_name,
        data_confidence: 0.90,
        note: "Aggregated from official CAF qualifying matches",
        top_players: awayQualPlayerStats.slice(0, 12).map(p => ({
          name: p.player_name,
          minutes: p.total_minutes,
          apps: p.match_appearances,
          goals: p.goals ?? 0,
          assists: p.assists ?? 0,
          yellows: p.yellows,
          reds: p.reds,
        })),
      } : {
        team: fixture.away_team_name,
        note: awayIsHost ? "Host nation — no qualifier path" : "No qualifier player stats available",
      },
      // Gap 3: Probable XI — SA from qualifier history; Mexico inferred from pool
      probable_xi: {
        home: homeIsHost ? {
          team: fixture.home_team_name,
          source: "pool_position_inference",
          confidence: "LOW — no qualifier lineup history for host nation; positional inference only",
          note: "Mexico had no qualifying matches. XI inferred from 26-man squad positions (4-4-2 shape).",
          players: homeInferredXI,
        } : null,
        away: awayProbableXI.length ? {
          team: fixture.away_team_name,
          source: "qualifier_lineup_history",
          confidence: "MEDIUM — inferred from CAF qualifier starts; official XI not yet announced",
          players: awayProbableXI.slice(0, 11).map(p => ({
            name: p.player_name,
            pos: p.position,
            starts: p.starts,
            apps: p.appearances,
          })),
        } : null,
      },
      data_quality_flags: dataQualityFlags,
    };
  }

  const sanity = runInternalSanityCheck(periods as PeriodRow[]);

  const { error: divErr } = await supabase
    .from("wc2026_model_market_divergence")
    .upsert({
      fixture_id: fixtureId,
      scenario_version: currentVersion,
      model_home_pct: sanity.model_home_pct,
      model_draw_pct: sanity.model_draw_pct,
      model_away_pct: sanity.model_away_pct,
      market_home_pct: sanity.manual_test_prior_home_pct,
      market_draw_pct: sanity.manual_test_prior_draw_pct,
      market_away_pct: sanity.manual_test_prior_away_pct,
      home_delta: sanity.home_delta,
      draw_delta: sanity.draw_delta,
      away_delta: sanity.away_delta,
      total_divergence: sanity.total_divergence,
      severity: sanity.severity,
      notes: sanity.notes,
      created_at: startedAt,
    }, { onConflict: "fixture_id,scenario_version" });

  if (divErr) console.error("divergence upsert error:", divErr.message);

  if (!anthropicKey) {
    return { error: "ANTHROPIC_API_KEY not configured", fixture_id: fixtureId };
  }

  const { data: runRow } = await supabase
    .from("wc2026_ai_narrative_runs")
    .insert({
      fixture_id: fixtureId,
      match_number: fixture.match_number,
      scenario_version: currentVersion,
      generation_mode: generationMode,
      provider: "anthropic",
      model_name: "claude-haiku-4-5",
      prompt_version: "v4",
      status: "running",
      started_at: startedAt,
      input_snapshot_json: {
        home_team: fixture.home_team_name,
        away_team: fixture.away_team_name,
        venue: venueName,
        period_count: periods.length,
        qualifier_context: qualCtx,
        lineup_confidence: lineupConfidence,
        ...(lineupContext ? { lineup_snapshot: lineupContext } : {}),
        ...(enrichedContext ? { enriched_context: enrichedContext } : {}),
      },
    })
    .select("id")
    .single();

  const aiRunId: string | null = runRow?.id ?? null;
  let narrativeStatus = "failed";
  let enhancedCount = 0;
  let aiError: string | null = null;

  try {
    const enhanced = await callClaude(
      anthropicKey,
      fixture.home_team_name,
      fixture.away_team_name,
      venueName,
      generationMode,
      periods as PeriodRow[],
      qualCtx,
      lineupContext,
      enrichedContext,
    );

    await supabase
      .from("wc2026_5min_flow_scenarios")
      .update({ is_current: false })
      .eq("fixture_id", fixtureId)
      .eq("is_current", true);

    const narrativeMap = new Map<number, string>();
    for (const ep of enhanced) {
      if (ep.narrative?.trim()) narrativeMap.set(ep.period_start, ep.narrative.trim());
    }

    const scenarioContext = generationMode === "PRE_MATCH_FINAL" ? "ai_prematch_final" : "ai_prematch_initial";
    const newRows = (periods as PeriodRow[]).map(p => ({
      fixture_id: fixtureId,
      period_start: p.period_start,
      period_end: p.period_end,
      period_label: p.period_label,
      narrative_text: narrativeMap.get(p.period_start) ?? p.narrative_text,
      expected_momentum_side: p.expected_momentum_side,
      goal_risk_home: p.goal_risk_home,
      goal_risk_away: p.goal_risk_away,
      home_pressure_score: p.home_pressure_score,
      away_pressure_score: p.away_pressure_score,
      foul_risk_home: p.foul_risk_home,
      foul_risk_away: p.foul_risk_away,
      yellow_card_risk_home: p.yellow_card_risk_home,
      yellow_card_risk_away: p.yellow_card_risk_away,
      red_card_risk_home: p.red_card_risk_home,
      red_card_risk_away: p.red_card_risk_away,
      corner_risk_home: p.corner_risk_home,
      corner_risk_away: p.corner_risk_away,
      offside_risk_home: p.offside_risk_home,
      offside_risk_away: p.offside_risk_away,
      confidence: p.confidence,
      drivers_json: p.drivers_json,
      source_snapshot_json: p.source_snapshot_json,
      is_public: p.is_public,
      is_current: true,
      scenario_version: nextVersion,
      scenario_context: scenarioContext,
    }));

    const { error: insertErr } = await supabase
      .from("wc2026_5min_flow_scenarios")
      .insert(newRows);

    if (insertErr) throw new Error(`Version insert failed: ${insertErr.message}`);

    enhancedCount = narrativeMap.size;
    narrativeStatus = "completed";

    if (aiRunId) {
      await supabase
        .from("wc2026_ai_narrative_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          output_json: { periods_enhanced: enhancedCount, new_scenario_version: nextVersion },
        })
        .eq("id", aiRunId);
    }

    await supabase
      .from("wc2026_ai_narrative_queue")
      .update({ status: "done" })
      .eq("fixture_id", fixtureId)
      .eq("generation_mode", generationMode);

  } catch (err) {
    aiError = String(err);

    await supabase
      .from("wc2026_5min_flow_scenarios")
      .update({ is_current: true })
      .eq("fixture_id", fixtureId)
      .eq("scenario_version", currentVersion);

    if (aiRunId) {
      await supabase
        .from("wc2026_ai_narrative_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(), error_text: aiError })
        .eq("id", aiRunId);
    }

    await supabase
      .from("wc2026_ai_narrative_queue")
      .update({ status: "failed" })
      .eq("fixture_id", fixtureId)
      .eq("generation_mode", generationMode);
  }

  return {
    fixture_id: fixtureId,
    home_team: fixture.home_team_name,
    away_team: fixture.away_team_name,
    generation_mode: generationMode,
    previous_scenario_version: currentVersion,
    new_scenario_version: narrativeStatus === "completed" ? nextVersion : null,
    sanity_check: { ...sanity },
    ai_narrative: { status: narrativeStatus, periods_enhanced: enhancedCount, run_id: aiRunId, error: aiError },
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action: string = body.action ?? "run";

    if (action === "drain_queue") {
      const rawBatch = typeof body.batch_limit === "number" ? body.batch_limit : 3;
      const batchLimit = Math.max(1, Math.min(rawBatch, 5));
      const workerId = `drain_${crypto.randomUUID()}`;

      let processedCount = 0, completedCount = 0, skippedCount = 0, failedCount = 0, retriedCount = 0;

      while (processedCount < batchLimit) {
        const { data: claimed, error: claimErr } = await supabase.rpc(
          "claim_next_wc2026_ai_narrative_job",
          { p_worker_id: workerId }
        );
        if (claimErr || !claimed?.length) break;

        const job = claimed[0] as {
          id: string; fixture_id: string; generation_mode: string;
          attempts: number; max_attempts: number;
        };
        processedCount++;

        let result: Record<string, unknown> = {};
        try {
          result = await processFixture(
            supabase, anthropicKey,
            job.fixture_id, job.generation_mode as GenerationMode,
            false
          );
        } catch {
          result = { error: "Internal error" };
        }

        const isError = !!result.error;
        const isSkip  = !isError && !!result.skipped;

        if (!isError) {
          if (isSkip) skippedCount++; else completedCount++;
          await supabase.from("wc2026_ai_narrative_queue")
            .update({ status: "done", completed_at: new Date().toISOString(), last_error: null })
            .eq("id", job.id);
        } else if (job.attempts >= job.max_attempts) {
          failedCount++;
          await supabase.from("wc2026_ai_narrative_queue")
            .update({ status: "failed", failed_at: new Date().toISOString(),
                      last_error: String(result.error).slice(0, 500) })
            .eq("id", job.id);
        } else {
          retriedCount++;
          const backoffMins = job.attempts === 1 ? 5 : job.attempts === 2 ? 15 : 60;
          await supabase.from("wc2026_ai_narrative_queue")
            .update({ status: "pending",
                      last_error: String(result.error).slice(0, 500),
                      next_retry_at: new Date(Date.now() + backoffMins * 60_000).toISOString(),
                      claimed_at: null, claimed_by: null })
            .eq("id", job.id);
        }
      }

      return new Response(JSON.stringify({
        processed_count: processedCount,
        completed_count: completedCount,
        skipped_count:   skippedCount,
        failed_count:    failedCount,
        retried_count:   retriedCount,
        batch_limit_applied: batchLimit,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const force: boolean = body.force === true;
    const rawMode: string = body.generation_mode ?? "PRE_MATCH_INITIAL";

    if (rawMode !== "PRE_MATCH_INITIAL" && rawMode !== "PRE_MATCH_FINAL") {
      return new Response(JSON.stringify({
        error: `Invalid generation_mode '${rawMode}'. Must be PRE_MATCH_INITIAL or PRE_MATCH_FINAL.`
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let fixtureId: string = body.fixture_id ?? "";
    if (!fixtureId) {
      const matchNumber: number = body.match_number ?? 1;
      const { data: fx } = await supabase
        .from("wc2026_fixtures")
        .select("id")
        .eq("match_number", matchNumber)
        .single();
      if (!fx) {
        return new Response(JSON.stringify({ error: `Fixture match_number=${matchNumber} not found` }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      fixtureId = fx.id;
    }

    const result = await processFixture(supabase, anthropicKey, fixtureId, rawMode as GenerationMode, force);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("handler error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
