"use strict";

/* =========================================================
   Data
   ========================================================= */

// Keep these keys as they are, even though the app is now called Stint: changing them would lose saved data
const STORAGE_KEY = "hourstracker:v1";
const SETTINGS_KEY = "hourstracker:settings";
const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#84cc16", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#64748b"];
const EMOJI_PICKS = ["🏏", "⚽", "🏀", "🎾", "🏃", "🚴", "🏋️", "🏊", "🧘", "📚", "💻", "🎸", "🎨", "🎮"];
const COUNTDOWN_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90];
const MIN_SESSION_MS = 3000;          // taps shorter than this are treated as accidental
const FIX_IT_MS = 3 * 60 * 60 * 1000; // stopping a timer longer than this asks "forgot to stop?"
const BACKUP_REMINDER_DAYS = 14;

let state = load();
let settings = loadSettings();

function emptyState() {
  return { sections: [], sessions: [], running: {}, stopwatch: null };
}

// Brings data saved by older versions up to date
function migrate(data) {
  const s = { ...emptyState(), ...data };
  // v1/v2 stored a running timer as just its start time
  for (const [id, run] of Object.entries(s.running)) {
    if (typeof run === "number") s.running[id] = { start: run, pausedMs: 0, pausedAt: null, target: null };
  }
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Per-device preferences, kept apart from the data (not included in backups)
function loadSettings() {
  const defaults = {
    theme: "system",
    notify: false,
    reminderOn: false,
    reminderTime: "18:30",
    lastReminded: null,
    lastBackup: null,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getSection(id) {
  return state.sections.find((s) => s.id === id);
}

function sessionsFor(sectionId) {
  return state.sessions.filter((s) => s.sectionId === sectionId);
}

function categories() {
  return [...new Set(state.sections.map((s) => s.category).filter(Boolean))];
}

/* =========================================================
   Time helpers
   ========================================================= */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function addDays(ts, n) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

// Weeks start on Monday
function startOfWeek(ts) {
  const day = new Date(ts).getDay(); // 0 = Sunday
  return addDays(startOfDay(ts), -((day + 6) % 7));
}

function startOfMonth(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// "1h 05m", "12m", "45s"
function fmtDuration(ms) {
  ms = Math.max(0, ms);
  const totalMin = Math.floor(ms / 60000);
  if (totalMin === 0 && ms > 0) return `${Math.floor(ms / 1000)}s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${pad(m)}m` : `${m}m`;
}

// "1:05:22" for the live clock
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// "05:22.4" (or "1:05:22.4") for the stopwatch
function fmtStopwatch(ms) {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const s = Math.floor(tenths / 10);
  const h = Math.floor(s / 3600);
  const mmss = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}.${tenths % 10}`;
  return h ? `${h}:${mmss}` : mmss;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtShortDate(ts) {
  return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short" });
}

function fmtDayHeading(ts) {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return new Date(ts).toLocaleDateString([], {
    weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }),
  });
}

// For <input type="date"> / <input type="time">
function toDateInput(ts) {
  return dayKey(ts);
}
function toTimeInput(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* =========================================================
   Timer maths
   A running timer is { start, pausedMs, pausedAt, target }:
   pausedMs = total time spent paused so far, pausedAt = when the current pause began,
   target = countdown length in ms (null for a normal timer).
   The stopwatch uses the same shape.
   ========================================================= */

function pausedSoFar(run, now = Date.now()) {
  return run.pausedMs + (run.pausedAt ? now - run.pausedAt : 0);
}

function activeMs(run, now = Date.now()) {
  return now - run.start - pausedSoFar(run, now);
}

function remainingMs(run, now = Date.now()) {
  return run.target - activeMs(run, now);
}

// Time actually spent in a saved session (paused time doesn't count)
function sessionMs(s) {
  return s.end - s.start - (s.paused || 0);
}

/* =========================================================
   Stats
   ========================================================= */

// All sessions for a section, including a running timer as if it ended now
function sessionsWithLive(sectionId, now = Date.now()) {
  const list = sessionsFor(sectionId);
  const run = state.running[sectionId];
  if (run) list.push({ start: run.start, end: now, paused: pausedSoFar(run, now) });
  return list;
}

// Time inside [from, to). Sessions that cross the boundary only count the part inside
// (paused time is spread evenly over the session).
function totalBetween(sectionId, from, to, now = Date.now()) {
  let total = 0;
  for (const s of sessionsWithLive(sectionId, now)) {
    const span = s.end - s.start;
    const overlap = Math.min(s.end, to) - Math.max(s.start, from);
    if (overlap > 0 && span > 0) total += overlap * (sessionMs(s) / span);
  }
  return total;
}

function totals(sectionId) {
  const now = Date.now();
  return {
    today: totalBetween(sectionId, startOfDay(now), Infinity, now),
    week: totalBetween(sectionId, startOfWeek(now), Infinity, now),
    month: totalBetween(sectionId, startOfMonth(now), Infinity, now),
    all: totalBetween(sectionId, -Infinity, Infinity, now),
  };
}

function sumSections(sectionIds, from, to) {
  return sectionIds.reduce((sum, id) => sum + totalBetween(id, from, to), 0);
}

// A day counts towards a streak if a session started on that day.
function streaks(sectionId) {
  const days = new Set(sessionsWithLive(sectionId).map((s) => dayKey(s.start)));
  if (!days.size) return { current: 0, best: 0 };

  // Current: count back from today (or from yesterday, since today isn't over yet)
  let cursor = startOfDay(Date.now());
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let current = 0;
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  // Best: longest run of consecutive days ever
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const [y, m, d] = sorted[i - 1].split("-").map(Number);
    const nextDay = dayKey(new Date(y, m - 1, d + 1).getTime());
    run = sorted[i] === nextDay ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best };
}

// section.goal = { period: "day" | "week", minutes }
function goalProgress(section) {
  if (!section.goal) return null;
  const t = totals(section.id);
  const done = section.goal.period === "week" ? t.week : t.today;
  const target = section.goal.minutes * 60000;
  return {
    done,
    target,
    pct: Math.min(1, done / target),
    met: done >= target,
    label: section.goal.period === "week" ? "this week" : "today",
  };
}

function unmetDailyGoals() {
  return state.sections
    .filter((s) => s.goal?.period === "day")
    .map((section) => ({ section, progress: goalProgress(section) }))
    .filter((x) => !x.progress.met);
}

/* =========================================================
   Timer actions
   ========================================================= */

function startTimer(sectionId, targetMinutes = null) {
  state.running[sectionId] = {
    start: Date.now(),
    pausedMs: 0,
    pausedAt: null,
    target: targetMinutes ? targetMinutes * 60000 : null,
  };
  afterTimerChange();
}

function pauseTimer(sectionId) {
  const run = state.running[sectionId];
  if (!run || run.pausedAt) return;
  run.pausedAt = Date.now();
  afterTimerChange();
}

function resumeTimer(sectionId) {
  const run = state.running[sectionId];
  if (!run?.pausedAt) return;
  run.pausedMs += Date.now() - run.pausedAt;
  run.pausedAt = null;
  afterTimerChange();
}

function togglePause(sectionId) {
  navigator.vibrate?.(20);
  if (state.running[sectionId]?.pausedAt) resumeTimer(sectionId);
  else pauseTimer(sectionId);
}

function afterTimerChange() {
  save();
  render();
  syncNotifications();
}

// end: when the session ended (defaults to now, or to when it was paused).
// quiet: skip the toast and the "forgot to stop?" check (used by countdowns).
function stopTimer(sectionId, { end = null, quiet = false } = {}) {
  const run = state.running[sectionId];
  if (!run) return;
  delete state.running[sectionId];
  const session = {
    id: uid(),
    sectionId,
    start: run.start,
    end: end ?? run.pausedAt ?? Date.now(),
    paused: run.pausedMs,
    note: "",
  };
  const duration = sessionMs(session);

  if (duration < MIN_SESSION_MS) {
    if (!quiet) toast("Too short — not saved");
    afterTimerChange();
    return;
  }
  state.sessions.push(session);
  afterTimerChange();
  if (quiet) return;

  if (duration > FIX_IT_MS) {
    openSessionDialog(session.id, `This timer ran for ${fmtDuration(duration)}. Forgot to stop it? Fix the end time below, or just press Save.`);
    return;
  }
  // Undo puts the timer back as if Stop was never pressed
  toast(`Logged ${fmtDuration(duration)}`, () => {
    state.sessions = state.sessions.filter((s) => s.id !== session.id);
    state.running[sectionId] = run;
    afterTimerChange();
  });
}

function toggleTimer(sectionId) {
  navigator.vibrate?.(30);
  unlockAudio();
  if (state.running[sectionId]) stopTimer(sectionId);
  else startTimer(sectionId);
}

// Countdowns stop themselves at exactly the target time, even if the app was closed
function checkCountdowns() {
  const now = Date.now();
  for (const [sectionId, run] of Object.entries(state.running)) {
    if (!run.target || activeMs(run, now) < run.target) continue;
    const end = run.start + run.pausedMs + run.target;
    const section = getSection(sectionId);
    stopTimer(sectionId, { end, quiet: true });
    const message = `${section ? section.name : "Countdown"} done — logged ${fmtDuration(run.target)}`;
    toast(`⏳ ${message}`);
    // Only make noise if it just finished (not when reopening the app hours later)
    if (now - end < 60000) {
      navigator.vibrate?.([300, 150, 300, 150, 600]);
      beep();
      notify(`⏳ ${message}`, "Nice work!", `done-${sectionId}`);
    }
  }
}

/* =========================================================
   Sound
   ========================================================= */

// Phones only allow sound after a tap, so we prepare it on the first Start
let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}

function beep() {
  if (!audioCtx) return;
  try {
    [0, 0.3, 0.6].forEach((offset) => {
      const t = audioCtx.currentTime + offset;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  } catch {}
}

/* =========================================================
   Notifications
   ========================================================= */

const notificationsSupported = "Notification" in window && "serviceWorker" in navigator;

async function ensureNotificationPermission() {
  if (!notificationsSupported) return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}

// Needs the offline service worker, so it only works on the live site, not on localhost.
async function notify(title, body, tag, data = {}) {
  if (!notificationsSupported || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.showNotification(title, { body, tag, data, icon: "icons/icon-192.png" });
}

// One "Cricket — running" notification per running timer; removes the rest
async function syncNotifications() {
  if (!notificationsSupported) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const wanted = settings.notify && Notification.permission === "granted" ? state.running : {};

  for (const n of await reg.getNotifications()) {
    if (n.data?.kind === "running" && !(n.data.sectionId in wanted)) n.close();
  }
  for (const [sectionId, run] of Object.entries(wanted)) {
    const section = getSection(sectionId);
    if (!section) continue;
    let body = `Started at ${fmtTime(run.start)}.`;
    if (run.pausedAt) body = `Paused at ${fmtDuration(activeMs(run))}.`;
    else if (run.target) body = `Countdown ends at ${fmtTime(Date.now() + remainingMs(run))}.`;
    await reg.showNotification(`${section.emoji ? section.emoji + " " : ""}${section.name} — ${run.pausedAt ? "paused" : "running"}`, {
      body: `${body} Tap to open.`,
      tag: `running-${sectionId}`,
      data: { kind: "running", sectionId },
      timestamp: run.start,
      requireInteraction: true,
      silent: true,
      icon: "icons/icon-192.png",
      actions: [{ action: "stop", title: "⏹ Stop" }],
    });
  }
}

// The Stop button on a notification sends us a message (or opens the app with ?stop=id)
navigator.serviceWorker?.addEventListener("message", (e) => {
  if (e.data?.type === "stop") stopTimer(e.data.sectionId);
});

function handleStopFromUrl() {
  const id = new URLSearchParams(location.search).get("stop");
  if (!id) return;
  history.replaceState(null, "", location.pathname + location.hash);
  stopTimer(id);
}

// Daily goal reminder: once a day, after the chosen time, if a daily goal isn't done yet.
// A web app can't wake itself up, so this only fires while Stint is open.
function checkReminder() {
  if (!settings.reminderOn) return;
  const now = new Date();
  const [h, m] = settings.reminderTime.split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  const today = dayKey(now);
  if (settings.lastReminded === today) return;
  settings.lastReminded = today;
  saveSettings();

  const behind = unmetDailyGoals();
  if (!behind.length) return;
  const list = behind.map(({ section, progress }) => `${section.name} (${fmtDuration(progress.target - progress.done)} left)`).join(", ");
  notify("🎯 Daily goals not done yet", list, "reminder");
  toast(`🎯 Still to do today: ${list}`);
}

/* =========================================================
   Screen wake lock (focus mode keeps the screen on)
   ========================================================= */

let wakeLock = null;
async function updateWakeLock(want) {
  if (want && !wakeLock && "wakeLock" in navigator && document.visibilityState === "visible") {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } catch {}
  } else if (!want && wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}

/* =========================================================
   Rendering
   ========================================================= */

const $ = (sel) => document.querySelector(sel);
const view = $("#view");

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sectionIcon(section) {
  return esc(section.emoji || section.name.charAt(0).toUpperCase());
}

function sectionLabel(section) {
  return `${section.emoji ? esc(section.emoji) + " " : ""}${esc(section.name)}`;
}

// Routes: #/s/<id>, #/focus/<id>, #/stats, #/stopwatch, or nothing for home
function currentRoute() {
  const [, page, id] = location.hash.match(/^#\/(\w+)(?:\/(.+))?$/) || [];
  return { page: page || "home", id };
}

function setHeader(title, showBack) {
  $("#title").textContent = title;
  $("#backBtn").hidden = !showBack;
  document.title = title === "Stint" ? "Stint" : `${title} · Stint`;
}

let lastFullRender = 0;

function render() {
  lastFullRender = Date.now();
  const { page, id } = currentRoute();
  const section = id && getSection(id);
  document.body.classList.toggle("focus-mode", page === "focus" && !!section);

  if (page === "s" && section) renderSection(section);
  else if (page === "focus" && section) renderFocus(section);
  else if (page === "stats") renderStats();
  else if (page === "stopwatch") renderStopwatch();
  else renderHome();

  updateWakeLock(page === "focus" && !!section);
  updateLive();
}

function goalBar(progress) {
  return `<div class="goal-bar ${progress.met ? "met" : ""}"><div style="width:${Math.round(progress.pct * 100)}%"></div></div>`;
}

function goalText(progress) {
  return progress.met
    ? `🎯 Goal done ${progress.label} ✓`
    : `🎯 ${fmtDuration(progress.done)} of ${fmtDuration(progress.target)} ${progress.label}`;
}

/* ---------- Home ---------- */

function sectionCard(section) {
  const run = state.running[section.id];
  const t = totals(section.id);
  const { current } = streaks(section.id);
  const progress = goalProgress(section);
  const streakText = current ? ` · <span class="nowrap">🔥 ${current}</span>` : "";
  const meta = run
    ? `<span class="live" data-live="${section.id}"></span> · Today ${fmtDuration(t.today)}`
    : `Today ${fmtDuration(t.today)} · Week ${fmtDuration(t.week)}${streakText}`;
  return `
    <div class="card section-card" style="--accent:${section.color}" data-open="${section.id}">
      <div class="emoji">${sectionIcon(section)}</div>
      <div class="info">
        <div class="name">${esc(section.name)}</div>
        <div class="meta">${meta}</div>
        ${progress ? `<div class="goal-line">${goalText(progress)}</div>${goalBar(progress)}` : ""}
      </div>
      ${run ? `<button class="mini-btn" data-pause="${section.id}" aria-label="${run.pausedAt ? "Resume" : "Pause"}">${run.pausedAt ? "▶" : "⏸"}</button>` : ""}
      <button class="timer-btn ${run ? "running" : ""} ${run?.pausedAt ? "paused" : ""}" data-toggle="${section.id}">
        ${run ? "Stop" : "Start"}
      </button>
    </div>`;
}

function backupDue() {
  if (!state.sessions.length) return false;
  const last = settings.lastBackup ?? Math.min(...state.sessions.map((s) => s.start));
  return Date.now() - last > BACKUP_REMINDER_DAYS * DAY_MS;
}

function renderHome() {
  setHeader("Stint", false);

  const nav = `
    <div class="nav-row">
      <a class="btn" href="#/stats">📊 Stats</a>
      <a class="btn" href="#/stopwatch">⏱ Stopwatch${state.stopwatch ? ' <span class="dot"></span>' : ""}</a>
    </div>`;

  let banner = "";
  if (backupDue()) {
    const days = settings.lastBackup ? Math.floor((Date.now() - settings.lastBackup) / DAY_MS) : null;
    banner = `
      <div class="card banner">
        <span>💾 ${days ? `Last backup was ${days} days ago.` : "You haven't backed up yet."}</span>
        <button class="btn small primary" data-action="backup">Back up</button>
      </div>`;
  }

  if (!state.sections.length) {
    view.innerHTML = nav + `
      <div class="empty">
        <div class="big">⏱️</div>
        <p>No sections yet.<br>Add one for each activity you want to track.</p>
      </div>
      <button class="add-section" data-action="add-section">+ Add section</button>`;
    return;
  }

  const todayAll = sumSections(state.sections.map((s) => s.id), startOfDay(Date.now()), Infinity);
  const summary = `<div class="home-summary">Today: ${fmtDuration(todayAll)} across all sections</div>`;

  // Sections without a category first, then one group per category
  const uncategorised = state.sections.filter((s) => !s.category);
  const groups = categories().map((cat) => {
    const list = state.sections.filter((s) => s.category === cat);
    const ids = list.map((s) => s.id);
    const now = Date.now();
    return `
      <div class="group-head">
        <span>${esc(cat)}</span>
        <span>Today ${fmtDuration(sumSections(ids, startOfDay(now), Infinity))} · Week ${fmtDuration(sumSections(ids, startOfWeek(now), Infinity))}</span>
      </div>
      ${list.map(sectionCard).join("")}`;
  });

  view.innerHTML = banner + nav + summary + uncategorised.map(sectionCard).join("") + groups.join("") +
    `<button class="add-section" data-action="add-section">+ Add section</button>`;
}

/* ---------- Section detail ---------- */

function weeklyChart(sectionIds, weeks = 8) {
  const thisWeek = startOfWeek(Date.now());
  const bars = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(thisWeek, -7 * i);
    bars.push({ label: fmtShortDate(from), value: sumSections(sectionIds, from, addDays(from, 7)) });
  }
  const max = Math.max(...bars.map((b) => b.value), 1);
  return `
    <div class="chart">
      ${bars.map((b) => `
        <div class="col">
          <div class="col-value">${b.value ? fmtDuration(b.value) : ""}</div>
          <div class="bar-track"><div class="bar" style="height:${(b.value / max) * 100}%"></div></div>
          <div class="col-label">${b.label}</div>
        </div>`).join("")}
    </div>`;
}

function renderSection(section) {
  setHeader(`${section.emoji ? section.emoji + " " : ""}${section.name}`, true);

  const run = state.running[section.id];
  const t = totals(section.id);
  const s = streaks(section.id);
  const progress = goalProgress(section);
  const dayWord = (n) => `${n} day${n === 1 ? "" : "s"}`;

  let since = "";
  if (run?.pausedAt) since = "Paused";
  else if (run?.target) since = `Countdown · ends at ${fmtTime(Date.now() + remainingMs(run))}`;
  else if (run) since = `Started at ${fmtTime(run.start)}`;

  const controls = run
    ? `<button class="timer-btn running ${run.pausedAt ? "paused" : ""}" data-toggle="${section.id}">Stop</button>
       <div class="hero-actions">
         <button class="btn" data-pause="${section.id}">${run.pausedAt ? "▶ Resume" : "⏸ Pause"}</button>
         <a class="btn" href="#/focus/${section.id}">⛶ Focus</a>
       </div>`
    : `<button class="timer-btn" data-toggle="${section.id}">Start</button>
       <div class="hero-actions">
         <button class="btn" data-action="countdown">⏳ Countdown</button>
         <a class="btn" href="#/focus/${section.id}">⛶ Focus</a>
       </div>`;

  // History grouped by the day each session started, newest first
  const sorted = sessionsFor(section.id).sort((a, b) => b.start - a.start);
  const groups = new Map();
  for (const session of sorted) {
    const key = dayKey(session.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }

  const history = [...groups.values()].map((list) => {
    const dayTotal = list.reduce((sum, x) => sum + sessionMs(x), 0);
    const rows = list.map((x) => {
      const nextDay = startOfDay(x.end) !== startOfDay(x.start) ? " (+1 day)" : "";
      const extra = [x.note && esc(x.note), x.paused >= 60000 && `paused ${fmtDuration(x.paused)}`].filter(Boolean).join(" · ");
      return `
        <div class="session" data-edit-session="${x.id}">
          <div class="times">
            ${fmtTime(x.start)} – ${fmtTime(x.end)}${nextDay}
            ${extra ? `<div class="note">${extra}</div>` : ""}
          </div>
          <div class="dur">${fmtDuration(sessionMs(x))}</div>
        </div>`;
    }).join("");
    return `
      <div class="day-group">
        <div class="day-head"><span>${fmtDayHeading(list[0].start)}</span><span>${fmtDuration(dayTotal)}</span></div>
        <div class="card">${rows}</div>
      </div>`;
  }).join("");

  view.innerHTML = `
    <div style="--accent:${section.color}">
      <div class="card hero">
        <div class="clock ${run ? "" : "idle"}" ${run ? `data-live="${section.id}"` : ""}>${run ? "" : "0:00:00"}</div>
        ${controls}
        <div class="since">${since}</div>
      </div>

      ${progress ? `
        <div class="card goal-card">
          <div class="goal-line">${goalText(progress)}</div>
          ${goalBar(progress)}
        </div>` : ""}

      <div class="stats">
        <div class="card stat"><div class="label">Today</div><div class="value">${fmtDuration(t.today)}</div></div>
        <div class="card stat"><div class="label">This week</div><div class="value">${fmtDuration(t.week)}</div></div>
        <div class="card stat"><div class="label">This month</div><div class="value">${fmtDuration(t.month)}</div></div>
        <div class="card stat"><div class="label">All time</div><div class="value">${fmtDuration(t.all)}</div></div>
        <div class="card stat"><div class="label">Current streak</div><div class="value">${s.current ? "🔥 " : ""}${dayWord(s.current)}</div></div>
        <div class="card stat"><div class="label">Best streak</div><div class="value">${dayWord(s.best)}</div></div>
      </div>

      <h3 class="sub-head">Last 8 weeks</h3>
      <div class="card chart-card">${weeklyChart([section.id])}</div>

      <div class="toolbar">
        <button class="btn" data-action="add-session">+ Add session</button>
        <button class="btn" data-action="edit-section">Edit section</button>
      </div>

      ${history || `<div class="empty">No sessions yet. Press Start!</div>`}
    </div>`;
}

/* ---------- Focus mode ---------- */

const RING_C = 2 * Math.PI * 120; // circumference of the focus ring

function renderFocus(section) {
  setHeader(section.name, true);
  const run = state.running[section.id];

  let sub = "Ready when you are";
  if (run?.pausedAt) sub = "Paused";
  else if (run?.target) sub = `Countdown · ends at ${fmtTime(Date.now() + remainingMs(run))}`;
  else if (run) sub = `Started at ${fmtTime(run.start)}`;

  const actions = run
    ? `<button class="btn big" data-pause="${section.id}">${run.pausedAt ? "▶ Resume" : "⏸ Pause"}</button>
       <button class="btn big primary" data-toggle="${section.id}">⏹ Stop</button>`
    : `<button class="btn big" data-action="countdown">⏳ Countdown</button>
       <button class="btn big primary" data-toggle="${section.id}">▶ Start</button>`;

  view.innerHTML = `
    <div class="focus" style="--accent:${section.color}">
      <div class="focus-emoji">${sectionIcon(section)}</div>
      <div class="ring-wrap">
        <svg viewBox="0 0 260 260" class="ring">
          <circle cx="130" cy="130" r="120" class="ring-track"></circle>
          <circle cx="130" cy="130" r="120" class="ring-fill" ${run ? `data-ring="${section.id}"` : ""}
            stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"></circle>
        </svg>
        <div class="focus-clock" ${run ? `data-live="${section.id}"` : ""}>${run ? "" : "0:00:00"}</div>
      </div>
      <div class="focus-sub">${sub}</div>
      <div class="focus-actions">${actions}</div>
      <p class="hint">The screen stays on while you're here.</p>
    </div>`;
}

/* ---------- Stats ---------- */

function changeBadge(now, before) {
  if (!before) return now ? `<span class="change up">new</span>` : `<span class="change">—</span>`;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return `<span class="change">±0%</span>`;
  return `<span class="change ${pct > 0 ? "up" : "down"}">${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%</span>`;
}

function renderStats() {
  setHeader("Stats", true);
  if (!state.sections.length) {
    view.innerHTML = `<div class="empty">Add a section and log some time to see stats.</div>`;
    return;
  }

  const now = Date.now();
  const ids = state.sections.map((s) => s.id);
  const weekStart = startOfWeek(now);
  const lastWeekStart = addDays(weekStart, -7);
  // Compare this week so far with the same days of last week
  const sameTimeLastWeek = now - 7 * DAY_MS;
  const thisWeek = sumSections(ids, weekStart, Infinity);
  const lastWeekSoFar = sumSections(ids, lastWeekStart, sameTimeLastWeek);
  const lastWeekFull = sumSections(ids, lastWeekStart, weekStart);

  // Last 7 days, stacked by section
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const from = addDays(startOfDay(now), -i);
    const parts = state.sections.map((s) => ({ s, ms: totalBetween(s.id, from, addDays(from, 1)) })).filter((p) => p.ms > 0);
    days.push({ from, parts, total: parts.reduce((sum, p) => sum + p.ms, 0) });
  }
  const maxDay = Math.max(...days.map((d) => d.total), 1);
  const chart = `
    <div class="chart">
      ${days.map((d) => `
        <div class="col">
          <div class="col-value">${d.total ? fmtDuration(d.total) : ""}</div>
          <div class="bar-track"><div class="stack" style="height:${(d.total / maxDay) * 100}%">
            ${d.parts.map((p) => `<div style="flex:${p.ms};background:${p.s.color}"></div>`).join("")}
          </div></div>
          <div class="col-label">${new Date(d.from).toLocaleDateString([], { weekday: "narrow" })}</div>
        </div>`).join("")}
    </div>
    <div class="legend">${state.sections.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;

  // This week vs last week, per section
  const rows = state.sections.map((s) => {
    const a = totalBetween(s.id, weekStart, Infinity);
    const b = totalBetween(s.id, lastWeekStart, weekStart);
    return { s, a, b };
  }).sort((x, y) => y.a - x.a);
  const table = rows.map(({ s, a, b }) => `
    <div class="stat-row">
      <span class="stat-name">${sectionLabel(s)}</span>
      <span class="stat-num">${fmtDuration(a)}</span>
      <span class="stat-num muted">${fmtDuration(b)}</span>
    </div>`).join("");

  const cats = categories();
  const catRows = cats.map((cat) => {
    const catIds = state.sections.filter((s) => s.category === cat).map((s) => s.id);
    return `
      <div class="stat-row">
        <span class="stat-name">${esc(cat)}</span>
        <span class="stat-num">${fmtDuration(sumSections(catIds, weekStart, Infinity))}</span>
        <span class="stat-num muted">${fmtDuration(sumSections(catIds, lastWeekStart, weekStart))}</span>
      </div>`;
  }).join("");

  // All-time insights
  const all = state.sessions.filter((x) => getSection(x.sectionId));
  const totalAll = all.reduce((sum, x) => sum + sessionMs(x), 0);
  const longest = all.reduce((best, x) => (!best || sessionMs(x) > sessionMs(best) ? x : best), null);
  const byWeekday = Array(7).fill(0);
  const byTime = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  for (const x of all) {
    const d = new Date(x.start);
    byWeekday[d.getDay()] += sessionMs(x);
    const h = d.getHours();
    byTime[h >= 5 && h < 12 ? "Morning" : h >= 12 && h < 17 ? "Afternoon" : h >= 17 && h < 21 ? "Evening" : "Night"] += sessionMs(x);
  }
  const topDay = byWeekday.indexOf(Math.max(...byWeekday));
  const topTime = Object.entries(byTime).sort((a, b) => b[1] - a[1])[0][0];
  const weekdayName = new Date(2024, 0, 7 + topDay).toLocaleDateString([], { weekday: "long" }); // 7 Jan 2024 was a Sunday

  view.innerHTML = `
    <div class="stats">
      <div class="card stat"><div class="label">This week</div><div class="value">${fmtDuration(thisWeek)}</div>
        <div class="label">${changeBadge(thisWeek, lastWeekSoFar)} vs this point last week</div></div>
      <div class="card stat"><div class="label">Last week</div><div class="value">${fmtDuration(lastWeekFull)}</div></div>
    </div>

    <h3 class="sub-head">Last 7 days</h3>
    <div class="card chart-card">${chart}</div>

    <h3 class="sub-head">By section</h3>
    <div class="card list-card">
      <div class="stat-row head"><span class="stat-name"></span><span class="stat-num">This week</span><span class="stat-num">Last week</span></div>
      ${table}
    </div>

    ${cats.length ? `
      <h3 class="sub-head">By category</h3>
      <div class="card list-card">
        <div class="stat-row head"><span class="stat-name"></span><span class="stat-num">This week</span><span class="stat-num">Last week</span></div>
        ${catRows}
      </div>` : ""}

    <h3 class="sub-head">All time</h3>
    ${all.length ? `
      <div class="stats">
        <div class="card stat"><div class="label">Total</div><div class="value">${fmtDuration(totalAll)}</div></div>
        <div class="card stat"><div class="label">Sessions</div><div class="value">${all.length}</div></div>
        <div class="card stat"><div class="label">Average session</div><div class="value">${fmtDuration(totalAll / all.length)}</div></div>
        <div class="card stat"><div class="label">Longest session</div><div class="value">${fmtDuration(sessionMs(longest))}</div>
          <div class="label">${sectionLabel(getSection(longest.sectionId))}</div></div>
        <div class="card stat"><div class="label">Most active day</div><div class="value">${weekdayName}</div></div>
        <div class="card stat"><div class="label">Favourite time</div><div class="value">${topTime}</div></div>
      </div>` : `<div class="empty">No sessions yet.</div>`}`;
}

/* ---------- Stopwatch (not tied to a section) ---------- */

function renderStopwatch() {
  setHeader("Stopwatch", true);
  const sw = state.stopwatch;
  const laps = sw?.laps || [];

  let actions = `<button class="btn big primary" data-action="sw-start">▶ Start</button>`;
  if (sw && !sw.pausedAt) {
    actions = `<button class="btn big" data-action="sw-lap">Lap</button>
               <button class="btn big primary" data-action="sw-pause">⏸ Pause</button>`;
  } else if (sw) {
    actions = `<button class="btn big" data-action="sw-reset">Reset</button>
               <button class="btn big primary" data-action="sw-resume">▶ Resume</button>`;
  }

  const lapRows = laps.map((lap, i) => `
    <div class="stat-row">
      <span class="stat-name">Lap ${i + 1}</span>
      <span class="stat-num">${fmtStopwatch(lap - (laps[i - 1] || 0))}</span>
      <span class="stat-num muted">${fmtStopwatch(lap)}</span>
    </div>`).reverse().join("");

  const saveRow = sw?.pausedAt && state.sections.length ? `
    <div class="card save-card">
      <div class="field-label">Save this time to a section</div>
      <div class="row">
        <select id="swSection">${state.sections.map((s) => `<option value="${s.id}">${sectionLabel(s)}</option>`).join("")}</select>
        <button class="btn primary" data-action="sw-save">Save</button>
      </div>
    </div>` : "";

  view.innerHTML = `
    <div class="focus" style="--accent:var(--primary)">
      <div class="stopwatch-clock" data-stopwatch>${fmtStopwatch(sw ? activeMs(sw) : 0)}</div>
      <div class="focus-actions">${actions}</div>
    </div>
    ${saveRow}
    ${laps.length ? `<div class="card list-card">${lapRows}</div>` : ""}`;
}

function stopwatchAction(action) {
  const now = Date.now();
  const sw = state.stopwatch;
  if (action === "sw-start") state.stopwatch = { start: now, pausedMs: 0, pausedAt: null, laps: [] };
  if (action === "sw-pause" && sw) sw.pausedAt = now;
  if (action === "sw-resume" && sw?.pausedAt) {
    sw.pausedMs += now - sw.pausedAt;
    sw.pausedAt = null;
  }
  if (action === "sw-lap" && sw) sw.laps.push(activeMs(sw, now));
  if (action === "sw-reset") state.stopwatch = null;
  if (action === "sw-save" && sw) {
    const sectionId = $("#swSection").value;
    const session = { id: uid(), sectionId, start: sw.start, end: sw.pausedAt ?? now, paused: sw.pausedMs, note: "" };
    if (sessionMs(session) < MIN_SESSION_MS) return toast("Too short to save");
    state.sessions.push(session);
    state.stopwatch = null;
    toast(`Saved ${fmtDuration(sessionMs(session))} to ${getSection(sectionId).name}`);
  }
  navigator.vibrate?.(20);
  save();
  render();
}

/* ---------- Live updates ---------- */

// Updates only the running clocks, not the whole page
function updateLive() {
  const now = Date.now();
  document.querySelectorAll("[data-live]").forEach((el) => {
    const run = state.running[el.dataset.live];
    if (!run) return;
    const clock = run.target ? fmtClock(remainingMs(run, now)) : fmtClock(activeMs(run, now));
    // The small label on home cards gets an icon; the big clocks don't
    const icon = el.classList.contains("live") ? (run.pausedAt ? "⏸ " : run.target ? "⏳ " : "") : "";
    el.textContent = icon + clock + (icon && run.target ? " left" : "");
  });
  document.querySelectorAll("[data-ring]").forEach((el) => {
    const run = state.running[el.dataset.ring];
    if (!run) return;
    const active = activeMs(run, now);
    // Countdown: fills up to the target. Normal timer: sweeps once a minute.
    const progress = run.target ? Math.min(1, active / run.target) : (active % 60000) / 60000;
    el.setAttribute("stroke-dashoffset", RING_C * (1 - progress));
  });
  const sw = $("[data-stopwatch]");
  if (sw && state.stopwatch) sw.textContent = fmtStopwatch(activeMs(state.stopwatch, now));
}

setInterval(() => {
  updateLive();
  checkCountdowns();
  checkReminder();
  // Refresh totals every 30s while something is running (skip if a dialog is open)
  const anyActive = Object.values(state.running).some((run) => !run.pausedAt);
  if (anyActive && !document.querySelector("dialog[open]") && Date.now() - lastFullRender > 30000) render();
}, 200);

// When you come back to the app, refresh everything (also picks up a new day)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    render();
    syncNotifications();
  }
});

/* =========================================================
   Clicks
   ========================================================= */

view.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-toggle]");
  if (toggle) return toggleTimer(toggle.dataset.toggle);

  const pause = e.target.closest("[data-pause]");
  if (pause) return togglePause(pause.dataset.pause);

  const open = e.target.closest("[data-open]");
  if (open) return (location.hash = `#/s/${open.dataset.open}`);

  const editSession = e.target.closest("[data-edit-session]");
  if (editSession) return openSessionDialog(editSession.dataset.editSession);

  const action = e.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "add-section") openSectionDialog();
  if (action === "edit-section") openSectionDialog(currentRoute().id);
  if (action === "add-session") openSessionDialog();
  if (action === "countdown") openCountdownDialog(currentRoute().id);
  if (action === "backup") exportBackup();
  if (action.startsWith("sw-")) stopwatchAction(action);
});

$("#backBtn").addEventListener("click", () => {
  const { page, id } = currentRoute();
  location.hash = page === "focus" ? `#/s/${id}` : "";
});
window.addEventListener("hashchange", render);

// Any [data-close] button closes its dialog; tapping the dark backdrop does too
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
  });
});

/* =========================================================
   Section dialog
   ========================================================= */

const sectionDialog = $("#sectionDialog");
const sectionForm = $("#sectionForm");
let editingSectionId = null;
let chosenColor = COLORS[0];

function drawSwatches() {
  $("#swatchList").innerHTML = COLORS.map((c) =>
    `<button type="button" class="swatch ${c === chosenColor ? "selected" : ""}" style="background:${c}" data-color="${c}" aria-label="Colour ${c}"></button>`
  ).join("");
  // The rainbow circle turns into the chosen colour when it's a custom one
  const custom = !COLORS.includes(chosenColor);
  $("#customSwatch").classList.toggle("selected", custom);
  $("#customSwatch").style.background = custom ? chosenColor : "";
  $("#customColor").value = chosenColor;
}

$("#swatchList").addEventListener("click", (e) => {
  const swatch = e.target.closest("[data-color]");
  if (!swatch) return;
  chosenColor = swatch.dataset.color;
  drawSwatches();
});

$("#customColor").addEventListener("input", (e) => {
  chosenColor = e.target.value;
  drawSwatches();
});

$("#emojiPicks").innerHTML = EMOJI_PICKS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join("");
$("#emojiPicks").addEventListener("click", (e) => {
  const pick = e.target.closest("[data-emoji]");
  if (pick) sectionForm.emoji.value = pick.dataset.emoji;
});

sectionForm.goalPeriod.addEventListener("change", () => {
  sectionForm.goalMinutes.disabled = sectionForm.goalPeriod.value === "none";
});

function updateMoveButtons() {
  const index = state.sections.findIndex((s) => s.id === editingSectionId);
  $("#positionRow").hidden = index === -1 || state.sections.length < 2;
  $("#moveUpBtn").disabled = index <= 0;
  $("#moveDownBtn").disabled = index === state.sections.length - 1;
}

// Moves straight away (no need to press Save), so you can see it behind the dialog
function moveSection(step) {
  const list = state.sections;
  const from = list.findIndex((s) => s.id === editingSectionId);
  const to = from + step;
  if (from === -1 || to < 0 || to >= list.length) return;
  [list[from], list[to]] = [list[to], list[from]];
  save();
  render();
  updateMoveButtons();
}
$("#moveUpBtn").addEventListener("click", () => moveSection(-1));
$("#moveDownBtn").addEventListener("click", () => moveSection(1));

function openSectionDialog(id = null) {
  editingSectionId = id;
  const section = id && getSection(id);
  sectionForm.reset();
  sectionForm.name.value = section ? section.name : "";
  sectionForm.emoji.value = section ? section.emoji : "";
  sectionForm.category.value = section?.category || "";
  sectionForm.goalPeriod.value = section?.goal?.period || "none";
  sectionForm.goalMinutes.value = section?.goal?.minutes || 30;
  sectionForm.goalMinutes.disabled = !section?.goal;
  $("#categoryList").innerHTML = categories().map((c) => `<option value="${esc(c)}"></option>`).join("");
  chosenColor = section ? section.color : COLORS[state.sections.length % COLORS.length];
  $("#sectionDialogTitle").textContent = section ? "Edit section" : "New section";
  $("#deleteSectionBtn").hidden = !section;
  drawSwatches();
  updateMoveButtons();
  sectionDialog.showModal();
}

sectionForm.addEventListener("submit", () => {
  const name = sectionForm.name.value.trim();
  if (!name) return;
  const minutes = Math.round(Number(sectionForm.goalMinutes.value));
  const period = sectionForm.goalPeriod.value;
  const fields = {
    name,
    emoji: sectionForm.emoji.value.trim(),
    color: chosenColor,
    category: sectionForm.category.value.trim(),
    goal: period !== "none" && minutes > 0 ? { period, minutes } : null,
  };
  const existing = editingSectionId && getSection(editingSectionId);
  if (existing) Object.assign(existing, fields);
  else state.sections.push({ id: uid(), createdAt: Date.now(), ...fields });
  save();
  render();
  syncNotifications();
});

$("#deleteSectionBtn").addEventListener("click", () => {
  const section = getSection(editingSectionId);
  if (!section) return;
  const count = sessionsFor(section.id).length;
  if (!confirm(`Delete "${section.name}" and its ${count} session${count === 1 ? "" : "s"}? This can't be undone.`)) return;
  state.sections = state.sections.filter((s) => s.id !== section.id);
  state.sessions = state.sessions.filter((s) => s.sectionId !== section.id);
  delete state.running[section.id];
  save();
  sectionDialog.close();
  location.hash = "";
  render();
  syncNotifications();
});

/* =========================================================
   Countdown dialog
   ========================================================= */

const countdownDialog = $("#countdownDialog");
let countdownSectionId = null;

$("#countdownPresets").innerHTML = COUNTDOWN_PRESETS.map((m) => `<button type="button" class="btn" data-minutes="${m}">${m < 60 ? `${m}m` : fmtDuration(m * 60000)}</button>`).join("");

function openCountdownDialog(sectionId) {
  countdownSectionId = sectionId;
  $("#countdownForm").reset();
  countdownDialog.showModal();
}

function startCountdown(minutes) {
  if (!(minutes > 0)) return;
  countdownDialog.close();
  unlockAudio();
  navigator.vibrate?.(30);
  startTimer(countdownSectionId, minutes);
}

$("#countdownPresets").addEventListener("click", (e) => {
  const preset = e.target.closest("[data-minutes]");
  if (preset) startCountdown(Number(preset.dataset.minutes));
});

$("#countdownForm").addEventListener("submit", (e) => {
  e.preventDefault();
  startCountdown(Math.round(Number($("#countdownForm").minutes.value)));
});

/* =========================================================
   Session dialog (add by hand / edit)
   ========================================================= */

const sessionDialog = $("#sessionDialog");
const sessionForm = $("#sessionForm");
let editingSessionId = null;

// Turns the form fields into start/end timestamps. If end is before start, it ends the next day.
function readSessionForm() {
  const { date, start, end } = sessionForm;
  if (!date.value || !start.value || !end.value) return null;
  const [y, m, d] = date.value.split("-").map(Number);
  const [sh, sm] = start.value.split(":").map(Number);
  const [eh, em] = end.value.split(":").map(Number);
  const startTs = new Date(y, m - 1, d, sh, sm).getTime();
  let endTs = new Date(y, m - 1, d, eh, em).getTime();
  if (endTs <= startTs) endTs = new Date(y, m - 1, d + 1, eh, em).getTime();
  return { start: startTs, end: endTs };
}

function editingSession() {
  return editingSessionId && state.sessions.find((s) => s.id === editingSessionId);
}

// True if the date/time fields still match the session being edited
function timesUnchanged(session) {
  return (
    toDateInput(session.start) === sessionForm.date.value &&
    toTimeInput(session.start) === sessionForm.start.value &&
    toTimeInput(session.end) === sessionForm.end.value
  );
}

function updateSessionHint() {
  const times = readSessionForm();
  if (!times) return ($("#sessionHint").textContent = "");
  const existing = editingSession();
  const keepsPause = existing && timesUnchanged(existing) && existing.paused >= 60000;
  const duration = times.end - times.start - (keepsPause ? existing.paused : 0);
  const nextDay = startOfDay(times.end) !== startOfDay(times.start) ? " (ends next day)" : "";
  const pauseNote = keepsPause ? ` (not counting ${fmtDuration(existing.paused)} paused)` : "";
  $("#sessionHint").textContent = `Duration: ${fmtDuration(duration)}${nextDay}${pauseNote}`;
}
sessionForm.addEventListener("input", updateSessionHint);

function openSessionDialog(id = null, warning = "") {
  editingSessionId = id;
  const session = editingSession();
  sessionForm.reset();
  if (session) {
    sessionForm.date.value = toDateInput(session.start);
    sessionForm.start.value = toTimeInput(session.start);
    sessionForm.end.value = toTimeInput(session.end);
    sessionForm.note.value = session.note || "";
  } else {
    // Default: a session that ended just now and lasted 30 minutes
    const now = Date.now();
    sessionForm.date.value = toDateInput(now - 30 * 60000);
    sessionForm.start.value = toTimeInput(now - 30 * 60000);
    sessionForm.end.value = toTimeInput(now);
  }
  $("#sessionDialogTitle").textContent = warning ? "Forgot to stop?" : session ? "Edit session" : "Add session";
  $("#sessionWarn").textContent = warning;
  $("#sessionWarn").hidden = !warning;
  $("#deleteSessionBtn").hidden = !session;
  updateSessionHint();
  sessionDialog.showModal();
}

sessionForm.addEventListener("submit", () => {
  const times = readSessionForm();
  if (!times) return;
  const note = sessionForm.note.value.trim();
  const existing = editingSession();
  if (existing) {
    // Keep the exact seconds and paused time if the times weren't changed
    if (!timesUnchanged(existing)) Object.assign(existing, times, { paused: 0 });
    existing.note = note;
  } else {
    state.sessions.push({ id: uid(), sectionId: currentRoute().id, ...times, paused: 0, note });
    toast(`Added ${fmtDuration(times.end - times.start)}`);
  }
  save();
  render();
});

$("#deleteSessionBtn").addEventListener("click", () => {
  const session = editingSession();
  if (!session) return;
  state.sessions = state.sessions.filter((s) => s !== session);
  save();
  sessionDialog.close();
  render();
  toast("Session deleted", () => {
    state.sessions.push(session);
    save();
    render();
  });
});

/* =========================================================
   Menu
   ========================================================= */

$("#menuBtn").addEventListener("click", () => {
  drawMenu();
  $("#menuDialog").showModal();
});

function drawMenu() {
  document.querySelectorAll("[data-theme-choice]").forEach((b) =>
    b.classList.toggle("selected", b.dataset.themeChoice === settings.theme)
  );
  const granted = notificationsSupported && Notification.permission === "granted";
  $("#notifyBtn").textContent = `🔔 Running-timer notification: ${settings.notify && granted ? "On" : "Off"}`;
  $("#reminderBtn").textContent = `🎯 Daily goal reminder: ${settings.reminderOn ? "On" : "Off"}`;
  $("#reminderTime").value = settings.reminderTime;
  $("#reminderTimeRow").hidden = !settings.reminderOn;
  $("#notifyBtn").disabled = !notificationsSupported;

  let hint = "Shows a notification while a timer is running, with a Stop button (Android).";
  if (!notificationsSupported) hint = "Notifications aren't available here. On iPhone, open the app from your home screen icon.";
  else if (Notification.permission === "denied") hint = "Notifications are blocked. Allow them for this site in your phone's settings.";
  $("#notifyHint").textContent = hint;
}

/* ---------- Theme ---------- */

function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  // Colour of the phone's status bar
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]').content = bg;
}

$("#themePicker").addEventListener("click", (e) => {
  const choice = e.target.closest("[data-theme-choice]")?.dataset.themeChoice;
  if (!choice) return;
  settings.theme = choice;
  saveSettings();
  applyTheme();
  drawMenu();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

/* ---------- Notifications & reminder ---------- */

$("#notifyBtn").addEventListener("click", async () => {
  if (settings.notify) {
    settings.notify = false;
  } else {
    settings.notify = await ensureNotificationPermission();
    if (!settings.notify) toast("Notifications weren't allowed");
  }
  saveSettings();
  drawMenu();
  syncNotifications();
});

$("#reminderBtn").addEventListener("click", async () => {
  settings.reminderOn = !settings.reminderOn;
  if (settings.reminderOn) {
    // Don't fire straight away for today if it's already past the time
    settings.lastReminded = null;
    await ensureNotificationPermission();
    if (!state.sections.some((s) => s.goal?.period === "day")) toast("Tip: set a daily goal in Edit section");
  }
  saveSettings();
  drawMenu();
});

$("#reminderTime").addEventListener("change", (e) => {
  settings.reminderTime = e.target.value || "18:30";
  settings.lastReminded = null;
  saveSettings();
});

/* ---------- Backup ---------- */

async function exportBackup() {
  const json = JSON.stringify({ app: "hourstracker", version: 3, exportedAt: Date.now(), ...state }, null, 2);
  const name = `stint-backup-${dayKey(Date.now())}.json`;
  const file = new File([json], name, { type: "application/json" });
  try {
    // On phones, the share sheet lets you save straight to Google Drive / iCloud / email
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Stint backup" });
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
    }
  } catch (err) {
    if (err.name === "AbortError") return; // closed the share sheet
    throw err;
  }
  settings.lastBackup = Date.now();
  saveSettings();
  toast("Backup saved");
  render();
}

$("#exportBtn").addEventListener("click", exportBackup);

$("#importBtn").addEventListener("click", () => $("#importFile").click());

$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sections) || !Array.isArray(data.sessions)) throw new Error("bad file");
    if (!confirm(`Replace everything on this device with this backup (${data.sections.length} sections, ${data.sessions.length} sessions)?`)) return;
    state = migrate({ sections: data.sections, sessions: data.sessions, running: data.running || {}, stopwatch: data.stopwatch || null });
    save();
    $("#menuDialog").close();
    location.hash = "";
    render();
    syncNotifications();
    toast("Backup restored");
  } catch {
    alert("That doesn't look like a Stint backup file.");
  }
});

/* =========================================================
   Toast (with optional Undo button)
   ========================================================= */

let toastTimer;
let toastUndo = null;

function toast(message, undo = null) {
  const el = $("#toast");
  $("#toastMsg").textContent = message;
  $("#toastUndo").hidden = !undo;
  toastUndo = undo;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 5000 : 3000);
}

function hideToast() {
  $("#toast").hidden = true;
  toastUndo = null;
}

$("#toastUndo").addEventListener("click", () => {
  const undo = toastUndo;
  hideToast();
  undo?.();
});

/* =========================================================
   Start up
   ========================================================= */

applyTheme();
checkCountdowns();
render();
handleStopFromUrl();

// Ask the browser not to clear our data when space is low
navigator.storage?.persist?.();

// Offline support (skipped on this computer while developing, so edits show up straight away)
if ("serviceWorker" in navigator) {
  if (location.hostname === "localhost") {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  } else {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").then(syncNotifications));
    // When a new version is published, reload once so you're on it (unless you're mid-edit)
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!document.querySelector("dialog[open]")) location.reload();
      });
    }
  }
}
