import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight } from 'lucide-react';

export default function NasilCalisirPage() {
  useEffect(() => {
    document.title = 'Nasıl Çalışır? | Futbol Analitiği | Next59';
  }, []);

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <Link to="/futbol-analitigi" className="hover:text-champagne transition-colors">Futbol Analitiği</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-navy-400">Nasıl Çalışır?</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Nasıl Çalışır?</h1>
              <p className="mt-1 text-sm text-navy-400">Next59'un veri okuma yöntemi ve analiz yaklaşımı.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <Section title="Temel Yaklaşım">
          <p>Next59 geçmiş maç verilerini, skorları, takım performanslarını ve maç istatistiklerini kullanarak futbolu veri üzerinden okumaya çalışır. Amaç, kesin sonuç tahmin etmek değil; maçın olası hikâyelerini sayısal bağlamla sunmaktır.</p>
        </Section>
        <Section title="Veri Kaynağı">
          <p>Arşiv, 2000–2025 yılları arasındaki 65.104 maçı kapsar. Veriler; lig, sezon, skor, yarı skor, hakemler ve temel istatistiklerden (şut, korner, kart) oluşur. Canlı veri kullanılmaz.</p>
        </Section>
        <Section title="Ne Yapmaz?">
          <ul className="space-y-1.5">
            {[
              'Bahis tavsiyesi vermez.',
              'Garanti veya kesin tahmin sunmaz.',
              'Kitapçılarla iş birliği yapmaz.',
              'Olasılık verilerini yatırım aracı olarak sunmaz.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-navy-400">
                <span className="text-red-400 mt-0.5 shrink-0">✕</span>
                {item}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-white mb-3">{title}</h2>
      <div className="text-sm text-navy-400 leading-relaxed">{children}</div>
    </div>
  );
}
