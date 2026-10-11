produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: content-rating-filter · round: r7
status: complete        failure_class: n/a
paths: js/main.js, js/settings.js, tests/settings.test.js, tests/e2e/content-rating.spec.mjs (all staged, not committed). Untouched this round: js/settings-ui.js, js/display.js. Staged tree otherwise as at a9da765. Stray files outside the repo: /e2e1.log, /e2e2.log, /e2e3.log (see deviations).
criteria: 
1. met: `test -f ... && node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js` gave tests 86, pass 86, fail 0.
2. met: `npm test` gave tests 206, pass 206, fail 0.
3. met: `E2E_PORT=19420 E2E_MOCK_PORT=19421 npm run test:e2e -- content-rating` run 3 times with the default 4 workers: exit 0 each time, 19 of 19 cases PASS each time (18 old + new case 19).
4. met: `node scripts/check-precache.mjs` gave "26 precached files OK", exit 0.
5. met: the grep chain exits 0.
Item 1 (C6I1/D29): met, new e2e case 19 failed on the a9da765 code and passes after the main.js fix. Item 2 (A6I1): met, case 18's last wait now accepts any of titles 1, 2, 3, 6. Item 3 (K21/D31): met, unit test failed first, passes after the settings.js fix.
Lint: `eslint -c round--eslint-r1e.config.mjs js/main.js js/settings.js js/settings-ui.js tests/settings.test.js tests/e2e/content-rating.spec.mjs` exit 0, no output.
deviations: (a) I wrote three e2e log files to /e2e1.log, /e2e2.log, /e2e3.log by mistake ($TMPDIR was empty, so `$TMPDIR/e2eN.log` resolved to the filesystem root). The safety check refused my `rm` of them, so I left them. They are outside the repo and harmless; please delete them. (b) I symlinked node_modules into the worktree to run playwright (from /home/user/wt-e2e-harness/node_modules) and removed the symlink at the end (git status clean of it). (c) The existing assertion `sanitize({maxContentRating:'X'}) === ''` in tests/settings.test.js contradicted D31, so I replaced it with the new fail-closed assertions. Otherwise none.
questions: none

Agent: content-rating-filter-builder-r7 · dispatched: 2026-10-10T12:49:30Z

## What changed

### 1. C6I1 (js/main.js applySettings, D29)
- A preview now keeps the saved `maxContentRating`, `limitNowPlaying`, `staticRatingKey` and `staticTitle` (all four taken from `prev`).
- The on-screen re-check `if (display.currentPoster && !allowedOnScreen(display.currentPoster)) blockPoster();` runs on EVERY apply (the `!preview &&` guard is gone). It is still before `await display.apply`.
- e2e case 19 (`19 C6I1 import an unsaved pin, refresh, Cancel`): PG-13 saved; open Settings; `setInputFiles('#import-file', {"staticRatingKey":"4"})`; wait for the form to show the pin; assert nothing saved; 12 refreshes with the dialog open, `recordActiveAlts` must never see title 4 (only 1, 2, 3, 6) and an allowed poster is on screen; Cancel; allowed poster on screen; 10 more refreshes; still only 1, 2, 3, 6; stored limit still PG-13 and no pin saved.

Failing first, on the unmodified a9da765 main.js (only the new test added):
```
case 19 C6I1 import an unsaved pin, refresh, Cancel failed:
AssertionError [ERR_ASSERTION]: dialog open after the import: only titles within PG-13 were drawn: 1,4
+ actual - expected
+ [
+   4
+ ]
- []
    at file:///home/user/wt-content-rating-filter/tests/e2e/content-rating.spec.mjs:761:10
FAIL content-rating
```
After the fix: `ok  unsaved import of a pin on title 4: 22 refreshes drew only 1,2,3,6; Cancel left an allowed poster; nothing saved` / `PASS case 19`.

Mutations (in a `mktemp -d` copy, /tmp/tmp.WPQYuCU6o1, not the live tree):
- Pin no longer held in the preview (`next = { ...next, maxContentRating, limitNowPlaying }`): case 19 FAILS, "dialog open after the import: only titles within PG-13 were drawn: 4,6". Killed.
- `!preview &&` put back on the re-check (pin still held): cases 19 and 14 PASS. NOT killed, and I could not build an e2e that kills it. Reason: with the limit and the pin both held, a preview cannot change whether the poster on screen is allowed, so the every-apply re-check on previews is defence in depth that no e2e route reaches. It is implemented as D29 asks; I am reporting that it has no test of its own.

### 2. A6I1 (case 18)
The final `await waitForTitle(page, titleNo(parked[0]))` is replaced by `waitForAllowedTitle(page)` (new helper next to `waitForTitle`: polls until the active poster is 1, 2, 3 or 6, 10 s). The take-down assertions before it (`activeCount === 0`, `poster-blocked`) are unchanged. The check line now prints the title that came up. Case 18 passed in all 3 full runs and in the filtered runs.

### 3. K21 (js/settings.js, D31)
`maxContentRating: ['', (v) => (['', 'G', 'PG', 'PG-13', 'R', 'NC-17'].includes(v) ? v : 'PG-13')]`. No other key touched. Absent, `null` and `undefined` still give `''` (handled by `sanitize` before the fixer runs).
Unit test (tests/settings.test.js, in "enumerations fall back to the default"): junk values `'X', 'PG13', 'pg13', 'pg-13', 'R18', ' R ', 'NC17', 5, true, {}, []` give `PG-13`; `{}`, `null`, `undefined` and `defaults()` give `''`; the valid-value loop is unchanged.
Failing first (before the settings.js change):
```
not ok 15 - enumerations fall back to the default
  error: maxContentRating "X"  '' !== 'PG-13'
# pass 19
# fail 1
```
After: `node --test tests/*.test.js` gave `# tests 206 # pass 206 # fail 0`.

## Commands and output tails
```
eslint -c .../round--eslint-r1e.config.mjs js/main.js js/settings.js js/settings-ui.js tests/settings.test.js tests/e2e/content-rating.spec.mjs   -> exit 0, no output
npm run test:e2e -- content-rating  (x3, E2E_PORT=19420 E2E_MOCK_PORT=19421)  -> run1=0 run2=0 run3=0; "PASS case" count 19 each; last lines "PASS case 4 cached posters offline / PASS content-rating"
node --test tests/ratings.test.js tests/plex.test.js tests/engine.test.js tests/poster-cache.test.js  -> # tests 86 # pass 86 # fail 0
npm test  -> # tests 206 # pass 206 # fail 0
node scripts/check-precache.mjs  -> 26 precached files OK
git status --short: M/A on the previously staged files plus M js/settings.js and M tests/settings.test.js; nothing unstaged, no untracked files.
```
