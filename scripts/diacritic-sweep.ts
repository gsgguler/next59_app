import fs from 'node:fs';
import path from 'node:path';

// ─── Pattern Library ────────────────────────────────────────────────
interface DiacriticPattern {
  ascii: RegExp;
  suggested: string;
  confidence: 'high' | 'medium' | 'low';
}

const ASCII_TURKISH_PATTERNS: DiacriticPattern[] = [
  // HIGH confidence — ASCII clearly wrong for Turkish context
  { ascii: /\bicin\b/g, suggested: 'için', confidence: 'high' },
  { ascii: /\bIcin\b/g, suggested: 'İçin', confidence: 'high' },
  { ascii: /\bmacin\b/gi, suggested: 'maçın', confidence: 'high' },
  { ascii: /\bMacin\b/g, suggested: 'Maçın', confidence: 'high' },
  { ascii: /\bmaci\b/gi, suggested: 'maçı', confidence: 'high' },
  { ascii: /\bMaci\b/g, suggested: 'Maçı', confidence: 'high' },
  { ascii: /\bMaclar\b/g, suggested: 'Maçlar', confidence: 'high' },
  { ascii: /\bmaclar\b/g, suggested: 'maçlar', confidence: 'high' },
  { ascii: /\bmaclari\b/gi, suggested: 'maçları', confidence: 'high' },
  { ascii: /\bMaclari\b/g, suggested: 'Maçları', confidence: 'high' },
  { ascii: /\byaziyoruz\b/gi, suggested: 'yazıyoruz', confidence: 'high' },
  { ascii: /\bbaslamadan\b/gi, suggested: 'başlamadan', confidence: 'high' },
  { ascii: /\bgazeteciligi\b/gi, suggested: 'gazeteciliği', confidence: 'high' },
  { ascii: /\bodakli\b/gi, suggested: 'odaklı', confidence: 'high' },
  { ascii: /\bdakikasini\b/gi, suggested: 'dakikasını', confidence: 'high' },
  { ascii: /\bdusunuyor\b/gi, suggested: 'düşünüyor', confidence: 'high' },
  { ascii: /\bbir sey\b/gi, suggested: 'bir şey', confidence: 'high' },
  { ascii: /\bcunku\b/gi, suggested: 'çünkü', confidence: 'high' },
  { ascii: /\bCunku\b/g, suggested: 'Çünkü', confidence: 'high' },
  { ascii: /\botesi\b/gi, suggested: 'ötesi', confidence: 'high' },
  { ascii: /\bsahanin\b/gi, suggested: 'sahanın', confidence: 'high' },
  { ascii: /\btakimin\b/gi, suggested: 'takımın', confidence: 'high' },
  { ascii: /\bTakimin\b/g, suggested: 'Takımın', confidence: 'high' },
  { ascii: /\bDunya\b/g, suggested: 'Dünya', confidence: 'high' },
  { ascii: /\bdunya\b/g, suggested: 'dünya', confidence: 'high' },
  { ascii: /\bKupasi\b/g, suggested: 'Kupası', confidence: 'high' },
  { ascii: /\bkupasi\b/g, suggested: 'kupası', confidence: 'high' },
  { ascii: /\bTurkiye\b/g, suggested: 'Türkiye', confidence: 'high' },
  { ascii: /\bolustu\b/gi, suggested: 'oluştu', confidence: 'high' },
  { ascii: /\bLutfen\b/g, suggested: 'Lütfen', confidence: 'high' },
  { ascii: /\blutfen\b/g, suggested: 'lütfen', confidence: 'high' },
  { ascii: /\bSifre\b/g, suggested: 'Şifre', confidence: 'high' },
  { ascii: /\bsifre\b/g, suggested: 'şifre', confidence: 'high' },
  { ascii: /\bSifreniz\b/g, suggested: 'Şifreniz', confidence: 'high' },
  { ascii: /\bYukleniyor\b/g, suggested: 'Yükleniyor', confidence: 'high' },
  { ascii: /\byukleniyor\b/g, suggested: 'yükleniyor', confidence: 'high' },
  { ascii: /\bguncelleme\b/gi, suggested: 'güncelleme', confidence: 'high' },
  { ascii: /\bGuncelleme\b/g, suggested: 'Güncelleme', confidence: 'high' },
  { ascii: /\bSartlari\b/g, suggested: 'Şartları', confidence: 'high' },
  { ascii: /\bsartlari\b/g, suggested: 'şartları', confidence: 'high' },
  { ascii: /\bPolitikasi\b/g, suggested: 'Politikası', confidence: 'high' },
  { ascii: /\bpolitikasi\b/g, suggested: 'politikası', confidence: 'high' },
  { ascii: /\bKosullari\b/g, suggested: 'Koşulları', confidence: 'high' },
  { ascii: /\bkosullari\b/g, suggested: 'koşulları', confidence: 'high' },
  { ascii: /\bAydinlatma\b/g, suggested: 'Aydınlatma', confidence: 'high' },
  { ascii: /\baydinlatma\b/g, suggested: 'aydınlatma', confidence: 'high' },
  { ascii: /\bCerez\b/g, suggested: 'Çerez', confidence: 'high' },
  { ascii: /\bcerez\b/g, suggested: 'çerez', confidence: 'high' },
  { ascii: /\bHakkimizda\b/g, suggested: 'Hakkımızda', confidence: 'high' },
  { ascii: /\bhakkimizda\b/g, suggested: 'hakkımızda', confidence: 'high' },
  { ascii: /\bGiris\b/g, suggested: 'Giriş', confidence: 'high' },
  { ascii: /\bgiris\b/g, suggested: 'giriş', confidence: 'high' },
  { ascii: /\bCikis\b/g, suggested: 'Çıkış', confidence: 'high' },
  { ascii: /\bcikis\b/g, suggested: 'çıkış', confidence: 'high' },
  { ascii: /\bUcretsiz\b/g, suggested: 'Ücretsiz', confidence: 'high' },
  { ascii: /\bucretsiz\b/g, suggested: 'ücretsiz', confidence: 'high' },
  { ascii: /\bBaslat\b/g, suggested: 'Başlat', confidence: 'high' },
  { ascii: /\bbaslat\b/g, suggested: 'başlat', confidence: 'high' },
  { ascii: /\bBaslangica\b/g, suggested: 'Başlangıca', confidence: 'high' },
  { ascii: /\bKullanici\b/g, suggested: 'Kullanıcı', confidence: 'high' },
  { ascii: /\bkullanici\b/g, suggested: 'kullanıcı', confidence: 'high' },
  { ascii: /\bsaklidir\b/gi, suggested: 'saklıdır', confidence: 'high' },
  { ascii: /\byatirim\b/gi, suggested: 'yatırım', confidence: 'high' },
  { ascii: /\bIcerikler\b/g, suggested: 'İçerikler', confidence: 'high' },
  { ascii: /\bicerikler\b/g, suggested: 'içerikler', confidence: 'high' },
  { ascii: /\byalnizca\b/gi, suggested: 'yalnızca', confidence: 'high' },
  { ascii: /\bamaclidir\b/gi, suggested: 'amaçlıdır', confidence: 'high' },
  { ascii: /\bHizli\b/g, suggested: 'Hızlı', confidence: 'high' },
  { ascii: /\bhizli\b/g, suggested: 'hızlı', confidence: 'high' },
  { ascii: /\bhaklari\b/gi, suggested: 'hakları', confidence: 'high' },
  { ascii: /\bHos\b/g, suggested: 'Hoş', confidence: 'high' },
  { ascii: /\bhos\b/g, suggested: 'hoş', confidence: 'high' },
  { ascii: /\berisin\b/gi, suggested: 'erişin', confidence: 'high' },
  { ascii: /\bAdiniz\b/g, suggested: 'Adınız', confidence: 'high' },
  { ascii: /\badiniz\b/g, suggested: 'adınız', confidence: 'high' },
  { ascii: /\bhesabin\b/gi, suggested: 'hesabın', confidence: 'high' },
  { ascii: /\bHesabin\b/g, suggested: 'Hesabın', confidence: 'high' },
  { ascii: /\bKullanim\b/g, suggested: 'Kullanım', confidence: 'high' },
  { ascii: /\bkullanim\b/g, suggested: 'kullanım', confidence: 'high' },
  // "Gizlilik" is identical in ASCII and Turkish — no pattern needed
  // "Takvimi" is identical in ASCII and Turkish — no pattern needed
  { ascii: /\bUye\b/g, suggested: 'Üye', confidence: 'high' },
  { ascii: /\buye\b/g, suggested: 'üye', confidence: 'high' },
  { ascii: /\betmis\b/gi, suggested: 'etmiş', confidence: 'high' },
  { ascii: /\bSiralandi\b/g, suggested: 'Sıralandı', confidence: 'high' },
  { ascii: /\bsiralandi\b/g, suggested: 'sıralandı', confidence: 'high' },
  { ascii: /\bGoster\b/g, suggested: 'Göster', confidence: 'high' },
  { ascii: /\bgoster\b/g, suggested: 'göster', confidence: 'high' },
  { ascii: /\bGunu\b/g, suggested: 'Günü', confidence: 'high' },
  { ascii: /\bgunu\b/g, suggested: 'günü', confidence: 'high' },
  { ascii: /\btakim\b/g, suggested: 'takım', confidence: 'high' },
  { ascii: /\bTakim\b/g, suggested: 'Takım', confidence: 'high' },
  { ascii: /\bSure\b/g, suggested: 'Süre', confidence: 'high' },
  { ascii: /\bsure\b/g, suggested: 'süre', confidence: 'high' },
  { ascii: /\beslesen\b/gi, suggested: 'eşleşen', confidence: 'high' },
  { ascii: /\bbulunamadi\b/gi, suggested: 'bulunamadı', confidence: 'high' },
  { ascii: /\bulasabilirsiniz\b/gi, suggested: 'ulaşabilirsiniz', confidence: 'high' },
  { ascii: /\bSorulariniz\b/g, suggested: 'Sorularınız', confidence: 'high' },
  { ascii: /\bsorulariniz\b/g, suggested: 'sorularınız', confidence: 'high' },

  // MEDIUM confidence — might be valid ASCII in some contexts
  { ascii: /\bguven\b/gi, suggested: 'güven', confidence: 'medium' },
  { ascii: /\byukle\b/gi, suggested: 'yükle', confidence: 'medium' },
  { ascii: /\butun\b/gi, suggested: 'bütün', confidence: 'medium' },
  { ascii: /\boyle\b/gi, suggested: 'öyle', confidence: 'medium' },
  { ascii: /\bsoyle\b/gi, suggested: 'şöyle', confidence: 'medium' },
  { ascii: /\bmac\b/g, suggested: 'maç', confidence: 'medium' },
  { ascii: /\bMac\b/g, suggested: 'Maç', confidence: 'medium' },
  { ascii: /\bgun\b/g, suggested: 'gün', confidence: 'medium' },
  { ascii: /\bGun\b/g, suggested: 'Gün', confidence: 'medium' },
  { ascii: /\btum\b/g, suggested: 'tüm', confidence: 'medium' },
  { ascii: /\bTum\b/g, suggested: 'Tüm', confidence: 'medium' },
];

// ─── File Discovery ─────────────────────────────────────────────────
const SCAN_GLOBS: string[] = [
  'src/components',
  'src/pages',
  'src/utils',
  'src/data',
  'src/contexts',
];

const SCAN_EXTENSIONS = ['.tsx', '.ts'];

const EXTRA_FILES = ['index.html'];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'supabase/migrations']);

function walk(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...walk(fullPath, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Scan Logic ─────────────────────────────────────────────────────
interface Match {
  file: string;
  line: number;
  column: number;
  match: string;
  suggested: string;
  context: string;
  confidence: 'high' | 'medium' | 'low';
}

interface Report {
  timestamp: string;
  totalFilesScanned: number;
  totalMatchesFound: number;
  matches: Match[];
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
}

function scanFile(filePath: string, patterns: DiacriticPattern[]): Match[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches: Match[] = [];
  const relPath = path.relative(process.cwd(), filePath);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    for (const pattern of patterns) {
      if (pattern.ascii.source === pattern.suggested.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) continue;

      const regex = new RegExp(pattern.ascii.source, pattern.ascii.flags);
      let m: RegExpExecArray | null;

      while ((m = regex.exec(line)) !== null) {
        // Skip matches inside URL/route paths (e.g., /mac/, to="/mac", navigate('/mac/))
        const before = line.slice(Math.max(0, m.index - 5), m.index);
        if (/[/'"=`]$/.test(before) && /^[/'"=`]/.test(line.slice(m.index + m[0].length, m.index + m[0].length + 2))) continue;
        if (/\/\w*$/.test(before)) continue;

        const contextStart = Math.max(0, m.index - 20);
        const contextEnd = Math.min(line.length, m.index + m[0].length + 20);
        const context = (contextStart > 0 ? '...' : '') +
          line.slice(contextStart, contextEnd) +
          (contextEnd < line.length ? '...' : '');

        matches.push({
          file: relPath,
          line: lineIdx + 1,
          column: m.index + 1,
          match: m[0],
          suggested: pattern.suggested,
          context: context.trim(),
          confidence: pattern.confidence,
        });
      }
    }
  }

  return matches;
}

function runScan(): Report {
  const projectRoot = process.cwd();
  const files: string[] = [];

  for (const dir of SCAN_GLOBS) {
    files.push(...walk(path.join(projectRoot, dir), SCAN_EXTENSIONS));
  }

  for (const extra of EXTRA_FILES) {
    const fp = path.join(projectRoot, extra);
    if (fs.existsSync(fp)) files.push(fp);
  }

  // Also scan supabase/functions
  const fnDir = path.join(projectRoot, 'supabase', 'functions');
  if (fs.existsSync(fnDir)) {
    files.push(...walk(fnDir, ['.ts']));
  }

  const allMatches: Match[] = [];

  for (const file of files) {
    allMatches.push(...scanFile(file, ASCII_TURKISH_PATTERNS));
  }

  const report: Report = {
    timestamp: new Date().toISOString(),
    totalFilesScanned: files.length,
    totalMatchesFound: allMatches.length,
    matches: allMatches,
    highConfidenceCount: allMatches.filter((m) => m.confidence === 'high').length,
    mediumConfidenceCount: allMatches.filter((m) => m.confidence === 'medium').length,
    lowConfidenceCount: allMatches.filter((m) => m.confidence === 'low').length,
  };

  return report;
}

// ─── Fix Logic ──────────────────────────────────────────────────────
function runFix(confidenceLevel: 'high' | 'medium' | 'low', interactive: boolean): void {
  const report = runScan();

  const allowedConfidence = new Set<string>(['high']);
  if (confidenceLevel === 'medium') allowedConfidence.add('medium');
  if (confidenceLevel === 'low') {
    allowedConfidence.add('medium');
    allowedConfidence.add('low');
  }
  if (interactive) {
    allowedConfidence.add('medium');
    allowedConfidence.add('low');
  }

  const toFix = report.matches.filter((m) => allowedConfidence.has(m.confidence));

  if (toFix.length === 0) {
    console.log('No matches to fix at the selected confidence level.');
    return;
  }

  const fileGroups = new Map<string, Match[]>();
  for (const m of toFix) {
    const arr = fileGroups.get(m.file) ?? [];
    arr.push(m);
    fileGroups.set(m.file, arr);
  }

  let filesModified = 0;
  let totalReplacements = 0;

  for (const [relFile, matches] of fileGroups) {
    const absPath = path.resolve(process.cwd(), relFile);
    let content = fs.readFileSync(absPath, 'utf-8');
    let modified = false;

    for (const m of matches) {
      const pattern = ASCII_TURKISH_PATTERNS.find(
        (p) => p.suggested === m.suggested && p.confidence === m.confidence,
      );
      if (!pattern) continue;

      const regex = new RegExp(pattern.ascii.source, pattern.ascii.flags);
      const before = content;
      content = content.replace(regex, pattern.suggested);
      if (content !== before) {
        modified = true;
        const replacements = (before.match(regex) ?? []).length;
        totalReplacements += replacements;
      }
    }

    if (modified) {
      fs.writeFileSync(absPath, content, 'utf-8');
      filesModified++;
    }
  }

  console.log(`Fix complete: ${filesModified} files modified, ${totalReplacements} replacements made.`);
}

// ─── Check Mode (CI-friendly, exit code 1 if matches found) ────────
function runCheck(): void {
  const report = runScan();
  if (report.highConfidenceCount > 0) {
    console.error(`FAIL: ${report.highConfidenceCount} high-confidence diacritic issues found.`);
    for (const m of report.matches.filter((x) => x.confidence === 'high')) {
      console.error(`  ${m.file}:${m.line}:${m.column} — "${m.match}" → "${m.suggested}"`);
    }
    process.exit(1);
  }
  console.log('PASS: No high-confidence diacritic issues found.');
}

// ─── CLI ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--scan')) {
  const report = runScan();
  fs.writeFileSync('diacritic-report.json', JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Scan complete: ${report.totalFilesScanned} files scanned, ${report.totalMatchesFound} matches found.`);
  console.log(`  High: ${report.highConfidenceCount} | Medium: ${report.mediumConfidenceCount} | Low: ${report.lowConfidenceCount}`);
  console.log('Report written to diacritic-report.json');
} else if (args.includes('--fix')) {
  const interactive = args.includes('--interactive');
  let confidence: 'high' | 'medium' | 'low' = 'high';
  const confArg = args.find((a) => a.startsWith('--confidence='));
  if (confArg) {
    const val = confArg.split('=')[1];
    if (val === 'medium' || val === 'low') confidence = val;
  }
  runFix(confidence, interactive);
} else if (args.includes('--check')) {
  runCheck();
} else {
  console.log('Usage:');
  console.log('  npx tsx scripts/diacritic-sweep.ts --scan              Scan and generate report');
  console.log('  npx tsx scripts/diacritic-sweep.ts --fix --confidence=high   Auto-fix high confidence');
  console.log('  npx tsx scripts/diacritic-sweep.ts --fix --interactive       Interactive fix all');
  console.log('  npx tsx scripts/diacritic-sweep.ts --check             CI check (exit 1 if issues)');
}
