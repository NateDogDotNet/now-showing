produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: default · phase: sleep-mode · round: r2 · mode: anchored
**Verdict:** CHANGES REQUESTED

Reviewer: sleep-mode-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T01:12:00Z · Method: anchored full review (risk:high, ui) · Scope: sleep-mode, r2, base e764aee, tree 77062d2 (staged index of /home/user/wt-sleep-mode)

Criterion 6 attacks: FAIL
UI screenshots: PASS

## What I read and ran

Read: the `sleep-mode` section of docs/integration-plan.md (lines 299-317); R-PROT-1 in docs/spec.md:174-177; D4 in docs/decisions.md:10; .orchestrator/phases/sleep-mode.md (K7, K9); Q-sm1..3 in .orchestrator/questions.md:38-40; `git diff --cached` (all 9 files); js/main.js (tick/schedule/backoff/wake lock, lines 55-170 and 460-520); js/schedule.js `inWindow`/`isPlausibleClock`; js/settings-ui.js (read/write/preview); tests/e2e/lib.mjs; tests/e2e/sleep.spec.mjs.

Ran (none of it in the live worktree): I exported the staged index into `mktemp -d` → `/tmp/claude-0/-home-user/754644a7-1380-52e8-802b-a7514b405070/scratchpad/rv.JGLW/t` (`git checkout-index -a --prefix=`), and checked that the live index tree was still 77062d2 before and after. In the scratch copy only, I added a `timezoneId` passthrough to lib.mjs (for the DST attack). Ports were 18910-18963.
- `node tests/e2e/run.mjs sleep`: PASS (19 checks).
- `npm test`: 104/104 pass. `node scripts/check-precache.mjs`: OK.
- Scratch specs `attack.spec.mjs` (A1-A10), `attack2.spec.mjs` (A1b, A6b), `shots.spec.mjs` and `night.spec.mjs`, all through `withApp`, `mock.play/stop/down/up` and `page.clock`.
- I also ran a one-tap check on the base commit e764aee (`git archive` into the same scratch dir) to isolate behaviour that existed before this change.
- The scratch dir has been removed.

## Strengths

- `decideSleep` is pure and small, and the unit tests in js/sleep.js:21-33 cover every case in criterion 1.
- The wake lock is never touched by sleep (D4). In every scenario I ran, `__wakeLock.held === 1` and `releases === 0`: offline start, a 10-minute Plex outage, DST spring-forward, clock set backwards and forwards, settings saved while asleep, rapid taps, a dialog open when the manual wake expires, and a simulated 4.5-hour night (K7 reading).
- Clock-step compensation (main.js `evaluateSleep`: wall clock vs `performance.now()`) works. In A7, a manual wake followed by a +2.5 h clock jump still slept again after 59.9 s. The 1970 boot case and the NTP jump are covered by the builder's spec.
- DST (America/New_York, 2026-03-08): asleep at 01:01 EST, still asleep at 03:01 EDT across the spring-forward gap, awake at 07:01 EDT (A8).
- Moving the window or saving settings while asleep is re-evaluated at once through `applySettings → evaluateSleep` (A4). Playback after that wakes the display in about 3 s.
- `showNowPlaying:false` still wakes the display on playback (A9), as the plan's note requires.
- Visually, the veil is perfect (see the UI section).

## Issues

### Critical

(none)

### Important

1. **A double tap on the black screen turns Pause on, and from then on playback never lifts the veil.** Class: **code-bug** (it fails criterion 6 as written: "a state where the veil stays up after playback starts"; see the note on classification).
   - Location: js/main.js `manualWake` and the click-swallow listener (the diff's `state.swallowClick = true; setTimeout(..., 800)` and the one-shot `if (!state.swallowClick) return; state.swallowClick = false;`). The generic `wake` handler at main.js:450/459 then reveals the controls.
   - Evidence: scratch `attack2.spec.mjs` A6b, touch taps at the Pause button's position while asleep, at 03:00 inside the window:
     ```
     A6b 2 taps: {"clicks":["pause"],...,"pressed":"true"}
     A6b 2 taps then sleep, play -> awake after -1      (never woke within 20 s)
     A6b 3 taps: ... "pressed":"false"   -> play wakes after 3102 ms
     A6b 4 taps: ... "pressed":"true"    -> play: awake after -1
     ```
     A6 (8 rapid taps) also ended with Pause on and playback unable to wake the display.
   - Mechanism: tap 1 wakes the display and its click is swallowed. Tap 2 arrives after the display is awake, so `manualWake` returns early. The app's normal `pointerdown` handler adds `.visible` to the controls (`pointer-events: auto`, css/app.css:138), and the click activates whatever control is under the finger. An odd number of further clicks leaves Pause on. Under Q-sm2, Pause stops all polling, so playback cannot wake the display until the window ends or someone taps again. Pause is not persisted, but it survives the window: the next evening the display keeps showing a stale poster and will not follow now-playing.
   - Why it matters: this is the risk:high failure criterion 6 asks about, and it is reached through the most natural gesture on a black screen, tapping again because nothing seemed to happen. The click-through on hidden controls already exists on the base commit (e764aee: one tap on hidden controls gives `pause pressed: true`), and the plan's note sends the first-tap rule to `touch-and-labels`. What is new is that sleep makes the tap blind, and Q-sm2 turns an accidental Pause into "playback cannot wake the display".
   - Note on classification: the route runs through behaviour that is deferred elsewhere (the first-tap rule) and a ruling already made (Q-sm2), so the conductor may prefer to file this as a spec-gap. My reading is that the phase's note ("it must not trigger the control under the finger") covers the wake gesture as the user performs it, and a double tap is one gesture.
   - Fix (phase-local, small): make the swallow time-based, not one-shot. For about 800 ms after the last `pointerdown` that began while asleep or inside a short grace period after the wake, swallow `click`, and stop the generic `wake` handler from adding `.visible`. Add an e2e double tap and triple tap over `[data-action="pause"]`, then assert that `aria-pressed` stays `false` and that `mock.play()` still wakes the display. Alternative (conductor's call, it reopens Q-sm2): keep a sessions-only poll while paused and asleep.

### Minor

1. **After a Plex outage, a playback wake can take up to 5 minutes.** Class: **spec-gap**.
   - Evidence: A1b. After a 3-minute outage, `mock.up(); mock.play()` woke the display after 163,956 simulated ms. After a 7-minute outage it took 240,678 ms. The poll timestamps show the backoff (`03:01:20 03:02:43 03:05:33 03:11:00`).
   - Why: main.js:47 `createBackoff({ baseMs: 5000, maxMs: 5 * 60 * 1000 })` applies while asleep as well. Plex's default maintenance window (server restarts and updates) falls inside a typical 01:00-07:00 sleep window. Criterion 3 measures only the steady state.
   - Fix: while asleep, cap the retry delay at a small multiple of `nowPlayingPollSeconds` (for example 30 s).
2. **One failed poll during a playing movie blacks the screen.** Class: **spec-gap**.
   - Evidence: A2. The movie started at 23:30 and is still playing at 01:02. A Plex blip put the veil up after 1,037 ms. When Plex came back the display was awake again after 4,136 ms, but a longer outage inherits Minor 1's backoff. Cause: `handleFailure` sets `state.playing = false` and then calls `evaluateSleep()`, by design ("do not hold the display awake on a stale answer").
   - Fix (product choice): require 2-3 consecutive failures, or a grace period of about `2 × nowPlayingPollSeconds`, before an error counts as "not playing".
3. **Turning on idle sleep can black the screen the moment Settings is saved.** Class: **spec-gap**.
   - Evidence: A3. The display was awake for 2 h with no playback and idle sleep off. Saving `idleSleepHours=1` turned it asleep 2 s later. `lastPlaybackAt` holds the boot time, and `pollPlayback` does not refresh it while sleep is not watching.
   - The person who just pressed Save sees the screen go black. The spec's wording ("N hours with no playback") is literally satisfied.
   - Fix: when `idleSleepHours` goes from 0 to a positive value, or when settings are saved by hand, set `lastPlaybackAt = Date.now()`.
4. **Waking is a hard cut from black to a full-brightness poster.** Class: **spec-gap** (no criterion covers transitions).
   - Evidence: the wake shots were taken 80 ms after the tap, and they match the +3 s shots pixel for pixel (`non-black px 743564` for both at 1920x1080). Going to sleep is also an instant cut, but dark-to-black is harmless.
   - At 3 am in a dark bedroom, the marquee bulbs go from black to fully lit in one frame.
   - Fix: give the veil an `opacity` transition of about 0.6-1 s (fading out on wake), and remove it under `prefers-reduced-motion`, like the existing rule at css/app.css:339.
5. **When awake and watching for sleep, every tick asks Plex for sessions twice.** Class: **code-bug** (efficiency only).
   - Evidence: the A1b poll log shows pairs (`03:05:44 03:05:44`, `03:11:00 03:11:00`). `tick()` calls `pollPlayback()` (`engine.playing()` → `client.sessions()`), and then `engine.decide()` fetches sessions again when `showNowPlaying` is on.
   - Fix: let `playing()` and `decide()` share one sessions result per tick.

## Criterion 6 attack log

| # | Attack | Result |
|---|---|---|
| A1 | Asleep, Plex down 10 min, then up + play | woke 1 s after play (lucky backoff phase); lock 1/0 |
| A1b | Same with 3-min and 7-min outages | woke after 164 s and 241 s (Minor 1) |
| A2 | Movie from before 01:00 still playing; Plex blip | veil up within 1 s of the blip, awake 4 s after Plex returns, asleep 5 s after the movie ends (Minor 2) |
| A3 | `idleSleepHours` 0→1 saved after 2 h without playback | asleep at once (Minor 3) |
| A4 | Window moved away while asleep (via manual wake + Save), then back over now | awake past 90 s; asleep again; play wakes in 3.1 s |
| A5 | Manual wake expires with Diagnostics open | veil up behind the dialog (Q-sm3, accepted). The first Escape only wakes and does not close the dialog. Play wakes in 3 ms. |
| A6/A6b | 2/3/4/8 rapid taps over Pause | an even tap count (2, 4, 8) turns Pause on, then **playback never wakes the display** (Important 1) |
| A7 | Clock set 03:00→12:00→04:00; manual wake then a +2.5 h jump | awake / asleep / asleep again 59.9 s after the wake |
| A8 | DST spring-forward, America/New_York | correct at 00:59, 01:01, 03:01 EDT and 07:01 EDT |
| A9 | `showNowPlaying:false`, play while asleep | woke in 1.0 s |
| A10 | Visibility hidden→visible while asleep | the existing keepAwake logic drops `held` to 0 while hidden and re-requests it to 1 on return (not part of sleep) |

Wake lock: `held === 1, releases === 0` in every visible state above.

## UI

Screenshots were captured at fake 01:00:00 after a poster had been shown at 00:59:40, at 1920x1080 and 1080x1920, at rotation 0 and at rotation 90 with `rotateUi:true`. They are saved as `/home/user/plex-poster-app/.orchestrator/artifacts/sleep-mode--shot-<size>[-rot90]-<asleep|wake|diagnostics>.png` (12 files).
- **Asleep:** 0 non-black pixels in all four asleep shots (PIL full-frame count, max channel 0). The veil is opaque edge to edge at both sizes and both rotations. The controls had been revealed just before 01:00, but they, the status pill and the title do not show through. Veil opacity sampled 1,1,1,1 from the moment `asleep` is set, so it never passes through a half-transparent frame.
- **Diagnostics while asleep:** the top-layer sheet sits above the veil (Q-sm3) and is readable. It shows `Sleep asleep (schedule)`, `Local time 1/5/2026, 1:00:01 AM` and `Wake lock held`. At rotation 90 it is rotated correctly with the rest of the UI. Recent events lists `Asleep (schedule)`.
- **After the manual-wake tap:** the previous poster appears at full brightness with no controls. It is a hard cut (Minor 4), not a flash of anything wrong.

**A real user's night** (defaults plus a 01:00-07:00 schedule; `night.spec.mjs`; lock 1/0 throughout):
1. 23:25: a poster is showing.
2. 23:30: the movie starts and its poster takes over within one poll.
3. 01:00: the movie is still playing, so the display stays awake.
4. About 01:40 the movie ends, and within one 20 s poll the screen goes black.
5. No image requests while asleep.
6. The 3 am bathroom tap (03:49 in the run): a fresh random poster appears at once, at full brightness, which is a bit glaring in a dark room. The tap opens nothing.
7. At +65 s it is black again.
8. If, half awake, they tap twice (or twice more), they have paused the app without knowing it: the next movie will not wake the display (Important 1).

The 07:00 window end was not reached in this run. A pre-existing timer outside the diff (main.js:517, `reg.update` on an undefined registration when the harness blocks service workers) threw at simulated +6 h. A8 and the builder's spec cover the window end.

## Declined to judge

- **Pause blocks playback wake (Q-sm2), dialogs above the veil (Q-sm3), playback always resetting the idle clock (Q-sm1):** ruled earlier (K9). Important 1 is raised only for the accidental route into Pause.
- **The first Escape with a dialog open only wakes the display** (A5): this follows the wake-only rule and Q-sm3. Whether dialogs should close on sleep belongs to `kiosk-and-pin`/`touch-and-labels`.
- **The first-tap click-through on hidden controls while awake** (base e764aee): this predates the change and is sent to `touch-and-labels` by the plan's note.
- **main.js:517 `reg.update` TypeError under a fake clock with service workers blocked:** outside the diff (a harness artefact).
- **A10, the wake lock released while the page is hidden:** this is the existing `keepAwake` visibility logic, not sleep. The stub showed `held` 0 with `releases` 0, an oddity of overriding `visibilityState`, which I did not chase.
- **Manual wake on a tap with no rotation due** shows the old poster and fetches nothing (R-PROT-1 says "on wake a poster is fetched at once"). In real use the rotation is due after any sleep longer than `rotateSeconds` (the night run fetched one), so I did not rule.
- **Wake lock behaviour on real Pi/labwc hardware:** a (verify) item for hardware validation.

## Recommendations

1. Fix Important 1 in this phase with a time-based click swallow, and add a double/triple-tap e2e check that asserts Pause stays off and `mock.play()` still wakes the display.
2. Take Minor 1 and Minor 2 together: cap the backoff while asleep and add a short failure grace period. They share the cause "Plex is unreliable while we sleep".
3. Minor 3 and Minor 4 are cheap one-liners and worth doing now. Minor 5 can wait.

## Assessment

The core contract holds. The veil is pure black edge to edge at every size and rotation, the wake lock stays held through every attack (D4, K7), playback wakes the display within one poll in the steady state, and clock steps, DST and settings changes are handled. One natural user action, a double tap on the black screen, still reaches a state where the veil stays up while playback runs, and that is exactly what criterion 6 asks the reviewer to find. The fix is small and local to `manualWake`.

**Verdict:** CHANGES REQUESTED
