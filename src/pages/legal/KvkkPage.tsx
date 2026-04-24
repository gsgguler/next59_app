import LegalPageLayout from './LegalPageLayout';

export default function KvkkPage() {
  return (
    <LegalPageLayout title="KVKK Aydinlatma Metni" lastUpdated="24 Nisan 2026">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          1. Veri Sorumlusunun Kimligi
        </h2>
        <p>
          6698 sayili Kisisel Verilerin Korunmasi Kanunu ("KVKK") kapsaminda, veri sorumlusu
          sifatiyla Next59 olarak kisisel verilerinizi asagida aciklanan amaclar cercevesinde
          islemekteyiz.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          2. Islenen Kisisel Veriler
        </h2>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>Kimlik bilgileri (ad, soyad)</li>
          <li>Iletisim bilgileri (e-posta adresi)</li>
          <li>Hesap bilgileri (kullanici adi, sifre hash)</li>
          <li>Islem guvenligi bilgileri (IP adresi, oturum verileri)</li>
          <li>Kullanim verileri (sayfa goruntulenmeleri, islem kayitlari)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          3. Kisisel Verilerin Islenmesi Amaci
        </h2>
        <p>
          Kisisel verileriniz; uyelik islemlerinin yurutulmesi, hizmet kalitesinin artirilmasi,
          yasal yukumluluklerimizin yerine getirilmesi, bilgi guvenligi surecleri ile talep ve
          sikayetlerin yonetilmesi amaciyla islenmektedir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          4. Verilerin Aktarimi
        </h2>
        <p>
          Kisisel verileriniz; yasal zorunluluklar cercevesinde kamu kurum ve kuruluslarina, hizmet
          saglayicilarimiza (hosting, e-posta, odeme altyapisi) ve is ortaklarimiza KVKK'nin 8. ve
          9. maddelerinde belirlenen sartlara uygun olarak aktarilabilmektedir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          5. Veri Saklama Suresi
        </h2>
        <p>
          Kisisel verileriniz, isleme amacinin gerektirdigi sure boyunca ve yasal mevzuatin
          ongordugi zorunlu saklama sureleri kadar muhafaza edilmektedir.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          6. Ilgili Kisi Haklari
        </h2>
        <p className="mb-3">
          KVKK'nin 11. maddesi uyarinca asagidaki haklara sahipsiniz:
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>Kisisel verilerinizin islenip islenmedigini ogrenme</li>
          <li>Islenmisse buna iliskin bilgi talep etme</li>
          <li>Isleme amacini ve amacina uygun kullanilip kullanilmadigini ogrenme</li>
          <li>Yurt ici veya yurt disinda aktarildiginiz ucuncu kisileri bilme</li>
          <li>Eksik veya yanlis islenmis verilerin duzeltilmesini isteme</li>
          <li>KVKK'nin 7. maddesi kapsaminda silinmesini veya yok edilmesini isteme</li>
          <li>Islenen verilerin munhasiran otomatik sistemler araciligiyla analiz edilmesi suretiyle aleyhine bir sonucun ortaya cikmasina itiraz etme</li>
          <li>Kanuna aykiri isleme nedeniyle zarara ugramasi halinde zararin giderilmesini talep etme</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Basvuru</h2>
        <p>
          Yukarida belirtilen haklarinizi kullanmak icin kvkk@next59.com adresine yazili
          basvuruda bulunabilirsiniz.
        </p>
      </section>

      <div className="mt-8 p-4 bg-navy-50 rounded-xl border border-navy-100">
        <p className="text-xs text-navy-600 italic">
          Bu aydinlatma metni, yasal ekibimiz tarafindan tam icerik hazirlanana kadar taslak olarak
          yayinlanmaktadir. Lutfen yasal baglamlarda referans almadan once guncel versiyonu kontrol
          ediniz.
        </p>
      </div>
    </LegalPageLayout>
  );
}
