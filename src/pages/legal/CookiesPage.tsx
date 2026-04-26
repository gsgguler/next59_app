import LegalPageLayout from './LegalPageLayout';

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Çerez Politikası" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Çerez Nedir?</h2>
        <p>
          Çerezler, web sitelerinin tarayıcınıza gönderip cihazınızda sakladığı küçük metin
          dosyalarıdır. Sitemizi ziyaret ettiğinizde daha iyi bir kullanıcı deneyimi sunabilmek
          için çerezlerden faydalanıyoruz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Kullanılan Çerez Türleri</h2>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Zorunlu Çerezler</h3>
            <p>
              Platformun temel işlevlerinin çalıştırılması için gereklidir. Oturum yönetimi ve
              güvenlik kontrolleri bu kapsamdadır. Bu çerezler devre dışı bırakılamaz.
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Analitik Çerezler</h3>
            <p>
              Platform kullanımını analiz etmemize ve hizmet kalitesini arttırmamıza yardımcı olan
              çerezlerdir. Anonim kullanım verileri toplanmaktadır.
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Tercih Çerezleri</h3>
            <p>
              Dil tercihiniz, tema ayarınız gibi kişisel tercihlerinizi hatırlamak için
              kullanılmaktadır.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Çerez Yönetimi</h2>
        <p>
          Tarayıcı ayarlarınız üzerinden çerezleri yönetebilir, silebilir veya engeller
          koyabilirsiniz. Ancak zorunlu çerezlerin engellenmesi durumunda platformun bazı
          özellikleri düzgün çalışmayabilir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Üçüncü Taraf Çerezleri</h2>
        <p>
          Platformumuz, analitik ve performans ölçümleme amacıyla üçüncü taraf çerezleri
          kullanabilmektedir. Bu çerezler ilgili tarafların gizlilik politikalarına tabidir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. İletişim</h2>
        <p>
          Çerez politikamız hakkında sorularınız için legal@next59.com adresinden bize
          ulaşabilirsiniz.
        </p>
      </section>

      <div className="mt-8 p-4 bg-navy-50 rounded-xl border border-navy-100">
        <p className="text-xs text-navy-600 italic">
          Bu sayfa, yasal ekibimiz tarafından tam içerik hazırlanana kadar taslak olarak
          yayınlanmaktadır. Lütfen yasal bağlamlarda referans almadan önce güncel versiyonu kontrol
          ediniz.
        </p>
      </div>
    </LegalPageLayout>
  );
}
