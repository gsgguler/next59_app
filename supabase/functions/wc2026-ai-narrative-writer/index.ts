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
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  if (!internalSecret) return false;
  const headerSecret = req.headers.get("X-Internal-Secret") ?? "";
  return headerSecret === internalSecret;
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
  qualifierContext: Record<string, unknown>
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
    ? "Final maç öncesi analiz — sahaya yakın bilgiler dahil"
    : "İlk maç öncesi analiz — eleme verileri ve model projeksiyonuna dayalı";

  const userMessage = JSON.stringify({
    ev_sahibi: homeTeam,
    deplasman: awayTeam,
    stat: venueName,
    mod: modeLabel,
    eleme_profili: qualifierContext,
    periyotlar: periodSummary,
    talimat: `Her periyot için mevcut metni (cur) geliştir. momentum/gr_h/gr_a/press değerlerini
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

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Require internal authorization for every non-preflight request
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
    const matchNumber: number = body.match_number ?? 1;
    const rawMode: string = body.generation_mode ?? "PRE_MATCH_INITIAL";
    const force: boolean = body.force === true;

    // Only PRE_MATCH_INITIAL and PRE_MATCH_FINAL are valid modes
    if (rawMode !== "PRE_MATCH_INITIAL" && rawMode !== "PRE_MATCH_FINAL") {
      return new Response(JSON.stringify({
        error: `Invalid generation_mode '${rawMode}'. Must be PRE_MATCH_INITIAL or PRE_MATCH_FINAL.`
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const generationMode = rawMode as GenerationMode;

    // Load fixture
    const { data: fixture } = await supabase
      .from("wc2026_fixtures")
      .select("id, home_team_name, away_team_name, venue_name_raw")
      .eq("match_number", matchNumber)
      .single();

    if (!fixture) {
      return new Response(JSON.stringify({ error: `Fixture match_number=${matchNumber} not found` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fixtureId: string = fixture.id;

    // ── Duplicate guard ────────────────────────────────────────────────────────
    if (!force) {
      const { data: existingRun } = await supabase
        .from("wc2026_ai_narrative_runs")
        .select("id, status")
        .eq("fixture_id", fixtureId)
        .eq("generation_mode", generationMode)
        .eq("status", "completed")
        .maybeSingle();

      if (existingRun) {
        return new Response(JSON.stringify({
          skipped: true,
          reason: `Completed run already exists for fixture=${fixtureId} mode=${generationMode}. Use force=true to override.`,
          run_id: existingRun.id,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Load current 5-min periods
    const { data: periods, error: periodsErr } = await supabase
      .from("wc2026_5min_flow_scenarios")
      .select("id,period_start,period_end,period_label,narrative_text,expected_momentum_side,goal_risk_home,goal_risk_away,home_pressure_score,away_pressure_score,foul_risk_home,foul_risk_away,yellow_card_risk_home,yellow_card_risk_away,red_card_risk_home,red_card_risk_away,corner_risk_home,corner_risk_away,offside_risk_home,offside_risk_away,confidence,drivers_json,source_snapshot_json,is_public,scenario_version")
      .eq("fixture_id", fixtureId)
      .eq("is_current", true)
      .order("period_start");

    if (periodsErr || !periods?.length) {
      return new Response(JSON.stringify({ error: "No current scenarios found", detail: periodsErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentVersion = (periods[0] as PeriodRow).scenario_version;
    const nextVersion = currentVersion + 1;

    // Load qualifier context
    const { data: awayQual } = await supabase
      .from("wc_qualifier_model_features")
      .select("team_name,avg_possession_pct,qualifier_win_rate,qualifier_matches_played,xg_for_per_match,avg_fouls")
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

    // ── 1. Internal sanity check ───────────────────────────────────────────────
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

    // ── 2. AI narrative enhancement ────────────────────────────────────────────
    let narrativeStatus = "skipped";
    let enhancedCount = 0;
    let aiRunId: string | null = null;
    let aiError: string | null = null;

    if (!anthropicKey) {
      return new Response(JSON.stringify({
        error: "ANTHROPIC_API_KEY not configured",
        fixture_id: fixtureId,
        sanity_check: { ...sanity },
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create run record
    const { data: runRow } = await supabase
      .from("wc2026_ai_narrative_runs")
      .insert({
        fixture_id: fixtureId,
        match_number: matchNumber,
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
        },
      })
      .select("id")
      .single();

    aiRunId = runRow?.id ?? null;

    try {
      const enhanced = await callClaude(
        anthropicKey,
        fixture.home_team_name,
        fixture.away_team_name,
        venueName,
        generationMode,
        periods as PeriodRow[],
        qualCtx
      );

      // ── VERSIONING: seal current version, create new version rows ───────────
      // Step 1: Seal current version
      await supabase
        .from("wc2026_5min_flow_scenarios")
        .update({ is_current: false })
        .eq("fixture_id", fixtureId)
        .eq("is_current", true);

      // Step 2: Build enhanced narrative lookup
      const narrativeMap = new Map<number, string>();
      for (const ep of enhanced) {
        if (ep.narrative?.trim()) narrativeMap.set(ep.period_start, ep.narrative.trim());
      }

      // Step 3: Insert new version rows — copy all numeric fields, replace only narrative_text
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
    } catch (err) {
      aiError = String(err);
      narrativeStatus = "failed";

      // On failure, restore current flag on original rows
      await supabase
        .from("wc2026_5min_flow_scenarios")
        .update({ is_current: true })
        .eq("fixture_id", fixtureId)
        .eq("scenario_version", currentVersion);

      if (aiRunId) {
        await supabase
          .from("wc2026_ai_narrative_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_text: aiError,
          })
          .eq("id", aiRunId);
      }
    }

    return new Response(JSON.stringify({
      fixture_id: fixtureId,
      home_team: fixture.home_team_name,
      away_team: fixture.away_team_name,
      generation_mode: generationMode,
      previous_scenario_version: currentVersion,
      new_scenario_version: narrativeStatus === "completed" ? nextVersion : null,
      sanity_check: { ...sanity },
      ai_narrative: {
        status: narrativeStatus,
        periods_enhanced: enhancedCount,
        run_id: aiRunId,
        error: aiError,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
