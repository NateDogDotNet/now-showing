produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: content-rating-filter · round: r3
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/content-rating.spec.mjs (changed this round, both staged); r1/r2 files still staged and unchanged this round: css/app.css, index.html, js/engine.js, js/plex.js, js/poster-cache.js, js/ratings.js, js/settings-ui.js, scripts/mock-plex.mjs, sw.js, tests/engine.test.js, tests/plex.test.js, tests/poster-cache.test.js, tests/ratings.test.js
criteria:
  1. met - `test -f` x4 && `node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js` -> tests 85, pass 85, fail 0
  2. met - `npm test` -> tests 205, pass 205, fail 0
  3. met - `E2E_PORT=19420 E2E_MOCK_PORT=19421 npm run test:e2e -- content-rating` -> PASS content-rating (run twice after the last edit; 15 cases incl. new 12 and 13); full `npm run test:e2e` PASS cache-first, content-rating, rotation, sleep, smoke, ui-rotation
  4. met - `node scripts/check-precache.mjs` -> "26 precached files OK"
  5. met - the four-grep command -> exit 0
  6. narrated (independent reviewer), not run by me
  lint: met - `eslint --no-config-lookup -c .../round--eslint-r1e.config.mjs` on all staged js/mjs files -> exit 0; `git diff --cached --check` -> exit 0
  R4 (this round's item): met - new e2e cases 12 and 13 failed on r2, pass now (below)
deviations: none. One consequence beyond the literal text, inside Output: when a poster is refused at the draw, the tick schedules its next run in 1 s (REFUSED_RETRY_MS) instead of a full rotation, because otherwise the screen the K20 block just blanked would stay empty for rotateSeconds. Not a new user-visible rule; it is the "next tick picks another" of the brief.
questions: none

Agent: content-rating-filter-builder-r3 · dispatched: 2026-10-09T04:10:00Z

## What changed (R4)
js/main.js
- `showPoster(poster, image)` now returns a boolean. Immediately before `display.show` it checks `allowedOnScreen(poster)` against the CURRENT `state.settings`; if not allowed it draws nothing and returns false. After `display.show` (the decode is awaited) it checks again; if the limit tightened during the decode it calls `blockPoster()` and returns false. Only a true return clears `body.poster-blocked`.
- tick: both draws (first and heal second show) take `drawn = await showPoster(...)`. A false return is not an error: no heal, no `engine.shown`, no `lastReason`; `refused = true`, so `schedule(REFUSED_RETRY_MS)` (1 s) follows and the next tick picks another (forced, if the screen is blocked).
- handleFailure (offline cached path): `if (!(await showPoster(...))) continue;` the refused entry is neither drawn nor marked shown nor deleted; the second attempt takes another `cache.random(…, limit)`.
tests/e2e/content-rating.spec.mjs: cases 12 and 13 (helpers `isTitle4Image`, `recordActiveAlts`, `everActive`). A MutationObserver installed with addInitScript records the alt of every `.poster-layer.active` on any class/alt/src change, so a draw that is replaced within one frame is still seen.
- Case 12: `page.route` holds the image request for title 4 (no limit, pool 4); refreshes until it is held; saves PG-13 through the Settings UI; releases the request. Asserts an allowed poster (1, 2, 3 or 6) follows, and title 4 is never in the recorded active alts across 10 more refreshes.
- Case 13: the heal path. Title 4 cached, its cache entry replaced with garbage, the title-4 image held; a refresh picks title 4, the cached copy fails to decode and the re-download is held; PG-13 saved; released. Recorder cleared right before the save, so only draws after the save count. Asserts the same.

## e2e written first, failing on r2 (`E2E_CONTENT_ONLY='^1[23] '`, r2 js/main.js from the index, in a mktemp copy)
```
case 12 R4 in-flight download vs a stricter limit failed:
AssertionError [ERR_ASSERTION]: the next tick picked an allowed poster (on screen: 4)
case 13 R4 heal re-download in flight vs a stricter limit failed:
AssertionError [ERR_ASSERTION]: the next tick picked an allowed poster (on screen: 4)
```
## After the fix
```
  ok  PG-13 saved while title 4's download is in flight: never drawn; an allowed poster (2) followed; drawn ever: 1,2,3,6
PASS case 12 R4 in-flight download vs a stricter limit
  ok  PG-13 saved while title 4's heal re-download is in flight: not drawn; an allowed poster (1) followed
PASS case 13 R4 heal re-download in flight vs a stricter limit
...
PASS content-rating
```
Mutation (mktemp copy, removed): the pre-draw `if (!allowedOnScreen(poster)) return false;` deleted (post-draw check kept) ->
```
case 12 ... AssertionError: title 4 (R) was never drawn: 3,1,4,6,2
case 13 ... AssertionError: title 4 (R) was never drawn after the save: 2,4,6,1,3
```
(the post-draw check hides it again, but the recorder sees the flash). Full-suite tails: `npm test` 205/205; criteria 1 85/85; check-precache 26 OK; full `npm run test:e2e` PASS x6.

## Not covered by a test
The offline cached path (`handleFailure`) has the same guard, but the window is only the local blob decode (no network to hold), so I could not put the limit change inside it from the browser. It is covered by the shared `showPoster` check (exercised by cases 12 and 13) and by reading; no dedicated e2e or mutation for that call site.

## Residuals (unchanged, outside the brief)
R2 (js/settings.js sanitize turns an unknown stored limit into no limit) and R3 as in r1/r2. The hidden poster layer still holds the blocked image data in `src` until the next draw (opacity 0, no `.active`, blank `alt`).
