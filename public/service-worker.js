const OFFLINE_CACHE_PREFIX = 'taxigr-offline-';
const OFFLINE_CACHE = `${OFFLINE_CACHE_PREFIX}v1`;
const OFFLINE_PAGE = '/offline.html';
const NAVIGATION_TIMEOUT_MS = 8_000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_PAGE, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(OFFLINE_CACHE_PREFIX) && key !== OFFLINE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;

  event.respondWith(
    (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
      try {
        return await fetch(event.request, { signal: controller.signal });
      } catch {
        return (
          (await caches.match(OFFLINE_PAGE)) ??
          new Response('Нет связи. Проверьте интернет и обновите страницу.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      } finally {
        clearTimeout(timeout);
      }
    })(),
  );
});
