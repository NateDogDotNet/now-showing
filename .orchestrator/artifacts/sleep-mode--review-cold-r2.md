produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: sleep-mode · round: r2 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: sleep-mode-review-cold-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T01:12:00Z · Method: cold diff review · Scope: sleep-mode, r2, base e764aee0c4077f8c43fc4b16366724b42cfdfce6, tree 77062d2 (index of /home/user/wt-sleep-mode, `git write-tree` = 77062d2aca11676f4f4026a462b8c4cb7ea43e98)

## What I ran and where

All runs were in a scratch export of the index: `mktemp -d` -> `/tmp/tmp.R5orcoDRBj`, `git checkout-index -a --prefix=/tmp/tmp.R5orcoDRBj/src/`. I removed the directory afterwards. The live worktree was not modified: `git status` and `git write-tree` are unchanged (77062d2).

- `node --test tests/*.test.js`: 104/104 pass.
- `E2E_PORT=18961 E2E_MOCK_PORT=18962 node tests/e2e/run.mjs sleep`: PASS, all 19 checks ok.
- A probe spec I wrote myself (scratch only, `tests/e2e/probe.spec.mjs`, ports 18963/18964). Results are under Important 1 and 2.
- Mutants, each in its own scratch copy, ports 18970-18975, running the sleep spec:
  - m1: dropped `&& !state.asleep` from the cached-fallback guard in `handleFailure` (main.js:160). **Survives (PASS).**
  - m2: disabled the clock-jump compensation (`if (Math.abs(jump) > 5000)` -> `if (false)`, main.js:195). Killed: "a clock jump is not 56 years of idleness".
  - m5: removed `if (state.playing) state.lastPlaybackAt = Date.now()` (main.js:183). Killed: "awake right after playback ends".

  The mutants lived in their own copies and were deleted with the scratch dir. Nothing needs reverting in the live tree.

## Strengths

- `decideSleep` is pure and small. Its precedence is clear: the schedule beats idle for the label, playing+wakeOnPlayback beats sleep, and a manual wake beats sleep. The unit tests cover the window boundaries, a window that crosses midnight, an empty window, the exact idle threshold, `clockOk:false` for the schedule but not idle, and the 60 s manual-wake boundary.
- The clock-step handling compares wall time with monotonic time and shifts `lastPlaybackAt` and `manualWakeUntil` by the gap. It is correct for NTP arriving at 1970 and is tested end to end (m2 is killed). DST cannot trip it, because `Date.now()` is UTC and only `inWindow` uses local time.
- No poster fetches while asleep. `tick` skips `engine.decide` (main.js:116) and `handleFailure` skips the cached fallback. The e2e checks for zero `/photo/:/transcode` requests and zero active poster layers while asleep, and that sessions are still polled.
- The wake lock is never touched (asserted as held=1 with releases=0 across sleep/wake cycles). Re-entrancy is handled: `evaluateSleep` only calls `tick()` when `!state.busy`, and inside a tick the post-poll `state.asleep` check picks up a wake.
- The wake tap is handled carefully: capture-phase `pointerdown`/`keydown` with stopPropagation, plus a one-shot click swallow for touch. Tests 6/6b exercise both a mouse and a real touch tap, including that the second tap works.

## Issues

### Critical

None.

### Important

1. **When the sleep feature is on, any failure of `/status/sessions` stops poster rotation entirely, even while awake.** (code-bug)
   - Location: main.js:114 (`await pollPlayback()` runs before `engine.decide`) and main.js:177-185.
   - When `sleepWatching(s)` is true, every awake tick calls `engine.playing()` -> `client.sessions()` first. If that throws, the whole tick goes to `handleFailure`. A 401/403 is `kind:'auth'`, which is fatal: no cached fallback, a 5-minute retry and "Can't reach Plex". `/status/sessions` is the one endpoint that commonly fails while library/image endpoints work: it needs an owner/admin token, and shared/managed users get 401/403. Before this change, users with `showNowPlaying` off never called it.
   - Evidence from the probe, with `showNowPlaying:false` and sessions routed to 403:
     ```
     P1 idleSleepHours=0 sessions=403: posters shown=1 status=""
     P1 idleSleepHours=1 sessions=403: posters shown=0 status="Can't reach Plex · retrying in 4m 51s"
     ```
   - Why it matters: turning on idle sleep or a schedule (an "off-hours" feature) breaks the main poster display during on-hours. A transient sessions error also now drops a rotation that would otherwise have succeeded.
   - Fix: while awake, have `pollPlayback` catch its own error, set `playing=false`, log a warning and let `decide()` proceed. Rethrow only while asleep, or not at all. Add an e2e that routes sessions to 403 with idle sleep on and asserts that a poster appears.

2. **A manual wake does not extend while the user is active, and the input after re-sleep is eaten even by the visible Settings dialog.** (code-bug for the swallowed dialog input; spec-gap for the non-extending minute)
   - Location: main.js:221-243. `manualWake` returns early when awake, so activity during the wake minute never pushes `manualWakeUntil` out. The capture listeners swallow the first pointerdown/click/keydown after re-sleep regardless of target, including the top-layer `<dialog>` that the veil does not cover (css/app.css comment: "over everything except top-layer dialogs").
   - Evidence from the probe: wake, open Settings, keep moving the mouse for 70 simulated seconds.
     ```
     P2 after 70 s of activity in Settings: asleep=true settingsOpen=true
     P2 click on a Settings checkbox while veil is behind the dialog: before=true after=true asleep=false
     ```
     The click on a visible checkbox did nothing. The same applies to the first Escape or keystroke in a form field.
   - Why it matters: someone who wakes the kiosk at night to change settings finds the screen goes black behind them after 60 s, and their next click or keystroke silently fails. The same happens when a schedule window opens while Settings or Diagnostics is open.
   - Fix:
     - (a) Do not swallow events whose target is inside an open `dialog` (or skip sleep entirely while a sheet is open).
     - (b) Refresh `manualWakeUntil` on pointer/key activity while `sleepWhy === 'manual wake'`. Whether the minute should slide is a product call (spec-gap); (a) is a bug either way.

### Minor

1. **No test covers the "no cached poster while asleep" guard.** (code-bug, test gap) Mutant m1 removes `&& !state.asleep` at main.js:160 and the whole sleep spec still passes. Test 7 starts offline with an empty cache, so `cache.random` returns null either way. Without the guard, a cached poster is drawn under the veil, and `engine.shown` and `lastReason` are updated while asleep. Fix: seed the cache (one awake poster first), then go offline inside the window and assert no `.poster-layer.active` change and an unchanged `Reason`.

2. **Sessions are requested twice per awake tick when `showNowPlaying` and sleep are both on.** (code-bug, efficiency) `pollPlayback` calls `client.sessions()` (main.js:182) and `decide()` calls it again (engine.js:71). That doubles load on the Plex server at the now-playing poll rate. Fix: have `decide` accept the already-fetched sessions, or cache them for the tick.

3. **`evaluateSleep` calls `tick()` even while paused.** (code-bug) main.js:216 ignores `state.paused`. Waking from sleep, or a manual wake, while auto-refresh is paused runs `decide()` and can change the poster, which pause otherwise prevents. Conversely, while paused and asleep `schedule()` returns early (main.js:67), so wake-on-playback never fires. Fix: guard with `!state.paused`, and decide whether paused should still poll sessions while asleep.

4. **The idle clock only advances while sleep is watching.** (spec-gap) `lastPlaybackAt` starts at page load (main.js:39) and is updated only when `sleepWatching` is true. Saving `idleSleepHours>0` more than N hours after load runs `evaluateSleep()` in `applySettings` (main.js:308) before any poll, so the screen goes black at once. The first poll lifts it if something is playing. This is a brief black flash, or a black screen when playback happened unobserved earlier. Fix: when the setting changes from off to on, reset `lastPlaybackAt = Date.now()`, or poll first.

5. **The veil has no accessible semantics.** (code-bug, a11y) `#sleep-veil` (index.html) has no role, label or live announcement. The page beneath is not `inert`/`aria-hidden`, so assistive tech still exposes the poster and the stale focus target. Only `.controls/.status-pill/.toast` are hidden. Fix: when asleep, set `inert` (or `aria-hidden="true"`) on the main content, and give the veil `role="status"`/`aria-label="Display asleep; press any key or tap to wake"`, or announce the change through the existing toast live region.

## Declined to judge

- With `wakeOnPlayback:false` and idle sleep on, playback still lifts idle sleep, because playback resets the idle clock (`decideSleep` returns `why:''`). This is a defensible reading of "N hours without playback". Whether the checkbox should also govern idle sleep is a product question.
- On Linux Chrome, `performance.now()` stops during OS suspend, so a suspend reads as a clock jump and is not counted as idle time. A kiosk holding a wake lock rarely suspends. Outside what the diff can control.
- The 800 ms click-swallow window and the 5 s jump threshold are tuning choices. They look reasonable, and I did not try to find better values.
- Whether `nowPlayingPollSeconds` should also drive the asleep poll rate (it does, via `intervalMs`) is a product/load trade-off.

## Recommendations

Fix Important 1 first: an error-tolerant awake poll is about a 5-line change, plus an e2e with sessions routed to 403. Then exempt open dialogs from the wake swallow (Important 2a) and add the cached-fallback test (Minor 1). The other Minors can follow.

## Assessment

The state machine is correct for clock steps, DST, an unset clock, schedule boundaries and settings saved while asleep. The no-fetch-while-asleep property holds, and the e2e has real teeth (2 of 3 mutants killed). Two robustness defects remain. First, the new sessions poll makes poster rotation depend on an endpoint that commonly fails for non-owner tokens (demonstrated: 0 posters vs 1). Second, the wake-tap swallowing eats input to the visible Settings dialog after a non-extending 60 s wake (demonstrated). Both are fixable locally.

Files read: `git diff --cached` (css/app.css, index.html, js/engine.js, js/main.js, js/sleep.js, sw.js, tests/sleep.test.js, tests/engine.test.js, tests/e2e/sleep.spec.mjs); js/main.js (full); js/engine.js (full); js/schedule.js (full); js/settings.js (grep for sleep keys); js/settings-ui.js (grep); js/plex.js (grep: PlexError, sessions, pickNowPlaying); css/app.css (grep z-index); tests/e2e/run.mjs (head); tests/e2e/lib.mjs (grep); scripts/mock-plex.mjs (grep); scripts/serve.mjs (grep); package.json.

**Verdict:** CHANGES REQUESTED
