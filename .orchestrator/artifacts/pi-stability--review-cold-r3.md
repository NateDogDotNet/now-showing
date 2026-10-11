produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: pi-stability · round: r3 · mode: cold
**Verdict:** APPROVE

Reviewer: pi-stability-review-cold-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T06:59:29Z · Method: cold delta review · Scope: pi-stability, r3, base 82fd6a1, tree 283f9f1

## What I read and ran

- Delta: `git diff 82fd6a1 283f9f1` (js/main.js +3/-1, tests/e2e/pi-stability.spec.mjs +110).
- Code the delta calls or that calls it, in 283f9f1:js/main.js: state init (l.60-75), `syncSleepClock` (l.371-382), the daily-reload block (l.389-499: `dailyReloadBlocker`, `reloadMustWait`, `requestReloadAfterWake`, `runDailyReload`, `dailyReloadTick`), `evaluateSleep` (l.563-597), `manualWake` and the pointermove handler (l.622-650). Also tests/e2e/lib.mjs l.1-120 (port and server setup).
- Scratch: `mktemp -d` -> /tmp/tmp.6H0fIgh2dF, populated with `git archive 283f9f1 | tar -x`. That is a copy, not a worktree, so the live tree and index were not touched. I checked afterwards that `git write-tree` in /home/user/wt-pi-stability still gives 283f9f1. All scratch directories have been removed.
- `E2E_PORT=23831 E2E_MOCK_PORT=23832 npm run test:e2e -- pi-stability`, run twice: both exit 0 with 29 ok and PASS. 9d logged 11239 ms and then 10060 ms. Its bound is >= 8000, so the variation does not affect the result.
- Mutations, each in its own copy (/tmp/tmp.7se78SlSzd and /tmp/tmp.NzasN3Zqjp, ports 23833-23840). Each copy was reset from the clean tree between mutations and then deleted:
  - M1: removed the `manualWakeUntil` line from `reloadMustWait`. 9f fails: "a manual wake is running: the tab navigated 2 !== 1" (spec:482).
  - M2: removed `bootAt += jump;`. 9g fails: "the page had been up for two minutes: the tab navigated 2 !== 1" (spec:507).
  - M3: removed the crossfade wait. 9d fails: "the fade is running at 04:00:01: the tab navigated".
  - M4: `state.busy || state.tvWaking` changed to `state.busy`. 9e fails: "reloaded 3043 ms after power on, before the TV had finished waking (TV_WAKE_MS 4000)".

## Strengths

- Each of the four new cases fails when the code it guards is removed (M1-M4), and each passes on the clean tree in two runs.
- The `bootAt` shift sits in the one function that already shifts `lastPlaybackAt` and `manualWakeUntil`. `requestReloadAfterWake` is only reached from `evaluateSleep`, which calls `syncSleepClock()` first (l.564 before l.578). So `bootAt` has always taken in any clock step before it is read.
  - Forward and backward steps both keep "now - bootAt" equal to real uptime.
  - Repeated steps add up correctly, because `sleepClock` is re-based on every call.
  - Steps while asleep are caught too, because `evaluateSleep` runs every second whether the screen is asleep or not.
- `let bootAt` has no temporal-dead-zone risk. No top-level code before l.393 calls `syncSleepClock`, `evaluateSleep` or `manualWake`; I checked this with awk over l.1-392.
- The manual-wake wait cannot leave the reload in a bad state:
  - `reloadMustWait` only returns early. `reloadPending` stays 'scheduled', and the `||=` in `requestReloadAfterWake` and `dailyReloadTick` cannot overwrite or duplicate it.
  - Once `manualWakeUntil` passes, the next tick runs the reload as usual, with the probe and the 10-minute gap guard.
  - An expired `manualWakeUntil` is a past timestamp, so the check is then false.
  - The 0 initial value is also handled, since `Date.now() < 0` is false.

## Critical

None.

## Important

None.

## Minor

None that I could reproduce.

## Declined to judge

- **Postponement while input keeps arriving.** The pointermove handler (l.641-648) extends `manualWakeUntil` every time the pointer moves during a manual wake. A noisy touch panel or mouse could therefore hold off the reload indefinitely. It would hold the screen awake indefinitely as well, so the reload only waits while the display is actually being kept awake, and it runs once the input stops. Whether a reload should ever override sustained input is a product question. Not reproduced.
- **A step of one tick or less between the clock and the reload.** `dailyReloadTick` (l.482) does not call `syncSleepClock()`, and its interval is registered before `evaluateSleep`'s. Suppose the clock steps forward by more than the time left on a manual wake, and in the same tick a reload becomes pending. The first `reloadMustWait` could then read an unshifted `manualWakeUntil` and let the reload through. The probe is async and `reloadMustWait` is checked again after it (l.471), by which time `evaluateSleep` will normally have shifted the value. I did not reproduce this, and the window is about a second. Calling `syncSleepClock()` at the top of `dailyReloadTick` would close it if the conductor wants that.
- **System suspend.** On Linux, Chromium's `performance.now()` does not advance during system suspend, so a suspend reads as a forward step and moves `bootAt` (and, as before, `lastPlaybackAt`) forward. The fallback "page load age" would then leave out suspended time. A kiosk Pi does not normally suspend, and this is the same model the existing timestamps already use. Outside the delta.
- **No wake reload when the schedule ends during a manual wake.** In that case the screen never goes from asleep to awake, so `requestReloadAfterWake` is not called. This comes from existing K39 behaviour, not from this delta.

## Recommendations

- Optional: call `syncSleepClock()` at the start of `dailyReloadTick`, so every wall-clock read in the reload path sees timestamps that have already been shifted.

## Assessment

Both fixes do what the delta claims. I found no way for the manual-wake wait to postpone a reload after the input stops, or to leave it stuck pending. The `bootAt` shift behaves correctly for forward, backward, repeated and while-asleep steps. The new tests were stable across two runs, and each one failed when I removed the code it guards.

Files read: delta of js/main.js and tests/e2e/pi-stability.spec.mjs (82fd6a1..283f9f1); 283f9f1:js/main.js l.60-75, 340-500, 550-660 plus greps; tests/e2e/lib.mjs (grep and l.1-120); package.json (test:e2e script).

**Verdict:** APPROVE
