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
          'Son 10 maçın istatistiksel analizi tamamlandı. Galatasaray\'ın ev sahibi performansı dikkat çekici: son 5 maç ortalamasında 2.4 gol atıyor, 0.8 gol yiyor. xG değerleri 2.1 ortalama ile beklentilerin üzerinde. Fenerbahçe deplasman performansı ise 1.2 gol ortalaması ile daha düşük. Ancak direkt karşılaşma verilerinde son 4 maçta 2 beraberlik görüyoruz ki bu durum risk faktörünü arttırıyor. Top sahiplik oranı Galatasaray lehine %58 ortalamadir. Korner istatistikleri ve set parçası başarısı da ev sahibi lehine ciddi fark göstermektedir.',
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
          'Taktiksel açıdan bakıldığında Galatasaray\'ın 4-3-3 formasyonu Fenerbahçe\'nin 4-2-3-1 dizilişine karşı avantaj sağlayabilir. Orta saha üstünlüğü kritik olacak. Galatasaray\'ın pres yüksekliği Fenerbahçe\'nin yapılanma çıkışından faydalanabilir. Ancak Fenerbahçe\'nin kontra atak hızı ve kanatlardaki bireysel kalitesi dengeleyici faktör. Kırmızı kart riski orta seviyede, derbi atmosferi hakem kararlarını etkileyebilir.',
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
          'Poisson dağılımı modeline göre ev sahibi galibiyet olasılığı %42.3, beraberlik %26.1, deplasman galibiyeti %31.6. Monte Carlo simülasyonu (10,000 iterasyon) sonuçları bu değerleri destekliyor: EV %43.1, B %25.8, D %31.1. Marjinal fark az olmakla birlikte ev sahibi lehine istatistiksel anlamlılık mevcut (p=0.047). Üst 2.5 gol olasılığı %58.2 olarak hesaplandı.',
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
          'Matematikçi\'nin Poisson modelindeki p=0.047 değeri sınır noktasında. Ek değişkenler eklendiğinde (sakatlıkları, form eğrileri) model güvenilirliği artabilir. Ev sahibi avantajı faktörü 1.35 ile global ortalama olan 1.2\'nin üzerinde. Takım form endeksini güncelledim: GS 78/100, FB 71/100.',
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
          'İkinci tur değerlendirmemde sakat oyuncu faktörünü daha ağırlıklı ele aldım. Galatasaray\'ın sol bek bölgesindeki eksiklik Fenerbahçe\'nin sağ kanat ataklarını güçlendirse de genel resmi değiştirmiyor. Maç içerisi senaryolarda erken gol Galatasaray\'a önemli avantaj sağlayacaktır. Taktiksel esneklik açısından her iki takım da alternatif planlara sahip.',
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
          'Veri analisti\'nin form endeks verileri modele dahil edildiğinde Poisson parametreleri güncellendi: lambda_ev = 1.87, lambda_dep = 1.12. Bu güncelleme ev sahibi galibiyet olasılığını %44.8\'e yükseltirken p-değerini 0.032\'ye düşürdü. İstatistiksel anlamlılık artık daha güçlü. Olasılık tahminimi 0.65 olarak güncelliyorum.',
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
      'Panel 3 turda değerlendirmelerini tamamlamıştır. Veri analizi, strateji değerlendirmesi ve matematiksel modelleme birlikte ele alındığında Galatasaray\'ın ev sahibi avantajı, istatistiksel üstünlüğü ve taktiksel pozisyonu göz önünde bulundurularak %65 olasılıkla Galatasaray galibiyeti öngörülmektedir. Panel 3\'e 1 oyla onay vermiştir. Riski artıran faktörler: derbi atmosferi, hakem faktörü ve Fenerbahçe\'nin kontra atak kalitesi.',
    started_at: '2026-04-20T14:06:00Z',
    completed_at: '2026-04-20T14:08:45Z',
    persona_outputs: [
      {
        id: 'mock-po-3a',
        persona: 'veri_analisti',
        analysis_text:
          'Final değerlendirmem: Tüm veriler incelendiğinde Galatasaray galibiyeti için yeterli istatistiksel destek bulunmaktadır. Tavsiyem onay yönündedir.',
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
          'Taktiksel değerlendirmemi onaylıyorum. Ev sahibi avantajı ve taktiksel üstünlük tahminimizi destekliyor. Onay.',
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
          'Güncellenmiş modeller ışığında olasılık yeterli seviyede. Onay veriyorum.',
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
          'Tüm panel üyeleri değerlendirmelerini tamamlamıştır. Üç turda toplam 9 analiz yapılmış, 8 onay ve 1 çekimser oy kullanılmıştır. İstatistiksel, taktiksel ve matematiksel değerlendirmelerin tutarlılığı göz önünde bulundurularak tahmini onaylıyorum. Risk faktörü orta seviyede değerlendirilmiştir. Panel kararı: ONAY.',
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
