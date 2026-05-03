import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart2, ChevronRight } from 'lucide-react';

export default function MetodolojiPage() {
  useEffect(() => { document.title = 'Metodoloji | Futbol Analitiği | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <Link to="/futbol-analitigi" className="hover:text-champagne transition-colors">Futbol Analitiği</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Metodoloji</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <BarChart2 className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Metodoloji</h1>
              <p className="mt-1 text-sm text-navy-400">Model mantığı, veri işleme ve analitik yaklaşım.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {[
          { title: 'Form Analizi', body: 'Son N maçtaki performans, gol ortalamaları, kazanma oranı ve ev/deplasman ayrımı hesaplanır.' },
          { title: 'Ev/Deplasman Ayrımı', body: 'Takımların ev sahibi ve deplasman maçlarındaki istatistikleri ayrı ayrı değerlendirilir. Ev avantajı mutlak değil, göreli bir faktör olarak ele alınır.' },
          { title: 'Gol Eğilimi', body: 'Toplam gol ortalaması, ilk yarı/ikinci yarı dağılımı ve maç başına beklenen gol aralığı hesaplanır.' },
          { title: 'Sınırlamalar', body: 'Model geçmiş veriye dayanır. Kadro değişiklikleri, sakatlıklar, motivasyon faktörleri ve hava koşulları hesaba katılmaz. Sonuçlar tahmin değil; veri okumasıdır.' },
        ].map((s) => (
          <div key={s.title}>
            <h2 className="text-base font-semibold text-white mb-2">{s.title}</h2>
            <p className="text-sm text-navy-400 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
