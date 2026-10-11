# Brief — pi-stability r3 (re-dispatch 2)

Agent name: pi-stability-builder-r3 · effort: medium · worktree `/home/user/wt-pi-stability` (r2 staged). The r1 and r2 briefs bind. E2E_PORT=23620 E2E_MOCK_PORT=23621. Stage, do not commit. Reviews: `/home/user/plex-poster-app/.orchestrator/artifacts/pi-stability--review-r2.md` (Minor 1) and `--review-cold-r2.md` (Minors 1, 2); triage in `.orchestrator/phases/pi-stability.md` (Step 7 triage — r2).

Tests first; paste each failing on r2 (or on the named mutant applied to r2):
1. PSA1: two e2e cases that pin reloadMustWait's waits. (a) A long crossfade (e.g. crossfadeMs 8000) running across the reload time → the reload happens only after the fade ends. Must fail with the `'a poster is fading in'` line removed. (b) With deviceHelper on (`--helper --helper-fake`), a wake reload (lastReload older than 12 h, schedule end) does not happen until the TV wake has finished (power on → TV_WAKE_MS → the first poster, then the reload). Must fail with `|| state.tvWaking` removed. Put (b) in whichever spec owns its harness (helper.spec.mjs or pi-stability.spec.mjs; both are Output).
2. PSC1: reloadMustWait also waits while `Date.now() < state.manualWakeUntil`. e2e (the cold review's repro): asleep under the schedule at 03:59:20, key press at 03:59:21, advance → no reload before the 60 s manual wake ends; the screen stays awake until then.
3. PSC2: syncSleepClock shifts `bootAt` by the detected clock jump, as it does lastPlaybackAt. e2e (the cold review's repro): boot with the fake clock at 1970-01-01 06:58, no lastReload, set the clock to a plausible date at 06:59 (asleep by schedule), jump to the schedule end → no wake reload.
Run criteria 1–5 and the full `npm run test:e2e` once at the end; lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`; paste outputs. Touch only the phase Output.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/pi-stability--handback-builder-r3.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: pi-stability · round: r3`, header fields, blank line, `Agent: pi-stability-builder-r3 · dispatched: <stamp>`.
