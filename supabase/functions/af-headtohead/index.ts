import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = new Date();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const AF_KEY = Deno.env.get("API_FOOTBALL_KEY");
    if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

    const body = await req.json().catch(() => ({}));
    // Can be called with explicit pair or batch of pairs
    // { team1_id, team2_id } or { pairs: [[t1, t2], ...] } or { fixture_id }
    let pairs: Array<[number, number]> = [];

    if (body.team1_id && body.team2_id) {
      pairs = [[Number(body.team1_id), Number(body.team2_id)]];
    } else if (Array.isArray(body.pairs)) {
      pairs = body.pairs.map((p: any) => [Number(p[0]), Number(p[1])] as [number, number]);
    } else if (body.fixture_id) {
      // Derive pair from af_fixtures_normalized
      const { data: fix } = await supabase
        .from("af_fixtures_normalized")
        .select("home_team_id, away_team_id")
        .eq("af_fixture_id", Number(body.fixture_id))
        .maybeSingle();
      if (fix?.home_team_id && fix?.away_team_id) {
        pairs = [[fix.home_team_id, fix.away_team_id]];
      }
    }

    if (pairs.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide team1_id+team2_id, pairs array, or fixture_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cap to 10 pairs per invocation to respect rate limits
    pairs = pairs.slice(0, 10);

    let logId: string | null = null;
    {
      const { data } = await supabase
        .schema("model_lab")
        .from("enrichment_sync_log")
        .insert({ sync_type: "h2h", status: "running", leagues_seen: pairs.length })
        .select("id")
        .maybeSingle();
      logId = data?.id ?? null;
    }

    let rowsInserted = 0;
    let rowsUpdated = 0;
    const errors: string[] = [];

    for (const [t1Raw, t2Raw] of pairs) {
      // Canonical pair: smaller ID first
      const t1 = Math.min(t1Raw, t2Raw);
      const t2 = Math.max(t1Raw, t2Raw);

      try {
        const url = `https://v3.football.api-sports.io/fixtures/headtohead?h2h=${t1}-${t2}&last=20`;
        const resp = await fetch(url, { headers: { "x-apisports-key": AF_KEY } });
        if (!resp.ok) throw new Error(`AF HTTP ${resp.status} for pair ${t1}-${t2}`);
        const json = await resp.json();
        const fixtures: any[] = json?.response ?? [];

        const hash = `h2h_${t1}_${t2}_${fixtures.length}`;

        // Upsert raw — on conflict update json + count
        const { error: rawErr } = await supabase
          .from("af_h2h_raw")
          .upsert({
            af_team1_id: t1,
            af_team2_id: t2,
            response_hash: hash,
            response_json: json,
            http_status: resp.status,
            matches_count: fixtures.length,
            fetched_at: new Date().toISOString(),
            transform_status: "pending",
          }, { onConflict: "response_hash" });

        if (rawErr) {
          errors.push(`h2h_raw ${t1}-${t2}: ${rawErr.message}`);
          continue;
        }

        // Normalize each fixture
        for (const fix of fixtures) {
          try {
            const fixtureData = fix.fixture ?? {};
            const teams = fix.teams ?? {};
            const goals = fix.goals ?? {};
            const score = fix.score ?? {};
            const league = fix.league ?? {};

            const afFixtureId: number = fixtureData.id;
            const homeTeamId: number | null = teams.home?.id ?? null;
            const awayTeamId: number | null = teams.away?.id ?? null;
            const homeGoals: number | null = goals.home ?? null;
            const awayGoals: number | null = goals.away ?? null;

            // Determine winner
            let winnerTeamId: number | null = null;
            if (homeGoals !== null && awayGoals !== null) {
              if (homeGoals > awayGoals) winnerTeamId = homeTeamId;
              else if (awayGoals > homeGoals) winnerTeamId = awayTeamId;
              // else draw — winnerTeamId stays null
            }

            const payload = {
              af_fixture_id: afFixtureId,
              af_team1_id: t1,
              af_team2_id: t2,
              home_team_id: homeTeamId,
              away_team_id: awayTeamId,
              home_team_name: teams.home?.name ?? null,
              away_team_name: teams.away?.name ?? null,
              home_goals: homeGoals,
              away_goals: awayGoals,
              winner_team_id: winnerTeamId,
              venue_id: fixtureData.venue?.id ?? null,
              venue_name: fixtureData.venue?.name ?? null,
              venue_city: fixtureData.venue?.city ?? null,
              af_league_id: league.id ?? null,
              league_name: league.name ?? null,
              af_season: league.season ?? null,
              match_date: fixtureData.date ? fixtureData.date.split("T")[0] : null,
              match_status: fixtureData.status?.short ?? null,
              match_elapsed: fixtureData.status?.elapsed ?? null,
              ht_home_goals: score.halftime?.home ?? null,
              ht_away_goals: score.halftime?.away ?? null,
              et_home_goals: score.extratime?.home ?? null,
              et_away_goals: score.extratime?.away ?? null,
              pen_home_goals: score.penalty?.home ?? null,
              pen_away_goals: score.penalty?.away ?? null,
              raw_payload: fix,
              synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            const { data: existing } = await supabase
              .from("af_h2h_normalized")
              .select("id")
              .eq("af_fixture_id", afFixtureId)
              .eq("af_team1_id", t1)
              .eq("af_team2_id", t2)
              .maybeSingle();

            if (existing) {
              await supabase
                .from("af_h2h_normalized")
                .update(payload)
                .eq("af_fixture_id", afFixtureId)
                .eq("af_team1_id", t1)
                .eq("af_team2_id", t2);
              rowsUpdated++;
            } else {
              await supabase.from("af_h2h_normalized").insert(payload);
              rowsInserted++;
            }
          } catch (fixErr: unknown) {
            const msg = fixErr instanceof Error ? fixErr.message : String(fixErr);
            errors.push(`h2h_norm fixture ${fix?.fixture?.id}: ${msg}`);
          }
        }

        // Mark raw as transformed
        await supabase
          .from("af_h2h_raw")
          .update({ transform_status: "transformed" })
          .eq("response_hash", hash);

        // Update provider health
        await supabase
          .from("af_provider_feeds")
          .update({ last_success_at: new Date().toISOString() })
          .eq("feed_key", "af_h2h");

      } catch (pairErr: unknown) {
        const msg = pairErr instanceof Error ? pairErr.message : String(pairErr);
        errors.push(`pair ${t1}-${t2}: ${msg}`);
      }

      // Rate limit safety — 300ms between pairs
      await new Promise((r) => setTimeout(r, 300));
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    if (logId) {
      await supabase
        .schema("model_lab")
        .from("enrichment_sync_log")
        .update({
          completed_at: completedAt.toISOString(),
          status: errors.length > 0 && rowsInserted === 0 && rowsUpdated === 0 ? "failed" : "completed",
          leagues_seen: pairs.length,
          rows_inserted: rowsInserted,
          rows_updated: rowsUpdated,
          errors_json: errors.slice(0, 20).map((e) => e.slice(0, 200)),
          duration_ms: durationMs,
        })
        .eq("id", logId);
    }

    return new Response(JSON.stringify({
      sync_type: "h2h",
      pairs_processed: pairs.length,
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
      errors: errors.slice(0, 5),
      duration_ms: durationMs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
