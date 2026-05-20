import { FlaskConical } from 'lucide-react';

export default function TestLabPage() {
  return (
    <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-champagne/10 border border-champagne/30 flex items-center justify-center">
        <FlaskConical className="w-6 h-6 text-champagne" />
      </div>
      <h1 className="text-xl font-bold text-white">Test Lab</h1>
      <p className="text-navy-400 text-sm">Yakında geliyor</p>
    </div>
  );
}
