/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

const isWebContainer = self.location.hostname.includes('webcontainer')
  || self.location.hostname.includes('local-credentialless')
  || self.location.hostname === 'localhost';

if (isWebContainer) {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
  });
} else {

precacheAndRoute(self.__WB_MANIFEST);

// HTML / navigation requests: network-first so users always get the latest shell
const htmlStrategy = new NetworkFirst({
  cacheName: 'pages-cache',
  networkTimeoutSeconds: 3,
});
registerRoute(new NavigationRoute(htmlStrategy));

// Images: cache-first with 30-day expiration, max 100 entries
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
);

// Supabase API: network-first with 5s timeout
registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60,
      }),
    ],
  }),
);

// Push event listener — wrapped in try/catch so a denied notification
// permission cannot throw and disrupt the SW message channel (which would
// prevent the skipWaiting / reload flow from working).
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? 'Next59';
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: '/favicon-192.png',
    badge: '/favicon-96.png',
    data: { url: data.url ?? '/' },
  };
  event.waitUntil(
    self.registration.showNotification(title, options).catch(() => {
      // Notification permission denied — silently ignore
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? '/';
  event.waitUntil(self.clients.openWindow(url));
});

} // end of !isWebContainer block
