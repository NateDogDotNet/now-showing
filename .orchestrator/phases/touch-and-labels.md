# touch-and-labels

- Mode: afk        Tags: ui        Blocked by: kiosk-and-pin (done f7be8a9), sleep-mode (done e6f426b)
- Status: done · landed 0bf5655 · confidence 100
- Commit(s): 0bf5655
- Agent type: orchestrator-builder; model sonnet, effort high
- Claimed: 2026-10-11T16:33:33Z
- Worktree: ../wt-touch-and-labels on branch orch/touch-and-labels from ca4de29 (D12). Serial: shares js/main.js, index.html, css/app.css, sw.js with recommended-protection-preset.
- Output amended (K54): + js/engine.js, tests/engine.test.js, tests/e2e/first-run.spec.mjs.

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 1, 3, 5 fail (module, spec, dialog missing); 2, 4 exit 0. `closer preflight` ok.
- PROBE: `grep -n 'const KEYS' js/main.js` → the shortcut map (l.1007) to rebuild from js/shortcuts.js — meets criterion 1 (one table)
- PROBE: `grep -n 'contextmenu' js/main.js` → the kiosk exemption covers every dialog[open] (l.1102) — meets criterion 3 (K36 to narrow)
- PROBE: `grep -n 'controlLabels' js/settings.js` → controlLabels ('auto'|'always'|'never') exists — meets criterion 3 (label setting)
- Routed items: K36 (D40), engine.js hint, K53 (D43), S6C1/S6C2.
- Step 3: orchestrator-builder touch-and-labels-builder-r1, sonnet, high; brief artifacts/touch-and-labels--brief-r1.md
- Dispatched: 2026-10-11T16:33:33Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-touch-and-labels, E2E_PORT=24720)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac5-r1.json` |
- Pre-commit r1: all exit 0. Full e2e 18 specs PASS (builder). Routed items done: K36 (contextmenu prevented on the PIN keypad, Diagnostics and the stage; allowed in text inputs and on the Settings box), engine.js hint (only when unwatchedOnly), K53 (rest hides the general line), S6C1/S6C2 (post-rest assertion; freshUntil timeout 3→30 s; 6 parallel first-run runs pass).
- Builder mutants: wasVisible dropped, #empty in the swallow rule, old dialog[open] contextmenu rule — caught. Equivalent survivors argued: the dialog[open] guard in the swallow rule (a modal's surroundings are inert), disableShortcuts inside openShortcuts (the keydown handler already returns), the mouse exclusion (a mouse press on hidden controls never yields a button click).
- Questions r1 — conductor rulings (D44 standing defaults): Q-tl1 → K55 (accepted: the K36 exemption also covers the Settings sheet's own box — kiosk.spec asserts it); Q-tl3 → K56 (accepted: native title attributes removed so desktop shows one tooltip, generated from the shortcut table; Pin's 'Unpin <title>' moves to aria-label); **Q-tl2 → K57 (changed)**: R-CTRL-3 names a 'Keyboard shortcuts' button in Diagnostics — on a touch-only kiosk it is the only way to open the overlay → r2 adds it (hidden with disableShortcuts).
- Re-dispatch r2: recipient touch-and-labels-builder-r2 (fresh), forced by the R-CTRL-3 gap. Re-dispatches: 1

## Plan acceptance — Step 4 r2 (E2E_PORT=24720)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac4-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac5-r2.json` |
- r2: Diagnostics #diag-shortcuts opens #shortcuts, hidden when the shortcut list is empty (disableShortcuts); e2e failed on r1 first. Full e2e 103 PASS (builder). Pre-commit r2: all exit 0.
- Mutations r2 (conductor): swallow-visible 1 · swallow-anywhere 1 · diag-button-always 1 — killed.
- predispatch --kind code ok; Step 7 dispatched 2026-10-11T17:30:10Z: touch-and-labels-review-anchored-r2 (opus; ui → screenshots; D42: not risk:high → anchored only); tree 6a96b33

## Step 7 triage — r2 (anchored `--review-r2.md` APPROVE, "UI screenshots: PASS" — 7 shots, buttons ≥ 44x45 px, bar wraps to two rows on a phone; full e2e exit 0; no unwanted swallow in Settings, the PIN keypad, the empty card's buttons, mouse, keyboard, long-press, asleep, kiosk)
- TLI1 (Important 1, spec-gap): the full-screen #empty layer sits outside #stage, so on an unconfigured display the first tap on a hidden control still acts (one tap on hidden Rotate set rotation 90). CONDUCTOR RULING K58 (D44 default): the first-tap rule also covers the #empty backdrop (not its card or buttons) → r3 with an e2e case.
- TLM1 (Minor 1, spec-gap): controlLabels has no Settings control → r3 adds a three-way select (auto/always/never) in Settings (cheap; otherwise the setting is unreachable).
- TLM2 (Minor 2, test gap): removing the keyboard-click guard (e.detail > 0) survives → r3 adds a case: touch press without click, then keyboard Enter on a focused button → acts.
- TLM3 (Minor 3): the "O" key cap reads as a zero → r3 makes it unmistakable (e.g. lowercase 'o' with a 'letter O' title, or a distinct font).
- TLM4 (Minor 4): "Keyboard shortcuts" takes first focus when Diagnostics opens → r3 keeps focus where it was before (e.g. the Close button or the dialog).
- Re-dispatch r3 (fresh builder). Re-dispatches: 2

## Plan acceptance — Step 4 r3 (E2E_PORT=24720)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac1-r3.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac2-r3.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac3-r3.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac4-r3.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `touch-and-labels--ac5-r3.json` |
- r3: K58 the first-tap rule covers the #empty backdrop (not its card); TLM2 keyboard-after-touch case; TLM1 'Control labels' select; TLM3 lower-case key caps, O with aria-label 'letter O'; TLM4 Diagnostics first focus is Copy (autofocus). Pre-commit r3: all exit 0. touch-controls 31/31.
- Builder's full e2e: smoke failed once at smoke.spec.mjs:64 'advanced 59995ms' (passes alone). Root cause (conductor, from the code): the 'clock install + runFor' case reads Date.now() on a RUNNING fake clock — the Playwright 1.56 race behind K49 (Date.now() can step backwards ~ms). Not this phase's code; smoke.spec.mjs is outside its Output → routed as K59 to recommended-protection-preset (test-only, with a deadline) instead of a branched 4th round for a one-line test fix.
- Mutations r3 (conductor): empty-not-covered 1 · keyboard-click-swallowed 1 — killed.
- predispatch --kind code ok; Step 7 dispatched 2026-10-11T18:13:10Z: touch-and-labels-review-anchored-r3 (opus; DELTA-scoped from tree 6a96b33; not risk:high); tree d8d9a3d

## Step 7 triage — r3 (anchored delta `--review-r3.md` APPROVE, "UI screenshots: PASS"; full e2e exit 0 with smoke passing — the builder's one smoke failure matches K59, not this delta; K58, TLM1–TLM4 each fail without their fix)
- TL3M1/TL3M2 (spec-gap, wording): the closed Control labels select clips the Auto option text, and "Never" reads vaguely ("Never (icons only)") → follow-up for recommended-protection-preset (edits the Settings markup next). No round (D42).
- No open finding: Step 7 closes.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r3)

## Seam check (merged: + touch-and-labels)
- `round--seam-w3-r15.json` exit 0 (npm test, full npm run test:e2e, check-precache)

## Step 8 tally (`touch-and-labels--tally-step8-r3.json`)
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

- Landed: 0bf5655 — "Label the controls, make the first tap only wake them, add a shortcut list"
- Read-back ok; attribution (commit form, r3) ok

## Reviews
- r2 anchored (APPROVE; TLI1 → K58; Minors → r3); r3 anchored delta (APPROVE; UI PASS)

## Notes / reconciliation
- Re-dispatches: 2. Routed items fulfilled here: K36 (D40), engine.js hint, K53 (D43), S6C1/S6C2 — dropped with evidence. Routed onward: K59 smoke clock fix and the Control labels wording → recommended-protection-preset. Rulings for the next stop: K54–K59 (D44 defaults). Unknowns: real touch hardware for the long-press and first-tap behaviour (real-server-validation-extended). Invalidated: none.
