import { Link } from 'react-router-dom';
import Logo from '../Logo';

const archiveLinks = [
  { label: 'Maç Arşivi', to: '/mac-arsivi' },
  { label: 'Ligler', to: '/mac-arsivi/ligler' },
  { label: 'Sezonlar', to: '/mac-arsivi/sezonlar' },
  { label: 'Takım Karşılaştırma', to: '/mac-arsivi/karsilastir' },
];

const analyticsLinks = [
  { label: 'Nasıl Çalışır?', to: '/futbol-analitigi/nasil-calisir' },
  { label: 'Metodoloji', to: '/futbol-analitigi/metodoloji' },
  { label: 'Veri Kaynakları', to: '/futbol-analitigi/veri-kaynaklari' },
  { label: 'Sözlük', to: '/futbol-analitigi/sozluk' },
];

const legalLinks = [
  { label: 'Gizlilik Politikası', to: '/privacy' },
  { label: 'Kullanım Şartları', to: '/terms' },
  { label: 'KVKK Aydınlatma Metni', to: '/kvkk' },
  { label: 'Çerez Politikası', to: '/cookies' },
  { label: 'Yasal Uyarı', to: '/yasal-uyari' },
  { label: 'Bahis Karşıtı Duruş', to: '/next59/bahis-karsiti-durus' },
];

const aboutLinks = [
  { label: 'Hakkımızda', to: '/next59/hakkimizda' },
  { label: 'Yayın İlkeleri', to: '/next59/yayin-ilkeleri' },
  { label: 'SSS', to: '/next59/sss' },
  { label: 'İletişim', to: '/next59/iletisim' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-navy-900 border-t border-navy-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Columns */}
        <div className="py-12 grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Logo size="sm" linkTo="/" />
            <p className="mt-4 text-sm text-white/60 leading-relaxed max-w-xs">
              Next59 bir bahis platformu değildir.<br />
              Maç başlamadan önce 90 dakikanın olası akışını veriye, istatistiğe ve yapay zekâya dayalı olarak senaryolaştıran bir futbol zekâsıdır.
            </p>
          </div>

          {/* Archive */}
          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">
              Maç Arşivi
            </h4>
            <ul className="space-y-2.5">
              {archiveLinks.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-navy-300 hover:text-champagne transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Analytics */}
          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">
              Futbol Analitiği
            </h4>
            <ul className="space-y-2.5">
              {analyticsLinks.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-navy-300 hover:text-champagne transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About */}
          <div>
            <h4 className="text-xs font-semibold text-navy-400 uppercase tracking-wider mb-4">
              Next59
            </h4>
            <ul className="space-y-2.5">
              {aboutLinks.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-navy-300 hover:text-champagne transition-colors">
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
                  <Link to={link.to} className="text-sm text-navy-300 hover:text-champagne transition-colors">
                    {link.label}
                  </Link>
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
          <p className="text-xs text-navy-700 text-center sm:text-right max-w-md">
            Bu platform bahis tavsiyesi vermez. İçerikler yalnızca bilgilendirme ve eğlence amaçlıdır.
          </p>
        </div>
      </div>
    </footer>
  );
}
