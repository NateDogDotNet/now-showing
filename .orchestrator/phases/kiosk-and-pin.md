# kiosk-and-pin

- Mode: afk        Tags: ui, risk:high        Blocked by: rotation-layout-and-shell (done cc16968), settings-and-schedule-core (done 33976fe)
- Status: done · landed f7be8a9 · confidence 100
- Commit(s): f7be8a9
- Agent type: orchestrator-builder; model sonnet, effort high (risk:high)
- Claimed: 2026-10-10T20:30:33Z
- Worktree: ../wt-kiosk-and-pin on branch orch/kiosk-and-pin from 9263977 (D12). Serial: shares index.html, css/app.css, js/main.js, js/settings-ui.js.

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 1, 3, 5, 6 fail (module, spec, markup missing); 2, 4 exit 0; 7 narrated (reviewers). `closer preflight` ok.
- PROBE: `grep -n 'kioskMode\|settingsPin' js/settings.js` → kioskMode, disableShortcuts, settingsPinHash, settingsPinSalt exist — meets criterion 3 (keys)
- PROBE: `grep -n 'NEVER_EXPORT_KEYS' js/settings.js` → PIN keys stripped on export (l.199) and import (l.224) — meets criterion 3 (export/import)
- PROBE: `grep -n "source === 'defaults'" js/main.js` → config.json fetched only on first run today — meets criterion 3 (must add the every-load reset check)
- Step 3: orchestrator-builder kiosk-and-pin-builder-r1, sonnet, high; brief artifacts/kiosk-and-pin--brief-r1.md
- Dispatched: 2026-10-10T20:30:33Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-kiosk-and-pin, E2E_PORT=22420)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac5-r1.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac6-r1.json` |
| 7 | plan criterion 7 | narrated (risk:high reviewers) | — | Step 7 |
- Pre-commit r1: **lint exit 1 — REAL**: tests/e2e/kiosk.spec.mjs:102:7 "'settleSheet' is assigned a value but never used". format/tests/security/scope exit 0.
- Builder-reported: full `npm run test:e2e` FAILS smoke (console 404 for the every-load config.json, Q-kp1). One kiosk case failed once in ~25 loaded runs; the builder widened a 3 s wait to 10 s without a root cause — not accepted as a fix (a failing test is never written off as a flake).
- Questions r1 — conductor rulings (listed at the next stop): Q-kp1 → K32 (add tests/e2e/smoke.spec.mjs to this phase's Output; smoke ignores ONLY console errors for a 404/403 on `/config.json`; plan line amended); Q-kp2 → K33 (proposed reading accepted: Settings not auto-opened; opens without a PIN when asked while the flag is served); Q-kp3 → K34 (accepted: 5th wrong PIN 60 s, ×2 per further failure, 15 min cap; attempts while locked refused and not counted); Q-kp4 → K35 (accepted: 4–8 digits entered twice, applies on Save, no grace period, hard 15 s reveal, 2.5 s config.json timeout).
- Re-dispatch r2: recipient kiosk-and-pin-builder-r2 (fresh), forced by the real lint error, the smoke failure (K32) and the unexplained kiosk failure. Re-dispatches: 1

## Plan acceptance — Step 4 r2 (E2E_PORT=22420)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac4-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac5-r2.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac6-r2.json` |
| 7 | plan criterion 7 | narrated (risk:high reviewers) | — | Step 7 |
- r2: lint fixed; smoke ignores only a 404/403 console error on /config.json (K32); app fix: closeSheet() re-hides the token in the same step as dialog.close() (a real 1-in-30 failure); the kiosk-off case runs on the paused fake clock (an injected 4 s stall broke the old poll). The original 1-in-25 failure was not reproduced in ~160 loaded runs; kiosk spec 30/30 under load. Full e2e exit 0 (builder). Pre-commit r2: all exit 0.
- Mutations r2 (conductor): diag-ungated 1 · hidden-focusable 1 · reset-truthy 1 · export-ungated 1 · import-ungated 1 · reveal-ungated 1 — killed. **lock-uncapped 0 — SURVIVED**: dropping the 15 min cap in nextLock() passes; lockRemainingMs() caps only the DISPLAYED wait, so after 20 wrong PINs lockedUntil is ~22 days out and the prompt shows 15 min for 22 days (lock effectively permanent until the reset flag).
- Re-dispatch r3: recipient kiosk-and-pin-builder-r3 (fresh), forced by the surviving mutant lock-uncapped. Re-dispatches: 2

## Plan acceptance — Step 4 r3 (E2E_PORT=22420)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac1-r3.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac2-r3.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac3-r3.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac4-r3.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac5-r3.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac6-r3.json` |
| 7 | plan criterion 7 | narrated (risk:high reviewers) | — | Step 7 |
- r3 (tests only): unit case — after 10/20/50 wrong PINs lockedUntil ≤ 15 min ahead; the lock ends 15 min after the last wrong PIN, in memory and after parseLock. Pre-commit r3: all exit 0. Full e2e (conductor, `kiosk-and-pin--fulle2e-r3.json`) exit 0.
- Mutations r3 (conductor): lock-uncapped 1 — killed. r2 kills stand (app code unchanged).
- Step 4 r3 tally corrected (`kiosk-and-pin--tally-step4-r3-c1.json`, 75/75 COMPLETE): derive counted narrated criterion 7 as a missing row; it is scored at Step 7. Predispatch first refused (no COMPLETE tally), then ok after the correction.
- predispatch --kind code ok; Step 7 dispatched 2026-10-10T22:27:50Z: kiosk-and-pin-review-anchored-r3 (opus; ui → screenshots) and kiosk-and-pin-review-cold-r3 (opus; risk:high); tree e8d6016

## Step 7 — cold r3 (artifacts/kiosk-and-pin--review-cold-r3.md, CHANGES REQUESTED: Important 1 held-Enter lockout; Minors 1–2) — triage held for the anchored r3 review

## Step 7 triage — r3 (anchored `--review-r3.md` CHANGES REQUESTED, "Criterion 7: PASS", "UI screenshots: PASS" — 10 shots; cold `--review-cold-r3.md` CHANGES REQUESTED; no path to Settings/Diagnostics/import/reset/token without the PIN found by either; fallback SHA-256 matches node:crypto on 355 inputs)
- KCI1 = cold Important 1 (code-bug): a held Enter (auto-repeat) on a focused button opens the PIN dialog and each repeat submits an empty entry counted as a wrong PIN → 5 failures in under a second, the right PIN refused for 60 s; a remote user holding OK for the 3 s kiosk reveal locks themselves out → fix: ignore `e.repeat` in the dialog, never count an entry shorter than PIN_MIN, e2e for a held Enter.
- KAI1 = anchored Important 1 = cold Minor 2 (code-bug): a resetPin load clears the stored lock but not the prompt's in-memory copy; a new PIN set in that session is refused for the old lock's remaining time and the failure count carries on (R-KIOSK-1) → fix + e2e: in the reset session set a new PIN and use it.
- KCM1 (code-bug): a stored lockedUntil far in the future (clock stepped back, hand-edited storage) never expires — only the displayed wait is capped → clamp lockedUntil to now + 15 min when read and when written.
- KAM1 (spec-gap): a held Enter through a wake from sleep starts the hold from the auto-repeats → ignore `e.repeat` for the Enter hold (start timing only on the first keydown that is not swallowed).
- KAM2 (spec-gap): the PIN dialog's Cancel is 40 px tall vs 48 px keys and is the only way out on touch → 48 px.
- Re-dispatch r4/r5 (third re-dispatch → BRANCH: two candidates from tree e8d6016 in ../wt-kiosk-and-pin-r4 and -r5). r4: lock state stays in the prompt; add `resetLock()` called from boot's reset branch, clamp on parse. r5: storage is the single source of truth — `verify()`/`submit()` re-read and clamp `plexPoster.pinLock` every time; no in-memory copy to go stale. Both fix KCI1, KCM1, KAM1, KAM2 the same way. Re-dispatches: 3
- Candidate worktrees: base is HEAD (the r3 base 9263977 + the K32 plan commit; docs/integration-plan.md only), staged diff identical to tree e8d6016 (9 files, +1894/−31); candidate tree 8371304.

## Plan acceptance — Step 4 r4 (candidate; ../wt-kiosk-and-pin-r4, E2E_PORT=22620)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac1-r4.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac2-r4.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac3-r4.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac4-r4.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac5-r4.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac6-r4.json` |
| 7 | plan criterion 7 | narrated (risk:high reviewers) | — | Step 7 |

## Plan acceptance — Step 4 r5 (candidate; ../wt-kiosk-and-pin-r5, E2E_PORT=22720)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac1-r5.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac2-r5.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac3-r5.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac4-r5.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac5-r5.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac6-r5.json` |
| 7 | plan criterion 7 | narrated (risk:high reviewers) | — | Step 7 |
- r4 (resetLock): KCI1, KCM1, KAM1, KAM2, KAI1 fixed; unit 31, kiosk e2e 36, full e2e exit 0 (builder). Pre-commit r4: all exit 0.
- r5 (storage as the single source of truth): same fixes; unit 31, kiosk e2e 37, full e2e exit 0 (builder). Pre-commit r5: scope exit 1 caused by the CONDUCTOR's untracked `node_modules` symlink in the candidate worktree (.gitignore's `node_modules/` does not match a symlink); added to info/exclude in both candidates and re-run as `-r5b`: all exit 0. Not the builder's.
- Mutations r4 and r5 (conductor, same five on each): repeat-counted 1 · short-entry-counted 1 · hold-on-repeat 1 · reset-keeps-lock 1 · no-clamp 2 — all killed on both.
- Pick (`kiosk-and-pin--pick-r5.json`): r4 and r5 both 75/75 COMPLETE → tie → r4 (lower round; smaller change). r5 kept for reference, not landed. predispatch --kind code ok; Step 7 dispatched 2026-10-10T23:10:53Z: kiosk-and-pin-review-anchored-r4 (opus; ui → screenshots) and kiosk-and-pin-review-cold-r4 (opus; risk:high, full not delta); tree 256bfa8 in ../wt-kiosk-and-pin-r4

## Step 7 — cold r4 (artifacts/kiosk-and-pin--review-cold-r4.md, CHANGES REQUESTED: Important 1 in-memory lock not re-clamped after a backward clock step; Minors 1–2) — triage held for the anchored r4 review

## Step 7 triage — r4 (anchored `--review-r4.md` CHANGES REQUESTED, "Criterion 7: PASS", "UI screenshots: PASS" — 4 r4 shots, Cancel 48 px; KCI1, KAI1, KAM1, KAM2 confirmed with reverts; cold `--review-cold-r4.md` CHANGES REQUESTED; no gate bypass found by either)
- K4I1 = anchored Important 1 + cold Important 1 (code-bug, KCM1 half-fixed): the lock is clamped only when read at module load and when written. (a) cold: after a backward clock step the in-memory lock still says 15 min until the clock catches up (only a reload clears it); (b) anchored: a far-future value stays in storage, so every reload restarts a fresh 15 min. Removing `now()` from the one call site passes every test → re-dispatch r6 (parent r4 per pick): every `ask()`/`submit()` reads the stored lock through parseLock+clampLock against `now()` and writes the clamped value back (the r5 candidate's readLock/writeLock design — port it; resetLock() stays). Tests: (a) unit/e2e — 5 wrong PINs, clock back 1 year, +16 min, right PIN accepted, no reload; (b) e2e — stored lock 1 day ahead, reload every 10 min, Settings opens by +15 min; mutant: call-site clamp removed → fails.
- K4M1 (cold Minor 1, code-bug): kiosk mode's contextmenu suppression also blocks long-press paste in the Settings token/server fields → suppress only outside an open dialog → r6.
- K4M2 (cold Minor 2, code-bug): a PIN prompt opened during the boot config.json wait cannot succeed once the reset clears the PIN, and each entry counts → after the reset, an open prompt is cancelled (resolves false, nothing counted) → r6, e2e with a delayed config.json route.
- Anchored "declined": the frame behind the rot-90 PIN dialog looks mid-rotation in the shots — shell rotation animation, outside this phase; no action.
- Re-dispatch r6 (fresh builder, single; worktree ../wt-kiosk-and-pin-r4). Re-dispatches: 4 (cap 5)

## Plan acceptance — Step 4 r6 (../wt-kiosk-and-pin-r4, E2E_PORT=22920)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac1-r6.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac2-r6.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac3-r6.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac4-r6.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac5-r6.json` |
| 6 | plan criterion 6 | evidence.py exec (plan command) | 0 | `kiosk-and-pin--ac6-r6.json` |
| 7 | plan criterion 7 | narrated (risk:high reviewers) | — | Step 7 |
- r6: the prompt keeps no lock in memory — readLock() parses, clamps against now() and writes back when clamped (K4I1); contextmenu suppression skips `dialog[open]` (K4M1); boot's reset calls new cancelVerify() (K4M2; separate from resetLock, which only clears storage). The clock-step-back case is a unit test (Playwright's fake clock cannot step back). Unit 36, npm test 284, kiosk e2e 39, full e2e exit 0 (builder). Pre-commit r6: all exit 0.
- Mutations r6 (conductor): read-unclamped 3 · no-writeback 3 · menu-blocked-in-dialog 1 · prompt-survives-reset 1 — killed; r4 set re-run on r6: repeat-counted 1 · short-entry-counted 1 · hold-on-repeat 1 · reset-keeps-lock 1 · no-clamp 5 — killed.
- predispatch --kind code ok; Step 7 dispatched 2026-10-10T23:40:55Z: kiosk-and-pin-review-anchored-r6 (opus; ui) and kiosk-and-pin-review-cold-r6 (opus; risk:high, full); tree 7a77c78

## Step 7 — cold r6 (artifacts/kiosk-and-pin--review-cold-r6.md, APPROVE; 2 Minors) — triage held for the anchored r6 review

## Step 7 triage — r6 (anchored `--review-r6.md` APPROVE, "Criterion 7: PASS", "UI screenshots: PASS (r3/r4 shots stand; UI unchanged)"; cold `--review-cold-r6.md` APPROVE; K4I1 a/b, K4M1, K4M2 each confirmed by mutants; earlier KCI1, KAI1, KAM1, KAM2 still hold; no route past the PIN and no way to shorten, skip or stretch a lockout)
- K6M1 (anchored Minor 1, spec-gap): the contextmenu exemption covers every open dialog incl. #pin-dialog, so a long-press on the touch keypad shows the native menu (with Inspect). D16 already accepts devtools as a bypass. CONDUCTOR RULING K36: no round here; routed to `touch-and-labels` (owns touch behaviour): exempt only the Settings sheet / text fields. Listed at the next stop.
- K6CM1 (cold Minor 1, cosmetic): a sheet left open > 15 s in kiosk mode lets the reveal timer hide the controls, so focus returns to the body on close. No action (nothing exposed or stuck).
- K6CM2 (cold Minor 2, spec-gap): the right PIN typed during the ≤ 2.5 s config.json wait opens Settings with the old PIN, and a Save there restores it until the next load clears it again. No action (needs the PIN; self-heals on the next load while the flag is served).
- No open finding: Step 7 closes.
- Step 7 r6 tally corrected (`kiosk-and-pin--tally-step7-r6-c1.json`, 95/95): derive listed narrated ac7 as missing; evidence `kiosk-and-pin--ac7-r6.json` (anchored Criterion 7 PASS, both reviews APPROVE).
- Read-back first refused token '2.5' (the code says 2500 ms); message reworded and the unpushed commit amended before any push.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r6)

## Seam check (merged: + kiosk-and-pin)
- `round--seam-w3-r11.json` exit 0 (npm test, full npm run test:e2e, check-precache)

## Step 8 tally (`kiosk-and-pin--tally-step8-r6.json`)
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

- Landed: f7be8a9 — "Add kiosk mode, a settings PIN and a loopback-only PIN reset" (from orch/kiosk-and-pin-r4, the picked candidate + r6)
- Read-back ok (after the 2500 ms rewording); attribution (commit form, r6) ok — checked on the first sha e0f7c6b; the amend changed only the message line about the timeout

## Reviews
- r3 anchored + cold (CHANGES REQUESTED: KCI1, KAI1, KCM1); r4 anchored + cold (CHANGES REQUESTED: K4I1); r6 anchored + cold (APPROVE; Criterion 7 PASS; UI PASS)

## Notes / reconciliation
- Re-dispatches: 4 of 5 (branch at the 3rd: r4 picked over r5 on a tie). Unknowns: touch long-press on real hardware (touch-and-labels; K36). Rulings for the next stop: K32–K36. Invalidated: none. Candidate worktree ../wt-kiosk-and-pin-r5 and the unused ../wt-kiosk-and-pin (r1–r3) are superseded.

## Stop message 12
**Stop 12 — five phases landed; 12 small rulings to confirm (one reply)**

Since stop 11, five phases have landed and been pushed: metadata-and-now-playing, status-indicator, pixel-shift, frame-brightness and kiosk-and-pin. Kiosk-and-pin took 4 of the 5 allowed re-sends. In the end both reviewers approved, and neither found any way past the PIN. While building, I settled 12 small questions myself so work could continue. Each answer below is what is now built. Recommended for each: **(a) keep it as built**. (b) is the alternative.

1. **K25 Failed rating re-check.** If the request that re-checks cached ratings fails, every title it asked about is treated as unrated. It stays hidden offline while a limit is set, and rotation carries on. (b) Keep the old ratings until a check succeeds.
2. **K26 Episode year and length.** An episode's info line shows its show's year when Plex sends one, otherwise none. The progress bar uses the episode's own length. (b) Leave the year blank for episodes.
3. **K27 How often ratings are re-checked.** On each online pool reload, which happens at most every 30 min. (b) Only at startup.
4. **K28 Progress bar test gap.** No test checks that turning the bar or label on or off keeps the bar's position. The code is right, and it's cosmetic, so no extra round. (b) Add the test now.
5. **K29 Status update while hidden.** The once-a-second status update keeps running while the controls are hidden. It never touches the status text then, but it lets the corner dot appear if the screen goes offline while idle. (b) Stop the update while hidden; the dot would then only appear at the next wake.
6. **K30 Display protection preview.** Pixel-shift settings apply on Save, but an unsaved change also takes effect when you move a live setting such as Rotation; Cancel still undoes it. Settings-sheet decides how to make this consistent. (b) Fix it now.
7. **K31 Brightness slider value.** The Frame brightness slider shows no number and its hint wraps onto two lines. Settings-sheet fixes it. (b) Fix it now.
8. **K32 config.json check on every load.** Needed for the PIN reset. When there's no config.json, the browser console logs a harmless 404. The smoke test ignores only that error. (b) Make the server answer "no content" instead; that wouldn't cover static hosting.
9. **K33 PIN reset behaviour.** While config.json contains `{"resetPin": true}`, every load clears the PIN and the lockout. Settings doesn't pop open by itself, but opens without a PIN when you ask. (b) Open Settings automatically.
10. **K34 Lockout timing.** The 5th wrong PIN in a row locks for 60 s, and each further one doubles it, up to 15 min. Tries while locked are refused and don't count. (b) A flat 60 s.
11. **K35 PIN rules.**
    - A PIN is 4–8 digits, entered twice, and takes effect on Save.
    - Showing or exporting the token, import and reset each ask every time.
    - A kiosk reveal lasts 15 s.
    - The config.json check gives up after 2.5 s.

    (b) Remember the PIN for a few minutes after it's entered.
12. **K36 Long-press menu.** In kiosk mode the browser's long-press menu now works inside dialogs, so you can paste into Settings. That includes the PIN keypad, whose menu offers Inspect; the PIN is a deterrent only, so nothing is lost. Touch-and-labels limits the menu to the Settings fields. (b) Fix it now.
13. **Token rotation** is still open. Reply with the four lines whenever you've done it (method, date, old token rejected with 401, whether you want the history purge).

Also done at your request: two away-from-home rows in the real-server checklist (remote address and relay only), logged as D39.

Reply e.g. "1a, 5b" — or "defaults".
<!-- end stop 12 -->
- Stop 12 sent 2026-10-11T00:10:46Z verbatim from `closer show --stop 12` (stopcheck ok).

- Answer to stop message 12: "defaults" — chat; recorded by the conductor at 2026-10-11T02:29:17.092809Z
- Stop 12 answered "defaults" (2026-10-11T02:28:48Z, `closer answer`) → D40 (K25–K36 kept; K30, K31 → settings-sheet, K36 → touch-and-labels stay as phase follow-ups). Item 13 (token rotation) open.

## Index items carried (verbatim from .orchestrator/state.md; added 2026-10-14 by conductor-2 for closer index-check)
these rulings and deferrals were recorded in this phase's stop messages and in docs/decisions.md in other words; closer index-check requires the index text itself in a phase file, so it is copied here unchanged.
- K35 — kiosk-and-pin Q-kp4: a PIN is 4-8 digits entered twice, applies on Save; every token reveal/export, import and reset asks each time; kiosk reveal lasts 15 s; config.json fetch times out after 2.5 s; list at the next stop
- K34 — kiosk-and-pin Q-kp3: the 5th consecutive wrong PIN locks 60 s, each further one doubles it up to 15 min; attempts while locked are refused and not counted; list at the next stop
- K33 — kiosk-and-pin Q-kp2: while config.json serves {resetPin:true} every load clears the PIN and lockout; Settings is not opened automatically but opens without a PIN when asked; list at the next stop
- K32 — kiosk-and-pin Q-kp1: the every-load config.json fetch logs a console 404 (403 on LAN) when there is no config.json; smoke.spec.mjs joins kiosk-and-pin's Output and ignores only that error; list at the next stop
