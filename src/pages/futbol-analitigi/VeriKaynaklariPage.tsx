import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Database, ChevronRight } from 'lucide-react';

const fields = [
  { name: 'match_date', desc: 'Maç tarihi' },
  { name: 'competition_name', desc: 'Lig / Turnuva adı' },
  { name: 'season_label', desc: 'Sezon etiketi' },
  { name: 'home_team_name / away_team_name', desc: 'Ev sahibi ve deplasman takımı' },
  { name: 'home_score_ft / away_score_ft', desc: 'Maç sonu skoru' },
  { name: 'home_score_ht / away_score_ht', desc: 'İlk yarı skoru' },
  { name: 'result', desc: 'H = Ev kazandı, D = Beraberlik, A = Deplasman kazandı' },
  { name: 'referee', desc: 'Hakem adı (mevcut ise)' },
  { name: 'home_total_shots / away_total_shots', desc: 'Toplam şut' },
  { name: 'home_shots_on_goal / away_shots_on_goal', desc: 'İsabetli şut' },
  { name: 'home_corner_kicks / away_corner_kicks', desc: 'Korner' },
  { name: 'home_fouls / away_fouls', desc: 'Faul' },
  { name: 'home_yellow_cards / away_yellow_cards', desc: 'Sarı kart' },
  { name: 'home_red_cards / away_red_cards', desc: 'Kırmızı kart' },
];

export default function VeriKaynaklariPage() {
  useEffect(() => { document.title = 'Veri Kaynakları | Futbol Analitiği | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <Link to="/futbol-analitigi" className="hover:text-champagne transition-colors">Futbol Analitiği</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Veri Kaynakları</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Database className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Veri Kaynakları</h1>
              <p className="mt-1 text-sm text-navy-400">Arşivde kullanılan veri alanları ve kapsam bilgisi.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-navy-900/60 border border-navy-800 rounded-xl p-4 mb-8">
          <p className="text-sm text-navy-300 leading-relaxed">
            Arşiv <span className="text-white font-semibold">65.104 maç</span> içerir. Kapsam 2000–2025 yılları ve 21 lig / turnuvadır. Tüm veriler geçmiş maç kayıtlarından oluşur; canlı veri kullanılmaz.
          </p>
        </div>

        <h2 className="text-sm font-semibold text-navy-400 uppercase tracking-wider mb-4">Mevcut Alanlar</h2>
        <div className="divide-y divide-navy-800/50">
          {fields.map((f) => (
            <div key={f.name} className="py-3 flex items-start gap-4">
              <code className="text-xs font-mono text-champagne/80 bg-navy-800/60 px-2 py-0.5 rounded shrink-0">
                {f.name}
              </code>
              <span className="text-sm text-navy-400">{f.desc}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-navy-900/40 border border-navy-800/50 rounded-xl p-4">
          <p className="text-xs text-navy-600 leading-relaxed">
            İstatistik alanları (şut, korner, kart vb.) tüm maçlar için mevcut değildir. Veri yoksa ilgili alan gösterilmez.
          </p>
        </div>
      </div>
    </div>
  );
}
