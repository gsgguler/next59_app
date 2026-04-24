import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, Loader2, Shield, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Sifre en az 6 karakter olmalidir.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Sifreler eslesmiyor.');
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (updateError) {
      toast(updateError.message, 'error');
      return;
    }

    setDone(true);
    toast('Sifreniz basariyla guncellendi.', 'success');
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sifre Guncellendi</h1>
          <p className="text-gray-500 mb-8">
            Yeni sifreniz basariyla kaydedildi. Artik yeni sifrenizle giris yapabilirsiniz.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full px-4 py-3 rounded-lg bg-navy-700 text-white font-medium text-sm hover:bg-navy-600 transition-colors"
          >
            Dashboard'a Git
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-navy-700 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-800 via-navy-700 to-navy-900" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gold-500/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3" />
        <div className="relative z-10 px-16 text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Shield className="w-12 h-12 text-gold-500" />
            <span className="text-4xl font-bold text-white tracking-tight">Next59</span>
          </div>
          <p className="text-navy-200 text-lg leading-relaxed max-w-md">
            Yeni sifrenizi belirleyin ve hesabiniza guvenle erismeye devam edin.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-10">
            <Shield className="w-8 h-8 text-navy-700" />
            <span className="text-2xl font-bold text-navy-700">Next59</span>
          </div>

          <div className="mx-auto w-14 h-14 rounded-2xl bg-navy-50 border border-navy-200 flex items-center justify-center mb-6">
            <KeyRound className="w-7 h-7 text-navy-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">Yeni Sifre Belirle</h1>
          <p className="text-gray-500 mb-8">
            Hesabiniz icin yeni bir sifre olusturun.
          </p>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Yeni Sifre
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors pr-12"
                  placeholder="En az 6 karakter"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Sifre Tekrar
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors pr-12"
                  placeholder="Sifrenizi tekrar girin"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-navy-700 text-white font-medium hover:bg-navy-600 focus:ring-2 focus:ring-navy-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <KeyRound className="w-5 h-5" />
              )}
              {loading ? 'Kaydediliyor...' : 'Sifreyi Guncelle'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
