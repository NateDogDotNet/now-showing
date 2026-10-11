# display-decode-hang

- Mode: afk        Tags: —        Blocked by: rotation-layout-and-shell (done cc16968)
- Status: done · landed af55616 · confidence 100
- Commit(s): af55616
- Added at stop 9 by the owner (D30): Q25, confirmed by the content-rating-filter r4 anchored review; supersedes K23's routing to pixel-shift.
- Agent type: orchestrator-builder; model sonnet, effort high
- Claimed: 2026-10-10T12:48Z (conductor-1; stamp added at the gate)
- Worktree: ../wt-display-decode-hang on branch orch/display-decode-hang from 9bce60c (D12). Runs IN PARALLEL with content-rating-filter r7: Outputs are disjoint (js/display.js + a new spec vs js/main.js, js/settings-ui.js, js/settings.js and their tests).

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criterion 2 exit 1 (spec missing); 1, 3, 4 exit 0. `closer preflight` ok.
- PROBE: `grep -n setTimeout js/display.js` → the cleanup timer exists (line 144) — meets criterion 2 (the race the spec must reproduce lives here) [verdict wording corrected at the gate]
- Step 3: orchestrator-builder display-decode-hang-builder-r1, sonnet, high; brief artifacts/display-decode-hang--brief-r1.md
- Dispatched: 2026-10-10T12:48:43Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-display-decode-hang, E2E_PORT=20610)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `display-decode-hang--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `display-decode-hang--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `display-decode-hang--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `display-decode-hang--ac4-r1.json` |
| 5 | narrated: reviewer tries to stall rotation | review row (Step 7): anchored | pending | review-rows 5 |
- r1: js/display.js draw-ownership counter (a cleanup timer only clears a layer its own draw still owns; a claiming draw revokes the stale object URL at once) + decode bounded at 20 s; tests/e2e/display-decode.spec.mjs (60 presses at crossfadeMs+200 ms, crossfadeMs 0 and 1200). Builder: spec failed 3/3 on the base display.js, passes 5/5. Pre-commit r1: lint/format/tests/security/scope exit 0.
- Mutations r1 (conductor): no-owner-guard 1 — killed. unbounded-decode 0 — EQUIVALENT individually, quoted override: the decode bound is a redundant backstop (the owner guard already prevents the hang); with BOTH removed — i.e. the base js/display.js — the spec fails (`display-decode-hang--ac2-pre-r1.json` exit 1 against the base commit; builder 3/3 failures). Builder's own probe: guard removed + 1 s bound → 55/61 draws, nothing pending (the bound alone keeps rotation going).
- Step 4 re-tally `display-decode-hang--tally-step4-r1-c1.json` (--correction, quoted above). Counted under corrections.
- predispatch --kind code ok; Step 7 dispatched 2026-10-10T13:03:26Z: display-decode-hang-review-anchored-r1 (opus; tags none → anchored only); tree 086a7de

## Step 7 triage — r1 (artifacts/display-decode-hang--review-r1.md, APPROVE; "Criterion 5 stall attempts: PASS"; race closed at the root; 20 s bound recovers a never-settling decode in ~21 s; crossfade unchanged; spec fails on the base display.js at press 2)
- R1M1 (reviewer: spec-gap; conductor class: code-bug, test strength): the spec does not detect an object-URL leak — with the claiming draw's revoke deleted it still passes, while that variant leaked 24 object URLs in the reviewer's stall run. A slow leak on an always-on display is an equipment-protection concern → re-dispatch r2: the spec counts URL.createObjectURL / revokeObjectURL and asserts no orphaned URL after the presses.
- R1M2 (spec-gap): on a slow machine presses drift off the race timing; the spec still passes (not flaky) but proves less → r2: report the number of late presses and fail if more than a small share drift.
- Re-dispatch r2 (fresh builder; test only). Re-dispatches: 1

## Plan acceptance — Step 4 r2 (E2E_PORT=20810)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `display-decode-hang--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `display-decode-hang--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `display-decode-hang--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `display-decode-hang--ac4-r2.json` |
| 5 | narrated: reviewer stall attempts | review row (Step 7) | r1 review PASS | review-rows 5 |
- r2: spec only — object-URL ledger (every live blob URL must be on a layer) and press-timing drift (fail if >10% of gaps are >50 ms off crossfadeMs+200). Pre-commit r2: lint/format/tests/security/scope exit 0.
- Mutations r2 (conductor): no-claim-revoke 1 (R1M1 closed) · no-owner-guard 1 — killed. unbounded-decode remains the quoted equivalent backstop (r1).
- Confirmation review SKIPPED (Step 7: closures proven by conductor mutants; test-only delta; not risk:high): R1M1 → no-claim-revoke-r2 killed; R1M2 → builder's DRIFT_MS=0 probe fails the drift assertion (handback-builder-r2).
- Step 4 re-tally `display-decode-hang--tally-step4-r2-c1.json` (--correction, quoted). Counted under corrections.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh records -r1 and -r2)

## Seam check (merged: + display-decode-hang)
- `round--seam-w3-r5.json` exit 0 (npm test, full npm run test:e2e, check-precache)

## Step 8 tally (`display-decode-hang--tally-step8-r2-c1.json`; derive read the equivalent r1 backstop mutant — correction quoted)
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

- Landed: af55616 — "Stop a pending image decode from freezing poster rotation"
- Read-back ok; attribution (commit form, r2) ok

## Reviews
- r1 anchored (APPROVE; Minors → r2); r2 confirmation skipped (mutant closures)

## Notes / reconciliation
- Unknowns: none. Follow-ups: the K23/Q25 routing to pixel-shift is superseded (D30). content-rating-filter case 18 should now be stable.
