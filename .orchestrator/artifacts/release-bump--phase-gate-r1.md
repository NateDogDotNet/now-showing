Agent: conductor-2 · model: claude-fable-5-1 · dispatched: 2026-10-14T22:09:30Z (the /phase-gate skill run in session by the conductor; no subagent was dispatched)

## Phase gate: release-bump (closes milestone M4 and the 2.1 plan)

Run by conductor-2 (the skill run in session, no agent), 2026-10-14, against the staged release tree in `/home/nathan/wt-release-bump` (index tree `2a0180d4601eac36e3accd1cde691986c35d2401`; `js/main.js` blob `4a148ed…`, `sw.js` blob `a6d94ca…`). Scope: the M4 phases of `docs/integration-plan.md` (`real-server-validation-extended`, `docs`, `rename-now-showing`, `release-bump`) and the plan-level close, since the plan has no story files: its "stories" are the numbered phases, each with shell acceptance criteria.

### Overall verdict: PASS

### Story status
| Story | Status | Blockers |
|---|---|---|
| real-server-validation-extended (plan 24) | DONE — 4/4 criteria exit 0 (`real-server-validation-extended--ac{1..4}-r2.json`), Step 8 tally 55/55, gate-2 ok, landed 128b62e | — |
| docs (plan 25) | DONE — landed 78b9f67, gate ok; its criteria 1–6 still exit 0 against the staged release tree (`scratchpad/docs-criteria.sh`), so the Roadmap merges did not break it | — |
| rename-now-showing (plan 29) | DONE — landed 7192007, Step 8 tally 90/90; gate failures were a process-order exception, recorded | — |
| release-bump (plan 26) | AC 9/9: criteria 1, 2, 3, 6, 7, 9 exit 0 on the r2 tree (`release-bump--ac{1,2,3,6,7,9}-r2.json`); 4 and 5 exit 0 on the r1 tree whose code files are byte-identical in r2 (only README.md and Roadmap.md changed in r2); 8 narrated and evidenced (scrub-pii ×3, dependency-audit, security-scan, security-review on disk; code-review of 46257c3..HEAD in progress at the time of this gate, recorded in the phase file when it returns) | — |
| M1–M3 (plan 1–23, 28) | DONE earlier in the run (state.md: 26 of 29 phases done; `position-drag-nudge` and `fill-blur-and-info` deferred to 2.2 by D41, not blockers) | — |

Every criterion of every in-scope phase maps to an evidence file (`<phase>--ac<n>-r<N>.json`) or a narrated-row artifact; no AC is unmapped.

### Test suite
- Command: `npm test && npm run test:e2e && node scripts/check-precache.mjs` (plan criteria 4–6; the repository has no coverage tool).
- Run on the staged release tree (r1, 2026-10-14 ~21:37–21:54 UTC, `release-bump--ac4-r1.json`, `release-bump--ac5-r1.json`, `release-bump--ac6-r2.json`):
  - `npm test`: 327 tests, 327 pass, 0 fail, 0 skipped (node --test).
  - `npm run test:e2e`: exit 0, every spec PASS including the new `release` spec (984 s).
  - `check-precache`: 31 precached files OK.
- The r2 edits touched only README.md and Roadmap.md, which no test reads (`grep -rl "README\|Roadmap" tests/` → none); the suite was not re-run for them and this gate says so rather than claiming a fresh run.
- Coverage: not measured (no tool configured); not a plan target.

### Code quality
- Lint errors: 0 — `node --check` over `js/*.js`, `sw.js`, `scripts/*.mjs`, `tests/e2e/*.mjs` (no eslint configuration ships in the repository; the run's per-phase pre-commit lint was `node --check` throughout).
- `git diff --cached --check`: clean (`release-bump--precommit-format-r2.json`).

### Architecture alignment
- PASS. `docs/spec.md` describes a static PWA (`index.html`, `sw.js`, `js/*` ES modules), a Node static server with an allowlist (`scripts/serve.mjs`) and an opt-in loopback device helper (`scripts/device-helper.mjs`); all exist. The README's project layout lists every `js/*.js` and `scripts/*.mjs` (docs criterion 4, exit 0 on the release tree), so there is no undocumented module. `sw.js`'s `SHELL` list matches the files on disk (`check-precache` 31 OK). The one 2.1 refactor flagged as owed (`js/main.js` ~1,440 lines) is on the Roadmap's engineering backlog, not a divergence.

### Documentation currency
- README.md: current for 2.1.0 as shipped — the status banner now records the real-server validation (17 core, 15 extended rows) and the pending Pi rows; the "(verify)" tags were updated from the validation results (K61) and the reviewer confirmed each removal against a PASS row (`release-bump--review-r1.md`).
- Roadmap.md: current — the 2.1 section says what shipped, the owner's 2026-10-14 requests (D51–D71) are entries with a suggested order (D53, D72), and shipped items left the Ideas list (docs criterion 6).
- CHANGELOG.md: none in the repository (never part of the plan; the Roadmap's "Done in 2.1" list and `git log` serve).
- CLAUDE.md: none in the repository.
- Spec requirements in scope: R-REL-1 (single bump, 2.1.0, release gate D11) met by criteria 1–3; R-DOC-* by the docs phase and this phase's README/Roadmap edits; R-VAL-1/2 by the two validation phases.

### NFRs in scope
- The spec defines no separate NFR table. The non-functional targets live in the requirements themselves and were measured: 24 h stability (V1-C17: the HOME soak at hour 15 had 872 poster changes, 0 crashes, Edge working set 460 → 698 MB, JS heap flat at 2 MB; the owner's own phone run exceeded 24 h), relay fallback within 2 min (V1-E25: connected in about 1 min, posters at ~9.5 s each), first-run code renewal (V1-E02: 15.0 min), progress-bar accuracy (V1-E08: within 6 s of the server over 70 s). Pi-only targets (CEC wake time, RAM-disk cache, labwc wake lock) are unmeasured and remain tagged (verify) in the README — recorded, not hidden.

### Risks
- Leaked Plex token (S1, R-SEC-2): mitigated — rotated and rejected with HTTP 401 (receipt `docs/security/token-rotation.md`); the history purge is the next phase and waits for the owner's explicit approval (D46, D49).
- Owner's name and shared-server names in the committed trail (security review F1): mitigated at HEAD (9507326, 84cf765); tracked for the purge's replace list (D49 note).
- Pi validation not done: tracked — README banner and Roadmap "Validate on a Raspberry Pi" backlog entry.
- Reverse proxy in front of `serve.mjs` makes every client loopback: documented in code and README (security-scan INFO).
- No open risk is unrecorded.

### Gate decision

**PASS.** All M4 stories are DONE or (release-bump) have every criterion evidenced on the staged tree; the suite is green on that tree's code; the docs describe 2.1.0 as shipped. The one condition on the close itself is procedural: the code-review of `46257c3..HEAD` (criterion 8) was still running when this gate was written; its verdict is recorded in the phase file before the phase is set done, and a Critical finding there would reopen this gate.

### Recommended next steps
1. Land the release commit from the worktree, run `closer readback`/`derive --step 8`/`gate`, set `release-bump` done (M4 and the plan's build phases close).
2. Save and send the purge approval stop (irreversible; the owner's call), then the close tail: keep-docs-current (already satisfied in-phase by the docs run and this phase's README/Roadmap work), decision-checkpoint, the milestone round, the out-of-scope sweep.
3. 2.1.x: bump playwright to 1.64.1; make `release.spec.mjs` read the version from `sw.js`; the two polish items already on the Roadmap.
