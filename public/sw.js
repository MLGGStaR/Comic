// Longbox service worker — instant launches, offline shell, cached covers.
// Data itself is cached by the page in IndexedDB.
const VERSION = 'v2';
const CACHE = `longbox-shell-${VERSION}`;
const IMG_CACHE = 'longbox-img-v1';
const IMG_MAX = 1500;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const isImage = (req, url) =>
  req.destination === 'image' && url.origin !== location.origin && !url.pathname.includes('/functions/');

async function trimImages() {
  const c = await caches.open(IMG_CACHE);
  const keys = await c.keys();
  if (keys.length > IMG_MAX) await Promise.all(keys.slice(0, keys.length - IMG_MAX).map((k) => c.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // cover art: cache-first — grids render instantly on repeat views
  if (isImage(req, url)) {
    e.respondWith(
      caches.open(IMG_CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          c.put(req, res.clone());
          if (Math.random() < 0.05) trimImages();
        }
        return res;
      }),
    );
    return;
  }

  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // drives auto-update

  // hashed assets + icons: cache-first (immutable)
  if (url.pathname.includes('/assets/') || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            if (r.ok) {
              const copy = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return r;
          }),
      ),
    );
    return;
  }

  // navigations / index.html: network-first, cached shell as offline fallback.
  // `no-cache` revalidates with the server (a cheap 304 when unchanged) so an
  // update reload can never be answered by a stale copy in the HTTP cache.
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return r;
      })
      .catch(async () => (await caches.match(req)) || (await caches.match('./')) || Response.error()),
  );
});
