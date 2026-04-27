import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { Menu, X, ChevronDown, User, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Logo from '../Logo';
import { LanguageSelector } from '../LanguageSelector';
import Countdown from '../Countdown';
import AuthModal from '../AuthModal';
import { useAuth } from '../../contexts/AuthContext';

export default function PublicHeader() {
  const { user, profile, signOut, loading } = useAuth();
  const { t } = useTranslation();
  const { lang } = useParams();

  const navItems = [
    { label: t('nav.matches'), to: `/${lang}/matches` },
    { label: t('nav.predictions'), to: `/${lang}/predictions` },
    { label: t('nav.about'), to: `/${lang}/about` },
  ];
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [authModal, setAuthModal] = useState<{ open: boolean; mode: 'login' | 'register' }>({
    open: false,
    mode: 'register',
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
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
            {/* Left: Logo */}
            <div className="flex items-center gap-3">
              <Logo size="sm" linkTo="/" />
            </div>

            {/* Center: Nav + Countdown */}
            <div className="hidden lg:flex items-center gap-8">
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <HeaderNavLink key={item.to} to={item.to}>
                    {item.label}
                  </HeaderNavLink>
                ))}
              </nav>
              <div className="h-5 w-px bg-navy-700" />
              <Countdown compact />
            </div>

            {/* Right: Auth */}
            <div className="hidden md:flex items-center gap-3">
              <LanguageSelector />
              {!loading && !user ? (
                <>
                  <button
                    onClick={() => openAuth('login')}
                    className="text-sm font-medium text-navy-200 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-navy-800/50"
                  >
                    {t('nav.login')}
                  </button>
                  <button
                    onClick={() => openAuth('register')}
                    className="text-sm font-semibold bg-champagne hover:bg-champagne-light text-navy-950 px-5 py-2.5 rounded-lg transition-colors"
                  >
                    {t('nav.signup')}
                  </button>
                </>
              ) : !loading && user ? (
                <div className="relative" ref={dropdownRef}>
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
                    <div className="absolute right-0 top-full mt-2 w-52 bg-navy-900 border border-navy-700/50 rounded-xl shadow-2xl shadow-navy-950/80 overflow-hidden animate-scale-in">
                      <div className="px-4 py-3 border-b border-navy-800">
                        <p className="text-sm font-medium text-white truncate">
                          {profile?.display_name ?? t('nav.user')}
                        </p>
                        <p className="text-xs text-navy-400 truncate mt-0.5">
                          {user.email}
                        </p>
                      </div>
                      <div className="py-1">
                        <Link
                          to={`/${lang}/profile`}
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-navy-300 hover:text-white hover:bg-navy-800/60 transition-colors"
                        >
                          <User className="w-4 h-4" />
                          {t('nav.profile')}
                        </Link>
                        <button
                          onClick={() => { setDropdownOpen(false); signOut(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-navy-300 hover:text-red-400 hover:bg-navy-800/60 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          {t('nav.logout')}
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
              className="md:hidden p-2 rounded-lg text-navy-200 hover:text-white hover:bg-navy-800/50 transition-colors"
              aria-label="Menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-navy-800/50 bg-navy-950/98 backdrop-blur-lg animate-fade-in">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="block text-sm font-medium text-navy-300 hover:text-white px-3 py-3 rounded-lg hover:bg-navy-800/50 transition-colors"
                >
                  {item.label}
                </Link>
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
                    {t('nav.login')}
                  </button>
                  <button
                    onClick={() => openAuth('register')}
                    className="w-full text-center text-sm font-semibold bg-champagne hover:bg-champagne-light text-navy-950 py-2.5 rounded-lg transition-colors"
                  >
                    {t('nav.start_free')}
                  </button>
                </div>
              ) : !loading && user ? (
                <div className="pt-3 flex flex-col gap-2">
                  <Link
                    to={`/${lang}/profile`}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 text-sm text-navy-300 hover:text-white px-3 py-2.5 rounded-lg hover:bg-navy-800/50 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    {t('nav.profile')}
                  </Link>
                  <button
                    onClick={() => { setMobileOpen(false); signOut(); }}
                    className="w-full flex items-center gap-2.5 text-sm text-navy-300 hover:text-red-400 px-3 py-2.5 rounded-lg hover:bg-navy-800/50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('nav.logout')}
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

function HeaderNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative text-sm font-medium px-3 py-2 rounded-lg transition-all ${
          isActive
            ? 'text-champagne'
            : 'text-navy-300 hover:text-white hover:bg-navy-800/50'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {children}
          {isActive && (
            <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-champagne rounded-full" />
          )}
        </>
      )}
    </NavLink>
  );
}
