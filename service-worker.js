const CACHE_NAME = "ods9-mobile-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "./",
        "./index.html",
        "./styles.css",
        "./app.js",
        "./manifest.json",
        "./ODS9.txt",
        "./icon-192.png",
        "./icon-512.png",
        "./favicon.ico"
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Keep external requests untouched (fonts, CDNs, etc.).
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === "navigate") return caches.match("./index.html");
          return new Response("", { status: 404 });
        })
      )
  );
});
