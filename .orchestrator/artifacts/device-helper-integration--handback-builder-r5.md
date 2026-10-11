produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: device-helper-integration · round: r5
status: complete        failure_class: n/a
paths: css/app.css, index.html, js/helper.js, js/main.js, sw.js, tests/e2e/helper.spec.mjs, tests/helper.test.js (all staged in /home/user/wt-device-helper-integration-r5; r5 edits: css/app.css, js/main.js, tests/e2e/helper.spec.mjs)
criteria:
1. met: test -f tests/helper.test.js && node --test tests/helper.test.js -> 9 pass, 0 fail
2. met: npm test -> 293 pass, 0 fail
3. met: npm run test:e2e -- helper -> PASS helper (14 ok lines, incl. the three new cases)
4. met: node scripts/check-precache.mjs -> 29 precached files OK
5. met: grep -q 'name="deviceHelper"' index.html && test -f js/helper.js && ! grep -niE 'brightness' js/helper.js -> exit 0
extra: full npm run test:e2e exit 0 (all PASS); eslint -c round--eslint-r1e.config.mjs on js/main.js js/helper.js tests/helper.test.js tests/e2e/helper.spec.mjs sw.js exit 0, no output
deviations: none. Scope: the checkbox fix is `flex: none` on the global `input[type="checkbox"]` rule (css/app.css), so it applies to all checkboxes (no visible change to the others, which were already unshrunk).
questions: none

Agent: device-helper-integration-builder-r5 · dispatched: 2026-10-11T04:11:03Z

## Change
js/main.js: added `let savedSettings = state.settings` (updated in applySettings only when `!preview`, i.e. Save/import/boot). `helperActive()` and `probeHelper()` read `savedSettings.deviceHelper`. applySettings compares `savedSettings` with `prevSaved` (the snapshot taken at entry) for probe-on-enable and releaseTv-on-disable. Previews and Cancel go through the preview path and never touch it.

## Tests first (on the r3 code)
New cases appended to tests/e2e/helper.spec.mjs: 10 (DHI1), 11 (DHI2), 12 (DHM1).
- Case 10 on r3 code: `AssertionError [ERR_ASSERTION]: condition not met within 10000 simulated ms at advanceUntil ... helper.spec.mjs:383` (waiting for the second helper call, the power on) -> FAIL helper.
- Case 11 on r3 code (run alone in a temp spec, since case 10 aborts the script; temp file removed): `page.waitForFunction: Timeout 10000ms exceeded ... zz-tmp.spec.mjs:344` (the probe wait) .
- Case 12 on r3 code (run alone, temp file removed): `AssertionError ... actual: false, expected: true` (width check).

## After
`npm run test:e2e -- helper` tail:
  ok  deviceHelper switched off with the TV off: one power on, then silence
  ok  deviceHelper unticked with a live control moved: one power on at the save, then silence
  ok  deviceHelper ticked with a live control moved: probed at the save, CPU temperature shown
  ok  deviceHelper checkbox width 18 = the others
  PASS helper
Full e2e: every spec PASS (now-playing, pixel-shift, rotation, sleep, smoke, status, ui-rotation and the rest), exit 0. Ports E2E_PORT=23420 E2E_MOCK_PORT=23421.
