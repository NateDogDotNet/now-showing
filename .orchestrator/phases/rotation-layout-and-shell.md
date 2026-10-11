# rotation-layout-and-shell

- Mode: afk        Tags:         Blocked by: (see plan; all done)
- Status: done · landed cc16968 · confidence 100
- Commit(s): cc16968
- Agent type: orchestrator-builder (no BMad install); model sonnet
- Claimed: 2026-10-08T23:05:17Z
- Worktree: ../wt-rotation-layout-and-shell on branch orch/rotation-layout-and-shell from 33976fe (D12)

## Pre-flight
- Pre-dispatch run: artifacts/rotation-layout-and-shell--preflight-r1.md (failures = missing deliverables; npm test, precache and scope probes pass)
- `git log -- <new outputs>`: empty
- PROBE: F1 reproduction (skeptic review C1, planning) → 1920x1080 rot 90 stage centre y 844, 304 px low — meets criterion 1 (the spec must fail on the old CSS)
- Dispatched: 2026-10-08T23:05:45Z        Re-dispatches: 0        Inner revision rounds: 0
- Step 3: orchestrator-builder rotation-layout-and-shell-builder-r1, sonnet, medium; brief artifacts/rotation-layout-and-shell--brief-r1.md

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-rotation-layout-and-shell, E2E_PORT=18710)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | `npm run test:e2e -- rotation`  (viewports 1920x1080, 1080x1920, 1280x800 x rotations 0/90/180/270 with `pixelShift:fals… | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac1-r1.json` |
| 2 | `npm run test:e2e -- ui-rotation`  (for rotation 90/180/270 and viewports 1920x1080 and 1080x1920: open settings (`s`) a… | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac2-r1.json` |
| 3 | `grep -Eq 'pixelShift: *false' tests/e2e/rotation.spec.mjs tests/e2e/ui-rotation.spec.mjs`  (these specs name the seed, … | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac3-r1.json` |
| 4 | `npm test`… | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac4-r1.json` |
| 5 | `node scripts/check-precache.mjs`… | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac5-r1.json` |
| 6 | `grep -q -- '--ui-rotation' css/app.css && grep -q -- '--ui-rotation' js/display.js`… | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac6-r1.json` |
| 7 | `test -z "$(git status --porcelain -- js/settings.js js/engine.js js/plex.js js/main.js sw.js scripts)"`… | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac7-r1.json` |
| 8 | narrated: the reviewer shows the `rotation` spec failing against the CSS at `3a7b688` (a throwaway `git worktree` of tha… | first half exec by conductor: `rotation-layout-and-shell--probe-oldcss-r1.json` (specs FAIL on the pre-phase CSS: stage top 304) exit 0; screenshot half = Step 7 review row | partly pending | review-rows 8 |

## Scope — reconcile MISMATCH only because index.html (in Output) was not touched — Output is a whitelist, not a requirement; touched ⊆ Output; scope-r1 exit 0
## Pre-commit (substitute): lint `-r1b` (r1e config) exit 0; format/tests/security exit 0
## Mutations r1 (all killed): ignore-rotateui 1 · no-axis-swap 1 · dialog-not-rotated 1 · no-centre-translate 1
- Step 7 dispatched 2026-10-08T23:29:21Z: rotation-layout-and-shell-review-anchored-r1 (opus): code + criterion 8 screenshots + /ux-simulate; tree 105f766

## Step 7 triage — r1 (artifacts/rotation-layout-and-shell--review-r1.md, APPROVE; "Criterion 8 screenshots: PASS"; conductor viewed rotation-layout-and-shell--shot-1920x1080-r90-settings.png: sheet upright for the viewer, docked to the viewer's right, nothing clipped)
- Row 8 exec form: `rotation-layout-and-shell--ac8-r1.json` (screenshot PASS line + APPROVE) — first half already proven by `rotation-layout-and-shell--probe-oldcss-r1.json`.
- Minor 1 (code-bug against R-ROT-2): "The toast's max-width uses the physical `92vw` instead of the viewer's width, so on a short landscape screen at 90/270 a long toast overflows and clips." → re-dispatch r2 (Step 7: a review with any code-bug is a re-dispatch). Re-dispatches: 1
- Declined-to-judge items recorded: native `<select>` popups and tooltips may stay unrotated (headless cannot capture) → UNKNOWN for hardware validation; safe-area insets in the rotated frame (zero on TV/Pi) → no action.

## Plan acceptance — Step 4 r2 (evidence.py exec in ../wt-rotation-layout-and-shell, E2E_PORT=18752)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac1-r2.json` |
| 2 | plan criterion 2 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac2-r2.json` |
| 3 | plan criterion 3 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac3-r2.json` |
| 4 | plan criterion 4 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac4-r2.json` |
| 5 | plan criterion 5 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac5-r2.json` |
| 6 | plan criterion 6 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac6-r2.json` |
| 7 | plan criterion 7 (verbatim in the r1 table) | evidence.py exec (plan command) | 0 | `rotation-layout-and-shell--ac7-r2.json` |
| 8 | narrated: old-CSS failure + screenshots | review row (Step 7) | r1 evidence stands (probe-oldcss-r1, ac8-r1) | review-rows 8 |
- r2 change verified: css/app.css toast `max-width: min(calc(var(--vw) * 0.92), 520px)`; new 844x390 r90/r270 long-toast cases in ui-rotation pass.
- Pre-commit r2: lint `-r2` exit 1 (stale r1 config, known); `rotation-layout-and-shell--lint-r2b.json` (round--eslint-r1e.config.mjs) exit 0. format/tests/security/scope exit 0.
- Mutations r2: toast-physical-vw 1 (killed; reverting the fix fails the long-toast case).
- Pre-commit `-r2c` with round--step4-generic-r2.sh (v2: lints with the r1e config — fixes the recurring stale-config defect at its root): see records.
- Step 4 re-tally `rotation-layout-and-shell--tally-step4-r2-c1.json` (--correction: conventions row → precommit-lint-r2c exit 0). Counted under corrections.

## Step 7 triage — r2 (artifacts/rotation-layout-and-shell--review-r2.md, APPROVE, delta-scoped from tree 105f766; Critical/Important/Minor empty)
- r1 Minor 1 confirmed fixed; the reviewer restored the old rule and the long-toast case failed with the r1 box; 24 toast boxes (6 sizes × 4 rotations) inside the viewport; `--vw` fallback 100vw in :root keeps rotation 0/180 identical.
- Row 8 exec form: `rotation-layout-and-shell--ac8-r2.json` (r1 screenshot PASS line + r2 APPROVE).

## Seam check (merged: serve-config-guard, e2e-harness, validation-checklists, settings-and-schedule-core, rotation-layout-and-shell)
- `round--seam-w3-r1.json` exit 0 (npm test, npm run test:e2e, check-precache: 24 files)

## Step 8 tally (`rotation-layout-and-shell--tally-step8-r2.json`)
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

- Landed: cc16968 — "Rotate the whole UI with the poster and size it to the viewer's screen"
- Read-back: first run `-readback-cc16968.json` not ok on token "2.0.0" (the shipped version named in the message, VERSION at sw.js:5 and js/main.js:13); re-run with a quoted exemption `-readback-cc16968-2.json` ok. Attribution (commit form, r2) ok.

## Reviews
- r1: artifacts/rotation-layout-and-shell--review-r1.md (APPROVE; Minor 1 fixed in r2); r2: artifacts/rotation-layout-and-shell--review-r2.md (APPROVE, delta-scoped)

## Notes / reconciliation
- Unknowns: native <select> popups / title tooltips under a rotated UI (state note; hardware check in real-server-validation-extended). Out of scope: none. Invalidated: none.
