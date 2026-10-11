# Brief — content-rating-filter r2 (re-dispatch 1)

Agent name: content-rating-filter-builder-r2 · effort: high · worktree `/home/user/wt-content-rating-filter` (r1 staged). The r1 brief binds. E2E_PORT=19420 E2E_MOCK_PORT=19421. Stage, do not commit. Touch only the phase Outputs.

1. Lint: tests/e2e/content-rating.spec.mjs:145:84 "'contentRating' is defined but never used" (eslint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`) — fix it; lint must exit 0 on every staged JS file.
2. Conductor ruling K20 (see `.orchestrator/phases/content-rating-filter.md`, residual R1): when `maxContentRating` (or `limitNowPlaying`) changes and the poster on screen is not allowed under the new setting, it must be replaced at once EVEN WHEN OFFLINE — by an allowed cached poster if one exists, otherwise by the empty card ("No posters within the household limit" or similar) with the poster layers hidden (a body class + css/app.css rule is fine; js/display.js is not in your Output). Online behaviour (the r1 forced tick) stays. e2e first (paste it failing on r1): show title 4 with no limit, `mock.down()`, set PG-13 → title 4 is gone from the screen within ~1 s and never returns over several offline rotations; with an allowed cached poster available it shows that, with none it shows the empty card and no poster.

Criteria 1–5 must still pass; paste them. Do not write into .orchestrator/artifacts except the handback.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/content-rating-filter--handback-builder-r2.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: content-rating-filter · round: r2`, header fields, blank line, `Agent: content-rating-filter-builder-r2 · dispatched: <stamp>`.
