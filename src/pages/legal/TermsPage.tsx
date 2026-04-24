import LegalPageLayout from './LegalPageLayout';

export default function TermsPage() {
  return (
    <LegalPageLayout title="Kullanim Sartlari" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Kabul ve Onay</h2>
        <p>
          Next59 platformuna erisim saglayarak ve kullanimini surdururek, bu kullanim sartlarini
          okudugunuzu, anladiginizi ve kabul ettiginizi beyan etmis olursunuz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Hizmet Tanimi</h2>
        <p>
          Next59, yapay zeka destekli futbol analiz ve tahmin platformudur. Platform, istatistiksel
          modeller ve makine ogrenmesi teknikleri kullanilarak olusturulan icerikler sunmaktadir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Sorumluluk Sinirlamasi</h2>
        <p>
          Platformumuzda sunulan tahmin ve analizler yalnizca bilgilendirme amacidir. Bu icerikler
          yatirim, bahis veya finansal karar tavsiyesi niteliginde degildir. Kullanicilar, platform
          iceriklerine dayanarak aldiklari kararlarin tum sorumlulugunun kendilerine ait oldugunu
          kabul eder.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Hesap Guvenligi</h2>
        <p>
          Kullanicilar hesap bilgilerinin gizliligini korumakla yukumludur. Hesabiniz uzerinden
          gerceklestirilen tum islemlerden siz sorumlusunuz. Yetkisiz erisim tespitinde derhal
          bize bildirim yapmaniz gerekmektedir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Fikri Mulkiyet</h2>
        <p>
          Platform uzerindeki tum icerik, tasarim, algoritmalar ve modeller Next59'a aittir. Yazili
          izin olmadan kopyalanamaz, dagittilamaz veya ticari amacla kullanilamaz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Degisiklikler</h2>
        <p>
          Next59, bu kullanim sartlarini onceden bildirim yapmaksizin guncelleme hakkini sakli tutar.
          Guncellenmis sartlar platformda yayinlandigi anda yururluge girer.
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
