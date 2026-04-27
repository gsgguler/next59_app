import { NavLink, useParams } from 'react-router-dom';
import { LayoutDashboard, Trophy, TrendingUp, MessageSquare, Newspaper, Settings, Shield, ShieldCheck, CircleUser as UserCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { profile } = useAuth();
  const { lang } = useParams();
  const isAdmin = profile?.is_super_admin ?? false;
  const p = lang ? `/${lang}` : '';

  const mainNav = [
    { to: `${p}/dashboard`, icon: LayoutDashboard, label: 'Dashboard' },
    { to: `${p}/matches`, icon: Trophy, label: 'Maçlar' },
    { to: `${p}/predictions`, icon: TrendingUp, label: 'Tahminler' },
    { to: `${p}/debates`, icon: MessageSquare, label: 'AI Debate' },
    { to: `${p}/news`, icon: Newspaper, label: 'Haberler' },
  ];

  const bottomNav = [
    { to: `${p}/profile`, icon: UserCircle, label: 'Profilim' },
    { to: `${p}/settings`, icon: Settings, label: 'Ayarlar' },
  ];

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
        <div className={`flex items-center h-16 px-4 border-b border-navy-600 ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <Shield className="w-8 h-8 text-gold-500 shrink-0" />
          {!collapsed && (
            <span className="text-xl font-bold text-white tracking-tight">Next59</span>
          )}
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-3">
            {mainNav.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} onClick={onMobileClose} />
            ))}
            {isAdmin && (
              <NavItem to={`${p}/admin`} icon={ShieldCheck} label="Yönetim" collapsed={collapsed} onClick={onMobileClose} />
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
        end={to.endsWith('/dashboard')}
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
