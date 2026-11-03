# Stint (repo: hourstracker)

Live at https://zxdr4gon.github.io/hourstracker/ (GitHub Pages, `main` branch root).

A personal app for logging time spent on activities ("sections"), e.g. Cricket, Jogging.
Press Start on a section, press Stop when done, and the session is logged with its date,
start time, end time and duration. Sections show totals and streaks.

## About the user
- The user does not code. Claude writes all the code.
- Explain things in plain language. When the user has to do something themselves
  (GitHub Desktop, phone settings), give exact click-by-click steps.
- Budget is zero: no paid hosting, services, or app stores.

## Tech rules
- Plain HTML, CSS and JavaScript. No frameworks, no build step, no npm packages.
- It's a PWA (installable web app) hosted free on GitHub Pages.
- Mobile-first design; must also work on desktop browsers.
- Works fully offline (service worker in `sw.js`).
- All data lives on the device in `localStorage`. There are no accounts and no server.
- **Bump `CACHE_VERSION` in `sw.js` whenever any app file changes**, or phones keep the old version.

## Files
- `index.html`: page structure and dialogs
- `style.css`: all styling (light + dark mode via `prefers-color-scheme`)
- `app.js`: all app logic (data, rendering, stats)
- `sw.js`: offline caching
- `manifest.webmanifest` + `icons/`: what makes it installable

## Data shape (localStorage key `hourstracker:v1`)
The app was renamed from "Hours Tracker" to "Stint", but storage keys and the cache name
keep the `hourstracker` prefix. **Never rename them**, or users lose their data.
Per-device preferences (`theme`, `notify`) live separately in `hourstracker:settings`
and are not part of backups.

```js
{
  sections: [{ id, name, emoji, color, createdAt }],
  sessions: [{ id, sectionId, start, end, note }],   // start/end are ms timestamps
  running:  { [sectionId]: startTimestamp }           // timers currently going
}
```
- Timers are saved as a start timestamp the moment Start is pressed, so closing the
  browser or locking the phone never loses time. Elapsed = now − start.
- Multiple sections may run at the same time.
- Totals for a period (today/week/month) only count the part of a session inside that
  period. Weeks start on Monday.
- Streak = consecutive days with at least one session in that section. A streak still
  counts if the latest day is yesterday (today isn't over yet).

## Features
Done (v1):
- [x] Create / rename / delete sections (name, emoji, colour)
- [x] Start / stop timer per section; survives closing the app
- [x] Session history per section, grouped by day
- [x] Edit / delete sessions; add a session by hand
- [x] Totals: today, this week, this month, all time
- [x] Current and best streak per section
- [x] Export / import a JSON backup
- [x] Installable + offline

Done (v2, QoL):
- [x] Renamed to Stint
- [x] Theme: Auto / Light / Dark in the menu
- [x] Optional "timer running" notification with a Stop button (Android; iPhone shows it
      without the button). Web apps can't show a live-ticking timer in the notification bar.
- [x] Undo after stopping a timer or deleting a session
- [x] Reorder sections (↑ ↓ in Edit section)
- [x] Quick emoji picks, vibration on Start/Stop, "today across all sections" summary
- [x] Updates reload automatically once the new version downloads

Ideas for later:
- [ ] Charts (hours per week)
- [ ] Goals (e.g. 3h jogging per week)
- [ ] CSV export
- [ ] Notes shown on home screen

## How we work
- Small steps. After each step the user tests it, then we commit.
- Test locally with `python -m http.server 8000` and open http://localhost:8000.
  The service worker is deliberately off on `localhost` so edits show immediately;
  use http://127.0.0.1:8000 to test offline caching / notifications.
- Publishing: the user pushes with GitHub Desktop; GitHub Pages serves from the `main` branch root.
