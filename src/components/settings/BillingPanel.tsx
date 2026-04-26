import { useEffect, useState } from 'react';
import { CreditCard, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Invoice {
  id: string;
  description: string | null;
  amount_due: number;
  currency: string;
  status: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

const planData: Record<string, { name: string; price: string; features: string[]; badge: string }> = {
  free: {
    name: 'Ücretsiz',
    price: 'Ücretsiz',
    badge: 'text-gray-600 bg-gray-50 border-gray-200',
    features: ['Sınırlı tahmin erişimi', 'Temel maç verileri', 'Topluluk desteği'],
  },
  pro: {
    name: 'Pro',
    price: '299 TL/ay',
    badge: 'text-blue-700 bg-blue-50 border-blue-200',
    features: ['Tüm tahminlere erişim', 'AI Debate görüntülemesi', 'Öncelikli destek', 'API erişimi (1000 istek/ay)'],
  },
  elite: {
    name: 'Elite',
    price: '999 TL/ay',
    badge: 'text-gold-700 bg-gold-50 border-gold-200',
    features: ['Sınırsız tahmin erişimi', 'Gerçek zamanlı bildirimler', 'Özel raporlama', 'API erişimi (sınırsız)', 'Özel destek yöneticisi'],
  },
  b2b_only: {
    name: 'B2B',
    price: 'Özel Fiyat',
    badge: 'text-navy-700 bg-navy-50 border-navy-200',
    features: ['White-label çözüm', 'Özel API entegrasyonu', 'SLA garantisi', 'Özel eğitim ve destek'],
  },
};

const invoiceStatus: Record<string, { label: string; color: string }> = {
  paid: { label: 'Ödendi', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  draft: { label: 'Taslak', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  open: { label: 'Bekliyor', color: 'text-gold-700 bg-gold-50 border-gold-200' },
  void: { label: 'İptal', color: 'text-red-700 bg-red-50 border-red-200' },
};

export default function BillingPanel() {
  const { profile } = useAuth();
  const [tier, setTier] = useState('free');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!profile?.personal_organization_id) {
        setLoading(false);
        return;
      }

      const [orgRes, invRes] = await Promise.all([
        supabase
          .from('organizations')
          .select('subscription_tier')
          .eq('id', profile.personal_organization_id)
          .maybeSingle(),
        supabase
          .from('invoices')
          .select('id, description, amount_due, currency, status, period_start, period_end, created_at')
          .eq('organization_id', profile.personal_organization_id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      setTier(orgRes.data?.subscription_tier ?? 'free');
      setInvoices((invRes.data as Invoice[]) ?? []);
      setLoading(false);
    }
    fetch();
  }, [profile]);

  const plan = planData[tier] ?? planData.free;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-navy-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Mevcut Plan</h3>
          <span className={`text-xs font-medium px-3 py-1 rounded-full border ${plan.badge}`}>
            {plan.name}
          </span>
        </div>
        <p className="text-2xl font-bold text-gray-900 mb-4">{plan.price}</p>
        <ul className="space-y-2 mb-6">
          {plan.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
        {(tier === 'free' || tier === 'pro') && (
          <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold-500 text-navy-900 font-semibold text-sm hover:bg-gold-400 transition-colors">
            Yükselt
          </button>
        )}
        {tier === 'elite' && (
          <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-100 text-gray-500 text-sm font-medium cursor-default">
            Mevcut Plan
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Ödeme Yöntemi</h3>
        <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-gray-300 text-gray-400">
          <CreditCard className="w-5 h-5" />
          <span className="text-sm">Ödeme yöntemi eklenmedi</span>
          <button className="ml-auto text-sm font-medium text-navy-600 hover:text-navy-700 transition-colors">
            Ekle
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Fatura Geçmişi</h3>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Fatura bulunamadı</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 pb-2">Tarih</th>
                  <th className="text-left text-xs font-medium text-gray-500 pb-2">Açıklama</th>
                  <th className="text-left text-xs font-medium text-gray-500 pb-2">Tutar</th>
                  <th className="text-left text-xs font-medium text-gray-500 pb-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const st = invoiceStatus[inv.status] ?? invoiceStatus.draft;
                  return (
                    <tr key={inv.id} className="border-b border-gray-50">
                      <td className="py-2.5 text-xs text-gray-500">
                        {new Date(inv.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-2.5 text-sm text-gray-700">{inv.description || 'Abonelik'}</td>
                      <td className="py-2.5 text-sm font-medium text-gray-900">
                        {Number(inv.amount_due).toLocaleString('tr-TR')} {inv.currency.toUpperCase()}
                      </td>
                      <td className="py-2.5">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
