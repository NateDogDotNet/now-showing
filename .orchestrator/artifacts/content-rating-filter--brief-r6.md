# Brief — content-rating-filter r6 (re-dispatch 5 of 5 — the last)

Agent name: content-rating-filter-builder-r6 · effort: high · worktree `/home/user/wt-content-rating-filter` (staged tree 71b9b7e). Earlier briefs bind. E2E_PORT=19420 E2E_MOCK_PORT=19421. Stage, do not commit. Touch only the phase Outputs (expected: js/main.js, tests/e2e/content-rating.spec.mjs, and a unit test file if natural). Do not touch js/display.js (Q25 is routed to a later phase).

From `artifacts/content-rating-filter--review-cold-r4.md` as triaged in `.orchestrator/phases/content-rating-filter.md` ("Step 7 triage — r4"):
1. C4I1 — the post-decode re-check in showPoster (js/main.js, after `await display.show()`) has no test: removing it passes every case. Add one that FAILS with it removed. Hold the DECODE, not the download: e.g. serve title 4's image via page.route as a very large (or slowly streamed/chunked) image so the pre-draw check passes, then save PG-13 while display.show() is still decoding; or restructure so showPoster can be tested with an injected display. Paste the failure with the re-check removed (temp copy) and the pass without. If after a real attempt no deterministic test is possible, say so with what you tried (status: blocked for this item only).
2. C4M1 — in applySettings, decide whether the on-screen poster is still allowed and call blockPoster() BEFORE awaiting display.apply (a custom frame load has no timeout). e2e: one Save that tightens the limit and changes to a slow custom frame URL (page.route delay) → the above-limit poster is gone before the frame finishes loading.
3. C4M4 — a test where `limitNowPlaying` is absent/undefined behaves as on (kills the `!== false` → `=== true` mutant).

Criteria 1–5 must still pass; paste them. Lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`. Keep the content-rating spec under the 180 s E2E_SPEC_TIMEOUT. Write nothing into .orchestrator/artifacts except the handback.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/content-rating-filter--handback-builder-r6.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: content-rating-filter · round: r6`, header fields, blank line, `Agent: content-rating-filter-builder-r6 · dispatched: <stamp>`.
