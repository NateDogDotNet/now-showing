produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: rename-now-showing · round: r2
status: complete        failure_class: n/a
paths: index.html (staged; r1 files remain staged unchanged)
criteria:
1 met — grep/node check command exits 0.
2 met — git grep clean (exit 0); README count 1 (exit 0).
3 met — all 7 plexPoster.* keys in js/, shell-${VERSION} in sw.js; exit 0.
deviations: none (no e2e run, per instruction)
questions: none

Agent: rename-builder-r1 · dispatched: 2026-10-14T20:56:13Z

Change: index.html:13 `<meta name="apple-mobile-web-app-title" content="Now Showing" />` (was "Posters").
Outputs: criterion 1 exit=0; criterion 2 exit=0 and exit=0 (count=1); criterion 3 exit=0.
