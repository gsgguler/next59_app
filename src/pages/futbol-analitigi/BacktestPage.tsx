import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, ChevronRight } from 'lucide-react';
import ContentPlaceholder from '../../components/ui/ContentPlaceholder';

export default function BacktestPage() {
  useEffect(() => { document.title = 'Backtest Merkezi | Futbol Analitiği | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <Link to="/futbol-analitigi" className="hover:text-champagne transition-colors">Futbol Analitiği</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Backtest Merkezi</span>
          </div>
        </div>
      </div>
      <ContentPlaceholder
        icon={FlaskConical}
        title="Backtest Merkezi"
        description="Backtest merkezi, senaryo ve model performansını geçmiş 65.104 maç üzerinden değerlendirecek. Başarı oranları, sahte verilerle değil gerçek arşiv kayıtlarıyla hesaplanacak."
        note="Bu bölüm yakında yayına alınacak."
      />
    </div>
  );
}
