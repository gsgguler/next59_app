import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '../Logo';
import { ManifestoBody } from '../legal/ManifestoBody';

const socialLinks = [
  { label: 'Twitter / X', href: '#' },
  { label: 'Instagram', href: '#' },
  { label: 'Discord', href: '#' },
];

export default function Footer() {
  const year = new Date().getFullYear();
  const { t } = useTranslation(['common', 'legal']);
  const { lang } = useParams();
  const p = lang ? `/${lang}` : '';

  const quickLinks = [
    { label: 'Maçlar', to: `${p}/matches` },
    { label: 'Tahminler', to: `${p}/predictions` },
    { label: 'Hakkımızda', to: `${p}/about` },
  ];

  const legalLinks = [
    { label: 'Gizlilik Politikası', to: `${p}/privacy` },
    { label: 'Kullanım Şartları', to: `${p}/terms` },
    { label: 'KVKK Aydınlatma Metni', to: `${p}/kvkk` },
    { label: 'Çerez Politikası', to: `${p}/cookies` },
  ];
  const [legalOpen, setLegalOpen] = useState(false);

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

        {/* === LEGAL NOTICE SECTION (always present, expand/collapse) === */}
        <section
          aria-label={t('legal:disclaimer.footer_title')}
          data-testid="footer-legal-section"
          className="border-t border-white/10 pt-8 mt-12"
        >
          <button
            onClick={() => setLegalOpen(!legalOpen)}
            aria-expanded={legalOpen}
            aria-controls="footer-legal-content"
            className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors group"
          >
            <span className="font-semibold uppercase tracking-wider">
              {t('legal:disclaimer.footer_title')}
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform group-hover:text-white ${
                legalOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {!legalOpen && (
            <p className="mt-3 text-sm text-white/50 max-w-3xl">
              {t('legal:disclaimer.lead_short')}
            </p>
          )}

          <AnimatePresence initial={false}>
            {legalOpen && (
              <motion.div
                id="footer-legal-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="overflow-hidden mt-4"
              >
                <div className="max-w-3xl pb-4">
                  <ManifestoBody textTone="neutral" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

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
