produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: sleep-mode · round: r4
status: complete        failure_class: n/a
paths: /home/user/wt-sleep-mode-r4/js/main.js, /home/user/wt-sleep-mode-r4/tests/e2e/sleep.spec.mjs (both staged; the other staged paths in that tree are unchanged from the r3 tree 8159801)
criteria:
- K11 amended (3 consecutive failed polls, then playing=false; failed poll never refreshes lastPlaybackAt, never fatal, rotation continues): met. `E2E_SLEEP_ONLY='^11[bd]' node tests/e2e/run.mjs sleep` PASS; case 11 (sessions 403 does not stop rotation) and 11c (HTTP 500 never counts as playback) still pass.
- Criterion 1 (`node --test tests/sleep.test.js tests/engine.test.js`): met, 31 pass, 0 fail.
- Criterion 2 (`npm test`): met, 108 pass, 0 fail.
- Criterion 3 (`E2E_PORT=18910 E2E_MOCK_PORT=18911 npm run test:e2e -- sleep`): met, PASS sleep, exit 0.
- Criterion 4 (`node scripts/check-precache.mjs`): met, "25 precached files OK", exit 0.
- Criterion 5 (grep sleep-veil / sleepEnabled in index.html): met, exit 0.
- Lint (`npx eslint -c .../round--eslint-r1e.config.mjs js/main.js tests/e2e/sleep.spec.mjs`): met, no output, exit 0.
deviations: (1) The old case 11b (three failed polls keep the display awake) contradicts the amended ruling, so I rewrote it: one failed poll, then successful polls, then two failed in a row never raise the veil, not even for a moment. It runs with showNowPlaying off so one aborted /status/sessions request is exactly one failed poll (with it on, decide() re-requests sessions in the same tick). (2) New case 11d is the outage case. It uses showNowPlaying off and nowPlayingPollSeconds 20 (the default) so the timing is the one the ruling describes. (3) No evaluateSleep() call in the failure path: the existing 1 s timer applies the change. Prettier (no project config) warns on both files, and also on the r3 staged versions; not touched.
questions: none

Agent: sleep-mode-builder-r4 · dispatched: 2026-10-09T02:02:03Z

## Change (js/main.js, +6/-3 net)
- `MAX_POLL_FAILURES = 3` and `state.pollFailures` (consecutive failed playback polls).
- pollPlayback catch block: `if (++state.pollFailures >= MAX_POLL_FAILURES) state.playing = false;` before the existing asleep-throws / awake-logs-and-continues logic.
- Reset to 0 after any successful poll, and when sleep does not need polling (the early-return branch).
- `lastPlaybackAt` is still only set on a successful poll that sees playback. The doc comment on pollPlayback is updated.

## Tests first (RED on the r3 code)
Before the main.js change, with the new 11d in place:

```
$ E2E_PORT=18910 E2E_MOCK_PORT=18911 E2E_SLEEP_ONLY='^11' node tests/e2e/run.mjs sleep
  ok  one failed poll, then two in a row, mid-playback: veil stays down; it comes up after the playback really ends
case 11d Plex outage mid-movie: the veil comes up within ~1.5 min failed:
AssertionError [ERR_ASSERTION]: condition not met within 120000 simulated ms
FAIL sleep
```

The final 11d (adds an exact poll count) was not re-run on pristine r3 code. The "r3 behaviour" mutation below (counter never trips) has the same effect and fails it. The first version of 11b (error counted by request) passed even with the guard broken: I found that by mutation, then rewrote it (see deviations).

## GREEN
```
$ E2E_PORT=18910 E2E_MOCK_PORT=18911 E2E_SLEEP_ONLY='^11[bd]' node tests/e2e/run.mjs sleep
  ok  Plex down mid-movie (poll 20 s): veil up 61412 ms after the outage began, lock held (1, releases 0); the movie wakes it again once Plex is back
  ok  one failed poll, then two in a row, mid-playback: veil stays down; it comes up after the playback really ends
PASS sleep
```
11d asserts: veil up within 90 simulated s of the outage starting (took about 61 s at the 20 s poll); exactly 3 awake polls between the outage start and the veil (the poll that going to sleep triggers is made asleep and not counted); `held === 1` and `releases` unchanged; still asleep 30 s later; after `mock.up()` + `mock.play()` the display wakes again.

## Mutations (each in a mktemp -d copy of the worktree; nothing written to .orchestrator/artifacts)
```
remove the reset after a successful poll       -> case 11b failed (FAIL sleep)
MAX_POLL_FAILURES 3 -> 4                       -> case 11d failed (FAIL sleep)
MAX_POLL_FAILURES 3 -> 2                       -> case 11b and 11d failed (FAIL sleep)
counter never trips (r3 behaviour)             -> case 11d failed (FAIL sleep)
```

## Criteria output tails
```
eslint exit 0
C1  # tests 31  # pass 31  # fail 0
C2  # tests 108 # pass 108 # fail 0
C4  25 precached files OK   exit 0
C5  exit 0
C3  ... ok  idle sleep: playback past the original deadline; awake after it stops, asleep one idle hour after the last playback
    PASS sleep   exit 0
```

## Notes for the conductor
- Observed behaviour worth knowing: when the third failed poll puts the display to sleep, evaluateSleep() calls tick() at once, so there is one immediate extra poll. If Plex is back, the veil lifts again within that tick, so a short flicker is possible on a recovery that lands exactly then. The e2e 11b watches the body class with a MutationObserver for this reason.
- Staged only: js/main.js and tests/e2e/sleep.spec.mjs changed this round; nothing committed.
