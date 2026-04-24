import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const productLinks = [
  { label: 'Ozellikler', to: '/features' },
  { label: 'Fiyatlandirma', to: '/pricing' },
  { label: 'SSS', to: '/faq' },
];

const legalLinks = [
  { label: 'Gizlilik Politikasi', to: '/privacy' },
  { label: 'Kullanim Sartlari', to: '/terms' },
  { label: 'KVKK Aydinlatma Metni', to: '/kvkk' },
  { label: 'Cerez Politikasi', to: '/cookies' },
];

const socialLinks = [
  { label: 'Twitter / X', to: '#' },
  { label: 'Instagram', to: '#' },
  { label: 'Discord', to: '#' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-navy-900 border-t border-navy-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2 group">
              <Shield className="w-7 h-7 text-gold-500 group-hover:text-gold-400 transition-colors" />
              <span className="text-lg font-bold text-white tracking-tight">Next59</span>
            </Link>
            <p className="mt-3 text-sm text-navy-300 leading-relaxed max-w-xs">
              AI destekli futbol analiz platformu. Macin 90 dakikasini, mac baslamadan yaziyoruz.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">Urun</h4>
            <ul className="space-y-2.5">
              {productLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-navy-300 hover:text-gold-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">Yasal</h4>
            <ul className="space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-navy-300 hover:text-gold-400 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">Takip Et</h4>
            <ul className="space-y-2.5">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.to}
                    className="text-sm text-navy-300 hover:text-gold-400 transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="py-6 border-t border-navy-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-navy-500">
            &copy; {year} Next59. Tum haklari saklidir.
          </p>
          <p className="text-xs text-navy-600">
            Bu platform yatirim tavsiyesi vermez. Icerikler yalnizca bilgilendirme amacidir.
          </p>
        </div>
      </div>
    </footer>
  );
}
