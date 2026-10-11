# Brief — metadata-and-now-playing r2 (re-dispatch 1)

Agent name: metadata-and-now-playing-builder-r2 · effort: medium · worktree `/home/user/wt-metadata-and-now-playing` (r1 staged). The r1 brief binds. E2E_PORT=21420 E2E_MOCK_PORT=21421. Stage, do not commit.

One item: eslint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs` reports `scripts/mock-plex.mjs:56:13 'contentRating' is assigned a value but never used`. Fix it (use it or drop it — do not change the mock's behaviour) so lint exits 0 on every staged JS file. Then re-run criteria 1–6 and paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/metadata-and-now-playing--handback-builder-r2.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: metadata-and-now-playing · round: r2`, header fields, blank line, `Agent: metadata-and-now-playing-builder-r2 · dispatched: <stamp>`.
