import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, User, LogOut } from 'lucide-react';
import Logo from '../Logo';
import Countdown from '../Countdown';
import AuthModal from '../AuthModal';
import { useAuth } from '../../contexts/AuthContext';

// ─── Nav tree ────────────────────────────────────────────────────────────────

interface NavChild {
  label: string;
  to: string;
}

interface NavItem {
  label: string;
  to: string;
  children?: NavChild[];
}

const NAV: NavItem[] = [
  { label: 'Ana Sayfa', to: '/' },
  {
    label: 'Maç Arşivi',
    to: '/mac-arsivi',
    children: [
      { label: 'Tüm Maçlar', to: '/mac-arsivi' },
      { label: 'Ligler', to: '/mac-arsivi/ligler' },
      { label: 'Sezonlar', to: '/mac-arsivi/sezonlar' },
      { label: 'Takımlar', to: '/mac-arsivi/takimlar' },
      { label: 'Takım Karşılaştırma', to: '/mac-arsivi/karsilastir' },
      { label: 'Hakem Arşivi', to: '/mac-arsivi/hakemler' },
    ],
  },
  {
    label: 'Futbol Analitiği',
    to: '/futbol-analitigi',
    children: [
      { label: 'Nasıl Çalışır?', to: '/futbol-analitigi/nasil-calisir' },
      { label: 'Metodoloji', to: '/futbol-analitigi/metodoloji' },
      { label: 'Veri Kaynakları', to: '/futbol-analitigi/veri-kaynaklari' },
      { label: 'Backtest Merkezi', to: '/futbol-analitigi/backtest' },
      { label: 'Sözlük', to: '/futbol-analitigi/sozluk' },
    ],
  },
  {
    label: 'Senaryolar',
    to: '/senaryolar',
    children: [
      { label: 'Örnek Maç Senaryoları', to: '/senaryolar' },
      { label: 'Geçmiş Maç Okumaları', to: '/senaryolar/gecmis-mac-okumalari' },
      { label: 'Favori Neden Kaybeder?', to: '/senaryolar/favori-neden-kaybeder' },
      { label: 'Maç Hikâyeleri', to: '/senaryolar/mac-hikayeleri' },
    ],
  },
  {
    label: 'Yazılar',
    to: '/yazilar',
    children: [
      { label: 'Tüm Yazılar', to: '/yazilar' },
      { label: 'Analiz Yazıları', to: '/yazilar/analizler' },
      { label: 'Dünya Kupası 2026', to: '/yazilar/dunya-kupasi-2026' },
      { label: 'Editör Notları', to: '/yazilar/editor-notlari' },
    ],
  },
  {
    label: 'Next59',
    to: '/next59',
    children: [
      { label: 'Hakkımızda', to: '/next59/hakkimizda' },
      { label: 'Yayın İlkeleri', to: '/next59/yayin-ilkeleri' },
      { label: 'Bahis Karşıtı Duruş', to: '/next59/bahis-karsiti-durus' },
      { label: 'Sıkça Sorulan Sorular', to: '/next59/sss' },
      { label: 'Basın', to: '/next59/basin' },
      { label: 'İletişim', to: '/next59/iletisim' },
    ],
  },
  { label: 'World Cup 2026', to: '/world-cup-2026' },
];

// ─── Desktop dropdown item ────────────────────────────────────────────────────

function DropdownNavItem({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const isActive =
    location.pathname === item.to ||
    (item.children?.some((c) => location.pathname.startsWith(c.to) && c.to !== '/') ?? false);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!item.children) {
    return (
      <NavLink
        to={item.to}
        end={item.to === '/'}
        className={({ isActive: a }) =>
          `relative text-sm font-medium px-3 py-2 rounded-lg transition-all ${
            a ? 'text-champagne' : 'text-navy-300 hover:text-white hover:bg-navy-800/50'
          }`
        }
      >
        {({ isActive: a }) => (
          <>
            {item.label}
            {a && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-champagne rounded-full" />}
          </>
        )}
      </NavLink>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-lg transition-all ${
          isActive
            ? 'text-champagne'
            : 'text-navy-300 hover:text-white hover:bg-navy-800/50'
        }`}
      >
        {item.label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        {isActive && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-champagne rounded-full" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-52 bg-navy-900 border border-navy-700/50 rounded-xl shadow-2xl shadow-navy-950/80 overflow-hidden z-50 animate-scale-in">
          {item.children.map((child) => (
            <Link
              key={child.to}
              to={child.to}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm transition-colors ${
                location.pathname === child.to
                  ? 'text-champagne bg-navy-800/60'
                  : 'text-navy-300 hover:text-white hover:bg-navy-800/60'
              }`}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mobile accordion item ────────────────────────────────────────────────────

function MobileNavItem({
  item,
  onClose,
  openAuth,
}: {
  item: NavItem;
  onClose: () => void;
  openAuth: (m: 'login' | 'register') => void;
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  if (!item.children) {
    return (
      <Link
        to={item.to}
        onClick={onClose}
        className="block text-sm font-medium text-navy-300 hover:text-white px-3 py-3 rounded-lg hover:bg-navy-800/50 transition-colors"
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-sm font-medium text-navy-300 hover:text-white px-3 py-3 rounded-lg hover:bg-navy-800/50 transition-colors"
      >
        {item.label}
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-3 border-l border-navy-700/50 pl-3 mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <Link
              key={child.to}
              to={child.to}
              onClick={onClose}
              className={`block text-sm py-2 px-2 rounded-lg transition-colors ${
                location.pathname === child.to
                  ? 'text-champagne'
                  : 'text-navy-400 hover:text-white hover:bg-navy-800/40'
              }`}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main header ──────────────────────────────────────────────────────────────

export default function PublicHeader() {
  const { user, profile, signOut, loading } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [authModal, setAuthModal] = useState<{ open: boolean; mode: 'login' | 'register' }>({
    open: false,
    mode: 'register',
  });
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const initials = profile?.display_name
    ? profile.display_name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?';

  function openAuth(mode: 'login' | 'register') {
    setAuthModal({ open: true, mode });
    setMobileOpen(false);
  }

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-navy-950/95 backdrop-blur-md border-b border-navy-800/60 shadow-lg shadow-navy-950/50'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <Logo size="sm" linkTo="/" />
            </div>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-0.5">
              {NAV.map((item) => (
                <DropdownNavItem key={item.to} item={item} />
              ))}
            </nav>

            {/* Right: Countdown + Auth */}
            <div className="hidden md:flex items-center gap-3 shrink-0">
              <Countdown compact />
              <div className="h-5 w-px bg-navy-700" />

              {!loading && !user ? (
                <>
                  <button
                    onClick={() => openAuth('login')}
                    className="text-sm font-medium text-navy-200 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-navy-800/50"
                  >
                    Giriş
                  </button>
                  <button
                    onClick={() => openAuth('register')}
                    className="text-sm font-semibold bg-champagne hover:bg-champagne-light text-navy-950 px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Ücretsiz Başlat
                  </button>
                </>
              ) : !loading && user ? (
                <div className="relative" ref={userDropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-navy-800/50 transition-colors"
                  >
                    <span className="w-8 h-8 rounded-full bg-champagne/20 border border-champagne/30 flex items-center justify-center text-xs font-bold text-champagne">
                      {initials}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-navy-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-52 bg-navy-900 border border-navy-700/50 rounded-xl shadow-2xl shadow-navy-950/80 overflow-hidden animate-scale-in z-50">
                      <div className="px-4 py-3 border-b border-navy-800">
                        <p className="text-sm font-medium text-white truncate">
                          {profile?.display_name ?? 'Kullanıcı'}
                        </p>
                        <p className="text-xs text-navy-400 truncate mt-0.5">{user.email}</p>
                      </div>
                      <div className="py-1">
                        <Link
                          to="/profile"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-navy-300 hover:text-white hover:bg-navy-800/60 transition-colors"
                        >
                          <User className="w-4 h-4" />
                          Profil
                        </Link>
                        <button
                          onClick={() => { setDropdownOpen(false); signOut(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-navy-300 hover:text-red-400 hover:bg-navy-800/60 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Çıkış Yap
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-lg text-navy-200 hover:text-white hover:bg-navy-800/50 transition-colors"
              aria-label="Menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-navy-800/50 bg-navy-950/98 backdrop-blur-lg animate-fade-in max-h-[calc(100dvh-64px)] overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
              {NAV.map((item) => (
                <MobileNavItem
                  key={item.to}
                  item={item}
                  onClose={() => setMobileOpen(false)}
                  openAuth={openAuth}
                />
              ))}

              <div className="pt-3 border-t border-navy-800/50 mt-2">
                <div className="flex justify-center py-2">
                  <Countdown compact />
                </div>
              </div>

              {!loading && !user ? (
                <div className="pt-3 flex flex-col gap-2">
                  <button
                    onClick={() => openAuth('login')}
                    className="w-full text-center text-sm font-medium text-navy-200 hover:text-white border border-navy-700 py-2.5 rounded-lg transition-colors"
                  >
                    Giriş Yap
                  </button>
                  <button
                    onClick={() => openAuth('register')}
                    className="w-full text-center text-sm font-semibold bg-champagne hover:bg-champagne-light text-navy-950 py-2.5 rounded-lg transition-colors"
                  >
                    Ücretsiz Başlat
                  </button>
                </div>
              ) : !loading && user ? (
                <div className="pt-3 flex flex-col gap-2">
                  <Link
                    to="/profile"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 text-sm text-navy-300 hover:text-white px-3 py-2.5 rounded-lg hover:bg-navy-800/50 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Profil
                  </Link>
                  <button
                    onClick={() => { setMobileOpen(false); signOut(); }}
                    className="w-full flex items-center gap-2.5 text-sm text-navy-300 hover:text-red-400 px-3 py-2.5 rounded-lg hover:bg-navy-800/50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Çıkış Yap
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </header>

      <AuthModal
        isOpen={authModal.open}
        onClose={() => setAuthModal((s) => ({ ...s, open: false }))}
        defaultMode={authModal.mode}
      />
    </>
  );
}
