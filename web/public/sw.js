const CACHE_PREFIX = "clover-static-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const PRECACHE_URLS = [
  "/pwa/apple-touch-icon.png",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-maskable-512.png",
  "/clover-mark.svg",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

function isSafeStaticAsset(url, request) {
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return false;
  }

  if (request.mode === "navigate" || request.destination === "document") {
    return false;
  }

  return (
    url.pathname.startsWith("/pwa/") ||
    url.pathname === "/clover-mark.svg" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/favicon.svg"
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isSafeStaticAsset(url, event.request)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request).then((response) => {
        if (response.ok && response.type === "basic") {
          void cache.put(event.request, response.clone());
        }
        return response;
      });

      return cached ?? network;
    }),
  );
});
