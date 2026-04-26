import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Menu, X } from 'lucide-react';

export default function PublicHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'bg-navy-950/95 backdrop-blur-md border-b border-navy-800/60 shadow-lg shadow-navy-950/50'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <Shield className="w-7 h-7 text-gold-500 group-hover:text-gold-400 transition-colors" />
            <span className="text-xl font-bold text-white tracking-tight">Next59</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/#features">Özellikler</NavLink>
            <NavLink to="/#how-it-works">Nasıl Çalışır</NavLink>
            <NavLink to="/#pricing">Fiyatlar</NavLink>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-navy-200 hover:text-white transition-colors px-4 py-2"
            >
              Giriş Yap
            </Link>
            <Link
              to="/register"
              className="text-sm font-semibold bg-gold-500 hover:bg-gold-400 text-navy-950 px-5 py-2 rounded-lg transition-colors"
            >
              Üye Ol
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-navy-200 hover:text-white transition-colors"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4 border-t border-navy-800/50 mt-1 pt-3 space-y-1 animate-fade-in">
            <MobileNavLink to="/#features" onClick={() => setMobileOpen(false)}>Özellikler</MobileNavLink>
            <MobileNavLink to="/#how-it-works" onClick={() => setMobileOpen(false)}>Nasıl Çalışır</MobileNavLink>
            <MobileNavLink to="/#pricing" onClick={() => setMobileOpen(false)}>Fiyatlar</MobileNavLink>
            <div className="pt-3 flex flex-col gap-2">
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="text-center text-sm font-medium text-navy-200 hover:text-white border border-navy-700 py-2.5 rounded-lg transition-colors"
              >
                Giriş Yap
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileOpen(false)}
                className="text-center text-sm font-semibold bg-gold-500 hover:bg-gold-400 text-navy-950 py-2.5 rounded-lg transition-colors"
              >
                Üye Ol
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <a
      href={to}
      className="text-sm font-medium text-navy-300 hover:text-white px-3 py-2 rounded-lg hover:bg-navy-800/50 transition-all"
    >
      {children}
    </a>
  );
}

function MobileNavLink({ to, onClick, children }: { to: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <a
      href={to}
      onClick={onClick}
      className="block text-sm font-medium text-navy-300 hover:text-white px-3 py-2.5 rounded-lg hover:bg-navy-800/50 transition-colors"
    >
      {children}
    </a>
  );
}
