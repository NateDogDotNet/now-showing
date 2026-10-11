# Brief — cache-first-fetch r2 (re-dispatch)

Agent name: cache-first-fetch-builder-r2 · worktree `/home/user/wt-cache-first-fetch` (r1 staged). r1 brief binds; read `artifacts/cache-first-fetch--review-r1.md`. Touch only this phase's Output. Use E2E_PORT=18620 E2E_MOCK_PORT=18621. Stage, do not commit.

1. **K4 (conductor ruling, review I1):** in `js/main.js`, when showing a poster whose image came from the cache fails (decode error), delete that entry from the poster cache and fetch it once over the network (store the fresh blob as usual); if the network attempt also fails, fall through to the existing failure handling. No retry loop. Add an e2e case: fill the cache, corrupt every stored blob (as the reviewer did), show the 8 posters again → each is fetched once (`transcode` == 8 after `reset-stats`), no lasting "could not be decoded" loop, and the cache holds valid entries afterwards. A `poster-cache.js` `delete(ratingKey)` (or similar) is fine.
2. **M1:** a non-numeric or non-finite limit falls back to the default limit (100) instead of emptying the cache; unit test.
3. **M2:** a direct assertion that after an artwork change (new thumb) the poster is downloaded exactly once and then served from the cache.
4. **M3:** make the "`get` throwing" test readable.
Plan criteria 1–4 must still pass. Handback `/home/user/plex-poster-app/.orchestrator/artifacts/cache-first-fetch--handback-builder-r2.md` — FIRST line `produced_by: … · round: r2`; criteria lines for items 1–4 and plan 1–4; then blank line and `Agent: cache-first-fetch-builder-r2 · dispatched: <stamp>`.
