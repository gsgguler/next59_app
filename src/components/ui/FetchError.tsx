import { AlertTriangle, RefreshCw } from 'lucide-react';

interface FetchErrorProps {
  message?: string;
  onRetry?: () => void;
}

export default function FetchError({ message, onRetry }: FetchErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Veri yüklenemedi
      </h3>
      <p className="text-sm text-gray-500 text-center max-w-sm mb-5">
        {message || 'Bir hata olustu. Lutfen tekrar deneyin.'}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Tekrar Dene
        </button>
      )}
    </div>
  );
}
