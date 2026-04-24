import { useEffect, useState } from 'react';
import { Users, Building2, LogIn, Crown } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Stat {
  title: string;
  value: string;
  icon: typeof Users;
  color: string;
  bg: string;
}

export default function AdminStatCards() {
  const [stats, setStats] = useState({ users: 0, orgs: 0, todayLogins: 0, premium: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const [usersRes, orgsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        users: usersRes.count ?? 0,
        orgs: orgsRes.count ?? 0,
        todayLogins: 0,
        premium: 0,
      });
      setLoading(false);
    }
    fetch();
  }, []);

  const cards: Stat[] = [
    { title: 'Toplam Kullanici', value: loading ? '-' : String(stats.users), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Aktif Organizasyon', value: loading ? '-' : String(stats.orgs), icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: 'Bugunku Girisler', value: loading ? '-' : String(stats.todayLogins), icon: LogIn, color: 'text-gold-600', bg: 'bg-gold-50' },
    { title: 'Premium Uye', value: loading ? '-' : String(stats.premium), icon: Crown, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.title} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{card.title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
              </div>
              <div className={`${card.bg} p-2.5 rounded-lg`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center justify-center text-gray-400">
        <p className="text-lg font-medium text-gray-500">Grafik Yakin Zamanda</p>
        <p className="text-sm mt-1">Kullanici buyumesi ve aktivite grafikleri eklenecek</p>
      </div>
    </div>
  );
}
