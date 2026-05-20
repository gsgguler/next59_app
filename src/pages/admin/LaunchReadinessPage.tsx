import { useState } from 'react';
import {
  Rocket, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Globe, FileText, Shield, Map, Link2, AlertCircle, Info, ExternalLink,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus = 'ok' | 'warn' | 'blocker' | 'info';

interface CheckItem {
  id: string;
  label: string;
  status: ItemStatus;
  detail: string;
  action?: string;
}

interface CheckGroup {
  key: string;
  title: string;
  icon: React.ElementType;
  items: CheckItem[];
}

// ─── Static audit data ────────────────────────────────────────────────────────

const CHECKS: CheckGroup[] = [
  {
    key: 'seo',
    title: 'SEO Durumu',
    icon: Globe,
    items: [
      {
        id: 'robots-disallows',
        label: 'robots.txt — Admin/auth yolları engellendi',
        status: 'ok',
        detail: '/admin, /dashboard, /giris, /kayit, /profile, /settings, /matches, /predictions, /debates disallow listesinde.',
      },
      {
        id: 'robots-sitemap',
        label: 'robots.txt — Sitemap referansı mevcut',
        status: 'ok',
        detail: 'Sitemap: https://www.next59.com/sitemap.xml',
      },
      {
        id: 'sitemap-auth-removed',
        label: 'Sitemap — Auth sayfaları kaldırıldı',
        status: 'ok',
        detail: '/giris ve /kayit sitemap\'ten çıkarıldı. Sadece public sayfalar indeksleniyor.',
      },
      {
        id: 'sitemap-coverage',
        label: 'Sitemap — Public route kapsamı',
        status: 'ok',
        detail: '36 URL: ana sayfa, WC2026, arşiv, analitik, senaryolar, yazılar, next59, hukuki. Dinamik /mac/:id sayfaları sitemap\'e dahil edilmedi — öneri: dinamik sitemap fonksiyonu.',
        action: 'Öneri: Dinamik maç URL\'leri için sunucu tarafında sitemap üretimi eklenebilir.',
      },
      {
        id: 'sitemap-lastmod',
        label: 'Sitemap — lastmod tarihleri',
        status: 'warn',
        detail: 'Tüm URL\'ler sabit 2026-05-20 lastmod değeri taşıyor. Otomatik güncelleme için CI/CD entegrasyonu öneriliyor.',
        action: 'CI/CD\'de sitemap yenileme scripti çalıştırın: npm run generate:sitemap',
      },
      {
        id: 'og-tags',
        label: 'OG / Twitter meta tag\'leri',
        status: 'ok',
        detail: 'MatchDetailPage\'de dinamik OG tag\'leri mevcut. og-match Edge Function aktif.',
      },
    ],
  },
  {
    key: 'robots',
    title: 'Robots Durumu',
    icon: Shield,
    items: [
      {
        id: 'robots-admin',
        label: 'Admin rotaları tarayıcılardan gizlendi',
        status: 'ok',
        detail: 'Disallow: /admin/ ve /admin etkin.',
      },
      {
        id: 'robots-dashboard',
        label: 'Dashboard rotaları tarayıcılardan gizlendi',
        status: 'ok',
        detail: 'Disallow: /dashboard ve /dashboard/ etkin.',
      },
      {
        id: 'robots-auth',
        label: 'Auth rotaları tarayıcılardan gizlendi',
        status: 'ok',
        detail: 'Disallow: /giris, /kayit etkin.',
      },
    ],
  },
  {
    key: 'legal',
    title: 'Hukuki Metin Durumu',
    icon: FileText,
    items: [
      {
        id: 'privacy-draft',
        label: 'Gizlilik Politikası — Taslak uyarısı var',
        status: 'warn',
        detail: 'Sayfa sonunda: "yasal ekibimiz tarafından tam içerik hazırlanana kadar taslak" notu mevcut. Son onay bekleniyor.',
        action: 'Yasal ekibin onayından sonra taslak notunu kaldırın.',
      },
      {
        id: 'terms-draft',
        label: 'Kullanım Şartları — Taslak uyarısı var',
        status: 'warn',
        detail: 'Sayfa sonunda taslak notu mevcut. Sorumluluk sınırlaması bölümü var; bahis/yatırım tavsiyesi reddi açık.',
        action: 'Yasal ekibin onayından sonra taslak notunu kaldırın.',
      },
      {
        id: 'kvkk-draft',
        label: 'KVKK Aydınlatma Metni — Taslak uyarısı var',
        status: 'warn',
        detail: 'Sayfa sonunda taslak notu mevcut. 6698 sayılı KVKK\'ya atıf mevcut. kvkk@next59.com referansı var.',
        action: 'Yasal ekibin onayından sonra taslak notunu kaldırın.',
      },
      {
        id: 'cookies-draft',
        label: 'Çerez Politikası — Taslak uyarısı var',
        status: 'warn',
        detail: 'Sayfa sonunda taslak notu mevcut. legal@next59.com referansı var.',
        action: 'Yasal ekibin onayından sonra taslak notunu kaldırın.',
      },
      {
        id: 'yasal-uyari',
        label: 'Yasal Uyarı / Sorumluluk Reddi — Taslak notu yok',
        status: 'ok',
        detail: 'Bahis bağımlılığı uyarısı (182 numaralı ALO Sosyal) mevcut. Bahis şirketi ilişkisizlik beyanı var.',
      },
      {
        id: 'disclaimer-oracle',
        label: 'Maç sayfaları — "Veri Senaryosu" uyarısı',
        status: 'ok',
        detail: 'PreMatchOracle\'da "Veri Senaryosu — Kesin Sonuç Değildir" banner\'ı eklendi. WcPredictionPanel\'da da mevcut.',
      },
      {
        id: 'legal-email-legal',
        label: 'İletişim e-posta — legal@next59.com',
        status: 'warn',
        detail: 'PrivacyPage ve CookiesPage\'de referans verilen legal@next59.com adresinin aktif olduğu doğrulanmadı.',
        action: 'E-posta adresinin gerçek bir mailbox\'a yönlendiğini doğrulayın.',
      },
      {
        id: 'legal-email-kvkk',
        label: 'İletişim e-posta — kvkk@next59.com',
        status: 'warn',
        detail: 'KvkkPage\'de referans verilen kvkk@next59.com adresinin aktif olduğu doğrulanmadı.',
        action: 'E-posta adresinin gerçek bir mailbox\'a yönlendiğini doğrulayın.',
      },
    ],
  },
  {
    key: 'routes',
    title: 'Placeholder Sayfalar',
    icon: Map,
    items: [
      {
        id: 'ph-dashboard-senaryolar',
        label: '/dashboard/senaryolar — PlaceholderPage',
        status: 'info',
        detail: 'Bu sayfa yapım aşamasında (PlaceholderPage). Kullanıcıya görünür ama içerik yok.',
        action: 'Gerçek içerik eklenene kadar sidebar\'dan gizlenebilir.',
      },
      {
        id: 'ph-dashboard-izleme',
        label: '/dashboard/izleme-listem — PlaceholderPage',
        status: 'info',
        detail: 'PlaceholderPage.',
      },
      {
        id: 'ph-dashboard-favori',
        label: '/dashboard/favori-takimlar — PlaceholderPage',
        status: 'info',
        detail: 'PlaceholderPage.',
      },
      {
        id: 'ph-news',
        label: '/news — PlaceholderPage',
        status: 'info',
        detail: 'PlaceholderPage.',
      },
      {
        id: 'ph-admin-veri',
        label: '/admin/veri-kontrol — PlaceholderPage',
        status: 'info',
        detail: 'Admin PlaceholderPage. Yalnızca admin kullanıcılara görünür; SEO riski yok.',
      },
      {
        id: 'ph-admin-mac',
        label: '/admin/mac-yonetimi — PlaceholderPage',
        status: 'info',
        detail: 'Admin PlaceholderPage.',
      },
      {
        id: 'ph-admin-takim',
        label: '/admin/takim-eslestirme — PlaceholderPage',
        status: 'info',
        detail: 'Admin PlaceholderPage.',
      },
      {
        id: 'ph-admin-icerik',
        label: '/admin/icerik-yonetimi — PlaceholderPage',
        status: 'info',
        detail: 'Admin PlaceholderPage.',
      },
      {
        id: 'ph-admin-kullanici',
        label: '/admin/kullanicilar — PlaceholderPage',
        status: 'info',
        detail: 'Admin PlaceholderPage.',
      },
      {
        id: 'ph-admin-sistem',
        label: '/admin/sistem-sagligi — PlaceholderPage',
        status: 'info',
        detail: 'Admin PlaceholderPage.',
      },
    ],
  },
  {
    key: 'contact',
    title: 'İletişim & İçerik',
    icon: Link2,
    items: [
      {
        id: 'contact-placeholder',
        label: '/next59/iletisim — İletişim bilgisi eksik',
        status: 'blocker',
        detail: '"İletişim bilgileri yakında güncellenecek." — Sayfada gerçek e-posta veya form yok. Kullanıcılar bu sayfaya tıklarsa boş içerik görür.',
        action: 'Gerçek bir iletişim e-posta adresi veya form ekleyin.',
      },
      {
        id: 'footer-links',
        label: 'Footer linkleri — Tümü geçerli',
        status: 'ok',
        detail: 'Archive, Analitik, Next59, Yasal gruplarındaki tüm footer linkleri tanımlı rotalara işaret ediyor.',
      },
      {
        id: 'basin-page',
        label: '/next59/basin — Basın sayfası',
        status: 'warn',
        detail: 'IletisimPage\'den basın sayfasına link var. Basın sayfasının içeriği doğrulanmadı.',
        action: 'BasinPage içeriğini gözden geçirin.',
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusIcon(s: ItemStatus) {
  switch (s) {
    case 'ok':      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    case 'warn':    return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
    case 'blocker': return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    case 'info':    return <Info className="w-4 h-4 text-navy-400 shrink-0" />;
  }
}

function statusBadge(s: ItemStatus) {
  switch (s) {
    case 'ok':      return <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">Tamam</span>;
    case 'warn':    return <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">Uyarı</span>;
    case 'blocker': return <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">Launch Engeli</span>;
    case 'info':    return <span className="text-[10px] font-semibold text-navy-400 bg-navy-700/50 border border-navy-600/30 rounded-full px-2 py-0.5">Bilgi</span>;
  }
}

function rowBg(s: ItemStatus) {
  if (s === 'blocker') return 'bg-red-500/3 hover:bg-red-500/6';
  if (s === 'warn')    return 'hover:bg-amber-500/3';
  return 'hover:bg-navy-800/15';
}

// ─── Summary counts ───────────────────────────────────────────────────────────

function computeSummary(groups: CheckGroup[]) {
  const all = groups.flatMap(g => g.items);
  return {
    total:    all.length,
    ok:       all.filter(i => i.status === 'ok').length,
    warn:     all.filter(i => i.status === 'warn').length,
    blocker:  all.filter(i => i.status === 'blocker').length,
    info:     all.filter(i => i.status === 'info').length,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LaunchReadinessPage() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(CHECKS.map(g => g.key)),
  );
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) =>
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleItem = (id: string) =>
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const summary = computeSummary(CHECKS);

  return (
    <div className="min-h-screen bg-navy-950 p-6">
      <div className="max-w-5xl mx-auto">

        {/* Admin banner */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-3 mb-8 flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            <strong>Launch Hazırlık Raporu — Yalnızca Admin.</strong>{' '}
            Bu sayfa SEO, robots, hukuki metin ve placeholder rota durumunu izler.
            Otomatik düzeltme yapılmaz — her madde el ile onaylanmalıdır.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-champagne/10 border border-champagne/20 flex items-center justify-center shrink-0">
              <Rocket className="w-6 h-6 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Launch Hazırlık Durumu</h1>
              <p className="text-sm text-readable-muted mt-1">
                SEO Durumu · Sitemap · Robots · Hukuki Metin · Placeholder Sayfalar · Yayın Engelleri
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <a
              href="https://www.next59.com/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-navy-800 border border-navy-700 text-navy-400 hover:text-white transition-all"
            >
              <ExternalLink className="w-3 h-3" />
              Sitemap
            </a>
          </div>
        </div>

        {/* Blocker alert */}
        {summary.blocker > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3.5 mb-6 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-400 mb-1">
                {summary.blocker} Launch Engeli Tespit Edildi
              </div>
              <div className="text-xs text-red-300">
                Aşağıdaki maddeler canlıya geçmeden önce çözülmelidir.
              </div>
            </div>
          </div>
        )}

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Toplam Kontrol" value={summary.total} />
          <SummaryCard label="Tamam" value={summary.ok} accent="green" />
          <SummaryCard label="Uyarı" value={summary.warn} accent={summary.warn > 0 ? 'amber' : undefined} />
          <SummaryCard label="Launch Engeli" value={summary.blocker} accent={summary.blocker > 0 ? 'red' : undefined} />
        </div>

        {/* Check groups */}
        <div className="space-y-4">
          {CHECKS.map(group => {
            const GroupIcon = group.icon;
            const isOpen = expandedGroups.has(group.key);
            const groupBlockers = group.items.filter(i => i.status === 'blocker').length;
            const groupWarns   = group.items.filter(i => i.status === 'warn').length;
            const groupOk      = group.items.filter(i => i.status === 'ok').length;

            return (
              <div key={group.key} className="bg-navy-900/50 border border-navy-800 rounded-xl overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-navy-800/20 transition-colors"
                >
                  <GroupIcon className="w-4 h-4 text-navy-400 shrink-0" />
                  <span className="text-sm font-semibold text-white flex-1 text-left">{group.title}</span>

                  {/* Group summary pills */}
                  <div className="flex items-center gap-1.5">
                    {groupBlockers > 0 && (
                      <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
                        {groupBlockers} engel
                      </span>
                    )}
                    {groupWarns > 0 && (
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                        {groupWarns} uyarı
                      </span>
                    )}
                    <span className="text-[10px] text-navy-500 font-mono">{groupOk}/{group.items.length} ok</span>
                  </div>

                  {isOpen
                    ? <ChevronUp className="w-4 h-4 text-navy-500 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-navy-500 shrink-0" />
                  }
                </button>

                {/* Group items */}
                {isOpen && (
                  <div className="divide-y divide-navy-800/50 border-t border-navy-800">
                    {group.items.map(item => {
                      const isItemOpen = expandedItems.has(item.id);
                      return (
                        <div key={item.id} className={rowBg(item.status)}>
                          <button
                            onClick={() => toggleItem(item.id)}
                            className="w-full flex items-center gap-3 px-5 py-3 text-left"
                          >
                            {statusIcon(item.status)}
                            <span className="flex-1 text-sm text-white">{item.label}</span>
                            {statusBadge(item.status)}
                            {isItemOpen
                              ? <ChevronUp className="w-3.5 h-3.5 text-navy-600 shrink-0 ml-1" />
                              : <ChevronDown className="w-3.5 h-3.5 text-navy-600 shrink-0 ml-1" />
                            }
                          </button>

                          {isItemOpen && (
                            <div className="px-5 pb-4 border-t border-navy-800/40">
                              <p className="text-xs text-navy-400 leading-relaxed mt-3">
                                {item.detail}
                              </p>
                              {item.action && (
                                <div className="mt-2 flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                  <p className="text-[11px] text-amber-300">{item.action}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* robots.txt & sitemap quick view */}
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <div className="bg-navy-900/30 border border-navy-800/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-3.5 h-3.5 text-navy-500" />
              <span className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider">robots.txt özeti</span>
            </div>
            <pre className="text-[10px] text-navy-400 font-mono leading-relaxed whitespace-pre-wrap">
{`User-agent: *
Allow: /

Disallow: /giris
Disallow: /kayit
Disallow: /dashboard
Disallow: /admin
Disallow: /profile
Disallow: /settings
Disallow: /matches
Disallow: /predictions
Disallow: /debates

Sitemap: https://www.next59.com/sitemap.xml`}
            </pre>
          </div>

          <div className="bg-navy-900/30 border border-navy-800/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-3.5 h-3.5 text-navy-500" />
              <span className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider">Taslak Uyarısı Olan Sayfalar</span>
            </div>
            <div className="space-y-1.5">
              {[
                { path: '/privacy', label: 'Gizlilik Politikası' },
                { path: '/terms',   label: 'Kullanım Şartları' },
                { path: '/kvkk',    label: 'KVKK Aydınlatma Metni' },
                { path: '/cookies', label: 'Çerez Politikası' },
              ].map(p => (
                <div key={p.path} className="flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="text-[11px] font-mono text-navy-400">{p.path}</span>
                  <span className="text-[11px] text-navy-500">— {p.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-[11px] font-mono text-navy-400">/yasal-uyari</span>
                <span className="text-[11px] text-navy-500">— Taslak notu yok</span>
              </div>
            </div>
            <p className="text-[10px] text-navy-600 mt-3 leading-relaxed">
              Taslak notları uyarı seviyesindedir; sitede görünür ancak launch engeli değil.
              Yasal ekip onayından sonra kaldırılmalıdır.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, accent,
}: {
  label: string;
  value: number;
  accent?: 'green' | 'amber' | 'red';
}) {
  const color =
    accent === 'green' ? 'text-emerald-400' :
    accent === 'amber' ? 'text-amber-400'   :
    accent === 'red'   ? 'text-red-400'     :
    'text-white';
  return (
    <div className="bg-navy-900/50 border border-navy-800 rounded-xl px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] text-readable-muted mt-0.5">{label}</div>
    </div>
  );
}
