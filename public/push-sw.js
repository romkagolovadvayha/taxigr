/* global self, clients */

function safeTarget(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '/', self.location.origin);
    const path = decodeURIComponent(url.pathname);
    if (
      url.origin === self.location.origin &&
      (/^\/$/.test(path) || /^\/orders\/[0-9a-f-]{36}$/.test(path) || /^\/driver(?:\/trips\/[0-9a-f-]{36})?$/.test(path))
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // Invalid destinations open the home screen.
  }
  return '/';
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'Такси Грахово', {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    data: { url: safeTarget(payload.url) },
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    renotify: Boolean(payload.tag),
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safeTarget(event.notification.data?.url), self.location.origin);
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      if ('navigate' in client) await client.navigate(target.href);
      return;
    }
    await clients.openWindow(target.href);
  }));
});
