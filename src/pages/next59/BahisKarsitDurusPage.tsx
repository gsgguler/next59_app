import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ChevronRight, X, Check } from 'lucide-react';

export default function BahisKarsitDurusPage() {
  useEffect(() => { document.title = 'Bahis Karşıtı Duruş | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <Link to="/next59" className="hover:text-champagne transition-colors">Next59</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Bahis Karşıtı Duruş</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Bahis Karşıtı Duruş</h1>
              <p className="mt-1 text-sm text-readable-muted">
                Next59'un bahis sektörüne karşı net tutumu.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-5">
          <p className="text-sm text-red-300 font-medium leading-relaxed">
            Next59 bir bahis platformu değildir ve hiçbir şekilde bahis tavsiyesi vermez.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-4">Next59 Nedir, Ne Değildir?</h2>
          <div className="space-y-2">
            {[
              { ok: false, text: 'Bahis sitesi' },
              { ok: false, text: 'Kupon öneri platformu' },
              { ok: false, text: 'İddaa tavsiye servisi' },
              { ok: false, text: 'Kitapçı ortağı' },
              { ok: false, text: 'Garanti tahmin kaynağı' },
              { ok: true, text: 'Futbol zekâsı ve veri okuma platformu' },
              { ok: true, text: 'Editoryal futbol analitiği' },
              { ok: true, text: 'Geçmiş maç arşivi ve istatistik servisi' },
              { ok: true, text: 'Veriyle çalışan futbol gazeteciliği' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${item.ok ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                  {item.ok
                    ? <Check className="w-3 h-3 text-emerald-400" />
                    : <X className="w-3 h-3 text-red-400" />}
                </span>
                <span className="text-sm text-readable-muted">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-3">İçerikler Ne Anlama Gelir?</h2>
          <p className="text-sm text-readable-muted leading-relaxed">
            İçerikler; futbolun olasılıklarını, veriye dayalı senaryolarla anlatır. Amaç, maçı izlerken "bu hikâye böyle mi akacak?" sorusunu daha heyecanlı kılmaktır. Sunulan sayısal veriler yatırım veya bahis aracı olarak kullanılmamalıdır.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-3">Yasal Uyarı</h2>
          <p className="text-sm text-readable-muted leading-relaxed">
            Bu platform yatırım tavsiyesi vermez. İçerikler yalnızca bilgilendirme ve eğlence amaçlıdır. Futbol sonuçları tahmin edilemez; tüm veriler geçmişe aittir ve gelecekteki sonuçları garanti etmez.
          </p>
        </div>
      </div>
    </div>
  );
}
