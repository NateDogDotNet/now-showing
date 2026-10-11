produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: kiosk-and-pin · round: r2
status: complete        failure_class: n/a
paths: js/kiosk.js, tests/kiosk.test.js, js/main.js, js/settings-ui.js, index.html, css/app.css, sw.js, tests/e2e/kiosk.spec.mjs, tests/e2e/smoke.spec.mjs (all staged in /home/user/wt-kiosk-and-pin, nothing committed; r2 itself edited only tests/e2e/kiosk.spec.mjs, tests/e2e/smoke.spec.mjs, js/settings-ui.js)
criteria: 1 met (`node --test tests/kiosk.test.js`, 28/28, exit 0) · 2 met (`npm test`, 276/276) · 3 met (`npm run test:e2e -- kiosk`, "all 32 kiosk cases passed", exit 0) · 4 met (`node scripts/check-precache.mjs`, 28 precached files OK) · 5 met (grep, exit 0) · 6 met (grep, exit 0; "deterrent" is in index.html x1 and js/kiosk.js x2) · 7 narrated, not mine · item 1 lint met (eslint r1e config over every staged .js/.mjs, exit 0) · item 2 K32 met (full `npm run test:e2e`, every spec PASS, exit 0) · item 3 root cause: see below; the original one-in-~25 failure did NOT reproduce here in ~160 runs, so its cause is not proven; two real races of the same class were found and fixed
deviations: js/settings-ui.js touched again (in Output); one behaviour-neutral app change (closeSheet, below). Nothing outside Output.
questions: none

Agent: kiosk-and-pin-builder-r2 · dispatched: 2026-10-10T21:09:23Z

## Item 1, lint
Removed the unused `settleSheet` helper from tests/e2e/kiosk.spec.mjs. `eslint -c .orchestrator/artifacts/round--eslint-r1e.config.mjs <all 7 staged js/mjs files>` -> exit 0.

## Item 2, K32 (tests/e2e/smoke.spec.mjs)
The smoke console listener now skips an error only when `m.location().url.endsWith('/config.json')` AND the text matches `/status of (404|403)\b/`. Every other console error and every pageerror still lands in `errors` and fails `assert.deepEqual(errors, [])`. Full `npm run test:e2e`: smoke PASS, no FAIL line in the output, exit 0.

## Item 3, the flake: what I found, and what I could not prove
Honest status first: I could not reproduce the original failure of "turning it on in Settings hides the controls". Runs of that case: 40 under 6 busy-loops (4 cores), 100 with 4 parallel loops + `npm test` + 6 busy-loops, 15 under CDP CPU throttling x1/x6/x20, and 30 more of the full 32-case spec under load: 0 failures in all. So the exact r1 failure is unexplained by observation. What I did find, by reading the code paths and by stress:

A. A real race, reproduced once in 30 loaded full-spec runs (other case, same class): "#token-toggle asks for the PIN and the field re-hides when the sheet closes" failed with `'text' !== 'password'` (re-hidden on close). Cause (app): the token was re-hidden only in the dialog's `close` EVENT handler. `dialog.close()` sets `open=false` at once but queues the `close` event as a later task, so a reader that sees `open===false` (the test's `waitForFunction(!open)`, or any code) can run before the field is hidden. Fix (app, js/settings-ui.js): `closeSheet()` hides the token and closes in one step; Save, Cancel and Reset everything use it; the `close` handler stays for Escape. Not new behaviour: the plan already says the field re-hides when the sheet closes; it now does so in the same step. Verified: that case 30/30 under load after the fix.

B. The wait in the flaky case was waiting on a self-expiring state. After turning kiosk mode OFF, wake() shows the controls and a 3.5 s timer hides them; every pointermove re-arms it. The test polled for `.visible` after the mouse moves. If the browser stalls for 3.5 s or more between the last pointer event and the poll (a starved renderer: a due timer runs before the next rAF poll), `.visible` is already gone and does not come back, so widening the timeout from 3 s to 10 s cannot help (the poll is for a state that is gone, not one that is late). I demonstrated this in a scratch copy of the r1 spec (mktemp dir, own ports): a 4 s page stall before the poll fails it with `Timeout 10000ms exceeded`, 0 s and 1 s stalls pass. That is a test defect (it asserted a window, not a state), not an app bug. I did not see it happen on its own, so I cannot say it was the r1 failure; it is the only wall-clock-window dependence in the case.
Fix (test): the case now runs on the paused fake clock (`clock: {time: T0}` + `open(..., {pause: true})`), so the 3.5 s window never lapses by itself and every step is an exact state assertion; time moves only through `runFor`. It also now asserts more: shown on save with `inert:false`, idles away after `runFor(3600)` (pointer moved off the controls first; a pointer resting on them keeps them up, by design), shown again by pointer. 30 consecutive runs under load (8x `npm test` in a loop + 6 busy loops, 4 cores): pass=30 fail=0.

Same-class scan: other post-close assertions in the spec already wait on `!open` and then read state that is set synchronously by onSave, or use `dialog[open]` in main.js's key handler; I found no other reader of `close`-event-only state.

## Commands and output tails
```
eslint r1e config, staged js/mjs        -> exit 0
node --test tests/kiosk.test.js         -> # tests 28 # pass 28 # fail 0
npm test                                -> # tests 276 # pass 276 # fail 0
node scripts/check-precache.mjs         -> 28 precached files OK
grep name="kioskMode" + id="pin-dialog" -> exit 0
grep deterrent index.html js/kiosk.js   -> exit 0 (index.html:1, js/kiosk.js:2)
E2E_PORT=22420 E2E_MOCK_PORT=22421 npm run test:e2e -- kiosk
  ... PASS the PIN stays without a true flag ...
  all 32 kiosk cases passed
  PASS kiosk                            -> exit 0
E2E_PORT=22420 E2E_MOCK_PORT=22421 npm run test:e2e   (twice)
  PASS brightness ... PASS kiosk ... PASS smoke, PASS status, PASS ui-rotation; no FAIL; exit 0
target case x30 under load              -> pass=30 fail=0
token case x30 under load               -> pass=30 fail=0
full kiosk spec x30 under load          -> pass=30 fail=0
```
Before the fixes the same full-spec loop gave pass=29 fail=1 (the token case, A).
Staging: `git status --porcelain` shows 9 staged paths, no unstaged changes. Scratch servers and the probe dir were removed.
