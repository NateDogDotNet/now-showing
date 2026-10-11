# Brief — device-helper-integration r3 (re-dispatch 2)

Agent name: device-helper-integration-builder-r3 · effort: medium · worktree `/home/user/wt-device-helper-integration` (r2 staged). The r1 and r2 briefs bind. E2E_PORT=23120 E2E_MOCK_PORT=23121. Stage, do not commit. Phase record: `.orchestrator/phases/device-helper-integration.md` (Step 4 r2).

One item — the side effect you flagged: switching deviceHelper OFF while the app has the TV powered off must not strand the screen. Rule: if the app powered the TV off and the setting is then switched off (Save), the app sends ONE power-on at that moment (if the helper is still available), clears its powered-off state, and only then goes silent (no further helper calls, no power-off at the next sleep). If that last power-on fails, log it once and still go silent. Leave everything else as r2 has it.
Test first (paste it failing on r2): e2e with `serveArgs: ['--helper','--helper-fake']`, deviceHelper on → sleep (power off recorded) → open Settings over the veil, untick deviceHelper, Save → `/__helper/calls` shows exactly one power on after the power off, and no helper call afterwards through a wake and a second sleep. Keep the r2 "switched off stops every helper call" case passing.
Run criteria 1–5, the full `npm run test:e2e`, and lint (`/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`); paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--handback-builder-r3.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: device-helper-integration · round: r3`, header fields, blank line, `Agent: device-helper-integration-builder-r3 · dispatched: <stamp>`.
