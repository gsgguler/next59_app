import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PenLine, ChevronRight } from 'lucide-react';
import ContentPlaceholder from '../../components/ui/ContentPlaceholder';

export default function EditorNotlariPage() {
  useEffect(() => { document.title = 'Editör Notları | Yazılar | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">
          <div className="flex items-center gap-2 text-xs text-navy-500 mb-4">
            <Link to="/yazilar" className="hover:text-champagne transition-colors">Yazılar</Link>
            <ChevronRight className="w-3 h-3" /><span className="text-navy-400">Editör Notları</span>
          </div>
        </div>
      </div>
      <ContentPlaceholder icon={PenLine} title="Editör Notları"
        description="Platform kararları, metodoloji güncellemeleri ve editoryal tutumu şekillendiren notlar."
        note="Bu bölüm yakında yayına alınacak." />
    </div>
  );
}
