interface HeatmapCell {
  match_type: string;
  brain_key: string;
  accuracy: number | null;
}

interface BrainHeatmapProps {
  cells: HeatmapCell[];
  matchTypes: string[];
  brainKeys: string[];
  brainColors: Record<string, string>;
  brainLabels: Record<string, string>;
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  league_standard:       'Lig (Standart)',
  derby_match:           'Derby',
  cup_final:             'Kupa Finali',
  live_60min:            'Canlı (60\')',
  weather_extreme:       'Aşırı Hava',
  transfer_window_chaos: 'Tr. Penceresi',
};

function cellColor(accuracy: number | null): string {
  if (accuracy == null) return '#1e3a5f';
  if (accuracy >= 0.7) return '#065f46';
  if (accuracy >= 0.55) return '#14532d';
  if (accuracy >= 0.45) return '#92400e';
  if (accuracy >= 0.35) return '#7f1d1d';
  return '#450a0a';
}

function textColor(accuracy: number | null): string {
  if (accuracy == null) return '#475569';
  return '#e2e8f0';
}

export default function BrainHeatmap({ cells, matchTypes, brainKeys, brainColors, brainLabels }: BrainHeatmapProps) {
  const lookup: Record<string, Record<string, number | null>> = {};
  for (const c of cells) {
    if (!lookup[c.match_type]) lookup[c.match_type] = {};
    lookup[c.match_type][c.brain_key] = c.accuracy;
  }

  if (!matchTypes.length || !brainKeys.length) {
    return (
      <div className="flex items-center justify-center h-32 text-navy-500 text-sm">
        Isı haritası için veri yok
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left text-navy-500 font-medium w-32">Maç Tipi</th>
            {brainKeys.map(bk => (
              <th key={bk} className="px-2 py-2 text-center font-medium" style={{ color: brainColors[bk] ?? '#94a3b8' }}>
                {brainLabels[bk] ?? bk}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matchTypes.map(mt => (
            <tr key={mt}>
              <td className="px-3 py-1.5 text-navy-400 whitespace-nowrap font-medium">
                {MATCH_TYPE_LABELS[mt] ?? mt}
              </td>
              {brainKeys.map(bk => {
                const acc = lookup[mt]?.[bk] ?? null;
                return (
                  <td key={bk} className="px-1 py-1">
                    <div
                      className="rounded text-center py-1.5 px-1 font-mono font-semibold transition-all"
                      style={{ backgroundColor: cellColor(acc), color: textColor(acc) }}
                    >
                      {acc != null ? `${(acc * 100).toFixed(0)}%` : '—'}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
