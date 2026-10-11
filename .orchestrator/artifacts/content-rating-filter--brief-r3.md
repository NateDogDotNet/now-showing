# Brief — content-rating-filter r3 (re-dispatch 2)

Agent name: content-rating-filter-builder-r3 · effort: high · worktree `/home/user/wt-content-rating-filter` (r2 staged). Earlier briefs bind. E2E_PORT=19420 E2E_MOCK_PORT=19421. Stage, do not commit. Touch only js/main.js and tests/e2e/content-rating.spec.mjs.

One item — residual R4 (your r2 handback): a tick already downloading a poster when a stricter limit is saved can still draw it. Re-check `allowedOnScreen(poster)` against the CURRENT settings immediately before every draw in js/main.js (the random/now-playing path in tick, the heal path's second show, and the offline cached path in handleFailure); a poster that fails is not drawn and not marked shown (the next tick picks another). e2e first (paste it failing on r2): delay the mock image response for title 4 (or hold the image request with page.route), start a rotation that will show title 4 with no limit, save PG-13 while the download is in flight → title 4 is never drawn.

Criteria 1–5 must still pass; paste them. Lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`. Do not write into .orchestrator/artifacts except the handback.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/content-rating-filter--handback-builder-r3.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: content-rating-filter · round: r3`, header fields, blank line, `Agent: content-rating-filter-builder-r3 · dispatched: <stamp>`.
