import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Globe, ChevronRight } from 'lucide-react';
import ContentPlaceholder from '../../components/ui/ContentPlaceholder';

export default function DunyaKupasi2026Page() {
  useEffect(() => { document.title = 'Dünya Kupası 2026 | Yazılar | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <Link to="/yazilar" className="hover:text-champagne transition-colors">Yazılar</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Dünya Kupası 2026</span>
          </div>
        </div>
      </div>
      <ContentPlaceholder icon={Globe} title="Dünya Kupası 2026"
        description="2026 FIFA Dünya Kupası öncesi ve turnuva boyunca üretilen veri okumaları, senaryo analizleri ve editoryal yazılar."
        note="Turnuva başladıkça içerikler burada yayımlanacak." />
    </div>
  );
}
