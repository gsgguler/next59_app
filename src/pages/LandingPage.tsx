import { Link } from 'react-router-dom';
import {
  Brain,
  MessageSquare,
  BarChart3,
  Zap,
  ChevronRight,
  ArrowRight,
  Globe,
  BookOpen,
} from 'lucide-react';
import CookieBanner from '../components/legal/CookieBanner';

const features = [
  {
    icon: Brain,
    title: 'AI Tabanlı Senaryo Analizi',
    description: 'Yapay zekâ modellerimiz geçmiş verileri, form durumlarını ve taktiksel değişkenleri analiz ederek maç öncesi senaryo oluşturur.',
  },
  {
    icon: MessageSquare,
    title: 'AI Tartışma Sistemi',
    description: 'Farklı bakış açılarını temsil eden AI personalar, her maç için lehte ve aleyhte argümanlarıyla tartışarak bir uzlaşıya varır.',
  },
  {
    icon: BarChart3,
    title: 'Kapsamlı Maç Arşivi',
    description: 'Avrupa\'nın büyük ligleri ve Dünya Kupası için maç istatistikleri, kadro verileri ve tarihsel karşılaşma geçmişi.',
  },
  {
    icon: Globe,
    title: '2026 Dünya Kupası',
    description: 'Haziran 2026\'da başlayan FIFA Dünya Kupası için tüm fikstürler, gruplar ve analiz altyapısı hazırlanıyor.',
  },
  {
    icon: Zap,
    title: 'Tahmin Motoru',
    description: 'Olasılık tabanlı tahmin modeli; maç sonucu, gol sayısı ve kritik olaylar için senaryolar üretir.',
  },
  {
    icon: BookOpen,
    title: 'Sorumlu Analiz',
    description: 'Next59 bir bahis aracı değildir. Tüm analizler AI gazetecilik çerçevesinde, olasılıksal dille sunulur.',
  },
];

const howItWorks = [
  { step: '01', title: 'Maç Seçin', description: 'Analiz etmek istediğiniz yaklaşan ya da geçmiş maçı listeden seçin.' },
  { step: '02', title: 'AI Analiz Eder', description: 'Modellerimiz form, istatistik ve tarihsel veriyi işleyerek maç senaryosu oluşturur.' },
  { step: '03', title: 'Tartışmayı Okuyun', description: 'AI personalar maç hakkında farklı senaryoları tartışır ve ortak bir değerlendirmeye varır.' },
  { step: '04', title: 'Daha İyi Anlayın', description: 'Kapsamlı analize dayanarak maçı daha derinlemesine değerlendirin.' },
];

export default function LandingPage() {
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
              <span className="text-xs font-medium text-gold-400">AI Destekli Futbol Gazeteciliği</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight">
              Maçın 90 Dakikasını,{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">
                Maç Başlamadan Yazıyoruz
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-navy-300 max-w-2xl mx-auto leading-relaxed">
              Yapay zekâ senaryoları, AI tartışma sistemi ve kapsamlı maç arşivi ile futbol analizini farklı bir perspektiften keşfedin.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
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

          {/* Platform highlights — no fabricated numbers */}
          <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {[
              { label: 'AI Senaryo Analizi', desc: 'Her maç için olasılıksal senaryo' },
              { label: 'Çoklu AI Tartışması', desc: '4 persona, 3 tur, 1 uzlaşı' },
              { label: 'Dünya Kupası 2026', desc: 'Haziran\'dan itibaren tam kapsam' },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-navy-800/40 border border-navy-700/50 rounded-xl p-5 text-center hover:bg-navy-800/60 transition-colors"
              >
                <div className="text-sm font-semibold text-white">{item.label}</div>
                <div className="text-xs text-navy-400 mt-1">{item.desc}</div>
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
              AI gazetecilik altyapısı ile futbol senaryolarını veri temelli, sorumlu bir dille sunuyoruz.
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
              Dört adımda maç analizinizi tamamlayın.
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

      {/* Editorial stance */}
      <section className="py-16 bg-navy-900/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-4">
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">Sorumlu Analiz İlkesi</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Next59 bir bahis sitesi değildir
          </h2>
          <p className="text-navy-300 leading-relaxed">
            Tüm analizler AI gazetecilik çerçevesinde üretilir ve olasılıksal dille sunulur.
            Hiçbir analiz kesin sonuç iddiası taşımaz; tüm senaryolar tartışma ve değerlendirme amaçlıdır.
          </p>
          <Link
            to="/next59/bahis-karsiti-durus"
            className="inline-flex items-center gap-1.5 mt-5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Bahis Karşıtı Duruşumuzu Okuyun
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Hemen Keşfedin
          </h2>
          <p className="text-lg text-navy-300 mb-8 max-w-2xl mx-auto">
            Ücretsiz hesap oluşturun, AI destekli maç senaryolarını ve tartışmalarını inceleyin.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-navy-950 font-semibold px-8 py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-gold-500/20 text-sm"
            >
              Ücretsiz Hesap Oluştur
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/world-cup-2026"
              className="inline-flex items-center gap-2 border border-navy-700 hover:border-navy-600 text-navy-200 hover:text-white font-medium px-8 py-3.5 rounded-xl transition-all text-sm"
            >
              Dünya Kupası 2026
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <CookieBanner />
    </>
  );
}
