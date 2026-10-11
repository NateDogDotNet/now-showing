# Brief — status-indicator r2 (re-dispatch 1)

Agent name: status-indicator-builder-r2 · effort: medium · worktree `/home/user/wt-status-indicator` (r1 staged). The r1 brief binds. E2E_PORT=21920 E2E_MOCK_PORT=21921. Stage, do not commit.

One item: eslint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs` reports `tests/e2e/status.spec.mjs:144:140 'mock' is defined but never used`. Drop the unused destructured parameter (do not change what the test checks) so lint exits 0 on every staged JS file. Then re-run criteria 1–5 and paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/status-indicator--handback-builder-r2.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: status-indicator · round: r2`, header fields, blank line, `Agent: status-indicator-builder-r2 · dispatched: <stamp>`.
