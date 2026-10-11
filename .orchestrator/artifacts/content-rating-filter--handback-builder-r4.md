produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: content-rating-filter · round: r4
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/content-rating.spec.mjs (changed this round, both staged); r1-r3 files still staged and unchanged this round: css/app.css, index.html, js/engine.js, js/plex.js, js/poster-cache.js, js/ratings.js, js/settings-ui.js, scripts/mock-plex.mjs, sw.js, tests/engine.test.js, tests/plex.test.js, tests/poster-cache.test.js, tests/ratings.test.js
criteria:
  1. met - `test -f` x4 && `node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js` -> tests 85, pass 85, fail 0
  2. met - `npm test` -> tests 205, pass 205, fail 0
  3. met - `E2E_PORT=19460 E2E_MOCK_PORT=19461 npm run test:e2e -- content-rating` -> PASS content-rating (6 consecutive full runs after the last edit all PASS; 16 cases incl. new 14, 15, 16); full `npm run test:e2e` exit 0: PASS cache-first, content-rating, rotation, sleep, smoke, ui-rotation
  4. met - `node scripts/check-precache.mjs` -> "26 precached files OK"
  5. met - the four-grep command -> exit 0
  6. narrated (independent reviewer), not run by me
  lint: met - `eslint --no-config-lookup -c .../round--eslint-r1e.config.mjs` on all staged js/mjs files -> exit 0; `git diff --cached --check` -> exit 0
  CCI1 (item 1): met - e2e case 14 failed on a59b8b3, passes now
  CCM1 (item 2): met - case 7 waits for title 4 to be the one on screen; 5 isolated runs + 9 full runs of the suite: no case 7 failure
  A3-rec (item 3): met - e2e case 15 failed on a59b8b3, passes now; case 16 is the brief's literal image-hold scenario
deviations: settings-ui.js is untouched. The brief's wording for item 1 is "the preview passed to onPreview uses the SAVED values for those two keys"; I put that in applySettings (js/main.js) instead of in the UI's read(), because main.js owns the saved state and it is the one choke point for every preview caller (layout controls, reset-layout, import, Cancel's revert). Effect is identical. See "Flakes" below for two unrelated failures seen once each.
questions: none

Agent: content-rating-filter-builder-r4 · dispatched: 2026-10-09T04:33:17Z

## What changed
js/main.js
- applySettings: when `preview` is true, `next` is rebuilt with `maxContentRating` and `limitNowPlaying` taken from the settings in force (the saved ones; a preview never changes them, so they stay the saved values for the life of the dialog). Only Save (or import-then-Save, whose Save goes through read()) changes the limit, so Cancel has nothing to undo for it.
- A3-rec: `state.forceAfter`. applySettings sets it when it wants a forced tick (connection or limit changed) and `state.busy`; tick()'s `finally` runs `tick({force:true})` once if it is set. Only applySettings queues: the refresh control and the timers behave as before (a refresh click during a busy tick is still ignored).
tests/e2e/content-rating.spec.mjs
- `waitForTitle(page, n)` helper; case 7 calls it after `sampleUntil` so the assertion reads the screen only once title 4 is up (CCM1).
- Case 14 (CCI1): PG-13 saved; open Settings, untick the household toggle, change `posterFit` (data-live) there and back, 40 forced refreshes with the dialog open, then Cancel and 10 more. The MutationObserver recorder (`recordActiveAlts`) must show only titles 1, 2, 3, 6; the stored limit is still PG-13; an allowed poster is on screen after Cancel.
- Case 15 (A3-rec): `showNowPlaying:true`, `nowPlayingPollSeconds:5`, rotateSeconds 3600. Title 4 is on screen; a poll tick parks on `/status/sessions` (page.route); PG-13 is saved (title 4 leaves, layers empty); released -> an allowed poster must be up within 3 s (the next scheduled poll is 5 s away). This is the window where the tick had already decided not to force.
- Case 16 (A3-rec, the brief's wording): poster cache emptied, a refresh holds a poster image in flight, PG-13 saved, released -> an allowed poster is up and stays allowed.

## e2e written first, failing on a59b8b3 (the staged r3 tree, before any change to js/main.js)
```
$ E2E_CONTENT_ONLY='^1[456] ' node tests/e2e/run.mjs content-rating
PASS case 16 A3-rec image in flight, limit saved, released        <- passes on a59b8b3 on most runs (see below)
case 14 CCI1 live preview keeps the saved limit failed:
AssertionError [ERR_ASSERTION]: dialog open: only titles within PG-13 were drawn: 1,2,3,4,5,6,7,8
+ actual - expected
+ [ 7, 8, 4, 5 ]
- []
case 15 A3-rec limit saved during a tick keeps its forced tick failed:
AssertionError [ERR_ASSERTION]: an allowed poster followed the running tick at once (on screen: 1, 5058 ms)
FAIL content-rating
```
Repeated on a clean `git archive` of a59b8b3 plus the new spec, 6 full runs: case 14 and case 15 failed in all 6; case 16 failed once of 6 (`an allowed poster is up after the release (on screen: 0, 5338 ms)`), i.e. the same lost-tick window, so case 16 is only intermittently discriminating; case 15 is the deterministic one. No other case failed on the baseline.

## After the fix
```
  ok  unsaved household toggle off + layout preview: 40 refreshes drew only 1,2,3,6
  ok  Cancel: an allowed poster is on screen, none above the limit was ever drawn, the stored limit is still PG-13
PASS case 14 CCI1 live preview keeps the saved limit
  ok  limit saved while a tick waited on /status/sessions: the forced tick ran when it ended (poster 3 after 104 ms)
PASS case 15 A3-rec limit saved during a tick keeps its forced tick
  ok  image held, PG-13 saved, released: allowed poster 6 up after 1608 ms
PASS case 16 A3-rec image in flight, limit saved, released
PASS content-rating
```
Mutations (mktemp copy, removed afterwards):
- the `if (preview) next = {...}` line deleted -> case 14: `dialog open: only titles within PG-13 were drawn: 1,2,3,4,5,6,7,8`
- the `if (force && state.busy) state.forceAfter = true;` line deleted -> case 15: `an allowed poster followed the running tick at once (on screen: 6, 5068 ms)`

## Criteria commands (real tails)
```
node --test (criterion 1 files): # tests 85  # pass 85  # fail 0
npm test: # tests 205  # pass 205  # fail 0
node scripts/check-precache.mjs: 26 precached files OK
npm run test:e2e (full, exit 0): PASS cache-first / content-rating / rotation / sleep / smoke / ui-rotation
eslint (r1e config) on staged js/mjs: exit 0;  git diff --cached --check: exit 0
criterion 5 greps: exit 0
```
Staged tree after this round: 71b9b7e541b65bb0136236d431b0c58ea5e1c6f6. `git status` shows no unstaged or untracked paths.

## Flakes seen (not caused by this round as far as I can tell; I could not reproduce them)
In 9 full content-rating runs under 4-way parallelism, with another candidate's e2e running on the same machine (load average about 5), two runs had one failure each: case 4 (output not captured) and case 10 (`title 4 (R) was shown with no limit`, i.e. `sampleUntil([4])` never saw title 4 in 250 refreshes). Both are cases from earlier rounds; they use the same 250 ms `showNext` read that CCM1 fixes for case 7. After that, 6 consecutive full runs and 5 isolated case 7 runs passed, and 8 runs of cases 4, 7 and 10 alone on the baseline copy passed. My changes do not run on those paths (no limit change, no preview). I did not edit those cases (outside the brief); if the conductor sees them fail, `sampleUntil`/`showNext` is the place to harden.

## Not covered / residuals
- The forced tick queued by a save runs after the in-flight tick even when that tick has itself just drawn an allowed poster, so a second poster can follow immediately. That is the "runs when the current tick ends" reading of A3-rec.
- R2/R3 and the hidden layer holding the blocked image data are unchanged from r3.
