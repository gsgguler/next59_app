import type { UIMatch } from '../../types/ui-models';
import { predictionToNarrative } from '../../utils/predictionToNarrative';
import type { FullPrediction } from '../../utils/predictionToNarrative';
import NarrativeParagraph from './NarrativeParagraph';

const sections: { type: 'general' | 'goals' | 'mutual' | 'first_half' | 'second_half' | 'full_time'; title: string }[] = [
  { type: 'general', title: 'Genel Senaryo' },
  { type: 'goals', title: 'Gol Beklentisi' },
  { type: 'mutual', title: 'Karşılıklı Atak Senaryosu' },
  { type: 'first_half', title: 'İlk Yarı Analizi' },
  { type: 'second_half', title: 'İkinci Yarı Projeksiyonu' },
  { type: 'full_time', title: 'Maç Sonu Senaryosu' },
];

export default function PreMatchOracle({ match }: { match: UIMatch }) {
  const p = match.prediction;
  const fullPrediction: FullPrediction | null = p
    ? {
        home_prob: p.home_prob,
        draw_prob: p.draw_prob,
        away_prob: p.away_prob,
        over_2_5: p.high_scoring,
        btts: p.mutual_scoring,
        confidence: p.confidence,
      }
    : null;

  const eloDiff =
    match.home_elo && match.away_elo ? match.home_elo - match.away_elo : undefined;

  const isLocked = match.status !== 'scheduled';

  return (
    <div>
      {/* Probability bar */}
      {p && (
        <div className="mb-6 p-4 bg-navy-900/60 border border-navy-800 rounded-xl">
          <div className="flex items-center justify-between text-xs text-navy-400 mb-2">
            <span>{match.home_team.short_name}</span>
            <span>Beraberlik</span>
            <span>{match.away_team.short_name}</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex">
            <div
              className="bg-champagne/70 transition-all"
              style={{ width: `${p.home_prob * 100}%` }}
              title={`${(p.home_prob * 100).toFixed(0)}%`}
            />
            <div
              className="bg-navy-600 transition-all"
              style={{ width: `${p.draw_prob * 100}%` }}
              title={`${(p.draw_prob * 100).toFixed(0)}%`}
            />
            <div
              className="bg-navy-400 transition-all"
              style={{ width: `${p.away_prob * 100}%` }}
              title={`${(p.away_prob * 100).toFixed(0)}%`}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono font-semibold mt-1.5 tabular-nums">
            <span className="text-champagne">{(p.home_prob * 100).toFixed(0)}%</span>
            <span className="text-readable-muted">{(p.draw_prob * 100).toFixed(0)}%</span>
            <span className="text-navy-300">{(p.away_prob * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Narrative sections */}
      <div className="divide-y divide-navy-800/60">
        {sections.map((s) => (
          <NarrativeParagraph
            key={s.type}
            title={s.title}
            text={predictionToNarrative(
              fullPrediction,
              s.type,
              match.home_team.name,
              match.away_team.name,
              eloDiff,
            )}
            locked={isLocked}
            validation={match.status === 'finished' ? 'pending' : undefined}
          />
        ))}
      </div>

      {/* Accuracy summary placeholder for finished matches */}
      {match.status === 'finished' && (
        <div className="mt-6 p-4 bg-navy-900/60 border border-navy-800 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">
              Model Başarısı
            </span>
            <span className="text-sm font-mono font-bold text-champagne tabular-nums">
              -- / 6
            </span>
          </div>
          <div className="h-2 rounded-full bg-navy-800 overflow-hidden">
            <div className="h-full w-0 bg-emerald-500 rounded-full transition-all" />
          </div>
          <p className="text-[10px] text-readable-muted mt-1.5">
            Maç sonuçları doğrulandıktan sonra güncellenir.
          </p>
        </div>
      )}
    </div>
  );
}
