import type { DebateRound } from '../components/debate/DebateTimeline';

export const mockDebateRounds: DebateRound[] = [
  {
    id: 'mock-round-1',
    round_number: 1,
    debate_status: 'completed',
    consensus_reached: null,
    consensus_summary: null,
    started_at: '2026-04-20T14:00:00Z',
    completed_at: '2026-04-20T14:02:30Z',
    persona_outputs: [
      {
        id: 'mock-po-1a',
        persona: 'veri_analisti',
        analysis_text:
          'Son 10 macin istatistiksel analizi tamamlandi. Galatasaray\'in ev sahibi performansi dikkat cekici: son 5 mac ortalamasinda 2.4 gol atiyor, 0.8 gol yiyor. xG degerleri 2.1 ortalama ile beklentilerin uzerinde. Fenerbahce deplasman performansi ise 1.2 gol ortalamasi ile daha dusuk. Ancak direkt karsilasma verilerinde son 4 macta 2 beraberlik goruyoruz ki bu durum risk faktorunu arttiriyor. Top sahiplik orani Galatasaray lehine %58 ortalamadir. Korner istatistikleri ve set parcasi basarisi da ev sahibi lehine ciddi fark gostermektedir.',
        vote: 'onay',
        confidence: 0.72,
        tokens_input: 1840,
        tokens_output: 620,
        estimated_cost_usd: 0.038,
      },
      {
        id: 'mock-po-1b',
        persona: 'stratejist',
        analysis_text:
          'Taktiksel acidan bakildiginda Galatasaray\'in 4-3-3 formasyonu Fenerbahce\'nin 4-2-3-1 dizilisine karsi avantaj saglayabilir. Orta saha uestunlugu kritik olacak. Galatasaray\'in pres yuksekligi Fenerbahce\'nin yapi lanma cikisindan faydalanabilir. Ancak Fenerbahce\'nin kontra atak hizi ve kanatlardaki bireysel kalitesi dengeleyici faktor. Kirmizi kart riski orta seviyede, derbi atmosferi hakem kararlarini etkileyebilir.',
        vote: 'onay',
        confidence: 0.65,
        tokens_input: 1560,
        tokens_output: 480,
        estimated_cost_usd: 0.031,
      },
      {
        id: 'mock-po-1c',
        persona: 'matematikci',
        analysis_text:
          'Poisson dagilimi modeline gore ev sahibi galibiyet olasiligi %42.3, beraberlik %26.1, deplasman galibiyeti %31.6. Monte Carlo simulasyonu (10,000 iterasyon) sonuclari bu degerleri destekliyor: EV %43.1, B %25.8, D %31.1. Marjinal fark az olmakla birlikte ev sahibi lehine istatistiksel anlamlilik mevcut (p=0.047). Ust 2.5 gol olasiligi %58.2 olarak hesaplandi.',
        vote: 'cekimser',
        confidence: 0.58,
        tokens_input: 2100,
        tokens_output: 540,
        estimated_cost_usd: 0.042,
      },
    ],
  },
  {
    id: 'mock-round-2',
    round_number: 2,
    debate_status: 'completed',
    consensus_reached: null,
    consensus_summary: null,
    started_at: '2026-04-20T14:03:00Z',
    completed_at: '2026-04-20T14:05:15Z',
    persona_outputs: [
      {
        id: 'mock-po-2a',
        persona: 'veri_analisti',
        analysis_text:
          'Matematikci\'nin Poisson modelindeki p=0.047 degeri sinir noktasinda. Ek degiskenler eklendiginde (sakatliklari, form egrileri) model guvenilirligi artabilir. Ev sahibi avantaji faktoru 1.35 ile global ortalama olan 1.2\'nin uzerinde. Takim form endeksini guncelledim: GS 78/100, FB 71/100.',
        vote: 'onay',
        confidence: 0.70,
        tokens_input: 1420,
        tokens_output: 380,
        estimated_cost_usd: 0.028,
      },
      {
        id: 'mock-po-2b',
        persona: 'stratejist',
        analysis_text:
          'Ikinci tur degerlendirmemde sakat oyuncu faktorunu daha agirlikli ele aldim. Galatasaray\'in sol bek bolgesindeki eksiklik Fenerbahce\'nin sag kanat ataklarini guclendirse de genel resmi degistirmiyor. Mac icerisi senaryolarda erken gol Galatasaray\'a onemli avantaj saglayacaktir. Taktiksel esneklik acisinda her iki takim da alternatif planlara sahip.',
        vote: 'onay',
        confidence: 0.68,
        tokens_input: 1380,
        tokens_output: 420,
        estimated_cost_usd: 0.029,
      },
      {
        id: 'mock-po-2c',
        persona: 'matematikci',
        analysis_text:
          'Veri analisti\'nin form endeks verileri modele dahil edildiginde Poisson parametreleri guncellendi: lambda_ev = 1.87, lambda_dep = 1.12. Bu guncelleme ev sahibi galibiyet olasaligini %44.8\'e yukseltirken p-degerini 0.032\'ye dusurdu. Istatistiksel anlamlilik artik daha guclu. Olasilik tahminimi 0.65 olarak guncelliyorum.',
        vote: 'onay',
        confidence: 0.65,
        tokens_input: 1680,
        tokens_output: 460,
        estimated_cost_usd: 0.034,
      },
    ],
  },
  {
    id: 'mock-round-3',
    round_number: 3,
    debate_status: 'completed',
    consensus_reached: true,
    consensus_summary:
      'Panel 3 turda degerlendirmelerini tamamlamistir. Veri analizi, strateji degerlendirmesi ve matematiksel modelleme birlikte ele alindiginda Galatasaray\'in ev sahibi avantaji, istatistiksel uestunlugu ve taktiksel pozisyonu goz onunde bulundurularak %65 olasilikla Galatasaray galibiyeti ongorulmektedir. Panel 3\'e 1 oyla onay vermistir. Riski artiran faktorler: derbi atmosferi, hakem faktoru ve Fenerbahce\'nin kontra atak kalitesi.',
    started_at: '2026-04-20T14:06:00Z',
    completed_at: '2026-04-20T14:08:45Z',
    persona_outputs: [
      {
        id: 'mock-po-3a',
        persona: 'veri_analisti',
        analysis_text:
          'Final degerlendirmem: Tum veriler incelendiginde Galatasaray galibiyeti icin yeterli istatistiksel destek bulunmaktadir. Tavsiyem onay yonundedir.',
        vote: 'onay',
        confidence: 0.72,
        tokens_input: 980,
        tokens_output: 240,
        estimated_cost_usd: 0.019,
      },
      {
        id: 'mock-po-3b',
        persona: 'stratejist',
        analysis_text:
          'Taktiksel degerlendirmemi onayliyorum. Ev sahibi avantaji ve taktiksel uestunluk tahminimizi destekliyor. Onay.',
        vote: 'onay',
        confidence: 0.70,
        tokens_input: 860,
        tokens_output: 200,
        estimated_cost_usd: 0.016,
      },
      {
        id: 'mock-po-3c',
        persona: 'matematikci',
        analysis_text:
          'Guncellenmis modeller isiginda olasilik yeterli seviyede. Onay veriyorum.',
        vote: 'onay',
        confidence: 0.67,
        tokens_input: 780,
        tokens_output: 180,
        estimated_cost_usd: 0.015,
      },
      {
        id: 'mock-po-3d',
        persona: 'bas_hakem',
        analysis_text:
          'Tum panel uyeleri degerlendirmelerini tamamlamistir. Uc turda toplam 9 analiz yapilmis, 8 onay ve 1 cekimser oy kullanilmistir. Istatistiksel, taktiksel ve matematiksel degerlendirmelerin tutarliligi goz onunde bulundurularak tahmini onayliyorum. Risk faktoru orta seviyede degerlendirilmistir. Panel karari: ONAY.',
        vote: 'onay',
        confidence: 0.75,
        tokens_input: 1240,
        tokens_output: 380,
        estimated_cost_usd: 0.025,
      },
    ],
  },
];

export const mockSealRetrievalKey = 'SEAL-GS-FB-2026-04-25-001';
