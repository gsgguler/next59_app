import { useState } from 'react';
import { CircleUser as UserCircle } from 'lucide-react';
import ProfileForm from '../components/profile/ProfileForm';
import ApiTokenPanel from '../components/profile/ApiTokenPanel';
import PasswordChangeForm from '../components/profile/PasswordChangeForm';

const tabs = [
  { key: 'info', label: 'Bilgilerim' },
  { key: 'tokens', label: 'API Tokenları' },
  { key: 'password', label: 'Şifre Değiştir' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserCircle className="w-6 h-6 text-navy-600" />
          Profilim
        </h1>
        <p className="text-gray-500 mt-1">Hesap bilgilerinizi yönetin</p>
      </div>

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

      {activeTab === 'info' && <ProfileForm />}
      {activeTab === 'tokens' && <ApiTokenPanel />}
      {activeTab === 'password' && <PasswordChangeForm />}
    </div>
  );
}
