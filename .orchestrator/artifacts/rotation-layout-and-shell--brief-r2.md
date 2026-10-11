# Brief — rotation-layout-and-shell r2 (re-dispatch)

Agent name: rotation-layout-and-shell-builder-r2 · worktree `/home/user/wt-rotation-layout-and-shell` (r1 staged). r1 brief binds. Use E2E_PORT=18610 E2E_MOCK_PORT=18611. Stage, do not commit.

Fix review Minor 1 (`artifacts/rotation-layout-and-shell--review-r1.md`): css/app.css:188 `.toast { max-width: min(92vw, 520px) }` uses the physical width; at a short landscape viewport rotated 90/270 a long toast clips. Use the viewer's width (`min(calc(var(--vw) * 0.92), 520px)`). Add to `tests/e2e/ui-rotation.spec.mjs` a short-landscape viewport (844x390) at rotation 90 and 270 with a ~110-character toast, asserting its box is inside the viewport — it must fail before the CSS fix (paste that). Plan criteria 1–7 must still pass.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/rotation-layout-and-shell--handback-builder-r2.md` — FIRST line `produced_by: … · round: r2`, header fields, blank line, `Agent: rotation-layout-and-shell-builder-r2 · dispatched: <stamp>`.
