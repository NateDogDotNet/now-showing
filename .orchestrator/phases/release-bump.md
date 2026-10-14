# release-bump

- Mode: afk        Tags: —        Blocked by: docs (78b9f67), rotate-plex-token (debe086), real-server-validation (5c664af), real-server-validation-extended (128b62e), rename-now-showing (7192007) — all done
- Agent type: orchestrator-builder; model sonnet, effort high
- Commit(s): 1450d71
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

## Index items carried (verbatim from .orchestrator/state.md; added 2026-10-14 by conductor-2 for closer index-check)
carried into this phase by D48 (K61) and the docs r3 review; release-bump answers them.
- K61 — after real-server-validation and -extended pass, update README.md's (verify)/unverified tags from their results (a flag or command proven on the real server or Pi loses its tag; a failed one is corrected or removed), then re-run the docs criteria
- docs r3 wording (with the K61 tag update): README 'Daily reload' — the reload waits while ANY dialog is open (PIN, shortcuts, Settings, Diagnostics), and a key, touch or mouse click wake does not trigger the 12-hour reload; also drop the internal id '(K60)' from Roadmap.md's 2.1.x polish line

## Step 4 r1 — conductor verification (in ../wt-release-bump, evidence.py exec)
- Handback `release-bump--handback-builder-r1.md`: status complete, 7 paths, no deviations, no questions.
- ac1, ac2, ac3, ac6, ac7, ac9 exit 0 (`release-bump--ac{1,2,3,6,7,9}-r1.json`); ac4/ac5 (npm test, e2e) running as `release-bump--ac4-r1.json` / `-ac5-r1.json`.
- The done `docs` phase's criteria 1–6 still pass against the staged Roadmap/README (`scratchpad/docs-criteria.sh`, all exit 0): the merged entries keep "Remote control", "Frame per poster source", "Multi-poster landscape layout", "Animated frame bulbs", "Frame rotation" as text (D57 note).
- Conductor read of the diff: README changes are the four tag edits plus the two wording fixes, as briefed; versions in exactly four files, lockfile otherwise unchanged; `release.spec.mjs` seeds `shell-2.0.0` before registration and asserts only `shell-2.1.0` remains. Roadmap: D51–D71 entries present with constraints and order; "Suggested order" section; "(K60)" dropped; backlog entry replaced by "Validate on a Raspberry Pi". One observation for the reviewer: the Home controls entry cites the `.orchestrator/artifacts/research--…` path, which is dropped before any PR (D13) and will dangle in the published Roadmap.

## Criterion 8 close-time reviews (conductor, Step 8 work started early so a finding can still land in this phase)
- `scrub-pii` on docs/validation/real-server-core.md, real-server-extended.md and docs/security/token-rotation.md: `release-bump--scrub-pii-*-r1.md` (pii.py bind/scan/verify pasted). Candidates: the Plex build number `10793` and port `32400` only, adjudicated KEEP (operational identifiers); the receipt has none. No edits. Status CLEAN for all three.
- `dependency-audit`: `release-bump--dependency-audit-r1.md`. One devDependency, playwright 1.56.1: 0 CVEs (npm audit), not deprecated, Apache-2.0 vs MIT OK, used (tests/e2e/lib.mjs:25), 113.6 M weekly downloads, canonical name; MEDIUM outdated (minor-behind, 362 days; latest 1.64.1 published today). Action: bump after 2.1.0 ships (a 2.1.x item, outside criterion 7's file set).
- `security-review` (branch diff ee6fbbe..HEAD): run as the purge's pre-claim preparation, `purge-git-history--security-review-r1.md`; one Medium (the owner's name in a profile path) fixed in 9507326/84cf765. Counted here too: the release commit will sit on that reviewed branch.
- Still to run: `code-review` of `46257c3..HEAD` and `security-scan` over the repository (after the suite finishes; both spawn agents and the machine is short on memory).

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-release-bump)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (VERSION 2.1.0 in four files) | evidence.py exec (plan command) | 0 | `release-bump--ac1-r1.json` |
| 2 | plan criterion 2 (Rotated: yes) | evidence.py exec (plan command) | 0 | `release-bump--ac2-r1.json` |
| 3 | plan criterion 3 (both validations PASS) | evidence.py exec (plan command) | 0 | `release-bump--ac3-r1.json` |
| 4 | plan criterion 4 (npm test) | evidence.py exec (plan command) | 0 | `release-bump--ac4-r1.json` (327 pass, 0 fail) |
| 5 | plan criterion 5 (npm run test:e2e, includes release.spec.mjs) | evidence.py exec (plan command), E2E_PORT 18280 / 18601 | 0 | `release-bump--ac5-r1.json` (984 s, PASS release) |
| 6 | plan criterion 6 (check-precache) | evidence.py exec (plan command) | 0 | `release-bump--ac6-r1.json` |
| 7 | plan criterion 7 (exactly the seven Output files changed) | evidence.py exec (plan command) | 0 | `release-bump--ac7-r1.json` |
| 8 | plan criterion 8, narrated: close-time reviews | scrub-pii and dependency-audit done (section above); security-review done as purge pre-claim prep; code-review and security-scan at Step 8 | — | `release-bump--scrub-pii-*-r1.md`, `release-bump--dependency-audit-r1.md`, `purge-git-history--security-review-r1.md` |
| 9 | plan criterion 9 (Roadmap entries D51–D71, suggested order) | evidence.py exec (plan command) | 0 | `release-bump--ac9-r1.json` |
- Step 4 tally r1-c1: 50/50 COMPLETE (release-bump--tally-step4-r1-c1.json; correction quoted: scope and ac8 records written after the first derive). closer predispatch --kind code ok (release-bump--predispatch.json).
- Step 7: orchestrator-reviewer release-review-r1 (anchored), opus; brief artifacts/release-bump--brief-review-r1.md; dispatched 2026-10-14T22:03:04Z
- Step 7 r1 verdict: release-bump--review-r1.md (release-review-r1, anchored) — APPROVE, five Minor. Triage: M1 code-bug (Roadmap Suggested order: Coming Soon not-in-library after 2.4, not with it) → r2; M2 spec-gap (README banner's "(verify)" definition vs V1-E04) → D72 ruling → r2; M3 spec-gap (Roadmap cites an .orchestrator path; the conductor's own observation) → D72 → r2; M4 spec-gap (D60 vs D64 order) → D72 ruling → r2; M5 spec-gap (release.spec.mjs hard-codes versions) → Roadmap 2.1.x polish bullet in r2 (no code change in this release). No Critical or Major; nothing dismissed.
- Re-dispatch r2: release-builder-r1 resumed with the five edits (Markdown only; no code or test change), 2026-10-14T22:07:07Z. Re-dispatches: 1. The suites are not re-run for r2: README.md and Roadmap.md are read by no test (criteria 4–6 do not read them); criteria 1, 2, 3, 6, 7, 9 and the docs criteria are re-run.

## Plan acceptance — Step 4 r2 (evidence.py exec in ../wt-release-bump; r2 changed README.md and Roadmap.md only)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `release-bump--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `release-bump--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `release-bump--ac3-r2.json` |
| 4 | plan criterion 4 | r1 run stands: no file a test reads changed in r2 (`git diff --cached --stat` r1→r2: README.md, Roadmap.md) | 0 | `release-bump--ac4-r1.json` |
| 5 | plan criterion 5 | r1 run stands (same reason) | 0 | `release-bump--ac5-r1.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `release-bump--ac6-r2.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `release-bump--ac7-r2.json` |
| 8 | plan criterion 8, narrated | scrub-pii, dependency-audit, security-scan, security-review on disk; code-review of 46257c3..HEAD running | 0 | `release-bump--ac8-r1.json`, `release-bump--security-scan-r1.md` |
| 9 | plan criterion 9 | evidence.py exec (plan command) | 0 | `release-bump--ac9-r2.json` |
- r2 handback `release-bump--handback-builder-r2.md`: the five edits done; DEVIATION noted by the builder itself: the handback records each criterion as passing without the full command output, and its agent line keeps the r1 name with the r2 stamp. The conductor's own r2 runs above are the evidence. Conductor checks: `grep -c orchestrator Roadmap.md` → 0; the 2.2 line reads schedule → selection → profiles; the banner's "(verify)" definition names the V1-E04 exception; the done docs phase's criteria 1–6 still exit 0.
- Pre-commit on the staged r2 tree: precommit-lint-r1 (node --check on the staged JS, unchanged in r2), precommit-format-r2, precommit-security-r2, precommit-tests-r1 (npm test exit 0 at r1), scope-r2: all exit 0.
- Step 7 /phase-gate (M4 and plan close): release-bump--phase-gate-r1.md — PASS; the code-review of 46257c3..HEAD was still running when written (recorded below when it returns).
- Landed: 1450d71 — "Release 2.1.0: bump the version, settle the README's verify tags, extend the Roadmap" (cherry-pick of the worktree commit 4bc98ac52db897855e246cb08e2cb577120f55a6)

## Pre-commit — lint (node --check), format (git diff --check), tests (npm test in ac4), security, scope: all exit 0 on the staged r2 tree and the landed commit (precommit-lint-r2, precommit-format-r2, precommit-security-r2, precommit-tests-r1, scope-r2); review-check-r1 (no Critical/Major), dlog-check-r2 (no hits), attribution-r2 ok

## Step 8 tally — release-bump--tally-step8-r2-c1.md (first r2 derive scored the message 0/5 as stale; correction quoted above in the derive record)
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
