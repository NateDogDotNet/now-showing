# Brief — frame-brightness r2 (re-dispatch 1)

Agent name: frame-brightness-builder-r2 · effort: medium · worktree `/home/user/wt-frame-brightness` (r1 staged). The r1 brief binds. E2E_PORT=22220 E2E_MOCK_PORT=22221. Stage, do not commit. Edit ONLY tests/e2e/brightness.spec.mjs unless the test exposes a real bug (then say so).

One item: a conductor mutant that drops `clear.style.filter = '';` in `display.setBrightness` (js/display.js) survives the suite. Add an e2e case that switches `nightDimTarget` on a RUNNING page (frame → stage and back, through the settings form's live preview or Save, during the dim window) and asserts after each switch that the other element's computed filter is `none` (no double dim). Prove it: remove that line, watch the case fail, restore it (leave js/display.js exactly as staged). Run criteria 1–5 and lint (`npx eslint -c /home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs tests/e2e/brightness.spec.mjs`) and paste outputs.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/frame-brightness--handback-builder-r2.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: frame-brightness · round: r2`, header fields, blank line, `Agent: frame-brightness-builder-r2 · dispatched: <stamp>`.
