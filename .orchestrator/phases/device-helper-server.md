# device-helper-server

- Mode: afk        Tags: risk:high        Blocked by: serve-config-guard (done, 0914090)
- Status: done · landed 16300a9 · confidence 100
- Commit(s): 16300a9
- Agent type: orchestrator-builder (no BMad install); model sonnet, effort high (risk:high per role table)
- Claimed: 2026-10-08T22:28:51Z
- Worktree: ../wt-device-helper-server on branch orch/device-helper-server from 0914090 (D12)

## Pre-flight
- Pre-dispatch acceptance run: artifacts/device-helper-server--preflight-r1.md (failures = the missing deliverables; npm test and scope probe pass)
- PROBE: `which cec-ctl cec-client wlr-randr; ls /sys/class/thermal/thermal_zone0/temp` → none present in this container — meets criterion 1 (the criterion uses an injected fake execFile and fake thermal file; real hardware is a (verify) row in real-server-validation-extended)
- `git log -- scripts/device-helper.mjs tests/device-helper.test.js` → empty
- Dispatched: 2026-10-08T22:29:18Z        Re-dispatches: 0        Inner revision rounds: 0
- Step 3: orchestrator-builder device-helper-server-builder-r1, model sonnet, effort high; brief artifacts/device-helper-server--brief-r1.md
- Carried: K1 Q-dhs1 "auto-detect order cec-ctl" and Q-dhs2 "413 oversized body" rulings, accepted as proposed (questions.md); listed at the next stop.
- FOLLOW-UP (owner: Nathan): conductor rulings Q-dhs1 (helper auto-detect order, cec-ctl on = --image-view-on) and Q-dhs2 (helper status codes) to list at the next stop

## Plan acceptance — Step 4 r1 (conductor-run via evidence.py exec in ../wt-device-helper-server)
| # | Item (verbatim from the plan) | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | `test -f tests/device-helper.test.js && node --test tests/device-helper.test.js`  (with an injected fake `execFile`: `POST /__helper/display… | evidence.py exec (plan command) | 0 | `device-helper-server--ac1-r1.json` |
| 2 | `npm test`… | evidence.py exec (plan command) | 0 | `device-helper-server--ac2-r1.json` |
| 3 | `test -f scripts/device-helper.mjs && ! grep -nE "\bexec\(\|execSync\|shell: *true" scripts/device-helper.mjs`  (`execFile` with fixed argumen… | evidence.py exec (plan command) | 0 | `device-helper-server--ac3-r1.json` |
| 4 | `test -f scripts/device-helper.mjs && test -f scripts/serve.mjs && ! grep -n 'Access-Control-Allow' scripts/device-helper.mjs scripts/serve.… | evidence.py exec (plan command) | 0 | `device-helper-server--ac4-r1.json` |
| 5 | `test -f scripts/device-helper.mjs && ! grep -niE 'brightness\|ddcutil\|backlight\|vcgencmd display_power' scripts/device-helper.mjs`  (brightn… | evidence.py exec (plan command) | 0 | `device-helper-server--ac5-r1.json` |
| 6 | `test -z "$(git status --porcelain -- js css index.html sw.js scripts/net.mjs scripts/mock-plex.mjs)"`… | evidence.py exec (plan command) | 0 | `device-helper-server--ac6-r1.json` |
| 7 | narrated: independent reviewer (risk:high; this phase runs commands on the device) tries to run a command with a hostile body, a spoofed hea… | review row (Step 7): anchored + cold reviewers attack the helper; exec form = both verdicts APPROVE | pending | review-rows 7 |

## Scope — reconcile: MATCH, 3 touched (artifacts/device-helper-server--reconcile-r1.md); scope-r1 exit 0

## Pre-commit (substitute; artifacts/round--step4-generic-r1.sh)
- lint r1: exit 1 (stale r1 config); lint r1b: exit 1 — conductor tool defect: r1c config lacked the Node global `setImmediate` (quoted: "22:16 error 'setImmediate' is not defined", "318:54 error 'setImmediate' is not defined"); lint r1c: `device-helper-server--precommit-lint-r1c.json` exit 0 with round--eslint-r1d.config.mjs
- format/tests/security exit 0

## Mutations r1 (all killed): no-custom-header 3 · no-peer-check 3 · no-host-check 3 · loose-on 2 · no-lock 1 · shell-true 1 · calls-not-fake-only 2 · no-flag-validation 1
- Step 7 dispatched 2026-10-08T22:44:29Z: device-helper-server-review-anchored-r1 and -cold-r1 (opus); tree f9cf001
- FOLLOW-UP (owner: Nathan): device-helper-server rulings Q-dhs1 "auto-detect order cec-ctl" and Q-dhs2 "413 oversized body" — list at the next stop

## Step 7 triage — r1 (artifacts/device-helper-server--review-r1.md anchored APPROVE; artifacts/device-helper-server--review-cold-r1.md cold APPROVE). No Critical/Important (`device-helper-server--review-check-r1.json` exit 0).
- code-bug (against conductor ruling Q-dhs2): anchored 1 "An oversized body gets a connection reset, not the ruled 413." = cold M4 "Misleading 413 responses." → fix in r2.
- code-bug (against ruling Q-dhs2): anchored 2 "Fake-mode status reports the strategy auto-detected on the host, not `'fake'`." → fix in r2.
- Both lenses: anchored 3 "No test asserts the cec-ctl/cec-client child env." = cold M3 → test in r2 (cannot be dismissed: both lenses).
- code-bug (against the plan Note "a hung `cec-client` cannot stack processes"): cold M1 "A timeout kills only the direct child, so grandchildren are orphaned and pile up while the lock reports idle." → spawn detached, kill the group, in r2.
- code-bug (against spec R-HELP-1): anchored 4 "The `vcgencmd measure_temp` fallback in R-HELP-1 is not implemented, and `status` has no `temperature` key." → r2. CONDUCTOR RULING (K2): `temperature` names the reading's source, `'thermal_zone0' | 'vcgencmd' | null`. Listed at the next stop.
- anchored 5 "An absolute `WAYLAND_DISPLAY` is refused." → accept an absolute socket path too (WAYLAND_DISPLAY may be absolute), still validated, in r2.
- cold M5 "Fake mode's call log grows without bound." → cap at the last 100 calls in r2 (plainly correct, fake mode only).
- Dismissed (cold): M2 "LAN clients can tell whether the helper is enabled, and whether it is in fake mode." — plan criterion 1 mandates 403 for guarded refusals and 404 without `--helper`; revealing that the helper exists exposes no command or data.
- Re-dispatch r2: recipient device-helper-server-builder-r2 (fresh), forced by the code-bugs above (Step 7 band computed below). Re-dispatches: 1
- FOLLOW-UP (owner: Nathan): K2 ruling — helper status.temperature names the source ('thermal_zone0' | 'vcgencmd' | null); list at the next stop
  <!-- 2026-10-14: the backticks around status.temperature were dropped from the line above so it matches the index text; no other change -->
- Step 7 tally `device-helper-server--tally-step7-r1.json` 90/95 RE-DISPATCH (row 7 had no exec record yet; `device-helper-server--ac7-r1.json` written after). The re-dispatch is forced by the review code-bugs listed above (Step 7: "A review with any `code-bug` is a re-dispatch").
- Dispatched r2: 2026-10-08T22:50:49Z (brief artifacts/device-helper-server--brief-r2.md)

## Plan acceptance — Step 4 r2
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac1-r2.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac2-r2.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac3-r2.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac4-r2.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac5-r2.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac6-r2.json` |
| 7 | narrated: independent reviewer attacks | review row (Step 7) | pending | review-rows 7 |
- Pre-commit r2: lint `-r2` exit 1 (stale config), lint `-r2b` (r1d config) exit 1 — REAL: "6:33 error 'mkdirSync' is defined but never used" (tests/device-helper.test.js). format/tests/security/scope exit 0.
- Handback r2 malformed: first line is the Agent line, not the header (same format defect as validation-checklists r3).
- Stale comment: scripts/device-helper.mjs:13 still says "Commands run through execFile" after the r2 switch to a spawn-based executor.
- Re-dispatch r3: recipient device-helper-server-builder-r2 resumed (same builder: named, probed gaps; its context is an asset), forced by tally-step4-r2 RE-DISPATCH (conventions 0/15). Brief artifacts/device-helper-server--brief-r3.md. Re-dispatches: 2

## Plan acceptance — Step 4 r3
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac1-r3.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac2-r3.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac3-r3.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac4-r3.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac5-r3.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec | 0 | `device-helper-server--ac6-r3.json` |
| 7 | narrated: independent reviewers attack | review row (Step 7) | pending | review-rows 7 |
- Pre-commit r3: lint `-r3b` (r1d) exit 0 (`-r3` used the stale r1 config); format/tests/security/scope exit 0. Both handbacks now header-first (r2 original preserved as -malformed-original.txt).
- Mutations r3: no-custom-header 3 · no-peer-check 3 · no-host-check 3 · loose-on 2 · calls-not-fake-only 2 · no-group-kill 1 · not-detached 1 — killed. no-lock-r3: MISREAD by round--mutate.sh v1 (it counted "# fail 0" and missed "# cancelled 11"; exit 1) → re-run with round--mutate-v2.sh as `-r3b`: 11 failed (killed). no-flag-validation: DID NOT APPLY (code changed) → v2 (r3 run hung past the background limit; `-r3b` with the 300 s cap: 1 failed, killed). **shell-true-spawn: SURVIVES** (exit 0, 42/42 pass): no test exercises the real spawn-based executor, so `shell: true` there is undetected — Hazard "argument injection through a shell".
- Audit of every mutation record for the v1 misread: only no-lock-r3 affected.

## Branched re-dispatch r4 / r5 (third re-dispatch → branch rule)
- Forced by `device-helper-server--tally-step4-r3.json` (65/75 RE-DISPATCH, tests 0/10: mutant shell-true-spawn survives).
- Two candidates from the same parent (r3 staged tree), each in its own worktree: r4 = smallest change closing the named gap (one real-executor test); r5 = re-approach the lowest category (tests) — test the real executor end to end (fake binaries on PATH): no shell interpretation, process-group kill on timeout with a forked grandchild, stdout capture. Both count against the cap (re-dispatches 3 and 4 of 5).
- Cheap gate per candidate: lint (r1d), `node --test tests/device-helper.test.js`, plan criterion 3. Then Step 4 evidence per round, `derive --this-round-only`, `closer pick --rounds 4,5 --parent 3`; only the winner goes to Step 7.
- Dispatched r4 and r5 (branched): 2026-10-08T23:36:14Z (briefs artifacts/device-helper-server--brief-r4.md, -r5.md)

## Plan acceptance — Step 4 r4 (branch candidate, evidence.py exec in ../wt-device-helper-server-r4)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac1-r4.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac2-r4.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac3-r4.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac4-r4.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac5-r4.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac6-r4.json` |
| 7 | narrated: independent reviewers attack | review row (Step 7) | pending | review-rows 7 |
- Pre-commit r4 (round--step4-generic-r2.sh, r1e lint config): lint/format/tests/security/scope exit 0.
- Mutations r4 (round--mutate-v3.sh, MUT_WT=../wt-device-helper-server-r4; all killed): shell-true-spawn 1 (the r3 survivor) · no-custom-header 3 · no-peer-check 3 · no-host-check 3 · loose-on 2 · no-lock 12 · calls-not-fake-only 2 · no-group-kill 1 · not-detached 1 · no-flag-validation-v2 1

## Plan acceptance — Step 4 r5 (branch candidate, evidence.py exec in ../wt-device-helper-server-r5)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac1-r5.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac2-r5.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac3-r5.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac4-r5.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac5-r5.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac6-r5.json` |
| 7 | narrated: independent reviewers attack | review row (Step 7) | pending | review-rows 7 |
- Pre-commit r5 (round--step4-generic-r2.sh, r1e lint config): lint/format/tests/security/scope exit 0.
- Mutations r5 (round--mutate-v3.sh, MUT_WT=../wt-device-helper-server-r5; all killed): shell-true-spawn 1 (the r3 survivor) · no-custom-header 3 · no-peer-check 3 · no-host-check 3 · loose-on 2 · no-lock 15 · calls-not-fake-only 2 · no-group-kill 1 · not-detached 1 · no-flag-validation-v2 1

## Branch pick — `device-helper-server--pick-r5.json`: winner r4 (both 75/75 COMPLETE; tie → r4). r4's tests/device-helper.test.js staged into ../wt-device-helper-server (source files byte-identical to r3's in both candidates); tree f9da92e; 43/43.
- Step 7 dispatched 2026-10-08T23:59:30Z: device-helper-server-review-anchored-r4 and -cold-r4 (opus; risk:high → full, not delta-scoped); tree f9da92e

## Step 7 — anchored r4 (artifacts/device-helper-server--review-r4.md, APPROVE; "Criterion 7 attacks: PASS" against the real spawn executor: hostile bodies 400, header/CSRF 403, Host/rebinding 403, LAN peer 403, preflight 404, 413 to 10 MB, 503 concurrent, 504 + group kill, flag/env injection refused at startup, child argv/env exact)
- Minor 1 (code-bug against the "5 s timeout" Note): 504 lands ~6.9 s in this container — `defaultKillGroup` (scripts/device-helper.mjs:42) waits up to 2 s while `kill(-pgid, 0)` still succeeds on unreaped zombies. Command itself is killed at 5 s.
- Minor 2 (spec-gap, test-side): tests/device-helper.test.js:415 forks `sleep 300`; a regressed group kill hangs the suite past 280 s instead of failing fast.
- Reviewer mutants: 21 run, 18 killed; 2 individually-equivalent guards (both reverted → killed by test 27); 1 = cold-r1 M2 guard order (accepted at r1 triage).
- Base note: the worktree HEAD is 0914090 (the phase branched there); the reviewer applied the staged patch on 33976fe cleanly (npm test 110/110). Landing cherry-picks onto e764aee, followed by a seam check.
- Triage held for the cold r4 review (one re-dispatch left under the 5 cap: fold every finding into one round).

## Step 7 triage — r4 (anchored `device-helper-server--review-r4.md` APPROVE + cold `device-helper-server--review-cold-r4.md` APPROVE; no Critical/Important; tally-step7-r4 95/95; ac7-r4 exec: attacks PASS line + both APPROVE)
- A1 = anchored Minor 1 (code-bug) and C2 = cold Minor 2 (code-bug), same root: `defaultKillGroup` holds the 504 for up to 2 s while zombies answer `kill(-pgid, 0)`, then silently gives up and releases the lock (contradicts the header comment at :14-15); removing the loop passes every test.
- A2 = anchored Minor 2 (spec-gap, test-side): the hung-command test forks `sleep 300`, so a regressed group kill hangs the suite.
- C1 = cold Minor 1 (code-bug, test gap): no test drives the real executor's non-zero exit → 502; an always-success executor passes all 43 tests.
- C3 = cold Minor 3 (spec-gap): a command that exits 0 but leaves a background child keeps it alive after the lock is released. CONDUCTOR RULING K8 (error-handling hardening within D8, no new feature; matches the file's stated invariant "a forked grandchild cannot outlive the lock"): after every command, success or failure, kill its process group before releasing the lock. Listed at the next stop.
- Declined to judge (both): reverse-proxy deployment hazard (documented), hardware command syntax (verify on hardware — already in real-server-validation-extended), 403-vs-404 route fingerprinting (no action).
- Re-dispatch r6 (fresh builder; one round for every finding above): Re-dispatches: 5 — THE LAST under the cap. If r6 fails Step 4 or a review finds a code-bug, STOP and surface to the owner with a summary of the persistent failure mode.

## Plan acceptance — Step 4 r6 (evidence.py exec in ../wt-device-helper-server)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac1-r6.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac2-r6.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac3-r6.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac4-r6.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac5-r6.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac6-r6.json` |
| 7 | narrated: independent reviewers attack | review row (Step 7) | pending | review-rows 7 |
- Pre-commit r6 (round--step4-generic-r2.sh, r1e lint config): lint/format/tests/security/scope exit 0.
- Builder-written files `device-helper-server--mutation-r6.txt` and `device-helper-server--red-r6.log` are the BUILDER'S claims (handback evidence), not conductor evidence; the conductor's own mutation records are `device-helper-server--mutation-<name>-r6.txt`.
- r6 code read by the conductor: `killProcessGroup` (exported; SIGKILL group, poll `groupAlive` — signal 0 then /proc/<pid>/stat, zombie-only group = gone — 10 s cap then a warning naming the pgid); `run()` answers 504 at once on timeout with the lock released when `gone` resolves; after success/failure the group is killed and awaited before answering (K8).
- Mutations r6 (conductor, round--mutate-v3.sh; all killed): new seams — wait-loop-removed 3 · no-kill-after-success 1 · zombie-counts-alive 1 · unlock-before-group-gone 3 · kill-pid-not-group 3; earlier set — shell-true-spawn 1 · no-custom-header 3 · no-peer-check 3 · no-host-check 3 · loose-on 2 · no-lock 4 · calls-not-fake-only 2 · not-detached 2 · no-flag-validation-v2 1.
- Step 7 dispatched 2026-10-09T00:27:29Z: device-helper-server-review-anchored-r6 and -cold-r6 (opus; risk:high → full); tree 8ea1bb1
- Container restart 2026-10-09 ~00:35Z stopped both r6 reviewers before they wrote a verdict; re-dispatched with the same prompts (tree 8ea1bb1 unchanged).

## Step 7 — cold r6 (artifacts/device-helper-server--review-cold-r6.md, APPROVE; no Critical/Important; reviewer's 5 mutants all killed)
- C6-1 (spec-gap): a child that calls setsid escapes the group kill (inherent; probe did not confirm a survivor).
- C6-2 (spec-gap): serve.mjs has no SIGTERM/SIGINT handler, so stopping the server mid-command leaves that command's group alive.
- C6-3 (spec-gap): a helper flag given without a value (`--helper-power --helper-fake`) is silently ignored by the existing `opt()` parser and falls back to auto-detect instead of refusing to start.
- C6-4 (reviewer: code-bug, "no fix required"): theoretical pid-reuse window between a successful child's exit/reap and the post-success `kill(-pgid)` (K8). Conductor trace: the pgid can only be reused after every member has exited and a new session/group leader receives that exact pid inside a sub-millisecond window; on the Pi pid_max is 4194304 (32768 on older kernels). Far-fetched; a fix (pidfd / checking pgid membership first) costs more than it prevents. Put to the owner at the stop, with the cap reached (5/5 re-dispatches), not re-dispatched by the conductor alone.
- Triage held for the anchored r6 review.

## Step 7 — anchored r6 (artifacts/device-helper-server--review-r6.md, APPROVE; "Criterion 7 attacks: PASS"; A1/C2, A2, C1, C3/K8 confirmed resolved live: 504 at 5.01 s, lock held 46–98 ms until the group is gone, zombie-only group = gone)
- A6-1 (reviewer: spec-gap; conductor class: code-bug, test strength): no test proves the real `groupAlive` sees a LIVE member — the reviewer's never-find mutant passes all 50 tests (a regression would release the lock on an unkillable member).
- A6-2 (spec-gap, test-side): the test at tests/device-helper.test.js:575 has no per-test timeout.
- A6-3 (spec-gap): a command that exits 0 but whose background child holds stdout open gets 504 after 5 s (completion keyed on `close`); the group is still killed. No supported tool does this.
- A6-4 (spec-gap): on success/failure the response waits for the group wait (up to 10 s) only when a member survives SIGKILL.

## Cap reached — stop 4 (5/5 re-dispatches used)
Persistent failure mode: not a recurring defect — every round closed the previous round's findings and every review since r1 APPROVES with criterion 7 attacks PASS. What keeps surfacing is progressively smaller process-lifecycle and test-strength gaps in the kill/wait path, each found by a fresh adversarial reviewer. A6-1 is a surviving-mutant test gap, which under Step 7 is a re-dispatch; with the cap reached the conductor stops and asks.

- Correction (conductor defect): stop 4 was sent REFORMATTED (nested bullets; same items, IDs, options and recommendations) instead of as saved, and `closer answer` refused it. The block below is now exactly the text as sent (copied from the transcript); the originally saved text is kept as `artifacts/device-helper-server--stop4-saved-original.md`.

## Stop message 4
**Stop 4: the device helper has hit its retry limit, plus some rulings to confirm. One reply covers everything.**

Progress since stop 3: `settings-and-schedule-core` (33976fe), `rotation-layout-and-shell` (cc16968) and `cache-first-fetch` (e764aee) are committed and pushed. `sleep-mode` is in its final reviews.

1. **`device-helper-server` has used all 5 retries.** Both final security reviews approve. No attack made the helper run a command, leak the token or leave a process behind, and every earlier finding is fixed. What's left:
   - **A6-1:** no test proves the helper notices a process that survives being killed. If that check broke, the lock would release early. This is a test gap: the reviewer's mutant passes every test.
   - **A6-2:** one test has no time limit, so a regression would hang the test run instead of failing it.
   - **C6-3:** a helper option given with no value (`--helper-power --helper-fake`) is silently ignored. The helper then auto-detects instead of refusing to start.
   - **Shipping as is:**
     - **A6-3:** a command that succeeds but leaves a background child holding its output gets a 504. The child is still killed, and no supported tool does this.
     - **A6-4:** the reply can wait up to 10 s, but only when a child survives SIGKILL.
     - **C6-1:** a child that starts its own session (`setsid`) escapes the kill. That's inherent to process groups.
     - **C6-2:** stopping the server mid-command leaves that command running. Under systemd the default `KillMode=control-group` kills it anyway, and the docs phase will say so.
     - **C6-4:** a theoretical pid-reuse window in the clean-up kill. It needs that exact pid reused within a sub-millisecond window, and a fix costs more than it prevents.

   **Recommended: (a) allow one more small round for A6-1, A6-2 and C6-3 only (tests plus the option check), and ship the rest as is.** (b) Ship everything as is now. (c) Something else.

2. **Rulings I made alone.** Reply "keep", or name any you want changed:
   - **K2:** the helper's status says where the temperature reading came from (`thermal_zone0`, `vcgencmd` or none).
   - **K3:** for the new number settings, junk or blank values become the default, out-of-range values are clamped, and counts are rounded.
   - **K4:** a cached poster that won't decode is dropped and downloaded once, with no retry loop.
   - **K5:** when offline, the app can still pick a corrupt cached poster. That fix goes to `content-rating-filter`, which edits that code.
   - **K7:** the sleep test's "wake lock held" check means exactly one lock held and none released, because the test harness counts locks.
   - **K8:** after every helper command, success included, the command's whole process group is killed, so nothing it started in the background survives.
   - **K9:** sleep rules:
     - Playback always restarts the idle timer. With "wake on playback" off, only the scheduled window stays dark.
     - Pause stops the playback check.
     - An open Settings or Diagnostics panel shows above the black screen.

   **Recommended: keep all.**

3. **K6, a product question.** If your Plex server keeps sending a broken image for one poster, the app downloads it once per rotation and then shows the next poster. Should it stop trying that poster?
   - **Recommended: (a) no, leave it.** It costs one small download per rotation, and it heals itself once the artwork is fixed.
   - (b) Skip a poster after 3 failures until the app reloads.

4. **Token rotation is still open.** When you've done it, reply with the four lines from the checklist. It only blocks `real-server-validation` and the release.

Each answer gets recorded in the decision log or a phase file.

Reply e.g. "1a, keep, 3a", or "defaults".
<!-- end stop 4 -->
- Stop 4 sent 2026-10-09T01:16:22Z (saved above; stopcheck-4 ok).

- Answer to stop message 4: "Defaults" — chat; recorded by the conductor at 2026-10-09T01:19:58.526360Z
- Stop 4 answered "Defaults" at 2026-10-09T01:19:06Z (`closer answer` record; items 1–3 → D20, D21, D22; item 4 token rotation open). Committed ed4917b.
- Re-dispatch r7 (fresh builder; OWNER-AUTHORISED past the 5-re-dispatch cap by D20; scope A6-1, A6-2, C6-3 only). Brief artifacts/device-helper-server--brief-r7.md. Re-dispatches: 6 (1 beyond the cap, by owner decision).

## Plan acceptance — Step 4 r7 (evidence.py exec in ../wt-device-helper-server)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac1-r7.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac2-r7.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac3-r7.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac4-r7.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac5-r7.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `device-helper-server--ac6-r7.json` |
| 7 | narrated: independent reviewers attack | review row (Step 7) | pending | review-rows 7 |
- r7 changes (D20 scope only): tests/device-helper.test.js — real-groupAlive live-member test (A6-1), per-test timeouts + t.after stop hooks on deadline tests (A6-2), value-less helper option test (C6-3); scripts/serve.mjs — inside the `--helper` block, a helper value option with a missing/empty/`--flag` value exits 1 with "device helper: --<name> needs a value". scripts/device-helper.mjs unchanged since r6.
- Pre-commit r7 (round--step4-generic-r2.sh): lint/format/tests/security/scope exit 0.
- Mutations r7 (conductor; all killed): live-member-never-seen 1 (A6-1) · valueless-option-accepted 1 (C6-3) · wait-has-no-deadline 2 (A6-2: fails fast instead of hanging). r6 conductor mutants against scripts/device-helper.mjs stand (file unchanged; tests only gained cases and timeouts).
- Q24 (builder): the value check applies only with `--helper`; without it the helper is not enabled, so a value-less `--helper-power` is inert — CONDUCTOR RULING K10: accepted (matches the existing "--helper-fake alone does not enable the helper"). Listed at the next stop.
- Step 7 dispatched 2026-10-09T01:31:13Z: device-helper-server-review-anchored-r7 and -cold-r7 (opus; risk:high → full); tree 6dc4191

## Step 7 — anchored r7 (artifacts/device-helper-server--review-r7.md, APPROVE; no Critical/Important/Minor; "Criterion 7 attacks: PASS"; A6-1, A6-2, C6-3 confirmed with the reviewer's own mutants)
- Declined to judge: `--helper-power=cec-ctl` (`=` form) silently falls back to auto-detect — `opt()` has never parsed `--name=value` for any option (pre-existing; D20 keeps opt() unchanged) → FOLLOW-UP K17 (product question), listed at the next stop.

## Step 7 triage — r7 (anchored `device-helper-server--review-r7.md` APPROVE, no findings; cold `device-helper-server--review-cold-r7.md` APPROVE, no Critical/Important; reviewer mutants 17/18 killed, hang mutants fail in ~0.3 s)
- Cold r7 Minor 1 = A6-3 (exit-0 command whose background child holds stdout → 504): shipped as is by the owner, D20. No action.
- Cold r7 Minor 2 = C6-2 (no SIGTERM/SIGINT handler; systemd KillMode=control-group covers it; `docs` says so): shipped as is by the owner, D20. No action.
- Cold r7 Minor 3 (403-vs-404 route fingerprinting; guard after the route check — its 1 surviving mutant): already triaged no-action at r4 ("403-vs-404 route fingerprinting (no action)") and the guard order accepted at r1 (cold-r1 M2). No action.
- No open finding: Step 7 closes.

## Seam check (merged: + device-helper-server)
- `round--seam-w3-r3.json` exit 0 (npm test, npm run test:e2e, check-precache: 24 files)

## Step 8 tally (`device-helper-server--tally-step8-r7.json`)
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

- Landed: 16300a9 — "Add an opt-in loopback device helper for screen power and CPU temperature" (branch base 0914090; cherry-picked onto ed4917b cleanly)
- Read-back ok; attribution (commit form, r7) ok

## Reviews
- r1 anchored + cold (APPROVE, code-bugs → r2); r4 anchored + cold (APPROVE, Minors → r6); r6 anchored + cold (APPROVE, A6-1 test gap → cap stop 4 → D20 → r7); r7 anchored + cold (APPROVE, no open finding). Branch candidates r4/r5 picked r4 (`device-helper-server--pick-r5.json`).
- Re-dispatches: 6 (5 under the cap + 1 owner-authorised, D20).

## Notes / reconciliation
- Unknowns: hardware command syntax for cec-ctl / cec-client / wlr-randr and the CEC device path (verify in real-server-validation-extended). Out of scope: none. Follow-ups: K10, K17 (next stop). Invalidated: none.

## Index items carried (verbatim from .orchestrator/state.md; added 2026-10-14 by conductor-2 for closer index-check)
these rulings and deferrals were recorded in this phase's stop messages and in docs/decisions.md in other words; closer index-check requires the index text itself in a phase file, so it is copied here unchanged.
- K8 — device-helper-server cold r4 Minor 3: the helper now kills a command's whole process group after every command (success too), so a background child cannot outlive the lock; list at the next stop
- K2 ruling — helper status.temperature names the source ('thermal_zone0' | 'vcgencmd' | null); list at the next stop
- K10 — device-helper-server Q24: a helper value option given without a value refuses to start only when --helper is given; without --helper the helper is off and the option is inert; list at the next stop
- K17 — device-helper-server anchored r7: serve.mjs options never accept the --name=value form, so --helper-power=cec-ctl silently auto-detects; pre-existing; support '=' or refuse it? list at the next stop
