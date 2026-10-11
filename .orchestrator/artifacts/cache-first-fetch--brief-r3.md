# Brief — cache-first-fetch r3 (re-dispatch)

Agent name: cache-first-fetch-builder-r3 · worktree `/home/user/wt-cache-first-fetch` (r2 staged). r1 and r2 briefs bind. E2E_PORT=18710 E2E_MOCK_PORT=18711. Stage, do not commit.

From `artifacts/cache-first-fetch--review-r2.md`:
1. N1 — js/poster-cache.js limit guard: accept only a finite number or a non-blank numeric string, and require >= 1; anything else (null, '', false, [], 0, negative, NaN, Infinity, 'abc', undefined) falls back to DEFAULT_LIMIT. Extend the unit test with null, '', false, [] and 0 (each must keep entries, not empty the cache). Paste the new cases failing before the fix.
2. N2 — make the `createPosterCache` default limit DEFAULT_LIMIT (100), not 30.
Plan criteria 1–4 must still pass. Touch only js/poster-cache.js and tests/poster-cache.test.js.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/cache-first-fetch--handback-builder-r3.md` — FIRST line `produced_by: … · round: r3`, header fields, blank line, `Agent: cache-first-fetch-builder-r3 · dispatched: <stamp>`.
