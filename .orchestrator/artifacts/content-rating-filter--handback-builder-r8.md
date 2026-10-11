produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: content-rating-filter · round: r8
status: complete        failure_class: n/a
paths: js/main.js, js/settings-ui.js, js/poster-cache.js, css/app.css, tests/poster-cache.test.js, tests/e2e/content-rating.spec.mjs (all staged, not committed). Staged tree otherwise as at the end of r7 on HEAD af55616. js/display.js untouched. No stray files outside the worktree; the temporary node_modules symlink is removed.
criteria:
1. met: `test -f tests/ratings.test.js && ... && node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js` gave tests 89, pass 89, fail 0 (86 + 3 new).
2. met: `npm test` gave tests 209, pass 209, fail 0.
3. met: `E2E_PORT=19420 E2E_MOCK_PORT=19421 npm run test:e2e -- content-rating` run 3 times: exit 0, 0, 0; "PASS case" count 22 of 22 each time (19 old + new cases 20, 21, 22).
4. met: `node scripts/check-precache.mjs` gave "26 precached files OK", exit 0.
5. met: the grep chain (contentRating in js/plex.js and js/poster-cache.js, limitNowPlaying and household-toggle in index.html) exits 0.
Item 1 (C7I1): met. Item 2 (C7M1): met. Item 3 (C7M2): met. Each test failed first on the staged r7 tree (output below).
Lint: `npx eslint -c .../round--eslint-r1e.config.mjs js/main.js js/settings-ui.js js/poster-cache.js tests/poster-cache.test.js tests/e2e/content-rating.spec.mjs` exit 0, no output.
deviations: (a) Item 3 is wired where a poster is first decided online (tick, right after engine.decide returns a decision, before the download), not only after it is drawn. This covers a cache hit (no put) and a poster refused at the draw, and matches D35's "whenever the poster is seen online". (b) css/app.css was touched (one rule, `.poster-layer.cut:not(.active)`), which the brief allowed "if needed". (c) I symlinked node_modules from /home/user/wt-e2e-harness/node_modules to run playwright and removed it at the end. Otherwise none.
questions: none

Agent: content-rating-filter-builder-r8 · dispatched: 2026-10-10T13:54:13Z

## What changed

### 1. C7I1 (js/settings-ui.js)
- New `pendingPin = { key, title }` inside the dialog. `write(s)` sets it from `s` (so open and import both set it), the Unpin button clears it, and `read()` takes `staticRatingKey`/`staticTitle` from it instead of from `getSettings()`. The old `dataset.cleared` flag is gone.
- js/main.js is unchanged for this item: `applySettings` still replaces the pin with the saved one in a preview, so an unsaved pin is never drawn (r7 behaviour kept). Save passes the pending pin through `onSave`, which is not a preview.
- e2e case 20 (`20 C7I1 import a pin, Cancel, then import and Save`), with `recordActiveAlts`: PG-13 saved. (a) Open Settings, import `{"staticRatingKey":"4","staticTitle":"Popcorn Skies"}`, 8 refreshes with the dialog open, Cancel: saved pin is still none, 8 more refreshes, only titles 1, 2, 3, 6 were ever drawn, an allowed poster is up, and reopening the dialog shows `none` (the discarded import is not offered again). (b) Import again, Save: stored `staticRatingKey` is `4`, `staticTitle` `Popcorn Skies`, limit still PG-13; title 4 comes up and stays up over 3 refreshes (pin exempt); the reopened dialog shows the pin; Unpin + Save clears it.

### 2. C7M1 (js/main.js, css/app.css)
- `showPoster` remembers the poster it replaces (`display.currentPoster` before `display.show`) as `outgoingPoster` once the draw succeeds. `cutOutgoing()`: if that poster is no longer `allowedOnScreen`, every non-active `.poster-layer` gets class `cut` (and `alt=''`) and `outgoingPoster` is cleared. It runs in `applySettings` next to the existing `blockPoster()` check (so before `display.apply`, and on every apply), and at the end of `showPoster` (a limit tightened during the decode). `blockPoster()` clears `outgoingPoster`. `showPoster` removes the `cut` class before the next draw.
- css/app.css: `.poster-layer.cut:not(.active) { opacity: 0; transition: none; }` (a layer that becomes active again is not affected).
- e2e case 21 (`21 C7M1 limit saved mid-crossfade hides the outgoing poster`), crossfadeMs 3000: title 4 reaches opacity 1 first, caches are emptied so the forced tick after the save has to download and its image request is held (nothing can reuse the layer), the dialog is open with the household toggle ticked, refresh crossfades 4 to an allowed title, Save. Asserts the outgoing layer held title 4 and had opacity above 0.05 before the save, then its computed opacity is 0 after the save (took 2 ms in the passing run, bound 400 ms), exactly one active layer remains, and it is the title that was fading in; then the request is released and an allowed title is up.

### 3. C7M2 (js/poster-cache.js, js/main.js)
- `refreshRating(poster)` in the cache: for an existing index entry, sets `contentRating` to `poster.contentRating || ''`. No re-order, no blob write, no index write when the stored value already matches, and an uncached poster is ignored.
- js/main.js `tick`: `cache.refreshRating(decision.poster)` right after the decision (see deviation a).
- Unit tests (tests/poster-cache.test.js, 3 new): rewrite keeps order and every other field and stores "" for an unrated poster; a re-rated PG to R entry drops out of `random(undefined, 'PG-13')`; an uncached poster and an unchanged rating cause no index write, no cache write and no new entry.
- e2e case 22 as a wiring check: title 4 cached, its index rating edited to PG, title 4 shown again from the cache, the index says R again.
- Known limit, not changed: a title re-rated UP in Plex is no longer returned by the server-filtered pool, so it is never seen online and its stored rating stays stale until it is evicted. Only a poster that comes through `decide` is refreshed.

## Failing first (on the staged r7 tree, tests only added)
```
node --test tests/poster-cache.test.js
not ok 19 - refreshRating rewrites the stored rating from the poster, keeping the order and the other fields
  error: 'pc.refreshRating is not a function'
not ok 20 - refreshRating makes a re-rated title drop out of the offline draw under the limit
  error: 'pc.refreshRating is not a function'
not ok 21 - refreshRating ignores a poster that is not cached and writes nothing when the rating is unchanged
  error: 'pc.refreshRating is not a function'
# pass 24  # fail 3

E2E_CONTENT_ONLY='^(20|21|22) ' npm run test:e2e -- content-rating
case 22 C7M2 ... failed: AssertionError: the stored rating follows the poster seen online   'PG' !== 'R'
case 20 C7I1 ... failed: AssertionError: Save kept the imported pin   '' !== '4'
case 21 C7M1 ... failed: AssertionError: title 4's layer is invisible after the save (opacity 0.404655 after 1016 ms)
FAIL content-rating
```
(Case 21 first failed for a test reason: title 4 was itself still fading in, so the outgoing opacity was low from the start. The test now waits for title 4 to reach opacity 1 before starting the crossfade; the failure above is the corrected test.)

## Mutations (in a copy under the session scratchpad, deleted afterwards)
- Both `cutOutgoing()` calls removed: case 21 FAILS, "title 4's layer is invisible after the save (opacity 0.385894 after 1009 ms)". Killed.
- `cache.refreshRating` call removed from main.js: case 22 FAILS, "the stored rating follows the poster seen online". Killed.
- `read()` takes the pin from `getSettings()` again: case 20 FAILS, "Save kept the imported pin". Killed.

## Commands and output tails
```
node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js  -> # tests 89 # pass 89 # fail 0
npm test  -> # tests 209 # pass 209 # fail 0
E2E_PORT=19420 E2E_MOCK_PORT=19421 npm run test:e2e -- content-rating  (x3)  -> run1 exit 0 PASS=22, run2 exit 0 PASS=22, run3 exit 0 PASS=22; last lines "PASS case 4 cached posters offline / PASS content-rating"
node scripts/check-precache.mjs  -> 26 precached files OK
grep chain  -> exit 0
eslint -c round--eslint-r1e.config.mjs <5 files>  -> exit 0, no output
git status --short: same 17 staged entries as before (M/A), nothing unstaged, no untracked files (node_modules symlink removed)
```
