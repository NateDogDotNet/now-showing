produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: pi-stability · round: r2 · mode: anchored
**Verdict:** APPROVE

Reviewer: pi-stability-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T06:24:11Z · Method: anchored code review (ui) · Scope: pi-stability, r2, base e1b7f07, tree 82fd6a16463bd9d56855e0ad26e24089c631ab4f

## What I read and ran

Read: plan §17 (docs/integration-plan.md:400-415); spec R-PROT-3/4, R-TOPO-1, R-PROT-1, R-HELP-2; decisions D6, D24 (K16), D28 (C8M3), D42; phase record (K38-K42); the full staged diff (`git diff --cached`); js/main.js evaluateSleep/tick/applySettings call sites; sw.js fetch handler; both test files.

Ran (all in `git archive 82fd6a1` copies under `mktemp -d`: /tmp/tmp.K2tbxGVTId and a second one; node_modules symlinked from ../wt-device-helper-integration-r5; both removed afterwards; the live worktree's index still writes tree 82fd6a1):
- Full e2e, `E2E_PORT=23710 E2E_MOCK_PORT=23711 npm run test:e2e` → **EXIT 0**. Every spec PASS (brightness, cache-first, content-rating, display-decode, helper, kiosk, metadata, now-playing, pi-stability, pixel-shift, rotation, sleep, smoke, status, ui-rotation). The helper log has `manual wake (key press): power on, then the poster fetch 4401 ms later` and `schedule-end wake (07:00): power on, then the poster fetch 4319 ms later`.
- Criteria 1, 3, 4, 5: c1 exit 0 (no `backdrop-filter`, no `will-change`); `npm test` 293 pass / 0 fail; c4 exit 0; c5 `29 precached files OK` exit 0.
- Ad-hoc case **H** (ports 23720/23721): a pass-through proxy that never answers the no-store probe. Result: `probes 1 log ["4:00:10 AM  Daily reload skipped: the server did not answer"] row skipped (the server did not answer) lastReload 0`, no navigation, no pageerror. So the 5 s abort works, `reloadChecking` is cleared, and the display is not stranded.
- Ad-hoc case **S** (23722/23723): sleep 01:00-07:00 with the reload at 04:00 while asleep, and an rAF sampler on the reloaded page. The first painted frame already has the veil shown (`veilShown:true, frame:false, poster:false`), so there is no flash of frame or poster in a dark room.
- Reviewer mutants on js/main.js:416-421, run through the pi-stability spec (each reverted, and `cmp` against the tree blob confirmed it): **no-fade-wait** (delete the `lastDrawAt` crossfade line) → spec exit 0, SURVIVED; **no-tvwaking** (`state.busy || state.tvWaking` → `state.busy`) → spec exit 0, SURVIVED. See Minor 1.
- Screenshots (23728-23731), described below.

## Hazard walk (code read, plus the runs above)

- App server down, error answer or hang: guarded at main.js:455-463 (`!res.ok` gives "HTTP n"; a catch covers rejects and the 5 s abort). Cases 2 and 2b (503/404) and my case H confirm it. sw.js:76 sends only `request.cache === 'no-store'` to the network. It sits after the navigate branch, so navigations stay network-first with a cache fallback, and other GETs stay cache-first (case 3, which includes a reload with the server stopped).
- Reload loop: lastReload is written and read back before `location.reload()` (main.js:466-467). The 10-minute gap is enforced (cases 10a/10b). Storage that is not persistent blocks the reload (main.js:405). After the 04:00 reload the new page arms with `due` true, so `reloadDay` is today and the reload does not fire again (case 1 stays put for 40 s).
- Dialogs: `dialog[open]` covers #settings, #diagnostics and #pin-dialog (index.html:67/296/309). Cases 6a/6b show it retries after the dialog closes.
- Mid-fade and TV waking: both are in `reloadMustWait` and re-checked after the probe (main.js:464). The code is correct but neither is tested (Minor 1).
- http LAN: `navigator.serviceWorker?.controller` is falsy, so the reload is skipped and logged and Diagnostics shows "skipped (no service worker…)" (case 4). It never reloads.
- Clock: an implausible clock disarms. Re-arming takes the current `due` state, so a clock set after 04:00 does not count as 04:00 passing (case 8b, 1970). A backward jump within the same day is blocked by `reloadDay`. A forward NTP jump past 04:00 counts as passing, which is acceptable and still behind the gap guard. Changing `dailyReloadTime` disarms (main.js:757), so moving the time earlier does not reload at once.
- K39: `requestReloadAfterWake` runs only on an asleep→awake transition with `why !== 'manual wake'` (main.js:580). Case 9c: a manual wake gives no reload and the 60 s wake runs; the schedule end later reloads once. The conductor's manual-wake-reloads mutant was killed.
- K16: register() resolving `undefined` is guarded, and `update()` sits in try/catch (main.js:1093-1101). Cases 13a (blocked) and 13b (allowed, `calls >= 1`) show no pageerror at +6 h 1 min.
- C8M3: the carry goes through sessionStorage for 2 min and is read once and removed (main.js:21-40). Boot passes `restartIdle: carriedPlayback === null`. Cases 14a (daily reload) and 14b (SW-update reload) show the idle clock is kept; case 14c shows a manual reload restarts it. A Save still restarts it, because the Save call at main.js:815 uses the default `restartIdle: true` and the existing sleep.spec idle-after-save case passes.
- DHM2: helper.spec cases 12/13 assert the order `off → on → poster` and that the poster comes ≥ TV_WAKE_MS and ≤ TV_WAKE_MS + 2.25 s after power-on. Both pass.
- No regressions: the sleep, kiosk/PIN, helper and brightness specs all pass in the full run.

## Strengths
- The guard order is right: cheap blockers, then waits, then the gap, then the probe, then everything again after the probe (it can take up to 5 s), then a write with read-back before the reload.
- Skipping and waiting are clearly separate. Unsafe conditions clear the pending reload and log why. A busy moment only defers it.
- The Diagnostics row combines the live blocker with the last skip reason, so an http-LAN display always says why it is skipped.
- The tests use a dedicated server per case and stop the app server, as the plan requires. The 503/404 proxy case closes the r1 surviving mutant.

## Issues

### Critical
None.

### Important
None.

### Minor
1. **The mid-fade and TV-waking waits have no test** (spec-gap). Evidence: both reviewer mutants, no-fade-wait (main.js:419) and no-tvwaking (main.js:418), pass the whole pi-stability spec. Why it matters: "never reload mid-fade" is a named plan hazard, and K41 adds the TV wake. Without the tvWaking wait, a 07:00 wake reload with the helper on would reload during TV_WAKE_MS, and the new page (tvOff=false) would fetch a poster before the TV has finished waking. The code is correct today; the risk is a silent regression. Criterion 2's list does not name either case, so the criteria are silent, not the code wrong. Fix (follow-up per D42): add one case that holds `state.busy` false with a long `crossfadeMs` across 04:00, and one helper case (SW allowed, lastReload > 12 h) asserting that the reload comes after the first post-wake poster.
2. **A skipped 04:00 reload is not retried that day** (spec-gap). If the server is down at 04:00 (or answers 5xx), `skipReload` clears the pending reload, and the next try is the next 04:00 or the next wake from sleep (main.js:422-426, 443). This matches R-PROT-3 ("otherwise it is skipped"), so it is not a code bug. A display whose host is briefly down at 04:00 just goes one more day. Noted for the product owner; no change requested.

## Declined to judge
- `VERSION` is not bumped in sw.js although SHELL files changed. The plan rules this explicitly ("Precache is unchanged … VERSION is not bumped"), and the byte change to sw.js still installs the new worker, whose `addAll(cache:'reload')` refreshes the shell. Ruled earlier.
- The wake reload replaces the first post-wake poster about a crossfade after it appears. That is product behaviour R-PROT-3 and K41 imply ("on the first wake"), not a defect in the diff.
- On a manual wake that spans the schedule end, no wake reload happens (there is no asleep→awake transition). This follows from K39's wording, and the cost is harmless (it waits for the next 04:00).

## Screenshots
Files: `/home/user/plex-poster-app/.orchestrator/artifacts/pi-stability--shot-{1920x1080,1080x1920}-{settings,diagnostics,daily-reload-controls}.png` (6 files). Computed `.sheet` background is `rgba(18, 18, 20, 0.98)` and `backdrop-filter: none` at both sizes.
- (a) Settings over a poster: text is crisp and the contrast is high. In portrait the sheet covers half the poster, and the poster title shows only as a very faint ghost through the 0.98 panel ("…ojector"), which does not hurt legibility. A scratch check with the poster forced bright (brightness 3-6, desaturated; not kept as an artifact) shows the sheet still reads clearly over it.
- (b) Diagnostics: the rows `Service worker: controlling`, `Secure context: yes` and `Daily reload: active` sit near the top and are legible at both sizes.
- (c) The "Reload the page once a day" checkbox, the "Reload at 04:00 AM" time input and the help text sit under Display protection. They match the neighbouring night-dim controls in style and width.

UI screenshots: PASS

## Recommendations
- Add the two tests from Minor 1 as a follow-up.
- Optional: say "or a poster is changing" in the Settings help text, which now lists only the dialogs as reasons for waiting.

## Assessment
All five criteria pass. The full e2e suite exits 0. K16, C8M3 and DHM2 are met with tests that pass. I could not strand the display in any scenario I tried (server down, HTTP error, hang, no controller, dialogs, clock not set or jumping, manual wake, reload while asleep). No Critical or Important findings; the Minor items are test-coverage and product follow-ups.

Files read: docs/integration-plan.md (§17 and grep hits), docs/spec.md (grep hits), docs/decisions.md (D6, D24, D28, D42), .orchestrator/phases/pi-stability.md, staged diff of the 6 files, js/main.js (parts), sw.js (40-100), index.html (grep), css/app.css (grep), tests/e2e/pi-stability.spec.mjs, tests/e2e/helper.spec.mjs (diff), tests/e2e/lib.mjs (parts), js/util.js (grep).

**Verdict:** APPROVE
