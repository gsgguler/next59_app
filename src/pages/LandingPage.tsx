import { Link, useParams } from 'react-router-dom';
import {
  Brain,
  TrendingUp,
  MessageSquare,
  BarChart3,
  Zap,
  Shield,
  ChevronRight,
  Star,
  ArrowRight,
  Check,
  Users,
  Target,
  Clock,
} from 'lucide-react';
import CookieBanner from '../components/legal/CookieBanner';

const stats = [
  { value: '94%', label: 'Analiz Doğruluğu', icon: Target },
  { value: '500+', label: 'Haftalık Maç Analizi', icon: BarChart3 },
  { value: '10K+', label: 'Aktif Kullanıcı', icon: Users },
  { value: '<2dk', label: 'Analiz Süresi', icon: Clock },
];

const features = [
  {
    icon: Brain,
    title: 'AI Tabanlı Analiz',
    description: 'Yapay zekâ modellerimiz geçmiş verileri, form durumlarını ve taktiksel değişiklikleri analiz ederek detaylı maç öngörüsü oluşturur.',
  },
  {
    icon: MessageSquare,
    title: 'AI Debate Sistemi',
    description: 'Farklı bakış açılarını temsil eden AI personalar, her maç için lehte ve aleyhte argümanlarıyla tartışır.',
  },
  {
    icon: TrendingUp,
    title: 'Canlı Tahmin Takibi',
    description: 'Tahminlerinizi gerçek zamanlı takip edin. Başarı oranlarınızı, ROI metriklerinizi ve trend analizlerinizi görüntüleyin.',
  },
  {
    icon: BarChart3,
    title: 'Detaylı İstatistikler',
    description: 'Takım performansları, oyuncu formları ve karşılaşma geçmişi gibi kapsamlı istatistik verilere erişin.',
  },
  {
    icon: Zap,
    title: 'Anlık Bildirimler',
    description: 'Maç öncesi analizler, kadro değişiklikleri ve önemli gelişmeler için anında bildirim alın.',
  },
  {
    icon: Shield,
    title: 'Güvenilir Altyapı',
    description: 'End-to-end şifreleme, KVKK uyumluluğu ve %99.9 uptime garantisi ile verileriniz güvende.',
  },
];

const howItWorks = [
  { step: '01', title: 'Maç Seçin', description: 'Analiz etmek istediğiniz maçı listeden seçin.' },
  { step: '02', title: 'AI Analiz Eder', description: 'Yapay zekâ modellerimiz tüm verileri işler ve tahmin oluşturur.' },
  { step: '03', title: 'Debate İzleyin', description: 'AI personalar maç hakkında farklı bakış açılarını tartışır.' },
  { step: '04', title: 'Karar Verin', description: 'Kapsamlı analize dayanarak bilinçli kararlar verin.' },
];

const plans = [
  {
    name: 'Başlangıç',
    price: 'Ücretsiz',
    period: '',
    description: 'Platforma göz atıp temel özellikleri keşfet.',
    features: [
      'Günlük 3 maç analizi',
      'Temel istatistikler',
      'Topluluk erişimi',
    ],
    cta: 'Hemen Başla',
    featured: false,
  },
  {
    name: 'Pro',
    price: '149',
    period: '/ay',
    description: 'Ciddi analizciler için tam erişim.',
    features: [
      'Sınırsız maç analizi',
      'AI Debate tam erişim',
      'Detaylı istatistikler',
      'Öncelikli bildirimler',
      'API erişimi',
    ],
    cta: 'Pro\'ya Geçiş Yap',
    featured: true,
  },
  {
    name: 'Kurumsal',
    price: 'Özel',
    period: '',
    description: 'Büyük takımlar için özelleştirilmiş çözüm.',
    features: [
      'Pro\'daki her şey',
      'Özel AI modeli eğitimi',
      'Dedicated destek',
      'SLA garantisi',
      'Beyaz etiket seçeneği',
    ],
    cta: 'İletişime Geç',
    featured: false,
  },
];

const testimonials = [
  {
    name: 'Ahmet Y.',
    role: 'Spor Analisti',
    quote: 'Next59 sayesinde maç analizlerimde çok daha tutarlı sonuçlar elde ediyorum. AI Debate sistemi gerçekten oyun değiştirici.',
    rating: 5,
  },
  {
    name: 'Mehmet K.',
    role: 'İçerik Üreticisi',
    quote: 'Eskiden bir maç analizi için saatler harcardım. Şimdi birkaç dakika içinde kapsamlı bir analiz önümde oluyor.',
    rating: 5,
  },
  {
    name: 'Elif S.',
    role: 'Veri Bilimci',
    quote: 'Platformun veri kalitesi ve analiz derinliği etkileyici. Kurumsal müşterilerimiz için vazgeçilmez bir araç oldu.',
    rating: 5,
  },
];

export default function LandingPage() {
  const { lang } = useParams();
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-navy-900/50 to-navy-950" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-gold-500/10 border border-gold-500/20 rounded-full px-4 py-1.5 mb-6">
              <Zap className="w-3.5 h-3.5 text-gold-400" />
              <span className="text-xs font-medium text-gold-400">AI Destekli Futbol Analizi</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight">
              Maçın 90 Dakikasını,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">
                Maç Başlamadan Yazıyoruz
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-navy-300 max-w-2xl mx-auto leading-relaxed">
              Yapay zekâ destekli analiz platformumuz ile futbol maçlarını daha önce hiç olmadığı kadar derinlemesine analiz edin.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to={`/${lang}/register`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold px-8 py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-gold-500/20 text-sm"
              >
                Ücretsiz Başla
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#how-it-works"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-navy-700 hover:border-navy-600 text-navy-200 hover:text-white font-medium px-8 py-3.5 rounded-xl transition-all text-sm"
              >
                Nasıl Çalışır?
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="bg-navy-800/40 border border-navy-700/50 rounded-xl p-5 text-center hover:bg-navy-800/60 transition-colors group"
              >
                <stat.icon className="w-5 h-5 text-gold-500 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <div className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-navy-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 sm:py-28 bg-navy-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Neden <span className="text-gold-500">Next59</span>?
            </h2>
            <p className="mt-4 text-navy-300">
              En gelişmiş yapay zekâ teknolojileriyle futbol analizinin sınırlarını zorluyoruz.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-navy-800/30 border border-navy-700/40 rounded-xl p-6 hover:bg-navy-800/50 hover:border-navy-600/50 transition-all group"
              >
                <div className="w-10 h-10 bg-gold-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-gold-500/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-gold-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-navy-300 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Nasıl <span className="text-gold-500">Çalışır</span>?
            </h2>
            <p className="mt-4 text-navy-300">
              Dört basit adımda maç analizinizi tamamlayın.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {howItWorks.map((item, i) => (
              <div key={item.step} className="relative">
                {i < howItWorks.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-navy-700 to-transparent z-0" />
                )}
                <div className="relative bg-navy-800/30 border border-navy-700/40 rounded-xl p-6 hover:bg-navy-800/50 transition-colors">
                  <span className="text-3xl font-bold text-gold-500/20">{item.step}</span>
                  <h3 className="text-base font-semibold text-white mt-3 mb-2">{item.title}</h3>
                  <p className="text-sm text-navy-300">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 sm:py-28 bg-navy-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Kullanıcılarımız <span className="text-gold-500">Ne Diyor</span>?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="bg-navy-800/30 border border-navy-700/40 rounded-xl p-6 hover:bg-navy-800/50 transition-colors"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-gold-500 fill-gold-500" />
                  ))}
                </div>
                <p className="text-sm text-navy-200 leading-relaxed mb-4 italic">"{t.quote}"</p>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-navy-400">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              <span className="text-gold-500">Fiyatlandırma</span>
            </h2>
            <p className="mt-4 text-navy-300">
              İhtiyacınıza uygun planı seçin. İstediğiniz zaman yükseltebilirsiniz.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl p-6 transition-all ${
                  plan.featured
                    ? 'bg-gradient-to-b from-gold-500/10 to-navy-800/50 border-2 border-gold-500/40 shadow-lg shadow-gold-500/5 scale-[1.02]'
                    : 'bg-navy-800/30 border border-navy-700/40 hover:bg-navy-800/50'
                }`}
              >
                {plan.featured && (
                  <div className="text-xs font-semibold text-gold-400 uppercase tracking-wider mb-3">En Popüler</div>
                )}
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="text-sm text-navy-300 mt-1 mb-4">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-6">
                  {plan.price !== 'Ücretsiz' && plan.price !== 'Özel' && (
                    <span className="text-lg text-navy-400">TL</span>
                  )}
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  {plan.period && <span className="text-navy-400">{plan.period}</span>}
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-navy-200">
                      <Check className="w-4 h-4 text-gold-500 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  to={`/${lang}/register`}
                  className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                    plan.featured
                      ? 'bg-gold-500 hover:bg-gold-400 text-navy-950'
                      : 'border border-navy-600 hover:border-navy-500 text-navy-200 hover:text-white'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-28 bg-navy-900/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Analize Hemen Başlayın
          </h2>
          <p className="text-lg text-navy-300 mb-8 max-w-2xl mx-auto">
            Binlerce kullanıcıya katılın ve yapay zekâ destekli futbol analizinin gücünü keşfedin.
          </p>
          <Link
            to={`/${lang}/register`}
            className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold px-8 py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-gold-500/20 text-sm"
          >
            Ücretsiz Hesap Oluştur
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <CookieBanner />
    </>
  );
}
