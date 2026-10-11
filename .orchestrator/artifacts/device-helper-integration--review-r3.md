produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: device-helper-integration · round: r3 · mode: anchored
**Verdict:** CHANGES REQUESTED

Reviewer: device-helper-integration-review-anchored-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T03:57:00Z · Method: anchored code review (ui) · Scope: device-helper-integration, r3, base 1550ccb, tree 13bf5d4 (staged index of /home/user/wt-device-helper-integration)

## Read and ran

Read: plan section 16 (docs/integration-plan.md:383-397); spec R-HELP-1, R-HELP-2, R-PROT-1; decisions D4, D8; scripts/device-helper.mjs (header, route list, `display()`, `readTemp()`, lock); the phase record (K37, r2 tick fix, r3 releaseTv rule, accepted off-after-wake race); `git diff --cached` in full (js/helper.js, js/main.js, index.html, css/app.css, sw.js, tests/e2e/helper.spec.mjs); js/settings-ui.js (`read()`, live preview at lines 225-232, 254); the `applySettings` preview branch in js/main.js:583-606.

Ran (each scratch copy made with `mktemp -d` + `git checkout-index -a --prefix=` from the worktree index, node_modules symlinked; both removed afterwards; live worktree untouched, `git write-tree` still 13bf5d4):
- `node --test tests/helper.test.js`: pass. `npm test`: pass. `node scripts/check-precache.mjs`: "29 precached files OK".
- Full e2e, `E2E_PORT=23210 E2E_MOCK_PORT=23211 npm run test:e2e`: **exit 0**, every spec PASS (helper, sleep, kiosk, brightness, status, ui-rotation and the rest).
- A scratch spec `probe.spec.mjs` (ports 23220/23221) for the live-preview path (Issues 1 and 2).
- A scratch spec `shots.spec.mjs` (ports 23222/23223) for the four screenshots and checkbox measurements.

## Strengths

- Gating is correct on the direct paths: `probeHelper()` returns before any request when `deviceHelper` is off (boot included); `helperActive()` gates power off, wake and the temperature; `releaseTv()` sends exactly one power on (r3 rule). Cases 4, 5, 8a, 8b and 9 cover these, and the mutants are killed (phase record).
- Ordering: `powerChain` serialises the calls; `wakeTv()` awaits the power on, then `TV_WAKE_MS`, in a `try/finally`, so a failed or hung call still clears `tvWaking`. The client timeout (8 s) is longer than the server's 5 s, so the server's 504 arrives first, and the veil is lifted at once in `evaluateSleep`, before `wakeTv`. Worst case for the poster with a hung off still pending is about 8 + 8 + 4 s. That is bounded, and only the poster waits. `tick()` refuses while `tvWaking` (the r2 fix), and case 7 checks it.
- Power off waits two rAFs and re-checks `state.asleep`, `tvOff` and `helperActive()`. It runs only on the transition (`asleep === state.asleep` returns early) or from a probe while already asleep, and `tvOff` stops it repeating.
- js/helper.js: relative same-origin URLs; `X-Poster-Helper: 1` on every request; nothing throws; each kind of failure is logged once until a success re-arms it; no brightness. sw.js returns early for `/__helper/`, so it is never cached. The K37 filter covers only a 404 on `/__helper/status` and K32's `config.json`, with a self-test of the negatives (helper.spec.mjs:31-44).
- Interplay: Settings over the veil is handled because top-layer dialogs stay outside the inert `#app`. Night dim (`evaluateBrightness`) is independent of the helper. The Diagnostics timer is cleared on `close`.

## Issues

### Critical
(none)

### Important

1. **Live preview puts an unsaved `deviceHelper` in force, so Save loses the r3 power on (stranded TV)** (code-bug, r3 rule and hazard "turning it off later stops everything, after one final power-on if the app had the TV off")
   - Location: js/main.js:589-593 (the preview strips only the rating, pin and kiosk keys; `deviceHelper` passes through) together with js/main.js:615-616 (`prev.deviceHelper` comparison). `read()` in js/settings-ui.js:53-58 copies every form element, so any change to a `data-live` control (the Frame brightness and night-dim block sits right above the checkbox, index.html:225) carries the unticked box into `state.settings`.
   - Evidence: scratch spec, case A. Asleep with the TV powered off, open Settings, untick deviceHelper, move Frame brightness by 5 (an `input` event), Save, then `mock.play`, wake, wait TV_WAKE_MS + 3 s. `GET /__helper/calls` → `A calls: [["display",false]]`. No power on at Save, and none at wake: `evaluateSleep`'s else branch clears `tvOff` silently. This is the r2 stranded-screen bug on a second route. A wake while Settings is open with the box unticked and a live control touched also strands it, and Cancel cannot repair it because the preview path returns before any helper logic.
   - Fix: add `deviceHelper` to the keys a preview never changes (the line-590 list), so only Save toggles it. Add an e2e case: untick, touch a live control, Save, then expect one power on.

2. **The same preview path suppresses the probe when Save turns the setting on** (code-bug, criterion "probe when Save turns it on")
   - Evidence: scratch spec, case B. `deviceHelper:false`, helper present: open Settings, tick the box, move Frame brightness, Save → `B helper requests: []`, and Diagnostics → `B diag CPU row: false`. The preview already set `prev.deviceHelper` to true, so `state.settings.deviceHelper && !prev.deviceHelper` is false. The probe at Settings open had returned early because the setting was off then. The helper stays unused until the next Settings open or a reload.
   - Fix: the same as Issue 1 (one change fixes both). Add a test.

### Minor

1. **The deviceHelper checkbox is squeezed narrower than its siblings** (code-bug, UI)
   - Evidence: measured in Settings at both sizes, `[["deviceHelper",13.08,18],["nightDim",18,18],["wakeOnPlayback",17.84,18]]`. It is visible in `--shot-1920x1080-settings.png` as a smaller box. The long label wraps and the flex item shrinks.
   - Fix: give the input `flex: none`, or shorten the label.

2. **Manual wake and schedule-end wake are not tested with the helper** (spec-gap)
   - All three wake triggers go through the one `evaluateSleep` transition, so the code covers them. The e2e cases drive only wake-on-playback (`mock.play`). The plan criterion names only "at wake", so this is not a failure.

3. **Probe failures go to `console.info` and to Recent events** (spec-gap)
   - The probe logs at info level (js/helper.js:58), so a helper-less boot with the setting on adds one "Device helper probe failed: HTTP 404" event. R-HELP-2 says "silent". It is not a console error, it happens once, and it only happens when the user opted in. Leave it unless the owner wants it fully silent.

## Declined to judge

- Server lock vs client retry (outside the diff; device-helper-server landed). After a timed-out power off, the server keeps `busy` until the process group is gone (up to 10 s, device-helper.mjs:202-203). A power on in that window gets `503 busy`, and the client does not retry, so the TV can stay off after a hung CEC call. `readTemp`'s vcgencmd fallback also takes the lock, so a Diagnostics refresh can collide with a power call on hosts without thermal_zone0. Poster and waking are not blocked, which is what the hazard asks. A later phase could add a single retry of a power on after a 503.
- `sw.js` VERSION not bumped although SHELL gained `js/helper.js`. `install` re-adds the SHELL with `cache: 'reload'` into the same cache, so clients do pick up the file. Version policy for 2.1.0 belongs to the release phase.
- The off-after-wake two-frame race: accepted earlier (phase record r1/r3).
- Status dot: `tick()` is skipped for up to TV_WAKE_MS plus the power call after a wake. I did not check the dot's freshness logic against that gap. It looks benign (a few seconds) and was not exercised by a failing test.

## Recommendations

Fix Issues 1 and 2 with one line (exclude `deviceHelper` from the preview, like the kiosk switches), plus two e2e cases. Optionally fix Minor 1 in css/app.css.

UI screenshots: PASS. The help text is legible, 13 px rgb(163,163,168) on the dark panel, and says "Only works when the app is served by `serve.mjs --helper` on the device itself". The Diagnostics line "CPU temperature 42.5 °C (thermal_zone0)" is legible at both sizes. Files:
- /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--shot-1920x1080-diagnostics.png
- /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--shot-1080x1920-diagnostics.png
- /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--shot-1920x1080-settings.png
- /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--shot-1080x1920-settings.png

## Assessment

On every direct path the criteria hold: the gating, the ordering, the header, the service-worker bypass, K37 and the full suite are green. The live preview bypasses the r3 releaseTv rule and the probe-on-Save rule. Reproduced: a TV stranded off, and a helper never probed after it was turned on. Both are code-bugs with a one-line fix.

**Verdict:** CHANGES REQUESTED
