# Brief — device-helper-integration r2 (re-dispatch 1)

Agent name: device-helper-integration-builder-r2 · effort: medium · worktree `/home/user/wt-device-helper-integration` (r1 staged). The r1 brief binds. E2E_PORT=23120 E2E_MOCK_PORT=23121. Stage, do not commit. Conductor ruling on your question: Q-dhi1 → K37, accepted as below. Phase record: `.orchestrator/phases/device-helper-integration.md` (Step 4 r1).

Items (tests first; paste each new test failing on the r1 code, or on the named mutant applied to it):
1. Lint: `tests/e2e/helper.spec.mjs:72:7 'now' is assigned a value but never used` (eslint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`). Lint must exit 0 on every staged JS file.
2. K37: narrow the e2e console filter. Ignore ONLY a console error for a 404 on `/__helper/status` (the boot probe without --helper) and the K32 404/403 on `/config.json`; every other console error — including any other `/__helper/` error — still fails.
3. TV wake timing: with the fake clock, after a wake the first poster fetch happens no earlier than the power-on request + TV_WAKE_MS, and within ~2 s after that. Must fail with `await new Promise((resolve) => setTimeout(resolve, TV_WAKE_MS));` removed from wakeTv(), and with `wakeTv().then(() => !state.asleep && next());` replaced by `wakeTv(); next();`.
4. Switching deviceHelper OFF after it was on (Save, with a helper present) stops every helper call: no power off at the next sleep, no power on at wake, no temperature refresh in Diagnostics, no `CPU temperature` line. Must fail with `const helperActive = () => helper.available;`. Fix the app if needed so the setting alone gates use (the probe result alone must not).
Run criteria 1–5 and the full `npm run test:e2e`; paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--handback-builder-r2.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: device-helper-integration · round: r2`, header fields, blank line, `Agent: device-helper-integration-builder-r2 · dispatched: <stamp>`.
