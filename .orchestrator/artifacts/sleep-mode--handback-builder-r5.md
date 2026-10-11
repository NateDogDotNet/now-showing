produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: sleep-mode · round: r5
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/sleep.spec.mjs (both staged in /home/user/wt-sleep-mode-r5, not committed)
criteria:
- 1 `test -f tests/sleep.test.js && test -f tests/engine.test.js && node --test tests/sleep.test.js tests/engine.test.js` — met (31 pass, 0 fail, exit 0)
- 2 `npm test` — met (108 pass, 0 fail)
- 3 `npm run test:e2e -- sleep` (E2E_PORT=18920 E2E_MOCK_PORT=18921) — met (PASS sleep, 31 ok lines)
- 4 `node scripts/check-precache.mjs` — met (25 precached files OK)
- 5 `grep -q 'id="sleep-veil"' index.html && grep -q 'name="sleepEnabled"' index.html` — met (exit 0)
- K11 amended (outage mid-movie -> veil within ~1.5 min, lock held, releases unchanged) — met (case 11d: veil up 61-62 s into the outage)
- one failed poll mid-movie does not raise the veil — met (case 11b, changed from 3 failed polls to 1)
- lint with round--eslint-r1e.config.mjs on js/main.js and tests/e2e/sleep.spec.mjs — met (exit 0)
deviations: case 11b was changed from "three failed polls" to "one failed poll" (brief asks for the one-poll case; three failed 5 s polls sit exactly on the 3 x 5 s = 15 s expiry boundary, which is the new intended behaviour, so that old case no longer describes a keep-awake). No mutation records written. js/sleep.js and unit tests untouched.
questions: none (observation below)

Agent: sleep-mode-builder-r5 · dispatched: 2026-10-09T02:02:03Z

## Change (js/main.js)
- New `state.playingPolledAt` = `performance.now()` stamped on every SUCCESSFUL playback poll (next to `state.playing`). Monotonic clock, so a wall-clock jump neither ages nor extends it; the existing jump shift of `lastPlaybackAt` is unchanged.
- New `playingNow()` = `state.playing && performance.now() - state.playingPolledAt <= 3 * nowPlayingPollSeconds * 1000`; `evaluateSleep()` passes it to `decideSleep` instead of `state.playing`. It is re-evaluated by the existing 1 s `evaluateSleep` interval, so expiry does not depend on poll timing (important: awake with Plex down the retry follows the 5 s..5 min backoff, not the poll rate).
- A failed poll still does not touch `lastPlaybackAt`, is not fatal awake, and rotation/retry paths are unchanged. js/sleep.js is unchanged.

## Test-first (r3 code, new/changed cases only: `E2E_SLEEP_ONLY='^11' npm run test:e2e -- sleep`)
```
  ok  every poll failing (HTTP 500) for 61 min: idle sleep still starts (a failed poll is not playback)
  ok  one failed poll mid-playback: veil stays down; it comes up after the playback really ends
  ok  sessions 403 (idle sleep on, now playing off): 5 posters shown in 48 s, no error shown
case 11d outage mid-playback: veil within ~1.5 min, wake lock untouched failed:
AssertionError [ERR_ASSERTION]: condition not met within 95000 simulated ms
    at advanceUntil (.../tests/e2e/sleep.spec.mjs:50:10)
FAIL sleep
```
## After the change (same command)
```
  ok  one failed poll mid-playback: veil stays down; it comes up after the playback really ends
  ok  Plex down mid-movie: veil up 61 s into the outage, wake lock held === 1, releases unchanged; wakes when Plex is back
PASS sleep
```
Case 11d (spec): nowPlayingPollSeconds 20, window active, `mock.play('3')`, held === 1; `mock.down()`; awake at 25 s; veil within 90 s; stays asleep 30 s more; held === 1 and releases unchanged; `mock.up()` with movie still playing wakes it.

## Full gate run (worktree /home/user/wt-sleep-mode-r5)
```
ac1: # tests 31 / # pass 31 / # fail 0
ac2 (npm test): # tests 108 / # pass 108 / # fail 0
ac4: 25 precached files OK
ac5: exit 0
e2e sleep: ... ok  Plex down mid-movie: veil up 62 s into the outage, wake lock held === 1, releases unchanged; wakes when Plex is back ... PASS sleep
lint (round--eslint-r1e.config.mjs): exit 0
```
`prettier --check` warns on js/main.js and tests/e2e/sleep.spec.mjs, but also on the r3 version of js/main.js (the repo has no prettier config); I did not reformat.

## Observation for the conductor (not acted on)
While Pause is on, polling stops, so with sleep watching and a movie playing, the trusted `playing` now lapses 3 poll periods after Pause and the display can sleep inside the window (before, it stayed awake on the stale true). Playback cannot wake a paused display (Q-sm2), only touch/key. If that is unwanted, the fix is to not age `playing` while `state.paused`; I did not add it because the plan does not name it.
