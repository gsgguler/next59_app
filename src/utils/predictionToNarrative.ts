export interface FullPrediction {
  home_prob: number;
  draw_prob: number;
  away_prob: number;
  ht_home_prob: number;
  ht_draw_prob: number;
  ht_away_prob: number;
  over_2_5: number;
  btts: number;
  confidence: number;
  xg_home: number | null;
  xg_away: number | null;
  predicted_score: string | null;
  predicted_score_ht: string | null;
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
  const underdog  = p.home_prob > p.away_prob ? awayName : homeName;
  const maxProb   = Math.max(p.home_prob, p.away_prob);
  const isClose   = Math.abs(p.home_prob - p.away_prob) < 0.08;
  const isDraw    = p.draw_prob > 0.35;

  switch (type) {
    case 'general': {
      if (isDraw) {
        return `Veri motoru bu karşılaşmayı dengeli gösteriyor. Her iki takımın performans eğrisi birbirine yakın seyrediyor ve beraberlik senaryosu öne çıkıyor.${eloRef}${confCaveat}`;
      }
      if (maxProb > 0.55) {
        return `${favorite} takımı veri setinde belirgin bir avantaj taşıyor. Form grafiği ve istatistiksel birikim, bu takımı favoriye taşıyan temel etkenler.${eloRef}${confCaveat}`;
      }
      if (isClose) {
        return `İki takımın verileri birbirine çok yakın. ${homeName} hafif avantajlı görünse de ${awayName} sürpriz potansiyeli taşıyor.${eloRef}${confCaveat}`;
      }
      return `${favorite} bu karşılaşmada veri açısından öne geçiyor. Ancak ${underdog} takımının son dönem performansı göz ardı edilmemeli.${eloRef}${confCaveat}`;
    }

    case 'goals': {
      const xgStr =
        p.xg_home != null && p.xg_away != null
          ? ` Beklenen gol: ${homeName} ${p.xg_home.toFixed(2)} xG — ${awayName} ${p.xg_away.toFixed(2)} xG.`
          : '';
      if (p.over_2_5 > 0.65) {
        return `Her iki takımın hücum istatistikleri yüksek skorlu bir mücadeleye işaret ediyor. 2.5 üzeri gol olasılığı %${Math.round(p.over_2_5 * 100)}.${xgStr}${confCaveat}`;
      }
      if (p.over_2_5 > 0.50) {
        return `Orta düzeyde gol beklentisi mevcut. 2.5 üzeri gol olasılığı %${Math.round(p.over_2_5 * 100)}; 2-3 gol aralığı en olası senaryo.${xgStr}${confCaveat}`;
      }
      return `Defansif ağırlıklı bir tablonun ipuçları var. 2.5 üzeri gol olasılığı yalnızca %${Math.round(p.over_2_5 * 100)}; az golle noktalanan bir maç olasılığı yüksek.${xgStr}${confCaveat}`;
    }

    case 'mutual': {
      if (p.btts > 0.60) {
        return `Her iki tarafın da skor üretme kapasitesi öne çıkıyor. Karşılıklı gol olasılığı %${Math.round(p.btts * 100)}; savunma hatalarının sonucu şekillendirebileceği bir karşılaşma bekleniyor.${confCaveat}`;
      }
      if (p.btts > 0.45) {
        return `Karşılıklı gol olasılığı %${Math.round(p.btts * 100)} ile orta düzeyde. Takımlardan biri kalesini kapayabilir; ancak her iki tarafın da gol üretme kapasitesi tabloya yansıyor.${confCaveat}`;
      }
      return `Karşılıklı gol olasılığı %${Math.round(p.btts * 100)} ile düşük. Veri, takımlardan birinin kalesini gole kapatma olasılığına işaret ediyor.${confCaveat}`;
    }

    case 'first_half': {
      const htFav    = p.ht_home_prob > p.ht_away_prob ? homeName : awayName;
      const htMaxPct = Math.round(Math.max(p.ht_home_prob, p.ht_away_prob) * 100);
      const htDrawPct = Math.round(p.ht_draw_prob * 100);
      const htScore  = p.predicted_score_ht ?? '0-0';

      if (p.ht_draw_prob > 0.42) {
        return `İlk yarı skorsuz ya da berabere kapanma olasılığı yüksek (${htDrawPct}%). İlk 45 dakikada takımlar birbirini ölçerek oynayacak; ${htScore} skoru en olası devre arası tablo. Pozisyonlar oluşurken orta saha hakimiyeti belirleyici.${confCaveat}`;
      }
      if (htMaxPct > 42) {
        return `${htFav} ilk yarıda öne geçme eğilimi taşıyor (%${htMaxPct}). Devre arası beklenen skor: ${htScore}. Erken baskı ve hızlı geçişler bu takımın silahı olabilir.${confCaveat}`;
      }
      return `İlk yarıda dengeli bir görünüm bekleniyor. Devre arası beraberlik olasılığı %${htDrawPct}; beklenen skor: ${htScore}. İlk golü bulan taraf psikolojik üstünlük kazanacak.${confCaveat}`;
    }

    case 'second_half': {
      const htScore = p.predicted_score_ht ?? '?';
      const ftScore = p.predicted_score ?? '?';

      if (p.over_2_5 > 0.60) {
        return `İkinci yarıda oyunun kırılma anları yaşanabilir; devre arasından (${htScore}) maç sonuna (${ftScore}) uzanan süreçte goller artacak. 60-75 dakika arası özellikle kritik — kondisyon farkları ve teknik direktör değişiklikleri dengeleri bozabilir.${confCaveat}`;
      }
      if (p.btts > 0.55) {
        return `Devre arası tablosundan (${htScore}) bağımsız olarak ikinci yarıda her iki takımın da gol bulması ihtimali canlı (%${Math.round(p.btts * 100)} karşılıklı gol). İkinci yarı oyunun seyrini değiştirecek sürtüşme noktaları içeriyor.${confCaveat}`;
      }
      return `Maç sonuna (${ftScore}) giden ikinci yarıda taktiksel esneklik ve kondisyon farkları ön plana geçecek. Devre arasından itibaren yapılacak değişiklikler sonucu doğrudan etkileyebilir.${confCaveat}`;
    }

    case 'full_time': {
      const scorePred = p.predicted_score ?? predictScoreFallback(p);
      const homePct   = Math.round(p.home_prob * 100);
      const drawPct   = Math.round(p.draw_prob * 100);
      const awayPct   = Math.round(p.away_prob * 100);

      if (maxProb > 0.50) {
        return `Veri özeti: ${favorite} bu karşılaşmada daha güçlü istatistiksel tablo sunuyor (%${Math.round(maxProb * 100)} kazanma olasılığı). Olası skor: ${scorePred}. Dağılım: ${homeName} %${homePct} — Beraberlik %${drawPct} — ${awayName} %${awayPct}. Bu bir veri senaryosudur; kesin sonuç değildir.`;
      }
      if (isDraw) {
        return `Veri özeti: Beraberlik bu karşılaşmanın en olası senaryosu (%${drawPct}). Olası skor: ${scorePred}. Dağılım: ${homeName} %${homePct} — Beraberlik %${drawPct} — ${awayName} %${awayPct}. Bu bir veri senaryosudur; kesin sonuç değildir.`;
      }
      return `Veri özeti: ${favorite} hafif istatistiksel avantaj taşıyor; ancak sonuç her iki yönde şekillenebilir. Olası skor: ${scorePred}. Dağılım: ${homeName} %${homePct} — Beraberlik %${drawPct} — ${awayName} %${awayPct}. Bu bir veri senaryosudur; kesin sonuç değildir.`;
    }
  }
}

function predictScoreFallback(p: FullPrediction): string {
  if (p.home_prob > p.away_prob + 0.15) {
    return p.over_2_5 > 0.6 ? '2-1' : '1-0';
  }
  if (p.away_prob > p.home_prob + 0.15) {
    return p.over_2_5 > 0.6 ? '1-2' : '0-1';
  }
  return p.over_2_5 > 0.6 ? '1-1' : '1-1';
}
