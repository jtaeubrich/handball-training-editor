const VERSION = 'v79';
const STATIC_CACHE = `handballtrainer-static-${VERSION}`;
const NAV_CACHE = `handballtrainer-nav-${VERSION}`;

const STATIC_ASSETS = [
  './manifest.webmanifest',
  './README.md',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);

    // Do not let one optional asset prevent the new worker from installing.
    await Promise.allSettled(
      STATIC_ASSETS.map(async url => {
        const response = await fetch(url, {cache:'no-store'});
        if (response && response.ok) {
          await cache.put(url, response.clone());
        }
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, NAV_CACHE]);
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key.startsWith('handballtrainer-') && !keep.has(key))
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    // cache:'no-store' deliberately bypasses the normal browser HTTP cache.
    // This is important for the frequently updated single-file editor.
    const response = await fetch(request, {cache:'no-store'});

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ko-fi and other external links must never be handled by this worker.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await networkFirst(request, NAV_CACHE);
      } catch (err) {
        // If the exact navigation URL is not cached, use the most recent
        // successfully cached app navigation as an offline fallback.
        const navCache = await caches.open(NAV_CACHE);
        const keys = await navCache.keys();
        if (keys.length) {
          const fallback = await navCache.match(keys[keys.length - 1]);
          if (fallback) return fallback;
        }

        return new Response(
          'Handballtrainer ist offline und wurde noch nicht in dieser Version geladen.',
          {
            status:503,
            headers:{'Content-Type':'text/plain; charset=utf-8'}
          }
        );
      }
    })());
    return;
  }

  // Same-origin assets are also network-first. This makes updates visible
  // immediately while retaining the last successful copy for offline use.
  event.respondWith(networkFirst(request, STATIC_CACHE));
});
