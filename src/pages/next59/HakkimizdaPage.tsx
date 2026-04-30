import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Info, ChevronRight } from 'lucide-react';

export default function HakkimizdaPage() {
  useEffect(() => { document.title = 'Hakkımızda | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <Link to="/next59" className="hover:text-champagne transition-colors">Next59</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Hakkımızda</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Info className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Hakkımızda</h1>
              <p className="mt-1 text-sm text-navy-400">Next59 nedir ve ne yapar?</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <h2 className="text-base font-semibold text-white mb-3">Next59 Nedir?</h2>
          <p className="text-sm text-navy-400 leading-relaxed">
            Next59, futbol zekâsı ve editoryal veri okuması platformudur. 2000'den 2025'e uzanan 65.000'den fazla maç kaydı üzerine inşa edilmiş arşivimizle, futbolu sayılar üzerinden okumayı hedefliyoruz.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-white mb-3">Ne Yapmıyoruz?</h2>
          <p className="text-sm text-navy-400 leading-relaxed">
            Next59 bir bahis platformu değildir. Bahis tavsiyesi, kupon önerisi veya yatırım rehberi sunmuyoruz. Tüm içeriklerimiz; futbolun olasılıklarını, veriye dayalı senaryolarla anlatmayı amaçlar.
          </p>
        </div>
        <div>
          <h2 className="text-base font-semibold text-white mb-3">Hedefimiz</h2>
          <p className="text-sm text-navy-400 leading-relaxed">
            Futbol taraftarının maçı izlerken "bu hikâye böyle mi akacak?" sorusunu daha heyecanlı sormasını sağlamak. Veriyle çalışan, tarafsız bir futbol gazeteciliği.
          </p>
        </div>
      </div>
    </div>
  );
}
