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
  if (!p) return 'Analiz verisi henüz yüklenmedi.';

  const confCaveat =
    p.confidence < 0.6
      ? ' Bu analiz sınırlı veri seti ile hazırlanmıştır.'
      : '';
  const eloRef =
    eloDiff && Math.abs(eloDiff) > 100
      ? ` Elo farkı (${Math.abs(Math.round(eloDiff))} puan) bu öngörü üzerinde belirleyici etkiye sahiptir.`
      : '';

  const favorite = p.home_prob > p.away_prob ? homeName : awayName;
  const underdog = p.home_prob > p.away_prob ? awayName : homeName;
  const maxProb = Math.max(p.home_prob, p.away_prob);
  const isClose = Math.abs(p.home_prob - p.away_prob) < 0.08;
  const isDraw = p.draw_prob > 0.35;

  switch (type) {
    case 'general': {
      if (isDraw) {
        return `Veri motorumuz bu karşılaşmayı son derece dengeli gösteriyor. Her iki takımın da birbirine yakın performans grafiği, beraberlik senaryosunu önde tutuyor.${eloRef}${confCaveat}`;
      }
      if (maxProb > 0.5) {
        return `Veri motorumuz, ${favorite} takımının saha avantajı ve güncel form grafiği ile oyunu domine etmesini öngörüyor. Karşılaşmanın hızlı tempoda başlaması bekleniyor.${eloRef} Bu analiz yüksek güvenilirlikli veri setine dayanmaktadır.${confCaveat}`;
      }
      if (isClose) {
        return `İki takımın verileri birbirine son derece yakın. ${homeName} hafif bir avantaj taşısa da, ${awayName} takımının sürpriz yapma potansiyeli yüksek.${eloRef}${confCaveat}`;
      }
      return `${favorite} bu karşılaşmayı veri setinde öne geçiriyor. Ancak ${underdog} takımının son performansı göz ardı edilmemeli.${eloRef}${confCaveat}`;
    }

    case 'goals': {
      if (p.over_2_5 > 0.7) {
        return `İki takımın hücum verileri ve son maçlardaki skor ortalamaları, karşılaşmada 3 gol barajının aşılmasına işaret ediyor. Yüksek tempolu bir mücadele bekleniyor.${confCaveat}`;
      }
      if (p.over_2_5 > 0.5) {
        return `Orta düzeyde gol beklentisi mevcut. Veri seti, karşılaşmanın 2 ila 3 gol arasında sonuçlanmasını işaret ediyor.${confCaveat}`;
      }
      return `Düşük skor beklentisi hâkim. Her iki takımın da defansif yapı önceliği, az golle sonuçlanma olasılığını artırıyor.${confCaveat}`;
    }

    case 'mutual': {
      if (p.btts > 0.6) {
        return `Her iki takımın da skor üretme kapasitesi dikkat çekici. Veri setinde karşılıklı gol ihtimali belirgin şekilde görülüyor. Defansif açıklar, iki tarafın da filelerini sarsabilir.${confCaveat}`;
      }
      if (p.btts > 0.45) {
        return `Karşılıklı gol senaryosu orta düzey olasılığa sahip. Bir takımın kalesini gole kapatması sürpriz olmazdı ancak her iki tarafın da skor üretme potansiyeli mevcut.${confCaveat}`;
      }
      return `Veri seti, takımlardan birinin kalesini gole kapatma olasılığını işaret ediyor. Defansif üstünlük bu karşılaşmada belirleyici olabilir.${confCaveat}`;
    }

    case 'first_half': {
      if (maxProb > 0.45) {
        return `İlk 45 dakikada tempolu bir başlangıç bekleniyor. ${favorite} takımının erken dakikalarda inisiyatifi ele alması öngörülüyor. Son maçlardaki ilk yarı performansları bu öngörü ile uyumlu.${confCaveat}`;
      }
      return `İlk yarıda temkinli bir başlangıç bekleniyor. Her iki takımın da riskten kaçması muhtemel. Ortaalan hâkimiyeti mücadelenin anahtar unsuru olacak.${confCaveat}`;
    }

    case 'second_half': {
      if (p.over_2_5 > 0.6) {
        return `İkinci yarıda oyunun kırılma anları yaşanabilir. Yedek kulübesinden yapılacak değişikliklerin maç üzerinde etkili olacağı öngörülüyor. Özellikle 60-75 dakika arası kritik bir zaman dilimi olarak öne çıkıyor.${confCaveat}`;
      }
      return `İkinci yarı, taktiksel değişikliklerin etkisini göstereceği bir dönem. Kondisyon farklarının belirginleşmesiyle birlikte maçın seyri değişebilir.${confCaveat}`;
    }

    case 'full_time': {
      const scorePred = predictScore(p);
      if (maxProb > 0.5) {
        return `Veri bülteni: ${favorite} takımının galibiyeti yüksek ihtimal. Skor tahmini: ${scorePred}. *Bu bir veri analizidir, kesin sonuç değildir. Futbolun doğası gereği sürprizler her zaman mümkündür.`;
      }
      if (isDraw) {
        return `Veri bülteni: Beraberlik en yüksek olasılıklı senaryo olarak öne çıkıyor. Skor tahmini: ${scorePred}. *Bu bir veri analizidir, kesin sonuç değildir. Futbolun doğası gereği sürprizler her zaman mümkündür.`;
      }
      return `Veri bülteni: ${favorite} hafif favorili görünüyor ancak skor tablosu her iki yöne de dönebilir. Skor tahmini: ${scorePred}. *Bu bir veri analizidir, kesin sonuç değildir. Futbolun doğası gereği sürprizler her zaman mümkündür.`;
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
