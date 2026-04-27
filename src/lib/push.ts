import { supabase } from './supabase';

const VAPID_PUBLIC_KEY =
  'BAmipKrppSBGBUAvN9se9iuHdzblFR_eqaZnTS4yPpKRbGmudz6nEnyIU8v9-ywummaE0cfLEic1q5RhrZYapiQ';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function subscribeToPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isPushSupported()) {
      return { ok: false, error: 'Push notifications are not supported in this browser.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, error: 'Notification permission denied.' };
    }

    const registration = await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, error: 'Invalid subscription object from browser.' };
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error: dbError } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user?.id ?? null,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth_key: json.keys.auth,
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      );

    if (dbError) {
      return { ok: false, error: dbError.message };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during push subscription.';
    return { ok: false, error: message };
  }
}
