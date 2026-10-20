// Minimal app-shell cache so the scanner pages open even with no internet.
// The build replaces __BUILD_ID__ on every deploy, so each deploy gets a fresh cache automatically.
const CACHE = 'cict-shell-__BUILD_ID__';

// Take over immediately instead of waiting for every open tab to close, so a deploy is not stuck behind an old worker
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/version.json') return; // never cache API calls or the version check

  // Pages: network first, so a new deploy shows up, and the saved page when offline.
  // The app is a single page, so every address is the same index.html.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Built files have hashed names, so a cached copy is never stale: cache first
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
    )
  );
});
