# frame-brightness

- Mode: afk        Tags: ui        Blocked by: settings-and-schedule-core (done 33976fe)
- Status: done · landed 9263977 · confidence 100
- Commit(s): 9263977
- Agent type: orchestrator-builder; model sonnet, effort medium
- Claimed: 2026-10-10T19:50:39Z
- Worktree: ../wt-frame-brightness on branch orch/frame-brightness from 1b31344 (D12). Serial: shares index.html (Display protection fieldset), css/app.css, js/display.js and js/main.js.

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 1, 3 fail (module/spec missing); 2, 4, 5 exit 0. `closer preflight` ok.
- PROBE: `grep -n 'rightness\|nightDim' js/settings.js` → frameBrightness, nightDim, nightDimStart/End, nightDimLevel, nightDimTarget exist — meets criterion 3 (keys to bind)
- PROBE: `grep -n 'export function' js/schedule.js` → parseHHMM, inWindow, isPlausibleClock exist — meets criterion 1 (helpers to reuse)
- PROBE: `grep -n 'id="frame"\|id="stage"' index.html` → both targets exist — meets criterion 3 (filter targets)
- Step 3: orchestrator-builder frame-brightness-builder-r1, sonnet, medium; brief artifacts/frame-brightness--brief-r1.md
- Dispatched: 2026-10-10T19:50:39Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-frame-brightness, E2E_PORT=22220)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `frame-brightness--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `frame-brightness--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `frame-brightness--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `frame-brightness--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `frame-brightness--ac5-r1.json` |
- Pre-commit r1: lint/format/tests/security/scope exit 0. Deviations (accepted): css/app.css unchanged; the new controls sit in a nested `<div data-live>` inside Display protection (pixel-shift fields stay non-live, K30); clock-jump detection reuses syncSleepClock's 1 s check.
- Mutations r1 (conductor; brightness unit + e2e): ramp-jump 6 · implausible-clock-dims 1 · not-min 4 · stage-target-ignored 1 · no-minute-timer 1 — killed. **no-clear 0 — SURVIVED**: dropping `clear.style.filter = ''` in display.setBrightness passes; switching nightDimTarget frame→stage on a running page would leave #frame dimmed under a dimmed #stage (double dim).
- Questions r1: none.
- Re-dispatch r2: recipient frame-brightness-builder-r2 (fresh), forced by the surviving mutant no-clear. Re-dispatches: 1

## Plan acceptance — Step 4 r2 (E2E_PORT=22220)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `frame-brightness--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `frame-brightness--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `frame-brightness--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `frame-brightness--ac4-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `frame-brightness--ac5-r2.json` |
- r2 (tests only): new e2e case switches nightDimTarget frame→stage→frame by live preview and by Save at 23:00 and asserts the other element's filter is none. Pre-commit r2: lint/format/tests/security/scope exit 0.
- Mutations r2 (conductor): no-clear 1 — killed. r1 kills stand (app code unchanged).
- predispatch --kind code ok; Step 7 dispatched 2026-10-10T19:57:26Z: frame-brightness-review-anchored-r2 (opus; ui → screenshots; not risk:high → no cold review); tree 305fa4a

## Step 7 triage — r2 (anchored `--review-r2.md` APPROVE, "UI screenshots: PASS" — 8 shots; full e2e exit 0; reviewer probes: ramp math incl. DST fall-back, 1970 clock, start==end; one timer; no TDZ at boot; veil intact)
- FBM1 (spec-gap): the visibilitychange re-evaluation has no test. CONDUCTOR: no round — the minute timer self-corrects within 60 s; pi-stability (owns visibility/reload behaviour) may add the case. No follow-up.
- FBM2 (spec-gap, UX): the Frame brightness slider shows no current value (other sliders use `<output data-for>`, unsigned format as posterScale) and its hint wraps. CONDUCTOR RULING K31: routed to `settings-sheet` (owns sheet layout). Listed at the next stop.
- FBM3 (spec-gap): a nightDimStart between 02:00 and 02:59 on a spring-forward night jumps to full dim instead of easing. No action (default 22:00 unaffected; once a year at an unusual setting).
- No open finding: Step 7 closes.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r2)

## Seam check (merged: + frame-brightness)
- `round--seam-w3-r10.json` exit 0 (npm test, full npm run test:e2e, check-precache)

## Step 8 tally (`frame-brightness--tally-step8-r2.json`)
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

- Landed: 9263977 — "Add frame brightness and a stepped night dim"
- Read-back ok; attribution (commit form, r2) ok

## Reviews
- r2 anchored (APPROVE; 3 Minors; UI PASS, 8 shots)

## Notes / reconciliation
- Unknowns: none. css/app.css in Output but unchanged (gate checks the declared set). Rulings for the next stop: K31 (routed to settings-sheet). Invalidated: none.
