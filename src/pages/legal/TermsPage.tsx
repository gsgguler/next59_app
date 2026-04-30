import LegalPageLayout from './LegalPageLayout';

export default function TermsPage() {
  return (
    <LegalPageLayout title="Kullan\u0131m \u015eartlar\u0131" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Kabul ve Onay</h2>
        <p>
          Next59 platformuna eri\u015fim sa\u011flayarak ve kullan\u0131m\u0131n\u0131 s\u00fcrd\u00fcrerek, bu kullan\u0131m \u015fartlar\u0131n\u0131
          okudu\u011funuzu, anlad\u0131\u011f\u0131n\u0131z\u0131 ve kabul etti\u011finizi beyan etmi\u015f olursunuz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Hizmet Tan\u0131m\u0131</h2>
        <p>
          Next59, yapay zeka destekli futbol analiz ve tahmin platformudur. Platform, istatistiksel
          modeller ve makine \u00f6\u011frenmesi teknikleri kullan\u0131larak olu\u015fturulan i\u00e7erikler sunmaktad\u0131r.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Sorumluluk S\u0131n\u0131rlamas\u0131</h2>
        <p>
          Platformumuzda sunulan tahmin ve analizler yaln\u0131zca bilgilendirme amac\u0131d\u0131r. Bu i\u00e7erikler
          yat\u0131r\u0131m, bahis veya finansal karar tavsiyesi niteli\u011finde de\u011fildir. Kullan\u0131c\u0131lar, platform
          i\u00e7eriklerine dayanarak ald\u0131klar\u0131 kararlar\u0131n t\u00fcm sorumlulu\u011funun kendilerine ait oldu\u011funu
          kabul eder.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Hesap G\u00fcvenli\u011fi</h2>
        <p>
          Kullan\u0131c\u0131lar hesap bilgilerinin gizlili\u011fini korumakla y\u00fck\u00fcml\u00fcd\u00fcr. Hesab\u0131n\u0131z \u00fczerinden
          ger\u00e7ekle\u015ftirilen t\u00fcm i\u015flemlerden siz sorumlusunuz. Yetkisiz eri\u015fim tespitinde derhal
          bize bildirim yapman\u0131z gerekmektedir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Fikri M\u00fclkiyet</h2>
        <p>
          Platform \u00fczerindeki t\u00fcm i\u00e7erik, tasar\u0131m, algoritmalar ve modeller Next59'a aittir. Yaz\u0131l\u0131
          izin olmadan kopyalanamaz, da\u011f\u0131t\u0131lamaz veya ticari ama\u00e7la kullan\u0131lamaz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. De\u011fi\u015fiklikler</h2>
        <p>
          Next59, bu kullan\u0131m \u015fartlar\u0131n\u0131 \u00f6nceden bildirim yapmaks\u0131z\u0131n g\u00fcncelleme hakk\u0131n\u0131 sakl\u0131 tutar.
          G\u00fcncellenmi\u015f \u015fartlar platformda yay\u0131nland\u0131\u011f\u0131 anda y\u00fcr\u00fcrl\u00fc\u011fe girer.
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
