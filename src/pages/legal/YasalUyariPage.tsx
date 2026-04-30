import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LegalPageLayout from './LegalPageLayout';

export default function YasalUyariPage() {
  useEffect(() => { document.title = 'Yasal Uyarı | Next59'; }, []);
  return (
    <LegalPageLayout title="Yasal Uyarı / Sorumluluk Reddi">
      <p>
        Bu web sitesinde yer alan tüm içerikler yalnızca bilgilendirme ve eğlence amaçlıdır. Next59, bir bahis platformu değildir ve hiçbir şekilde bahis, kupon veya yatırım tavsiyesi vermez.
      </p>
      <p>
        Sunulan istatistiksel veriler ve veri okumaları, geçmiş maç kayıtlarına dayanmaktadır. Geçmiş veriler, gelecekteki sonuçların göstergesi değildir. Futbol maçlarının sonuçları kesin olarak tahmin edilemez.
      </p>
      <p>
        Next59, içeriklerin doğruluğu, eksiksizliği veya güncelliği konusunda herhangi bir garanti vermez. Sitede yer alan bilgilere dayanılarak yapılan eylemlerden doğacak zararlardan Next59 sorumlu tutulamaz.
      </p>
      <p>
        Bahis bağımlılığı ciddi bir sorundur. Türkiye'de yardım için <strong>182</strong> numaralı ALO Sosyal hattını arayabilirsiniz.
      </p>
      <p>
        Bu platform; herhangi bir bahis şirketi, kitapçı veya iddaa operatörüyle ticari ilişki içinde değildir.
      </p>
    </LegalPageLayout>
  );
}
