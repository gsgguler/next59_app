import LegalPageLayout from './LegalPageLayout';

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Cerez Politikasi" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Cerez Nedir?</h2>
        <p>
          Cerezler, web sitelerinin tarayiciniza gonderip cihazinizda sakladigi kucuk metin
          dosyalaridir. Sitemizi ziyaret ettiginizde daha iyi bir kullanici deneyimi sunabilmek
          icin cerezlerden faydalaniyoruz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Kullanilan Cerez Turleri</h2>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Zorunlu Cerezler</h3>
            <p>
              Platformun temel islevlerinin calistirilmasi icin gereklidir. Oturum yonetimi ve
              guvenlik kontrolleri bu kapsamdadir. Bu cerezler devre disi birakilamaz.
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Analitik Cerezler</h3>
            <p>
              Platform kullanimini analiz etmemize ve hizmet kalitesini arttirmamiza yardimci olan
              cerezlerdir. Anonim kullanim verileri toplanmaktadir.
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Tercih Cerezleri</h3>
            <p>
              Dil tercihiniz, tema ayariniz gibi kisisel tercihlerinizi hatirlamak icin
              kullanilmaktadir.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Cerez Yonetimi</h2>
        <p>
          Tarayici ayarlariniz uzerinden cerezleri yonetebilir, silebilir veya engeller
          koyabilirsiniz. Ancak zorunlu cerezlerin engellenmesi durumunda platformun bazi
          ozellikleri duzgun calismayabilir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Ucuncu Taraf Cerezleri</h2>
        <p>
          Platformumuz, analitik ve performans olcumleme amaciyla ucuncu taraf cerezleri
          kullanabilmektedir. Bu cerezler ilgili taraflarin gizlilik politikalarina tabidir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Iletisim</h2>
        <p>
          Cerez politikamiz hakkinda sorulariniz icin legal@next59.com adresinden bize
          ulasabilirsiniz.
        </p>
      </section>

      <div className="mt-8 p-4 bg-navy-50 rounded-xl border border-navy-100">
        <p className="text-xs text-navy-600 italic">
          Bu sayfa, yasal ekibimiz tarafindan tam icerik hazirlanana kadar taslak olarak
          yayinlanmaktadir. Lutfen yasal baglamlarda referans almadan once guncel versiyonu kontrol
          ediniz.
        </p>
      </div>
    </LegalPageLayout>
  );
}
