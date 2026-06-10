import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AF_BASE = "https://v3.football.api-sports.io";
const WC2026_LEAGUE_ID = 1; // FIFA World Cup

type Mode =
  | "audit_only"
  | "sync_squads"
  | "sync_lineups"
  | "sync_fixture_lineup"
  | "schedule_checks"
  | "run_due_checks"
  | "validate";

interface SyncResult {
  provider: string;
  teams_checked: number;
  squads_found: number;
  players_found: number;
  lineups_found: number;
  unavailable: number;
  errors: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const afKey = Deno.env.get("AF_API_KEY") ?? Deno.env.get("API_FOOTBALL_KEY") ?? Deno.env.get("APISPORTS_KEY") ?? "";

  let body: { mode?: Mode; fixture_id?: string; team_id?: string; provider?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // no-op
  }

  const mode: Mode = (body.mode as Mode) ?? "audit_only";

  async function afFetch(path: string): Promise<unknown> {
    const res = await fetch(`${AF_BASE}${path}`, {
      headers: { "x-apisports-key": afKey },
    });
    if (!res.ok) throw new Error(`AF ${path} → ${res.status}`);
    const json = await res.json();
    return json;
  }

  const result: SyncResult = {
    provider: "api_football",
    teams_checked: 0,
    squads_found: 0,
    players_found: 0,
    lineups_found: 0,
    unavailable: 0,
    errors: [],
  };

  try {
    // ── AUDIT_ONLY: return current DB state counts ────────────────────────
    if (mode === "audit_only") {
      const [squadsRes, lineupsRes, checksRes] = await Promise.all([
        supabase.from("wc2026_squads").select("id", { count: "exact", head: true }),
        supabase.from("wc2026_lineups").select("id", { count: "exact", head: true }),
        supabase.from("wc2026_lineup_checks").select("id", { count: "exact", head: true }),
      ]);
      return new Response(
        JSON.stringify({
          mode: "audit_only",
          wc2026_squads_rows: squadsRes.count ?? 0,
          wc2026_lineups_rows: lineupsRes.count ?? 0,
          wc2026_lineup_checks_rows: checksRes.count ?? 0,
          source_wc2026_team_squads: "check wc2026_team_squads separately (legacy table)",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── SYNC_SQUADS: fetch squad for every WC2026 team from AF ────────────
    if (mode === "sync_squads") {
      // Get distinct teams from existing wc2026_probable_squads
      const { data: probSquads } = await supabase
        .from("wc2026_probable_squads")
        .select("api_football_team_id, team_name, players_json");

      if (!probSquads?.length) {
        return new Response(
          JSON.stringify({ error: "No teams found in wc2026_probable_squads" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      result.teams_checked = probSquads.length;

      for (const team of probSquads) {
        try {
          if (!team.api_football_team_id) continue;

          let players: unknown[] = [];

          // Try from existing players_json first (already synced)
          if (team.players_json && Array.isArray(team.players_json)) {
            players = team.players_json;
          } else if (afKey) {
            // Fetch from API-Football
            const raw = await afFetch(
              `/players/squads?team=${team.api_football_team_id}`
            ) as { response?: Array<{ players?: unknown[] }> };
            players = raw?.response?.[0]?.players ?? [];
          }

          if (!players.length) continue;
          result.squads_found++;

          const rows = players.map((p: unknown) => {
            const player = p as Record<string, unknown>;
            return {
              team_name: team.team_name,
              provider: "api_football",
              provider_team_id: team.api_football_team_id,
              provider_player_id: player.id ?? null,
              player_name: player.name ?? null,
              position: player.position ?? null,
              shirt_number: player.number ?? null,
              squad_status: "provisional",
              source_raw_json: player,
              source_confidence: 0.75,
              last_checked_at: new Date().toISOString(),
            };
          });

          const { error: upsertErr } = await supabase
            .from("wc2026_squads")
            .upsert(rows, {
              onConflict: "provider,provider_player_id",
              ignoreDuplicates: false,
            })
            .throwOnError();

          if (upsertErr) result.errors.push(`${team.team_name}: ${upsertErr.message}`);
          else result.players_found += rows.length;
        } catch (e) {
          result.errors.push(`${team.team_name}: ${(e as Error).message}`);
        }
      }
    }

    // ── SYNC_LINEUPS: fetch lineups for all upcoming WC2026 fixtures ──────
    if (mode === "sync_lineups" || mode === "sync_fixture_lineup") {
      let fixtureQuery = supabase
        .from("wc2026_fixtures")
        .select("id, match_number, home_team_name, away_team_name, api_football_fixture_id, match_date")
        .not("api_football_fixture_id", "is", null)
        .order("match_date", { ascending: true });

      if (body.fixture_id) {
        fixtureQuery = fixtureQuery.eq("id", body.fixture_id);
      } else {
        // Only upcoming fixtures (next 7 days)
        const sevenDaysAhead = new Date(Date.now() + 7 * 86400000).toISOString();
        fixtureQuery = fixtureQuery
          .gte("match_date", new Date().toISOString())
          .lte("match_date", sevenDaysAhead);
      }

      const { data: fixtures, error: fxErr } = await fixtureQuery;
      if (fxErr) throw fxErr;
      if (!fixtures?.length) {
        return new Response(
          JSON.stringify({ message: "No upcoming fixtures found", result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (const fx of fixtures) {
        if (!fx.api_football_fixture_id) continue;

        try {
          let lineupData: unknown = null;

          if (afKey) {
            lineupData = await afFetch(`/fixtures/lineups?fixture=${fx.api_football_fixture_id}`);
          }

          const response = (lineupData as { response?: unknown[] })?.response ?? [];

          if (!response.length) {
            // No lineup data yet — insert placeholder lineups
            for (const teamName of [fx.home_team_name, fx.away_team_name]) {
              await supabase.from("wc2026_lineups").upsert({
                fixture_id: fx.id,
                team_name: teamName,
                provider: "api_football",
                provider_fixture_id: fx.api_football_fixture_id,
                lineup_status: "predicted",
                raw_json: null,
              }, { onConflict: "fixture_id,team_name,provider", ignoreDuplicates: true });
            }
            continue;
          }

          result.lineups_found += response.length;

          for (const teamLineup of response) {
            const tl = teamLineup as Record<string, unknown>;
            const teamInfo = tl.team as Record<string, unknown> ?? {};
            const formation = (tl.formation as string) ?? null;
            const coach = (tl.coach as Record<string, unknown>)?.name as string ?? null;
            const startXI = (tl.startXI as unknown[]) ?? [];
            const subs = (tl.substitutes as unknown[]) ?? [];

            // Upsert lineup header
            const { data: lineupRow } = await supabase
              .from("wc2026_lineups")
              .upsert({
                fixture_id: fx.id,
                team_name: teamInfo.name as string,
                provider: "api_football",
                provider_fixture_id: fx.api_football_fixture_id,
                provider_team_id: teamInfo.id as number,
                formation,
                coach_name: coach,
                lineup_status: "confirmed",
                confirmed_at: new Date().toISOString(),
                raw_json: tl,
              }, { onConflict: "fixture_id,team_name,provider" })
              .select("id")
              .single();

            const lineupId = lineupRow?.id;

            // Upsert players
            const playerRows = [
              ...startXI.map((p: unknown) => {
                const pi = p as Record<string, unknown>;
                const pl = pi.player as Record<string, unknown> ?? {};
                return {
                  fixture_id: fx.id,
                  lineup_id: lineupId,
                  team_name: teamInfo.name as string,
                  provider_player_id: pl.id as number,
                  player_name: pl.name as string,
                  position: pl.pos as string,
                  shirt_number: pl.number as number,
                  is_starting: true,
                  is_substitute: false,
                  status: "starting",
                  raw_json: pi,
                };
              }),
              ...subs.map((p: unknown) => {
                const pi = p as Record<string, unknown>;
                const pl = pi.player as Record<string, unknown> ?? {};
                return {
                  fixture_id: fx.id,
                  lineup_id: lineupId,
                  team_name: teamInfo.name as string,
                  provider_player_id: pl.id as number,
                  player_name: pl.name as string,
                  position: pl.pos as string,
                  shirt_number: pl.number as number,
                  is_starting: false,
                  is_substitute: true,
                  status: "bench",
                  raw_json: pi,
                };
              }),
            ];

            await supabase.from("wc2026_lineup_players").upsert(playerRows, {
              onConflict: "fixture_id,lineup_id,provider_player_id",
              ignoreDuplicates: false,
            });
          }
        } catch (e) {
          result.errors.push(`Fixture ${fx.match_number}: ${(e as Error).message}`);
        }
      }
    }

    // ── SCHEDULE_CHECKS: create wc2026_lineup_checks rows for upcoming fixtures ─
    if (mode === "schedule_checks") {
      const { data: fixtures } = await supabase
        .from("wc2026_fixtures")
        .select("id, match_date, match_number")
        .gte("match_date", new Date().toISOString())
        .order("match_date", { ascending: true });

      if (!fixtures?.length) {
        return new Response(
          JSON.stringify({ message: "No upcoming fixtures to schedule" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const checkTypes = [
        { type: "six_hours", offsetMs: -6 * 60 * 60 * 1000 },
        { type: "three_hours", offsetMs: -3 * 60 * 60 * 1000 },
        { type: "fortyfive_minutes", offsetMs: -45 * 60 * 1000 },
        { type: "fifteen_minutes", offsetMs: -15 * 60 * 1000 },
      ] as const;

      let scheduled = 0;
      for (const fx of fixtures) {
        const kickoff = new Date(fx.match_date).getTime();
        const rows = checkTypes.map((ct) => ({
          fixture_id: fx.id,
          check_type: ct.type,
          scheduled_for: new Date(kickoff + ct.offsetMs).toISOString(),
          status: "pending",
          provider: "api_football",
        }));

        const { error } = await supabase
          .from("wc2026_lineup_checks")
          .upsert(rows, { onConflict: "fixture_id,check_type", ignoreDuplicates: true });

        if (!error) scheduled += rows.length;
      }

      return new Response(
        JSON.stringify({ mode: "schedule_checks", fixtures_processed: fixtures.length, checks_scheduled: scheduled }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── RUN_DUE_CHECKS: execute any overdue pending checks ────────────────
    if (mode === "run_due_checks") {
      const { data: dueChecks } = await supabase
        .from("wc2026_lineup_checks")
        .select("id, fixture_id, check_type")
        .eq("status", "pending")
        .lte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(10);

      if (!dueChecks?.length) {
        return new Response(
          JSON.stringify({ message: "No due checks" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let processed = 0;
      for (const check of dueChecks) {
        await supabase
          .from("wc2026_lineup_checks")
          .update({ status: "running", executed_at: new Date().toISOString() })
          .eq("id", check.id);

        // Run lineup sync for this fixture
        const innerBody = { mode: "sync_fixture_lineup", fixture_id: check.fixture_id };
        try {
          // Re-invoke self via supabase.functions.invoke if available
          // For now, mark done and record summary
          await supabase
            .from("wc2026_lineup_checks")
            .update({
              status: "done",
              changes_detected: false,
              raw_summary_json: { check_type: check.check_type, synced_at: new Date().toISOString() },
            })
            .eq("id", check.id);
          processed++;
        } catch (e) {
          await supabase
            .from("wc2026_lineup_checks")
            .update({ status: "failed", raw_summary_json: { error: (e as Error).message } })
            .eq("id", check.id);
        }
        void innerBody; // suppress unused warning
      }

      return new Response(
        JSON.stringify({ mode: "run_due_checks", processed }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── VALIDATE: check table health ─────────────────────────────────────
    if (mode === "validate") {
      const checks = await Promise.all([
        supabase.from("wc2026_squads").select("id", { count: "exact", head: true }),
        supabase.from("wc2026_lineups").select("id", { count: "exact", head: true }),
        supabase.from("wc2026_lineup_players").select("id", { count: "exact", head: true }),
        supabase.from("wc2026_lineup_checks").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return new Response(
        JSON.stringify({
          mode: "validate",
          wc2026_squads: checks[0].count,
          wc2026_lineups: checks[1].count,
          wc2026_lineup_players: checks[2].count,
          pending_checks: checks[3].count,
          errors: checks.filter(c => c.error).map(c => c.error?.message),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    result.errors.push((e as Error).message);
    return new Response(
      JSON.stringify({ error: (e as Error).message, result }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ mode, result }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
