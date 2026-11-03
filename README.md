# Stint ⏱️

Log time spent on your activities. Make a section (Cricket, Jogging, Guitar…), press **Start**,
press **Stop** when you're done, and the session is saved with its date, start time, end time
and duration. Each section tracks totals and streaks.

**Live app:** https://zxdr4gon.github.io/hourstracker/

## Features
- Sections with a name, emoji and colour; reorder them with ↑ ↓
- Start / Stop timers. You can run more than one at once, and they keep going if you close the app.
- Totals for today, this week (Mon–Sun), this month and all time
- Current and best streak (days in a row)
- History grouped by day: edit, delete (with Undo) or add sessions by hand, with notes
- Optional "timer running" notification with a Stop button (Android)
- Light / Dark / Auto theme
- Works offline and installs to your home screen
- Export / import a JSON backup

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
  sections: [{ id, name, emoji, color, createdAt }],   // array order = home screen order
  sessions: [{ id, sectionId, start, end, note }],     // start/end = ms timestamps
  running:  { [sectionId]: startTimestamp }
}
// key "hourstracker:settings" (per device, not in backups)
{ theme: "system" | "light" | "dark", notify: boolean }
```
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

### Releasing a change
1. Bump `CACHE_VERSION` in `sw.js`. Without this, phones keep the old version.
2. Add an entry at the top of `CHANGELOG.md`.
3. Commit, then **Push origin** in GitHub Desktop. Pages updates in about a minute.
