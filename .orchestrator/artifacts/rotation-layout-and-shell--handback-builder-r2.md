produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: low · phase: rotation-layout-and-shell · round: r2
status: complete        failure_class: n/a
paths: css/app.css, tests/e2e/ui-rotation.spec.mjs (plus r1-staged js/display.js, tests/e2e/rotation.spec.mjs, unchanged this round), all in /home/user/wt-rotation-layout-and-shell
criteria: 1 met (npm run test:e2e -- rotation: PASS) · 2 met (npm run test:e2e -- ui-rotation: PASS, includes new 844x390 cases) · 3 met (grep) · 4 met (npm test: pass 67, fail 0) · 5 met (check-precache: 24 precached files OK) · 6 met (grep) · 7 met (empty git status probe) · 8 narrated, not re-run
deviations: none. Test drives the toast by setting text and unhiding #toast directly (about 120 chars).
questions: none

Agent: rotation-layout-and-shell-builder-r2 · dispatched: 2026-10-08T23:38:00Z

Fix: css/app.css `.toast` max-width is now `min(calc(var(--vw) * 0.92), 520px)`.

Before the CSS fix (new cases added, CSS unchanged), E2E_PORT=18610 E2E_MOCK_PORT=18611:
AssertionError: 844x390 rotation 90 long toast: toast inside viewport {"left":88,"top":-16,"right":175.25,"bottom":406}
FAIL ui-rotation

After the fix:
  ok  844x390 rotation 90 long toast
  ok  844x390 rotation 270 long toast
PASS ui-rotation
PASS rotation
npm test: # pass 67 / # fail 0
node scripts/check-precache.mjs: 24 precached files OK
Staged: css/app.css, js/display.js, tests/e2e/rotation.spec.mjs, tests/e2e/ui-rotation.spec.mjs (not committed).
