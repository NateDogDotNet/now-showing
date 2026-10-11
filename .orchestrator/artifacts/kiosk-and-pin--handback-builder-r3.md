produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: kiosk-and-pin · round: r3
status: complete        failure_class: n/a
paths: /home/user/wt-kiosk-and-pin/tests/kiosk.test.js (staged, with the r1/r2 staged set unchanged: css/app.css index.html js/kiosk.js js/main.js js/settings-ui.js sw.js tests/e2e/kiosk.spec.mjs tests/e2e/smoke.spec.mjs)
criteria: 1 met (node --test tests/kiosk.test.js: 29 pass, 0 fail) · 2 met (npm test: 277 pass, 0 fail) · 3 met (npm run test:e2e -- kiosk: "all 32 kiosk cases passed", PASS kiosk; E2E_PORT=22420 E2E_MOCK_PORT=22421) · 4 met (check-precache: 28 precached files OK) · 5 met (grep exit 0) · 6 met (grep exit 0) · lint met (eslint r1e config on tests/kiosk.test.js, exit 0)
deviations: none. Only tests/kiosk.test.js edited; js/kiosk.js untouched (git diff -- js/kiosk.js empty after the mutant was restored). No real bug found.
questions: none

Agent: kiosk-and-pin-builder-r3 · dispatched: 2026-10-10T22:16:12Z

Added one test: "after many wrong PINs the stored lock itself ends within 15 minutes, also after a reload".
For 10, 20 and 50 wrong PINs (1 s apart) it asserts lockedUntil - now <= LOCK_MAX_MS after every failure,
then for both the in-memory lock and parseLock(JSON.stringify(lock)): still locked at last+15min-1,
lockRemainingMs is 0 at last+15min and +1, and verifyPin accepts the right PIN. (The pure layer has no
lock gate inside verifyPin; "accepted again" is lockRemainingMs === 0, which is what submit() checks.)

Mutant proof: removed Math.min(..., LOCK_MAX_MS) in recordFailure (sed on js/kiosk.js), ran the unit file:
  not ok 16 - after many wrong PINs the stored lock itself ends within 15 minutes, also after a reload
    error: 'wrong PIN 9: lockedUntil is at most 15 min ahead'
  # pass 28  # fail 1
Restored js/kiosk.js from a copy; `git diff --quiet -- js/kiosk.js` printed kiosk-clean. Unmutated: 29 pass.
