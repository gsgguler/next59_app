import { Link } from 'react-router-dom';
import Logo from '../Logo';

const quickLinks = [
  { label: 'Maçlar', to: '/matches' },
  { label: 'Tahminler', to: '/predictions' },
  { label: 'Hakkımızda', to: '/about' },
];

const legalLinks = [
  { label: 'Gizlilik Politikası', to: '/privacy' },
  { label: 'Kullanım Şartları', to: '/terms' },
  { label: 'KVKK Aydınlatma Metni', to: '/kvkk' },
  { label: 'Çerez Politikası', to: '/cookies' },
];

const socialLinks = [
  { label: 'Twitter / X', href: '#' },
  { label: 'Instagram', href: '#' },
  { label: 'Discord', href: '#' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-navy-900 border-t border-navy-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Columns */}
        <div className="py-12 grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Logo size="sm" linkTo="/" />
            <p className="mt-4 text-sm text-navy-300 leading-relaxed max-w-xs">
              Veri odaklı futbol gazeteciliği. Maçın 90 dakikasını, maç başlamadan yazıyoruz.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">
              Hızlı Linkler
            </h4>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-navy-300 hover:text-champagne transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">
              Yasal
            </h4>
            <ul className="space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-navy-300 hover:text-champagne transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">
              Sosyal
            </h4>
            <ul className="space-y-2.5">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-navy-300 hover:text-champagne transition-colors"
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

        {/* Bottom bar */}
        <div className="py-6 border-t border-navy-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-navy-500">
            &copy; {year} Next59. Tüm hakları saklıdır.
          </p>
          <p className="text-xs text-navy-600 text-center sm:text-right max-w-md">
            Bu platform yatırım tavsiyesi vermez. İçerikler yalnızca bilgilendirme amaçlıdır.
          </p>
        </div>
      </div>
    </footer>
  );
}
