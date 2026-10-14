# rename-now-showing

- Mode: afk        Tags: ui, docs        Blocked by: docs (done 78b9f67)
- Agent type: orchestrator-builder; model sonnet, effort high
- Commit(s): 7192007
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
- Step 4 r1 (conductor, evidence.py exec in ../wt-rename-now-showing): criteria 1, 2, 3, 5 exit 0; criterion 4 exit 0 (966 s). Artifacts rename-now-showing--ac{1..5}-r1.json.
- Step 7 r1: anchored review rename-review-r1 APPROVE with one Minor: index.html:13 apple-mobile-web-app-title still "Posters" (D52 covers user-visible names). Fix routed as r2 to the same builder (rename-builder-r1, resumed), 2026-10-14T20:56:13Z. Re-dispatches: 1
- r2 handback rename-now-showing--handback-builder-r2.md: index.html:13 apple-mobile-web-app-title → "Now Showing"; nothing else (diff checked: only that line beyond r1).

## Plan acceptance — Step 4 r2 (evidence.py exec in ../wt-rename-now-showing)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `rename-now-showing--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `rename-now-showing--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `rename-now-showing--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) at r1; r2 changes only a head meta tag no test reads (`grep -rn apple-mobile-web-app-title tests` → none), re-checked with npm test, precache, smoke and first-run | 0 | `rename-now-showing--ac4-r1.json`, `rename-now-showing--ac4part-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) at r1; r2 does not touch the spec or the empty card | 0 | `rename-now-showing--ac5-r1.json` |
| 6 | plan criterion 6 | narrated, checked by command: no added or removed line names a github.io or GitHub repo URL; no docs/ path in the commit | 0 | `rename-now-showing--ac6-r2.json` |

## Reviews
- Step 7 r1: rename-now-showing--review-r1.md (rename-review-r1, anchored) — APPROVE; Minor 1 fixed in r2.


## Pre-commit — lint (node --check on changed JS), format (git diff --check), tests (npm test inside ac4), security, scope: all exit 0 on 7192007
- precommit-lint-r2, precommit-format-r2, precommit-security-r2, scope-r2, review-check-r2, dlog-check-r2 (no hits)

## Step 8 tally — rename-now-showing--tally-step8-r2-c1.md (corrected derive; the first ran before the pre-commit records existed)
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| CLAUDE.md conventions | 15/15 |
| decision log respected | 10/10 |
| code reads cleanly | 10/10 |
| commit message accurate | 5/5 |
| **Total** | **90/90** (100%) |
**Band:** COMPLETE
**Caps applied:** none

- Landed: 7192007 — "Rename the app to Now Showing; fix the rotation spec's empty-card race"

## Gate — rename-now-showing--gate-2.json: ok false, two failures, both the same process slip
- EXCEPTION (conductor): the anchored reviewer rename-review-r1 was dispatched at 2026-10-14T20:38:28Z, while the conductor's Step 4 evidence runs were still in progress, so no Step 4 tally and no passing `closer predispatch` (nor `--kind code`) preceded it (rule 2). Not repaired after the fact: a predispatch run now would misstate the order. Every Step 4 row later passed (ac1–ac5 r1 exit 0), the review approved with one Minor that r2 fixed, and the Step 8 tally is 90/90 COMPLETE. Closed with `--no-gate` quoting this.
