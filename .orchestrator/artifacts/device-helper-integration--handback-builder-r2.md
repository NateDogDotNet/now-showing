produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: device-helper-integration · round: r2
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/helper.spec.mjs (r2 edits); still staged from r1: css/app.css, index.html, js/helper.js, sw.js, tests/helper.test.js
criteria: 1 met (node --test tests/helper.test.js: pass 9 fail 0) · 2 met (npm test: pass 293 fail 0) · 3 met (npm run test:e2e -- helper: PASS helper, 10 cases) · 4 met (node scripts/check-precache.mjs: 29 precached files OK) · 5 met (grep -q name="deviceHelper" index.html && test -f js/helper.js && ! grep -niE brightness js/helper.js: exit 0) · full npm run test:e2e: every spec PASS, exit 0 · lint (round--eslint-r1e.config.mjs) exit 0 on all 5 staged JS files
deviations: none from the brief. Two app changes in js/main.js beyond the test edits (both required by items 3 and 4, see below).
questions: none

Agent: device-helper-integration-builder-r2 · dispatched: 2026-10-11T03:08:38Z

## Items
1. Lint: removed the unused `now` helper from tests/e2e/helper.spec.mjs. eslint exit 0 on js/helper.js, js/main.js, sw.js, tests/e2e/helper.spec.mjs, tests/helper.test.js.
2. K37 console filter: `ignorableConsoleError(text, url)` ignores only a 404 whose location is `/__helper/status`, and a 404/403 on `/config.json`. The spec asserts the function on sample inputs at start (a 404 on `/__helper/display` or `/__helper/calls`, a 500 or 403 on `/__helper/status`, a 500 on config.json, other errors all still fail).
3. TV wake timing (test 7, fake clock, slow poll nowPlayingPollSeconds 20, steps of 250 ms; poster must land in [on + TV_WAKE_MS, on + TV_WAKE_MS + 2250 ms]).
   - On the r1 code it FAILED: `AssertionError: poster 36 ms after power on, before TV_WAKE_MS`. Real r1 bug: a tick already in flight when the wake began (tvWaking is checked only at tick entry) went on to decide and fetch the poster at once. Fix in js/main.js tick(): `const decision = state.asleep || state.tvWaking ? null : ...`; the end of the TV wake ticks again.
   - Mutant, wait removed from wakeTv(): FAIL `poster 39 ms after power on, before TV_WAKE_MS`.
   - Mutant `wakeTv(); next();`: FAIL `poster 20215 ms after power on, more than ~2 s late`. (With the original 5 s poll it survived, poster at 5071 ms, so the test uses a 20 s poll.)
   - Real code: `wake timing: first poster 4193 ms after the power-on request`.
4. deviceHelper switched off after on (test 8a awake -> sleep -> wake; 8b asleep with Settings open, then Save, then wake).
   - Mutant `const helperActive = () => helper.available;`: FAIL `no CPU temperature line` (8a).
   - 8b failed on the r1 code (actual calls `[display false],[display true]`, expected only the power off): wakeTv ran on tvOff although the setting was off. Fix in evaluateSleep: the wake path is `tvOff && helperActive()`; otherwise `tvOff = false` and `next()`. The setting alone now gates use.
   - Note for the conductor: in 8b, a user who switches the setting off while the TV is off (Settings left open as sleep began) gets no power-on at wake, as item 4 asks, so the TV stays off until it is switched on by hand. 8b uses form.requestSubmit() via evaluate because a pointer press asleep is a manual wake even inside a dialog.

## Commands, output tails
- `npm run test:e2e -- helper`: ok lines for all 10 cases, `PASS helper`.
- `npm run test:e2e`: all specs PASS (brightness ... ui-rotation), exit 0.
- Mutation probes ran in a mktemp -d copy, removed afterwards; the live tree holds only the staged edits.
