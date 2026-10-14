# rename-now-showing

- Mode: afk        Tags: ui, docs        Blocked by: docs (done 78b9f67)
- Agent type: orchestrator-builder; model sonnet, effort high
- Claimed: 2026-10-14T19:47:03Z
- Worktree: ../wt-rename-now-showing on branch orch/rename-now-showing from 5bd76c3 (D12).
- Plan: added by D52 (owner, 2026-10-14: "I also want to rename this app to \"Now Showing\""); Output and criterion 5 extended by D55 (ui-rotation empty-card race). Commit b1a74b4.

## Pre-flight
- Pre-dispatch run against b1a74b4: criterion 1 exit 1, criterion 2 exit 1 (old name in README.md:1, README.md:164, Roadmap.md:1, index.html:6, index.html:47, js/plex.js:8, manifest.webmanifest:2, scripts/serve.mjs:120), criterion 3 exit 0. Criteria 4 and 5: the ui-rotation spec failed three times on 2026-10-14 (D55; `real-server-validation--ac4-r1.json`); not re-run before dispatch.
- PROBE: `git grep -n 'Plex Poster Display' -- . ':!docs/' ':!.orchestrator/'` → 8 lines, none under tests/ — meets criterion 2 (the edit list is finite; no test asserts the old name)
- PROBE: `grep -rn "plex-poster-display" js tests` → js/settings.js:5 EXPORT_FORMAT, tests/settings.test.js:94,198,212, tests/e2e/kiosk.spec.mjs:686 — meets criterion 3 (the export format is kept by D52, so these stay)
- PROBE: `grep -rhoF plexPoster. js | wc -l` and the seven keys of criterion 3 each found in js/ → criterion 3 exit 0 — meets criterion 3
- PROBE: `grep -n "X-Plex-Device-Name" js/plex.js` → js/plex.js:237 sends PRODUCT as the device name too — meets criterion 1 (one constant renames both headers)
- PROBE: `sed -n 69,72p tests/e2e/ui-rotation.spec.mjs` and `sed -n 271p js/main.js` → the unhide and the measurement are two evaluates; a tick runs showEmpty(false) — fails criterion 5 — D55
- git log of the Output paths: last touched by landed phases (9bc93ed, 0bf5655, 51f8aa9); no draft work for this phase.
- Step 3: orchestrator-builder rename-builder-r1, sonnet, high; brief artifacts/rename-now-showing--brief-r1.md
- Dispatched: 2026-10-14T19:47:59Z        Re-dispatches: 0
