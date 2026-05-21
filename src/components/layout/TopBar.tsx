import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Search, Menu, LogOut, User, Settings, ShieldCheck, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Kullanıcı';
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-16 bg-navy-900 border-b border-readable-soft flex items-center justify-between px-4 lg:px-6 shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:bg-navy-800 hover:text-white transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 bg-navy-800 border border-readable-soft rounded-lg px-3 py-2 w-72 focus-within:border-readable-hover transition-colors">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Ara... (Cmd+K)"
            className="bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none flex-1"
          />
          <kbd className="hidden md:inline text-[10px] text-slate-500 bg-navy-700 px-1.5 py-0.5 rounded border border-readable-soft font-mono">
            K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg text-slate-400 hover:bg-navy-800 hover:text-white transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-navy-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-navy-600 border border-readable-hover flex items-center justify-center">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
            <span className="hidden sm:block text-sm font-medium text-slate-300 max-w-[120px] truncate">
              {displayName}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-500 hidden sm:block" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-navy-800 rounded-lg shadow-xl shadow-navy-950/50 border border-readable-soft py-1 z-50">
              <div className="px-4 py-3 border-b border-readable-soft">
                <p className="text-sm font-medium text-white truncate">{displayName}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email}</p>
              </div>

              <Link
                to="/profile"
                onClick={() => setDropdownOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-navy-700 hover:text-white transition-colors"
              >
                <User className="w-4 h-4" />
                Profilim
              </Link>
              <Link
                to="/settings"
                onClick={() => setDropdownOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-navy-700 hover:text-white transition-colors"
              >
                <Settings className="w-4 h-4" />
                Ayarlar
              </Link>

              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setDropdownOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gold-400 hover:bg-navy-700 hover:text-gold-300 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Yönetim Paneli
                </Link>
              )}

              <div className="border-t border-readable-soft mt-1 pt-1">
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Çıkış Yap
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
