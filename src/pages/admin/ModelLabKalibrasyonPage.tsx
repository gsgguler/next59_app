import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, ChevronRight, AlertCircle, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CalibrationRow {
  id: string;
  group_type: string;
  group_key: string;
  sample_size: number;
  avg_brier_1x2: number | null;
  avg_log_loss_1x2: number | null;
  result_accuracy: number | null;
  over_2_5_accuracy: number | null;
  btts_accuracy: number | null;
  home_prediction_bias: number | null;
  draw_prediction_bias: number | null;
  away_prediction_bias: number | null;
}

const GROUP_TYPES = ['overall', 'competition', 'season', 'era_bucket', 'confidence_grade'];

export default function ModelLabKalibrasyonPage() {
  const [rows, setRows] = useState<CalibrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupType, setGroupType] = useState('overall');

  useEffect(() => {
    document.title = 'Kalibrasyon | Model Lab | Admin | Next59';
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .schema('model_lab' as never)
        .from('calibration_summary')
        .select('*')
        .eq('group_type', groupType)
        .order('sample_size', { ascending: false });
      setRows((data as CalibrationRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [groupType]);

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-navy-500 mb-6">
          <Link to="/admin/model-lab" className="hover:text-champagne transition-colors">Model Lab</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-navy-400">Kalibrasyon</span>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-2.5 mb-6 flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">Bu alan yalnızca model araştırma içindir. Public kullanıcıya gösterilmez.</p>
        </div>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
            <FlaskConical className="w-6 h-6 text-champagne" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Kalibrasyon</h1>
            <p className="text-sm text-navy-400 mt-1">Toplu kalibrasyon özeti. Yalnızca gerçek veriler gösterilir.</p>
          </div>
        </div>

        {/* Group type tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {GROUP_TYPES.map((g) => (
            <button
              key={g}
              onClick={() => setGroupType(g)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                groupType === g
                  ? 'bg-champagne/10 border-champagne/30 text-champagne'
                  : 'bg-navy-900 border-navy-700 text-navy-400 hover:text-white'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 bg-navy-900/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <AlertCircle className="w-8 h-8 text-navy-700" />
            <p className="text-sm text-navy-500 text-center">
              Bu grup için kalibrasyon verisi henüz oluşmadı.
            </p>
            <p className="text-xs text-navy-600 text-center max-w-sm">
              Backtest tamamlandıktan sonra kalibrasyon özeti burada görünecek.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-800">
                  {['Grup', 'N', 'Brier', 'Log Loss', 'Doğruluk', '2.5 Üst', 'BTTS', 'Ev Bias', 'Ber Bias', 'Dep Bias'].map((h) => (
                    <th key={h} className="text-left text-navy-500 font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/50">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-navy-900/40 transition-colors">
                    <td className="px-3 py-2.5 text-white font-medium">{r.group_key}</td>
                    <td className="px-3 py-2.5 text-navy-300 tabular-nums">{r.sample_size.toLocaleString('tr-TR')}</td>
                    <td className="px-3 py-2.5 text-navy-300 tabular-nums">{r.avg_brier_1x2 !== null ? Number(r.avg_brier_1x2).toFixed(4) : '–'}</td>
                    <td className="px-3 py-2.5 text-navy-300 tabular-nums">{r.avg_log_loss_1x2 !== null ? Number(r.avg_log_loss_1x2).toFixed(4) : '–'}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      <span className={r.result_accuracy !== null && Number(r.result_accuracy) > 0.5 ? 'text-emerald-400' : 'text-navy-300'}>
                        {r.result_accuracy !== null ? (Number(r.result_accuracy) * 100).toFixed(1) + '%' : '–'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-navy-300 tabular-nums">{r.over_2_5_accuracy !== null ? (Number(r.over_2_5_accuracy) * 100).toFixed(1) + '%' : '–'}</td>
                    <td className="px-3 py-2.5 text-navy-300 tabular-nums">{r.btts_accuracy !== null ? (Number(r.btts_accuracy) * 100).toFixed(1) + '%' : '–'}</td>
                    <td className="px-3 py-2.5 text-navy-300 tabular-nums">{r.home_prediction_bias !== null ? Number(r.home_prediction_bias).toFixed(3) : '–'}</td>
                    <td className="px-3 py-2.5 text-navy-300 tabular-nums">{r.draw_prediction_bias !== null ? Number(r.draw_prediction_bias).toFixed(3) : '–'}</td>
                    <td className="px-3 py-2.5 text-navy-300 tabular-nums">{r.away_prediction_bias !== null ? Number(r.away_prediction_bias).toFixed(3) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
