# Stint ⏱️

Log time spent on your activities. Make a section (Cricket, Jogging, Guitar…), press **Start**,
press **Stop** when you're done, and the session is saved with its date, start time, end time
and duration. Each section tracks totals and streaks.

**Live app:** https://zxdr4gon.github.io/hourstracker/

## Features
- Sections with a name, emoji, colour (or any custom colour) and an optional **category** (e.g. Sports); reorder with ↑ ↓
- Start / **Pause** / Stop timers. You can run more than one at once, and they keep going if you close the app.
- **Countdowns** (5–90 min or custom) that log themselves when time's up
- **Focus mode:** a big full-screen timer that keeps the screen on
- **Stopwatch** with laps, not tied to a section; save the time to a section afterwards
- **Goals** per week, or per day on the days you choose (e.g. Cricket 1h Mon/Wed/Fri, Guitar 30m on weekends)
- **Daily goal reminder** at a set time (while Stint is open)
- Totals for today, this week (Mon–Sun), this month and all time; current and best streaks
- **Stats page:** this week vs last, a 7-day chart, per-section and per-category totals, all-time insights
- **Calendar heatmap** of the last 6 months (all sections on Stats, one section on its page); tap a day for its total
- **Weekly review:** total vs the week before, active days, best day, goal hits, per-section changes, your notes;
  a home banner when last week's review is ready
- **Session search:** search notes, filter by section, category, date range and minimum length, sort by date or length
- History grouped by day: edit, delete (with Undo) or add sessions by hand, with notes
- "Forgot to stop?" check when a timer ran over 3 hours
- Optional "timer running" notification with a Stop button (Android)
- Light / Dark ("Midnight Indigo") / Auto theme, Manrope font
- Works offline and installs to your home screen
- Export / import a JSON backup, with a reminder if you haven't backed up in 14 days

## Install on your phone
1. Open the live link above.
2. **iPhone (Safari):** Share → **Add to Home Screen**.
   **Android (Chrome):** ⋮ → **Add to Home screen** / **Install app**.
3. Always open it from the home-screen icon. That's where your data lives.

## Your data
Everything is stored **only on your device** (browser `localStorage`). There are no accounts and no server.
Use **⋯ → Export backup** now and then, and **Import backup** to restore it or move it to a new phone.

---

## Development notes

### Tech
- Plain HTML, CSS and JavaScript. No frameworks, no build step, no npm.
- PWA hosted on GitHub Pages from the `main` branch root. Costs nothing.
- Mobile-first; must also work on desktop.
- Design: keep it simple, no gamification overload. Colours are tokens at the top of `style.css`.

### Files
| File | What it does |
|---|---|
| `index.html` | Page structure and dialogs |
| `style.css` | All styling; light/dark via CSS variables and `data-theme` |
| `app.js` | All logic: data, rendering, stats, notifications |
| `sw.js` | Offline caching + notification clicks |
| `manifest.webmanifest`, `icons/` | Makes it installable |
| `CHANGELOG.md` | Version history |

### Data (localStorage)
```js
// key "hourstracker:v1"
{
  sections: [{ id, name, emoji, color, category, goal, createdAt }], // array order = home screen order
                                                                     // goal = { period: "day"|"week", minutes, days? } or null
                                                                     // days = weekdays for a daily goal, 0 = Sunday; missing = every day
  sessions: [{ id, sectionId, start, end, paused, note }],  // ms timestamps; duration = end - start - paused
  running:  { [sectionId]: { start, pausedMs, pausedAt, target } },  // target = countdown ms or null
  stopwatch: { start, pausedMs, pausedAt, laps: [ms] } | null
}
// key "hourstracker:settings" (per device, not in backups)
{ theme, notify, reminderOn, reminderTime: "HH:MM", lastReminded, lastBackup, lastReviewSeen }
```
- `migrate()` in `app.js` upgrades data from older versions. Add to it whenever the data shape changes.
- **Never rename the `hourstracker:*` storage keys** (left over from the old name) or people lose their data.
- A timer is a saved start timestamp, so elapsed = now − start. Closing the app never loses time.
- Period totals count only the part of a session inside the period.
- Streak = consecutive days with a session that started that day. It still counts if the last day was yesterday.

### Running it locally
```bash
python -m http.server 8000
```
- http://localhost:8000: service worker **off**, so edits show immediately.
- http://127.0.0.1:8000: service worker **on**, for testing offline mode and notifications.

### Known limits
- Web apps can't show a live ticking timer in the notification bar, and can't wake up at a set
  time. So the daily reminder and countdown alarms only fire while the app is open
  (countdowns still log the right time when you reopen).
- Push reminders sent by a scheduled GitHub Actions job were tried in v4 and removed in v4.1 (owner's choice).
- No syncing between devices yet: each phone has its own data.

### Releasing a change
1. Bump `CACHE_VERSION` in `sw.js`. Without this, phones keep the old version.
2. Add an entry at the top of `CHANGELOG.md`.
3. Commit, then **Push origin** in GitHub Desktop. Pages updates in about a minute.
