# Brief — pi-stability r2 (re-dispatch 1)

Agent name: pi-stability-builder-r2 · effort: high · worktree `/home/user/wt-pi-stability` (r1 staged). The r1 brief binds. E2E_PORT=23620 E2E_MOCK_PORT=23621. Stage, do not commit. Conductor rulings on your questions (phase record `.orchestrator/phases/pi-stability.md`, Step 4 r1): Q-ps2 → K40, Q-ps3 → K41, Q-ps4 → K42 accepted as you proposed; **Q-ps1 → K39 changed** (item 2).

Two items, tests first (paste each failing on r1):
1. A conductor mutant that drops `if (!res.ok) why = …` in runDailyReload survives: nothing tests a probe that gets an HTTP error. sw.js passes a non-ok navigation response through, so a reload then strands the display on an error page. Add an e2e case: the app server answers 503 (or 404) for `index.html` requested with `cache: 'no-store'` (e.g. `context.route` / `page.route` on that request only, or a server option your spec already uses) at the reload time → no reload, a logged skip naming the HTTP status, and Diagnostics shows `Daily reload: skipped (…)`.
2. K39: a manual wake (a key press or tap while asleep — `sleepWhy` becomes 'manual wake') must NOT trigger the 12 h wake reload; a wake that ends sleep (schedule end, playback) still does. e2e: asleep under a schedule with lastReload older than 12 h → key press → no reload, the 60 s manual wake runs; then the schedule ends → one reload.
Run criteria 1–5 and the full `npm run test:e2e` once at the end; lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`; paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/pi-stability--handback-builder-r2.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: pi-stability · round: r2`, header fields, blank line, `Agent: pi-stability-builder-r2 · dispatched: <stamp>`.
