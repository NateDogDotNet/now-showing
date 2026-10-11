# Brief — kiosk-and-pin r2 (re-dispatch 1)

Agent name: kiosk-and-pin-builder-r2 · effort: high · worktree `/home/user/wt-kiosk-and-pin` (r1 staged). The r1 brief binds. E2E_PORT=22420 E2E_MOCK_PORT=22421. Stage, do not commit. Conductor rulings on your questions (phase record `.orchestrator/phases/kiosk-and-pin.md`): Q-kp1 → K32, Q-kp2 → K33, Q-kp3 → K34, Q-kp4 → K35 — your proposed readings stand. Output now also includes `tests/e2e/smoke.spec.mjs` (K32).

Three items:
1. Lint: `tests/e2e/kiosk.spec.mjs:102:7 'settleSheet' is assigned a value but never used` (eslint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`). Use or remove it; lint must exit 0 on every staged JS file.
2. K32: in tests/e2e/smoke.spec.mjs, ignore ONLY the console error for a 404/403 on `/config.json` (match on `m.location().url` ending in `/config.json`; every other console error and every pageerror still fails). The full `npm run test:e2e` must exit 0.
3. Root-cause the one-in-~25 failure of "turning it on in Settings hides the controls". Widening a wait is not a fix unless you can say what the wait is waiting for and why it can take longer than 3 s. Find what races (e.g. the sheet's close transition vs. the kiosk class, wake() re-adding `.visible`, the inert toggle, a live-preview apply), fix the cause (app or test), and show the case passing 30 consecutive runs under load (e.g. run the kiosk spec in a loop while `npm test` runs alongside). If it is an app bug, say so.
Run criteria 1–6 plus the full `npm run test:e2e`, and paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/kiosk-and-pin--handback-builder-r2.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: kiosk-and-pin · round: r2`, header fields, blank line, `Agent: kiosk-and-pin-builder-r2 · dispatched: <stamp>`.
