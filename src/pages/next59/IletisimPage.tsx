import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ChevronRight } from 'lucide-react';

export default function IletisimPage() {
  useEffect(() => { document.title = 'İletişim | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <Link to="/next59" className="hover:text-champagne transition-colors">Next59</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">İletişim</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Mail className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">İletişim</h1>
              <p className="mt-1 text-sm text-navy-400">Bize ulaşın.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-navy-900/50 border border-navy-800 rounded-xl p-6 max-w-sm">
          <p className="text-xs text-navy-500 uppercase tracking-wider mb-2">E-posta</p>
          <p className="text-sm text-navy-300 leading-relaxed">
            İletişim bilgileri yakında güncellenecek.
          </p>
        </div>
        <p className="mt-6 text-xs text-navy-600">
          Basın sorguları için <Link to="/next59/basin" className="text-champagne/60 hover:text-champagne transition-colors">Basın</Link> sayfasını ziyaret edin.
        </p>
      </div>
    </div>
  );
}
