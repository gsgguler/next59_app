import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Info, Shield, BookOpen, HelpCircle, Mail, Newspaper, ChevronRight } from 'lucide-react';

const sections = [
  {
    to: '/next59/hakkimizda',
    icon: Info,
    title: 'Hakkımızda',
    desc: 'Next59 nedir, ne yapar ve ne yapmaz.',
  },
  {
    to: '/next59/bahis-karsiti-durus',
    icon: Shield,
    title: 'Bahis Karşıtı Duruşumuz',
    desc: 'Neden bahis platformu değiliz ve editoryal ilkelerimiz.',
  },
  {
    to: '/next59/yayin-ilkeleri',
    icon: BookOpen,
    title: 'Yayın İlkeleri',
    desc: 'AI gazetecilik çerçevemiz ve içerik üretim standartlarımız.',
  },
  {
    to: '/next59/sss',
    icon: HelpCircle,
    title: 'Sıkça Sorulan Sorular',
    desc: 'Platform, veriler ve analizler hakkında en çok sorulanlar.',
  },
  {
    to: '/next59/basin',
    icon: Newspaper,
    title: 'Basın',
    desc: 'Medya kiti ve iletişim için basın bilgileri.',
  },
  {
    to: '/next59/iletisim',
    icon: Mail,
    title: 'İletişim',
    desc: 'Bize ulaşın.',
  },
];

export default function Next59Page() {
  useEffect(() => { document.title = 'Next59 Hakkında | Next59'; }, []);

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Info className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white font-display">Next59</h1>
              <p className="mt-1 text-sm text-readable-muted">
                Futbol zekâsı ve editoryal veri okuması platformu. Hakkımızda, yayın ilkeleri ve iletişim.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="divide-y divide-navy-800/50">
          {sections.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="flex items-center justify-between gap-4 py-5 group hover:bg-navy-900/40 -mx-4 px-4 rounded-lg transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-navy-800 border border-navy-700/60 flex items-center justify-center shrink-0 group-hover:border-champagne/30 transition-colors">
                  <s.icon className="w-4 h-4 text-navy-400 group-hover:text-champagne transition-colors" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{s.title}</p>
                  <p className="text-xs text-readable-muted mt-0.5">{s.desc}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-navy-600 group-hover:text-navy-400 shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
