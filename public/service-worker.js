const OBSOLETE_CACHE_PREFIX = 'taxigr-offline-';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.unregister(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(OBSOLETE_CACHE_PREFIX))
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  );
});
