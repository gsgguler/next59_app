import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';

interface ContentPlaceholderProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  note?: string;
}

export default function ContentPlaceholder({
  icon: Icon = Construction,
  title,
  description,
  note,
}: ContentPlaceholderProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-24">
      <div className="w-16 h-16 rounded-2xl bg-navy-800/60 border border-navy-700 flex items-center justify-center mb-6">
        <Icon className="w-8 h-8 text-navy-400" />
      </div>
      <h1 className="text-2xl font-bold text-white font-display text-center mb-3">{title}</h1>
      <p className="text-sm text-navy-400 text-center max-w-md leading-relaxed">{description}</p>
      {note && (
        <p className="mt-4 text-xs text-navy-400 text-center max-w-sm">{note}</p>
      )}
    </div>
  );
}
