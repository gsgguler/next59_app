import { NavLink, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  Archive,
  MessageSquare,
  Settings,
  ShieldCheck,
  Activity,
  CircleUser as UserCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Sliders,
  BarChart3,
  Zap,
  Globe,
  Monitor,
  Brain,
  Trophy,
  History,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const mainNav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Genel Bakış' },
  { to: '/dashboard/mac-arsivi', icon: Archive, label: 'Maç Arşivi' },
  { to: '/debates', icon: MessageSquare, label: 'AI Tartışmaları' },
];

const bottomNav = [
  { to: '/profile', icon: UserCircle, label: 'Profil' },
  { to: '/settings', icon: Settings, label: 'Ayarlar' },
];

// Admin grupları — 4 kategori, her grup genişleyip daralabilir
const adminGroups = [
  {
    key: 'operasyon',
    label: 'Günlük Operasyon',
    icon: Activity,
    items: [
      { to: '/admin/model-lab/daily-monitor', label: 'Sistem Dashboard',      icon: LayoutDashboard },
      { to: '/admin/saglayici-sagligi',       label: 'Sağlayıcı Sağlığı',     icon: Activity },
      { to: '/admin/model-lab/prematch-ops',  label: 'Maç Öncesi (Pre-Match)', icon: Monitor },
      { to: '/admin/tahmin-motoru/ne-dedik-ne-oldu', label: 'Ne Dedik / Ne Oldu?', icon: History },
    ],
  },
  {
    key: 'ai',
    label: 'Yapay Zeka',
    icon: Brain,
    items: [
      { to: '/admin/tahmin-motoru/brain-orkestrasi', label: 'Brain Orkestrasyonu',  icon: Brain },
      { to: '/admin/model-lab',                      label: 'Model Laboratuvarı',   icon: BarChart3 },
      { to: '/admin/kalibrasyon',                    label: 'Kalibrasyon Merkezi',  icon: SlidersHorizontal },
      { to: '/admin/model-lab/canli-mikro-sim',      label: 'Canlı Mikro Sim',      icon: Zap },
    ],
  },
  {
    key: 'wc2026',
    label: 'DK 2026',
    icon: Trophy,
    items: [
      { to: '/admin/wc2026/kadro-ops',   label: 'Kadro Operasyonları', icon: UserCircle },
      { to: '/admin/wc2026/kalibrasyon', label: 'DK Kalibrasyonu',     icon: Sliders },
      { to: '/admin/wc2026/canli-motor', label: 'Canlı Maç Motoru',    icon: Monitor },
    ],
  },
  {
    key: 'sistem',
    label: 'Sistem & Ayarlar',
    icon: ShieldCheck,
    items: [
      { to: '/admin',           label: 'Yönetim Paneli', icon: ShieldCheck },
      { to: '/admin/operasyonlar', label: 'Operasyonlar', icon: Globe },
      { to: '/admin/launch-hazirlik', label: 'Launch Hazırlık', icon: TrendingUp },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { isAdmin } = useAuth();
  const location = useLocation();

  // Hangi admin grubu açık — aktif path'e göre otomatik aç
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    adminGroups.forEach(g => {
      init[g.key] = g.items.some(i => location.pathname.startsWith(i.to) && i.to !== '/admin');
    });
    // Günlük Operasyon grubunu her zaman açık başlat
    init['operasyon'] = true;
    return init;
  });

  function toggleGroup(key: string) {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }

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
          ${collapsed ? 'w-[72px]' : 'w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Logo */}
        <Link
          to="/"
          className={`flex items-center h-16 px-4 border-b border-navy-600 hover:opacity-80 transition-opacity shrink-0 ${collapsed ? 'justify-center' : 'gap-2.5'}`}
        >
          <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-label="Next59 logo">
            <rect width="32" height="32" rx="6" fill="#0f1d2a" />
            <path d="M9 8 L9 24 L12 24 L12 13.5 L20 24 L23 24 L23 8 L20 8 L20 18.5 L12 8 Z" fill="#ffffff" />
            <circle cx="25" cy="7" r="2.5" fill="#F2A623" />
          </svg>
          {!collapsed && (
            <span className="text-xl font-semibold tracking-tight" style={{ color: '#F2A623' }}>
              Next59
            </span>
          )}
        </Link>

        <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
          {/* Ana menü */}
          <ul className="space-y-0.5 px-2">
            {mainNav.map((item) => (
              <NavItem key={item.to} {...item} collapsed={collapsed} onClick={onMobileClose} />
            ))}
          </ul>

          {/* Admin grupları */}
          {isAdmin && (
            <div className="mt-3 pt-3 border-t border-navy-600">
              {!collapsed && (
                <p className="px-4 mb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Yönetici
                </p>
              )}
              <div className="space-y-0.5 px-2">
                {adminGroups.map(group => (
                  <AdminGroup
                    key={group.key}
                    group={group}
                    collapsed={collapsed}
                    open={openGroups[group.key] ?? false}
                    onToggle={() => toggleGroup(group.key)}
                    onItemClick={onMobileClose}
                    currentPath={location.pathname}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Alt menü */}
          <div className="mt-3 pt-3 border-t border-navy-600 px-2">
            <ul className="space-y-0.5">
              {bottomNav.map((item) => (
                <NavItem key={item.to} {...item} collapsed={collapsed} onClick={onMobileClose} />
              ))}
            </ul>
          </div>
        </nav>

        {/* Daralt/genişlet butonu */}
        <button
          onClick={onToggle}
          className="hidden lg:flex items-center justify-center h-11 border-t border-navy-600 text-slate-400 hover:text-white hover:bg-navy-600/50 transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>
    </>
  );
}

function AdminGroup({
  group,
  collapsed,
  open,
  onToggle,
  onItemClick,
  currentPath,
}: {
  group: typeof adminGroups[number];
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  onItemClick: () => void;
  currentPath: string;
}) {
  const GroupIcon = group.icon;
  const isGroupActive = group.items.some(i =>
    i.to === '/admin' ? currentPath === '/admin' : currentPath.startsWith(i.to)
  );

  if (collapsed) {
    // Daraltılmışken grup başlığı gizlenir, sadece ilk item ikonu gösterilir
    return (
      <div className="space-y-0.5">
        {group.items.map(item => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={true}
            onClick={onItemClick}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Grup başlığı */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors
          ${isGroupActive ? 'text-champagne' : 'text-navy-400 hover:text-navy-200'}`}
      >
        <GroupIcon className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Grup içeriği */}
      {open && (
        <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-navy-600 pl-2">
          {group.items.map(item => (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              collapsed={false}
              onClick={onItemClick}
              small
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed,
  onClick,
  small,
}: {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  collapsed: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={to === '/dashboard' || to === '/admin'}
        onClick={onClick}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 rounded-lg font-medium transition-all duration-150
          ${small ? 'py-2 text-xs' : 'py-2.5 text-sm'}
          ${
            isActive
              ? 'bg-navy-600 text-white border-l-[3px] border-champagne -ml-[3px]'
              : 'text-navy-300 hover:bg-navy-600/40 hover:text-white'
          }
          ${collapsed ? 'justify-center' : ''}
          `
        }
      >
        <Icon className={`${small ? 'w-3.5 h-3.5' : 'w-4 h-4'} shrink-0`} />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    </li>
  );
}
