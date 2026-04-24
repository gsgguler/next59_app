import LegalPageLayout from './LegalPageLayout';

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Gizlilik Politikasi" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Genel Bakis</h2>
        <p>
          Next59 olarak kullanicilarimizin gizliligine onem veriyoruz. Bu politika, platformumuzu
          kullanirken toplanan, islenen ve saklanan kisisel verilere iliskin uygulamalarimizi
          aciklamaktadir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Toplanan Veriler</h2>
        <p>
          Platformumuza kayit oldugunuzda ad, soyad, e-posta adresi gibi temel kimlik bilgilerinizi
          topluyoruz. Ayrica platform kullaniminiz sirasinda otomatik olarak IP adresi, tarayici
          bilgileri ve kullanim istatistikleri gibi teknik veriler de toplanmaktadir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Verilerin Kullanimi</h2>
        <p>
          Toplanan veriler; hizmet sunumu, kullanici deneyiminin iyilestirilmesi, guvenlik
          onlemlerinin uygulanmasi ve yasal yukumluluklerimizin yerine getirilmesi amaciyla
          kullanilmaktadir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Veri Guvenligi</h2>
        <p>
          Kisisel verileriniz endistri standartlarinda sifreleme ve guvenlik protokolleri ile
          korunmaktadir. Verilerinize yalnizca yetkili personelimiz erisim saglamaktadir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Ucuncu Taraf Paylasimi</h2>
        <p>
          Kisisel verileriniz, yasal zorunluluklar disinda, acik rizaniz olmadan ucuncu taraflarla
          paylasilmamaktadir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Iletisim</h2>
        <p>
          Gizlilik politikamiz hakkinda sorulariniz icin legal@next59.com adresinden bize
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
