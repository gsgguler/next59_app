import { CheckCircle, XCircle, Clock, AlertCircle, PlayCircle, Video as LucideIcon } from 'lucide-react';

export interface StatusConfig {
  color: string;
  bg: string;
  border: string;
  Icon: LucideIcon;
  label: string;
}

export const getStatusConfig = (status: string | undefined | null): StatusConfig => {
  const normalizedStatus = (status || '').toLowerCase();

  switch (normalizedStatus) {
    case 'completed':
    case 'active':
    case 'healthy':
    case 'success':
    case 'ok':
      return { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', Icon: CheckCircle, label: 'Aktif / Başarılı' };

    case 'failed':
    case 'error':
    case 'dead':
    case 'stopped':
      return { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', Icon: XCircle, label: 'Hata / Durduruldu' };

    case 'running':
    case 'processing':
      return { color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', Icon: PlayCircle, label: 'Çalışıyor' };

    case 'partial':
    case 'degraded':
    case 'warning':
    case 'stale':
      return { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', Icon: AlertCircle, label: 'Kısmi / Uyarı' };

    case 'no_data':
      return { color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', Icon: XCircle, label: 'Veri Yok' };

    default:
      return { color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', Icon: Clock, label: 'Bekliyor / Bilinmiyor' };
  }
};
