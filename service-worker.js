/* SCC Traffic Counter - service worker
   Strategy: precache the whole app shell on install, then serve cache-first
   (with a background refresh) so the app opens instantly and works offline.
   Survey data is NOT handled here - it lives in IndexedDB on the device and is
   never touched by cache updates.
   To publish an update: change CACHE_VERSION below and upload the new files. */
const CACHE_VERSION = "v1.0.0";
const CACHE = "scc-traffic-counter-" + CACHE_VERSION;

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon-48.png"
];

const INDEX_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith("scc-traffic-counter-") && k !== CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === "navigate";
  const key = isNav ? new Request(INDEX_URL) : req;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key, { ignoreSearch: true });

    const refresh = fetch(req)
      .then(async res => {
        if (res && res.ok && res.type === "basic") await cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);

    if (hit) {
      event.waitUntil(refresh);   // update cache in the background, serve cached copy now
      return hit;
    }
    const res = await refresh;
    if (res) return res;
    if (isNav) {
      const fallback = await cache.match(INDEX_URL);
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  })());
});
