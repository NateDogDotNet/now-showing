produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: settings-sheet · round: r1
status: complete        failure_class: n/a
paths: index.html, css/app.css, js/settings-ui.js, js/main.js, js/plex.js, tests/plex.test.js, js/duration.js, tests/duration.test.js, js/util.js, scripts/mock-plex.mjs, sw.js, tests/e2e/settings-sheet.spec.mjs, tests/e2e/first-run.spec.mjs (all staged with `git add`, nothing committed; worktree /home/user/wt-settings-sheet). Also appended Q-ss1..Q-ss4 to /home/user/plex-poster-app/.orchestrator/questions.md and wrote this file.
criteria:
  1. met — `test -f tests/plex.test.js && test -f tests/duration.test.js && node --test tests/plex.test.js tests/duration.test.js` -> exit 0, 44 tests, 44 pass
  2. met — `npm test` -> exit 0, 315 tests, 315 pass
  3. met — `E2E_PORT=24020 E2E_MOCK_PORT=24021 npm run test:e2e -- settings-sheet` -> exit 0, "all 22 settings-sheet cases passed" (also passed 3 more times in a row, and inside the full run)
  4. met — `npm run test:e2e -- first-run` -> exit 0, "all 12 first-run cases passed"
  5. met — `grep -Eq 'pixelShift: *false' tests/e2e/settings-sheet.spec.mjs tests/e2e/first-run.spec.mjs` -> exit 0
  6. met — `node scripts/check-precache.mjs` -> "30 precached files OK", exit 0
  7. met — the five-grep chain on js/plex.js, index.html, js/main.js -> exit 0
  8. met — `test -z "$(git status --porcelain -- js/settings.js js/engine.js js/display.js js/layout.js)"` -> exit 0
  Carried must-fixes: C8M2 met (e2e "C8M2 ..."; mutation-checked), C8M1 met (e2e "C8M1 ..."), K30 met (two e2e cases; mutation-checked), K31 met (e2e "K31 ...").
  Full `npm run test:e2e` (run 3 of 3, final code): 17 of 18 spec lines PASS; `brightness` FAILED once on a timing assertion ("22:01: 1 vs 0.96", a fake-clock minute-ramp check, spec I did not touch) and PASSES on its own: 3 of 3 alone, and 3 of 3 mine plus 3 of 3 baseline-1df3be1 when run six at a time. See "Full e2e" below. Not claimed as a clean full-suite pass.
deviations:
  - The rotation time is mapped through a HIDDEN input still named `rotateSeconds` (stores seconds; the preset radios `rotatePreset` and the Custom text field `rotateMinutes` are UI-only and write to it), not a mapping computed only inside read(). Reason: tests/e2e/kiosk.spec.mjs l.693, 705, 729 (outside my Output, not editable) read `#settings-form [name="rotateSeconds"]`.value and expect it to hold the seconds. read()/write() still carry it by name, storage stays seconds, no migration.
  - Only the Sign in with Plex button, its code panel and the server picker wait behind Change. The collapsed "Enter token and server manually" fold stays visible on a configured display (R-SET-1 text says Change reveals "sign-in and manual controls"). Reason: kiosk.spec.mjs l.604-648 opens that fold of a configured display and clicks `#token-toggle` without any Change press; hiding it failed 2 existing kiosk cases in my first full run. Question Q-ss4.
  - Added beyond the literal text, each needed by a named requirement: `createPin` now rejects a reply with no id/code (kind 'parse') and returns `expiresIn`; `pinSignIn()` (settings-ui.js) bounds a code's lifetime from plex.tv's `expiresIn` on the monotonic clock with a 5 s floor and backs failed polls off 2 s to 30 s; a failed manual refresh with a poster still on screen shows a toast with the fixes (Q-ss2); `sleep()` and `actionButton()` in util.js; toast keeps the old `action/onAction` single-button form next to the new `actions` list.
  - The brief named no skill to invoke and `superpowers:verification-before-completion` is not in my skill list; I did the equivalent by re-running every criterion on the final tree (outputs below).
questions: Q-ss1 (after approval on the empty card, Settings opens pre-filled and Save finishes; no auto-save), Q-ss2 (toast on a failed manual refresh), Q-ss3 (card flow steps aside while Settings is open; "Sign in again" uses the sheet's own code; pin lifetime/floor/poll backoff), Q-ss4 (manual fold stays reachable without Change)

Agent: settings-sheet-builder-r1 · dispatched: 2026-10-11T07:19:59Z

## What was built (by file)
- js/duration.js (new, in sw.js SHELL): `presetFor`, `secondsFromMinutes(value, previous)` (clamps to 10 s .. 24 h like the schema, non-numeric returns `previous`), `formatMinutes`.
- js/plex.js: `client.libraryCount(key)` (`totalSize`, `X-Plex-Container-Start=0`, `X-Plex-Container-Size=0`, null on any error or missing/non-count attribute, never throws); `createPin` validates the reply and returns `expiresIn`.
- js/settings-ui.js: exported `pinSignIn()` (one plex.tv code round, shared by the Settings sheet and the empty card), `signIn({token})`, connected card + Change, minute presets over the stored seconds, Advanced fold reset on open, library options with lazy counts (never awaited by `testConnection()`), test result with fix buttons, `startSignIn()` / `test()` for the fixes.
- js/main.js: ONE kind -> fixes table (`FIXES`, `FIXES_BY_KIND`, `fixesFor`, `runFix`) used by the empty card (`showEmpty(show, message, kind)`), the toast and the Settings test result; first-run flow (`syncFirstRun`, `runFirstRun`, `finishFirstRun`; boot no longer opens Settings); C8M2 (rebuildClient before evaluateSleep in applySettings); K30 (pixelShift, pixelShiftMinutes, dailyReload, dailyReloadTime added to the preview's kept keys).
- index.html / css/app.css: empty card (`#firstrun`, `#signin-code-large`, `#empty-actions`), `#connected-card`, `#rotate-field` preset group, `details#advanced`, `#household-help` (C8M1 text), brightness `<output data-for>` and unwrapped `#brightness-hint` (K31).
- js/util.js: `toast(message, { actions: [{label, onClick}], ms })`, `actionButton`, `sleep`.
- scripts/mock-plex.mjs: count request (`X-Plex-Container-Size=0` -> `{size:0,totalSize:8}`), `POST /__mock/counts-fail[?status=]`, `/__mock/empty`, `/__mock/nonempty`; still 8 titles.
- sw.js: `js/duration.js` in SHELL (VERSION untouched).

## RED round (tests first; failures before any implementation)
Unit, `node --test tests/plex.test.js tests/duration.test.js`:
```
not ok 1 - tests/duration.test.js          (Cannot find module '/home/user/wt-settings-sheet/js/duration.js')
not ok 24 - libraryCount reads totalSize from a JSON container, asking for no items     error: 'client.libraryCount is not a function'
not ok 25 - libraryCount accepts a numeric string and zero, and encodes the section key
not ok 26 - libraryCount reads totalSize from an XML container
not ok 27 - libraryCount is null when the attribute is missing or not a count
not ok 28 - libraryCount is null, never a throw, on an error
# tests 28   # pass 22   # fail 6
```
E2E against the unimplemented app (`E2E_SPEC_TIMEOUT=400 node tests/e2e/run.mjs settings-sheet`): `21 of 22 settings-sheet cases failed` (e.g. "U1 configured ... failed: page.waitForFunction: TypeError: Cannot read properties of null (reading 'textContent')", i.e. `#connected-card` did not exist; only the not-configured case passed). `first-run`: `10 of 12 first-run cases failed` (the two that passed are the "configured/provisioned makes no pin request" cases, which hold trivially before the change).
Tests added later in the same dispatch (not red-first): createPin and pinSignIn unit cases in tests/plex.test.js.

## Mutation checks (each in its own `mktemp -d` copy, never the live tree)
- K30: dropped the four kept keys from the preview destructure -> both K30 e2e cases FAIL ("the live move did not carry the unsaved tick: '' !== '0px'"; "the daily reload tick is not previewed").
- C8M2: moved rebuildClient back after evaluateSleep -> C8M2 case FAILS ("the old server was not asked anything after Save: /status/sessions?...").
- Lazy counts: awaited the counts inside testConnection -> "a stalled count request never delays the result" FAILS.
- First-run backoff: replaced the 30 s/60 s/... wait with 1 s -> network-failure case FAILS ("17 pins after 29 s").

## Notes the conductor may want
- C8M2 e2e design: a real pointer or key press on the sheet is itself a manual wake and starts a tick before the click lands, so the case uses an idle-sleep display (the carried `plexPoster.carry` idle clock), opens Settings over the veil with a synthetic click, and submits the form with `requestSubmit()` so Save alone is the waking event; a second mock Plex (`startMockPlex` on a free port) is the "new connection" and the old mock's request log must stay empty.
- The empty-card Test connection/Diagnostics/Sign in again buttons go through the same PIN gate as every route to Settings/Diagnostics. "Turn off unwatched only" saves directly (it is not a protection setting).
- Other existing specs with no seeded settings (`withApp({})`, unconfigured) now start the plex.tv code flow on load, i.e. a real `POST https://plex.tv/api/v2/pins` from those specs (lib.mjs cannot be edited). They still pass (outbound failure just backs off). A later phase may want lib.mjs to intercept plex.tv by default.
- (verify) items unchanged: `totalSize` with `X-Plex-Container-Size=0` and the plex.tv `expiresIn` field are unexercised against a real server.
- README/docs not touched (not in Output): they still say nothing about the first-run code; the `docs` phase should.

## Full e2e (`E2E_PORT=24020 E2E_MOCK_PORT=24021 npm run test:e2e`)
Run 1 (before the Q-ss4 fix): failures `helper` (wake timing "poster 3915 ms after power on, before TV_WAKE_MS") and `kiosk` (2 cases: `#token-toggle` not visible, caused by my hiding the manual fold; fixed). `helper` passed 5 of 5 alone afterwards.
Run 2: everything PASS except `settings-sheet` (my own case, a test race: the sheet's `close` event that undoes the preview runs a task after `dialog.open` goes false; spec fixed to wait for it; 3 consecutive clean runs after).
Run 3 (final code), tail:
```
PASS cache-first  PASS content-rating  PASS display-decode  PASS first-run  PASS helper  PASS kiosk  PASS metadata
PASS now-playing  PASS pi-stability  PASS pixel-shift  PASS rotation  PASS settings-sheet  PASS sleep  PASS smoke
PASS status  PASS ui-rotation  FAIL brightness  exit=1
brightness: AssertionError: 22:01: 1 vs 0.96   (tests/e2e/brightness.spec.mjs:47, the minute-ramp case)
```
`brightness` alone: PASS x3; six concurrent runs (3 on this tree, 3 on a `git archive 1df3be1` copy): all six PASS. I could not reproduce it, so I cannot say whether it is load flake or something this change touches; nothing I changed is on the ramp path (no Settings open in that case). The conductor's own full run is the arbiter.

## Command outputs (final tree)
```
--- 1  node --test tests/plex.test.js tests/duration.test.js   # tests 44  # pass 44  # fail 0   exit 0
--- 2  npm test                                                 # tests 315 # pass 315 # fail 0   exit 0
--- 3  npm run test:e2e -- settings-sheet                       all 22 settings-sheet cases passed / PASS settings-sheet / exit 0
--- 4  npm run test:e2e -- first-run                            all 12 first-run cases passed / PASS first-run / exit 0
--- 5  grep -Eq 'pixelShift: *false' ...                        exit 0
--- 6  node scripts/check-precache.mjs                          30 precached files OK / exit 0
--- 7  grep chain                                               exit 0
--- 8  scope probe for settings.js engine.js display.js layout.js  exit 0
```
`git status --short` at the end (all staged, none committed): M css/app.css, M index.html, A js/duration.js, M js/main.js, M js/plex.js, M js/settings-ui.js, M js/util.js, M scripts/mock-plex.mjs, M sw.js, A tests/duration.test.js, A tests/e2e/first-run.spec.mjs, A tests/e2e/settings-sheet.spec.mjs, M tests/plex.test.js.
