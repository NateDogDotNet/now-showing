produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: rename-now-showing · round: r1
status: complete        failure_class: n/a
paths: README.md, Roadmap.md, index.html, js/plex.js, manifest.webmanifest, package-lock.json, package.json, scripts/serve.mjs, tests/e2e/ui-rotation.spec.mjs (all staged in /home/nathan/wt-rename-now-showing, not committed)
criteria:
1 met — title/h1/manifest name+short_name/package names/PRODUCT/README heading checks all exit 0 (short_name was "Posters", changed to "Now Showing").
2 met — git grep for the old name outside docs/.orchestrator/README exits clean; README has 1 line with it (the "Formerly Plex Poster Display" line).
3 met — all 7 plexPoster.* keys found in js/, shell-${VERSION} in sw.js; none touched.
4 met — npm test: 327 pass, 0 fail; npm run test:e2e: exit=0, every spec PASS; check-precache: "31 precached files OK".
5 met — three consecutive `node tests/e2e/run.mjs ui-rotation` runs: PASS ui-rotation x3.
6 narrated — repo name, Pages address, docs/ and plex-poster-display/settings export format untouched.
deviations: Out-of-brief note: the worktree had no node_modules, so I temporarily symlinked the main tree's node_modules to run e2e and removed the symlink afterwards (never staged). Early on I accidentally ran three ui-rotation runs concurrently with the full suite on the same ports; they failed from collision, and I re-ran everything sequentially (the results above are from that clean run).
questions: none

Agent: rename-builder-r1 · dispatched: 2026-10-14T19:47:59Z

D55 fix (spec only): `read(selector, reveal)` in tests/e2e/ui-rotation.spec.mjs now unhides #empty, measures and re-hides inside one synchronous page.evaluate, so the app's poster tick (showEmpty(false)) cannot interleave. The empty card is still measured at every rotation. No TDD red step was possible: the race is timing dependent and not deterministic to reproduce.

README: added one line, "*Formerly Plex Poster Display.* Displays that were signed in before the rename keep their old entry under plex.tv Authorized Devices until they sign in again..." and renamed the systemd Description.

Output tails:
npm test -> "# tests 327 / # pass 327 / # fail 0"
npm run test:e2e -> every spec PASS, final "exit=0"
node scripts/check-precache.mjs -> "31 precached files OK"
ui-rotation x3 -> PASS ui-rotation, PASS ui-rotation, PASS ui-rotation
