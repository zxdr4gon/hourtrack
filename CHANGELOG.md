# Changelog

Newest first. Each entry lists the release date, the `CACHE_VERSION` it shipped with in `sw.js`,
what changed, which files were touched, and anything to watch out for.

---

## v4.3.0 — 2026-11-02 (regal indigo icon)
**Cache version:** `v4.3`

Changed
- App icon is now "regal indigo": a diagonal gradient from `#3730a3` (top-left) to `#1e1b4b` (bottom-right)
  behind the same white stopwatch. Manifest `theme_color` is now `#1e1b4b`.
- The icons are drawn by a small pure-Python script (no image libraries). Colours used: top `#3730a3`, bottom `#1e1b4b`.

Notes
- Phones cache home-screen icons. On iPhone, remove Stint from the home screen and add it again to see the new
  icon. On Android it usually updates on its own within a day; reinstalling forces it.

**Files:** `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`, `manifest.webmanifest`, `sw.js`, `CHANGELOG.md`

---

## v4.2.0 — 2026-11-02 (Midnight Indigo theme)
**Cache version:** `v4.2`

Changed
- **Dark mode is now "Midnight Indigo":** deep navy-indigo background with a faint violet glow at the top,
  indigo cards, lavender-grey secondary text, soft violet (`#c084fc`) buttons with dark text.
- Light mode's accent is now violet (`#6d28d9`) to match.
- **Font: Manrope** (Google Fonts). The service worker saves it the first time it loads, so it works offline.
- The top bar is see-through with a blur.
- First default section colour is violet instead of indigo.
- Colours are tokens in `style.css` `:root` (new: `--on-primary`, `--good`, `--glow`, `--font`).

Removed
- The "🏆 Your biggest week so far!" banner on the weekly review (keeping it simple, no gamification overload).

**Files:** `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `CHANGELOG.md`, `README.md`

---

## v4.1.0 — 2026-11-02 (push reminders removed)
**Cache version:** `v4.1`

Removed
- **Reminders when Stint is closed** (GitHub Actions push), at the owner's request: the workflow
  `.github/workflows/reminder.yml`, `.github/scripts/remind.js`, the setup dialog, the service worker
  push handler and the IndexedDB snapshot. The daily goal reminder still works while Stint is open.

Notes / migrations
- On start-up the app tidies up after v4: removes `settings.push`, deletes the `stint` IndexedDB
  database and unsubscribes any push subscription.
- If a `STINT_PUSH` secret was added on GitHub, it can be deleted (Settings → Secrets and variables → Actions).

**Files:** `index.html`, `style.css`, `app.js`, `sw.js`, `.github/` (deleted), `README.md`, `CHANGELOG.md`

---

## v4.0.0 — 2026-11-02 (reminders, review, search)
**Cache version:** `v4`

Added
- **Reminders when Stint is closed:** a scheduled GitHub Actions workflow (`.github/workflows/reminder.yml`,
  every 30 min) sends a Web Push at the reminder time. The service worker checks the daily goals from a
  copy in IndexedDB and shows "🎯 not done yet" (buzzes once a day) or a quiet "✅ done". Set up from
  ⋯ → 📲 Reminders when Stint is closed: the app makes a VAPID key pair per device and a setup code to
  paste into the `STINT_PUSH` repo secret. "Run workflow" sends a test push. Does nothing without the secret.
- **Goal days:** daily goals can be on chosen weekdays (Every day / Weekdays / Weekends presets or any mix).
  Off days show "😴 No goal today · next Wed" and don't trigger reminders.
- **Calendar heatmap:** last 26 weeks, on Stats (all sections) and each section page. Tap a day for its total.
- **Weekly review** (`#/review`, ‹ › to change week): total vs the week before, active days, best day,
  longest session, day-by-day chart, goal hits (daily: X/Y days, weekly: %), per-section change, notes,
  🏆 on a record week. Home banner when last week's review hasn't been opened.
- **Session search** (`#/search`): text search over notes and section names, filter by section or category,
  date range, minimum length; sort newest / oldest / longest / shortest. Tap a result to edit it.
- Home navigation is now four buttons: Stats, Review, Search, Stopwatch.

Changed
- Long toasts wrap instead of being cut off.
- The Stats 7-day chart legend only lists sections that appear in it.
- `save()` and `saveSettings()` also refresh the IndexedDB snapshot for the service worker.

Notes / migrations
- `goal` gains optional `days` (array of 0–6, 0 = Sunday). Missing = every day, so old goals are unchanged.
- Settings gain `lastReviewSeen` and `push`.
- New IndexedDB database `stint` (store `kv`).
- Tested: scheduling (`remind.js`) and push encryption with Node; the service worker push handler with a
  mocked IndexedDB. A real push to a phone wasn't possible to test here.

**Files:** `index.html`, `style.css`, `app.js`, `sw.js`, `.github/workflows/reminder.yml` (new),
`.github/scripts/remind.js` (new), `README.md`, `CHANGELOG.md`

---

## v3.0.0 — 2026-11-02 (big feature update)
**Cache version:** `v3`

Added
- **Categories:** optional category per section (e.g. "Sports"). Home groups sections under
  category headings with combined today/week totals. Autocompletes existing categories.
- **Goals:** optional goal per section, X minutes per day or per week. Progress bar on the
  home card and the section page.
- **Daily goal reminder:** pick a time (default 18:30). After that time, if a daily goal isn't
  done, you get a notification and toast, once per day. ⚠️ It only fires while the app is open;
  a web app can't wake itself up. A real background reminder needs Web Push (see Ideas in README).
- **Pause / Resume:** ⏸ button on home cards, the section page and focus mode. Paused time isn't counted.
- **Countdowns:** ⏳ Countdown on the section page (presets 5–90 min or custom). It auto-stops and
  logs exactly the target time, even if the app was closed. Beeps, vibrates and notifies if it
  just finished.
- **Focus mode:** full-screen timer with a progress ring (countdown progress, or a once-a-minute
  sweep). Keeps the screen awake (Wake Lock).
- **Stopwatch:** standalone page with Lap / Pause / Reset; a paused stopwatch can be saved to a section.
- **Stats page:** this week vs last week, a 7-day stacked chart, per-section and per-category tables,
  and all-time insights (total, sessions, average, longest, most active day, favourite time of day).
- **Section page chart:** hours per week for the last 8 weeks.
- **Fix-it on Stop:** stopping a timer that ran over 3h opens the session editor ("Forgot to stop?").
- **Custom colour:** rainbow swatch opens a full colour picker.
- **Backup reminder:** home banner after 14 days without a backup (or if never backed up).
  On phones, Export opens the share sheet so you can save to Drive / iCloud / email.

Changed
- Running timers are now stored as `{ start, pausedMs, pausedAt, target }` instead of a plain
  start time. Old data converts automatically (`migrate()` in `app.js`).
- Sessions have an optional `paused` (ms). Duration = end − start − paused. Editing a session's
  times resets `paused` to 0.
- The tick runs every 200ms (needed for the stopwatch's tenths).
- Notifications are tagged with `data.kind` so reminders aren't removed by the running-timer sync.

Notes / migrations
- Sections gain optional `category` (string) and `goal` (`{ period: "day"|"week", minutes }`).
- State gains `stopwatch` (`{ start, pausedMs, pausedAt, laps[] }` or null).
- Settings gain `reminderOn`, `reminderTime`, `lastReminded`, `lastBackup`.

**Files:** `index.html`, `style.css`, `app.js` (rewritten), `sw.js`, `README.md`, `CHANGELOG.md`

---

## v2.0.1 — 2026-11-02 (docs only)
**Cache version:** `v2` (unchanged; no app files changed)

- Added `README.md` (overview, install steps, development notes)
- Added `CHANGELOG.md` (this file)
- Removed `CLAUDE.md`; its content moved into the README's "Development notes"

**Files:** `README.md`, `CHANGELOG.md`, `CLAUDE.md` (deleted)

---

## v2.0.0 — 2026-11-02 (QoL update)
**Cache version:** `v2` · **Commit:** `1805420`

Added
- Renamed the app from "Hours Tracker" to **Stint** (title, manifest, backup file name)
- Theme picker in the menu: Auto / Light / Dark (saved per device)
- Optional "timer running" notification, one per running timer, with a **Stop** action (Android).
  Tapping it opens the section. Uses the service worker, so it only works on the live site.
- Undo toast (5s) after stopping a timer or deleting a session; deleting a session no longer asks to confirm
- Reorder sections with ↑ ↓ in **Edit section**
- Quick emoji picks in the section dialog
- Vibration on Start / Stop (Android)
- "Today: X across all sections" summary on the home screen

Changed
- Service worker downloads files with `cache: "reload"`, so updates never pick up stale copies
- The app reloads itself once a new version has installed (skipped while a dialog is open)
- The service worker is disabled on `localhost` during development

Notes / migrations
- Storage keys kept as `hourstracker:*` so existing data carries over
- New storage key `hourstracker:settings` for theme and notification preference
- Installed iPhone icons keep the old "Hours" label until removed and added again

**Files:** `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `CLAUDE.md`

---

## v1.0.0 — 2026-11-02 (first release)
**Cache version:** `v1` · **Commit:** `5445a8e`

Added
- Sections: create / rename / delete with name, emoji and colour
- Start / Stop timer per section; several can run at once; survives closing the app
- Totals: today, this week (Mon start), this month, all time
- Current and best streaks
- Session history grouped by day; edit / delete; add sessions by hand (handles past-midnight)
- Taps under 3 seconds are ignored as accidental
- Export / import JSON backup
- Installable PWA with offline support and generated icons
- Live on GitHub Pages: https://zxdr4gon.github.io/hourstracker/

**Files:** all initial files
