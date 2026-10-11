# Brief — display-decode-hang r2 (re-dispatch 1; test only)

Agent name: display-decode-hang-builder-r2 · effort: high · worktree `/home/user/wt-display-decode-hang` (staged tree 086a7de). The r1 brief binds. E2E_PORT=20220 E2E_MOCK_PORT=20221. Stage, do not commit. Touch ONLY tests/e2e/display-decode.spec.mjs.

From `artifacts/display-decode-hang--review-r1.md`:
1. Object-URL leak (Minor 1): count `URL.createObjectURL` and `URL.revokeObjectURL` calls in an init script and assert that after the presses no object URL is left unrevoked except the ones the two layers currently show. It must FAIL when the claiming draw's revoke in js/display.js is deleted (paste that, from a temp copy) and pass on the real code.
2. Timing drift (Minor 2): record how many presses land more than ~50 ms off the crossfadeMs + 200 ms target, print it, and fail if more than 10% drift (so a slow machine fails loudly instead of quietly proving less).
Criteria 1–4 must still pass; paste them; run the spec at least 3 times. Lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/display-decode-hang--handback-builder-r2.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: display-decode-hang · round: r2`, header fields, blank line, `Agent: display-decode-hang-builder-r2 · dispatched: <stamp>`.
