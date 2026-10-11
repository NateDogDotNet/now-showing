# device-helper-integration

- Mode: afk        Tags: ui        Blocked by: device-helper-server (done 16300a9), sleep-mode (done e6f426b)
- Status: done · landed e1b7f07 · confidence 100
- Commit(s): e1b7f07
- Agent type: orchestrator-builder; model sonnet, effort medium
- Claimed: 2026-10-11T02:30:33Z
- Worktree: ../wt-device-helper-integration on branch orch/device-helper-integration from 1550ccb (D12). Serial: shares js/main.js, index.html, css/app.css, sw.js.

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 1, 3, 5 fail (module, spec, checkbox missing); 2, 4 exit 0. `closer preflight` ok.
- PROBE: `grep -n 'deviceHelper' js/settings.js` → deviceHelper (default false) exists — meets criterion 5 (key to bind)
- PROBE: `sed -n 1,12p scripts/device-helper.mjs` → POST /__helper/display, GET /__helper/status, GET /__helper/calls (fake) with the X-Poster-Helper header guard — meets criterion 3 (server landed; also criterion 1)
- PROBE: `grep -n 'function evaluateSleep' js/main.js` → the single sleep state change point (veil, body.asleep, tick) — meets criterion 3 (where power calls hook in)
- Step 3: orchestrator-builder device-helper-integration-builder-r1, sonnet, medium; brief artifacts/device-helper-integration--brief-r1.md
- Dispatched: 2026-10-11T02:30:33Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-device-helper-integration, E2E_PORT=23120)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac5-r1.json` |
- Pre-commit r1: **lint exit 1 — REAL**: tests/e2e/helper.spec.mjs:72:7 "'now' is assigned a value but never used". format/tests/security/scope exit 0.
- Mutations r1 (conductor; helper unit + e2e): no-header 1 · log-every-tick 2 — killed. **SURVIVED**: no-tv-wait 0 (no test that the poster fetch waits TV_WAKE_MS after the power-on); fetch-before-power 0 (`wakeTv(); next();` — tick() returns early while tvWaking, so the e2e's request-order check still passes); helper-ignores-setting 0 (switching deviceHelper OFF after it was on is untested — helperActive() would stay true and keep powering the TV); off-after-wake 0 (the re-check inside the double rAF; a wake within two frames of sleeping — narrow, no test required).
- The e2e console filter ignores EVERY console error located at /__helper/ — wider than needed; Q-dhi1 only needs the 404 of the boot probe.
- Questions r1 — conductor ruling (listed at the next stop): Q-dhi1 → K37 (accepted, with the narrower filter: with deviceHelper off no probe at all; with it on and no --helper, Chromium's one 404 line for the probe is expected — the spec ignores only a 404 on /__helper/status, like K32).
- Re-dispatch r2: recipient device-helper-integration-builder-r2 (fresh), forced by the lint error and three surviving mutants. Re-dispatches: 1

## Plan acceptance — Step 4 r2 (E2E_PORT=23120)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac4-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac5-r2.json` |
- r2: lint fixed; console filter narrowed to a 404 on /__helper/status and K32's /config.json (K37); app fix in tick(): a tick already in flight when a wake began fetched the poster at once (found by the new TV-wake timing test); deviceHelper switched off now stops every helper call. Builder-reported mutants: no-tv-wait, fetch-before-power, helper-ignores-setting now fail. Pre-commit r2: all exit 0.
- Builder-flagged side effect (r2): with the setting switched off while the TV is already powered off (Settings open as sleep began), the wake path skips the power-on, so the TV stays black until someone turns it on by hand. Not acceptable: turning a setting off must not strand the screen.
- Re-dispatch r3: recipient device-helper-integration-builder-r3 (fresh), forced by the stranded-TV side effect. Re-dispatches: 2

## Plan acceptance — Step 4 r3 (E2E_PORT=23120)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac1-r3.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac2-r3.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac3-r3.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac4-r3.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac5-r3.json` |
- r3: switching deviceHelper off at Save while the app has the TV off sends one power-on (releaseTv), then silence; e2e case 9 new, case 8b rewritten to the new rule (it expected no power-on). Failure of that last call is logged once by helper.js (no fake-failure test: the fake helper cannot fail). Pre-commit r3: all exit 0. Full e2e exit 0 (builder).
- Mutations r3 (conductor): no-tv-wait 1 · fetch-before-power 1 · helper-ignores-setting 1 (the three r1 survivors) · stranded-tv 1 — killed. r1 kills (no-header, log-every-tick) stand (helper.js unchanged since r1). off-after-wake: narrow race, not required (r1 note).
- Step 4 r3 tally corrected (`device-helper-integration--tally-step4-r3-c1.json`): the r1 off-after-wake survivor (two-frame race, accepted untested) was scored against r3. Predispatch first refused, then ok.
- predispatch --kind code ok; Step 7 dispatched 2026-10-11T03:57:00Z: device-helper-integration-review-anchored-r3 (opus; ui → screenshots; not risk:high → no cold review); tree 13bf5d4

## Step 7 triage — r3 (anchored `--review-r3.md` CHANGES REQUESTED, "UI screenshots: PASS" — 4 shots; full e2e exit 0; gating, power-off timing, wake ordering, header, SW pass-through, log-once, K37 filter confirmed)
- DHI1 (Important 1, code-bug): the live preview (js/main.js applySettings) does not hold `deviceHelper` at its saved value, so an unsaved untick takes effect as soon as any live control (e.g. Frame brightness) moves; at Save `prev.deviceHelper` is already false, releaseTv() never runs, and wake clears tvOff without a power on — the TV stays off (reproduced).
- DHI2 (Important 2, code-bug): same path — ticking the box, touching a live control, Save → no probe, no temperature line (reproduced).
- DHM1 (Minor 1, code-bug, UI): the checkbox renders 13 px vs 18 px (long label wraps; box shrinks) → `flex: none` → in r4/r5 (one CSS line, no extra round).
- DHM2 (Minor 2, spec-gap): manual wake and schedule-end wake untested with the helper on (same code path) → follow-up, no round (D42).
- DHM3 (Minor 3, spec-gap): a failed boot probe is logged at info level (visible in Recent events) while R-HELP-2 says "silent"; not a console error, once → no action (D42).
- Re-dispatch r4/r5 (third re-dispatch → BRANCH: two candidates from tree 13bf5d4 in ../wt-device-helper-integration-r4 and -r5; base now ea19610, docs-only commits since 1550ccb). r4: add `deviceHelper` to the keys a preview never changes (smallest change). r5: decide probe/release from the last SAVED settings (keep a `saved` snapshot updated only on persist) rather than the previewed state, and leave the preview free to show the checkbox. Both: two e2e cases (untick → touch a live control → Save → one power on; tick → touch a live control → Save → probe + temperature) and DHM1. Re-dispatches: 3

## Plan acceptance — Step 4 r5 (candidate; ../wt-device-helper-integration-r5, E2E_PORT=23420)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac1-r5.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac2-r5.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac3-r5.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac4-r5.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac5-r5.json` |
- r5 (saved-settings snapshot): helperActive/probe/release follow the last saved value; e2e cases 10 (DHI1), 11 (DHI2), 12 (DHM1, flex: none on the global checkbox rule) failed on r3 first. Pre-commit r5: all exit 0. Full e2e exit 0 (builder).
- Mutations r5 (conductor): preview-updates-saved 1 · stranded-tv 1 · no-probe-on-enable 1 — killed.

## Plan acceptance — Step 4 r4 (candidate; ../wt-device-helper-integration-r4, E2E_PORT=23320)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac1-r4.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac2-r4.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac3-r4.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac4-r4.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `device-helper-integration--ac5-r4.json` |
- r4 (preview never changes deviceHelper, like kioskMode): e2e cases 10a (DHI1), 10b (DHI2), 11 (DHM1) failed on r3 first; DHI2 waits for the Save's probe before opening Diagnostics. Pre-commit r4: all exit 0. Full e2e exit 0 (builder).
- Mutations r4 (conductor): preview-applies-helper 1 · stranded-tv 1 · no-probe-on-enable 1 — killed.
- Step 4 r4 and r5 tallies corrected (`-tally-step4-r4-c1.json`, `-r5-c1.json`, 75/75) for the stale r1 off-after-wake survivor (accepted two-frame race). Pick (`device-helper-integration--pick-r5.json`): tie → r4 (lower round; smaller change). predispatch --kind code ok; Step 7 dispatched 2026-10-11T04:42:50Z: device-helper-integration-review-anchored-r4 (opus; DELTA-scoped from tree 13bf5d4 — not risk:high, three-file delta; the r3 shots stand unless the checkbox change shows); tree c74124e in ../wt-device-helper-integration-r4

## Step 7 triage — r4 (anchored delta `--review-r4.md` APPROVE, "UI screenshots: PASS" — 2 shots; full e2e exit 0; DHI1, DHI2, DHM1 each confirmed by reverting its fix; Cancel restores the saved state with no helper call; `flex: none` changes only the two shrunken boxes)
- No new finding. r3 Minors DHM2 (follow-up → pi-stability) and DHM3 (no action, D42) unchanged.
- No open finding: Step 7 closes.
- Step 7 r4 tally corrected (`device-helper-integration--tally-step7-r4-c1.json`, 95/95) for the same stale off-after-wake survivor.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r4)

## Seam check (merged: + device-helper-integration)
- `round--seam-w3-r12.json` exit 0 (npm test, full npm run test:e2e, check-precache; 10 m 39 s — the first attempt crashed evidence.py on its default timeout: `TypeError: can't concat str to bytes` in ev_exec's timeout path, a kernel bug outside this repo; re-run with --timeout 1500)

## Step 8 tally (`device-helper-integration--tally-step8-r4.json`, corrected `-c1`)
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

- Landed: e1b7f07 — "Power the TV off in sleep and show CPU temperature through the helper" (from orch/device-helper-integration-r4, the picked candidate)
- Read-back ok; attribution (commit form, r4) ok

## Reviews
- r3 anchored (CHANGES REQUESTED: DHI1, DHI2; UI PASS); r4 anchored delta (APPROVE; UI PASS)

## Notes / reconciliation
- Re-dispatches: 3 of 5 (branch at the 3rd: r4 picked over r5 on a tie). Unknowns: TV_WAKE_MS on hardware (extended row V1-E22). Rulings for the next stop: K37. Follow-up: DHM2 → pi-stability. Invalidated: none. Lesson: pass `--this-round-only` to derive after a branch so a stale earlier-round survivor is not re-scored.
