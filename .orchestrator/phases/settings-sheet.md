# settings-sheet

- Mode: afk        Tags: ui (full process per D42: anchored + cold)        Blocked by: rotation-layout-and-shell (done cc16968), settings-and-schedule-core (done 33976fe)
- Status: done · landed 51f8aa9 · confidence 100
- Commit(s): 51f8aa9
- Agent type: orchestrator-builder; model sonnet, effort high
- Claimed: 2026-10-11T07:19:59Z
- Worktree: ../wt-settings-sheet on branch orch/settings-sheet from 1df3be1 (D12). Serial: shares index.html, css/app.css, js/main.js, js/settings-ui.js, sw.js.

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 1, 3, 4, 5, 7 fail (duration module, specs, markup missing); 2, 6, 8 exit 0. `closer preflight` ok.
- PROBE: `ls js/duration.js` → absent — meets criterion 1 (new module to create)
- PROBE: `grep -n 'function rebuildClient\|function applySettings' js/main.js` → rebuildClient (l.82) and applySettings (l.725) exist — meets criterion 3 (C8M2 hook point)
- PROBE: `grep -n 'never shown' index.html` → the household help text (l.149) — meets criterion 3 (C8M1 text to correct)
- Carried must-fixes: C8M2 (D28), C8M1 (D38), K30, K31.
- Step 3: orchestrator-builder settings-sheet-builder-r1, sonnet, high; brief artifacts/settings-sheet--brief-r1.md
- Dispatched: 2026-10-11T07:19:59Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-settings-sheet, E2E_PORT=24020)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `settings-sheet--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `settings-sheet--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `settings-sheet--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `settings-sheet--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `settings-sheet--ac5-r1.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `settings-sheet--ac6-r1.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `settings-sheet--ac7-r1.json` |
| 8 | plan criterion 8 | evidence.py exec (plan command) | 0 | `settings-sheet--ac8-r1.json` |
- Pre-commit r1: **lint exit 1 — REAL**: tests/e2e/settings-sheet.spec.mjs:51:7 "'isOpen' is assigned a value but never used". format/tests/security/scope exit 0.
- Builder-reported: carried C8M2, C8M1, K30, K31 done with e2e (C8M2 and K30 shown to bite). Full e2e NOT clean: brightness failed once ('22:01: 1 vs 0.96', minute-ramp case; passes alone), and an earlier run failed helper once (3915 ms vs TV_WAKE_MS 4000). Not accepted as flakes: root cause required.
- Harness problem: the first-run code flow now starts on any unconfigured page, and tests/e2e/lib.mjs seeds only {pixelShift:false, dailyReload:false}, so every spec that does not configure Plex makes a REAL POST to https://plex.tv on load — external network in the test suite, a likely source of timing noise. → K48: lib.mjs joins this phase's Output and stubs plex.tv by default (a spec can still install its own route).
- Questions r1 — conductor rulings (listed at the next stop): Q-ss1 → K44 (accepted: after approval on the empty card, Settings opens pre-filled and Save finishes; nothing auto-saves), Q-ss2 → K45 (accepted: a manual refresh that fails with a poster on screen shows the error toast with its fixes), Q-ss3 → K46 (accepted: the card's code flow pauses while Settings is open; 'Sign in again' uses the sheet's code), Q-ss4 → K47 (accepted, deviation from R-SET-1's wording: the manual token/server fold stays reachable without Change; the token reveal is PIN-gated anyway).
- Re-dispatch r2: recipient settings-sheet-builder-r2 (fresh), forced by lint, K48 and the unexplained full-suite failures. Re-dispatches: 1

## Plan acceptance — Step 4 r2 (E2E_PORT=24020)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `settings-sheet--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `settings-sheet--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `settings-sheet--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `settings-sheet--ac4-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `settings-sheet--ac5-r2.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `settings-sheet--ac6-r2.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `settings-sheet--ac7-r2.json` |
| 8 | plan criterion 8 | evidence.py exec (plan command) | 0 | `settings-sheet--ac8-r2.json` |
- r2: lint fixed; K48 in lib.mjs (default plex.tv stub only when the seed has no plexToken — a blanket route turns on Playwright request interception and broke pi-stability's service-worker cases; a network guard fails any spec reaching a non-local host or an unrouted plex.tv). Full e2e exit 0 twice in a row (builder). Pre-commit r2: all exit 0.
- Root cause of the r1 failures (builder): Playwright 1.56.1's fake clock — on a clock left running after install, a background real-time loop races runFor/pauseAt and Date.now() can step backwards (pauseAt 29.7 s early in 25/25 tries with a 3 ms interval; 128 backward steps in 120 in the app). Explains brightness '22:01: 1 vs 0.96' (a rewound pauseAt shifts the ramp ~30 s) and helper '3915 vs 4000' (onAt sampled while the clock is ahead). Not reproduced in the specs themselves (0/72, 24/24). Fixes described for brightness.spec.mjs (checked pause) and helper.spec.mjs (pauseAt before the wake) — outside the r2 Output.
- Mutations r2 (conductor): no-rebuild-before-wake 1 (C8M2) · preview-applies-pixelshift 1 (K30) — killed. C8M1 text present (index.html l.157); K31 output present (l.253).
- CONDUCTOR RULING K49: brightness.spec.mjs and helper.spec.mjs join this phase's Output for the test-only clock-race fixes (they otherwise hit every seam run). Re-dispatch r3 (fresh builder, tests only). Re-dispatches: 2

## Plan acceptance — Step 4 r3 (E2E_PORT=24020)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `settings-sheet--ac1-r3.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `settings-sheet--ac2-r3.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `settings-sheet--ac3-r3.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `settings-sheet--ac4-r3.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `settings-sheet--ac5-r3.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `settings-sheet--ac6-r3.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `settings-sheet--ac7-r3.json` |
| 8 | plan criterion 8 | evidence.py exec (plan command) | 0 | `settings-sheet--ac8-r3.json` |
- r3 (tests only, K49): brightness.spec.mjs pauseAtChecked (re-pause until Date.now() hits the target, ≤ 8 tries then a clear error) in the ramp-in/out cases; helper.spec.mjs freezeClock in cases 7, 12, 13 before the wake; assertions unchanged. brightness + helper 20/20 under load; full e2e twice, 102 PASS each (builder). Pre-commit r3: all exit 0.
- Mutations: r2 kills stand (app code unchanged in r3).
- predispatch --kind code ok; Step 7 dispatched 2026-10-11T11:00:34Z: settings-sheet-review-anchored-r3 (opus; ui → screenshots) and settings-sheet-review-cold-r3 (opus; full process per D42); tree 0cf21d2

## Step 7 — cold r3 (artifacts/settings-sheet--review-cold-r3.md, CHANGES REQUESTED: Important 1 the "Turn off unwatched only" fix saves without the kiosk PIN; Minors 1–4) — triage held for the anchored r3 review

## Step 7 triage — r3 (anchored `--review-r3.md` APPROVE, "UI screenshots: PASS" — 10 shots, first-run code 112 px, no overlap; cold `--review-cold-r3.md` CHANGES REQUESTED; no token/PIN leak; stale polls cannot overwrite; counts never block the test; K48 guard and r3 checked pause fail loudly)
- SSC1 = cold Important 1 = anchored Minor 1 (code-bug — CONDUCTOR RULING: the other fixes are PIN-gated, so this one must be too): `runFix('unwatched')` saves `unwatchedOnly: false` without the kiosk PIN, from the empty card and the error toast (reproduced) → r4/r5: route it through requestPin; e2e with a PIN set.
- SSC2 (cold Minor 1, code-bug): the unwatched fix is offered on an empty library even when unwatchedOnly is already off (e.g. everything above the limit) → offer it only when unwatchedOnly is on.
- SSC3 (cold Minor 2, code-bug, traced not run): an approved first-run code can be lost when it is approved while the Settings PIN prompt is open (shared gate; open() returns early) → r4/r5 differ here (below); e2e that reproduces it first.
- SSC4 (cold Minor 3, code-bug): the Custom minutes field rounds for display (0.25 min saves 15 s but shows 0.3; retyping 0.3 saves 18 s) → show the saved value exactly (e.g. up to 2 decimals, or "15 s").
- SSC5 (cold Minor 4, spec-gap): an unconfigured display polls plex.tv every 2 s indefinitely (~1,800/h, even asleep). CONDUCTOR RULING K50 (proposed default, listed at the next stop): poll every 5 s while a code is fresh; after 3 codes expire unapproved, wait 5 min before asking for the next one; no polling while asleep.
- SSA2 (anchored Minor 2, code-bug): the K48 guard counts every plex.tv request as routed once any route pattern mentions plex.tv → mark a request routed only when a route handler actually fulfils or continues it.
- Re-dispatch r4/r5 (third re-dispatch → BRANCH: two candidates from tree 0cf21d2 in ../wt-settings-sheet-r4 and -r5). Same fixes for SSC1, SSC2, SSC4, SSC5/K50, SSA2. SSC3 differs: r4 keeps an approved token pending while a PIN prompt is open and applies it when the prompt resolves (OK → open pre-filled; Cancel → keep the token for the next open); r5 stops the card's code flow as soon as any PIN prompt opens (as it already stops when Settings opens), so no approval can land mid-prompt. Re-dispatches: 3

## Plan acceptance — Step 4 r4 (candidate; ../wt-settings-sheet-r4, E2E_PORT=24220)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `settings-sheet--ac1-r4.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `settings-sheet--ac2-r4.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `settings-sheet--ac3-r4.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `settings-sheet--ac4-r4.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `settings-sheet--ac5-r4.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `settings-sheet--ac6-r4.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `settings-sheet--ac7-r4.json` |
| 8 | plan criterion 8 | evidence.py exec (plan command) | 0 | `settings-sheet--ac8-r4.json` |
- r4 (pending token): SSC1 runFix('unwatched') behind requestPin; SSC2 offered only when unwatchedOnly is on; SSC3 approved token held in pendingToken and handed to the first open past the PIN (code flow stays stopped while one is pending, Q-ss6); SSC4 formatMinutes = shortest text up to 3 decimals that types back to the same seconds (unit test 10..86400 s); K50 5 s poll, rest 5 min after 3 unused codes (the count stays spent until the flow restarts, Q-ss5), no polling asleep — 659 polls / 4 codes in 60 min vs ~1,800 before; SSA2 guard counts a plex.tv request routed only when a handler fulfils/continues/aborts it. Pre-commit r4: all exit 0. Full e2e exit 0 (builder).
- Mutations r4 (conductor): unwatched-ungated 1 · unwatched-always-offered 1 · no-rest 1 — killed.

## Plan acceptance — Step 4 r5 (candidate; ../wt-settings-sheet-r5, E2E_PORT=24320)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `settings-sheet--ac1-r5.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `settings-sheet--ac2-r5.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `settings-sheet--ac3-r5.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `settings-sheet--ac4-r5.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `settings-sheet--ac5-r5.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `settings-sheet--ac6-r5.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `settings-sheet--ac7-r5.json` |
| 8 | plan criterion 8 | evidence.py exec (plan command) | 0 | `settings-sheet--ac8-r5.json` |
- r5 (stop the code flow while any PIN prompt is open): same SSC1, SSC2, SSC4 (2 decimals), K50 (659 polls / 4 codes per h; rest message text added), SSA2 (also catches a fallback-only handler). Known edge: a code approved in the instant a prompt opens is dropped and a fresh code shown. Pre-commit r5: all exit 0. Full e2e exit 0 (builder).
- Mutations r5 (conductor): unwatched-ungated 1 · no-rest 1 · unwatched-always-offered (see artifact) — killed.
- Pick (`settings-sheet--pick-r5.json`): r4 and r5 both 75/75 → tie → r4 (lower round; also never drops a code approved as a prompt opens, which r5 does). Rulings: Q-ss5 → K51, Q-ss6 → K52 (accepted). r5 observation (engine.js empty-library hint) → follow-up for touch-and-labels. predispatch --kind code ok; Step 7 dispatched 2026-10-11T12:28:22Z: settings-sheet-review-anchored-r4 and settings-sheet-review-cold-r4 (opus; DELTA-scoped from tree 0cf21d2; D42 full process); tree 6e3ad88 in ../wt-settings-sheet-r4

## Step 7 — cold r4 (artifacts/settings-sheet--review-cold-r4.md, APPROVE; 3 Minors: unused count never resets (matches K51), assertClean fixed 150 ms wait, wrapped route handler vs unroute) — triage held for the anchored r4 review

## Step 7 triage — r4 (anchored delta `--review-r4.md` APPROVE, "UI screenshots: PASS" — rest card shots; cold delta `--review-cold-r4.md` APPROVE; SSC1–SSC4, K50, SSA2 each fail without their fix; the pending token lives only in memory and cannot bypass the PIN; ~543 requests/h after the first hour, none asleep)
- S4A5 (anchored Minor 5, code-bug): the reviewer's full e2e exited 1 — first-run "a plex.tv network failure retries at most once per 30 s" failed under load ('2 pins after 29 s'); its fake clock runs in real time, so load stretches it. Unchanged in the delta, but the delta's new first-run cases make it likelier. A red full suite blocks landing → r6: put that case on a paused/stepped clock (as r3 did for brightness/helper) so it measures simulated time only; run the full suite twice.
- S4A1 (anchored Minor 1): K52 has no biting test — removing `!pendingToken` from firstRunWanted survives (the cancel test reads its pin count too late) → r6: read the count before the cancel; show the mutant failing.
- S4A2 (anchored Minor 2): K51 has no biting test — resetting `unused = 0` after the rest survives (the hour test stops before the 4th code expires) → r6: run to ~66 min and assert 5 quiet minutes; show the mutant failing.
- S4A3 (anchored Minor 3): a bare route.continue() on plex.tv counts as answered although it reaches the real service → r6: for plex.tv, only fulfill/abort count; continue is flagged.
- S4A4 (anchored Minor 4, UX): during the rest the card still reads "enter this code:" over placeholder squares; with a token waiting after a cancelled PIN the card does not say the approval worked → r6: rest card shows only the rest message; a waiting token shows "Signed in — open Settings to finish" (or similar) with the Open settings button.
- Cold r4 Minors: unused never resets → as K51 says, no change; assertClean's fixed 150 ms wait and the wrapped handler vs unroute → harness-only, no current spec affected → follow-up note in the harness comment is enough; no round.
- Re-dispatch r6 (fresh builder; worktree ../wt-settings-sheet-r4). Re-dispatches: 4 (cap 5)

## Plan acceptance — Step 4 r6 (../wt-settings-sheet-r4, E2E_PORT=24520)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `settings-sheet--ac1-r6.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `settings-sheet--ac2-r6.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `settings-sheet--ac3-r6.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `settings-sheet--ac4-r6.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `settings-sheet--ac5-r6.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `settings-sheet--ac6-r6.json` |
| 7 | plan criterion 7 | evidence.py exec (plan command) | 0 | `settings-sheet--ac7-r6.json` |
| 8 | plan criterion 8 | evidence.py exec (plan command) | 0 | `settings-sheet--ac8-r6.json` |
- r6: S4A5 first-run freezes the fake clock before load (checked pause) in the network-failure, K50 hour and asleep cases — cause proven by adding 3 real seconds (old spec fails '2 pins after 29 s', new passes); 5 clock cases 20/20 under load. S4A1/S4A2 tests now bite. S4A3 only fulfill/abort answer a plex.tv request. S4A4 rest card shows only the rest message; a waiting token shows 'Signed in. Open settings to finish.' Full e2e twice, exit 0 (builder). Pre-commit r6: all exit 0.
- Mutations r6 (conductor): k52-newer-code-replaces 1 · k51-count-resets 1 — killed. r4 kills stand.
- predispatch --kind code ok; Step 7 dispatched 2026-10-11T14:14:20Z: settings-sheet-review-anchored-r6 and settings-sheet-review-cold-r6 (opus; DELTA-scoped from tree 6e3ad88, which both approved; D42 full process); tree 297c7e2

## Step 7 — cold r6 (artifacts/settings-sheet--review-cold-r6.md, APPROVE; Minor 1 the post-rest status reset (main.js:1241) is untested; Minor 2 K50 still times out under 6-way parallel load — freshUntil waits a real 3 s per request) — triage held for the anchored r6 review

## Step 7 triage — r6 (anchored delta `--review-r6.md` APPROVE, "UI screenshots: PASS" — rest and signed-in cards; full e2e TWICE exit 0, one under heavy load; cold delta `--review-cold-r6.md` APPROVE; S4A1–S4A5 each fail without their fix; no assertion loosened)
- S6C1 (cold Minor 1, test coverage): the post-rest status reset (js/main.js ~l.1241) has no test → follow-up for touch-and-labels (test-only; first-run.spec.mjs joins its Output when it starts). No round (D42).
- S6C2 (cold Minor 2): K50 timed out once under 6 parallel copies of first-run (freshUntil waits a real 3 s per request; the frozen clock does not cover it); serial runs and both anchored full suites pass → same follow-up: raise that helper's real-time timeout (counts are measured on the frozen clock, so a longer wait cannot change them). No round (D42).
- S6A1 (anchored Minor 1, spec-gap): during the rest the card still shows the general "Connect to your Plex server to get started." line above the rest message → CONDUCTOR RULING K53: touch-and-labels (owns wording) hides it during the rest. Listed at the next stop.
- No open finding: Step 7 closes.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r6)

## Seam check (merged: + settings-sheet)
- `round--seam-w3-r14.json` exit 0 (npm test, full npm run test:e2e, check-precache)

## Step 8 tally (`settings-sheet--tally-step8-r6.json`)
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

- Landed: 51f8aa9 — "Rework Settings: connection card, minute presets, error fixes, first run" (from orch/settings-sheet-r4, the picked candidate + r6)
- Read-back ok; attribution (commit form, r6) ok

## Reviews
- r3 anchored (APPROVE) + cold (CHANGES REQUESTED: SSC1); r4 anchored + cold delta (APPROVE; S4A1–S4A5 → r6); r6 anchored + cold delta (APPROVE)

## Notes / reconciliation
- Re-dispatches: 4 of 5 (branch at the 3rd: r4 picked over r5 on a tie). Carried must-fixes fulfilled here: C8M2 (D28), C8M1 (D38), K30, K31 — dropped with evidence. Follow-ups to touch-and-labels: engine.js unwatched hint, S6C1/S6C2 test-only, K53. Unknowns: totalSize with X-Plex-Container-Size=0 and the real plex.tv pin flow (real-server-validation). Rulings for the next stop: K44–K53. Invalidated: none.

## Stop message 13
**Stop 13 — four more phases landed; 17 small rulings to confirm (one reply)**

Since stop 12, four more phases have landed and been pushed:
- **device-helper-integration:** the TV turns off in sleep and back on at wake; CPU temperature shows in Diagnostics.
- **pi-stability:** a guarded daily reload, no blur behind the Settings panel, and no swipe-back.
- **settings-sheet:** the connection card, minute presets, error messages with fix buttons, and the sign-in code shown on an unconfigured screen.

That's 18 of 28 phases done; two more moved to 2.2 at your request (D41). Each answer below is what is now built. Recommended for every item: **(a) keep it as built**. (b) is the alternative.

1. **K37 Helper off means silent.** With the device-helper setting off, the app never contacts the helper, not even at startup. With it on and no helper running, the browser logs one harmless "not found" line. (b) Check for the helper at startup even when the setting is off.
2. **K38 Test file added.** The two helper wake tests went into pi-stability's files. Test-only. (b) Put them in a separate change.
3. **K39 Manual wake doesn't reload.** Pressing a key to wake the screen at night never triggers the daily reload; only the schedule ending or playback starting can. (b) Allow it on any wake.
4. **K40 First reload time.** If no reload has ever been recorded, the page's own load time counts as the last one. (b) Reload on the first wake regardless.
5. **K41 Reload waits.** The reload waits for a fade, the TV waking and any open dialog. (b) Wait only for a poster loading.
6. **K42 Panel and Diagnostics wording.** The more opaque panel style applies to every panel, and Diagnostics says "Service worker: controlling" or "none". (b) Only the Settings panel.
7. **K43 Skipped reload.** A 4 a.m. reload that's skipped (for example, the server is down) isn't retried that day. The next real wake catches up. (b) Retry every hour until it works.
8. **K44 Sign-in finishes with Save.** After you approve the on-screen code, Settings opens pre-filled and you press Save; nothing saves by itself. (b) Save automatically after approval.
9. **K45 Error toast.** A refresh you ask for that fails shows the error with its fix buttons. (b) Show the error only on the empty screen.
10. **K46 Sign-in pauses for Settings.** The on-screen code pauses while Settings is open and starts fresh when it closes. (b) Keep both running.
11. **K47 Manual server section stays visible.** On a set-up screen, the manual server/token section is reachable without pressing Change. That's slightly different from the spec's wording; the token is still PIN-protected. (b) Hide it behind Change and update one kiosk test.
12. **K48 No real network in tests.** The test setup answers plex.tv itself, and any test that reaches the internet fails. (b) Let tests reach plex.tv.
13. **K49 Two test files fixed.** The brightness and helper tests now stop their simulated clock before measuring time. That fixed the occasional failures. (b) None.
14. **K50 How often sign-in checks plex.tv.** Every 5 seconds while a code is fresh. After 3 unused codes it rests 5 minutes, and it never checks while the screen sleeps. That's about 540 requests an hour while waiting, down from about 1,800. (b) Slower, e.g. every 15 seconds.
15. **K51 Rests continue.** After the first rest, each further unused code is followed by another 5-minute rest. (b) Start the 3-code count again after each rest.
16. **K52 Approved code waits for the PIN.** A code approved while a PIN prompt is open waits for the prompt, and no newer code can replace it. The card then says "Signed in. Open settings to finish." (b) Drop it and show a fresh code.
17. **K53 Rest screen wording.** During the 5-minute rest the card will show only the rest message (touch-and-labels does this next). (b) Keep the "Connect to your Plex server" line too.
18. **Token rotation** is still open. It now blocks the core real-server check, which goes first under D42. Reply with the four lines once you've done it (method, date, old token rejected with 401, whether you want the history purge).

Reply e.g. "3b, 14b" — or "defaults".
<!-- end stop 13 -->
- Stop 13 sent 2026-10-11T15:06:58Z verbatim from `closer show --stop 13` (stopcheck ok).

- Answer to stop message 13: "Defaults" — chat; recorded by the conductor at 2026-10-11T16:32:09.976469Z
- Stop 13 answered "Defaults" (2026-10-11T16:31:46Z, `closer answer`) → D43 (K37–K53 kept; K53 stays a touch-and-labels follow-up). Item 18 (token rotation) open.

## Index items carried (verbatim from .orchestrator/state.md; added 2026-10-14 by conductor-2 for closer index-check)
these rulings and deferrals were recorded in this phase's stop messages and in docs/decisions.md in other words; closer index-check requires the index text itself in a phase file, so it is copied here unchanged.
- K52 — settings-sheet Q-ss6: while an approved sign-in token waits for the PIN prompt, the empty card's code flow stays stopped so a newer code cannot replace it; list at the next stop
- K51 — settings-sheet Q-ss5: after the first 5-minute rest, each further unused first-run code is followed by another 5-minute rest (the 3-code count does not restart until the flow restarts); list at the next stop
- K50 — settings-sheet SSC5 (proposed default): an unconfigured display checks plex.tv for the code's approval every 5 s while the code is fresh; after 3 codes expire unapproved it waits 5 min before asking for the next; no checking while asleep (was every 2 s forever, ~1,800 requests an hour); list at the next stop
- K49 — settings-sheet: tests/e2e/brightness.spec.mjs and tests/e2e/helper.spec.mjs join the phase's Output for test-only fixes to a Playwright 1.56 fake-clock race (Date.now() can step backwards on a running fake clock) that caused intermittent full-suite failures; list at the next stop
- K48 — settings-sheet: tests/e2e/lib.mjs joins the phase's Output so the harness stubs plex.tv by default; no e2e spec may reach the real plex.tv; list at the next stop
- K47 — settings-sheet Q-ss4 (deviation from R-SET-1 wording): on a configured display the collapsed manual token/server fold stays reachable without pressing Change (sign-in and the server picker wait behind Change); the token reveal is PIN-gated; list at the next stop
- K46 — settings-sheet Q-ss3: the empty card's code flow pauses while Settings is open and restarts with a fresh code when Settings closes unconfigured; 'Sign in again' uses the sheet's own code; list at the next stop
- K45 — settings-sheet Q-ss2: a refresh the viewer asked for (button or R) that fails while a poster is on screen shows a toast with the fix buttons; list at the next stop
- K44 — settings-sheet Q-ss1: after the plex.tv code is approved on the empty card, Settings opens pre-filled and the owner presses Save; nothing is saved automatically; list at the next stop
