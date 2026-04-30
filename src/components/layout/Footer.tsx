import { Link } from 'react-router-dom';
import Logo from '../Logo';
import { useTranslation } from '../../locales/hero';

const quickLinks = [
  { label: 'Ma\u00e7lar', to: '/matches' },
  { label: 'Tahminler', to: '/predictions' },
  { label: 'Hakk\u0131m\u0131zda', to: '/about' },
];

const legalLinks = [
  { label: 'Gizlilik Politikas\u0131', to: '/privacy' },
  { label: 'Kullan\u0131m \u015eartlar\u0131', to: '/terms' },
  { label: 'KVKK Ayd\u0131nlatma Metni', to: '/kvkk' },
  { label: '\u00c7erez Politikas\u0131', to: '/cookies' },
];

const socialLinks = [
  { label: 'Twitter / X', href: '#' },
  { label: 'Instagram', href: '#' },
  { label: 'Discord', href: '#' },
];

export default function Footer() {
  const year = new Date().getFullYear();
  const { t } = useTranslation();

  return (
    <footer className="bg-navy-900 border-t border-navy-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Columns */}
        <div className="py-12 grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Logo size="sm" linkTo="/" />
            <div className="footer-tagline max-w-xs">
              <p className="mt-4 text-sm text-white/60 leading-relaxed">
                {t('footer.tagline_line1')}<br />
                {t('footer.tagline_line2')}
              </p>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">
              H\u0131zl\u0131 Linkler
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
            &copy; {year} Next59. T\u00fcm haklar\u0131 sakl\u0131d\u0131r.
          </p>
          <p className="text-xs text-navy-600 text-center sm:text-right max-w-md">
            Bu platform yat\u0131r\u0131m tavsiyesi vermez. \u0130\u00e7erikler yaln\u0131zca bilgilendirme ama\u00e7l\u0131d\u0131r.
          </p>
        </div>
      </div>
    </footer>
  );
}
