# Working on this repo

- After every change: commit, push the working branch, and open a pull request to `main` without being asked. The owner merges it, and merging deploys to GitHub Pages.
- Bump `VERSION` in `sw.js` on every change to shipped files, so installed apps update.
- The repo is public. Never commit personal workout data, such as backup or import JSON files.
- No build step: plain ES modules. Keep the data layer (`js/db.js`, `js/store.js`, `js/library.js`, `js/legacy.js`, `js/dates.js`) free of DOM code.
- When adding a JS/data file, add it to the `SHELL` list in `sw.js` so it works offline.
- Saved data has a schema version (`v: 2` on days/templates). Changing the shape means adding an upgrade path so existing data on the phone keeps working.
