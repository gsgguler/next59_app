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
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-72">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Ara... (Cmd+K)"
            className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"
          />
          <kbd className="hidden md:inline text-[10px] text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono">
            K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
              {displayName}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>

              <Link
                to="/profile"
                onClick={() => setDropdownOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="w-4 h-4" />
                Profilim
              </Link>
              <Link
                to="/settings"
                onClick={() => setDropdownOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Ayarlar
              </Link>

              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setDropdownOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-navy-700 hover:bg-navy-50 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Yönetim Paneli
                </Link>
              )}

              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
