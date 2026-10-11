produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: frame-brightness · round: r1
status: complete        failure_class: n/a
paths: js/brightness.js, tests/brightness.test.js, js/display.js, js/main.js, index.html, sw.js, tests/e2e/brightness.spec.mjs
criteria:
1 met: test -f tests/brightness.test.js && node --test tests/brightness.test.js (13 tests pass, incl. DST under TZ=America/New_York via child process)
2 met: npm test (pass 248, fail 0)
3 met: E2E_PORT=22220 E2E_MOCK_PORT=22221 npm run test:e2e -- brightness (PASS, run twice)
4 met: node scripts/check-precache.mjs (27 precached files OK)
5 met: test -f css/app.css && ! grep -nE 'will-change: *filter|transition[^;]*filter' css/app.css (exit 0; css/app.css not changed)
deviations: css/app.css listed in Output but not needed, untouched. The new controls sit in a nested `<div data-live>` inside the Display protection fieldset (settings-ui only live-previews inside [data-live]; the fieldset itself is not, and pixelShift preview behaviour is left as is). Clock-jump detection hooks syncSleepClock (existing 1 s check, jump > 2 min) rather than a new timer.
questions: none

Agent: frame-brightness-builder-r1 · dispatched: 2026-10-10T19:50:39Z

RED (before implementation):
- node --test tests/brightness.test.js: ERR_MODULE_NOT_FOUND js/brightness.js; # fail 1
- npm run test:e2e -- brightness: FAIL brightness (AssertionError, no filter applied)

GREEN tails:
- node --test tests/brightness.test.js: # pass 13 / # fail 0
- npm test: # pass 248 / # fail 0
- e2e: "ok ramp out, minute by minute / ok ramp in, minute by minute / PASS brightness"
- check-precache: 27 precached files OK

Design: effectiveBrightness = clamp[0.1,1](min(frameBrightness/100, night level)); night level = 1 - min(minutesSinceStart, minutesUntilEnd, 10)/10 * (1 - level/100), in wall-clock minutes (whole-minute steps, DST-safe), no night dim when nightDim false / clock implausible / start==end. display.setBrightness(level, target) sets filter on #frame or #stage only and clears the other. main.js: minute-aligned timer, re-evaluated on applySettings (preview and Save), visibilitychange to visible, clock jump.
