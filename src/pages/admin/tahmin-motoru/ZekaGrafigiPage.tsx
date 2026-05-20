import { GitBranch } from 'lucide-react';

export default function ZekaGrafigiPage() {
  return (
    <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
        <GitBranch className="w-6 h-6 text-emerald-400" />
      </div>
      <h1 className="text-xl font-bold text-white">Zeka Grafiği</h1>
      <p className="text-navy-400 text-sm">Yakında geliyor</p>
    </div>
  );
}
