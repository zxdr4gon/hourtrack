// Offline support: saves the app's files on the device so it opens without internet.
// IMPORTANT: change CACHE_VERSION every time any app file changes, so phones get the update.
const CACHE_VERSION = "v4";
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

// Serve from the saved copy first, fall back to the network
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request))
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

/* ---------- Background reminders ----------
   The GitHub Actions job (.github/workflows/reminder.yml) sends a push at the reminder time.
   We work out which daily goals aren't done from the copy the app keeps in IndexedDB.
   Every push must show a notification, so when everything's done we show a quiet "all done" one. */

function kvOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("stint", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet(key) {
  const db = await kvOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction("kv").objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key, value) {
  const db = await kvOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtLeft(ms) {
  const min = Math.ceil(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : `${min}m`;
}

function showReminder(title, body, quiet) {
  // Same tag, so a second push the same evening replaces the first instead of stacking up
  return self.registration.showNotification(title, {
    body,
    tag: "reminder",
    data: { kind: "reminder" },
    icon: "icons/icon-192.png",
    silent: quiet,
  });
}

async function handlePush(message) {
  if (message.type === "test") {
    return showReminder("✅ Background reminders work", "You'll get a nudge at your reminder time if a daily goal isn't done.", false);
  }

  const snap = await kvGet("snapshot").catch(() => null);
  if (!snap) return showReminder("🎯 Daily goal check", "Open Stint to see today's goals.", false);
  if (!snap.reminderOn) return showReminder("🎯 Reminders are off in Stint", "Delete the STINT_PUSH secret on GitHub to stop these.", true);

  const now = new Date();
  const today = dayKey(now);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const behind = [];
  for (const s of snap.sections) {
    if (!s.days.includes(now.getDay())) continue;
    let done = snap.today === today ? snap.done[s.id] || 0 : 0;
    const run = snap.running[s.id];
    if (run) {
      const paused = run.pausedMs + (run.pausedAt ? now - run.pausedAt : 0);
      done += Math.max(0, Math.min(now - run.start - paused, now - startOfToday));
    }
    const left = s.minutes * 60000 - done;
    if (left > 0) behind.push(`${s.emoji ? s.emoji + " " : ""}${s.name} (${fmtLeft(left)} left)`);
  }

  if (!behind.length) return showReminder("✅ Today's goals are done", "Nice work!", true);
  // Only buzz once a day (the app may have reminded you already)
  const already = snap.lastReminded === today || (await kvGet("pushReminded").catch(() => null)) === today;
  await kvSet("pushReminded", today).catch(() => {});
  return showReminder("🎯 Daily goals not done yet", behind.join(", "), already);
}

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() || {};
  } catch {}
  event.waitUntil(handlePush(message));
});
