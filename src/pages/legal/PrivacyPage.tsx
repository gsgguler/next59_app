import LegalPageLayout from './LegalPageLayout';

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Gizlilik Politikası" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Genel Bakış</h2>
        <p>
          Next59 olarak kullanıcılarımızın gizliliğine önem veriyoruz. Bu politika, platformumuzu
          kullanırken toplanan, işlenen ve saklanan kişisel verilere ilişkin uygulamalarımızı
          açıklamaktadır.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Toplanan Veriler</h2>
        <p>
          Platformumuza kayıt olduğunuzda ad, soyad, e-posta adresi gibi temel kimlik bilgilerinizi
          topluyoruz. Ayrıca platform kullanımınız sırasında otomatik olarak IP adresi, tarayıcı
          bilgileri ve kullanım istatistikleri gibi teknik veriler de toplanmaktadır.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Verilerin Kullanımı</h2>
        <p>
          Toplanan veriler; hizmet sunumu, kullanıcı deneyiminin iyileştirilmesi, güvenlik
          önlemlerinin uygulanması ve yasal yükümlülüklerimizin yerine getirilmesi amacıyla
          kullanılmaktadır.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Veri Güvenliği</h2>
        <p>
          Kişisel verileriniz endüstri standartlarında şifreleme ve güvenlik protokolleri ile
          korunmaktadır. Verilerinize yalnızca yetkili personelimiz erişim sağlamaktadır.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Üçüncü Taraf Paylaşımı</h2>
        <p>
          Kişisel verileriniz, yasal zorunluluklar dışında, açık rızanız olmadan üçüncü taraflarla
          paylaşılmamaktadır.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">6. İletişim</h2>
        <p>
          Gizlilik politikamız hakkında sorularınız için legal@next59.com adresinden bize
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
