import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown, ChevronRight } from 'lucide-react';
import ContentPlaceholder from '../../components/ui/ContentPlaceholder';

export default function FavoriNedenKaybederPage() {
  useEffect(() => { document.title = 'Favori Neden Kaybeder? | Senaryolar | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">
          <div className="flex items-center gap-2 text-xs text-readable-muted mb-4">
            <Link to="/senaryolar" className="hover:text-champagne transition-colors">Senaryolar</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Favori Neden Kaybeder?</span>
          </div>
        </div>
      </div>
      <ContentPlaceholder icon={TrendingDown} title="Favori Neden Kaybeder?"
        description="Arşiv verilerine göre güçlü favori takımların beklenmedik şekilde mağlup olduğu örüntüler. Sürpriz sonuçların veri anatomisi."
        note="Bu bölüm yakında yayına alınacak." />
    </div>
  );
}
