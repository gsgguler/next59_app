import { Layers } from 'lucide-react';

export default function ModelKarsilastirmaPage() {
  return (
    <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
        <Layers className="w-6 h-6 text-blue-400" />
      </div>
      <h1 className="text-xl font-bold text-white">Model Karşılaştırma</h1>
      <p className="text-navy-400 text-sm">Yakında geliyor</p>
    </div>
  );
}
