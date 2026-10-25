# TMF Workout Tracker

A personal workout log you install on your iPhone as a PWA. Plain HTML/CSS/JS with no build step, and everything is stored on the device in IndexedDB.

## Features
- **Week view**: Monday–Sunday calendar weeks. Each day shows its workout name and how many sets are done.
- **Structured day log**:
  - Pick the workout type (Push, Pull, Legs, Upper/Lower Body, Arms, Abs & Core, Full Body, Cardio, Rest, or Custom).
  - Add exercises from a searchable library of 870+ exercises, filtered by equipment and muscle. You can also create your own.
  - Each exercise has an equipment dropdown, a cable ratio (1:1 / 2:1) when it's a cable, and a kg/lbs toggle.
  - Sets are rows of weight + reps (reps accept things like `7+3`). Cardio sets record minutes, km and a note.
- **Repeat last workout**: after choosing a type, one tap adds the exercises from your last workout of that type.
- **PREVIOUS column** (like Hevy): shows last time's numbers for the same exercise, equipment and ratio. Tap it to copy, or tick ✓ to fill blanks from it.
- **Rest timer** starts when you tick a set.
- **Exercise pages**: muscles, photos, how-to steps, and your history grouped by equipment/ratio, with heaviest set and estimated 1RM.
- **Templates**, day **notes**, a default-unit setting, and **export / import** (merge or replace) of a JSON backup.
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
js/db.js       IndexedDB wrapper           ┐
js/store.js    days/templates/settings     │ data layer: no DOM,
js/library.js  exercise dataset + search   │ reusable unchanged if
js/legacy.js   upgrades old saved data     │ moving to React + Vite
js/dates.js    date helpers                ┘
js/dom.js      h() element helper, sheet, toast
js/timer.js    rest timer
js/views/*.js  screens (week, day, exercise picker/info, history, settings)
data/exercises.json  exercise library (rebuild: python3 tools/build-exercises.py)
js/app.js      hash router + boot
```
To migrate to React later, rewrite `views/` as components and keep the data layer as it is. The data stays in the browser at the same URL, so nothing is lost.

## Credits
The exercise library comes from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain, Unlicense). Exercise photos load from that repo when you're online.
