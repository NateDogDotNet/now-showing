# pi-stability

- Mode: afk        Tags: ui (full process per D42: anchored + cold)        Blocked by: sleep-mode (done e6f426b), settings-and-schedule-core (done 33976fe)
- Status: done · landed 1df3be1 · confidence 100
- Commit(s): 1df3be1
- Agent type: orchestrator-builder; model sonnet, effort high
- Claimed: 2026-10-11T05:17:50Z
- Worktree: ../wt-pi-stability on branch orch/pi-stability from e1b7f07 (D12). Serial: shares css/app.css, js/main.js, index.html, sw.js.
- Output amended (K38): + tests/e2e/helper.spec.mjs for device-helper-integration DHM2 (test-only; listed at the next stop).

## Pre-flight
- Pre-dispatch run (ac-runner pre-r1): criteria 1, 2, 4, 5 fail (backdrop-filter present; spec, checkbox, no-store missing); 3 exit 0. `closer preflight` ok.
- PROBE: `grep -n 'backdrop-filter' css/app.css` → one rule (l.296) — meets criterion 1 (the rule to remove)
- PROBE: `grep -n 'dailyReload' js/settings.js` → dailyReload (true) and dailyReloadTime ('04:00') exist — meets criterion 2 (keys)
- PROBE: `grep -n 'caches.match' sw.js` → navigations and GETs answered from the cache — meets criterion 5 (no-store needs a network-only branch)
- PROBE: `grep -n 'reg.update' js/main.js` → the 6 h update timer (K16) — meets criterion 2 (carried must-fix)
- Carried must-fixes: K16 (D24), C8M3 (D28), DHM2 (K38).
- Step 3: orchestrator-builder pi-stability-builder-r1, sonnet, high; brief artifacts/pi-stability--brief-r1.md
- Dispatched: 2026-10-11T05:17:50Z        Re-dispatches: 0

## Plan acceptance — Step 4 r1 (evidence.py exec in ../wt-pi-stability, E2E_PORT=23620)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `pi-stability--ac1-r1.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `pi-stability--ac2-r1.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `pi-stability--ac3-r1.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `pi-stability--ac4-r1.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `pi-stability--ac5-r1.json` |
- Pre-commit r1: lint/format/tests/security/scope exit 0. Full e2e 13 min, all PASS (builder). K16 root cause: with service workers blocked, register() resolves undefined and the 6 h timer called undefined.update(); now guarded. C8M3: lastPlaybackAt carried in sessionStorage across an automatic reload (2 min validity). DHM2: two helper wake cases added.
- Mutations r1 (conductor): no-controller-check 1 · no-gap 1 · sw-caches-probe 1 — killed. no-wait 0 — equivalent in effect (the second reloadMustWait() after the probe still blocks; only an extra probe). **probe-status-ignored 0 — SURVIVED**: a server answering 503/404 to the probe still reloads; sw.js passes a non-ok navigation response through (it falls back to the cache only on a network error), so the display would be stranded on an error page.
- Questions r1 — conductor rulings (listed at the next stop): **Q-ps1 → K39 (changed)**: a MANUAL wake (key/tap while asleep) must not trigger the wake reload — the reload drops the 60 s manual wake and the schedule puts the screen straight back to sleep; only a wake that ends sleep (schedule end, playback, idle cleared) may. Q-ps2 → K40 (accepted: with no lastReload recorded, the page's load time stands in). Q-ps3 → K41 (accepted: the reload also waits for the crossfade, the TV wake and any open dialog). Q-ps4 → K42 (accepted: --panel .98 for every panel; Diagnostics row 'Service worker: controlling|none').
- Re-dispatch r2: recipient pi-stability-builder-r2 (fresh), forced by the surviving mutant probe-status-ignored and K39. Re-dispatches: 1

## Plan acceptance — Step 4 r2 (E2E_PORT=23620)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `pi-stability--ac1-r2.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `pi-stability--ac2-r2.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `pi-stability--ac3-r2.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `pi-stability--ac4-r2.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `pi-stability--ac5-r2.json` |
- r2: e2e case 2b — a pass-through proxy answers the no-store probe with 503 / 404 (Playwright 1.56 does not route a controlled page's no-store fetch) → no reload, logged skip, Diagnostics skipped (HTTP …), lastReload not written; passes on r1 (the guard existed; only the test was missing). K39: evaluateSleep skips the wake reload when why === 'manual wake'; case 9c failed on r1. Pre-commit r2: all exit 0. Full e2e exit 0 (builder).
- Mutations r2 (conductor): probe-status-ignored 1 · manual-wake-reloads 1 — killed. r1 kills stand; no-wait equivalent (r1 note).
- predispatch --kind code ok; Step 7 dispatched 2026-10-11T06:24:11Z: pi-stability-review-anchored-r2 (opus; ui → screenshots) and pi-stability-review-cold-r2 (opus; full process per D42); tree 82fd6a1

## Step 7 — cold r2 (artifacts/pi-stability--review-cold-r2.md, APPROVE; Minor 1 a scheduled reload cuts a manual wake short; Minor 2 one extra reload after a boot with the clock unset) — triage held for the anchored r2 review

## Step 7 triage — r2 (anchored `--review-r2.md` APPROVE, "UI screenshots: PASS" — 6 shots, sheet rgba(18,18,20,.98) with no backdrop filter; cold `--review-cold-r2.md` APPROVE; neither could strand the display; K16, C8M3, DHM2 confirmed; hanging probe and a 04:00 reload while asleep checked)
- PSA1 (anchored Minor 1, spec-gap): the waits for a running crossfade and for the TV waking (js/main.js reloadMustWait) have no test — removing either passes. "Never mid-fade" is a named plan hazard → under D42 this forces a round: re-dispatch r3 adds the two cases.
- PSC1 (cold Minor 1, code-bug): a 04:00 reload during a 60 s manual wake goes ahead and the screen drops back to sleep early (reloadMustWait ignores manualWakeUntil; the wake is not carried). Same harm K39 ruled out → r3: wait while Date.now() < state.manualWakeUntil.
- PSC2 (cold Minor 2, code-bug): bootAt is taken before NTP sets the clock and not shifted by the jump, so on a Pi without an RTC and no lastReload the first real wake reloads at once (once; no loop) → r3: shift bootAt by the detected jump in syncSleepClock (as lastPlaybackAt is).
- PSA2 (anchored Minor 2, spec-gap): a skipped 04:00 reload is not retried that day — as the spec says ("otherwise it is skipped"). CONDUCTOR RULING K43: keep (the 12 h wake trigger catches up on the next real wake); listed at the next stop.
- Re-dispatch r3 (fresh builder). Re-dispatches: 2

## Plan acceptance — Step 4 r3 (E2E_PORT=23620)
| # | Item | Command | Exit | Evidence |
|---|---|---|---|---|
| 1 | plan criterion 1 | evidence.py exec (plan command) | 0 | `pi-stability--ac1-r3.json` |
| 2 | plan criterion 2 | evidence.py exec (plan command) | 0 | `pi-stability--ac2-r3.json` |
| 3 | plan criterion 3 | evidence.py exec (plan command) | 0 | `pi-stability--ac3-r3.json` |
| 4 | plan criterion 4 | evidence.py exec (plan command) | 0 | `pi-stability--ac4-r3.json` |
| 5 | plan criterion 5 | evidence.py exec (plan command) | 0 | `pi-stability--ac5-r3.json` |
- r3: e2e 9d (8 s crossfade across 04:00), 9e (helper wake reload after TV_WAKE_MS and the first poster), 9f (manual wake not cut short), 9g (clock-less boot: no extra wake reload); reloadMustWait waits for a manual wake; syncSleepClock shifts bootAt by the clock jump. Pre-commit r3: all exit 0. Full e2e exit 0 (builder).
- Mutations r3 (conductor): mid-fade-reload 1 · reload-while-tv-waking 1 · reload-cuts-manual-wake 1 · bootat-not-shifted 1 — killed.
- predispatch --kind code ok; Step 7 dispatched 2026-10-11T06:59:29Z: pi-stability-review-anchored-r3 and pi-stability-review-cold-r3 (opus; both DELTA-scoped from tree 82fd6a1, which both approved; D42 full process kept); tree 283f9f1

## Step 7 — anchored r3 (artifacts/pi-stability--review-r3.md, APPROVE; PSA1, PSC1, PSC2 confirmed by removing each fix; 3 repeat runs exit 0) — triage held for the cold r3 review

## Step 7 triage — r3 (anchored delta `--review-r3.md` APPROVE, "UI screenshots: PASS (r2 shots stand; UI unchanged)"; cold delta `--review-cold-r3.md` APPROVE, no findings; each r3 fix confirmed by removing it; repeat runs deterministic)
- Cold "declined" note (optional, not reproduced): dailyReloadTick does not absorb a clock jump itself, so a forward jump during a manual wake might let a reload through for about a second before the post-probe re-check. No round (D42: Minor at most, unreproduced). Continuous pointer movement postponing the reload while it also keeps the screen awake: accepted (someone is using the screen).
- No open finding: Step 7 closes.

## Pre-commit — lint/format/tests/security/scope exit 0 (round--step4-generic-r2.sh, -r3)

## Seam check (merged: + pi-stability)
- `round--seam-w3-r13.json` exit 0 (npm test, full npm run test:e2e, check-precache; --timeout 1800)

## Step 8 tally (`pi-stability--tally-step8-r3.json`)
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

- Landed: 1df3be1 — "Add a guarded daily reload, drop the sheet blur, stop swipe-back"
- Read-back ok; attribution (commit form, r3) ok

## Reviews
- r2 anchored + cold (APPROVE; Minors PSA1, PSC1, PSC2 → r3); r3 anchored + cold delta (APPROVE)

## Notes / reconciliation
- Re-dispatches: 2. Carried must-fixes fulfilled here: K16 (D24), C8M3 (D28), DHM2 (K38) — dropped from the follow-up index with their evidence. Rulings for the next stop: K38–K43. Unknowns: Chromium service-worker behaviour on the Pi over https vs http LAN (real-server-validation). Invalidated: none.

## Index items carried (verbatim from .orchestrator/state.md; added 2026-10-14 by conductor-2 for closer index-check)
these rulings and deferrals were recorded in this phase's stop messages and in docs/decisions.md in other words; closer index-check requires the index text itself in a phase file, so it is copied here unchanged.
- K43 — pi-stability PSA2: a daily reload skipped at its time (server down, no service worker, clock unset) is not retried that day, as R-PROT-3 says; the 12 h wake trigger catches up at the next real wake; list at the next stop
- K42 — pi-stability Q-ps4: the more opaque --panel (.98) applies to every panel, and Diagnostics reads 'Service worker: controlling|none'; list at the next stop
- K41 — pi-stability Q-ps3: the daily reload also waits for the crossfade, the TV wake and any open dialog, not only state.busy; list at the next stop
- K40 — pi-stability Q-ps2: with no plexPoster.lastReload recorded, the page's own load time counts as the last reload; list at the next stop
- K39 — pi-stability Q-ps1 (changed by the conductor): a manual wake (key press or tap while asleep) does not trigger the 12 h wake reload, which would drop the 60 s manual wake and let the schedule put the screen straight back to sleep; only a wake that ends sleep (schedule end, playback) may; list at the next stop
- K38 — pi-stability's Output gains tests/e2e/helper.spec.mjs so it can add the two device-helper wake cases (manual wake, schedule-end wake) routed from device-helper-integration DHM2; test-only; list at the next stop
