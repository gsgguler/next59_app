import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookMarked, ChevronRight, Search } from 'lucide-react';

const terms = [
  { term: 'FT', def: 'Full Time — Maç sonu. 90 dakika veya uzatmalar dahil nihai skor.' },
  { term: 'HT', def: 'Half Time — İlk yarı sonu skoru.' },
  { term: 'H', def: 'Home Win — Ev sahibi takımın kazandığı sonuç.' },
  { term: 'D', def: 'Draw — Beraberlik.' },
  { term: 'A', def: 'Away Win — Deplasman takımının kazandığı sonuç.' },
  { term: 'Form', def: 'Son N maçtaki performans sıralaması. Genellikle son 5 maç baz alınır.' },
  { term: 'Ev Avantajı', def: 'Takımların kendi sahalarında tarihsel olarak gösterdikleri performans artışı.' },
  { term: 'Şut Hacmi', def: 'Maç başına gerçekleştirilen toplam şut sayısı.' },
  { term: 'İsabetli Şut', def: 'Kaleye yönelen, kaleci tarafından kurtarılan veya gole dönen şutlar.' },
  { term: 'Korner', def: 'Savunma tarafından çizgi dışına atılan toplarda verilen korner vuruşu.' },
  { term: 'Kart Profili', desc: 'Kart Profili', def: 'Takımın sarı ve kırmızı kart geçmişine göre oluşturulan disiplin görüntüsü.' },
  { term: 'Gol Ortalaması', def: 'Maç başına düşen ortalama gol sayısı. Ev ve deplasman için ayrı hesaplanabilir.' },
  { term: 'Temiz Kale', def: 'Rakibe gol yenilmeden tamamlanan maç (Clean Sheet).' },
  { term: 'Her İki Takım Gol Atar (BTTS)', def: 'Her iki takımın da maçta en az birer gol atması durumu.' },
  { term: 'Veri Arşivi', def: 'Next59\'un kullandığı, geçmiş maç kayıtlarından oluşan tarihsel veri tabanı. Canlı veri içermez.' },
];

export default function SozlukPage() {
  const [q, setQ] = useState('');
  useEffect(() => { document.title = 'Sözlük | Futbol Analitiği | Next59'; }, []);

  const filtered = terms.filter(
    (t) =>
      t.term.toLowerCase().includes(q.toLowerCase()) ||
      t.def.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <Link to="/futbol-analitigi" className="hover:text-champagne transition-colors">Futbol Analitiği</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Sözlük</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <BookMarked className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Futbol Analitiği Sözlüğü</h1>
              <p className="mt-1 text-sm text-navy-400">Kullanılan terimlerin kısa açıklamaları.</p>
            </div>
          </div>
          <div className="mt-6 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-500" />
            <input type="text" placeholder="Terim ara..." value={q} onChange={(e) => setQ(e.target.value)}
              className="w-full bg-navy-900 border border-navy-700 text-white text-sm rounded-lg pl-9 pr-4 py-2.5 placeholder-navy-600 focus:outline-none focus:ring-1 focus:ring-champagne/40 focus:border-champagne/40 transition-all" />
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="divide-y divide-navy-800/40">
          {filtered.map((t) => (
            <div key={t.term} className="py-4">
              <span className="text-sm font-bold text-white">{t.term}</span>
              <p className="text-sm text-navy-400 mt-1 leading-relaxed">{t.def}</p>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-navy-500 py-12 text-center">Eşleşen terim bulunamadı.</p>
          )}
        </div>
      </div>
    </div>
  );
}
