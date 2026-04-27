import { Lock, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const tierNames: Record<string, string> = {
  free: 'Ücretsiz',
  pro: 'Pro',
  elite: 'Elite',
  b2b_only: 'B2B',
};

interface AccessLevelLockProps {
  requiredTier: string;
  userTier: string;
  children: React.ReactNode;
}

export default function AccessLevelLock({ requiredTier, userTier, children }: AccessLevelLockProps) {
  const navigate = useNavigate();
  const reqName = tierNames[requiredTier] ?? requiredTier;
  const curName = tierNames[userTier] ?? userTier;

  return (
    <div className="relative">
      <div className="blur-sm select-none pointer-events-none" aria-hidden="true">
        {children}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-white/95 via-white/80 to-transparent rounded-xl">
        <div className="flex flex-col items-center text-center px-6">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Lock className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-base font-semibold text-gray-800 mb-1">
            Bu içerik <span className="text-gold-600">{reqName}</span> seviyesi gerektirir
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Mevcut seviyeniz: {curName}
          </p>
          <button
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold-500 text-navy-900 font-semibold text-sm hover:bg-gold-400 transition-colors"
          >
            Yükselt
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
