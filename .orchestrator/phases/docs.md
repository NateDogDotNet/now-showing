# docs

- Mode: afk        Tags: docs        Blocked by: recommended-protection-preset (done 9bc93ed), touch-and-labels (done 0bf5655) — K61: no longer waits on real-server-validation-extended
- Status: done · landed 78b9f67 · confidence 100
- Commit(s): 78b9f67
- Agent type: orchestrator-builder; model sonnet, effort high
- Claimed: 2026-10-11T20:48:49Z
- Worktree: ../wt-docs on branch orch/docs from bbb2e47 (D12).
- Plan amended: criterion 5 drops 'Fill' (D41, landscape fill moved to 2.2; commit bbb2e47).

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 1, 2, 4, 5, 6 fail (README/Roadmap not yet updated); 3, 7 exit 0; 8 narrated. `closer preflight` ok.
- PROBE: `git log --oneline 46257c3 -1` → the base the narrated keep-docs-current runs from exists — meets criterion 8 (diff base)
- PROBE: `grep -n 'Planned for 2.2\|Engineering backlog' Roadmap.md` → the owner-requested sections exist — meets criterion 6 (entries to keep)
- Routed items: Roadmap keep (b5f6882), 2.1.x polish entry; K61 (verify) tagging.
- Step 3: orchestrator-builder docs-builder-r1, sonnet, high; brief artifacts/docs--brief-r1.md
- Dispatched: 2026-10-11T20:48:49Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-docs)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `docs--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `docs--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `docs--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `docs--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `docs--ac5-r1.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `docs--ac6-r1.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `docs--ac7-r1.json` |
| 8 | plan criterion 8 | narrated (doc-review band; keep-docs-current; (verify) tags; Roadmap reasons) | — | Step 7 |
- Pre-commit r1: lint/tests/security/scope exit 0; **format exit 2 — REAL (trivial)**: README.md:355 trailing whitespace (git diff --check). Fixed in the next round with any review findings.
- Builder notes: README rewritten for 2.1 as shipped with a top banner (real-server/Pi validation pending); 18 (verify)/not-yet-verified tags listed in the handback; seven code-vs-spec differences documented as the code behaves (rotateUi/statusIndicator/posterCacheLimit have no Settings control; fillMode accepted but inert in 2.1; config.json seeds only an unsaved device while resetPin is read every load; the daily reload's extra waits and K39; wlr-randr only with --helper-output; the Diagnostics shortcuts button (K57); the preset's 'stage' label (2.1.x polish)).
- Re-dispatch r2: recipient docs-builder-r2 (fresh), forced by the format failure (one trailing space). Re-dispatches: 1

## Plan acceptance — Step 4 r2
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `docs--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `docs--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `docs--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `docs--ac4-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `docs--ac5-r2.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `docs--ac6-r2.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `docs--ac7-r2.json` |
| 8 | plan criterion 8 | narrated | — | Step 7 |
- r2: README.md:355 trailing whitespace removed (git diff --cached --check clean). Pre-commit r2: all exit 0.
- predispatch ok; Step 7 dispatched 2026-10-11T20:56:21Z: docs-review-anchored-r2 (opus; docs review — criterion 8: doc-review band, keep-docs-current over 46257c3..HEAD, (verify) tags, Roadmap reasons); tree 3b1f39a

## Step 7 triage — r2 (anchored `--review-r2.md` CHANGES REQUESTED, "Criterion 8: FAIL" — band B+, A- once Important 1 is fixed; criteria 1–7 pass; all anchors and 32 quoted UI labels resolve; keep-docs-current spot-checks match the code except Important 1)
- DOI1 (Important 1, a wrong statement): README:318 says a revealed token hides itself after 15 s in kiosk mode; there is no such timer — the token hides when Settings opens/closes or Hide is pressed (R-KIOSK-2); REVEAL_MS is the 15 s control reveal → r3: "The token hides again when Settings closes."
- DOM1: the daily-reload text should say a touch/key wake does not trigger the 12 h reload (K39) and that it also waits for a poster loading or the TV waking (K41) → r3.
- DOM2–DOM4: tag (verify) on DeveloperToolsAvailability = 2, "installed PWAs and --kiosk Chromium are unaffected" (fullscreen after reload), and systemd KillMode=control-group ending a running command → r3.
- DOM5: drop the internal id "(K61)" from Roadmap.md → r3.
- DOM6: shorten README:9, 192 and 393 → r3.
- Re-dispatch r3 (fresh builder). Re-dispatches: 2

## Plan acceptance — Step 4 r3
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `docs--ac1-r3.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `docs--ac2-r3.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `docs--ac3-r3.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `docs--ac4-r3.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `docs--ac5-r3.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `docs--ac6-r3.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `docs--ac7-r3.json` |
| 8 | plan criterion 8 | narrated | — | Step 7 |
- r3: DOI1 fixed (README:318 'The token hides again when Settings closes.'; the only remaining 15 s is the control reveal, l.309 — correct); DOM1–DOM6 applied. Pre-commit r3: all exit 0.
- predispatch ok; Step 7 dispatched 2026-10-11T21:02:52Z: docs-review-anchored-r3 (opus; DELTA-scoped from tree 3b1f39a; criterion 8 re-check); tree 5a4b5a9

## Step 7 triage — r3 (anchored delta `--review-r3.md` APPROVE, "Criterion 8: PASS" — band A-; every r2 finding resolved; criteria 1–7 pass)
- DO3M1/DO3M2 (wording): README:192's reload-wait list says Settings or Diagnostics where the code waits for ANY open dialog (PIN, shortcuts too), and the manual-wake sentence omits a mouse click → routed to release-bump, which edits the README for the K61 tag update anyway. No round (D42).
- No open finding: Step 7 closes.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r3)

## Seam check (merged: + docs)
- `round--seam-w3-r17.json` exit 0 (npm test, full npm run test:e2e, check-precache)

## Step 8 tally (`docs--tally-step8-r3.json`)
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

- Landed: 78b9f67 — "Document 2.1 as it shipped: setups, 24/7 hardening, kiosk, helper"
- Read-back ok (--commit-rows 8: the narrated row's evidence comes from the review, after the message); attribution (commit form, r3) ok

## Reviews
- r2 anchored (CHANGES REQUESTED: DOI1 token-hide claim; band B+); r3 anchored delta (APPROVE; Criterion 8 PASS, band A-)

## Notes / reconciliation
- K61: written before the hands-on validation; 18+ (verify) tags; release-bump updates them from the results (follow-up). Routed onward to release-bump: the reload-wait wording and the K60 id. Docs follow-ups (Roadmap keep, 2.1.x polish, R-UPG-1) fulfilled. Invalidated: none.

## Stop message 14
**Stop 14 — all 2.1 features and docs landed; 8 rulings applied under your standing defaults (D44)**

Since stop 13, touch-and-labels, recommended-protection-preset and docs have landed and been pushed. Every 2.1 feature is in, and so are the README and Roadmap: 21 of 28 phases done, with 2 moved to 2.2. Under your standing instruction (D44) each ruling below is already applied as recommended (a). Reply with an item number to overturn one.

1. **K54 Extra files for touch-and-labels.** It also fixed the empty-library hint (js/engine.js) and two first-run tests. (b) Separate change.
2. **K55 Long-press menu on the Settings panel.** In kiosk mode it works on the Settings panel itself, as well as its text fields. It stays blocked on the PIN keypad and the stage. (b) Text fields only, and change one kiosk test.
3. **K56 One tooltip on desktop.** The buttons' native tooltips are removed so only the new one shows, with the shortcut key. (b) Keep both.
4. **K57 Shortcuts button in Diagnostics.** It's the only way to see the shortcut list on a touch-only screen. (b) The ? key only.
5. **K58 First tap on the "Get started" screen.** It only shows the controls, while the screen's own buttons still work first time. (b) Let that first tap press the hidden button.
6. **K59 Smoke test clock fix.** Done in recommended-protection-preset. Test-only. (b) None.
7. **K60 "What's new in 2.1" notice.** Only a display upgraded from the previous version sees it, once; a brand-new install never does. (b) Show it on new installs too, after setup.
8. **K61 Docs written before the hands-on checks.** Everything not yet proven on real hardware is marked "(verify)", and the release bump updates those marks from your results. (b) Hold the docs until after the real-server checks.

**What 2.1 still needs from you:** the four-line token-rotation receipt (method, date, old token rejected with 401, whether you want the history purge). Then run the core real-server checklist and the extended Pi checklist. The release bump then sets 2.1.0.
<!-- end stop 14 -->
- Stop 14 written 2026-10-11T21:22:20Z (stopcheck ok); answered under the owner's standing instruction D44.
- Stop 14 recorded under D44 → D45 (K54–K61 kept); rulings retired in the follow-up index with the D44 quote. closer answer needs the stop shown first; it is sent in this turn.
