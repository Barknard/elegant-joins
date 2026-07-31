/* Elegant Joins service worker — offline app shell.
 *
 * Vite content-hashes every JS/CSS bundle, so a hand-written precache list would go
 * stale on each build. Instead:
 *
 *   navigations  -> network-first, falling back to the cached shell. New code lands as
 *                   soon as the user is online, and the app still opens offline.
 *   hashed assets-> cache-first. The hash IS the version, so a cached copy can never be
 *                   wrong; this is what makes a second visit instant and fully offline.
 *   everything   -> stale-while-revalidate for same-origin extras (fonts, icons).
 *
 * Bump CACHE whenever the caching strategy itself changes; asset changes handle
 * themselves via the content hash.
 */
const CACHE = "elegant-joins-v2.0.0";

// Files without a content hash, so they must be fetched fresh at install time.
const SHELL = ["./", "./index.html", "./manifest.json", "./favicon.png", "./icon-192.png", "./icon-512.png", "./fonts/fonts.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // cache:'no-store' so a reinstall never re-caches a stale copy out of the
        // browser's own HTTP cache — the classic cause of a half-updated app shell.
        Promise.all(
          SHELL.map((url) =>
            fetch(url, { cache: "no-store" })
              .then((res) => (res && res.ok ? cache.put(url, res.clone()) : null))
              .catch(() => null),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Vite emits /assets/name-<hash>.js — the hash makes the URL permanently unique. */
function isImmutable(url) {
  return /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never cache third parties

  // Navigations: network-first so a deploy is picked up on the next online load.
  if (request.mode === "navigate") {
    event.respondWith(
      // cache:'no-cache' revalidates with the server rather than accepting the browser's
      // HTTP-cached copy. GitHub Pages sends index.html with a ten-minute max-age, so a
      // plain fetch here is "network-first" in name only and keeps serving the old page.
      fetch(request.url, { cache: "no-cache", credentials: "same-origin" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./"))),
    );
    return;
  }

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else: serve cache immediately, refresh in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
