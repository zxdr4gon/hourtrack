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
- **Daily goal reminder** at a set time, even when Stint is closed (free push from GitHub Actions; see below)
- Totals for today, this week (Mon–Sun), this month and all time; current and best streaks
- **Stats page:** this week vs last, a 7-day chart, per-section and per-category totals, all-time insights
- **Calendar heatmap** of the last 6 months (all sections on Stats, one section on its page); tap a day for its total
- **Weekly review:** total vs the week before, active days, best day, goal hits, per-section changes, your notes;
  a home banner when last week's review is ready
- **Session search:** search notes, filter by section, category, date range and minimum length, sort by date or length
- History grouped by day: edit, delete (with Undo) or add sessions by hand, with notes
- "Forgot to stop?" check when a timer ran over 3 hours
- Optional "timer running" notification with a Stop button (Android)
- Light / Dark / Auto theme
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

## Reminders when Stint is closed
A web app can't wake itself up, so a free scheduled job in this repo
(`.github/workflows/reminder.yml`) sends your phone a push at your reminder time. Stint then checks
your daily goals and only buzzes if one isn't done (otherwise you get a quiet "✅ done" notification).

1. In Stint: **⋯** → turn on **🎯 Daily goal reminder**, pick a time, then **📲 Reminders when Stint is closed**.
2. **Make setup code** → **Copy**.
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.
   Name `STINT_PUSH`, paste the code.
4. **Actions → Daily goal reminder → Run workflow** sends a test notification.

Good to know:
- Make a new code and replace the secret whenever you change the reminder time or which days your goals are on.
- GitHub's scheduled runs can start up to ~30 minutes late.
- GitHub pauses scheduled workflows after 60 days with no commits. It emails you; re-enable it in the Actions tab.
- iPhone: needs iOS 16.4+ and Stint opened from the home-screen icon.
- Several phones: make the secret a JSON list of codes: `[code1, code2]`.

---

## Development notes

### Tech
- Plain HTML, CSS and JavaScript. No frameworks, no build step, no npm.
- PWA hosted on GitHub Pages from the `main` branch root. Costs nothing.
- Mobile-first; must also work on desktop.

### Files
| File | What it does |
|---|---|
| `index.html` | Page structure and dialogs |
| `style.css` | All styling; light/dark via CSS variables and `data-theme` |
| `app.js` | All logic: data, rendering, stats, notifications |
| `sw.js` | Offline caching, notification clicks, push reminders |
| `manifest.webmanifest`, `icons/` | Makes it installable |
| `.github/workflows/reminder.yml`, `.github/scripts/remind.js` | Scheduled job that sends the reminder push |
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
{ theme, notify, reminderOn, reminderTime: "HH:MM", lastReminded, lastBackup, lastReviewSeen,
  push: { publicKey, privateKey, time, days } | null }   // this device's push keys + what the setup code was made for
```
IndexedDB `stint` / store `kv` (for the service worker, which can't read localStorage):
`snapshot` = daily goals, today's saved totals and running timers (rewritten on every save);
`pushReminded` = the day the push reminder last buzzed.
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
  time. Countdown alarms only fire while the app is open (they still log the right time when you reopen).
  The daily reminder works when closed only through the GitHub push setup above.
- Push reminders run on GitHub's schedule (every 30 min at :07 and :37 UTC). `remind.js` maps each
  reminder time to the first run at or after it, so each device gets one push a day.
  Every push must show a notification, which is why "all done" days get a quiet one.
- No syncing between devices yet: each phone has its own data.

### Releasing a change
1. Bump `CACHE_VERSION` in `sw.js`. Without this, phones keep the old version.
2. Add an entry at the top of `CHANGELOG.md`.
3. Commit, then **Push origin** in GitHub Desktop. Pages updates in about a minute.
