# e2e-harness

- Mode: afk        Tags:         Blocked by: none
- Agent type: orchestrator-builder (no BMad install: `ls _bmad .bmad-core` → absent); model sonnet
- Claimed: 2026-10-08T22:05:55Z
- Worktree: ../wt-e2e-harness on branch orch/e2e-harness from 0f1f82e (D12)

## Pre-flight
- Pre-dispatch acceptance run: artifacts/e2e-harness--preflight-r1.md (failures are the missing deliverables; passing rows: npm test and scope probes)
- `git log --oneline -- <outputs>`: no prior commit touched the new outputs (checked below)
- PROBE: `node -e "console.log(require(\"/opt/node22/lib/node_modules/playwright/package.json\").version)"` → 1.56.1; `ls -d /opt/pw-browsers/chromium-1194` → exists — meets criterion 6
- Dispatched: 2026-10-08T22:06:57Z        Re-dispatches: 1        Inner revision rounds: 0
- Last verification: 2026-10-08T22:31:07Z
- Commit(s): d409ad7 — one phase, its own commit
- Step 3: orchestrator-builder e2e-harness-builder-r1, model sonnet (agent definition pin), effort medium; brief artifacts/e2e-harness--brief-r1.md

## Plan acceptance — Step 4 r1 (conductor-run via evidence.py exec in ../wt-e2e-harness; artifacts/round--ac-runner.py)
| # | Item (verbatim from the plan) | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | `npm test`… | evidence.py exec (plan command) | 0 | `e2e-harness--ac1-r1.json` |
| 2 | `for f in tests/e2e/*.mjs scripts/check-precache.mjs; do node --check "$f" \|\| exit 1; done`… | evidence.py exec (plan command) | 0 | `e2e-harness--ac2-r1.json` |
| 3 | `node scripts/check-precache.mjs`… | evidence.py exec (plan command) | 0 | `e2e-harness--ac3-r1.json` |
| 4 | `d=$(mktemp -d) && mkdir -p "$d/js/vendor" && touch "$d/index.html" "$d/js/vendor/x.js" && printf "const SHELL = [\n  'index.html',\n];\n" > "$d/sw.js… | evidence.py exec (plan command) | 0 | `e2e-harness--ac4-r1.json` |
| 5 | `npm run test:e2e -- smoke`  (spec `smoke.spec.mjs`: seeds settings `{plexToken:'demo-token', serverUrl:'http://127.0.0.1:<mock port>', libraryKey:'1'… | evidence.py exec (plan command) | 0 | `e2e-harness--ac5-r1.json` |
| 6 | `node -e "const p=require('./package.json'); if (p.dependencies \|\| !p.devDependencies \|\| p.devDependencies.playwright!=='1.56.1' \|\| !p.scripts['test:e… | evidence.py exec (plan command) | 0 | `e2e-harness--ac6-r1.json` |
| 7 | `node -e "const l=require('./package-lock.json'); if (!l.packages \|\| !l.packages['node_modules/playwright'] \|\| (l.packages[''].dependencies && Object.… | evidence.py exec (plan command) | 0 | `e2e-harness--ac7-r1.json` |
| 8 | `grep -Eq 'pixelShift: *false' tests/e2e/lib.mjs && grep -Eq 'dailyReload: *false' tests/e2e/lib.mjs && grep -q 'plexPoster.whatsNew' tests/e2e/lib.mj… | evidence.py exec (plan command) | 0 | `e2e-harness--ac8-r1.json` |
| 9 | `grep -q 'npm ci' .github/workflows/ci.yml && grep -q 'playwright install' .github/workflows/ci.yml && grep -q 'test:e2e' .github/workflows/ci.yml && … | evidence.py exec (plan command) | 0 | `e2e-harness--ac9-r1.json` |
| 10 | `test -z "$(git status --porcelain -- js css index.html sw.js scripts/serve.mjs scripts/mock-plex.mjs)"`  (no app or server code changed)… | evidence.py exec (plan command) | 0 | `e2e-harness--ac10-r1.json` |
| 11 | narrated: `/tool-fit review` of the Playwright devDependency (version pin, size, licence) and `dependency-audit` on the lockfile (the `architecture` t… | review row (Step 7): `grep` APPROVE in `e2e-harness--review-r1.md` tool-fit/dependency section | pending | review-rows 11 |

## Scope — reconcile block
- `evidence.py git --reconcile` → MATCH, 7 touched (artifacts/e2e-harness--reconcile-r1.md); `e2e-harness--scope-r1.json` exit 0

## Pre-commit (substitute: no repo lint config — components via evidence.py exec, artifacts/round--step4-generic-r1.sh)
- lint r1: exit 1 — conductor tool defect: round--eslint.config.mjs lacked the standard globals `URLSearchParams` and `localStorage` (lib.mjs:89, smoke.spec.mjs:78,81; both are real globals — `localStorage` runs inside page.evaluate in the browser). Overridden items quoted: "89:19 error 'URLSearchParams' is not defined", "78:52 error 'localStorage' is not defined", "81:53 error 'localStorage' is not defined".
- lint r1b: exit 2 — corrected config round--eslint-r1b.config.mjs imported a `globals` package absent on this host (conductor defect).
- lint r1c: `e2e-harness--precommit-lint-r1c.json` exit 0 with round--eslint-r1c.config.mjs (explicit globals list)
- format: `git diff --cached --check` → `e2e-harness--precommit-format-r1.json` exit 0
- tests: `npm test` → exit 0
- security grep → exit 0

## Mutations (artifacts/round--mutate-r1.sh, scratch worktrees)
- nonrecursive-precache (Hazard: nested js/vendor escapes precache) → 1 failed (killed)
- no-pixelshift-default (Hazard: convention 7) → 1 failed (killed)
- sw-always-allowed (Hazard: SW leaks into specs) → 1 failed (killed)

## Attribution
- handback paths = the 7 staged paths (reconcile MATCH); commit-form attribution at Step 8
| Category | Score |
|---|---|
| acceptance criteria pass fresh _critical_ | 35/35 |
| diff scope matches phase | 15/15 |
| CLAUDE.md conventions | 15/15 |
| tests where implied | 10/10 |
| **Total** | **75/75** (100%) |
**Band:** COMPLETE
**Caps applied:** none
- Step 7 dispatched 2026-10-08T22:12:39Z: e2e-harness-review-anchored-r1 (orchestrator-reviewer, opus) — code + tool-fit + dependency audit; predispatch ok; tree 6357fda

## Step 7 triage — r1 (artifacts/e2e-harness--review-r1.md): APPROVE, Tool fit APPROVE, npm audit 0 vulnerabilities
- H1 Important 1 (spec-gap): "A hung spec hangs the whole run forever, and a runner killed by a signal leaves the running spec, its Chromium and its dedicated server behind." CONDUCTOR RULING (test tooling only, no user-visible behaviour; later phases cannot edit the harness): add a per-spec deadline `E2E_SPEC_TIMEOUT` (default 180 s) printing `FAIL <name> (timeout)`, kill the spec process group on deadline, exit and signals, and `timeout-minutes: 20` on the CI job. Listed at the next stop.
- Minor 2, 3 (spec-gap, harness contract fidelity) and 4 (code-bug, CI step order): plainly correct and inside this phase's Output; ride the r2 push.
- Dismissed (anchored): Minor 5 "The pass-through check reads the harness's own bookkeeping" — `app.spawned` is the very array passed to `spawn`; the reviewer rates the risk low.
- Re-dispatch r2: recipient e2e-harness-builder-r2 (fresh), forced by the open Important (Step 7 "code reads cleanly" would score 5/10 → below the gate). Re-dispatches: 1
- FOLLOW-UP (owner: Nathan): conductor ruling on e2e-harness (per-spec timeout and signal cleanup added to the harness) to list at the next stop
- Dispatched r2: 2026-10-08T22:20:27Z (brief artifacts/e2e-harness--brief-r2.md)

## Plan acceptance — Step 4 r2
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac1-r2.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac2-r2.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac3-r2.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac4-r2.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac5-r2.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac6-r2.json` |
| 7 | plan criterion 7 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac7-r2.json` |
| 8 | plan criterion 8 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac8-r2.json` |
| 9 | plan criterion 9 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac9-r2.json` |
| 10 | plan criterion 10 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `e2e-harness--ac10-r2.json` |
| 11 | narrated: tool-fit + dependency audit | review row (Step 7) — r1 review "Tool fit: APPROVE", npm audit 0 | from review | review-rows 11 |
- Pre-commit r2: lint `-r2` exit 1 (stale r1 config, known false positives) → `e2e-harness--precommit-lint-r2b.json` exit 0 (r1c config); format/tests/security/scope `-r2` exit 0
- Probe: `e2e-harness--probe-hang-r2.json` (script e2e-harness--hangcheck-r2.sh) exit 0 — "FAIL hang (timeout)", rc=1, 6 s, no listeners
- Mutations r2: no-deadline-kill 1 failed · stub-released-stays-false 1 failed · nonrecursive-precache 1 failed · no-pixelshift-default 1 failed

## Step 7 triage — r2 (artifacts/e2e-harness--review-r2.md, delta-scoped from tree 6357fda, APPROVE)
- r1 Important 1 and Minors 2–4 resolved; Minor 5 accepted (dismissed at r1 triage).
- H2 Minor 1 "A non-numeric `E2E_SPEC_TIMEOUT` turns into an immediate timeout for every spec." — ships as is: a mis-set test env var fails loudly (every spec prints `FAIL … (timeout)`), never silently passes. Listed at the next stop.
- H3 Minor 2 "The comment on the sweep is inaccurate about Chromium" — ships as is (comment wording only). Listed at the next stop.
- Row 11 (narrated tool-fit) exec form: `e2e-harness--ac11-r2.json` (grep "Tool fit: APPROVE" and "0 vulnerabilities" in the r1 review) exit 0. `e2e-harness--review-check-r2.json` exit 0.

## Seam check (wave 1: serve-config-guard 0914090 + e2e-harness d409ad7)
- `round--seam-w1-r1.json` exit 0: `npm test`, `npm run test:e2e` (smoke PASS against the allowlisting serve.mjs), `node scripts/check-precache.mjs`; `git write-tree` = `git rev-parse HEAD^{tree}` = babce68

## Step 8 tally (`e2e-harness--tally-step8-r2.json`)
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

- Landed: d409ad7 — "Add a Playwright browser-test harness and a recursive precache check"
- Read-back via closer readback: ok; attribution (commit form): unattributed []

## Reviews
- r1: artifacts/e2e-harness--review-r1.md (APPROVE, Tool fit APPROVE; Important 1 ruled in by the conductor)
- r2: artifacts/e2e-harness--review-r2.md (APPROVE, delta from 6357fda)

## Notes / reconciliation
- Unknowns: none. Out of scope: none. Invalidated: none. Later phases depend on the lib.mjs contract exactly as specified.
- FOLLOW-UP (owner: Nathan): e2e-harness Important 1: "A hung spec hangs the whole run forever" — ruled in by the conductor (per-spec timeout, process-group cleanup); list at the next stop
- FOLLOW-UP (owner: Nathan): e2e-harness r2 Minor 1: "A non-numeric `E2E_SPEC_TIMEOUT` turns into an immediate timeout for every spec." ships as is; list at the next stop
- FOLLOW-UP (owner: Nathan): e2e-harness r2 Minor 2: "The comment on the sweep is inaccurate about Chromium" ships as is; list at the next stop
