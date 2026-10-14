# release-bump

- Mode: afk        Tags: —        Blocked by: docs (78b9f67), rotate-plex-token (debe086), real-server-validation (5c664af), real-server-validation-extended (128b62e), rename-now-showing (7192007) — all done
- Agent type: orchestrator-builder; model sonnet, effort high
- Claimed: 2026-10-14T21:22:49Z
- Worktree: ../wt-release-bump on branch orch/release-bump from fdcf53d (D12).
- Plan: Output and criterion 7 per D48; criterion 9 per D51–D71 (Roadmap entries); closes M4.

## Pre-flight
- Pre-dispatch run against fdcf53d in ../wt-release-bump (release-bump--ac{1,2,3,6,7,9}-pre-r1.json): ac1 exit 1 (versions all 2.0.0), ac2 exit 0, ac3 exit 0, ac6 exit 0, ac7 exit 1 (clean tree: the criterion expects exactly the seven Output files changed, so it passes only with the builder's staged set), ac9 exit 1 (Roadmap entries not written). ac4 and ac5 (npm test, e2e): last full run at 7192007 exit 0 (`real-server-validation--ac4-r2.json`, 977 s); no code changed since (fdcf53d adds only docs/ and .orchestrator/). ac8 narrated (Step 8 reviews).
- PROBE: `node -e "const l=require('./package-lock.json');console.log(l.version,l.packages[''].version,l.name)"` → `2.0.0 2.0.0 now-showing` — the lockfile carries the version in both places criterion 1 reads — meets criterion 1 (the two lockfile fields exist)
- PROBE: `grep -n "VERSION = " sw.js js/main.js` → sw.js:5 `'2.0.0'`, js/main.js:20 `'2.0.0'`; `grep -n SHELL_CACHE sw.js` → line 6 `shell-${VERSION}`, line 55 deletes every other `shell-*` cache on activate — meets criterion 5 (the spec's stale-cache expectation matches the code)
- PROBE: `grep -n serviceWorkers tests/e2e/lib.mjs` → withApp option `serviceWorkers: 'allow'|'block'` (default block); `tests/e2e/pi-stability.spec.mjs:185` already waits for a `shell-` cache with it on — meets criterion 5 (the harness supports the spec)
- PROBE: `grep -c '(verify)\|not yet verified' README.md` lines 11, 144, 150, 155, 156, 227, 249, 258, 268, 279, 300, 307, 348, 358, 377, 405 — the tag set release-bump updates (K61) — meets criterion 8 (the narrated tag update has a finite list)
- PROBE: `grep -n '(K60)' Roadmap.md` → line 155 — meets criterion 8 (D48's Roadmap wording item is one token)
- git log of the Output paths: version files last touched by landed phases; README/Roadmap by 7192007 (rename); no draft work for this phase.
- Step 3: orchestrator-builder release-builder-r1, sonnet, high; brief artifacts/release-bump--brief-r1.md; closer preflight ok (release-bump--preflight.json)
- Dispatched: 2026-10-14T21:24:12Z        Re-dispatches: 0
