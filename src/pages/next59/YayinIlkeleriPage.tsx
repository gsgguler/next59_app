import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronRight, Check } from 'lucide-react';

const principles = [
  { title: 'Şeffaf Veri Kullanımı', desc: 'Hangi verinin kullanıldığı ve kapsam sınırları açıkça belirtilir.' },
  { title: 'Bahis Tavsiyesi Yok', desc: 'Hiçbir içerik bahis, kupon veya yatırım tavsiyesi olarak sunulmaz.' },
  { title: 'Takım Taraftarlığı Yok', desc: 'Editoryal içerikler hiçbir takımı kayırmaz veya aşağılamaz.' },
  { title: 'Kitapçı Ortaklığı Yok', desc: 'Herhangi bir bahis şirketiyle reklam veya ortaklık ilişkisi bulunmaz.' },
  { title: 'Garanti Sonuç Yok', desc: 'Futbol sonuçları belirsizdir; kesin çıktı iddiasında bulunulmaz.' },
  { title: 'Okunabilir Analitik', desc: 'Teknik veriler, sıradan bir okuyucunun anlayabileceği dille aktarılır.' },
];

export default function YayinIlkeleriPage() {
  useEffect(() => { document.title = 'Yayın İlkeleri | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <Link to="/next59" className="hover:text-champagne transition-colors">Next59</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Yayın İlkeleri</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Yayın İlkeleri</h1>
              <p className="mt-1 text-sm text-readable-muted">Next59'un editoryal ilkeleri ve taahhütleri.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="space-y-3">
          {principles.map((p) => (
            <div key={p.title} className="flex items-start gap-4 bg-navy-900/40 border border-navy-800/60 rounded-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{p.title}</p>
                <p className="text-xs text-readable-muted mt-1 leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
