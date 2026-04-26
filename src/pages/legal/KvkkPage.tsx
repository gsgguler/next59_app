import LegalPageLayout from './LegalPageLayout';

export default function KvkkPage() {
  return (
    <LegalPageLayout title="KVKK Aydınlatma Metni" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          1. Veri Sorumlusunun Kimliği
        </h2>
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında, veri sorumlusu
          sıfatıyla Next59 olarak kişisel verilerinizi aşağıda açıklanan amaçlar çerçevesinde
          işlemekteyiz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          2. İşlenen Kişisel Veriler
        </h2>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>Kimlik bilgileri (ad, soyad)</li>
          <li>İletişim bilgileri (e-posta adresi)</li>
          <li>Hesap bilgileri (kullanıcı adı, şifre hash)</li>
          <li>İşlem güvenliği bilgileri (IP adresi, oturum verileri)</li>
          <li>Kullanım verileri (sayfa görüntülenmeleri, işlem kayıtları)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          3. Kişisel Verilerin İşlenmesi Amacı
        </h2>
        <p>
          Kişisel verileriniz; üyelik işlemlerinin yürütülmesi, hizmet kalitesinin artırılması,
          yasal yükümlülüklerimizin yerine getirilmesi, bilgi güvenliği süreçleri ile talep ve
          şikayetlerin yönetilmesi amacıyla işlenmektedir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          4. Verilerin Aktarımı
        </h2>
        <p>
          Kişisel verileriniz; yasal zorunluluklar çerçevesinde kamu kurum ve kuruluşlarına, hizmet
          sağlayıcılarımıza (hosting, e-posta, ödeme altyapısı) ve iş ortaklarımıza KVKK'nin 8. ve
          9. maddelerinde belirlenen şartlara uygun olarak aktarılabilmektedir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          5. Veri Saklama Süresi
        </h2>
        <p>
          Kişisel verileriniz, işleme amacının gerektirdiği süre boyunca ve yasal mevzuatın
          öngördüğü zorunlu saklama süreleri kadar muhafaza edilmektedir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          6. İlgili Kişi Hakları
        </h2>
        <p className="mb-3">
          KVKK'nin 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
          <li>İşlenmişse buna ilişkin bilgi talep etme</li>
          <li>İşleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme</li>
          <li>Yurt içi veya yurt dışında aktarıldığınız üçüncü kişileri bilme</li>
          <li>Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme</li>
          <li>KVKK'nin 7. maddesi kapsamında silinmesini veya yok edilmesini isteme</li>
          <li>İşlenen verilerin münhasıran otomatik sistemler aracılığıyla analiz edilmesi suretiyle aleyhine bir sonucun ortaya çıkmasına itiraz etme</li>
          <li>Kanuna aykırı işleme nedeniyle zarara uğraması halinde zararın giderilmesini talep etme</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Başvuru</h2>
        <p>
          Yukarıda belirtilen haklarınızı kullanmak için kvkk@next59.com adresine yazılı
          başvuruda bulunabilirsiniz.
        </p>
      </section>

      <div className="mt-8 p-4 bg-navy-50 rounded-xl border border-navy-100">
        <p className="text-xs text-navy-600 italic">
          Bu aydınlatma metni, yasal ekibimiz tarafından tam içerik hazırlanana kadar taslak olarak
          yayınlanmaktadır. Lütfen yasal bağlamlarda referans almadan önce güncel versiyonu kontrol
          ediniz.
        </p>
      </div>
    </LegalPageLayout>
  );
}
