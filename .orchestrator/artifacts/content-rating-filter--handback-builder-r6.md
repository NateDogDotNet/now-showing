produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: content-rating-filter · round: r6
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/content-rating.spec.mjs, tests/engine.test.js (all three staged in /home/user/wt-content-rating-filter; nothing committed; staged tree now a9da765, was 71b9b7e)
criteria:
- C4I1 (post-decode re-check has a test that fails without it): met. New e2e case 18. Mutant (re-check removed, temp copy) fails it; real tree passes. Output below.
- C4M1 (block before awaiting display.apply, with an e2e): met. js/main.js applySettings; new e2e case 17. Failed on the old code (RED run), passes now; the old-order mutant also fails it.
- C4M4 (limitNowPlaying absent/undefined behaves as on): met. New unit test in tests/engine.test.js. Mutant `!== false` -> `=== true` fails it.
- Plan criterion 1 (`node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js`): met, 86 pass / 0 fail.
- Plan criterion 2 (`npm test`): met, 206 pass / 0 fail.
- Plan criterion 3 (`npm run test:e2e -- content-rating`, E2E_PORT=19420 E2E_MOCK_PORT=19421): met on 4 of 5 full runs (~80 s each, well under the 180 s E2E_SPEC_TIMEOUT). One run failed in case 13, which I did not touch (see Flake).
- Plan criterion 4 (`node scripts/check-precache.mjs`): met, "26 precached files OK".
- Plan criterion 5 (the grep chain on contentRating / limitNowPlaying / household-toggle): met, exit 0.
- Lint (round--eslint-r1e.config.mjs on the three files), `node --check`, `git diff --cached --check`: all exit 0.
deviations: none. I did not touch js/display.js. Nothing was written into .orchestrator/artifacts except this handback.
questions: none

Agent: content-rating-filter-builder-r6 · dispatched: 2026-10-09T06:20:43Z

## What changed

1. js/main.js, applySettings: the check `if (!preview && display.currentPoster && !allowedOnScreen(display.currentPoster)) blockPoster();` now runs right after the new settings are stored and BEFORE `await display.apply(...)`. The old copy of the check after the await is removed, because it is now redundant: a draw during the await re-checks against the already-updated settings. A preview never changes the limit (CCI1 fix), so it is skipped.
2. tests/e2e/content-rating.spec.mjs: cases 17 and 18, plus imports of `readFileSync`, `join` and `ROOT`.
   - Case 17 (C4M1): title 4 (R) is up; one Save selects a custom frame at `<app>/slow-frame.png` and ticks the household toggle (PG-13). The frame request is parked on a gate via page.route. The case asserts the poster layers go inactive while the frame is still held (at least one frame request in flight), then releases the gate and asserts an allowed poster follows.
   - Case 18 (C4I1): an init script wraps `HTMLImageElement.prototype.decode` in the page so the test can park a decode by alt text. The case parks title 4's decode (it has already passed the pre-draw check), saves PG-13, then parks every further decode and lets title 4's finish. The forced tick then parks at its own decode on an allowed poster, so nothing but the post-decode re-check can have cleared title 4. The case asserts `.poster-layer.active` count is 0 and `body.poster-blocked` is set, then releases that decode and waits for the allowed poster. This holds the decode, not the download.
3. tests/engine.test.js: a test where limitNowPlaying is undefined, and where the property is deleted outright, under PG-13 with R, unrated and unmapped playing titles. Each must give a `random` poster, not `now-playing`.

## Commands and output

RED for C4M1, on the code before the js/main.js edit (case 18 already passed there, since the re-check exists):
```
  ok  PG-13 saved during title 4's decode: taken down once decoded (nothing on screen while the forced tick was held); then allowed poster 6
PASS case 18 C4I1 limit saved during a poster decode
case 17 C4M1 limit + slow custom frame in one Save failed:
AssertionError [ERR_ASSERTION]: title 4 (R) is off the screen while the frame is still loading (on screen: 4)
false !== true
FAIL content-rating
```
After the fix:
```
  ok  PG-13 + slow custom frame in one Save: title 4 gone while the frame was held (2 request(s)); allowed poster 6 after release
  ok  PG-13 saved during title 4's decode: taken down once decoded (nothing on screen while the forced tick was held); then allowed poster 3
PASS case 18 C4I1 limit saved during a poster decode
PASS case 17 C4M1 limit + slow custom frame in one Save
PASS content-rating
```
(2 frame requests: the live preview and the Save each ask for the frame.)

Mutant A, post-decode re-check removed (the `if (!allowedOnScreen(poster)) { blockPoster(); return false; }` block after `await display.show`), in a `mktemp -d` copy, `E2E_CONTENT_ONLY='^18 '`:
```
case 18 C4I1 limit saved during a poster decode failed:
AssertionError [ERR_ASSERTION]: title 4 was taken down after its decode (on screen: 4)
1 !== 0
    at file:///tmp/tmp.ddHnENBxdO/tests/e2e/content-rating.spec.mjs:726:10
FAIL content-rating
```
Pass without the mutation: the line above, "PASS case 18 ...".

Mutant B, the blockPoster check moved back to after the frame await, same temp-copy method, `E2E_CONTENT_ONLY='^17 '`:
```
case 17 C4M1 limit + slow custom frame in one Save failed:
AssertionError [ERR_ASSERTION]: title 4 (R) is off the screen while the frame is still loading (on screen: 4)
false !== true
FAIL content-rating
```

Mutant C, js/engine.js `s.limitNowPlaying !== false` -> `s.limitNowPlaying === true`, temp copy:
```
not ok 30 - limitNowPlaying absent or undefined behaves as on: a playing title above the limit is hidden
# pass 34
# fail 1
```
Real tree: `node --test tests/engine.test.js` gives `# tests 35 / # pass 35 / # fail 0`.

Criteria 1, 2, 4, 5 on the final staged tree:
```
node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js  -> # tests 86 / # pass 86 / # fail 0
npm test                                                                                                -> # tests 206 / # pass 206 / # fail 0
node scripts/check-precache.mjs                                                                         -> 26 precached files OK
grep chain (criterion 5)                                                                                -> exit 0
```
Lint: `eslint --no-config-lookup -c .../round--eslint-r1e.config.mjs js/main.js tests/e2e/content-rating.spec.mjs tests/engine.test.js` -> exit 0.

Criterion 3, five full runs of `npm run test:e2e -- content-rating` (E2E_PORT=19420 E2E_MOCK_PORT=19421). The 18 cases include the new 17 and 18.
```
run1: PASS content-rating  real 1m20.707s
run2: FAIL content-rating  real 1m20.976s   (case 13, see Flake)
run3: PASS content-rating  real 1m20.062s
run4: PASS content-rating  real 1m20.883s
run5: PASS content-rating  real 1m20.638s
```

## Flake

Run 2 failed in case 13 (R4 heal re-download), an r4-era case I did not change:
```
case 13 R4 heal re-download in flight vs a stricter limit failed:
AssertionError [ERR_ASSERTION]: title 4 was picked: its cached copy would not decode and the heal re-download is in flight
    at content-rating.spec.mjs:505:10
```
The case ran about 60 refresh clicks over 30 s and never reached title 4. That is far too many for a random pick from a 4-poster pool to miss, so the likely cause is the Q25 hang in js/display.js (a decode that never settles leaves `state.busy` set). That is the failure the brief routes to a later phase (K23). The failure is not in cases 17 or 18. I have not proved the Q25 link, only that the failure is a never-picked title 4 with the spec otherwise healthy. About 1 in 5 full runs showed it.

## Notes for the conductor

- Case 18 needs the page to wrap `HTMLImageElement.prototype.decode`. This is test-only code in the spec's init script, not production code. The wrapper calls the real `decode()` once released, so the decode itself is real.
- The case 17 frame body is `assets/frames/marquee.png`, read from disk and fulfilled through page.route at a same-origin URL.
- Staged set is exactly the three paths above plus the 12 files already staged for this phase; `git status --short | grep -v '^[AM]  '` is empty.
