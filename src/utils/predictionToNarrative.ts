export interface FullPrediction {
  home_prob: number;
  draw_prob: number;
  away_prob: number;
  over_2_5: number;
  btts: number;
  confidence: number;
}

type NarrativeType = 'general' | 'goals' | 'mutual' | 'first_half' | 'second_half' | 'full_time';

export function predictionToNarrative(
  p: FullPrediction | null,
  type: NarrativeType,
  homeName: string,
  awayName: string,
  eloDiff?: number,
): string {
  if (!p) return 'Analiz verisi henüz hazırlanmadı.';

  const confCaveat =
    p.confidence < 0.6
      ? ' Bu analiz sınırlı veri seti ile oluşturulmuştur.'
      : '';
  const eloRef =
    eloDiff && Math.abs(eloDiff) > 100
      ? ` Elo farkı (${Math.abs(Math.round(eloDiff))} puan) bu öngörüyü etkileyen temel etkenlerden biri.`
      : '';

  const favorite = p.home_prob > p.away_prob ? homeName : awayName;
  const underdog = p.home_prob > p.away_prob ? awayName : homeName;
  const maxProb = Math.max(p.home_prob, p.away_prob);
  const isClose = Math.abs(p.home_prob - p.away_prob) < 0.08;
  const isDraw = p.draw_prob > 0.35;

  switch (type) {
    case 'general': {
      if (isDraw) {
        return `Veri motoru bu karşılaşmayı dengeli gösteriyor. Her iki takımın performans eğrisi birbirine yakın seyrediyor ve beraberlik senaryosu öne çıkıyor.${eloRef}${confCaveat}`;
      }
      if (maxProb > 0.5) {
        return `${favorite} takımı veri setinde belirgin bir avantaj taşıyor. Form grafiği ve istatistiksel birikim, bu takımı favoriye taşıyan temel etkenler.${eloRef}${confCaveat}`;
      }
      if (isClose) {
        return `İki takımın verileri birbirine çok yakın. ${homeName} hafif avantajlı görünse de ${awayName} sürpriz potansiyeli taşıyor.${eloRef}${confCaveat}`;
      }
      return `${favorite} bu karşılaşmada veri açısından öne geçiyor. Ancak ${underdog} takımının son dönem performansı göz ardı edilmemeli.${eloRef}${confCaveat}`;
    }

    case 'goals': {
      if (p.over_2_5 > 0.7) {
        return `Her iki takımın hücum istatistikleri ve son maçlardaki ortalama gol sayısı, bu karşılaşmada yüksek skorlu bir mücadeleye işaret ediyor.${confCaveat}`;
      }
      if (p.over_2_5 > 0.5) {
        return `Orta düzeyde gol beklentisi mevcut. Veri seti 2-3 gol aralığını işaret ediyor; belirleyici anlara sahip, temposunu koruyan bir maç tablosu.${confCaveat}`;
      }
      return `Defansif ağırlıklı bir tablonun ipuçları var. Her iki tarafın da dikkatli yapısı, az golle noktalanan bir maç olasılığını artırıyor.${confCaveat}`;
    }

    case 'mutual': {
      if (p.btts > 0.6) {
        return `Her iki tarafın da skor üretme kapasitesi öne çıkıyor. Karşılıklı gol olasılığı veri setinde belirgin; savunma hatalarının sonucu şekillendirebileceği bir karşılaşma bekleniyor.${confCaveat}`;
      }
      if (p.btts > 0.45) {
        return `Karşılıklı gol olasılığı orta düzeyde. Takımlardan biri kalesini kapayabilir; ancak her iki tarafın da gol üretme kapasitesi tabloya yansıyor.${confCaveat}`;
      }
      return `Veri, takımlardan birinin kalesini gole kapatma olasılığına işaret ediyor. Defansif üstünlük bu karşılaşmanın anahtar değişkeni olabilir.${confCaveat}`;
    }

    case 'first_half': {
      if (maxProb > 0.45) {
        return `İlk 45 dakikada tempolu bir başlangıç öngörülüyor. ${favorite} takımının erken dakikalarda topu kontrol altına almaya çalışması bekleniyor.${confCaveat}`;
      }
      return `İlk yarıda her iki takımın da temkinli bir yaklaşım benimsemesi muhtemel. Orta saha hâkimiyeti belirleyici olabilir.${confCaveat}`;
    }

    case 'second_half': {
      if (p.over_2_5 > 0.6) {
        return `İkinci yarıda oyunun kırılma anları yaşanabilir. Teknik direktörlerin yapacağı değişiklikler sonucu doğrudan etkileyebilir; 60-75 dakika arası özellikle kritik.${confCaveat}`;
      }
      return `İkinci yarı, taktiksel esnekliğin ve kondisyon farklarının ön plana geçeceği bir dönem. Maçın seyri değişebilir.${confCaveat}`;
    }

    case 'full_time': {
      const scorePred = predictScore(p);
      if (maxProb > 0.5) {
        return `Veri özeti: ${favorite} bu karşılaşmada daha güçlü bir istatistiksel tablo sunuyor. Öngörülen skor aralığı: ${scorePred}. Bu bir veri senaryosudur; kesin sonuç değildir. Futbolda sürprizler her zaman mümkündür.`;
      }
      if (isDraw) {
        return `Veri özeti: Beraberlik bu karşılaşmanın en olası senaryosu olarak öne çıkıyor. Öngörülen skor aralığı: ${scorePred}. Bu bir veri senaryosudur; kesin sonuç değildir.`;
      }
      return `Veri özeti: ${favorite} hafif istatistiksel avantaj taşıyor; ancak sonuç her iki yönde şekillenebilir. Öngörülen skor aralığı: ${scorePred}. Bu bir veri senaryosudur; kesin sonuç değildir.`;
    }
  }
}

function predictScore(p: FullPrediction): string {
  if (p.home_prob > p.away_prob + 0.15) {
    return p.over_2_5 > 0.6 ? '2-1' : '1-0';
  }
  if (p.away_prob > p.home_prob + 0.15) {
    return p.over_2_5 > 0.6 ? '1-2' : '0-1';
  }
  return p.over_2_5 > 0.6 ? '2-2' : '1-1';
}
