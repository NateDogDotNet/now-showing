# Brief — settings-sheet r3 (re-dispatch 2, tests only)

Agent name: settings-sheet-builder-r3 · effort: medium · worktree `/home/user/wt-settings-sheet` (r2 staged). The r1 and r2 briefs bind. E2E_PORT=24020 E2E_MOCK_PORT=24021. Stage, do not commit. Output now also includes `tests/e2e/brightness.spec.mjs` and `tests/e2e/helper.spec.mjs` (K49). Edit ONLY those two files.

Apply the clock-race fixes that the r2 handback (`/home/user/plex-poster-app/.orchestrator/artifacts/settings-sheet--handback-builder-r2.md`) describes:
1. brightness.spec.mjs: in the ramp-in and ramp-out cases, replace each bare `pauseAt(...)` with a checked pause that re-pauses until the page's `Date.now()` equals the target (a small helper in the spec; it must give up with a clear error after a bounded number of tries rather than loop forever).
2. helper.spec.mjs: in case 7 and in the shared `wakeSequence` (cases 12 and 13), pause the clock (`pauseAt(Date.now() + 500)` or the checked pause from item 1) after the asleep wait and before the wake, so the power-on time and the poster time are read from a stopped clock.
Every existing assertion stays as strict as it is (TV_WAKE_MS is still a minimum; the ramp values are unchanged). Show each fixed case passing 20 consecutive runs under load (e.g. `npm test` looping alongside). Then run criteria 1–8 and the full `npm run test:e2e` twice; paste the summaries. Lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/settings-sheet--handback-builder-r3.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: settings-sheet · round: r3`, header fields, blank line, `Agent: settings-sheet-builder-r3 · dispatched: <stamp>`.
