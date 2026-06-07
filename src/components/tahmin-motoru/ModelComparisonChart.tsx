import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface ModelDataPoint {
  version: string;
  brier: number | null;
  accuracy: number | null;
}

interface ModelComparisonChartProps {
  data: ModelDataPoint[];
}

const formatBrier = (v: number) => v.toFixed(3);
const formatAcc   = (v: number) => `${(v * 100).toFixed(0)}%`;

export default function ModelComparisonChart({ data }: ModelComparisonChartProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-navy-500 text-sm">
        Grafik için veri yok
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
        <XAxis dataKey="version" tick={{ fill: '#64748b', fontSize: 10 }} />
        <YAxis
          yAxisId="brier"
          domain={[0, 0.5]}
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickFormatter={formatBrier}
          width={38}
        />
        <YAxis
          yAxisId="acc"
          orientation="right"
          domain={[0, 1]}
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickFormatter={formatAcc}
          width={38}
        />
        <Tooltip
          contentStyle={{ background: '#0f1d2a', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: '#94a3b8' }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((value: unknown, name: string) => {
            const v = value as number;
            return name === 'brier' ? [formatBrier(v), 'Brier Skoru'] : [formatAcc(v), 'Doğruluk'];
          }) as any}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
          formatter={(val) => val === 'brier' ? 'Brier Skoru' : 'Doğruluk'}
        />
        <ReferenceLine yAxisId="brier" y={0.25} stroke="#EF4444" strokeDasharray="4 2" strokeWidth={1} />
        <Line
          yAxisId="brier"
          type="monotone"
          dataKey="brier"
          stroke="#F59E0B"
          strokeWidth={2}
          dot={{ fill: '#F59E0B', r: 3 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
        <Line
          yAxisId="acc"
          type="monotone"
          dataKey="accuracy"
          stroke="#10B981"
          strokeWidth={2}
          dot={{ fill: '#10B981', r: 3 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
