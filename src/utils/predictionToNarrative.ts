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
  if (!p) return 'Analiz verisi henuz yuklenmedi.';

  const confCaveat =
    p.confidence < 0.6
      ? ' Bu analiz sinirli veri seti ile hazirlanmistir.'
      : '';
  const eloRef =
    eloDiff && Math.abs(eloDiff) > 100
      ? ` Elo farkı (${Math.abs(Math.round(eloDiff))} puan) bu ongoru uzerinde belirleyici etkiye sahiptir.`
      : '';

  const favorite = p.home_prob > p.away_prob ? homeName : awayName;
  const underdog = p.home_prob > p.away_prob ? awayName : homeName;
  const maxProb = Math.max(p.home_prob, p.away_prob);
  const isClose = Math.abs(p.home_prob - p.away_prob) < 0.08;
  const isDraw = p.draw_prob > 0.35;

  switch (type) {
    case 'general': {
      if (isDraw) {
        return `Veri motorumuz bu karsilasmayi son derece dengeli gosteriyor. Her iki takimin da birbirine yakin performans grafigi, beraberlik senaryosunu onde tutuyor.${eloRef}${confCaveat}`;
      }
      if (maxProb > 0.5) {
        return `Veri motorumuz, ${favorite} takiminin saha avantaji ve guncel form grafigi ile oyunu domine etmesini ongoruyor. Karsilasmanin hizli tempoda baslamasi bekleniyor.${eloRef} Bu analiz yuksek guvenilirlikli veri setine dayanmaktadir.${confCaveat}`;
      }
      if (isClose) {
        return `Iki takimin verileri birbirine son derece yakin. ${homeName} hafif bir avantaj tasisa da, ${awayName} takiminin surpriz yapma potansiyeli yuksek.${eloRef}${confCaveat}`;
      }
      return `${favorite} bu karsilasmayi veri setinde one geciriyor. Ancak ${underdog} takiminin son performansi goz ardi edilmemeli.${eloRef}${confCaveat}`;
    }

    case 'goals': {
      if (p.over_2_5 > 0.7) {
        return `Iki takimin hucum verileri ve son maclardaki skor ortalamalari, karsilasmada 3 gol barajinin asilmasina isaret ediyor. Yuksek tempolu bir mucadele bekleniyor.${confCaveat}`;
      }
      if (p.over_2_5 > 0.5) {
        return `Orta duzeyde gol beklentisi mevcut. Veri seti, karsilasmanin 2 ila 3 gol arasinda sonuclanmasini isaret ediyor.${confCaveat}`;
      }
      return `Dusuk skor beklentisi hakim. Her iki takimin da defansif yapi onceligi, az golle sonuclanma olasiligini artiriyor.${confCaveat}`;
    }

    case 'mutual': {
      if (p.btts > 0.6) {
        return `Her iki takimin da skor uretme kapasitesi dikkat cekici. Veri setinde karsilikli gol ihtimali belirgin sekilde goruluyor. Defansif aciklar, iki tarafin da filelerini sarsabilir.${confCaveat}`;
      }
      if (p.btts > 0.45) {
        return `Karsilikli gol senaryosu orta duzey olasiliga sahip. Bir takimin kalesini gole kapatmasi surpiz olmazdi ancak her iki tarafin da skor uretme potansiyeli mevcut.${confCaveat}`;
      }
      return `Veri seti, takimlardan birinin kalesini gole kapatma olasiligini isaret ediyor. Defansif ustunluk bu karsilasmada belirleyici olabilir.${confCaveat}`;
    }

    case 'first_half': {
      if (maxProb > 0.45) {
        return `Ilk 45 dakikada tempolu bir baslangic bekleniyor. ${favorite} takiminin erken dakikalarda inisiyatifi ele almasi ongoruluyor. Son maclardaki ilk yari performanslari bu ongoru ile uyumlu.${confCaveat}`;
      }
      return `Ilk yarida temkinli bir baslangic bekleniyor. Her iki takimin da riskten kacmasi muhtemel. Ortaalan hakimiyeti mucadelenin anahtar unsuru olacak.${confCaveat}`;
    }

    case 'second_half': {
      if (p.over_2_5 > 0.6) {
        return `Ikinci yarida oyunun kirilma anlari yasanabilir. Yedek kulubesinden yapilacak degisikliklerin mac uzerinde etkili olacagi ongoruluyor. Ozellikle 60-75 dakika arasi kritik bir zaman dilimi olarak one cikiyor.${confCaveat}`;
      }
      return `Ikinci yari, taktiksel degisikliklerin etkisini gosterecegi bir donem. Kondisyon farklarinin belirginlesmesiyle birlikte macin seyri degisebilir.${confCaveat}`;
    }

    case 'full_time': {
      const scorePred = predictScore(p);
      if (maxProb > 0.5) {
        return `Veri bulteni: ${favorite} takiminin galibiyeti yuksek ihtimal. Skor tahmini: ${scorePred}. *Bu bir veri analizidir, kesin sonuc degildir. Futbolun dogasi geregi surprizler her zaman mumkundur.`;
      }
      if (isDraw) {
        return `Veri bulteni: Beraberlik en yuksek olasilikli senaryo olarak one cikiyor. Skor tahmini: ${scorePred}. *Bu bir veri analizidir, kesin sonuc degildir. Futbolun dogasi geregi surprizler her zaman mumkundur.`;
      }
      return `Veri bulteni: ${favorite} hafif favorili gorunuyor ancak skor tablosu her iki yone de donebilir. Skor tahmini: ${scorePred}. *Bu bir veri analizidir, kesin sonuc degildir. Futbolun dogasi geregi surprizler her zaman mumkundur.`;
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
