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
    if (values.length < 5) continue;
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
  const fullYear = year >= 90 ? 1900 + year : 2000 + year;
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

async function md5Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const csvUrl = "https://www.football-data.co.uk/mmz4281/1213/T1.csv";
    const leagueCode = "T1";
    const seasonCode = "1213";
    const sourceFile = "mmz4281/1213/T1.csv";
    const sourceProvider = "football-data.co.uk";

    const csvResponse = await fetch(csvUrl);
    if (!csvResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch CSV: ${csvResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const csvText = await csvResponse.text();
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "No rows parsed from CSV" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const matchDate = parseDate(row["Date"]);
      const homeTeam = textOrNull(row["HomeTeam"]);
      const awayTeam = textOrNull(row["AwayTeam"]);

      const hashInput = `${sourceProvider}|${leagueCode}|${seasonCode}|${row["Date"] ?? ""}|${homeTeam ?? ""}|${awayTeam ?? ""}`;

      // Use SHA-256 (Web Crypto guaranteed) and take first 32 hex chars for md5-like length
      const fullHash = await sha256Hex(hashInput);
      const deterministicId = fullHash.substring(0, 32);

      const rowHashInput = JSON.stringify(row);
      const rowHash = (await sha256Hex(rowHashInput)).substring(0, 32);

      const record = {
        div: textOrNull(row["Div"]),
        match_date: matchDate,
        match_time: textOrNull(row["Time"]),
        home_team: homeTeam,
        away_team: awayTeam,
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

      const { error } = await supabase
        .from("staging_football_data_uk_raw")
        .upsert(record, {
          onConflict: "league_code,season_code,deterministic_source_match_id",
          ignoreDuplicates: false,
        });

      if (error) {
        errors.push(`Row ${row["Date"]} ${homeTeam} vs ${awayTeam}: ${error.message}`);
        skipped++;
      } else {
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({
        csv_rows_parsed: rows.length,
        inserted_or_updated: inserted,
        skipped_errors: skipped,
        errors: errors.slice(0, 20),
        league_code: leagueCode,
        season_code: seasonCode,
        source_file: sourceFile,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
