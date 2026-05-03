import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, ChevronRight, ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'Next59 bahis sitesi mi?',
    a: 'Hayır. Next59 bir bahis platformu değildir. Bahis tavsiyesi, kupon önerisi veya iddaa analizi sunmuyoruz. Platform tamamen futbol veri okuması ve editoryal analizle ilgilidir.',
  },
  {
    q: 'Next59 kesin sonuç verir mi?',
    a: 'Hayır. Futbol, doğası gereği belirsizdir. Sunduğumuz veriler geçmişe aittir ve gelecekteki sonuçları garanti etmez. İçerikler bilgilendirme ve futbolu daha derin okuma amacıyla sunulur.',
  },
  {
    q: 'Veriler nereden geliyor?',
    a: '2000–2025 yılları arasındaki 65.104 maç kaydından oluşan bir veri arşivinden geliyor. Veriler; skor, sezon, lig, istatistikler (şut, korner, kart) ve hakem bilgilerini içerir.',
  },
  {
    q: 'Maç arşivi canlı veri mi?',
    a: 'Hayır. Maç arşivi yalnızca geçmiş maç kayıtlarından oluşturulmuştur. Canlı maç verisi içermez.',
  },
  {
    q: 'Senaryolar ne anlama geliyor?',
    a: 'Senaryolar, geçmiş veri örüntüleri üzerinden maçın olası hikâyelerini anlatan yazılardır. "Favori neden kaybeder?", "Bu takım deplasmanda nasıl oynar?" gibi sorulara veriyle yaklaşır. Bahis tavsiyesi değildir.',
  },
  {
    q: 'Ücretsiz mi?',
    a: 'Maç arşivi ve temel içerikler ücretsizdir. Kayıt olmak için e-posta adresiniz yeterlidir.',
  },
];

export default function SssPage() {
  useEffect(() => { document.title = 'Sıkça Sorulan Sorular | Next59'; }, []);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <Link to="/next59" className="hover:text-champagne transition-colors">Next59</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Sıkça Sorulan Sorular</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <HelpCircle className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Sıkça Sorulan Sorular</h1>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="divide-y divide-navy-800/50">
          {faqs.map((faq, i) => (
            <div key={i} className="py-4">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-start justify-between gap-4 text-left"
              >
                <span className="text-sm font-medium text-white">{faq.q}</span>
                <ChevronDown className={`w-4 h-4 text-navy-400 shrink-0 mt-0.5 transition-transform ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <p className="mt-3 text-sm text-readable-muted leading-relaxed">{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
