produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: status-indicator · round: r3
status: complete        failure_class: n/a
paths: tests/e2e/status.spec.mjs (edited, staged); css/app.css, index.html, js/main.js (r2 staged, unchanged this round)
criteria: 1 met (E2E_PORT=21920 E2E_MOCK_PORT=21921 npm run test:e2e -- status: 8 ok, PASS); 2 met (grep -Eq 'pixelShift: *false'); 3 met (npm test: pass 233, fail 0); 4 met (grep -q 'id="status-dot"' index.html); 5 met (check-precache: 26 precached files OK); lint met (eslint exit 0)
deviations: none. Only tests/e2e/status.spec.mjs edited; no real bug found.
questions: none

Agent: status-indicator-builder-r3 · dispatched: 2026-10-10T18:14:49Z

## Changes (review r2 Minor 1 and 2)
1. Asleep case rewritten. It now boots offline with a fake clock at 12:00 and a sleep window 12:30-13:30. It asserts the dot is visible while awake and idle, then `page.clock.fastForward('31:00')` into the window and waits for `body.asleep`. It asserts the dot is not `hidden` (it still has something to report) and is not visible.
2. New case "waking brings the pill text current at once". It waits 2.2 s idle so the hidden pill's countdown goes stale. Then one `page.evaluate` dispatches `pointermove` on document and reads `#status` in the same task, so no 1 s tick can run between. It asserts the text matches /retrying in/, differs from the stale text, and the pill is not hidden.

## Mutation proofs (each restored; cmp against backups confirms js/main.js and css/app.css are byte-identical to staged)
- Removed `body.asleep .status-dot` from the css/app.css:244 rule:
  `FAIL asleep hides the dot even when there is something to report` / `AssertionError: asleep hides it` / `FAIL status`
- Removed `if (wasIdle) updateStatus();` from wake() in js/main.js:
  `FAIL waking brings the pill text current at once ...` / `AssertionError: pill text refreshed by the wake itself` / `FAIL status`

## Final runs
```
AC1  ok offline / healthy idle / 0 mutations / off / corners / rot90 / asleep / wake ... PASS status
AC2  exit 0
AC3  # pass 233  # fail 0
AC4  exit 0
AC5  26 precached files OK
lint npx eslint -c .../round--eslint-r1e.config.mjs tests/e2e/status.spec.mjs js/main.js -> exit 0, no output
git diff --cached --stat: css/app.css, index.html, js/main.js, tests/e2e/status.spec.mjs (4 files, nothing committed)
```
