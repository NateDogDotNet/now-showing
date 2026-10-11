# Brief — status-indicator r3 (re-dispatch 2)

Agent name: status-indicator-builder-r3 · effort: medium · worktree `/home/user/wt-status-indicator` (r2 staged). The r1 brief binds. E2E_PORT=21920 E2E_MOCK_PORT=21921. Stage, do not commit. Edit ONLY tests/e2e/status.spec.mjs unless a test exposes a real bug (then say so in the handback).

Review `/home/user/plex-poster-app/.orchestrator/artifacts/status-indicator--review-r2.md` Minor 1 and 2:
1. "asleep hides the dot" boots a healthy app, so the dot is hidden anyway — it passes with the `body.asleep .status-dot` rule removed. Make the case have something to report (take the mock down after the first poster, controls idle) so the dot would show if not for sleep, then assert it is hidden.
2. Nothing guards the wake catch-up `if (wasIdle) updateStatus()` in js/main.js. Add an assertion that on wake the pill's text is current at once (read it before the next 1 s tick could refresh it — e.g. immediately after the wake input, or with the clock controlled).
Prove each: temporarily remove the guarded line, watch the case fail, restore it (leave the code exactly as staged). Run criteria 1–5 and lint (`npx eslint -c /home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs tests/e2e/status.spec.mjs js/main.js`) and paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/status-indicator--handback-builder-r3.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: status-indicator · round: r3`, header fields, blank line, `Agent: status-indicator-builder-r3 · dispatched: <stamp>`.
