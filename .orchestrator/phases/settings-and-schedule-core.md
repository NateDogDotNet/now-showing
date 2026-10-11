# settings-and-schedule-core

- Mode: afk        Tags: —        Blocked by: e2e-harness (done, d409ad7)
- Agent type: orchestrator-builder (no BMad install); model sonnet, effort medium
- Claimed: 2026-10-08T22:45:09Z
- Worktree: ../wt-settings-and-schedule-core on branch orch/settings-and-schedule-core from d409ad7 (D12)

## Pre-flight
- Pre-dispatch run artifacts/settings-and-schedule-core--preflight-r1.md. Criterion 7 passes VACUOUSLY before the phase (the PIN keys are not in SCHEMA, so sanitize drops them); the post-build run is the evidence.
- PROBE: `TZ=America/New_York node -e "new Date(2026,10,1,1,30)"` → EDT (fall-back night 2026-11-01 exists in the run years) — meets criterion 3
- PROBE: `TZ=Europe/London node -e "new Date(2026,9,25,1,30)"` → BST (fall-back 2026-10-25) — meets criterion 3
- PROBE: `date +%Y` → 2026; MIN_PLAUSIBLE_YEAR 2026 (Q23) — meets criterion 9
- Dispatched: 2026-10-08T22:45:37Z        Re-dispatches: 1        Inner revision rounds: 0
- Last verification: 2026-10-08T23:04:39Z
- Commit(s): 33976fe — one phase, its own commit
- Step 3: orchestrator-builder settings-and-schedule-core-builder-r1, sonnet, medium; brief artifacts/settings-and-schedule-core--brief-r1.md

## Plan acceptance — Step 4 r1 (conductor-run via evidence.py exec in ../wt-settings-and-schedule-core)
| # | Item (verbatim from the plan) | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | `test -f tests/settings.test.js && test -f tests/schedule.test.js && node --test tests/settings.test.js tests/schedule.test.js`… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac1-r1.json` |
| 2 | `npm test`… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac2-r1.json` |
| 3 | `test -f tests/schedule.test.js && TZ=America/New_York node --test tests/schedule.test.js && TZ=Europe/London node --test tests/sc… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac3-r1.json` |
| 4 | `node scripts/check-precache.mjs`  (`js/schedule.js` added to `SHELL`; `VERSION` is NOT bumped here)… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac4-r1.json` |
| 5 | `node -e "import('./js/settings.js').then(m=>{const d=m.defaults();const need=['rotateUi','statusIndicator','posterCacheLimit','ma… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac5-r1.json` |
| 6 | `node -e "import('./js/settings.js').then(m=>{const d=m.defaults();const ok=d.pixelShift===true&&d.dailyReload===true&&d.posterCac… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac6-r1.json` |
| 7 | `node -e "import('./js/settings.js').then(m=>{const o=m.toExport({...m.defaults(),plexToken:'t',settingsPinHash:'a'.repeat(64),set… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac7-r1.json` |
| 8 | `node -e "import('./js/settings.js').then(m=>{const s=m.fromImport(JSON.stringify({format:'plex-poster-display/settings',version:1… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac8-r1.json` |
| 9 | `node -e "import('./js/schedule.js').then(m=>{for(const f of ['parseHHMM','inWindow','msUntilNext','isPlausibleClock'])if(typeof m… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac9-r1.json` |
| 10 | `test -z "$(git status --porcelain -- index.html css js/main.js js/display.js js/engine.js js/plex.js js/poster-cache.js js/layout… | evidence.py exec (plan command) | 0 | `settings-and-schedule-core--ac10-r1.json` |

## Scope — reconcile MATCH, 5 touched; scope-r1 exit 0
## Pre-commit (substitute): lint `-r1b` (r1d config) exit 0; format/tests/security exit 0
## Mutations r1 (all killed, tests run under TZ=America/New_York and TZ=Europe/London): import-plants-pin 1 · export-leaks-pin 1 · empty-window-24h 1 · no-gap-walk 1 · fires-at-now 5 · pixelshift-default-off 4 · implausible-clock 1
- Step 7 dispatched 2026-10-08T22:49:41Z: settings-and-schedule-core-review-anchored-r1 (opus); tree ffe69fd

## Step 7 triage — r1 (artifacts/settings-and-schedule-core--review-r1.md, CHANGES REQUESTED)
- Important 1 (code-bug, test strength): "The "fall-back" test never examines a fall-back night under TZ=America/New_York" — conductor mutant later-repeat survives (`settings-and-schedule-core--mutation-later-repeat-r1.txt`: 0 failed). → r2.
- Minor 2 (code-bug, test strength): "The cross-midnight window's start boundary is untested." — mutant late-start-boundary survives (0 failed). → r2.
- Minor 3 (spec-gap): "For the new numeric keys, out-of-range values clamp instead of falling back to the default, and wrong-typed values (`''`, `true`, `false`, `[]`, `'  '`) become the minimum." CONDUCTOR RULING K3 (spec text: sanitisers "coerce bad input to the default"): for the keys this phase adds, non-numbers, booleans, arrays and blank/whitespace strings return the default; finite out-of-range numbers clamp to the range; count keys (posterCacheLimit, idleSleepHours, pixelShiftMinutes) round to integers. Existing 2.0 keys keep `num` unchanged. → r2. Listed at the next stop.
- Step 7 tally `settings-and-schedule-core--tally-step7-r1.json` RE-DISPATCH. Re-dispatch r2: recipient settings-and-schedule-core-builder-r2 (fresh). Re-dispatches: 1
- FOLLOW-UP (owner: Nathan): K3 ruling — new numeric settings: junk/blank → default, out-of-range → clamp, counts rounded; list at the next stop
- Dispatched r2: 2026-10-08T23:01:18Z (brief artifacts/settings-and-schedule-core--brief-r2.md)

## Plan acceptance — Step 4 r2
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac1-r2.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac2-r2.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac3-r2.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac4-r2.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac5-r2.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac6-r2.json` |
| 7 | plan criterion 7 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac7-r2.json` |
| 8 | plan criterion 8 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac8-r2.json` |
| 9 | plan criterion 9 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac9-r2.json` |
| 10 | plan criterion 10 (verbatim in the r1 table) | evidence.py exec | 0 | `settings-and-schedule-core--ac10-r2.json` |
- Pre-commit r2: lint `-r2b` (r1d config) exit 0; format/tests/security/scope `-r2` exit 0. Extra zones (conductor): schedule tests pass under Australia/Sydney, UTC, Asia/Kolkata (14/14 each).
- Mutations r2 (all killed): later-repeat 1 (was surviving) · late-start-boundary 1 (was surviving) · lenient-strictnum 2 (K3) · import-plants-pin 1 · export-leaks-pin 1 · empty-window-24h 1 · no-gap-walk 1 · fires-at-now 5 · pixelshift-default-off 4 · implausible-clock 1
- Confirmation review SKIPPED (Step 7: closures proven by conductor mutants): Important 1 → later-repeat-r2 killed; Minor 2 → late-start-boundary-r2 killed; Minor 3 (K3) → lenient-strictnum-r2 killed.

## Seam check (merged: serve-config-guard, e2e-harness, validation-checklists, settings-and-schedule-core)
- `round--seam-w2-r1.json` exit 0 (npm test, npm run test:e2e, check-precache)

## Pre-commit — lint/format/tests/security exit 0 (r2 records above)

## Step 8 tally (`settings-and-schedule-core--tally-step8-r2.json`)
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| CLAUDE.md conventions | 15/15 |
| tests where implied | 10/10 |
| decision log respected | 10/10 |
| code reads cleanly | 10/10 |
| commit message accurate | 5/5 |
| **Total** | **100/100** (100%) |
**Band:** COMPLETE
**Caps applied:** none

- Landed: 33976fe — "Add the 2.1 settings keys and local-time schedule helpers"
- Read-back ok; attribution (commit form) ok

## Reviews
- r1: artifacts/settings-and-schedule-core--review-r1.md (CHANGES REQUESTED); r2 confirmation skipped (mutant closures)

## Notes / reconciliation
- Unknowns: none. Out of scope: none. Invalidated: none. Every later phase consumes these keys without editing js/settings.js (convention 10).
