import { useState, useEffect } from 'react';
import { Save, RotateCcw, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';

export default function ProfileForm() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [locale, setLocale] = useState('tr');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '');
      setAvatarUrl(profile.avatar_url ?? '');
      setLocale(profile.preferred_locale ?? 'tr');
    }
  }, [profile]);

  function reset() {
    setDisplayName(profile?.display_name ?? '');
    setAvatarUrl(profile?.avatar_url ?? '');
    setLocale(profile?.preferred_locale ?? 'tr');
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName || null,
        avatar_url: avatarUrl || null,
        preferred_locale: locale,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    setSaving(false);
    if (error) {
      toast('Profil güncellenemedi: ' + error.message, 'error');
    } else {
      toast('Profil güncellendi', 'success');
      await refreshProfile();
    }
  }

  const initials = (displayName || user?.email || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
        ) : (
          <div className="w-20 h-20 rounded-full bg-navy-100 flex items-center justify-center border-2 border-navy-200">
            <span className="text-xl font-bold text-navy-700">{initials}</span>
          </div>
        )}
        <div>
          <p className="text-lg font-semibold text-gray-900">{displayName || 'Kullanıcı'}</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
          {profile?.is_super_admin && (
            <span className="text-xs font-medium text-navy-700 bg-navy-50 border border-navy-200 px-2 py-0.5 rounded mt-1 inline-block">
              Super Admin
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Ad Soyad</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
            placeholder="Adınız Soyadınız"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Avatar URL</label>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">E-posta</label>
          <input
            value={user?.email ?? ''}
            readOnly
            className="w-full px-4 py-3 rounded-lg border border-gray-200 text-gray-500 bg-gray-50 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Dil</label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
          >
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Kaydet
        </button>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Sıfırla
        </button>
      </div>
    </div>
  );
}
