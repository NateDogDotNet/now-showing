# pixel-shift

- Mode: afk        Tags: ui        Blocked by: rotation-layout-and-shell (done cc16968), settings-and-schedule-core (done 33976fe)
- Status: done · landed 1b31344 · confidence 100
- Commit(s): 1b31344
- Agent type: orchestrator-builder; model sonnet, effort medium
- Claimed: 2026-10-10T18:45:10Z
- Worktree: ../wt-pixel-shift on branch orch/pixel-shift from 80d1759 (D12). Serial: shares css/app.css and index.html with the remaining ui phases.

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 3, 5, 6 fail (spec, margin, wiring missing); 1, 2, 4, 7 exit 0. `closer preflight` ok.
- PROBE: `grep -n 'pixelShift' js/settings.js` → pixelShift (default true) and pixelShiftMinutes (3, 1–60) exist — meets criterion 3 (keys to bind)
- PROBE: `grep -n 'DEFAULT_SETTINGS' tests/e2e/lib.mjs` → harness default pixelShift:false — meets criterion 4 (existing specs unaffected)
- PROBE: `grep -n 'transform: translate(-50%, -50%) rotate' css/app.css` → .stage uses transform, leaving the individual translate property free — meets criterion 3 (screen-space offset)
- Step 3: orchestrator-builder pixel-shift-builder-r1, sonnet, medium; brief artifacts/pixel-shift--brief-r1.md
- Dispatched: 2026-10-10T18:45:14Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-pixel-shift, E2E_PORT=22020)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `pixel-shift--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `pixel-shift--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `pixel-shift--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `pixel-shift--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `pixel-shift--ac5-r1.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `pixel-shift--ac6-r1.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `pixel-shift--ac7-r1.json` |
- Pre-commit r1: lint/format/tests/security/scope exit 0.
- Mutations r1 (conductor; pixel-shift e2e, layout unit): stuck-shift 1 · no-margin 1 · instant-jump 1 · shift-when-off 1 · room-ignores-rotation 1 · path-repeats 1 — killed (failure messages checked: each is the hazard's assertion).
- Questions r1: none. Verify item (real server): Chromium >= 104 for the individual translate property on the Pi → real-server-validation-extended row.
- predispatch --kind code ok; Step 7 dispatched 2026-10-10T19:17:22Z: pixel-shift-review-anchored-r1 (opus; ui → screenshots; not risk:high, no child-safety path → no cold review); tree 60dfc79

## Step 7 triage — r1 (anchored `--review-r1.md` APPROVE, "UI screenshots: PASS" — 10 shots; full e2e exit 0; reviewer probe: 180/270 inside viewport, one glide per step, timer neither doubles nor leaks on Save, off → translate none; D30 guards intact)
- PSM1 (spec-gap): the Display protection fieldset has no `data-live`, so its changes apply on Save — but an unsaved change rides along if a live layout field is moved (Cancel reverts). CONDUCTOR RULING K30: no round here; routed to `settings-sheet` (owns the live-preview contract) as a follow-up. Listed at the next stop.
- PSM2 (spec-gap): at extreme steps the frame sits flush with the screen edge (offset uses the whole floored margin; nothing clipped; inside the criterion). No action.
- No open finding: Step 7 closes.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r1)

## Seam check (merged: + pixel-shift)
- `round--seam-w3-r9.json` exit 0 (npm test, full npm run test:e2e, check-precache)

## Step 8 tally (`pixel-shift--tally-step8-r1.json`)
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

- Landed: 1b31344 — "Move the stage a few pixels every few minutes with a 1.5 s glide"
- Read-back ok; attribution (commit form, r1) ok

## Reviews
- r1 anchored (APPROVE; 2 Minors; UI PASS, 10 shots)

## Notes / reconciliation
- Unknowns: Chromium >= 104 translate support on the Pi (follow-up → real-server-validation-extended). Rulings for the next stop: K30 (routed to settings-sheet). Invalidated: none.
- Follow-up correction (2026-10-10, conductor): the Chromium translate follow-up duplicated extended row V1-E17 and was dropped. A first `--drop 13` (1-based guess) removed K31 by mistake (state.py indexes from 0); K31 was re-added with its original text and owner/deadline, then `--drop 12` removed the duplicate.

## Index items carried (verbatim from .orchestrator/state.md; added 2026-10-14 by conductor-2 for closer index-check)
these rulings and deferrals were recorded in this phase's stop messages and in docs/decisions.md in other words; closer index-check requires the index text itself in a phase file, so it is copied here unchanged.
- K23/Q25 — pixel-shift must fix js/display.js show(): the previous draw's cleanup timer clears the src of a layer whose next decode() is pending, the decode never settles, state.busy sticks and rotation stops until reload; add a regression test; also harden content-rating e2e cases 4 and 10 sampling (wait for the poster to change)
