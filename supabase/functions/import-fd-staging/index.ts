import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VALID_LEAGUE_CODES = new Set([
  "E0", "E1", "E2", "E3",
  "SP1", "SP2",
  "D1", "D2",
  "I1", "I2",
  "F1", "F2",
  "N1",
  "P1",
  "B1",
  "SC0",
  "T1",
  "G1",
]);

const T1_DEFAULT_SEASONS = [
  "1011", "1112", "1213", "1314", "1415",
  "1516", "1617", "1718", "1819", "1920",
  "2021", "2122", "2223", "2324", "2425",
];

const SOURCE_PROVIDER = "football-data.co.uk";

function buildCsvUrl(seasonCode: string, leagueCode: string): string {
  return `https://www.football-data.co.uk/mmz4281/${seasonCode}/${leagueCode}.csv`;
}

function buildSourceFile(seasonCode: string, leagueCode: string): string {
  return `mmz4281/${seasonCode}/${leagueCode}.csv`;
}

async function digestMessage(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("MD5", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const parts = raw.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yy] = parts;
  const year = parseInt(yy, 10);
  const fullYear = year >= 50 ? 1900 + year : 2000 + year;
  return `${fullYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function safeInt(val: string | undefined): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function safeNum(val: string | undefined): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

interface CsvRow {
  [key: string]: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    if (row["HomeTeam"] && row["AwayTeam"] && row["Date"]) {
      rows.push(row);
    }
  }
  return rows;
}

function col(row: CsvRow, ...names: string[]): string {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== "") return row[n];
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let leagueCode = "T1";
    let seasonCodes: string[] | null = null;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.leagueCode) leagueCode = String(body.leagueCode).toUpperCase();
      if (Array.isArray(body.seasonCodes)) {
        seasonCodes = body.seasonCodes.map((s: unknown) => String(s));
      }
    } else {
      const url = new URL(req.url);
      const lc = url.searchParams.get("leagueCode");
      if (lc) leagueCode = lc.toUpperCase();
      const sc = url.searchParams.get("seasonCodes");
      if (sc) seasonCodes = sc.split(",").map((s) => s.trim());
    }

    if (!VALID_LEAGUE_CODES.has(leagueCode)) {
      return new Response(
        JSON.stringify({
          error: `Invalid leagueCode: "${leagueCode}". Valid codes: ${[...VALID_LEAGUE_CODES].sort().join(", ")}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (leagueCode === "T1" && !seasonCodes) {
      seasonCodes = T1_DEFAULT_SEASONS;
    } else if (!seasonCodes || seasonCodes.length === 0) {
      return new Response(
        JSON.stringify({
          error: `seasonCodes required for league "${leagueCode}". Provide an array of season codes (e.g., ["2324","2425"]).`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const seasonPattern = /^\d{4}$/;
    for (const sc of seasonCodes) {
      if (!seasonPattern.test(sc)) {
        return new Response(
          JSON.stringify({
            error: `Invalid seasonCode: "${sc}". Must be 4 digits (e.g., "2425").`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const results: {
      seasonCode: string;
      url: string;
      fetched: number;
      inserted: number;
      skippedDuplicate: number;
      errors: string[];
    }[] = [];

    for (const seasonCode of seasonCodes) {
      const csvUrl = buildCsvUrl(seasonCode, leagueCode);
      const sourceFile = buildSourceFile(seasonCode, leagueCode);
      const seasonResult = {
        seasonCode,
        url: csvUrl,
        fetched: 0,
        inserted: 0,
        skippedDuplicate: 0,
        errors: [] as string[],
      };

      let csvText: string;
      try {
        const resp = await fetch(csvUrl);
        if (!resp.ok) {
          seasonResult.errors.push(`HTTP ${resp.status} fetching ${csvUrl}`);
          results.push(seasonResult);
          continue;
        }
        csvText = await resp.text();
      } catch (e) {
        seasonResult.errors.push(`Fetch error for ${csvUrl}: ${(e as Error).message}`);
        results.push(seasonResult);
        continue;
      }

      const rows = parseCsv(csvText);
      seasonResult.fetched = rows.length;

      const BATCH_SIZE = 50;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const upsertRows = [];

        for (const row of batch) {
          const homeTeam = col(row, "HomeTeam", "Home");
          const awayTeam = col(row, "AwayTeam", "Away");
          const matchDate = parseDate(col(row, "Date"));

          if (!homeTeam || !awayTeam || !matchDate) continue;

          const matchIdInput = `${SOURCE_PROVIDER}|${leagueCode}|${seasonCode}|${matchDate}|${homeTeam}|${awayTeam}`;
          const deterministicId = await digestMessage(matchIdInput);

          const hashInput = JSON.stringify({
            div: col(row, "Div"),
            date: matchDate,
            time: col(row, "Time"),
            home: homeTeam,
            away: awayTeam,
            fthg: col(row, "FTHG"),
            ftag: col(row, "FTAG"),
            ftr: col(row, "FTR"),
            hthg: col(row, "HTHG"),
            htag: col(row, "HTAG"),
            htr: col(row, "HTR"),
            referee: col(row, "Referee"),
            hs: col(row, "HS"),
            as: col(row, "AS"),
            hst: col(row, "HST"),
            ast: col(row, "AST"),
            hf: col(row, "HF"),
            af: col(row, "AF"),
            hc: col(row, "HC"),
            ac: col(row, "AC"),
            hy: col(row, "HY"),
            ay: col(row, "AY"),
            hr: col(row, "HR"),
            ar: col(row, "AR"),
          });
          const rowHash = await digestMessage(hashInput);

          upsertRows.push({
            div: col(row, "Div") || null,
            match_date: matchDate,
            match_time: col(row, "Time") || null,
            home_team: homeTeam,
            away_team: awayTeam,
            fthg: safeInt(col(row, "FTHG")),
            ftag: safeInt(col(row, "FTAG")),
            ftr: col(row, "FTR") || null,
            hthg: safeInt(col(row, "HTHG")),
            htag: safeInt(col(row, "HTAG")),
            htr: col(row, "HTR") || null,
            referee: col(row, "Referee") || null,
            hs: safeInt(col(row, "HS")),
            as_col: safeInt(col(row, "AS")),
            hst: safeInt(col(row, "HST")),
            ast: safeInt(col(row, "AST")),
            hf: safeInt(col(row, "HF")),
            af: safeInt(col(row, "AF")),
            hc: safeInt(col(row, "HC")),
            ac: safeInt(col(row, "AC")),
            hy: safeInt(col(row, "HY")),
            ay: safeInt(col(row, "AY")),
            hr: safeInt(col(row, "HR")),
            ar: safeInt(col(row, "AR")),
            b365h: safeNum(col(row, "B365H")),
            b365d: safeNum(col(row, "B365D")),
            b365a: safeNum(col(row, "B365A")),
            bwh: safeNum(col(row, "BWH")),
            bwd: safeNum(col(row, "BWD")),
            bwa: safeNum(col(row, "BWA")),
            iwh: safeNum(col(row, "IWH")),
            iwd: safeNum(col(row, "IWD")),
            iwa: safeNum(col(row, "IWA")),
            psh: safeNum(col(row, "PSH")),
            psd: safeNum(col(row, "PSD")),
            psa: safeNum(col(row, "PSA")),
            whh: safeNum(col(row, "WHH")),
            whd: safeNum(col(row, "WHD")),
            wha: safeNum(col(row, "WHA")),
            vch: safeNum(col(row, "VCH")),
            vcd: safeNum(col(row, "VCD")),
            vca: safeNum(col(row, "VCA")),
            b365ch: safeNum(col(row, "B365CH")),
            b365cd: safeNum(col(row, "B365CD")),
            b365ca: safeNum(col(row, "B365CA")),
            bwch: safeNum(col(row, "BWCH")),
            bwcd: safeNum(col(row, "BWCD")),
            bwca: safeNum(col(row, "BWCA")),
            iwch: safeNum(col(row, "IWCH")),
            iwcd: safeNum(col(row, "IWCD")),
            iwca: safeNum(col(row, "IWCA")),
            psch: safeNum(col(row, "PSCH")),
            pscd: safeNum(col(row, "PSCD")),
            psca: safeNum(col(row, "PSCA")),
            whch: safeNum(col(row, "WHCH")),
            whcd: safeNum(col(row, "WHCD")),
            whca: safeNum(col(row, "WHCA")),
            vcch: safeNum(col(row, "VCCH")),
            vccd: safeNum(col(row, "VCCD")),
            vcca: safeNum(col(row, "VCCA")),
            bb1x2: safeInt(col(row, "Bb1X2")),
            bbmxh: safeNum(col(row, "BbMxH")),
            bbavh: safeNum(col(row, "BbAvH")),
            bbmxd: safeNum(col(row, "BbMxD")),
            bbavd: safeNum(col(row, "BbAvD")),
            bbmxa: safeNum(col(row, "BbMxA")),
            bbava: safeNum(col(row, "BbAvA")),
            b365_over_2_5: safeNum(col(row, "B365>2.5", "B365O2.5")),
            b365_under_2_5: safeNum(col(row, "B365<2.5", "B365U2.5")),
            p_over_2_5: safeNum(col(row, "P>2.5", "PO2.5")),
            p_under_2_5: safeNum(col(row, "P<2.5", "PU2.5")),
            bbou: safeInt(col(row, "BbOU")),
            bbmx_over_2_5: safeNum(col(row, "BbMx>2.5", "BbMxO2.5")),
            bbav_over_2_5: safeNum(col(row, "BbAv>2.5", "BbAvO2.5")),
            bbmx_under_2_5: safeNum(col(row, "BbMx<2.5", "BbMxU2.5")),
            bbav_under_2_5: safeNum(col(row, "BbAv<2.5", "BbAvU2.5")),
            bbah: safeInt(col(row, "BbAH")),
            bbahh: safeNum(col(row, "BbAHh")),
            bbmxahh: safeNum(col(row, "BbMxAHH")),
            bbavahh: safeNum(col(row, "BbAvAHH")),
            bbmxaha: safeNum(col(row, "BbMxAHA")),
            bbavaha: safeNum(col(row, "BbAvAHA")),
            psch_ah: safeNum(col(row, "PSCH", "PSCHa")),
            psca_ah: safeNum(col(row, "PSCA", "PSCAa")),
            source_file: sourceFile,
            league_code: leagueCode,
            season_code: seasonCode,
            row_hash: rowHash,
            deterministic_source_match_id: deterministicId,
          });
        }

        if (upsertRows.length > 0) {
          const { error: upsertError, count } = await supabase
            .from("staging_football_data_uk_raw")
            .upsert(upsertRows, {
              onConflict: "league_code,season_code,deterministic_source_match_id",
              ignoreDuplicates: false,
              count: "exact",
            });

          if (upsertError) {
            seasonResult.errors.push(
              `Upsert error (batch ${i / BATCH_SIZE + 1}): ${upsertError.message}`
            );
          } else {
            seasonResult.inserted += count ?? upsertRows.length;
          }
        }
      }

      seasonResult.skippedDuplicate = seasonResult.fetched - seasonResult.inserted;
      if (seasonResult.skippedDuplicate < 0) seasonResult.skippedDuplicate = 0;
      results.push(seasonResult);
    }

    const totalFetched = results.reduce((s, r) => s + r.fetched, 0);
    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

    return new Response(
      JSON.stringify({
        leagueCode,
        seasonCodes,
        totalFetched,
        totalInserted,
        totalErrors,
        seasons: results,
      }),
      {
        status: totalErrors > 0 && totalInserted === 0 ? 207 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
