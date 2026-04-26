import { Lock } from 'lucide-react';
import PredictionBadge from './PredictionBadge';

interface NarrativeParagraphProps {
  title: string;
  text: string;
  locked?: boolean;
  validation?: 'correct' | 'incorrect' | 'pending';
}

export default function NarrativeParagraph({
  title,
  text,
  locked,
  validation,
}: NarrativeParagraphProps) {
  return (
    <div className="py-5 border-b border-navy-800/60 last:border-b-0">
      <div className="flex items-center gap-2 mb-2.5">
        <h3 className="font-display text-base font-semibold text-white">{title}</h3>
        {locked && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-champagne/60 bg-champagne/5 border border-champagne/10 rounded-full px-2 py-0.5">
            <Lock className="w-2.5 h-2.5" />
            Kilitlendi
          </span>
        )}
        {validation && <PredictionBadge status={validation} />}
      </div>
      <p className="text-sm text-navy-300 leading-relaxed">{text}</p>
    </div>
  );
}
