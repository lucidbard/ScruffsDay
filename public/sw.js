/**
 * Scruff's Day service worker.
 * Network-first for navigations and index.html so iOS Safari never serves
 * a stale entry document. Hashed assets (index-*.js, images, wavs) are
 * fine to serve from cache because each build produces a new hash/URL.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isNavigate =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('index.html');

  if (isNavigate) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(() => caches.match(req))
    );
  }
});
