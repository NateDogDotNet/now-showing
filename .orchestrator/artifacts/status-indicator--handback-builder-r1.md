produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: status-indicator · round: r1
status: complete        failure_class: n/a
paths: index.html, css/app.css, js/main.js, tests/e2e/status.spec.mjs (all staged in /home/user/wt-status-indicator, not committed)
criteria:
1. met — `E2E_PORT=21920 E2E_MOCK_PORT=21921 npm run test:e2e -- status` -> 7 cases ok, `PASS status` (RED first: 4 cases failed before implementation)
2. met — grep -Eq 'pixelShift: *false' tests/e2e/status.spec.mjs, exit 0
3. met — npm test: 233 pass, 0 fail
4. met — grep -q 'id="status-dot"' index.html, exit 0
5. met — node scripts/check-precache.mjs: "26 precached files OK"
Full `npm run test:e2e` was also run; only the tail (ending `PASS ui-rotation`) was inspected, so I did not see every spec's result.
deviations: none
questions: none

Agent: status-indicator-builder-r1 · dispatched: 2026-10-10T17:27:38Z

Design: the pill hides under body.idle (the existing wake() state, no new timer). updateStatus() skips every #status write while idle (0 mutations in 3 s). It calls statusText() and toggles the dot's hidden attribute on each tick, and wake()/idle transitions call it. The dot (#status-dot, 6px, opacity .35) sits in a safe-area corner via data-corner 0-3 and rotate(var(--ui-rotation)). It advances every 5 min on its own interval; the start corner derives from Date.now(). It is hidden when not idle, under body.asleep, and when statusIndicator is 'off'. Poster-blocked is unaffected.
