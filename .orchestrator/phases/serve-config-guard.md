# serve-config-guard

- Mode: afk        Tags:         Blocked by: none
- Agent type: orchestrator-builder (no BMad install: `ls _bmad .bmad-core` → absent); model sonnet
- Claimed: 2026-10-08T22:05:57Z
- Worktree: ../wt-serve-config-guard on branch orch/serve-config-guard from 0f1f82e (D12)

## Pre-flight
- Pre-dispatch acceptance run: artifacts/serve-config-guard--preflight-r1.md (failures are the missing deliverables; passing rows: npm test and scope probes)
- `git log --oneline -- <outputs>`: no prior commit touched the new outputs (checked below)
- PROBE: `node -e "console.log(Object.values(require(\"os\").networkInterfaces()).flat().filter(i=>i.family===\"IPv4\"&&!i.internal).map(i=>i.address))"` → non-loopback IPv4 present (see artifact) — meets criterion 6
- Dispatched: 2026-10-08T22:06:57Z        Re-dispatches: 2        Inner revision rounds: 0
- Last verification: 2026-10-08T22:26:37Z
- Commit(s): 0914090 — one phase, its own commit
- Step 3: orchestrator-builder serve-config-guard-builder-r1, model sonnet (agent definition pin), effort medium; brief artifacts/serve-config-guard--brief-r1.md

## Plan acceptance — Step 4 r1 (conductor-run via evidence.py exec in ../wt-serve-config-guard; script artifacts/round--ac-runner.py)
| # | Item (verbatim from the plan) | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | `test -f tests/serve.test.js && node --test tests/serve.test.js`  (the server is spawned on a free port: the test listens on port 0, reads the port, closes and … | evidence.py exec (plan command) | 0 | `serve-config-guard--ac1-r1.json` |
| 2 | `npm test`… | evidence.py exec (plan command) | 0 | `serve-config-guard--ac2-r1.json` |
| 3 | `grep -q 'isLoopback' scripts/serve.mjs && grep -q 'export function isLoopback' scripts/net.mjs && grep -q 'export function isLoopbackHost' scripts/net.mjs`… | evidence.py exec (plan command) | 0 | `serve-config-guard--ac3-r1.json` |
| 4 | `test -f scripts/serve.mjs && test -f scripts/net.mjs && ! grep -qiE 'x-forwarded\|forwarded' scripts/serve.mjs scripts/net.mjs`  (proxy headers are never consul… | evidence.py exec (plan command) | 0 | `serve-config-guard--ac4-r1.json` |
| 5 | `test -z "$(git status --porcelain -- js css index.html sw.js scripts/mock-plex.mjs)"`… | evidence.py exec (plan command) | 0 | `serve-config-guard--ac5-r1.json` |
| 6 | narrated: run `node --test tests/serve.test.js 2>&1 \| grep -E '^# (pass\|fail\|skipped)'` on a host with a non-loopback IPv4 and confirm the LAN-address tests wer… | evidence.py exec: `node --test tests/serve.test.js` → `# skipped 0` and `# fail 0` (exec form written by the conductor for the narrated item) | 0 | `serve-config-guard--ac6-r1.json` |

## Scope — reconcile block
- `evidence.py git --reconcile` → MATCH, 3 touched (artifacts/serve-config-guard--reconcile-r1.md); staged ⊆ Output: `serve-config-guard--scope-r1.json` exit 0

## Pre-commit (substitute: no repo lint config — components run via evidence.py exec, script artifacts/round--step4-generic-r1.sh)
- lint: eslint (artifacts/round--eslint.config.mjs) + node --check → `serve-config-guard--precommit-lint-r1.json` exit 0
- format: `git diff --cached --check` → `serve-config-guard--precommit-format-r1.json` exit 0
- tests: `npm test` → `serve-config-guard--precommit-tests-r1.json` exit 0
- security grep (token/key patterns in added lines) → `serve-config-guard--precommit-security-r1.json` exit 0

## Mutations (artifacts/serve-config-guard--mutation-r1.sh, scratch worktrees)
- drop-host-check (Hazard: DNS-rebinding foreign Host) → 1 failed (killed)
- trust-mapped (Hazard: IPv4-mapped LAN peer) → 1 failed (killed)
- no-normalise (Hazard: path variants) → 1 failed (killed)
- allow-all (Hazard: repo internals to LAN) → 1 failed (killed)

## Attribution / handback
- handback artifacts/serve-config-guard--handback-builder-r1.md: header present; paths = scripts/serve.mjs, scripts/net.mjs, tests/serve.test.js
- Attribution r1 (artifacts/serve-config-guard--attribution-r1.json) is VACUOUS: the conductor ran it from the main checkout, whose working tree holds none of this phase's edits (touched: []). Conductor probe defect, not a finding. Cross-check used instead: reconcile MATCH (3 touched = 3 handback paths). The commit-form attribution (`--sha`) re-runs at Step 8.
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| CLAUDE.md conventions | 15/15 |
| tests where implied | 10/10 |
| **Total** | **75/75** (100%) |
**Band:** COMPLETE
**Caps applied:** none
- Step 7 dispatched 2026-10-08T22:10:01Z: serve-config-guard-review-anchored-r1 and serve-config-guard-review-cold-r1 (orchestrator-reviewer, opus); predispatch ok; reviewed tree 0f25e58
- lint r1b: `serve-config-guard--precommit-lint-r1b.json` exit 0, run with round--eslint-r1c.config.mjs (same config fix as e2e-harness; r1 had already passed)
- Cold review r1 (artifacts/serve-config-guard--review-cold-r1.md): CHANGES REQUESTED. Conductor reproduced its Important test-strength finding: mutant trust-xff SURVIVES (`serve-config-guard--mutation-trust-xff-r1.txt`: 0 failed) against Hazard "a spoofed proxy header lets a LAN client read config.json" → re-dispatch required.

## Step 7 triage — r1 (artifacts/serve-config-guard--review-r1.md anchored, artifacts/serve-config-guard--review-cold-r1.md cold)
- Step 4 re-tally `serve-config-guard--tally-step4-r1-c1.json` (--correction): reads the mutation records added after the first Step 4 tally; recorded as a correction.
- Step 7 tally `serve-config-guard--tally-step7-r1.json`: 75/85 RE-DISPATCH — "tests where implied" 0/10 (surviving hazard mutants).
- code-bug (both lenses): the X-Forwarded-For test sends the LAN address as Host (tests/serve.test.js:101), so it cannot fail. Conductor mutant trust-xff survives (0 failed) → re-dispatch.
- code-bug (anchored, test strength): conductor mutants loose-127 (`a.startsWith('127')`) and dir-no-slash (`['/css','/js','/assets']`) survive (0 failed) → re-dispatch.
- Symlink escape (both lenses; reviewers class spec-gap): CONDUCTOR RULING under D9 ("serves an allowlist of app paths") — a symlink whose real path leaves the served root is not an app path; fix as part of the re-dispatch (realpath must stay inside ROOT; test with a symlink to a file outside). Listed at the next stop as a conductor-alone ruling.
- Dotfiles (anchored, spec-gap: R-SEC-1 says dotfiles 404, D9 lists the directories): CONDUCTOR RULING — both hold: any path segment starting with "." is 404 even under css/, js/, assets/ (stricter, contradicts neither). Listed at the next stop.
- X1 Dismissed (cold): "a cross-site request to 127.0.0.1 gets the token with status 200" — the browser's same-origin policy prevents a foreign page reading the body and the server sends no CORS headers; the remaining risk needs a local reverse proxy, already a documented hazard. Listed at the next stop.
- Dismissed (cold): "LAN-peer tests skip silently" — criterion 6 is exec-checked by the conductor (`serve-config-guard--ac6-r1.json`: `# skipped 0`).
- Status codes pinned (cold Minor, code-bug): rides the re-dispatch (assert exact 403/404 per case).
- Stray serve.mjs PID 5103 seen by the anchored reviewer: gone when checked (`ps -p 5103` empty).
- Re-dispatch r2: recipient serve-config-guard-builder-r2 (fresh orchestrator-builder), forced by tally-step7-r1 RE-DISPATCH. Re-dispatches: 1
- Dispatched r2: 2026-10-08T22:15:18Z (brief artifacts/serve-config-guard--brief-r2.md)
- FOLLOW-UP (owner: Nathan): conductor-alone rulings on serve-config-guard (symlink escape and dotfile 404 under D9; cross-site 127.0.0.1 response dismissed) to list at the next stop

## Plan acceptance — Step 4 r2 (re-dispatch; artifacts/serve-config-guard--step4-ac-r2.md)
| # | Item (verbatim from the plan) | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | `test -f tests/serve.test.js && node --test tests/serve.test.js` … | evidence.py exec (plan command) | 0 | `serve-config-guard--ac1-r2.json` |
| 2 | `npm test` | evidence.py exec | 0 | `serve-config-guard--ac2-r2.json` |
| 3 | `grep -q 'isLoopback' scripts/serve.mjs && …` | evidence.py exec | 0 | `serve-config-guard--ac3-r2.json` |
| 4 | `… ! grep -qiE 'x-forwarded\|forwarded' …` (proxy headers are never consulted) | evidence.py exec | 0 | `serve-config-guard--ac4-r2.json` |
| 5 | `test -z "$(git status --porcelain -- js css index.html sw.js scripts/mock-plex.mjs)"` | evidence.py exec | 0 | `serve-config-guard--ac5-r2.json` |
| 6 | narrated: LAN-address tests not skipped | evidence.py exec: `# skipped 0` and `# fail 0` (10 pass) | 0 | `serve-config-guard--ac6-r2.json` |

## Pre-commit r2: lint `serve-config-guard--precommit-lint-r2b.json` exit 0 (round--eslint-r1c.config.mjs; `-r2` used the r1 config and also exited 0), format/tests/security/scope `-r2` exit 0.

## Mutations r2 (MUT_ROUND=r2, artifacts/round--mutate.sh)
- drop-host-check 1 failed · trust-mapped 1 failed · no-normalise 2 failed · trust-xff 1 failed (was surviving) · loose-127 1 failed (was surviving) · dir-no-slash 1 failed (was surviving) · no-realpath 1 failed · no-dotfile 1 failed · allow-all-both 4 failed
- allow-all: DID NOT APPLY (r2 refactored the check into `isAppPath`); rewritten as allow-all-v2.
- allow-all-v2 → 0 failed: EQUIVALENT MUTANT, quoted override — removing only the first `if (!isAppPath(path))` check leaves the second check `(path !== '/config.json' && !isAppPath(rel))` after `realpath`, which rejects every non-app path on its own, so behaviour is unchanged; `serve-config-guard--mutation-allow-all-both-r2.txt` disables both checks and 4 tests fail. The hazard "repo internals served to the LAN" is defended (killed by allow-all-both).
- Step 4 r2: derive `serve-config-guard--tally-step4-r2.json` 65/75 RE-DISPATCH solely on the equivalent mutant allow-all-v2; OVERRIDE (correction, quoted above under Mutations r2) `serve-config-guard--tally-step4-r2-c1.json` → tests 10/10 citing `serve-config-guard--mutation-allow-all-both-r2.txt` (4 failed). Counted under corrections.
- Step 7 r2 dispatched 2026-10-08T22:18:23Z: serve-config-guard-review-anchored-r2 and -cold-r2 (opus), full scope (risk:high), tree 9af4938

## Step 7 triage — r2 (artifacts/serve-config-guard--review-r2.md anchored APPROVE, artifacts/serve-config-guard--review-cold-r2.md cold APPROVE)
- No Critical or Important open (`serve-config-guard--review-check-r2.json` exit 0). Step 7 tally `serve-config-guard--tally-step7-r2.json` 85/95 RE-DISPATCH: "tests where implied" 0/10.
- Test-strength code-bugs confirmed by conductor mutants: anchored N1 "The `rel.startsWith('/..')` containment clause has no test." → `serve-config-guard--mutation-no-containment-r2.txt` 0 failed; cold N1 "No test covers the `isFile()` guard." → `serve-config-guard--mutation-no-isfile-r2.txt` 0 failed. Anchored N3 (symlinked root untested) and N2 (proxy-header teeth cover only X-Forwarded-For) ride the same push.
- allow-all-v2 remains an equivalent mutant (override quoted under Mutations r2).
- X1 Cold M2 (Sec-Fetch-Site / nosniff on config.json) carried, spec-gap: stays dismissed (reason above; listed at the next stop). Cold M3 (LAN tests skip when no LAN address) carried: dismissed, criterion 6 exec form fails the run if anything is skipped.
- Re-dispatch r3: recipient serve-config-guard-builder-r3 (fresh), forced by tally-step7-r2 RE-DISPATCH. Re-dispatches: 2
- Dispatched r3: 2026-10-08T22:23:00Z (brief artifacts/serve-config-guard--brief-r3.md)

## Plan acceptance — Step 4 r3 (tests-only re-dispatch)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec | 0 | `serve-config-guard--ac1-r3.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec | 0 | `serve-config-guard--ac2-r3.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec | 0 | `serve-config-guard--ac3-r3.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec | 0 | `serve-config-guard--ac4-r3.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec | 0 | `serve-config-guard--ac5-r3.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec | 0 | `serve-config-guard--ac6-r3.json` |
- Pre-commit r3: lint `-r3b` (r1c config) exit 0; format/tests/security/scope `-r3` exit 0. 14 tests pass, 0 skipped.
- Mutations r3 (all killed): drop-host-check 2 · trust-mapped 1 · no-normalise 2 · trust-xff 1 · loose-127 1 · dir-no-slash 1 · no-realpath 2 · no-dotfile 1 · allow-all-both 5 · no-isfile 1 (was surviving) · no-containment 1 (was surviving). allow-all-v2 stays the quoted equivalent mutant.
- Confirmation review round SKIPPED (Step 7: "A confirmation round may be skipped when the conductor's own mutant proves each closure"): the r2 reviews' only open items (anchored N1, cold N1) are closed by `serve-config-guard--mutation-no-containment-r3.txt` and `serve-config-guard--mutation-no-isfile-r3.txt` (both killed); r3 changed tests/serve.test.js only.

## Step 8 tally (block of record: `serve-config-guard--tally-step8-r3-c1.json`; the derive `-r3` scored tests 0/10 solely on the equivalent mutant allow-all-v2 — override quoted under Mutations r2)
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

- Landed: 0914090 — "Serve only app files from the dev server; config.json to loopback only"
- Read-back: `diff <(git log -1 --format=%B 0914090) serve-config-guard--commit-message-final.txt` via `closer readback` → ok (no missing tokens, not stale)
- Attribution (commit form, r3): touched = handback paths, unattributed []

## Reviews
- r1: artifacts/serve-config-guard--review-r1.md (anchored, CHANGES REQUESTED), artifacts/serve-config-guard--review-cold-r1.md (cold, CHANGES REQUESTED)
- r2: artifacts/serve-config-guard--review-r2.md (anchored, APPROVE), artifacts/serve-config-guard--review-cold-r2.md (cold, APPROVE)
- r3: confirmation skipped (closures proven by conductor mutants)

## Notes / reconciliation
- Unknowns: none new. Out of scope: none. Invalidated phases: none. `device-helper-server` reuses scripts/net.mjs as planned.
- Conductor-alone rulings to list at the next stop: symlink escape and dotfile 404 (under D9 / R-SEC-1); cross-site 127.0.0.1 response dismissed.
- FOLLOW-UP (owner: Nathan): X1 serve-config-guard: "a cross-site request to 127.0.0.1 gets the token with status 200" and cold M2/M3 ship as is — list at the next stop
