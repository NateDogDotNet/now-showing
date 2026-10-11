# Brief — device-helper-integration r5 (re-dispatch 3, BRANCH candidate)

Agent name: device-helper-integration-builder-r5 · effort: medium · worktree `/home/user/wt-device-helper-integration-r5` (the r3 tree staged; branch orch/device-helper-integration-r5). The r1–r3 briefs bind. E2E_PORT=23420 E2E_MOCK_PORT=23421. Stage, do not commit. Work ONLY in that worktree. Review: `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--review-r3.md`; triage in `.orchestrator/phases/device-helper-integration.md` (Step 7 triage — r3).

APPROACH r5: keep a `saved` settings snapshot updated only when settings are persisted (Save, import, reset), and make the probe-on-enable and releaseTv-on-disable decisions compare the new saved value with the previous SAVED value — not with the previewed state; helperActive() follows the saved value, so an unsaved preview never starts or stops helper use.

Fix, tests first (paste each failing on the r3 code):
1. DHI1: e2e — deviceHelper on, asleep with the TV off (power off recorded), open Settings over the veil, untick deviceHelper, move a LIVE control (e.g. Frame brightness), Save → `/__helper/calls` shows exactly one power on after the power off; nothing after through a wake and a second sleep.
2. DHI2: e2e — deviceHelper off, open Settings, tick it, move a live control, Save → a probe is made and Diagnostics shows the CPU temperature.
3. DHM1: the deviceHelper checkbox does not shrink (e.g. `flex: none` on the input); same width as the other checkboxes.
Run criteria 1–5, the full `npm run test:e2e`, and lint (`/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`); paste outputs. Touch only the phase Output.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--handback-builder-r5.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: device-helper-integration · round: r5`, header fields, blank line, `Agent: device-helper-integration-builder-r5 · dispatched: <stamp>`.
