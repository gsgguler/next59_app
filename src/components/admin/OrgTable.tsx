import { useEffect, useState, useCallback } from 'react';
import { Search, Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  subscription_tier: string | null;
  type: string;
  max_members: number | null;
  created_at: string;
}

const tierBadge: Record<string, string> = {
  free: 'text-gray-600 bg-gray-50 border-gray-200',
  pro: 'text-blue-700 bg-blue-50 border-blue-200',
  elite: 'text-gold-700 bg-gold-50 border-gold-200',
  b2b_only: 'text-navy-700 bg-navy-50 border-navy-200',
};

export default function OrgTable() {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: '', slug: '', tier: 'free' });
  const [creating, setCreating] = useState(false);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('organizations')
      .select('id, name, slug, subscription_tier, type, max_members, created_at')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    const { data } = await query;
    setOrgs((data as OrgRow[]) ?? []);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  async function handleCreate() {
    if (!newOrg.name || !newOrg.slug) return;
    setCreating(true);
    const { error } = await supabase.from('organizations').insert({
      name: newOrg.name,
      slug: newOrg.slug,
      subscription_tier: newOrg.tier,
    });
    setCreating(false);
    if (error) {
      toast(error.message, 'error');
    } else {
      toast('Organizasyon olusturuldu', 'success');
      setShowCreate(false);
      setNewOrg({ name: '', slug: '', tier: 'free' });
      fetchOrgs();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Isim veya slug ara..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
          />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Yeni Org
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-navy-500 animate-spin" />
        </div>
      ) : orgs.length === 0 ? (
        <p className="text-center py-12 text-gray-400 text-sm">Organizasyon bulunamadi</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Isim</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Slug</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Tier</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Tur</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Max Uye</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{o.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">{o.slug}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize ${tierBadge[o.subscription_tier ?? 'free'] ?? tierBadge.free}`}>
                      {o.subscription_tier ?? 'free'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 capitalize">{o.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{o.max_members ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(o.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Yeni Organizasyon"
        footer={
          <>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              Iptal
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newOrg.name || !newOrg.slug}
              className="px-4 py-2 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Olusturuluyor...' : 'Olustur'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Isim</label>
            <input
              value={newOrg.name}
              onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
              placeholder="Organizasyon adi"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <input
              value={newOrg.slug}
              onChange={(e) => setNewOrg({ ...newOrg, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
              placeholder="organizasyon-slug"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
            <select
              value={newOrg.tier}
              onChange={(e) => setNewOrg({ ...newOrg, tier: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="elite">Elite</option>
              <option value="b2b_only">B2B</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
