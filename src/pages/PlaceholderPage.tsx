import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <Construction className="w-16 h-16 mb-4" />
      <h1 className="text-xl font-semibold text-gray-600">{title}</h1>
      <p className="text-sm mt-2">Bu sayfa yakim zamanda eklenecek</p>
    </div>
  );
}
