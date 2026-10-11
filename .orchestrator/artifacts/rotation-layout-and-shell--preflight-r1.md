| # | kind | exit | criterion (rotation-layout-and-shell, pre-r1) |
|---|---|---|---|
| 1 | cmd | 1 | `npm run test:e2e -- rotation` |
| 2 | cmd | 1 | `npm run test:e2e -- ui-rotation` |
| 3 | cmd | 2 | `grep -Eq 'pixelShift: *false' tests/e2e/rotation.spec.mjs tests/e2e/ui-rotation.spec.mjs` |
| 4 | cmd | 0 | `npm test` |
| 5 | cmd | 0 | `node scripts/check-precache.mjs` |
| 6 | cmd | 1 | `grep -q -- '--ui-rotation' css/app.css && grep -q -- '--ui-rotation' js/display.js` |
| 7 | cmd | 0 | `test -z "$(git status --porcelain -- js/settings.js js/engine.js js/plex.js js/main.js sw.` |
| 8 | narrated | — | `narrated: the reviewer shows the `rotation` spec failing against the CSS at `3a7b688` (a t` |
