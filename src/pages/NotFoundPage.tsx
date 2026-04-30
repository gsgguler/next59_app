import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function NotFoundPage() {
  const { user } = useAuth();
  const homePath = user ? '/dashboard' : '/';

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="relative mb-8">
          <span className="text-[10rem] sm:text-[12rem] font-black leading-none tracking-tighter text-navy-800 select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-lg shadow-gold-500/20 rotate-12">
              <span className="text-4xl font-black text-navy-900 -rotate-12">?</span>
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">
          Sayfa Bulunamadı
        </h1>
        <p className="text-gray-400 leading-relaxed mb-8 max-w-sm mx-auto">
          Aradığınız sayfa mevcut değil, taşınmış veya kaldırılmış olabilir.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to={homePath}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 text-navy-900 font-semibold text-sm hover:from-gold-400 hover:to-gold-500 transition-all shadow-sm"
          >
            <Home className="w-4 h-4" />
            {user ? 'Dashboard\'a Dön' : 'Ana Sayfaya Dön'}
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-navy-800 border border-navy-700 text-gray-300 font-medium text-sm hover:bg-navy-700 hover:text-white transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Geri Dön
          </button>
        </div>
      </div>
    </div>
  );
}
