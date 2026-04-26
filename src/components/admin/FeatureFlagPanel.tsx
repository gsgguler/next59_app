import { useEffect, useState, useRef } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface Flag {
  id: string;
  flag_key: string;
  name_translations: { tr?: string; en?: string };
  description_translations: { tr?: string; en?: string } | null;
  is_active: boolean;
  rollout_percentage: number;
  required_tier: string;
  rollout_strategy: string;
}

export default function FeatureFlagPanel() {
  const { toast } = useToast();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newFlag, setNewFlag] = useState({ key: '', nameTr: '', nameEn: '', tier: 'free' });
  const [creating, setCreating] = useState(false);
  const rolloutTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetchFlags();
  }, []);

  async function fetchFlags() {
    setLoading(true);
    const { data } = await supabase
      .from('feature_flags')
      .select('id, flag_key, name_translations, description_translations, is_active, rollout_percentage, required_tier, rollout_strategy')
      .order('flag_key');
    setFlags((data as Flag[]) ?? []);
    setLoading(false);
  }

  async function toggleFlag(id: string, current: boolean) {
    setFlags((prev) => prev.map((f) => f.id === id ? { ...f, is_active: !current } : f));
    const { error } = await supabase.from('feature_flags').update({ is_active: !current }).eq('id', id);
    if (error) {
      setFlags((prev) => prev.map((f) => f.id === id ? { ...f, is_active: current } : f));
      toast('Güncelleme başarısız', 'error');
    } else {
      toast(`Flag ${!current ? 'aktif' : 'pasif'}`, 'success');
    }
  }

  function updateRollout(id: string, value: number) {
    setFlags((prev) => prev.map((f) => f.id === id ? { ...f, rollout_percentage: value } : f));
    if (rolloutTimers.current[id]) clearTimeout(rolloutTimers.current[id]);
    rolloutTimers.current[id] = setTimeout(async () => {
      const { error } = await supabase.from('feature_flags').update({ rollout_percentage: value }).eq('id', id);
      if (error) toast('Rollout güncellenemedi', 'error');
      else toast(`Rollout: %${value}`, 'info');
    }, 500);
  }

  async function handleCreate() {
    if (!newFlag.key || !newFlag.nameTr) return;
    setCreating(true);
    const { error } = await supabase.from('feature_flags').insert({
      flag_key: newFlag.key,
      name_translations: { tr: newFlag.nameTr, en: newFlag.nameEn || newFlag.nameTr },
      required_tier: newFlag.tier,
      is_active: false,
      rollout_percentage: 0,
      rollout_strategy: 'all',
    });
    setCreating(false);
    if (error) {
      toast(error.message, 'error');
    } else {
      toast('Flag oluşturuldu', 'success');
      setShowCreate(false);
      setNewFlag({ key: '', nameTr: '', nameEn: '', tier: 'free' });
      fetchFlags();
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-navy-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{flags.length} flag</span>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Yeni Flag
        </button>
      </div>

      <div className="space-y-3">
        {flags.map((f) => (
          <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-gray-900">{f.name_translations.tr || f.flag_key}</p>
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{f.flag_key}</span>
                </div>
                {f.description_translations?.tr && (
                  <p className="text-xs text-gray-500">{f.description_translations.tr}</p>
                )}
              </div>
              <button
                onClick={() => toggleFlag(f.id, f.is_active)}
                className={`relative w-11 h-6 rounded-full transition-colors ${f.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${f.is_active ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Rollout</span>
                  <span className="font-medium">%{f.rollout_percentage}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={f.rollout_percentage}
                  onChange={(e) => updateRollout(f.id, Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-navy-700 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                />
              </div>
              <span className="text-xs text-gray-400 capitalize shrink-0">{f.required_tier}</span>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Yeni Feature Flag"
        footer={
          <>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              İptal
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newFlag.key || !newFlag.nameTr}
              className="px-4 py-2 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Flag Key</label>
            <input
              value={newFlag.key}
              onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
              placeholder="my_feature_flag"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">İsim (TR)</label>
            <input
              value={newFlag.nameTr}
              onChange={(e) => setNewFlag({ ...newFlag, nameTr: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
              placeholder="Özellik adı"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">İsim (EN)</label>
            <input
              value={newFlag.nameEn}
              onChange={(e) => setNewFlag({ ...newFlag, nameEn: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
              placeholder="Feature name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gerekli Tier</label>
            <select
              value={newFlag.tier}
              onChange={(e) => setNewFlag({ ...newFlag, tier: e.target.value })}
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
