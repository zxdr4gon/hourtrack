// Offline support: saves the app's files on the device so it opens without internet.
// IMPORTANT: change CACHE_VERSION every time any app file changes, so phones get the update.
const CACHE_VERSION = "v4.3";
const CACHE_NAME = `hourstracker-${CACHE_VERSION}`;
const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // cache: "reload" skips the browser's own cache, so we always save the newest files
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
  );
  self.skipWaiting();
});

// Remove old versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Serve from the saved copy first, fall back to the network.
// The Google font is saved the first time it loads, so it works offline afterwards.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const isFont = FONT_HOSTS.includes(new URL(event.request.url).hostname);
  event.respondWith(
    caches.match(event.request, { ignoreSearch: !isFont }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (isFont && (response.ok || response.type === "opaque")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});

// Tapping a "running" notification: Stop button stops the timer, anywhere else opens the app
self.addEventListener("notificationclick", (event) => {
  const { sectionId } = event.notification.data || {};
  const stop = event.action === "stop";
  event.notification.close();

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = windows[0];
    if (app) {
      if (stop) app.postMessage({ type: "stop", sectionId });
      return app.focus();
    }
    // App isn't open: open it (it reads ?stop= and stops the timer itself).
    // Reminder / countdown-done notifications have no Stop button and just open the app.
    if (stop) return self.clients.openWindow(`./?stop=${encodeURIComponent(sectionId)}`);
    return self.clients.openWindow(sectionId ? `./#/s/${sectionId}` : "./");
  })());
});
