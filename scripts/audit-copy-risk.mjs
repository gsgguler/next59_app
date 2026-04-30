/**
 * audit-copy-risk.mjs
 *
 * Scans public/user-facing source files for betting/prediction-market language
 * that must not appear in public UI copy.
 *
 * Classifications:
 *   PUBLIC_RISK      – real violation, must be fixed
 *   LEGAL_ALLOWED    – explicitly allowed in legal/anti-betting disclaimer files
 *   ADMIN_ALLOWED    – inside admin-only Model Lab scope
 *   INTERNAL_ALLOWED – variable/type/db names; never rendered as user-visible text
 *
 * Exit code is always 0 (does not fail CI).
 * Run: node scripts/audit-copy-risk.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// ─── Configuration ────────────────────────────────────────────────────────────

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SRC  = join(ROOT, 'src');

// Directories excluded entirely — admin/technical scope, never user-facing.
const ADMIN_DIR_PATTERNS = [
  /src\/pages\/admin\//,
  /src\/lib\/modelLab\//,
];

// Files excluded entirely — mock/fixture data, never shown in production.
const INTERNAL_FILE_BASENAMES = new Set([
  'mockDebate',
  'mockMatches',
]);

// Files where audit terms are explicitly allowed in context of anti-betting
// disclaimers, legal notices, or methodology explanations.
const LEGAL_ALLOWED_FILES = new Set([
  'BahisKarsitDurusPage',
  'YasalUyariPage',
  'DisclaimerBanner',
  'Footer',
  'SssPage',
  'HakkimizdaPage',
  'YayinIlkeleriPage',
  'NasilCalisirPage',
  'MetodolojiPage',
  'TermsPage',
  'FutbolAnalitigiPage',    // contains "Bahis tavsiyesi değil" anti-betting tagline
  'predictionToNarrative',  // disclaimer suffix: "kesin sonuç değildir"
  'BacktestPage',           // "Başarı oranları" = statistical success rate, not odds
]);

// Route/nav path segments that reference anti-betting pages — not public copy.
const LEGAL_PATH_PATTERNS = [
  /bahis-karsiti-durus/,
];

// Terms to audit. Each entry: pattern matched per line, term name, language tag.
const AUDIT_TERMS = [
  // Turkish
  { term: 'tahmin',        lang: 'TR', pattern: /tahmin/i },
  { term: 'bahis',         lang: 'TR', pattern: /bahis/i },
  { term: 'iddaa',         lang: 'TR', pattern: /iddaa/i },
  { term: 'iddia',         lang: 'TR', pattern: /iddia/i },
  { term: 'kupon',         lang: 'TR', pattern: /kupon/i },
  { term: 'banko',         lang: 'TR', pattern: /\bbanko\b/i },
  { term: 'oran',          lang: 'TR', pattern: /\boran\b/i },
  { term: 'ROI',           lang: 'TR', pattern: /\bROI\b/ },
  { term: 'garanti',       lang: 'TR', pattern: /garanti/i },
  { term: 'kesin',         lang: 'TR', pattern: /\bkesin\b/i },
  { term: 'kazandırır',    lang: 'TR', pattern: /kazandırır/i },
  // English
  { term: 'prediction',    lang: 'EN', pattern: /\bprediction\b/i },
  { term: 'predictions',   lang: 'EN', pattern: /\bpredictions\b/i },
  { term: 'betting',       lang: 'EN', pattern: /\bbetting\b/i },
  { term: 'odds',          lang: 'EN', pattern: /\bodds\b/i },
  { term: 'wager',         lang: 'EN', pattern: /\bwager\b/i },
  { term: 'gambling',      lang: 'EN', pattern: /\bgambling\b/i },
  { term: 'bet',           lang: 'EN', pattern: /\bbet\b/i },
  { term: 'coupon',        lang: 'EN', pattern: /\bcoupon\b/i },
  { term: 'pick',          lang: 'EN', pattern: /\bpick\b/i },
  { term: 'guaranteed',    lang: 'EN', pattern: /\bguaranteed\b/i },
  { term: 'profitable',    lang: 'EN', pattern: /\bprofitable\b/i },
  { term: 'bankroll',      lang: 'EN', pattern: /\bbankroll\b/i },
];

// ─── Line-level heuristics for INTERNAL_ALLOWED ───────────────────────────────
//
// A line is INTERNAL if:
//   1. It is a TS/JS code construct (not a string literal rendered to users).
//   2. The matched term appears only in an identifier, import, type, or prop name.
//
// Strategy: detect lines that are structurally code, not prose/JSX text content.

const INTERNAL_LINE_PATTERNS = [
  // Code-structure signals
  /^\s*\/\//,                             // single-line comment
  /^\s*import\b/,                         // import statement
  /^\s*export\b/,                         // export statement (not JSX text)
  /^\s*\*\s/,                             // JSDoc block comment line

  // TypeScript declarations containing the term as an identifier
  /\b(const|let|var|function|type|interface|enum)\s+\w*(prediction|Prediction|bet|odds)/i,
  /\b\w*(prediction_type|predicted_outcome|odds_fair|prediction_id)\b/i,

  // Supabase query chains — term appears in SQL/table string, not UI copy
  /\.(from|select|order|eq|filter|match)\s*\(\s*['"`][^'"`]*(prediction|bet|odds)/i,

  // Object/interface field declarations (key: value or key?: value)
  /^\s*\w*(prediction|odds)[A-Za-z_]*\s*[?!]?\s*:/i,

  // JSX prop assignments — value is a code expression, not display text
  /\bprediction\s*=\s*\{/,               // prediction={expr}
  /\bpredictions\s*=\s*\{/,
  /to\s*=\s*['"`]\/predictions/,         // to="/predictions" route prop
  /href\s*=\s*['"`]\/predictions/,       // href="/predictions"
  /path\s*=\s*['"`][^'"`]*prediction/i,  // path="/predictions/…"
  /path\s*=\s*['"`][^'"`]*bahis/i,       // Route path with bahis slug

  // JS expression lines (no prose)
  /prediction\s*[?!]?\./,                // object member access
  /\bprediction\s*&&/,                   // JSX guard expression
  /\bprediction\s*\?/,                   // ternary
  /\bprediction\s*=/,                    // assignment
  /\bprediction\s*,/,                    // destructuring / arg list
  /\bprediction\s*\)/,                   // closing paren
  /\bpredictions\s*[.[(=,)]/,            // any code-level member/access
  /\(prediction[s]?\b/,                  // function parameter
  /\bpredictions\.count\b/,
  /\bpredictions\b\s*\?\?/,              // nullish coalescing

  // Identifier-only patterns (camelCase/PascalCase — never raw prose)
  /\bprediction[A-Z]/,                   // predictionId, predictionType, …
  /[A-Z]\w*Prediction\b/,                // DbPrediction, FullPrediction, …
  /\buse\w*Prediction\b/,                // hook names
  /setPrediction|fetchPrediction|loadPrediction/i,
  /PredictionCard|PredictionList|PredictionDetail|PredictionBadge/,
  /RecentPrediction|FullPrediction/,

  // Property access via dot notation: match.prediction, foo.prediction, etc.
  /\w+\.prediction\b/,

  // Destructuring from a bare `prediction` identifier: { a, b } = prediction
  /\}\s*=\s*prediction\b/,

  // DB field names appearing anywhere on the line
  /\bodds_fair\b/,

  // Infrastructure "garantisi" — SLA / uptime context, not betting guarantee
  /SLA garantisi/i,
  /uptime garantisi/i,
  /%99\.9.*garantisi/i,

  // Nav/route label pointing to anti-betting page (LEGAL context encoded in path)
  /bahis-karsiti-durus/,
  /BahisKarsitDurus/,

  // Template literal where `prediction` is a prop/variable interpolation,
  // not prose text (the label text itself is already cleaned: "senaryosu:")
  /next59 senaryosu:.*\$\{props\.prediction\}/,

  // narrativeEngine / predictionToNarrative — internal model utility files
  // matched terms appear as JS parameter names or in disclaimer suffix strings
  /const\s*\{.*prediction.*\}\s*=/,      // destructuring from prediction obj
  /\bprediction\s*:\s*FullPrediction/,   // type annotation
];

// ─── File helpers ─────────────────────────────────────────────────────────────

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkDir(full, files);
    } else if (/\.(tsx?|mts|cts)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function fileBasename(filePath) {
  return filePath.split('/').pop().replace(/\.(tsx?|mts|cts)$/, '');
}

function classifyFile(filePath) {
  const rel = relative(ROOT, filePath);
  if (ADMIN_DIR_PATTERNS.some(p => p.test(rel)))           return 'ADMIN_ALLOWED';
  if (INTERNAL_FILE_BASENAMES.has(fileBasename(filePath))) return 'INTERNAL_ALLOWED';
  if (LEGAL_ALLOWED_FILES.has(fileBasename(filePath)))     return 'LEGAL_ALLOWED';
  return null; // classify per-line
}

function isInternalLine(line) {
  if (INTERNAL_LINE_PATTERNS.some(p => p.test(line))) return true;
  // Also treat lines that are pure Route/Link/NavItem definitions — no prose
  if (LEGAL_PATH_PATTERNS.some(p => p.test(line)))    return true;
  return false;
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

const findings = [];

for (const filePath of walkDir(SRC)) {
  const fileClass = classifyFile(filePath);
  const lines     = readFileSync(filePath, 'utf8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { term, lang, pattern } of AUDIT_TERMS) {
      if (!pattern.test(line)) continue;

      let classification;
      if (fileClass) {
        classification = fileClass;
      } else if (isInternalLine(line)) {
        classification = 'INTERNAL_ALLOWED';
      } else {
        classification = 'PUBLIC_RISK';
      }

      findings.push({
        file:           relative(ROOT, filePath),
        line:           i + 1,
        term,
        lang,
        text:           line.trim(),
        classification,
      });

      break; // one finding per line (first matching term)
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

const COLORS = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  white:  '\x1b[37m',
};

const C = process.stdout.isTTY
  ? COLORS
  : Object.fromEntries(Object.keys(COLORS).map(k => [k, '']));

const CLASS_COLOR = {
  PUBLIC_RISK:      C.red  + C.bold,
  LEGAL_ALLOWED:    C.cyan,
  ADMIN_ALLOWED:    C.gray,
  INTERNAL_ALLOWED: C.gray,
};

const counts = { PUBLIC_RISK: 0, LEGAL_ALLOWED: 0, ADMIN_ALLOWED: 0, INTERNAL_ALLOWED: 0 };

const grouped = {};
for (const f of findings) {
  counts[f.classification]++;
  const key = `${f.classification}::${f.file}`;
  (grouped[key] ??= []).push(f);
}

const ORDER = ['PUBLIC_RISK', 'LEGAL_ALLOWED', 'ADMIN_ALLOWED', 'INTERNAL_ALLOWED'];

console.log('\n' + C.bold + '═══════════════════════════════════════════════════════' + C.reset);
console.log(C.bold + '  NEXT59 — Copy Risk Audit' + C.reset);
console.log(C.bold + '═══════════════════════════════════════════════════════' + C.reset + '\n');

for (const cls of ORDER) {
  const clsKeys = Object.keys(grouped).filter(k => k.startsWith(cls + '::'));
  if (clsKeys.length === 0) continue;

  const label = `▌ ${cls} (${counts[cls]} match${counts[cls] !== 1 ? 'es' : ''})`;
  console.log(CLASS_COLOR[cls] + label + C.reset);

  for (const key of clsKeys.sort()) {
    const file = key.slice(cls.length + 2);
    console.log(C.white + `  ${file}` + C.reset);
    for (const f of grouped[key]) {
      const lineNum = String(f.line).padStart(4, ' ');
      const termTag = `[${f.lang}:${f.term}]`.padEnd(22, ' ');
      const snippet = f.text.length > 110 ? f.text.slice(0, 107) + '…' : f.text;
      console.log(`    ${C.gray}L${lineNum}${C.reset}  ${CLASS_COLOR[cls]}${termTag}${C.reset}  ${snippet}`);
    }
  }
  console.log();
}

console.log(C.bold + '─── Summary ───────────────────────────────────────────' + C.reset);
console.log(`  ${C.red + C.bold}PUBLIC_RISK     : ${counts.PUBLIC_RISK}${C.reset}`);
console.log(`  ${C.cyan}LEGAL_ALLOWED   : ${counts.LEGAL_ALLOWED}${C.reset}`);
console.log(`  ${C.gray}ADMIN_ALLOWED   : ${counts.ADMIN_ALLOWED}${C.reset}`);
console.log(`  ${C.gray}INTERNAL_ALLOWED: ${counts.INTERNAL_ALLOWED}${C.reset}`);
console.log(`  Total           : ${findings.length}`);

if (counts.PUBLIC_RISK === 0) {
  console.log('\n' + C.green + C.bold + '  PASS — No public copy risks detected.' + C.reset + '\n');
} else {
  console.log(
    '\n' + C.red + C.bold +
    `  WARN — ${counts.PUBLIC_RISK} public copy risk(s) found. Review and fix before shipping.` +
    C.reset + '\n'
  );
}

process.exit(0);
