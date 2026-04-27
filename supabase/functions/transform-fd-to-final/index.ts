import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SOURCE_PROVIDER = "football-data.co.uk";
const DEFAULT_BATCH_SIZE = 200;
const LEAGUE_COMP_MAP: Record<string, string> = {
  T1: "T1", E0: "PL", E1: "ELC", E2: "EL1", E3: "EL2",
  SP1: "LL", SP2: "SD", D1: "BL", D2: "BL2",
  I1: "SA", I2: "SB", F1: "L1", F2: "L2",
  N1: "ED", P1: "PPL", B1: "JPL", SC0: "SPL", G1: "SL",
};

const STAGING_SELECT = [
  "id", "league_code", "season_code", "deterministic_source_match_id",
  "match_date", "match_time", "home_team", "away_team",
  "fthg", "ftag", "ftr", "hthg", "htag", "htr", "referee",
  "hs", "as_col", "hst", "ast", "hf", "af", "hc", "ac", "hy", "ay", "hr", "ar",
  "b365h", "b365d", "b365a", "bwh", "bwd", "bwa",
  "iwh", "iwd", "iwa", "psh", "psd", "psa",
  "whh", "whd", "wha", "vch", "vcd", "vca",
  "b365ch", "b365cd", "b365ca", "bwch", "bwcd", "bwca",
  "iwch", "iwcd", "iwca", "psch", "pscd", "psca",
  "whch", "whcd", "whca", "vcch", "vccd", "vcca",
  "b365_over_2_5", "b365_under_2_5", "p_over_2_5", "p_under_2_5",
  "bbmx_over_2_5", "bbav_over_2_5", "bbmx_under_2_5", "bbav_under_2_5",
  "bbahh", "bbmxahh", "bbavahh", "bbmxaha", "bbavaha", "psch_ah", "psca_ah",
].join(",");

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function derive1x2(hg: number, ag: number): "1" | "X" | "2" {
  if (hg > ag) return "1";
  if (hg === ag) return "X";
  return "2";
}

interface StagingRow {
  id: number;
  league_code: string;
  season_code: string;
  deterministic_source_match_id: string;
  match_date: string | null;
  match_time: string | null;
  home_team: string;
  away_team: string;
  fthg: number | null;
  ftag: number | null;
  ftr: string | null;
  hthg: number | null;
  htag: number | null;
  htr: string | null;
  referee: string | null;
  hs: number | null;
  as_col: number | null;
  hst: number | null;
  ast: number | null;
  hf: number | null;
  af: number | null;
  hc: number | null;
  ac: number | null;
  hy: number | null;
  ay: number | null;
  hr: number | null;
  ar: number | null;
  b365h: number | null; b365d: number | null; b365a: number | null;
  bwh: number | null; bwd: number | null; bwa: number | null;
  iwh: number | null; iwd: number | null; iwa: number | null;
  psh: number | null; psd: number | null; psa: number | null;
  whh: number | null; whd: number | null; wha: number | null;
  vch: number | null; vcd: number | null; vca: number | null;
  b365ch: number | null; b365cd: number | null; b365ca: number | null;
  bwch: number | null; bwcd: number | null; bwca: number | null;
  iwch: number | null; iwcd: number | null; iwca: number | null;
  psch: number | null; pscd: number | null; psca: number | null;
  whch: number | null; whcd: number | null; whca: number | null;
  vcch: number | null; vccd: number | null; vcca: number | null;
  b365_over_2_5: number | null; b365_under_2_5: number | null;
  p_over_2_5: number | null; p_under_2_5: number | null;
  bbmx_over_2_5: number | null; bbav_over_2_5: number | null;
  bbmx_under_2_5: number | null; bbav_under_2_5: number | null;
  bbahh: number | null;
  bbmxahh: number | null; bbavahh: number | null;
  bbmxaha: number | null; bbavaha: number | null;
  psch_ah: number | null; psca_ah: number | null;
}

function buildKickoffAt(matchDate: string | null, matchTime: string | null): string | null {
  if (!matchDate) return null;
  const time = matchTime || "15:00";
  return `${matchDate}T${time}:00+03:00`;
}

function avgOf(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null && v > 0);
  if (valid.length === 0) return null;
  return parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(4));
}

function maxOf(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null && v > 0);
  if (valid.length === 0) return null;
  return Math.max(...valid);
}

function buildClosingOdds(r: StagingRow): Record<string, unknown> | null {
  const entries: Record<string, { home: number; draw: number; away: number }> = {};
  const books: [string, number | null, number | null, number | null][] = [
    ["bet365", r.b365ch, r.b365cd, r.b365ca],
    ["betwin", r.bwch, r.bwcd, r.bwca],
    ["interwetten", r.iwch, r.iwcd, r.iwca],
    ["pinnacle", r.psch, r.pscd, r.psca],
    ["williamhill", r.whch, r.whcd, r.whca],
    ["vcbet", r.vcch, r.vccd, r.vcca],
  ];
  for (const [name, h, d, a] of books) {
    if (h && d && a) entries[name] = { home: h, draw: d, away: a };
  }
  if (Object.keys(entries).length === 0) return null;
  return entries;
}

function buildAsianHandicap(r: StagingRow): Record<string, unknown> | null {
  const line = r.bbahh;
  if (line === null) return null;
  const obj: Record<string, unknown> = { line };
  if (r.bbmxahh !== null) obj.max_home = r.bbmxahh;
  if (r.bbavahh !== null) obj.avg_home = r.bbavahh;
  if (r.bbmxaha !== null) obj.max_away = r.bbmxaha;
  if (r.bbavaha !== null) obj.avg_away = r.bbavaha;
  if (r.psch_ah !== null) obj.pinnacle_home = r.psch_ah;
  if (r.psca_ah !== null) obj.pinnacle_away = r.psca_ah;
  return obj;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = getSupabase();
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const batchSize = parseInt(url.searchParams.get("batch_size") || String(DEFAULT_BATCH_SIZE), 10);
    const leagueFilter = url.searchParams.get("league_code")?.toUpperCase() || null;
    const seasonFilter = url.searchParams.get("season_code") || null;

    const log: string[] = [];
    const errors: string[] = [];
    let matchesUpserted = 0;
    let outcomesUpserted = 0;
    let rowsMarkedProcessed = 0;
    let rowsSkippedTeam = 0;
    let rowsSkippedSeason = 0;
    let rowsSkippedNoScore = 0;

    log.push(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
    log.push(`Batch size: ${batchSize}`);
    if (leagueFilter) log.push(`League filter: ${leagueFilter}`);
    if (seasonFilter) log.push(`Season filter: ${seasonFilter}`);

    // ─── STEP 1: Fetch unprocessed staging rows ───

    let query = supabase
      .from("staging_football_data_uk_raw")
      .select(STAGING_SELECT)
      .eq("is_processed", false)
      .not("home_team", "is", null)
      .not("away_team", "is", null)
      .not("match_date", "is", null)
      .order("match_date", { ascending: true })
      .limit(batchSize);

    if (leagueFilter) query = query.eq("league_code", leagueFilter);
    if (seasonFilter) query = query.eq("season_code", seasonFilter);

    const { data: stagingRows, error: fetchErr } = await query;

    if (fetchErr) throw new Error(`Staging fetch error: ${fetchErr.message}`);
    if (!stagingRows || stagingRows.length === 0) {
      return new Response(
        JSON.stringify({ dry_run: dryRun, message: "No unprocessed staging rows found.", log }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log.push(`Staging rows fetched: ${stagingRows.length}`);

    // ─── STEP 2: Build team name -> UUID lookup ───

    const allTeamNames = new Set<string>();
    for (const row of stagingRows as StagingRow[]) {
      allTeamNames.add(row.home_team);
      allTeamNames.add(row.away_team);
    }

    const { data: teamsData, error: teamsErr } = await supabase
      .from("teams")
      .select("id,name")
      .in("name", [...allTeamNames]);

    if (teamsErr) throw new Error(`Teams fetch error: ${teamsErr.message}`);

    const teamNameToId = new Map<string, string>();
    for (const t of teamsData ?? []) teamNameToId.set(t.name, t.id);

    log.push(`Teams resolved: ${teamNameToId.size} of ${allTeamNames.size}`);

    const unmappedTeams = [...allTeamNames].filter((n) => !teamNameToId.has(n));
    if (unmappedTeams.length > 0) log.push(`Unmapped teams: ${unmappedTeams.join(", ")}`);

    // ─── STEP 3: Build competition_season lookup ───

    const neededCompCodes = new Set<string>();
    for (const row of stagingRows as StagingRow[]) {
      neededCompCodes.add(LEAGUE_COMP_MAP[row.league_code] || row.league_code);
    }

    const { data: comps } = await supabase
      .from("competitions")
      .select("id,code")
      .in("code", [...neededCompCodes]);

    const compCodeToId = new Map<string, string>();
    for (const c of comps ?? []) compCodeToId.set(c.code, c.id);

    const { data: seasons } = await supabase
      .from("competition_seasons")
      .select("id,competition_id,season_code");

    const seasonLookup = new Map<string, string>();
    for (const s of seasons ?? []) {
      for (const [code, compId] of compCodeToId) {
        if (s.competition_id === compId) {
          seasonLookup.set(`${code}|${s.season_code}`, s.id);
        }
      }
    }

    log.push(`Competition seasons resolved: ${seasonLookup.size}`);

    // ─── STEP 4: Process each staging row ───

    const processedIds: number[] = [];
    const matchUpsertBatch: Record<string, unknown>[] = [];
    const outcomeEntries: { stagingId: number; sourceMatchId: string; row: StagingRow }[] = [];

    for (const row of stagingRows as StagingRow[]) {
      const homeTeamId = teamNameToId.get(row.home_team);
      const awayTeamId = teamNameToId.get(row.away_team);

      if (!homeTeamId || !awayTeamId) {
        rowsSkippedTeam++;
        errors.push(`Row ${row.id}: Team not found — "${row.home_team}" or "${row.away_team}"`);
        continue;
      }

      const compCode = LEAGUE_COMP_MAP[row.league_code] || row.league_code;
      const seasonId = seasonLookup.get(`${compCode}|${row.season_code}`);

      if (!seasonId) {
        rowsSkippedSeason++;
        errors.push(`Row ${row.id}: Season not found — comp=${compCode} season=${row.season_code}`);
        continue;
      }

      const hasScore = row.fthg !== null && row.ftag !== null;
      const kickoffAt = buildKickoffAt(row.match_date, row.match_time);

      matchUpsertBatch.push({
        competition_season_id: seasonId,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_at: kickoffAt,
        status: hasScore ? "finished" : "scheduled",
        home_goals_ft: row.fthg,
        away_goals_ft: row.ftag,
        home_goals_ht: row.hthg,
        away_goals_ht: row.htag,
        referee_name: row.referee || null,
        source_provider: SOURCE_PROVIDER,
        source_match_id: row.deterministic_source_match_id,
        ingested_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      });

      if (hasScore) {
        outcomeEntries.push({ stagingId: row.id, sourceMatchId: row.deterministic_source_match_id, row });
      } else {
        rowsSkippedNoScore++;
      }
      processedIds.push(row.id);
    }

    log.push(`Ready to upsert: ${matchUpsertBatch.length} matches, ${outcomeEntries.length} outcomes`);
    log.push(`Skipped: ${rowsSkippedTeam} (team), ${rowsSkippedSeason} (season), ${rowsSkippedNoScore} (no score)`);

    // ─── STEP 5: Upsert matches ───

    if (!dryRun && matchUpsertBatch.length > 0) {
      const UPSERT_BATCH = 100;
      for (let i = 0; i < matchUpsertBatch.length; i += UPSERT_BATCH) {
        const batch = matchUpsertBatch.slice(i, i + UPSERT_BATCH);
        const { error: matchErr, count } = await supabase
          .from("matches")
          .upsert(batch, { onConflict: "source_provider,source_match_id", ignoreDuplicates: false, count: "exact" });

        if (matchErr) {
          errors.push(`Match upsert batch ${Math.floor(i / UPSERT_BATCH) + 1}: ${matchErr.message}`);
        } else {
          matchesUpserted += count ?? batch.length;
        }
      }
      log.push(`Matches upserted: ${matchesUpserted}`);
    }

    // ─── STEP 6: Resolve match IDs & upsert actual_outcomes ───

    if (!dryRun && outcomeEntries.length > 0) {
      const sourceMatchIds = outcomeEntries.map((o) => o.sourceMatchId);
      const CHUNK = 200;
      const matchIdMap = new Map<string, string>();

      for (let i = 0; i < sourceMatchIds.length; i += CHUNK) {
        const chunk = sourceMatchIds.slice(i, i + CHUNK);
        const { data: matchRows } = await supabase
          .from("matches")
          .select("id,source_match_id")
          .eq("source_provider", SOURCE_PROVIDER)
          .in("source_match_id", chunk);
        for (const m of matchRows ?? []) matchIdMap.set(m.source_match_id, m.id);
      }

      log.push(`Match IDs resolved for outcomes: ${matchIdMap.size}`);

      const outcomePayloads: Record<string, unknown>[] = [];

      for (const entry of outcomeEntries) {
        const matchId = matchIdMap.get(entry.sourceMatchId);
        if (!matchId) {
          errors.push(`Row ${entry.stagingId}: Could not resolve match ID for ${entry.sourceMatchId}`);
          continue;
        }

        const r = entry.row;
        const hg = r.fthg!;
        const ag = r.ftag!;
        const totalGoals = hg + ag;
        const totalYellow = (r.hy ?? 0) + (r.ay ?? 0);
        const totalRed = (r.hr ?? 0) + (r.ar ?? 0);
        const totalCorners = (r.hc !== null && r.ac !== null) ? r.hc + r.ac : null;

        const openHome = [r.b365h, r.bwh, r.iwh, r.psh, r.whh, r.vch];
        const openDraw = [r.b365d, r.bwd, r.iwd, r.psd, r.whd, r.vcd];
        const openAway = [r.b365a, r.bwa, r.iwa, r.psa, r.wha, r.vca];

        const overVals = [r.b365_over_2_5, r.p_over_2_5, r.bbav_over_2_5];
        const underVals = [r.b365_under_2_5, r.p_under_2_5, r.bbav_under_2_5];

        outcomePayloads.push({
          match_id: matchId,
          version: 1,
          is_current: true,
          result_1x2: derive1x2(hg, ag),
          total_goals: totalGoals,
          home_goals: hg,
          away_goals: ag,
          over_0_5: totalGoals > 0,
          over_1_5: totalGoals > 1,
          over_2_5: totalGoals > 2,
          over_3_5: totalGoals > 3,
          over_4_5: totalGoals > 4,
          both_teams_scored: hg > 0 && ag > 0,
          clean_sheet_home: ag === 0,
          clean_sheet_away: hg === 0,
          ht_result: r.htr || null,
          home_shots: r.hs,
          away_shots: r.as_col,
          home_shots_on_target: r.hst,
          away_shots_on_target: r.ast,
          home_fouls: r.hf,
          away_fouls: r.af,
          home_yellow_cards: r.hy,
          away_yellow_cards: r.ay,
          home_red_cards: r.hr,
          away_red_cards: r.ar,
          home_corners: r.hc,
          away_corners: r.ac,
          total_yellow_cards: totalYellow,
          total_red_cards: totalRed,
          total_corners: totalCorners,
          derivation_source: "provider_direct",
          derivation_notes: "football-data.co.uk staging transform",
          avg_odds_home: avgOf(openHome),
          avg_odds_draw: avgOf(openDraw),
          avg_odds_away: avgOf(openAway),
          max_odds_home: maxOf(openHome),
          max_odds_draw: maxOf(openDraw),
          max_odds_away: maxOf(openAway),
          odds_over_2_5: avgOf(overVals),
          odds_under_2_5: avgOf(underVals),
          closing_odds: buildClosingOdds(r),
          asian_handicap: buildAsianHandicap(r),
          updated_at: new Date().toISOString(),
        });
      }

      const OUTCOME_BATCH = 100;
      for (let i = 0; i < outcomePayloads.length; i += OUTCOME_BATCH) {
        const batch = outcomePayloads.slice(i, i + OUTCOME_BATCH);
        const { error: outcomeErr, count } = await supabase
          .from("actual_outcomes")
          .upsert(batch, { onConflict: "match_id,version", ignoreDuplicates: false, count: "exact" });

        if (outcomeErr) {
          errors.push(`Outcome upsert batch ${Math.floor(i / OUTCOME_BATCH) + 1}: ${outcomeErr.message}`);
        } else {
          outcomesUpserted += count ?? batch.length;
        }
      }
      log.push(`Outcomes upserted: ${outcomesUpserted}`);
    }

    // ─── STEP 7: Mark staging rows as processed ───

    if (!dryRun && processedIds.length > 0) {
      const MARK_BATCH = 200;
      for (let i = 0; i < processedIds.length; i += MARK_BATCH) {
        const batch = processedIds.slice(i, i + MARK_BATCH);
        const { error: markErr, count } = await supabase
          .from("staging_football_data_uk_raw")
          .update({ is_processed: true })
          .in("id", batch)
          .select("id", { count: "exact", head: true });

        if (markErr) {
          errors.push(`Mark processed batch ${Math.floor(i / MARK_BATCH) + 1}: ${markErr.message}`);
        } else {
          rowsMarkedProcessed += count ?? batch.length;
        }
      }
      log.push(`Staging rows marked processed: ${rowsMarkedProcessed}`);
    }

    // ─── STEP 8: Report ───

    const report = {
      dry_run: dryRun,
      staging_rows_fetched: (stagingRows as StagingRow[]).length,
      teams_resolved: teamNameToId.size,
      teams_unresolved: unmappedTeams,
      seasons_resolved: seasonLookup.size,
      matches: { ready: matchUpsertBatch.length, upserted: dryRun ? "(dry run)" : matchesUpserted },
      outcomes: { ready: outcomeEntries.length, upserted: dryRun ? "(dry run)" : outcomesUpserted, skipped_no_score: rowsSkippedNoScore },
      staging_marked_processed: dryRun ? "(dry run)" : rowsMarkedProcessed,
      skipped: { team: rowsSkippedTeam, season: rowsSkippedSeason, no_score: rowsSkippedNoScore },
      errors: errors.slice(0, 50),
      error_count: errors.length,
      log,
    };

    return new Response(JSON.stringify(report, null, 2), {
      status: errors.length > 0 && matchesUpserted === 0 ? 207 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
