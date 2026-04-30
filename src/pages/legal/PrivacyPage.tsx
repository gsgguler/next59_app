import LegalPageLayout from './LegalPageLayout';

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Gizlilik Politikas\u0131" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Genel Bak\u0131\u015f</h2>
        <p>
          Next59 olarak kullan\u0131c\u0131lar\u0131m\u0131z\u0131n gizlili\u011fine \u00f6nem veriyoruz. Bu politika, platformumuzu
          kullan\u0131rken toplanan, i\u015flenen ve saklanan ki\u015fisel verilere ili\u015fkin uygulamalar\u0131m\u0131z\u0131
          a\u00e7\u0131klamaktad\u0131r.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Toplanan Veriler</h2>
        <p>
          Platformumuza kay\u0131t oldu\u011funuzda ad, soyad, e-posta adresi gibi temel kimlik bilgilerinizi
          topluyoruz. Ayr\u0131ca platform kullan\u0131m\u0131n\u0131z s\u0131ras\u0131nda otomatik olarak IP adresi, taray\u0131c\u0131
          bilgileri ve kullan\u0131m istatistikleri gibi teknik veriler de toplanmaktad\u0131r.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Verilerin Kullan\u0131m\u0131</h2>
        <p>
          Toplanan veriler; hizmet sunumu, kullan\u0131c\u0131 deneyiminin iyile\u015ftirilmesi, g\u00fcvenlik
          \u00f6nlemlerinin uygulanmas\u0131 ve yasal y\u00fck\u00fcml\u00fcl\u00fcklerimizin yerine getirilmesi amac\u0131yla
          kullan\u0131lmaktad\u0131r.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Veri G\u00fcvenli\u011fi</h2>
        <p>
          Ki\u015fisel verileriniz end\u00fcstri standartlar\u0131nda \u015fifreleme ve g\u00fcvenlik protokolleri ile
          korunmaktad\u0131r. Verilerinize yaln\u0131zca yetkili personelimiz eri\u015fim sa\u011flamaktad\u0131r.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. \u00dc\u00e7\u00fcnc\u00fc Taraf Payla\u015f\u0131m\u0131</h2>
        <p>
          Ki\u015fisel verileriniz, yasal zorunluluklar d\u0131\u015f\u0131nda, a\u00e7\u0131k r\u0131zan\u0131z olmadan \u00fc\u00e7\u00fcnc\u00fc taraflarla
          payla\u015f\u0131lmamaktad\u0131r.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. \u0130leti\u015fim</h2>
        <p>
          Gizlilik politikam\u0131z hakk\u0131nda sorular\u0131n\u0131z i\u00e7in legal@next59.com adresinden bize
          ula\u015fabilirsiniz.
        </p>
      </section>

      <div className="mt-8 p-4 bg-navy-50 rounded-xl border border-navy-100">
        <p className="text-xs text-navy-600 italic">
          Bu sayfa, yasal ekibimiz taraf\u0131ndan tam i\u00e7erik haz\u0131rlanana kadar taslak olarak
          yay\u0131nlanmaktad\u0131r. L\u00fctfen yasal ba\u011flamlarda referans almadan \u00f6nce g\u00fcncel versiyonu kontrol
          ediniz.
        </p>
      </div>
    </LegalPageLayout>
  );
}
