"use strict";

/* =========================================================
   Data
   ========================================================= */

const STORAGE_KEY = "hourstracker:v1";
const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#84cc16", "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#64748b"];
const MIN_SESSION_MS = 3000; // taps shorter than this are treated as accidental

let state = load();

function emptyState() {
  return { sections: [], sessions: [], running: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
   Stats
   ========================================================= */

// All sessions for a section, including a running timer as if it ended now
function sessionsWithLive(sectionId, now = Date.now()) {
  const list = sessionsFor(sectionId);
  const runningStart = state.running[sectionId];
  if (runningStart) list.push({ start: runningStart, end: now });
  return list;
}

// Time inside [from, to). Sessions that cross the boundary only count the part inside.
function totalBetween(sectionId, from, to, now = Date.now()) {
  let total = 0;
  for (const s of sessionsWithLive(sectionId, now)) {
    const overlap = Math.min(s.end, to) - Math.max(s.start, from);
    if (overlap > 0) total += overlap;
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

/* =========================================================
   Timer actions
   ========================================================= */

function startTimer(sectionId) {
  state.running[sectionId] = Date.now();
  save();
  render();
}

function stopTimer(sectionId) {
  const start = state.running[sectionId];
  if (!start) return;
  const end = Date.now();
  delete state.running[sectionId];
  if (end - start < MIN_SESSION_MS) {
    toast("Too short — not saved");
  } else {
    state.sessions.push({ id: uid(), sectionId, start, end, note: "" });
    toast(`Logged ${fmtDuration(end - start)}`);
  }
  save();
  render();
}

function toggleTimer(sectionId) {
  if (state.running[sectionId]) stopTimer(sectionId);
  else startTimer(sectionId);
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

function currentRoute() {
  const match = location.hash.match(/^#\/s\/(.+)$/);
  return match ? { page: "section", id: match[1] } : { page: "home" };
}

function render() {
  const route = currentRoute();
  const section = route.page === "section" && getSection(route.id);
  if (section) renderSection(section);
  else renderHome();
  updateLive();
}

function renderHome() {
  $("#title").textContent = "Hours Tracker";
  $("#backBtn").hidden = true;
  document.title = "Hours Tracker";

  if (!state.sections.length) {
    view.innerHTML = `
      <div class="empty">
        <div class="big">⏱️</div>
        <p>No sections yet.<br>Add one for each activity you want to track.</p>
      </div>
      <button class="add-section" data-action="add-section">+ Add section</button>`;
    return;
  }

  const cards = state.sections.map((section) => {
    const running = state.running[section.id];
    const t = totals(section.id);
    const { current } = streaks(section.id);
    const streakText = current ? ` · <span class="nowrap">🔥 ${current}</span>` : "";
    const meta = running
      ? `<span class="live" data-since="${running}"></span> · Today ${fmtDuration(t.today)}`
      : `Today ${fmtDuration(t.today)} · Week ${fmtDuration(t.week)}${streakText}`;
    return `
      <div class="card section-card" style="--accent:${section.color}" data-open="${section.id}">
        <div class="emoji">${sectionIcon(section)}</div>
        <div class="info">
          <div class="name">${esc(section.name)}</div>
          <div class="meta">${meta}</div>
        </div>
        <button class="timer-btn ${running ? "running" : ""}" data-toggle="${section.id}">
          ${running ? "Stop" : "Start"}
        </button>
      </div>`;
  });

  view.innerHTML = cards.join("") + `<button class="add-section" data-action="add-section">+ Add section</button>`;
}

function renderSection(section) {
  $("#title").textContent = `${section.emoji ? section.emoji + " " : ""}${section.name}`;
  $("#backBtn").hidden = false;
  document.title = `${section.name} · Hours Tracker`;

  const running = state.running[section.id];
  const t = totals(section.id);
  const s = streaks(section.id);
  const dayWord = (n) => `${n} day${n === 1 ? "" : "s"}`;

  // History grouped by the day each session started, newest first
  const sorted = sessionsFor(section.id).sort((a, b) => b.start - a.start);
  const groups = new Map();
  for (const session of sorted) {
    const key = dayKey(session.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }

  const history = [...groups.values()].map((list) => {
    const dayTotal = list.reduce((sum, x) => sum + (x.end - x.start), 0);
    const rows = list.map((x) => {
      const nextDay = startOfDay(x.end) !== startOfDay(x.start) ? " (+1 day)" : "";
      return `
        <div class="session" data-edit-session="${x.id}">
          <div class="times">
            ${fmtTime(x.start)} – ${fmtTime(x.end)}${nextDay}
            ${x.note ? `<div class="note">${esc(x.note)}</div>` : ""}
          </div>
          <div class="dur">${fmtDuration(x.end - x.start)}</div>
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
        <div class="clock ${running ? "" : "idle"}" ${running ? `data-since="${running}"` : ""}>${running ? "" : "0:00:00"}</div>
        <button class="timer-btn ${running ? "running" : ""}" data-toggle="${section.id}">${running ? "Stop" : "Start"}</button>
        <div class="since">${running ? `Started at ${fmtTime(running)}` : ""}</div>
      </div>

      <div class="stats">
        <div class="card stat"><div class="label">Today</div><div class="value">${fmtDuration(t.today)}</div></div>
        <div class="card stat"><div class="label">This week</div><div class="value">${fmtDuration(t.week)}</div></div>
        <div class="card stat"><div class="label">This month</div><div class="value">${fmtDuration(t.month)}</div></div>
        <div class="card stat"><div class="label">All time</div><div class="value">${fmtDuration(t.all)}</div></div>
        <div class="card stat"><div class="label">Current streak</div><div class="value">${s.current ? "🔥 " : ""}${dayWord(s.current)}</div></div>
        <div class="card stat"><div class="label">Best streak</div><div class="value">${dayWord(s.best)}</div></div>
      </div>

      <div class="toolbar">
        <button class="btn" data-action="add-session">+ Add session</button>
        <button class="btn" data-action="edit-section">Edit section</button>
      </div>

      ${history || `<div class="empty">No sessions yet. Press Start!</div>`}
    </div>`;
}

// Ticks every second: only updates the running clocks, not the whole page
function updateLive() {
  const now = Date.now();
  document.querySelectorAll("[data-since]").forEach((el) => {
    el.textContent = fmtClock(now - Number(el.dataset.since));
  });
}

let lastFullRender = Date.now();
setInterval(() => {
  updateLive();
  // Refresh totals every 30s while something is running (skip if a dialog is open)
  const dialogOpen = document.querySelector("dialog[open]");
  if (Object.keys(state.running).length && !dialogOpen && Date.now() - lastFullRender > 30000) {
    lastFullRender = Date.now();
    render();
  }
}, 1000);

// When you come back to the app, refresh everything (also picks up a new day)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") render();
});

/* =========================================================
   Clicks
   ========================================================= */

view.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-toggle]");
  if (toggle) return toggleTimer(toggle.dataset.toggle);

  const open = e.target.closest("[data-open]");
  if (open) return (location.hash = `#/s/${open.dataset.open}`);

  const editSession = e.target.closest("[data-edit-session]");
  if (editSession) return openSessionDialog(editSession.dataset.editSession);

  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "add-section") openSectionDialog();
  if (action === "edit-section") openSectionDialog(currentRoute().id);
  if (action === "add-session") openSessionDialog();
});

$("#backBtn").addEventListener("click", () => {
  location.hash = "";
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
  $("#swatches").innerHTML = COLORS.map((c) =>
    `<button type="button" class="swatch ${c === chosenColor ? "selected" : ""}" style="background:${c}" data-color="${c}" aria-label="Colour ${c}"></button>`
  ).join("");
}

$("#swatches").addEventListener("click", (e) => {
  const swatch = e.target.closest("[data-color]");
  if (!swatch) return;
  chosenColor = swatch.dataset.color;
  drawSwatches();
});

function openSectionDialog(id = null) {
  editingSectionId = id;
  const section = id && getSection(id);
  sectionForm.reset();
  sectionForm.name.value = section ? section.name : "";
  sectionForm.emoji.value = section ? section.emoji : "";
  chosenColor = section ? section.color : COLORS[state.sections.length % COLORS.length];
  $("#sectionDialogTitle").textContent = section ? "Edit section" : "New section";
  $("#deleteSectionBtn").hidden = !section;
  drawSwatches();
  sectionDialog.showModal();
}

sectionForm.addEventListener("submit", () => {
  const name = sectionForm.name.value.trim();
  const emoji = sectionForm.emoji.value.trim();
  if (!name) return;
  const existing = editingSectionId && getSection(editingSectionId);
  if (existing) {
    Object.assign(existing, { name, emoji, color: chosenColor });
  } else {
    state.sections.push({ id: uid(), name, emoji, color: chosenColor, createdAt: Date.now() });
  }
  save();
  render();
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

function updateSessionHint() {
  const times = readSessionForm();
  if (!times) return ($("#sessionHint").textContent = "");
  const nextDay = startOfDay(times.end) !== startOfDay(times.start) ? " (ends next day)" : "";
  $("#sessionHint").textContent = `Duration: ${fmtDuration(times.end - times.start)}${nextDay}`;
}
sessionForm.addEventListener("input", updateSessionHint);

function openSessionDialog(id = null) {
  editingSessionId = id;
  const session = id && state.sessions.find((s) => s.id === id);
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
  $("#sessionDialogTitle").textContent = session ? "Edit session" : "Add session";
  $("#deleteSessionBtn").hidden = !session;
  updateSessionHint();
  sessionDialog.showModal();
}

sessionForm.addEventListener("submit", () => {
  const times = readSessionForm();
  if (!times) return;
  const note = sessionForm.note.value.trim();
  const existing = editingSessionId && state.sessions.find((s) => s.id === editingSessionId);
  if (existing) {
    // Keep the exact seconds if the times weren't changed
    const unchanged =
      toDateInput(existing.start) === sessionForm.date.value &&
      toTimeInput(existing.start) === sessionForm.start.value &&
      toTimeInput(existing.end) === sessionForm.end.value;
    if (!unchanged) Object.assign(existing, times);
    existing.note = note;
  } else {
    state.sessions.push({ id: uid(), sectionId: currentRoute().id, ...times, note });
    toast(`Added ${fmtDuration(times.end - times.start)}`);
  }
  save();
  render();
});

$("#deleteSessionBtn").addEventListener("click", () => {
  if (!confirm("Delete this session?")) return;
  state.sessions = state.sessions.filter((s) => s.id !== editingSessionId);
  save();
  sessionDialog.close();
  render();
});

/* =========================================================
   Menu: backup export / import
   ========================================================= */

$("#menuBtn").addEventListener("click", () => $("#menuDialog").showModal());

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ app: "hourstracker", version: 1, exportedAt: Date.now(), ...state }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `hours-backup-${dayKey(Date.now())}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Backup downloaded");
});

$("#importBtn").addEventListener("click", () => $("#importFile").click());

$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sections) || !Array.isArray(data.sessions)) throw new Error("bad file");
    if (!confirm(`Replace everything on this device with this backup (${data.sections.length} sections, ${data.sessions.length} sessions)?`)) return;
    state = { sections: data.sections, sessions: data.sessions, running: data.running || {} };
    save();
    $("#menuDialog").close();
    location.hash = "";
    render();
    toast("Backup restored");
  } catch {
    alert("That doesn't look like a Hours Tracker backup file.");
  }
});

/* =========================================================
   Toast
   ========================================================= */

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2200);
}

/* =========================================================
   Start up
   ========================================================= */

render();

// Ask the browser not to clear our data when space is low
navigator.storage?.persist?.();

// Offline support (skipped on this computer while developing, so edits show up straight away)
if ("serviceWorker" in navigator) {
  if (location.hostname === "localhost") {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  } else {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
  }
}
