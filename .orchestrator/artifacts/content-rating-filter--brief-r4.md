# Brief — content-rating-filter r4 (branch candidate; third re-dispatch)

Agent name: content-rating-filter-builder-r4 · effort: high · worktree `/home/user/wt-content-rating-filter-r4` (a detached copy of tree a59b8b3 — work ONLY there). Earlier briefs bind. E2E_PORT=19460 E2E_MOCK_PORT=19461. Stage, do not commit. Touch only js/main.js, js/settings-ui.js, tests/e2e/content-rating.spec.mjs (and css/app.css or index.html only if needed).

From the r3 reviews (`artifacts/content-rating-filter--review-cold-r3.md` Important 1 and Minor 1; `artifacts/content-rating-filter--review-r3.md` recommendation):
1. CCI1 — the settings live preview bypasses the saved limit (read() in js/settings-ui.js takes the unsaved household toggle; applySettings(..., {preview:true}) returns before blockPoster() and the forced tick; after Cancel an above-limit poster stays up). Keep `maxContentRating` and `limitNowPlaying` OUT of the live preview: the preview passed to onPreview uses the SAVED values for those two keys, so only Save (or import-then-Save) changes the limit. Cancel then has nothing to undo for the limit. e2e first (paste it failing on a59b8b3): PG-13 saved; open Settings, untick the household toggle without saving, change a Frame & layout control, let ticks run → no title above PG-13 or unrated is ever drawn; press Cancel → no above-limit poster is on screen afterwards.
2. CCM1 — make e2e case 7 deterministic under 4-way parallelism (wait for the rotation to finish, e.g. poll until the active layer changes or a tick completes, instead of reading 250 ms after the click).
3. A3-rec — a limit saved while a tick is running must not lose its forced tick (state.busy): queue it so it runs when the current tick ends. e2e: hold an image request in flight, save a limit, release → a new allowed poster appears without waiting for rotateSeconds.

Criteria 1–5 must still pass; paste them. Lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`. Do not write into .orchestrator/artifacts except the handback.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/content-rating-filter--handback-builder-r4.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: content-rating-filter · round: r4`, header fields, blank line, `Agent: content-rating-filter-builder-r4 · dispatched: <stamp>`.
