# Changelog

Newest first. Each entry lists the release date, the `CACHE_VERSION` it shipped with in `sw.js`,
what changed, which files were touched, and anything to watch out for.

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
