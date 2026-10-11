# recommended-protection-preset

- Mode: afk        Tags: ui        Blocked by: sleep-mode, frame-brightness, pixel-shift, pi-stability, content-rating-filter, kiosk-and-pin, device-helper-integration (all done)
- Status: done · landed 9bc93ed · confidence 100
- Commit(s): 9bc93ed
- Agent type: orchestrator-builder; model sonnet, effort medium
- Claimed: 2026-10-11T19:15:08Z
- Worktree: ../wt-recommended-protection-preset on branch orch/recommended-protection-preset from e3c81a6 (D12). Closes M2.
- Output amended (K59): + tests/e2e/smoke.spec.mjs (test-only).

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 1, 2 fail (spec missing); 3 exit 0. Criterion 4 produced an EMPTY artifact and criterion 5 exit 1 — both harness artifacts: the full suite now takes ~16 min, longer than round--ac-runner.py's 900 s evidence timeout, which hit evidence.py's timeout crash (TypeError str+bytes, the kernel bug seen at device-helper-integration) and left the criterion-4 server holding port 25010, so criterion 5 died with EADDRINUSE (stderr in ac5-pre-r1.json). No orphan process remained. round--ac-runner.py's timeout raised 900 → 2400 s (conductor tooling; noted here). `closer preflight` ok.
- PROBE: `grep -n 'whatsNew' tests/e2e/lib.mjs` → the harness seeds plexPoster.whatsNew (l.205) — meets criterion 2 (the spec removes it)
- PROBE: `grep -n 'Display protection' index.html` → the fieldset (l.253) — meets criterion 1 (where the button goes)
- PROBE: `grep -n 'controlLabels' index.html` → the select (l.226) — meets criterion 1 (routed wording fix)
- Routed items: K59 (smoke clock), Control labels wording.
- Step 3: orchestrator-builder recommended-protection-preset-builder-r1, sonnet, medium; brief artifacts/recommended-protection-preset--brief-r1.md
- Dispatched: 2026-10-11T19:15:08Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-recommended-protection-preset, E2E_PORT=25020; runner timeout 2400 s)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `recommended-protection-preset--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `recommended-protection-preset--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `recommended-protection-preset--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `recommended-protection-preset--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `recommended-protection-preset--ac5-r1.json` |
| 6 | plan criterion 6 | narrated (phase-gate over M2 + combined rotation-90 scenario) | — | Step 7 |
- Pre-commit r1: all exit 0. Criterion 4 (full suite) exit 0 on the worktree; the merged-tree run is the Step 8 seam check. K59: smoke 'clock install + runFor' pauses the clock and checks two equal reads before runFor; 20/20 under load (builder). Control labels options now 'Auto', 'Always', 'Never (icons only)'. Builder's narrated scenario (scratch, fake clock): rotation 90 + kiosk + pixel shift asleep → playback wakes it, stage stays shifted inside the viewport, controls hidden and inert.
- Mutations r1 (conductor): untick-ignored 1 · preset-sets-idle 1 · toast-unconfigured 1 · toast-repeats 1 — killed.
- Builder reading — conductor ruling K60 (D44 default): plexPoster.whatsNew is written on the first boot without it, including an unconfigured install, so a fresh install that is configured later never gets the 'What's new' toast (it is new to everything).
- predispatch --kind code ok; Step 7 dispatched 2026-10-11T20:09:11Z: recommended-protection-preset-review-anchored-r1 (opus; ui → screenshots; criterion 6 phase-gate over M2 + combined scenario; D42: not risk:high → anchored only); tree 579bda2

## Step 7 triage — r1 (anchored `--review-r1.md` APPROVE, "Criterion 6: PASS" — M2 phase-gate (all 8 M2 phases done; full e2e 19 specs exit 0; npm test 327) and the combined rotation-90 scenario at both sizes; "UI screenshots: PASS" — 8 shots)
- RPM1 (spec-gap): the toast reads "What's new in 2.1: one-tap display protection for always-on screens." while R-UPG-1 quotes "…: display protection options" → follow-up for docs: amend R-UPG-1 to the shipped wording (the README describes it). No round (D42).
- RPM2 (spec-gap, cosmetic): the preset's night-dim row shows the internal value "stage" rather than the select's wording → no remaining phase edits settings-ui.js → Roadmap engineering backlog (2.1.x polish) via the docs follow-up.
- RPM3 (test gap): no test pins that an unconfigured boot writes plexPoster.whatsNew (K60) → same backlog entry.
- No open finding: Step 7 closes.
- Step 7 r1 tally corrected (`recommended-protection-preset--tally-step7-r1-c1.json`, 95/95): narrated ac6 listed as missing; evidence `recommended-protection-preset--ac6-r1.json`. Read-back first refused token '2.0' (not in the patch); message reworded ('upgraded from the previous version') and the unpushed commit amended.
- Read-back on 9bc93ed: stale only because `recommended-protection-preset--ac6-r1.json` (narrated criterion 6, written from the review AFTER the message by design) is newer than the message; re-run with --commit-rows 6 (its evidence comes after the message) → ok. Message content unchanged and still accurate.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r1)

## Seam check (merged: + recommended-protection-preset; M2 milestone close)
- `round--seam-w3-r16.json` exit 0 (npm test, full npm run test:e2e, check-precache)

## Step 8 tally (`recommended-protection-preset--tally-step8-r1.json`)
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

- Landed: 9bc93ed — "Add one-tap recommended protection and a one-time What's new notice"
- Read-back ok (with --commit-rows 6, see above); attribution (commit form, r1) ok on the first sha 902d012 — the amend changed one message line only

## Reviews
- r1 anchored (APPROVE; Criterion 6 PASS — M2 phase-gate + combined scenario; UI PASS)

## Notes / reconciliation
- M2 closed. Routed items fulfilled: K59, Control labels wording — dropped. Routed onward to docs: R-UPG-1 wording, Roadmap '2.1.x polish' entry (preset row label, K60 marker test). Rulings for the next stop: K60 (D44 default). Invalidated: none.
