import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Info, ChevronRight } from 'lucide-react';
import ContentPlaceholder from '../../components/ui/ContentPlaceholder';

export default function Next59Page() {
  useEffect(() => { document.title = 'Next59 Hakkında | Next59'; }, []);
  return (
    <div className="min-h-screen bg-navy-950">
      <div className="border-b border-navy-800/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6" />
      </div>
      <ContentPlaceholder icon={Info} title="Next59"
        description="Next59, futbol zekâsı ve editoryal veri okuması platformudur. Hakkımızda, yayın ilkeleri ve iletişim bilgilerine bu bölümden ulaşabilirsiniz." />
    </div>
  );
}
