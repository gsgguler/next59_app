import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';
import ContentPlaceholder from '../../components/ui/ContentPlaceholder';

export default function YazilarPage() {
  useEffect(() => { document.title = 'Yazılar | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <span className="text-navy-400">Yazılar</span>
          </div>
        </div>
      </div>
      <ContentPlaceholder icon={FileText} title="Tüm Yazılar"
        description="Next59'un futbol analitiği, veri okuması ve editoryal yazıları. Analiz yazıları, Dünya Kupası 2026 içerikleri ve editör notları bu bölümde toplanacak."
        note="Bu bölüm yakında yayına alınacak." />
    </div>
  );
}
