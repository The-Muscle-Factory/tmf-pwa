// Offline support: pre-cache the app shell, serve cache-first, refresh in background.
// Bump VERSION whenever you deploy changes so phones pick them up.
const VERSION = 'tmf-v8';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/dates.js',
  './js/dom.js',
  './js/store.js',
  './js/library.js',
  './js/legacy.js',
  './js/timer.js',
  './js/gestures.js',
  './js/views/week.js',
  './js/views/day.js',
  './js/views/picker.js',
  './js/views/exercise-info.js',
  './js/views/history.js',
  './js/views/settings.js',
  './data/exercises.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      // Any page navigation (start URL with or without trailing slash, query
      // strings added by iOS, etc.) gets the cached app shell.
      const isPage = e.request.mode === 'navigate';
      const cached = isPage
        ? await cache.match('./index.html')
        : await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok && !isPage) cache.put(e.request, res.clone());
          if (res.ok && isPage) cache.put('./index.html', res.clone());
          return res;
        })
        .catch(() => cached || Response.error());
      if (cached) {
        e.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    })
  );
});
