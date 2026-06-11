import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Internal-Secret",
};

const AF_BASE = "https://v3.football.api-sports.io";
const SM_BASE = "https://api.sportmonks.com/v3";

const AF_FIXTURE_ID = 1489369;
const AF_MEX_TEAM_ID = 16;
const AF_RSA_TEAM_ID = 1531;
const WC_LEAGUE_ID = 1;
const WC_SEASON = 2026;
const KICKOFF_DATE = "2026-06-11";

async function afFetch(path: string, key: string): Promise<unknown> {
  const res = await fetch(`${AF_BASE}${path}`, {
    headers: { "x-apisports-key": key, "Accept": "application/json" },
  });
  return res.json();
}

async function smFetch(path: string, key: string): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${SM_BASE}${path}${sep}api_token=${key}`);
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const afKey = Deno.env.get("API_FOOTBALL_KEY") ?? "";
  const smKey = Deno.env.get("SPORTMONKS_API_KEY") ?? "";

  if (!afKey) {
    return new Response(JSON.stringify({ error: "API_FOOTBALL_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const audit: Record<string, unknown> = {
    audit_started: new Date().toISOString(),
    fixture_id: "eb0a1f0b-6a8a-454f-8706-6bbedcd77fe4",
    af_fixture_id: AF_FIXTURE_ID,
  };

  // ── PHASE 1: AF Fixture details ───────────────────────────────────────────
  let afFixture: Record<string, unknown> = {};
  let afFixtureRaw: unknown = null;
  try {
    afFixtureRaw = await afFetch(`/fixtures?id=${AF_FIXTURE_ID}`, afKey);
    const r = (afFixtureRaw as { response?: unknown[] }).response?.[0] as Record<string, unknown> ?? {};
    const fx = r.fixture as Record<string, unknown> ?? {};
    const teams = r.teams as Record<string, unknown> ?? {};
    const venue = fx.venue as Record<string, unknown> ?? {};
    const homeTeam = (teams.home as Record<string, unknown>) ?? {};
    const awayTeam = (teams.away as Record<string, unknown>) ?? {};
    const score = r.score as Record<string, unknown> ?? {};
    afFixture = {
      status: (fx.status as Record<string, unknown>)?.long,
      status_short: (fx.status as Record<string, unknown>)?.short,
      kickoff_utc: fx.date,
      timestamp: fx.timestamp,
      venue_name: venue.name,
      venue_city: venue.city,
      referee: fx.referee,
      home_team: homeTeam.name,
      home_team_id: homeTeam.id,
      away_team: awayTeam.name,
      away_team_id: awayTeam.id,
      score_halftime: (score.halftime as Record<string, unknown>),
      score_fulltime: (score.fulltime as Record<string, unknown>),
    };
  } catch (e) {
    audit.af_fixture_error = String(e);
  }
  audit.af_fixture = afFixture;

  // ── PHASE 2: AF Lineups ───────────────────────────────────────────────────
  let afLineups: unknown = null;
  let afLineupsError: string | null = null;
  try {
    const raw = await afFetch(`/fixtures/lineups?fixture=${AF_FIXTURE_ID}`, afKey) as { response?: unknown[] };
    const lineups = raw.response ?? [];
    if (lineups.length === 0) {
      afLineupsError = "EMPTY — no lineups returned yet";
    } else {
      afLineups = lineups.map((team: unknown) => {
        const t = team as Record<string, unknown>;
        const teamInfo = t.team as Record<string, unknown> ?? {};
        const coach = t.coach as Record<string, unknown> ?? {};
        const startXI = (t.startXI as unknown[]) ?? [];
        const subs = (t.substitutes as unknown[]) ?? [];
        return {
          team_name: teamInfo.name,
          team_id: teamInfo.id,
          formation: t.formation,
          coach: coach.name,
          starting_xi_count: startXI.length,
          starting_xi: startXI.map((p: unknown) => {
            const player = ((p as Record<string, unknown>).player as Record<string, unknown>) ?? {};
            return { id: player.id, name: player.name, number: player.number, pos: player.pos, grid: player.grid };
          }),
          substitutes_count: subs.length,
          substitutes: subs.map((p: unknown) => {
            const player = ((p as Record<string, unknown>).player as Record<string, unknown>) ?? {};
            return { id: player.id, name: player.name, number: player.number, pos: player.pos };
          }),
        };
      });
    }
  } catch (e) {
    afLineupsError = String(e);
  }
  audit.af_lineups = afLineups;
  audit.af_lineups_error = afLineupsError;

  // ── PHASE 3: AF Injuries - Mexico ────────────────────────────────────────
  let afInjuriesMex: unknown[] = [];
  let afInjuriesMexError: string | null = null;
  try {
    const raw = await afFetch(`/injuries?team=${AF_MEX_TEAM_ID}&season=${WC_SEASON}`, afKey) as { response?: unknown[]; errors?: unknown };
    const errs = raw.errors;
    const hasErr = Array.isArray(errs) ? errs.length > 0 : Object.keys(errs ?? {}).length > 0;
    if (hasErr) {
      afInjuriesMexError = JSON.stringify(errs);
    } else {
      afInjuriesMex = (raw.response ?? []).map((e: unknown) => {
        const entry = e as Record<string, unknown>;
        const player = entry.player as Record<string, unknown> ?? {};
        const fixture = entry.fixture as Record<string, unknown> ?? {};
        return {
          player_id: player.id,
          player_name: player.name,
          position: player.position,
          type: player.type,
          reason: player.reason,
          fixture_id: fixture.id,
          fixture_date: fixture.date,
        };
      });
    }
  } catch (e) {
    afInjuriesMexError = String(e);
  }
  audit.af_injuries_mexico = { count: afInjuriesMex.length, players: afInjuriesMex, error: afInjuriesMexError };

  // ── PHASE 4: AF Injuries - South Africa ──────────────────────────────────
  let afInjuriesRsa: unknown[] = [];
  let afInjuriesRsaError: string | null = null;
  try {
    await new Promise((r) => setTimeout(r, 1200));
    const raw = await afFetch(`/injuries?team=${AF_RSA_TEAM_ID}&season=${WC_SEASON}`, afKey) as { response?: unknown[]; errors?: unknown };
    const errs = raw.errors;
    const hasErr = Array.isArray(errs) ? errs.length > 0 : Object.keys(errs ?? {}).length > 0;
    if (hasErr) {
      afInjuriesRsaError = JSON.stringify(errs);
    } else {
      afInjuriesRsa = (raw.response ?? []).map((e: unknown) => {
        const entry = e as Record<string, unknown>;
        const player = entry.player as Record<string, unknown> ?? {};
        const fixture = entry.fixture as Record<string, unknown> ?? {};
        return {
          player_id: player.id,
          player_name: player.name,
          position: player.position,
          type: player.type,
          reason: player.reason,
          fixture_id: fixture.id,
          fixture_date: fixture.date,
        };
      });
    }
  } catch (e) {
    afInjuriesRsaError = String(e);
  }
  audit.af_injuries_south_africa = { count: afInjuriesRsa.length, players: afInjuriesRsa, error: afInjuriesRsaError };

  // ── PHASE 5: AF Player Stats - Mexico ────────────────────────────────────
  let afPlayerStatsMex: unknown[] = [];
  let afPlayerStatsMexError: string | null = null;
  try {
    await new Promise((r) => setTimeout(r, 1200));
    const raw = await afFetch(
      `/players?team=${AF_MEX_TEAM_ID}&season=${WC_SEASON}&league=${WC_LEAGUE_ID}`,
      afKey
    ) as { response?: unknown[]; errors?: unknown; paging?: unknown };

    const errs = raw.errors;
    const hasErr = Array.isArray(errs) ? errs.length > 0 : Object.keys(errs ?? {}).length > 0;
    if (hasErr) {
      afPlayerStatsMexError = JSON.stringify(errs);
    } else {
      afPlayerStatsMex = (raw.response ?? []).map((e: unknown) => {
        const entry = e as Record<string, unknown>;
        const player = entry.player as Record<string, unknown> ?? {};
        const stats = ((entry.statistics as unknown[])?.[0] as Record<string, unknown>) ?? {};
        const games = stats.games as Record<string, unknown> ?? {};
        const goals = stats.goals as Record<string, unknown> ?? {};
        const shots = stats.shots as Record<string, unknown> ?? {};
        const passes = stats.passes as Record<string, unknown> ?? {};
        const cards = stats.cards as Record<string, unknown> ?? {};
        const dribbles = stats.dribbles as Record<string, unknown> ?? {};
        const tackles = stats.tackles as Record<string, unknown> ?? {};
        return {
          player_id: player.id,
          player_name: player.name,
          age: player.age,
          nationality: player.nationality,
          position: games.position,
          appearances: games.appearences,
          minutes: games.minutes,
          rating: games.rating,
          goals: goals.total,
          assists: goals.assists,
          shots_total: shots.total,
          shots_on: shots.on,
          passes_total: passes.total,
          passes_key: passes.key,
          passes_accuracy: passes.accuracy,
          dribbles_attempts: dribbles.attempts,
          dribbles_success: dribbles.success,
          tackles_total: tackles.total,
          yellow_cards: cards.yellow,
          red_cards: cards.red,
        };
      });
    }
  } catch (e) {
    afPlayerStatsMexError = String(e);
  }
  audit.af_player_stats_mexico = {
    count: afPlayerStatsMex.length,
    players: afPlayerStatsMex.slice(0, 26),
    error: afPlayerStatsMexError,
  };

  // ── PHASE 6: AF Player Stats - South Africa ───────────────────────────────
  let afPlayerStatsRsa: unknown[] = [];
  let afPlayerStatsRsaError: string | null = null;
  try {
    await new Promise((r) => setTimeout(r, 1200));
    const raw = await afFetch(
      `/players?team=${AF_RSA_TEAM_ID}&season=${WC_SEASON}&league=${WC_LEAGUE_ID}`,
      afKey
    ) as { response?: unknown[]; errors?: unknown };

    const errs = raw.errors;
    const hasErr = Array.isArray(errs) ? errs.length > 0 : Object.keys(errs ?? {}).length > 0;
    if (hasErr) {
      afPlayerStatsRsaError = JSON.stringify(errs);
    } else {
      afPlayerStatsRsa = (raw.response ?? []).map((e: unknown) => {
        const entry = e as Record<string, unknown>;
        const player = entry.player as Record<string, unknown> ?? {};
        const stats = ((entry.statistics as unknown[])?.[0] as Record<string, unknown>) ?? {};
        const games = stats.games as Record<string, unknown> ?? {};
        const goals = stats.goals as Record<string, unknown> ?? {};
        const shots = stats.shots as Record<string, unknown> ?? {};
        const cards = stats.cards as Record<string, unknown> ?? {};
        return {
          player_id: player.id,
          player_name: player.name,
          age: player.age,
          nationality: player.nationality,
          position: games.position,
          appearances: games.appearences,
          minutes: games.minutes,
          rating: games.rating,
          goals: goals.total,
          assists: goals.assists,
          shots_total: shots.total,
          shots_on: shots.on,
          yellow_cards: cards.yellow,
          red_cards: cards.red,
        };
      });
    }
  } catch (e) {
    afPlayerStatsRsaError = String(e);
  }
  audit.af_player_stats_south_africa = {
    count: afPlayerStatsRsa.length,
    players: afPlayerStatsRsa.slice(0, 26),
    error: afPlayerStatsRsaError,
  };

  // ── PHASE 7: Sportmonks fixture mapping ───────────────────────────────────
  let smFixtureData: unknown = null;
  let smFixtureError: string | null = null;
  let smFixtureId: number | null = null;
  if (smKey) {
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const raw = await smFetch(
        `/football/fixtures/date/${KICKOFF_DATE}?include=participants&per_page=50`,
        smKey
      ) as { data?: unknown[]; errors?: unknown };

      if (raw.errors) {
        smFixtureError = JSON.stringify(raw.errors);
      } else {
        const fixtures = raw.data ?? [];
        const MEX_ALIASES = ["mexico", "meksika", "méxico"];
        const RSA_ALIASES = ["south africa", "güney afrika", "southafrica"];
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

        for (const fx of fixtures as Array<Record<string, unknown>>) {
          const participants = (fx.participants as Array<Record<string, unknown>>) ?? [];
          const names = participants.map((p) => norm(String(p.name ?? "")));
          const hasMex = MEX_ALIASES.some((a) => names.some((n) => n.includes(norm(a))));
          const hasRsa = RSA_ALIASES.some((a) => names.some((n) => n.includes(norm(a))));
          if (hasMex && hasRsa) {
            smFixtureId = fx.id as number;
            smFixtureData = {
              sportmonks_fixture_id: fx.id,
              name: fx.name,
              starting_at: fx.starting_at,
              result_info: fx.result_info,
              leg: fx.leg,
              participants: participants.map((p) => ({
                id: p.id,
                name: p.name,
                meta: (p.meta as Record<string, unknown>),
              })),
            };
            break;
          }
        }
        if (!smFixtureId) {
          smFixtureError = `No Mexico vs South Africa fixture found on ${KICKOFF_DATE} (total fixtures: ${fixtures.length})`;
        }
      }
    } catch (e) {
      smFixtureError = String(e);
    }
  } else {
    smFixtureError = "SPORTMONKS_API_KEY not configured";
  }
  audit.sm_fixture = smFixtureData;
  audit.sm_fixture_id = smFixtureId;
  audit.sm_fixture_error = smFixtureError;

  // ── PHASE 8: Sportmonks prematch odds ─────────────────────────────────────
  let smOdds: unknown = null;
  let smOddsError: string | null = null;
  if (smKey && smFixtureId) {
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const raw = await smFetch(
        `/football/odds/pre-match/fixtures/${smFixtureId}?include=bookmaker;market&per_page=100`,
        smKey
      ) as { data?: unknown[]; errors?: unknown };

      if (raw.errors) {
        smOddsError = JSON.stringify(raw.errors);
      } else {
        const oddsData = raw.data ?? [];
        // Extract 1X2 entries
        const oneX2: Array<Record<string, unknown>> = [];
        for (const entry of oddsData as Array<Record<string, unknown>>) {
          const marketInfo = entry.market as Record<string, unknown> ?? {};
          const marketName = String(marketInfo.name ?? entry.market_description ?? "").toLowerCase();
          if (marketName.includes("1x2") || marketName.includes("match winner") || marketName.includes("full time")) {
            oneX2.push({
              bookmaker: (entry.bookmaker as Record<string, unknown>)?.name ?? entry.bookmaker_id,
              market: marketName,
              label: entry.label ?? entry.name,
              value: entry.value ?? entry.odd,
            });
          }
        }
        smOdds = {
          total_entries: oddsData.length,
          one_x2_entries: oneX2.length,
          one_x2_sample: oneX2.slice(0, 30),
        };
      }
    } catch (e) {
      smOddsError = String(e);
    }
  } else if (!smKey) {
    smOddsError = "SPORTMONKS_API_KEY not configured";
  } else {
    smOddsError = "Skipped — no Sportmonks fixture ID";
  }
  audit.sm_prematch_odds = smOdds;
  audit.sm_odds_error = smOddsError;

  // ── PHASE 9: Sportmonks lineups ───────────────────────────────────────────
  let smLineups: unknown = null;
  let smLineupsError: string | null = null;
  if (smKey && smFixtureId) {
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const raw = await smFetch(
        `/football/fixtures/${smFixtureId}?include=lineups.player;lineups.details;participants`,
        smKey
      ) as { data?: Record<string, unknown>; errors?: unknown };

      if (raw.errors) {
        smLineupsError = JSON.stringify(raw.errors);
      } else {
        const fxData = raw.data ?? {};
        const lineups = (fxData.lineups as unknown[]) ?? [];
        if (lineups.length === 0) {
          smLineupsError = "EMPTY — no lineups available yet from Sportmonks";
        } else {
          smLineups = {
            lineup_entries: lineups.length,
            entries: lineups.slice(0, 50),
          };
        }
      }
    } catch (e) {
      smLineupsError = String(e);
    }
  } else {
    smLineupsError = !smKey ? "SPORTMONKS_API_KEY not configured" : "Skipped — no SM fixture ID";
  }
  audit.sm_lineups = smLineups;
  audit.sm_lineups_error = smLineupsError;

  // ── PHASE 10: Sportmonks player stats (for Mexico) ───────────────────────
  // Sportmonks team search via participants (we have SM team IDs from fixture map)
  let smTeamIds: { mex: number | null; rsa: number | null } = { mex: null, rsa: null };
  if (smFixtureData) {
    const participants = (smFixtureData as Record<string, unknown>).participants as Array<Record<string, unknown>> ?? [];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
    for (const p of participants) {
      const n = norm(String(p.name ?? ""));
      if (n.includes("mexico") || n.includes("mex")) smTeamIds.mex = p.id as number;
      if (n.includes("southafrica") || n.includes("africa")) smTeamIds.rsa = p.id as number;
    }
  }
  audit.sm_team_ids = smTeamIds;

  audit.audit_completed = new Date().toISOString();

  return new Response(JSON.stringify(audit, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
