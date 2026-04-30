import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import type { ReactNode } from 'react';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

export default function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-900 border-b border-navy-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-navy-300 hover:text-gold-400 text-sm font-medium transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Ana Sayfa
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-6 h-6 text-gold-500" />
            <span className="text-sm font-semibold text-gold-500 tracking-wide">Next59</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{title}</h1>
          <p className="text-sm text-navy-400 mt-2">
            Son g\u00fcncelleme: {lastUpdated}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-10 shadow-sm">
          <div className="legal-content space-y-6 text-gray-700 text-sm leading-relaxed">
            {children}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Sorular\u0131n\u0131z i\u00e7in{' '}
            <a href="mailto:legal@next59.com" className="text-navy-600 hover:underline">
              legal@next59.com
            </a>{' '}
            adresinden bize ula\u015fabilirsiniz.
          </p>
        </div>
      </main>
    </div>
  );
}
