const CACHE_NAME = "mahjong-score-shell-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/mahjong-score-icon.png",
  "/mahjong-bg-ink-landscape.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("mahjong-score-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/"))
    );
    return;
  }

  if (!STATIC_ASSETS.includes(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request))
  );
});
