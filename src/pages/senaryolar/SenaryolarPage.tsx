import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ChevronRight } from 'lucide-react';
import ContentPlaceholder from '../../components/ui/ContentPlaceholder';

export default function SenaryolarPage() {
  useEffect(() => { document.title = 'Senaryolar | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <span className="text-navy-400">Senaryolar</span>
          </div>
        </div>
      </div>
      <ContentPlaceholder
        icon={Zap}
        title="Örnek Maç Senaryoları"
        description="Next59 maç okumaları — favori neden kaybeder, sürpriz nasıl gerçekleşir, veri bize ne söyler? Gerçek maç kayıtlarından üretilen senaryolar yakında burada."
        note="Bu bölüm yakında yayına alınacak."
      />
    </div>
  );
}
