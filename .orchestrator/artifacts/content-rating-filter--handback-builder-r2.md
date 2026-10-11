produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: content-rating-filter · round: r2
status: complete        failure_class: n/a
paths: css/app.css, js/main.js, tests/e2e/content-rating.spec.mjs (changed this round, all staged); r1 files still staged and unchanged this round: index.html, js/engine.js, js/plex.js, js/poster-cache.js, js/ratings.js, js/settings-ui.js, scripts/mock-plex.mjs, sw.js, tests/engine.test.js, tests/plex.test.js, tests/poster-cache.test.js, tests/ratings.test.js
criteria:
  1. met - `test -f` x4 && `node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js` -> tests 85, pass 85, fail 0
  2. met - `npm test` -> tests 205, pass 205, fail 0
  3. met - `E2E_PORT=19420 E2E_MOCK_PORT=19421 npm run test:e2e -- content-rating` -> PASS content-rating (3 runs after the last edit, 13 cases incl. new 10 and 11); full `npm run test:e2e` PASS for cache-first, content-rating, rotation, sleep, smoke, ui-rotation
  4. met - `node scripts/check-precache.mjs` -> "26 precached files OK"
  5. met - the four-grep command -> exit 0
  6. narrated (independent reviewer), not run by me
  lint (item 1 of the brief): met - `eslint --no-config-lookup -c .../round--eslint-r1e.config.mjs <all 11 staged js/mjs files>` -> exit 0; `node --check` each -> ok; `git diff --cached --check` -> exit 0
  K20 (item 2 of the brief): met - new e2e cases 10 and 11, failing on r1, passing now
deviations: none. Two small consequences of K20 beyond the literal text, both inside Output paths: (a) the empty-card text when nothing is on screen, a limit is set and the failure is not fatal is "No posters within the household limit are available while Plex is unreachable." (a fatal `empty` error keeps its own message); (b) togglePin and the tick's `force` now read "nothing on screen" / "blocked" so a blocked poster cannot be pinned and the first tick after a block (e.g. waking from sleep) always picks a replacement.
questions: none

Agent: content-rating-filter-builder-r2 · dispatched: 2026-10-09T03:56:15Z

## What changed (K20)
js/main.js:
- `allowedOnScreen(poster)`: `allows(maxContentRating, poster.contentRating)`, or the poster is the owner-pinned one (D5), or it is a now-playing poster and `limitNowPlaying === false`.
- `blockPoster()`: adds `body.poster-blocked`, removes `.active` from both layers and blanks their `alt`, sets `display.currentPoster = null`, clears the title card.
- `showPoster()` wraps `display.show` at its three call sites (tick draw, tick heal draw, offline fallback) and removes the body class after a successful draw.
- `applySettings`: right after the save, before the forced tick, `if (display.currentPoster && !allowedOnScreen(display.currentPoster)) blockPoster()`. This is synchronous, so it holds offline and while asleep. Online, the r1 forced tick then picks the replacement; offline, `handleFailure` runs, sees nothing on screen (so the rotation is due at once), asks `cache.random(…, limit)` for an allowed cached poster, else shows the empty card.
css/app.css: `body.poster-blocked .poster-layer, body.poster-blocked .title-card { opacity: 0; transition: none; visibility: hidden; }` (no fade).
tests/e2e/content-rating.spec.mjs: lint fix in case 4 (`contentRating` destructure replaced by copy-and-delete) and new cases 10 and 11.

## e2e written first, failing on r1 (cases 10 and 11 only, `E2E_CONTENT_ONLY='^1[01] '`)
```
case 11 K20 offline limit change, no allowed cached poster failed:
AssertionError [ERR_ASSERTION]: title 4 (R) stays on screen offline after PG-13 is saved
case 10 K20 offline limit change, allowed cached poster available failed:
AssertionError [ERR_ASSERTION]: title 4 (R) stays on screen offline after PG-13 is saved
FAIL content-rating
```
(The assertion text is the failure message of `assert.notEqual(took, null, …)`: title 4 never left the screen within 3 s.)

## After the fix
```
  ok  offline: PG-13 saved while title 4 is up -> replaced within 4 ms by a cached allowed poster; 8 rotations never return it (1,2,3)
PASS case 10 K20 offline limit change, allowed cached poster available
  ok  offline: PG-13 saved while title 4 is up and nothing allowed is cached -> poster gone within 5 ms, empty card, 4 rotations show nothing
PASS case 11 K20 offline limit change, no allowed cached poster
  ok  20 offline rotations under PG-13 never show title 4 (shown: 1,2,3,6)
  ok  cached entries without a stored rating (pre-2.1) are never shown offline while a limit is set
PASS case 4 cached posters offline
PASS content-rating
```
Case 10: Settings UI (`#household-toggle`, default PG-13, Save) with Plex down and title 4 on screen; title 4 leaves within 1.5 s (measured about 5 ms), an allowed cached poster (1, 2 or 3) is on screen, and 8 offline rotations (`clock.runFor(361000)`) never return it. Case 11: only title 4 cached; after Save no `.poster-layer.active`, every layer computed opacity 0, `#empty` visible with text matching /household limit/, 4 offline rotations show nothing; the cache entry is kept.

Mutation (in a mktemp copy, removed): the `blockPoster()` call in applySettings deleted -> cases 10 and 11 fail, FAIL content-rating.

## Other command tails
```
$ npm test                      # tests 205  pass 205  fail 0
$ node scripts/check-precache.mjs   26 precached files OK
$ npm run test:e2e              PASS cache-first / content-rating / rotation / sleep / smoke / ui-rotation
$ eslint (r1e config) on staged js/mjs   exit 0
```

## Residuals for the conductor (not fixed, outside the brief)
- R2 (js/settings.js sanitize turns an unknown stored limit into no limit) and R3 are unchanged from r1.
- A tick already in flight when the limit is saved decided under the old limit and may still draw that poster (the forced tick is skipped while `state.busy`, and no check runs between download and draw). The window is one download long; a one-line `allowedOnScreen(decision.poster)` check before the draw would close it. I did not add it because the ruling names the on-screen case only.
- The hidden poster layer keeps the blocked image data in its `src` (opacity 0, no `.active`, `alt` blank) until the next successful draw replaces it. It is not visible or readable by `.poster-layer.active`.
