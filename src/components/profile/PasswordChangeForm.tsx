import { useState, useMemo, type FormEvent } from 'react';
import { Lock, Loader2, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui/Toast';

function getStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: 'Zayıf', color: 'bg-red-500' };
  if (s <= 2) return { score: s, label: 'Orta', color: 'bg-orange-500' };
  if (s <= 3) return { score: s, label: 'İyi', color: 'bg-yellow-500' };
  return { score: s, label: 'Güçlü', color: 'bg-emerald-500' };
}

const reqs = [
  { test: (p: string) => p.length >= 8, label: 'En az 8 karakter' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'Büyük harf' },
  { test: (p: string) => /[0-9]/.test(p), label: 'Rakam' },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'Özel karakter' },
];

export default function PasswordChangeForm() {
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const strength = useMemo(() => getStrength(newPassword), [newPassword]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Şifre en az 8 karakter olmalı');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Şifreler eşleşmedi');
      return;
    }

    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);

    if (err) {
      setError(err.message);
    } else {
      toast('Şifre başarıyla değiştirildi', 'success');
      setNewPassword('');
      setConfirmPassword('');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Yeni Şifre</label>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
          placeholder="Yeni şifreniz"
          required
        />
        {newPassword.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`} style={{ width: `${(strength.score / 5) * 100}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-500 w-10">{strength.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {reqs.map((r) => {
                const met = r.test(newPassword);
                return (
                  <div key={r.label} className="flex items-center gap-1.5 text-xs">
                    {met ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <X className="w-3.5 h-3.5 text-gray-300" />}
                    <span className={met ? 'text-emerald-600' : 'text-gray-400'}>{r.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Şifre Tekrar</label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
          placeholder="Şifrenizi tekrar girin"
          required
        />
        {confirmPassword && newPassword !== confirmPassword && (
          <p className="text-xs text-red-500 mt-1">Şifreler eşleşmedi</p>
        )}
      </div>

      <button
        type="submit"
        disabled={saving || newPassword.length < 8 || newPassword !== confirmPassword}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        Şifreyi Değiştir
      </button>
    </form>
  );
}
