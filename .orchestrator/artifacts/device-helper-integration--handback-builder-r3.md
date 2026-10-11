produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: device-helper-integration · round: r3
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/helper.spec.mjs (r3 edits, restaged); still staged from r1/r2: css/app.css, index.html, js/helper.js, sw.js, tests/helper.test.js
criteria: 1 met (node --test tests/helper.test.js: pass 9 fail 0) · 2 met (npm test: pass 293 fail 0) · 3 met (npm run test:e2e -- helper: PASS helper, 11 cases) · 4 met (node scripts/check-precache.mjs: 29 precached files OK) · 5 met (grep -q name="deviceHelper" index.html && test -f js/helper.js && ! grep -niE brightness js/helper.js: exit 0) · full npm run test:e2e: every spec PASS, exit 0 · lint (round--eslint-r1e.config.mjs) exit 0 on js/helper.js, js/main.js, sw.js, tests/e2e/helper.spec.mjs, tests/helper.test.js
deviations: r2's case 8b asserted "the wake sends no power on" with only the earlier power off recorded. The new rule changes that outcome (a Save while the TV is off now sends one power on), so 8b now asserts [off, on] after the Save and nothing at the wake. Case 8a is unchanged. The r2 "switched off stops every helper call" intent still holds (no call after the Save).
questions: none

Agent: device-helper-integration-builder-r3 · dispatched: 2026-10-11T03:40:06Z

## Change
js/main.js: new `releaseTv()`. In applySettings, `if (!state.settings.deviceHelper && prev.deviceHelper) releaseTv();`. If `tvOff` is set it clears it, and if `helper.available` it queues ONE `power(true)` (on the same ordered power chain, so it follows the power off). A failure is logged once by the helper's own once-per-kind logging; nothing further is sent either way. Everything after that stays gated by `helperActive()` (setting off), so no later helper call and no power off at the next sleep.

## Test first
New case 9 (and 8b rewritten, shared `untickAndSave` helper using requestSubmit, because a pointer press while asleep is a manual wake). Case 9: helper on, sleep (power off recorded), open Settings over the veil, untick, Save, calls are exactly [off, on]; then wake via playback, TV_WAKE_MS + 3 s, stop playback, second sleep, +10 s: still exactly [off, on], and no /__helper/ request after the Save.

On the r2 code (before the change), `npm run test:e2e -- helper` failed:
```
  ok  deviceHelper switched off while awake: no power off, no power on, no temperature
AssertionError [ERR_ASSERTION]: condition not met within 10000 simulated ms
    at async file:///.../tests/e2e/helper.spec.mjs:318:5   (waiting for the second helper call, the power on, after the Save)
FAIL helper
```
After the change:
```
  ok  deviceHelper switched off while awake: no power off, no power on, no temperature
  ok  deviceHelper switched off while asleep: one power on at the save, none at the wake
  ok  deviceHelper switched off with the TV off: one power on, then silence
PASS helper
```

## Full runs (E2E_PORT=23120 E2E_MOCK_PORT=23121)
```
node --test tests/helper.test.js: # pass 9 / # fail 0
npm test: # pass 293 / # fail 0
node scripts/check-precache.mjs: 29 precached files OK
criterion 5: exit 0
eslint (round--eslint-r1e.config.mjs) on 5 staged JS files: exit 0
npm run test:e2e: all specs PASS (brightness ... helper ... ui-rotation), exit 0
```
git status: M css/app.css, M index.html, A js/helper.js, M js/main.js, M sw.js, A tests/e2e/helper.spec.mjs, A tests/helper.test.js (all staged, nothing committed).

Not done: the "last power-on fails" branch has no dedicated test (the fake helper cannot fail); case 3 covers a failing power route for the wake path only.
