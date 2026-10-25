# TMF Workout Tracker

A personal workout log you install on your iPhone as a PWA. Plain HTML/CSS/JS with no build step, and everything is stored on the device in IndexedDB.

## Features (phase 1)
- **Week view**: Monday–Sunday calendar weeks. Each day shows its workout name and how many sets are done.
- **Day log**: name the workout (e.g. *Push Day*), add exercises, and log **weight + reps per set**. Tick ✓ when a set is done.
- **PREVIOUS column** (like Hevy): shows what you did last time. Tap it to copy, or tick ✓ to fill empty fields from it.
- **Templates**: save a day as a template and start future days from it, or copy last week's same weekday.
- **Exercise names autocomplete** from your history.
- **Rest timer** starts when you tick a set (off / 1:00 / 1:30 / 2:00 / 3:00, ±15s).
- **Notes** for each day.
- **Exercise history**: every session, plus heaviest set and estimated 1RM.
- **kg / lbs** toggle (stored in kg internally).
- **Export / import** a JSON backup.
- Works fully offline.

## Run locally
```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy (GitHub Pages)
1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`. `.github/workflows/pages.yml` deploys it to `https://<user>.github.io/tmf-pwa/`.
3. On the iPhone, open that URL in **Safari → Share → Add to Home Screen**.

When you ship changes, bump `VERSION` in `sw.js` so the installed app picks up the new files. The update arrives on the next launch after that.

## Code layout
```
js/db.js       IndexedDB wrapper           ┐ data layer: no DOM,
js/store.js    days/templates/settings     │ reusable unchanged if
js/dates.js    date helpers                ┘ moving to React + Vite
js/dom.js      h() element helper, sheet, toast
js/timer.js    rest timer
js/views/*.js  screens (week, day, history, settings)
js/app.js      hash router + boot
```
To migrate to React later, rewrite `views/` as components and keep the data layer as it is. The data stays in the browser at the same URL, so nothing is lost.
