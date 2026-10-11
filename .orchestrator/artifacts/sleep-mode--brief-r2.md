# Brief — sleep-mode r2 (re-dispatch 1; test strength)

Agent name: sleep-mode-builder-r2 · effort: high · worktree `/home/user/wt-sleep-mode` (r1 staged). The r1 brief binds. E2E_PORT=18840 E2E_MOCK_PORT=18841. Stage, do not commit. Expected to touch only `tests/e2e/sleep.spec.mjs` (and `js/main.js` only if a test exposes a real bug — say so).

Step 4 tally `artifacts/sleep-mode--tally-step4-r1.json` is RE-DISPATCH on "tests where implied": two conductor mutants survive the e2e spec:
1. `artifacts/sleep-mode--mutation-tap-through-r1.txt` — removing `state.swallowClick = true;` in js/main.js passes. Add an e2e case: asleep, tap (pointer press + click) at the position of a visible control (e.g. the settings button once controls would show, or any `[data-action]` element under the veil) → the display wakes AND that control's action does NOT fire (no dialog opens / no state change). It must fail with the mutant.
2. `artifacts/sleep-mode--mutation-playback-not-recorded-r1.txt` — removing `state.lastPlaybackAt = Date.now();` passes. Add an e2e case: `idleSleepHours:1`, playback runs for a while past the original idle deadline, then stops → the display stays awake (no veil) right after playback ends, and sleeps only one idle period after the last playback poll. It must fail with the mutant.
For each, paste the new case failing with the mutant applied (in a temp copy) and passing without it. Criteria 1–5 must still pass; paste them.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/sleep-mode--handback-builder-r2.md` — FIRST line `produced_by: … · phase: sleep-mode · round: r2`, header fields, blank line, `Agent: sleep-mode-builder-r2 · dispatched: <stamp>`.
