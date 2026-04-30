import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, FlaskConical } from 'lucide-react';
import UserTable from '../components/admin/UserTable';
import OrgTable from '../components/admin/OrgTable';
import FeatureFlagPanel from '../components/admin/FeatureFlagPanel';
import AdminStatCards from '../components/admin/AdminStatCards';

const tabs = [
  { key: 'users', label: 'Kullanıcılar' },
  { key: 'orgs', label: 'Organizasyonlar' },
  { key: 'flags', label: 'Feature Flags' },
  { key: 'stats', label: 'İstatistikler' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('users');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-navy-600" />
          Yönetim Paneli
        </h1>
        <p className="text-gray-500 mt-1">Platform yönetimi ve istatistikler</p>
      </div>

      {/* Model Lab shortcut */}
      <Link
        to="/admin/model-lab"
        className="flex items-center gap-4 bg-navy-950 border border-navy-800 hover:border-champagne/40 rounded-xl px-5 py-4 transition-all group"
      >
        <div className="w-10 h-10 rounded-lg bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
          <FlaskConical className="w-5 h-5 text-champagne" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white group-hover:text-champagne transition-colors">Model Lab</p>
          <p className="text-xs text-navy-500">B3 Historical Backbone — backtest, kalibrasyon ve hata analizi</p>
        </div>
      </Link>

      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-navy-700 text-navy-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'users' && <UserTable />}
      {activeTab === 'orgs' && <OrgTable />}
      {activeTab === 'flags' && <FeatureFlagPanel />}
      {activeTab === 'stats' && <AdminStatCards />}
    </div>
  );
}
