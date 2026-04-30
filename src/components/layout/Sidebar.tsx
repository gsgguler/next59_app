import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, Trophy, TrendingUp, MessageSquare, Newspaper, Settings, ShieldCheck, CircleUser as UserCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const mainNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/matches', icon: Trophy, label: 'Maçlar' },
  { to: '/predictions', icon: TrendingUp, label: 'Tahminler' },
  { to: '/debates', icon: MessageSquare, label: 'AI Debate' },
  { to: '/news', icon: Newspaper, label: 'Haberler' },
];

const bottomNav = [
  { to: '/profile', icon: UserCircle, label: 'Profilim' },
  { to: '/settings', icon: Settings, label: 'Ayarlar' },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { isAdmin } = useAuth();

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full z-50 bg-navy-700 transition-all duration-300 ease-in-out flex flex-col
          ${collapsed ? 'w-[72px]' : 'w-60'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        <Link to="/" className={`flex items-center h-16 px-4 border-b border-navy-600 hover:opacity-80 transition-opacity ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-label="Next59 logo">
            <rect width="32" height="32" rx="6" fill="#0f1d2a" />
            <path d="M9 8 L9 24 L12 24 L12 13.5 L20 24 L23 24 L23 8 L20 8 L20 18.5 L12 8 Z" fill="#ffffff" />
            <circle cx="25" cy="7" r="2.5" fill="#F2A623" />
          </svg>
          {!collapsed && (
            <span className="text-xl font-semibold tracking-tight" style={{ color: '#F2A623' }}>Next59</span>
          )}
        </Link>

        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-3">
            {mainNav.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} onClick={onMobileClose} />
            ))}
            {isAdmin && (
              <NavItem to="/admin" icon={ShieldCheck} label="Yönetim" collapsed={collapsed} onClick={onMobileClose} />
            )}
          </ul>

          <div className="mt-4 pt-4 border-t border-navy-600 px-3">
            <ul className="space-y-1">
              {bottomNav.map((item) => (
                <NavItem key={item.to} {...item} collapsed={collapsed} onClick={onMobileClose} />
              ))}
            </ul>
          </div>
        </nav>

        <button
          onClick={onToggle}
          className="hidden lg:flex items-center justify-center h-12 border-t border-navy-600 text-navy-300 hover:text-white hover:bg-navy-600/50 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </aside>
    </>
  );
}

function NavItem({ to, icon: Icon, label, collapsed, onClick }: {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={to === '/'}
        onClick={onClick}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
          ${isActive
            ? 'bg-navy-600 text-white border-l-[3px] border-gold-500 -ml-[3px]'
            : 'text-navy-200 hover:bg-navy-600/50 hover:text-white'
          }
          ${collapsed ? 'justify-center' : ''}
          `
        }
      >
        <Icon className="w-5 h-5 shrink-0" />
        {!collapsed && <span>{label}</span>}
      </NavLink>
    </li>
  );
}
