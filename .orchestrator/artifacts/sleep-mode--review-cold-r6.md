produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: sleep-mode · round: r6 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: sleep-mode-review-cold-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T02:25:32Z · Method: cold code review · Scope: sleep-mode, r6, base e764aee0c4077f8c43fc4b16366724b42cfdfce6, tree 2df5e2db1955a0bd80313d915c14cc131d363915 (staged index, `git write-tree`)

## Strengths
- `decideSleep` is pure and small. DST is handled correctly because the schedule uses local `getHours()` through `inWindow` and idle time uses epoch ms. An implausible clock blocks the schedule but not idle sleep.
- No images are fetched while asleep. The `tick` guard (main.js `state.asleep ? null : decide`) and the `handleFailure` cache-rotation guard both work, and both are tested with teeth (mutations below).
- Each tick sends one `/status/sessions` request: `pollPlayback` hands its sessions to `decide({ sessions })`. Unit tests and e2e case 15 cover this.
- Poll failures are handled well. A blip of 1-2 failures does not black out a movie, an outage sleeps after 3 failures, and polling while asleep is capped at the poll rate instead of the 5 min backoff (cases 11b/11d/14).
- Wake-tap handling is careful. Capture-phase `pointerdown`/`keydown` handling plus the 800 ms click swallow stops blind double and triple taps reaching Pause. Input aimed at an open dialog is never swallowed (cases 10, 12, 12b).
- The e2e suite is broad and fast: 33 checks across the cases, run 4 at a time.

### Critical
None.

### Important
1. **The clock-step correction double-shifts any timestamp written between the step and the next `evaluateSleep()` (code-bug).**
   - **Where:** js/main.js:206, :259, :272 and :349 write `Date.now()`-based values. The correction is at :217-222, which adds `jump` to `lastPlaybackAt`/`manualWakeUntil`.
   - **The bug:** these values are written on the new clock. The next `evaluateSleep()` (called immediately after at :207, :265 and :350) then still sees the step and shifts them by it a second time.
   - **Evidence:** I ran an ad-hoc Playwright probe in the scratch copy. It uses `page.clock.setSystemTime` (moves Date, not performance.now) and then sends input before the 1 s interval fires.
     - P2: asleep in the window at 03:00. Step +1 h, press a key, run 3 min. Result: `asleep = false` (expected true), so the manual wake lasted about 1 h.
     - P1: 1970 clock, idle 1 h. Step to 2026, press `o` (rotate, so `applySettings`), run 2 h. Result: `asleep = false` (expected true), so `lastPlaybackAt` landed about 56 years in the future.
     - Controls: the same probes with `runFor(2000)` before the input both gave `asleep = true`.
   - **Why it matters:** on a Pi with no RTC, the 1970-to-now NTP step often lands while the kiosk is booting. `boot()` awaits `display.apply` inside `applySettings` (:337-349) during that period. A playback poll (:206) or a touch in that same window has the same effect.
     - Idle sleep is then disabled until the next detected playback or save.
     - A manual wake then holds the schedule off until the next touch, which can mean a whole night of a lit screen.
     - Case 9b does not catch this because its step is absorbed before any write.
   - **Fix:** absorb the step before writing. Split the jump detection out of `evaluateSleep` into `syncSleepClock()` and call it before every `Date.now()` write at those four sites. Alternatively, keep `lastPlaybackAt`/`manualWakeUntil` on `performance.now()`. Add the probe above as an e2e case.

### Minor
1. **Sessions are polled when nothing can use the answer (code-bug, request efficiency).**
   - `sleepWatching` (:177) is true for `sleepEnabled` alone.
   - With the schedule on, `wakeOnPlayback: false` and `idleSleepHours: 0`, `intervalMs` (:63) still drops to the poll rate while awake. While asleep, `/status/sessions` is still requested every `nowPlayingPollSeconds` all night.
   - In that configuration the result cannot change the decision.
   - Fix: `(s.sleepEnabled && s.wakeOnPlayback) || s.idleSleepHours > 0`. Optionally, also skip the poll while asleep when `!wakeOnPlayback`.
2. **Pause freezes the sleep inputs (spec-gap).** This is from reading the code; I did not run it.
   - `pollPlayback` runs only from `tick`. `schedule` is a no-op while paused (:69), and `evaluateSleep` skips `tick` while paused (:241).
   - So `state.playing` and `lastPlaybackAt` keep their values from the moment Pause was pressed.
   - If you pause during a movie with `wakeOnPlayback` on, `playingNow` stays true. The schedule then never blacks the screen while paused, even after the movie ends.
   - Decide whether Pause should keep the playback poll running, or clear `playing` on pause.
3. **A tick already in flight can still fetch and draw an image after the veil comes up (code-bug, minor).**
   - If the 1 s timer puts the display to sleep while `decide`/`fetchImage` is already awaiting (:117-129), that one fetch completes and is drawn under the veil.
   - It is harmless visually, but it breaks "no image fetched while asleep" at the moment sleep starts.
   - Fix: re-check `state.asleep` after `decide` and before `fetchImage`.
4. **Assistive tech is not told the display is asleep (spec-gap).**
   - The veil is `aria-hidden`, `#app` is inert, and the status pill and toast are `visibility: hidden`.
   - Nothing announces "asleep". Focus also falls to `body` on sleep and is not restored on wake.
   - This is acceptable for a kiosk. A visually-hidden live-region message ("Display asleep, press any key") would close the gap.

## Declined to judge
- **System suspend:** `performance.now()` may not advance during system suspend on some platforms. A suspend would then be read as a clock step, and the idle timer would not count the time the system was suspended. I did not verify this, and a kiosk holding a wake lock should not suspend.
- **Settings save resets the idle clock:** the save path (and pin/rotate, via `applySettings`) resets the idle timer. This is a deliberate product choice, documented in a comment.
- **Spring-forward:** a window inside the skipped hour never fires that night. This is the documented behaviour of `inWindow`, not part of this diff.
- **Shared tokens and Diagnostics:** with a shared or managed token that `/status/sessions` refuses, idle sleep blacks the screen N hours after boot or save and playback can never wake it. The awake failure is only logged once, and Diagnostics has no "playback check failing" row. This is a product question.

## Recommendations
Fix Important 1 and add the probe as a regression case. Minor 1 is a one-line change. Minor 2 needs a product decision.

## Assessment
The design is sound and the suite is strong and has teeth. The one defect worth blocking on is in the clock-step machinery, the exact failure it exists to prevent. It is reproducible on demand.

## What I read and ran
- **Files read:** `git diff --cached` (all 9 files), js/main.js (lines 60-160, 310-400, 460-600), js/schedule.js, js/settings.js (sleep keys via grep), index.html (lines 30-62, dialog positions), tests/e2e/sleep.spec.mjs (lines 1-80, 222-248, 331-357, 695-719 and the case list), tests/e2e/lib.mjs (header), tests/e2e/run.mjs (grep), package.json.
- **Scratch copy:** I exported the staged index with `git checkout-index -a --prefix=<mktemp -d>/` to /tmp/tmp.zT1p36oUPv, and removed it afterwards. `git status` in the live tree was unchanged.
- **Unit tests:** `node --test tests/*.test.js` gave 108 pass, 0 fail.
- **E2E suite:** `E2E_PORT=19140 E2E_MOCK_PORT=19141 node tests/e2e/run.mjs sleep` gave PASS (all 33 checks ok).
- **Mutations, each reverted with `diff` confirming:**
  - Dropped the `state.asleep` guard in `tick`. Case 1-2 failed: "no image request while asleep".
  - Dropped `!state.asleep` in `handleFailure`. Case 17 failed: "nothing was drawn ... while asleep".
- **Probe:** an ad-hoc tests/e2e/probe.spec.mjs in the scratch copy (ports 19150-19153). P1 and P2 failed as described above, and the controls passed.
