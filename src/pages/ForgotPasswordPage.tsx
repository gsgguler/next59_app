import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, Shield, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toast';

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });

    setLoading(false);

    if (error) {
      toast(error.message, 'error');
      return;
    }

    setSent(true);
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
            Hesabiniza yeniden erisim saglayin. Sifrenizi guvenli bir sekilde sifirlayin.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-10">
            <Shield className="w-8 h-8 text-navy-700" />
            <span className="text-2xl font-bold text-navy-700">Next59</span>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-6">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">E-posta Gonderildi</h1>
              <p className="text-gray-500 leading-relaxed mb-2">
                Sifre sifirlama baglantisi e-posta adresinize gonderildi.
              </p>
              <p className="text-sm text-gray-400 mb-8">
                <span className="font-medium text-gray-600">{email}</span> adresini kontrol edin.
                Baglanti 24 saat icerisinde gecerlidir.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => setSent(false)}
                  className="w-full px-4 py-3 rounded-lg bg-white border border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                  Farkli bir e-posta dene
                </button>
                <Link
                  to="/login"
                  className="block w-full px-4 py-3 rounded-lg bg-navy-700 text-white text-center font-medium text-sm hover:bg-navy-600 transition-colors"
                >
                  Giris Sayfasina Don
                </Link>
              </div>
            </div>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-8"
              >
                <ArrowLeft className="w-4 h-4" />
                Giris sayfasina don
              </Link>

              <h1 className="text-2xl font-bold text-gray-900 mb-1">Sifremi Unuttum</h1>
              <p className="text-gray-500 mb-8">
                Kayitli e-posta adresinizi girin, size sifre sifirlama baglantisi gonderelim.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                    E-posta
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-colors"
                    placeholder="ornek@email.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-navy-700 text-white font-medium hover:bg-navy-600 focus:ring-2 focus:ring-navy-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Mail className="w-5 h-5" />
                  )}
                  {loading ? 'Gonderiliyor...' : 'Sifirlama Baglantisi Gonder'}
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-gray-500">
                Sifrenizi hatirladiniz mi?{' '}
                <Link to="/login" className="text-navy-700 font-medium hover:text-navy-600 transition-colors">
                  Giris Yap
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
