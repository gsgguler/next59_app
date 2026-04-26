import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    if (values.length < 3) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yy] = parts;
  const year = parseInt(yy, 10);
  const fullYear = year > 99 ? year : year >= 90 ? 1900 + year : 2000 + year;
  return `${fullYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function numOrNull(val: string | undefined): number | null {
  if (!val || val.trim() === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function intOrNull(val: string | undefined): number | null {
  const n = numOrNull(val);
  return n !== null ? Math.round(n) : null;
}

function textOrNull(val: string | undefined): string | null {
  if (!val || val.trim() === "") return null;
  return val.trim();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildRecord(
  row: Record<string, string>,
  sourceFile: string,
  leagueCode: string,
  seasonCode: string,
  rowHash: string,
  deterministicId: string
): Record<string, unknown> {
  return {
    div: textOrNull(row["Div"]),
    match_date: parseDate(row["Date"]),
    match_time: textOrNull(row["Time"]),
    home_team: textOrNull(row["HomeTeam"]),
    away_team: textOrNull(row["AwayTeam"]),
    fthg: intOrNull(row["FTHG"]),
    ftag: intOrNull(row["FTAG"]),
    ftr: textOrNull(row["FTR"]),
    hthg: intOrNull(row["HTHG"]),
    htag: intOrNull(row["HTAG"]),
    htr: textOrNull(row["HTR"]),
    referee: textOrNull(row["Referee"]),
    hs: intOrNull(row["HS"]),
    as_col: intOrNull(row["AS"]),
    hst: intOrNull(row["HST"]),
    ast: intOrNull(row["AST"]),
    hf: intOrNull(row["HF"]),
    af: intOrNull(row["AF"]),
    hc: intOrNull(row["HC"]),
    ac: intOrNull(row["AC"]),
    hy: intOrNull(row["HY"]),
    ay: intOrNull(row["AY"]),
    hr: intOrNull(row["HR"]),
    ar: intOrNull(row["AR"]),
    b365h: numOrNull(row["B365H"]),
    b365d: numOrNull(row["B365D"]),
    b365a: numOrNull(row["B365A"]),
    bwh: numOrNull(row["BWH"]),
    bwd: numOrNull(row["BWD"]),
    bwa: numOrNull(row["BWA"]),
    iwh: numOrNull(row["IWH"]),
    iwd: numOrNull(row["IWD"]),
    iwa: numOrNull(row["IWA"]),
    psh: numOrNull(row["PSH"]),
    psd: numOrNull(row["PSD"]),
    psa: numOrNull(row["PSA"]),
    whh: numOrNull(row["WHH"]),
    whd: numOrNull(row["WHD"]),
    wha: numOrNull(row["WHA"]),
    vch: numOrNull(row["VCH"]),
    vcd: numOrNull(row["VCD"]),
    vca: numOrNull(row["VCA"]),
    b365ch: numOrNull(row["B365CH"]),
    b365cd: numOrNull(row["B365CD"]),
    b365ca: numOrNull(row["B365CA"]),
    bwch: numOrNull(row["BWCH"]),
    bwcd: numOrNull(row["BWCD"]),
    bwca: numOrNull(row["BWCA"]),
    iwch: numOrNull(row["IWCH"]),
    iwcd: numOrNull(row["IWCD"]),
    iwca: numOrNull(row["IWCA"]),
    psch: numOrNull(row["PSCH"]),
    pscd: numOrNull(row["PSCD"]),
    psca: numOrNull(row["PSCA"]),
    whch: numOrNull(row["WHCH"]),
    whcd: numOrNull(row["WHCD"]),
    whca: numOrNull(row["WHCA"]),
    vcch: numOrNull(row["VCCH"]),
    vccd: numOrNull(row["VCCD"]),
    vcca: numOrNull(row["VCCA"]),
    bb1x2: intOrNull(row["Bb1X2"]),
    bbmxh: numOrNull(row["BbMxH"]),
    bbavh: numOrNull(row["BbAvH"]),
    bbmxd: numOrNull(row["BbMxD"]),
    bbavd: numOrNull(row["BbAvD"]),
    bbmxa: numOrNull(row["BbMxA"]),
    bbava: numOrNull(row["BbAvA"]),
    b365_over_2_5: numOrNull(row["B365>2.5"]),
    b365_under_2_5: numOrNull(row["B365<2.5"]),
    p_over_2_5: numOrNull(row["P>2.5"]),
    p_under_2_5: numOrNull(row["P<2.5"]),
    bbou: intOrNull(row["BbOU"]),
    bbmx_over_2_5: numOrNull(row["BbMx>2.5"]),
    bbav_over_2_5: numOrNull(row["BbAv>2.5"]),
    bbmx_under_2_5: numOrNull(row["BbMx<2.5"]),
    bbav_under_2_5: numOrNull(row["BbAv<2.5"]),
    bbah: intOrNull(row["BbAH"]),
    bbahh: numOrNull(row["BbAHh"]),
    bbmxahh: numOrNull(row["BbMxAHH"]),
    bbavahh: numOrNull(row["BbAvAHH"]),
    bbmxaha: numOrNull(row["BbMxAHA"]),
    bbavaha: numOrNull(row["BbAvAHA"]),
    psch_ah: numOrNull(row["PSCH"]),
    psca_ah: numOrNull(row["PSCA"]),
    source_file: sourceFile,
    league_code: leagueCode,
    season_code: seasonCode,
    row_hash: rowHash,
    deterministic_source_match_id: deterministicId,
  };
}

async function importSeason(
  supabase: ReturnType<typeof createClient>,
  seasonCode: string
): Promise<Record<string, unknown>> {
  const leagueCode = "T1";
  const sourceProvider = "football-data.co.uk";
  const sourceFile = `mmz4281/${seasonCode}/T1.csv`;
  const csvUrl = `https://www.football-data.co.uk/${sourceFile}`;

  let csvResponse: Response;
  try {
    csvResponse = await fetch(csvUrl);
  } catch (e) {
    return { season: seasonCode, status: "fetch_error", error: String(e) };
  }

  if (!csvResponse.ok) {
    return {
      season: seasonCode,
      status: "http_error",
      http_status: csvResponse.status,
    };
  }

  const csvText = await csvResponse.text();
  const rows = parseCSV(csvText);
  const headers = csvText.split("\n")[0]?.split(",").map((h) => h.trim()) ?? [];

  if (rows.length === 0) {
    return { season: seasonCode, status: "empty_csv", row_count: 0 };
  }

  const hasCol = (name: string) => headers.includes(name);
  const schema = {
    has_ht: hasCol("HTHG") && hasCol("HTAG"),
    has_stats: hasCol("HS") && hasCol("AS") && hasCol("HST") && hasCol("AST"),
    has_corners: hasCol("HC") && hasCol("AC"),
    has_fouls: hasCol("HF") && hasCol("AF"),
    has_cards: hasCol("HY") && hasCol("AY") && hasCol("HR") && hasCol("AR"),
    has_referee: hasCol("Referee"),
    has_b365: hasCol("B365H") && hasCol("B365D") && hasCol("B365A"),
    has_bw: hasCol("BWH") && hasCol("BWD") && hasCol("BWA"),
    has_iw: hasCol("IWH") && hasCol("IWD") && hasCol("IWA"),
    has_ps: hasCol("PSH") && hasCol("PSD") && hasCol("PSA"),
    has_wh: hasCol("WHH") && hasCol("WHD") && hasCol("WHA"),
    has_vc: hasCol("VCH") && hasCol("VCD") && hasCol("VCA"),
    has_bb_ou: hasCol("BbOU"),
    has_bb_ah: hasCol("BbAH"),
    has_closing: hasCol("B365CH") || hasCol("PSCH"),
  };

  // Deduplicate by deterministic_source_match_id (last-write-wins)
  const dedupMap = new Map<string, Record<string, unknown>>();
  let csvDuplicates = 0;

  for (const row of rows) {
    const homeTeam = textOrNull(row["HomeTeam"]);
    const awayTeam = textOrNull(row["AwayTeam"]);

    const hashInput = `${sourceProvider}|${leagueCode}|${seasonCode}|${row["Date"] ?? ""}|${homeTeam ?? ""}|${awayTeam ?? ""}`;
    const fullHash = await sha256Hex(hashInput);
    const deterministicId = fullHash.substring(0, 32);

    const rowHashInput = JSON.stringify(row);
    const rowHash = (await sha256Hex(rowHashInput)).substring(0, 32);

    if (dedupMap.has(deterministicId)) {
      csvDuplicates++;
    }

    dedupMap.set(
      deterministicId,
      buildRecord(row, sourceFile, leagueCode, seasonCode, rowHash, deterministicId)
    );
  }

  const records = Array.from(dedupMap.values());

  const BATCH_SIZE = 50;
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("staging_football_data_uk_raw")
      .upsert(batch, {
        onConflict: "league_code,season_code,deterministic_source_match_id",
        ignoreDuplicates: false,
      });
    if (error) {
      errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
      skipped += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  const validRows = records.filter(
    (r) =>
      r.home_team && r.away_team && r.match_date && r.fthg !== null && r.ftag !== null
  ).length;
  const emptyRows = records.length - validRows;
  const nullFt = records.filter((r) => r.fthg === null || r.ftag === null).length;
  const nullHt = records.filter((r) => r.hthg === null || r.htag === null).length;
  const hasStatsCount = records.filter(
    (r) => r.hs !== null && r.as_col !== null
  ).length;
  const hasOddsCount = records.filter((r) => r.b365h !== null).length;

  const richness =
    schema.has_ht &&
    schema.has_stats &&
    schema.has_corners &&
    schema.has_cards &&
    schema.has_b365 &&
    schema.has_closing
      ? "full"
      : schema.has_ht && schema.has_b365
        ? "partial"
        : "minimal";

  return {
    season: seasonCode,
    status: "ok",
    csv_rows: rows.length,
    csv_duplicates: csvDuplicates,
    deduped_records: records.length,
    inserted_or_updated: inserted,
    skipped_errors: skipped,
    valid_matches: validRows,
    empty_rows: emptyRows,
    schema_richness: richness,
    schema_detail: schema,
    null_ft_rate: `${nullFt}/${records.length}`,
    null_ht_rate: `${nullHt}/${records.length}`,
    stats_available: `${hasStatsCount}/${records.length}`,
    odds_available: `${hasOddsCount}/${records.length}`,
    errors: errors.slice(0, 5),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const seasonsParam = url.searchParams.get("seasons");

    let seasons: string[];
    if (seasonsParam) {
      seasons = seasonsParam.split(",").map((s) => s.trim());
    } else {
      seasons = [
        "1011", "1112", "1213", "1314", "1415", "1516", "1617",
        "1718", "1819", "1920", "2021", "2122", "2223", "2324", "2425",
      ];
    }

    const results: Record<string, unknown>[] = [];
    for (const season of seasons) {
      const result = await importSeason(supabase, season);
      results.push(result);
    }

    const successSeasons = results.filter((r) => r.status === "ok");
    const totalMatches = successSeasons.reduce(
      (sum, r) => sum + (r.valid_matches as number),
      0
    );

    return new Response(
      JSON.stringify({
        total_seasons_attempted: seasons.length,
        total_seasons_imported: successSeasons.length,
        total_valid_matches: totalMatches,
        seasons: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
