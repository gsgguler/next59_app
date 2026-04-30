import LegalPageLayout from './LegalPageLayout';

export default function TermsPage() {
  return (
    <LegalPageLayout title="Kullanım Şartları" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Kabul ve Onay</h2>
        <p>
          Next59 platformuna erişim sağlayarak ve kullanımını sürdürerek, bu kullanım şartlarını
          okuduğunuzu, anladığınızı ve kabul ettiğinizi beyan etmiş olursunuz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Hizmet Tanımı</h2>
        <p>
          Next59, yapay zeka destekli futbol analiz ve maç hikâyesi platformudur. Platform, istatistiksel
          modeller ve makine öğrenmesi teknikleri kullanılarak oluşturulan içerikler sunmaktadır.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Sorumluluk Sınırlaması</h2>
        <p>
          Platformumuzda sunulan analizler ve maç hikâyeleri yalnızca bilgilendirme amacıdır. Bu içerikler
          yatırım, bahis veya finansal karar tavsiyesi niteliğinde değildir. Kullanıcılar, platform
          içeriklerine dayanarak aldıkları kararların tüm sorumluluğunun kendilerine ait olduğunu
          kabul eder.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Hesap Güvenliği</h2>
        <p>
          Kullanıcılar hesap bilgilerinin gizliliğini korumakla yükümlüdür. Hesabınız üzerinden
          gerçekleştirilen tüm işlemlerden siz sorumlusunuz. Yetkisiz erişim tespitinde derhal
          bize bildirim yapmanız gerekmektedir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Fikri Mülkiyet</h2>
        <p>
          Platform üzerindeki tüm içerik, tasarım, algoritmalar ve modeller Next59'a aittir. Yazılı
          izin olmadan kopyalanamaz, dağıtılamaz veya ticari amaçla kullanılamaz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Değişiklikler</h2>
        <p>
          Next59, bu kullanım şartlarını önceden bildirim yapmaksızın güncelleme hakkını saklı tutar.
          Güncellenmiş şartlar platformda yayınlandığı anda yürürlüğe girer.
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
