import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  MinusCircle,
  Target,
  XCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  getActualOutcome,
  getOutcomeLabel,
  getPredictedOutcomeFromProbabilities,
  probabilityToPercent,
  type WcOutcome,
} from "../../lib/wcPredictionEvaluation";

interface FixtureRow {
  id: string;
  match_number: number;
  public_fixture_key: string | null;
  stage_code: string | null;
  match_date: string | null;
  home_team_name: string;
  away_team_name: string;
  final_home_score: number | null;
  final_away_score: number | null;
  api_football_fixture_id: number | null;
}

interface CalibrationRow {
  api_football_fixture_id: number;
  predicted_score_home: number | null;
  predicted_score_away: number | null;
  home_win_probability: number | string | null;
  draw_probability: number | string | null;
  away_win_probability: number | string | null;
  calibrated_at: string | null;
}

interface AuditRow {
  matchNumber: number;
  fixtureKey: string;
  stageCode: string | null;
  matchDate: string | null;
  homeTeamName: string;
  awayTeamName: string;
  actualHomeScore: number;
  actualAwayScore: number;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  actualOutcome: WcOutcome;
  predictedOutcome: WcOutcome | null;
  homePct: number | null;
  drawPct: number | null;
  awayPct: number | null;
  actualOutcomePct: number | null;
  predictedOutcomePct: number | null;
  exactScoreCorrect: boolean | null;
  outcomeCorrect: boolean | null;
  calibratedAt: string | null;
}

type AuditFilter =
  | "all"
  | "score-correct"
  | "score-wrong"
  | "outcome-correct"
  | "outcome-wrong"
  | "missing";

const FILTERS: Array<{ key: AuditFilter; label: string }> = [
  { key: "all", label: "Tümü" },
  { key: "score-correct", label: "Skor Doğru" },
  { key: "score-wrong", label: "Skor Yanlış" },
  { key: "outcome-correct", label: "1X2 Doğru" },
  { key: "outcome-wrong", label: "1X2 Yanlış" },
  { key: "missing", label: "Tahmin Eksik" },
];

const STAGE_LABELS: Record<string, string> = {
  "Group Stage": "Grup",
  "Round of 32": "Son 32",
  "Round of 16": "Son 16",
  "Quarter-final": "Çeyrek Final",
  "Semi-final": "Yarı Final",
  "Third Place": "3. Yer",
  Final: "Final",
};

function resultProbability(
  outcome: WcOutcome,
  homePct: number | null,
  drawPct: number | null,
  awayPct: number | null,
): number | null {
  if (outcome === "home") return homePct;
  if (outcome === "away") return awayPct;
  return drawPct;
}

function StatusBadge({
  correct,
  labels,
}: {
  correct: boolean | null;
  labels: { correct: string; wrong: string; missing: string };
}) {
  if (correct == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-700/50 bg-slate-800/50 px-2 py-1 text-[10px] font-semibold text-slate-400">
        <MinusCircle className="h-3 w-3" />
        {labels.missing}
      </span>
    );
  }

  return correct ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700/40 bg-emerald-900/40 px-2 py-1 text-[10px] font-semibold text-emerald-300">
      <CheckCircle2 className="h-3 w-3" />
      {labels.correct}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-700/40 bg-red-900/40 px-2 py-1 text-[10px] font-semibold text-red-300">
      <XCircle className="h-3 w-3" />
      {labels.wrong}
    </span>
  );
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function hitRate(hits: number, evaluated: number): string {
  if (evaluated === 0) return "—";
  return `%${Math.round((hits / evaluated) * 1000) / 10}`;
}

export default function WcPredictionAuditTable() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { data: fixtureData, error: fixtureError } = await supabase
          .from("wc2026_fixtures")
          .select(
            "id,match_number,public_fixture_key,stage_code,match_date,home_team_name,away_team_name,final_home_score,final_away_score,api_football_fixture_id",
          )
          .eq("is_closed", true)
          .not("final_home_score", "is", null)
          .not("final_away_score", "is", null)
          .order("match_number", { ascending: false });

        if (fixtureError) throw fixtureError;

        const fixtures = (fixtureData ?? []) as FixtureRow[];
        const apiFixtureIds = fixtures
          .map((row) => row.api_football_fixture_id)
          .filter((value): value is number => value != null);

        let calibrations: CalibrationRow[] = [];

        if (apiFixtureIds.length > 0) {
          const { data: calibrationData, error: calibrationError } =
            await supabase
              .from("wc2026_match_scenario_calibration")
              .select(
                "api_football_fixture_id,predicted_score_home,predicted_score_away,home_win_probability,draw_probability,away_win_probability,calibrated_at",
              )
              .in("api_football_fixture_id", apiFixtureIds)
              .order("calibrated_at", { ascending: false });

          if (calibrationError) throw calibrationError;
          calibrations = (calibrationData ?? []) as CalibrationRow[];
        }

        const latestCalibrationByFixture = new Map<number, CalibrationRow>();
        for (const calibration of calibrations) {
          if (
            !latestCalibrationByFixture.has(calibration.api_football_fixture_id)
          ) {
            latestCalibrationByFixture.set(
              calibration.api_football_fixture_id,
              calibration,
            );
          }
        }

        const auditRows: AuditRow[] = fixtures.map((fixture) => {
          const actualHomeScore = Number(fixture.final_home_score);
          const actualAwayScore = Number(fixture.final_away_score);
          const actualOutcome = getActualOutcome(
            actualHomeScore,
            actualAwayScore,
          );

          const calibration =
            fixture.api_football_fixture_id != null
              ? (latestCalibrationByFixture.get(
                  fixture.api_football_fixture_id,
                ) ?? null)
              : null;

          const predictedHomeScore =
            calibration?.predicted_score_home != null
              ? Number(calibration.predicted_score_home)
              : null;
          const predictedAwayScore =
            calibration?.predicted_score_away != null
              ? Number(calibration.predicted_score_away)
              : null;

          const homePct = probabilityToPercent(
            calibration?.home_win_probability,
          );
          const drawPct = probabilityToPercent(calibration?.draw_probability);
          const awayPct = probabilityToPercent(
            calibration?.away_win_probability,
          );

          const predictedOutcome = getPredictedOutcomeFromProbabilities(
            homePct,
            drawPct,
            awayPct,
          );

          const hasPredictedScore =
            predictedHomeScore != null && predictedAwayScore != null;

          return {
            matchNumber: fixture.match_number,
            fixtureKey:
              fixture.public_fixture_key ??
              `wc2026-${String(fixture.match_number).padStart(3, "0")}`,
            stageCode: fixture.stage_code,
            matchDate: fixture.match_date,
            homeTeamName: fixture.home_team_name,
            awayTeamName: fixture.away_team_name,
            actualHomeScore,
            actualAwayScore,
            predictedHomeScore,
            predictedAwayScore,
            actualOutcome,
            predictedOutcome,
            homePct,
            drawPct,
            awayPct,
            actualOutcomePct: resultProbability(
              actualOutcome,
              homePct,
              drawPct,
              awayPct,
            ),
            predictedOutcomePct: predictedOutcome
              ? resultProbability(predictedOutcome, homePct, drawPct, awayPct)
              : null,
            exactScoreCorrect: hasPredictedScore
              ? predictedHomeScore === actualHomeScore &&
                predictedAwayScore === actualAwayScore
              : null,
            outcomeCorrect:
              predictedOutcome != null
                ? predictedOutcome === actualOutcome
                : null,
            calibratedAt: calibration?.calibrated_at ?? null,
          };
        });

        if (!cancelled) setRows(auditRows);
      } catch (loadError) {
        console.error("WC2026 prediction audit could not load:", loadError);
        if (!cancelled) {
          setError("Tahmin doğruluk tablosu yüklenemedi.");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const scoreEvaluated = rows.filter((row) => row.exactScoreCorrect != null);
    const outcomeEvaluated = rows.filter((row) => row.outcomeCorrect != null);

    return {
      finished: rows.length,
      scoreEvaluated: scoreEvaluated.length,
      scoreHits: scoreEvaluated.filter((row) => row.exactScoreCorrect).length,
      outcomeEvaluated: outcomeEvaluated.length,
      outcomeHits: outcomeEvaluated.filter((row) => row.outcomeCorrect).length,
      missing: rows.filter(
        (row) => row.exactScoreCorrect == null || row.outcomeCorrect == null,
      ).length,
    };
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === "score-correct") return row.exactScoreCorrect === true;
        if (filter === "score-wrong") return row.exactScoreCorrect === false;
        if (filter === "outcome-correct") return row.outcomeCorrect === true;
        if (filter === "outcome-wrong") return row.outcomeCorrect === false;
        if (filter === "missing") {
          return row.exactScoreCorrect == null || row.outcomeCorrect == null;
        }
        return true;
      }),
    [filter, rows],
  );

  return (
    <section className="border-t border-navy-800">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-3 text-left"
        >
          <Target className="h-5 w-5 shrink-0 text-champagne" />
          <div>
            <h2 className="text-lg font-bold text-white">Ne Dedik, Ne Oldu?</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Tam skor tahmini ile 1X2 sonuç tahmini birbirinden bağımsız
              ölçülür.
            </p>
          </div>
          <ChevronDown
            className={`ml-auto h-5 w-5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {expanded && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
                <div className="text-xs text-slate-400">Tamamlanan Maç</div>
                <div className="mt-1 text-2xl font-black text-white">
                  {summary.finished}
                </div>
              </div>
              <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
                <div className="text-xs text-slate-400">Tam Skor İsabeti</div>
                <div className="mt-1 text-2xl font-black text-champagne">
                  {summary.scoreHits}/{summary.scoreEvaluated}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {hitRate(summary.scoreHits, summary.scoreEvaluated)} başarı
                </div>
              </div>
              <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
                <div className="text-xs text-slate-400">1X2 Sonuç İsabeti</div>
                <div className="mt-1 text-2xl font-black text-emerald-400">
                  {summary.outcomeHits}/{summary.outcomeEvaluated}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {hitRate(summary.outcomeHits, summary.outcomeEvaluated)}{" "}
                  başarı
                </div>
              </div>
              <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
                <div className="text-xs text-slate-400">Eksik Tahmin</div>
                <div className="mt-1 text-2xl font-black text-slate-300">
                  {summary.missing}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setFilter(item.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === item.key
                      ? "border-champagne/40 bg-champagne/10 text-champagne"
                      : "border-navy-700 bg-navy-900/60 text-slate-400 hover:border-navy-600 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className="h-12 animate-pulse rounded-lg bg-navy-900/60"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-300">
                {error}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-navy-800 bg-navy-900/30">
                <table className="min-w-[1180px] w-full text-left text-xs">
                  <thead className="border-b border-navy-800 bg-navy-900/80 text-slate-400">
                    <tr>
                      <th className="px-3 py-3 font-semibold">#</th>
                      <th className="px-3 py-3 font-semibold">Maç</th>
                      <th className="px-3 py-3 font-semibold">Gerçek Skor</th>
                      <th className="px-3 py-3 font-semibold">Tahmin Skoru</th>
                      <th className="px-3 py-3 font-semibold">Skor Kontrolü</th>
                      <th className="px-3 py-3 font-semibold">Gerçek 1X2</th>
                      <th className="px-3 py-3 font-semibold">Model 1X2</th>
                      <th className="px-3 py-3 font-semibold">
                        Ev / Ber. / Dep.
                      </th>
                      <th className="px-3 py-3 font-semibold">1X2 Kontrolü</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800/70">
                    {filteredRows.map((row) => (
                      <tr
                        key={row.matchNumber}
                        className="hover:bg-navy-800/20"
                      >
                        <td className="px-3 py-3 align-top font-mono text-slate-500">
                          {row.matchNumber}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <Link
                            to={`/world-cup-2026/mac/${row.fixtureKey}`}
                            className="font-semibold text-white hover:text-champagne"
                          >
                            {row.homeTeamName} – {row.awayTeamName}
                          </Link>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {STAGE_LABELS[row.stageCode ?? ""] ??
                              row.stageCode ??
                              "—"}{" "}
                            · {formatDate(row.matchDate)}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top font-mono text-base font-black text-white">
                          {row.actualHomeScore}–{row.actualAwayScore}
                        </td>
                        <td className="px-3 py-3 align-top font-mono text-base font-black text-slate-300">
                          {row.predictedHomeScore != null &&
                          row.predictedAwayScore != null
                            ? `${row.predictedHomeScore}–${row.predictedAwayScore}`
                            : "—"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <StatusBadge
                            correct={row.exactScoreCorrect}
                            labels={{
                              correct: "Tam skor doğru",
                              wrong: "Tam skor yanlış",
                              missing: "Skor tahmini yok",
                            }}
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="font-semibold text-white">
                            {getOutcomeLabel(
                              row.actualOutcome,
                              row.homeTeamName,
                              row.awayTeamName,
                            )}
                          </div>
                          {row.actualOutcomePct != null && (
                            <div className="mt-1 text-[10px] text-slate-500">
                              Model bu sonuca %{row.actualOutcomePct} vermişti
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="font-semibold text-champagne">
                            {getOutcomeLabel(
                              row.predictedOutcome,
                              row.homeTeamName,
                              row.awayTeamName,
                            )}
                          </div>
                          {row.predictedOutcomePct != null && (
                            <div className="mt-1 text-[10px] text-slate-500">
                              En yüksek olasılık: %{row.predictedOutcomePct}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top font-mono text-slate-300">
                          {row.homePct ?? "—"} / {row.drawPct ?? "—"} /{" "}
                          {row.awayPct ?? "—"}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <StatusBadge
                            correct={row.outcomeCorrect}
                            labels={{
                              correct: "1X2 doğru",
                              wrong: "1X2 yanlış",
                              missing: "Net 1X2 yok",
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredRows.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-400">
                    Bu filtrede gösterilecek maç bulunamadı.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-slate-500">
              <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                “Tam skor” yalnızca iki skor da birebir aynıysa doğru sayılır.
                “1X2” ise ev, beraberlik ve deplasman olasılıkları içindeki tek
                en yüksek değerin gerçekleşen sonuçla eşleşmesini ölçer.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
