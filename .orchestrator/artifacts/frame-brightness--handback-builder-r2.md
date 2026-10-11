produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: frame-brightness · round: r2
status: complete        failure_class: n/a
paths: tests/e2e/brightness.spec.mjs (edited, re-staged); r1 staged files unchanged (index.html, js/brightness.js, js/display.js, js/main.js, sw.js, tests/brightness.test.js)
criteria:
  1 met - test -f tests/brightness.test.js && node --test tests/brightness.test.js (13 pass, 0 fail)
  2 met - npm test (248 pass, 0 fail)
  3 met - E2E_PORT=22220 E2E_MOCK_PORT=22221 npm run test:e2e -- brightness (PASS brightness, incl. new case)
  4 met - node scripts/check-precache.mjs (27 precached files OK)
  5 met - test -f css/app.css && ! grep ... (exit 0)
  lint met - npx eslint -c .../round--eslint-r1e.config.mjs tests/e2e/brightness.spec.mjs (exit 0, no output)
deviations: mutation run in a mktemp copy of the worktree (/tmp/tmp.PaPUvIGAmb/w, node_modules symlinked), not in the live worktree; js/display.js in the worktree was never touched (git diff of it vs index is empty).
questions: none

Agent: frame-brightness-builder-r2 · dispatched: 2026-10-10T19:55:16Z

New case in tests/e2e/brightness.spec.mjs: "switching nightDimTarget live leaves one element dimmed". Clock 23:00, nightDim on. Starts target frame, then via the settings form: select stage (live preview) -> assert #stage ~0.6 and #frame none; back to frame (preview); stage then Save; frame then Save. After each switch asserts the other element's computed filter is exactly `none`.

Mutation proof (copy with `clear.style.filter = '';` deleted from display.setBrightness):
  AssertionError [ERR_ASSERTION]: preview stage: #frame is not dimmed a second time
  FAIL brightness
Restored/original run: PASS brightness (output tail above: "ok  switching nightDimTarget live leaves one element dimmed" ... "PASS brightness").
No real bug found; display.js unchanged.
