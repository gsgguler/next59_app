import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart2, BookOpen, Database, FlaskConical, BookMarked, ChevronRight } from 'lucide-react';

const sections = [
  {
    icon: BookOpen,
    title: 'Nasıl Çalışır?',
    desc: 'Next59\'un veri okuma yöntemi ve maç analizi yaklaşımı.',
    to: '/futbol-analitigi/nasil-calisir',
  },
  {
    icon: BarChart2,
    title: 'Metodoloji',
    desc: 'Model mantığı, form hesaplama, ev/deplasman ayrımı ve sınırlamalar.',
    to: '/futbol-analitigi/metodoloji',
  },
  {
    icon: Database,
    title: 'Veri Kaynakları',
    desc: 'Arşivdeki veri alanları, kaynakları ve kapsama hakkında bilgi.',
    to: '/futbol-analitigi/veri-kaynaklari',
  },
  {
    icon: FlaskConical,
    title: 'Backtest Merkezi',
    desc: 'Senaryo ve model performansının geçmiş maçlarla değerlendirilmesi.',
    to: '/futbol-analitigi/backtest',
  },
  {
    icon: BookMarked,
    title: 'Futbol Analitiği Sözlüğü',
    desc: 'FT, HT, form, ev avantajı, şut hacmi ve daha fazlası.',
    to: '/futbol-analitigi/sozluk',
  },
];

export default function FutbolAnalitigiPage() {
  useEffect(() => {
    document.title = 'Futbol Analitiği | Next59';
  }, []);

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <BarChart2 className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white font-display">Futbol Analitiği</h1>
              <p className="mt-2 text-sm text-navy-400 max-w-xl leading-relaxed">
                Next59 geçmiş maç verilerini, skorları, takım performanslarını ve maç istatistiklerini kullanarak futbolu veri üzerinden okumaya çalışır. Bahis tavsiyesi değil; futbol okuması.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid gap-3 sm:grid-cols-2">
          {sections.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="flex items-start gap-4 bg-navy-900/50 hover:bg-navy-900 border border-navy-800/60 hover:border-navy-700 rounded-xl p-5 transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-navy-800 flex items-center justify-center shrink-0 group-hover:bg-champagne/10 group-hover:border group-hover:border-champagne/20 transition-all">
                <s.icon className="w-5 h-5 text-navy-400 group-hover:text-champagne transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-champagne transition-colors">
                  {s.title}
                </p>
                <p className="text-xs text-navy-500 mt-1 leading-relaxed">{s.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-navy-700 group-hover:text-navy-400 transition-colors shrink-0 mt-0.5" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
