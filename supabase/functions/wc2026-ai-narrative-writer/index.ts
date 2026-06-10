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

// ── Authorization ─────────────────────────────────────────────────────────────

function isAuthorized(req: Request): boolean {
  // Path 1: explicit internal secret header — used by ad-hoc server-side callers.
  const internalSecret = Deno.env.get("ADMIN_JOB_SECRET") ?? "";
  if (internalSecret) {
    const headerSecret = req.headers.get("X-Internal-Secret") ?? "";
    if (headerSecret === internalSecret) return true;
  }

  // Path 2: any valid JWT issued for this project (anon or service_role).
  // verify_jwt is disabled; we validate the project ref from the token's iss claim.
  const projectRef = Deno.env.get("SUPABASE_URL")?.split(".")?.[0]?.split("/").pop() ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ") && projectRef) {
    try {
      const token = authHeader.slice(7);
      const payload = JSON.parse(atob(token.split(".")[1]));
      // iss = "supabase", ref claim must match this project
      if (payload?.ref === projectRef) return true;
      // service_role always authorized regardless of ref format
      if (payload?.role === "service_role") return true;
    } catch {
      // malformed JWT
    }
  }

  return false;
}

// ── AI Narrative via Claude ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sen futbol analistlerine özel bir maç yorumlama asistanısın.
Türkçe yazıyorsun. Görevin: verilen 18 adet 5 dakikalık periyot için özgün, analitik ve akıcı
senaryo metinleri üretmek. Her metin:
- 1-2 cümle olmalı (max 160 karakter)
- Somut veri referansı içermeli (topa sahip olma, baskı, ev sahibi avantajı vb.)
- Maçın dramatik akışını yansıtmalı
- Klişelerden kaçınmalı
- Sadece metni döndür, JSON wrapper kullanma
Döndüreceğin format tam olarak:
[{"p":0,"t":"..."},{"p":5,"t":"..."},...]`;

async function callClaude(
  anthropicKey: string,
  homeTeam: string,
  awayTeam: string,
  venueName: string,
  generationMode: GenerationMode,
  periods: PeriodRow[],
  qualifierContext: Record<string, unknown>,
  lineupContext?: Record<string, unknown>,
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

  const userMessage = JSON.stringify({
    ev_sahibi: homeTeam,
    deplasman: awayTeam,
    stat: venueName,
    mod: modeLabel,
    eleme_profili: qualifierContext,
    ...(lineupContext ? { kadro_snapshot: lineupContext } : {}),
    periyotlar: periodSummary,
    talimat: generationMode === "PRE_MATCH_FINAL"
      ? `Her periyot için mevcut metni (cur) geliştir. Kadro bilgisi mevcutsa (kadro_snapshot) anahtar oyuncuları veya eksiklikleri doğal biçimde yedirme fırsatı ara.
momentum/gr_h/gr_a/press değerlerini kullan. Rakamları cümleye yedirme; 'yüksek baskı', 'dominant sahip oluş', 'kritik eksiklik', 'sahaya çıkacak ilk 11' gibi ifadeler kullan.
Format: [{"p":0,"t":"metin"},{"p":5,"t":"metin"},...] — tam 18 eleman`
      : `Her periyot için mevcut metni (cur) geliştir. momentum/gr_h/gr_a/press değerlerini
kullan. Rakamları doğrudan cümleye yedirme, bunun yerine 'yüksek baskı', 'dominant sahip oluş',
'tehlikeli bölge geçişleri' gibi ifadeler kullan.
Format: [{"p":0,"t":"metin"},{"p":5,"t":"metin"},...] — tam 18 eleman`,
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
  // Labeled as manual test priors — NOT real market odds
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
    .select("id, home_team_name, away_team_name, venue_name_raw, match_number")
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
    .select("team_name,avg_possession_pct,qualifier_win_rate,qualifier_matches_played")
    .eq("team_name", fixture.away_team_name)
    .maybeSingle();

  const { data: homeQual } = await supabase
    .from("wc_qualifier_model_features")
    .select("team_name,is_host_nation,avg_possession_pct")
    .eq("team_name", fixture.home_team_name)
    .maybeSingle();

  const qualCtx = {
    home_is_host: homeQual?.is_host_nation ?? false,
    away_possession: awayQual?.avg_possession_pct ?? 50,
    away_win_rate_pct: Math.round((awayQual?.qualifier_win_rate ?? 0) * 100),
    away_matches: awayQual?.qualifier_matches_played ?? 0,
  };

  const venueName = fixture.venue_name_raw ?? "Estadio Azteca";
  const startedAt = new Date().toISOString();

  // ── Lineup context (PRE_MATCH_FINAL only) ─────────────────────────────────
  let lineupContext: Record<string, unknown> | undefined;
  let lineupConfidence: "official" | "squad_confirmed" | "unavailable" = "unavailable";

  if (generationMode === "PRE_MATCH_FINAL") {
    // Check for official confirmed lineups first
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
      // Fall back to probable squad summary
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
          squads: squads.map(s => ({
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
      prompt_version: "v2",
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

    // Mark queue item done
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

    // ── Queue drain mode: process all pending queue items ──────────────────────
    if (action === "drain_queue") {
      const { data: items } = await supabase
        .from("wc2026_ai_narrative_queue")
        .select("fixture_id, generation_mode")
        .eq("status", "pending")
        .order("queued_at");

      if (!items?.length) {
        return new Response(JSON.stringify({ drained: 0, message: "No pending items" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = [];
      for (const item of items) {
        await supabase
          .from("wc2026_ai_narrative_queue")
          .update({ status: "claimed", claimed_at: new Date().toISOString(), claimed_by: "drain_queue" })
          .eq("fixture_id", item.fixture_id)
          .eq("generation_mode", item.generation_mode)
          .eq("status", "pending");

        const result = await processFixture(supabase, anthropicKey, item.fixture_id, item.generation_mode as GenerationMode, false);
        results.push(result);
      }

      return new Response(JSON.stringify({ drained: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Single fixture mode ────────────────────────────────────────────────────
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
