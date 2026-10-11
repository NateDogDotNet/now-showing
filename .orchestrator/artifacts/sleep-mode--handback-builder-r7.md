produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: sleep-mode · round: r7
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/sleep.spec.mjs (both re-staged in /home/user/wt-sleep-mode, not committed; the other 7 staged files are unchanged this round)
criteria:
- 1 `node --test tests/sleep.test.js tests/engine.test.js` — met (31 pass, 0 fail)
- 2 `npm test` — met (108 pass, 0 fail)
- 3 `E2E_PORT=18840 E2E_MOCK_PORT=18841 npm run test:e2e -- sleep` — met (PASS sleep, 36 ok lines, real 1m16.7s of the 180 s E2E_SPEC_TIMEOUT)
- 4 `node scripts/check-precache.mjs` — met (25 precached files OK)
- 5 `grep -c "sleep-veil\|sleepEnabled" index.html` — met (2)
- item 1 C6I1 (clock step vs later writes) — met: cases 19a, 19b fail on 2df5e2d, pass after
- item 2 C6M1 (poll only when it can matter) — met: case 20 fails on 2df5e2d (7 requests), passes after
- item 3 C6M3 (in-flight poster fetch under the veil) — met: case 21 fails on 2df5e2d, passes after
- lint `npx eslint -c .orchestrator/artifacts/round--eslint-r1e.config.mjs js/main.js tests/e2e/sleep.spec.mjs` — met (exit 0)
deviations: Existing case 3 (`wakeOnPlayback:false`) asserted `seen.sessions >= 2`; with C6M1 that configuration no longer polls, so I changed it to `seen.sessions === 0` (and its check text). Not a new behavior; it is the same rule as case 20. Nothing written to .orchestrator/artifacts except this file.
questions: none

Agent: sleep-mode-builder-r7 · dispatched: 2026-10-09T02:40:46Z

## What changed

js/main.js
- C6I1: the step-absorbing block moved out of `evaluateSleep()` into `syncSleepClock()`. It is called at the top of `evaluateSleep()` and immediately before every wall-clock write: playback poll (`lastPlaybackAt`, when playing), `manualWake` (key/pointerdown), the `pointermove` manual-wake refresh, and `applySettings` (idle-clock restart). A pending step is therefore shifted into the old stamps first, and the new stamp is written on the new clock and never shifted. `evaluateSleep` now uses `new Date()` after the sync (was `new Date(wall)`, a few microseconds apart).
- C6M1: `sleepWatching` replaced by `playbackMatters(s) = (s.sleepEnabled && s.wakeOnPlayback) || s.idleSleepHours > 0`, used by `intervalMs()` and `pollPlayback()`. The old `!state.asleep &&` clause in `pollPlayback` is dropped, because asleep with the schedule on and `wakeOnPlayback` off is exactly the case that must not poll. Now-playing's own polling (`showNowPlaying`) is unchanged.
- C6M3: in `tick`, after `fetchImage` returns, the whole show / engine.shown / lastReason / log block runs only `if (!state.asleep)`. It is a conditional, not an early return, so `lastSuccessAt`, backoff reset and `schedule()` still run.

tests/e2e/sleep.spec.mjs: new cases 19a, 19b, 20, 21 under an `// ---------- r7 ----------` heading, plus the case 3 change above.
- 19a: 1970 clock, idleSleepHours 1, `setSystemTime` to 2026, key `o` (rotate, so `applySettings`) in the same second; asserts awake at 59 min, asleep (idle) at 62 min.
- 19b: asleep at 03:00, `setSystemTime` +1 h, key `a` in the same second; awake at 50 s, asleep again by 65 s.
- 20: schedule on, wakeOnPlayback off, idleSleepHours 0, showNowPlaying off, a movie playing; `page.on('request')` count of /status/sessions is 0 over 6 poll periods awake, then 0 over 6 more asleep.
- 21: a route parks the first image request; the window opens (runFor 4 s) while it is parked; release; no `.poster-layer.active`, Diagnostics Poster is `—`, still asleep; a key press wakes and `posterShown` succeeds.

## Tests first, on 2df5e2d (js/main.js untouched), before any fix
Command: `E2E_PORT=18840 E2E_MOCK_PORT=18841 E2E_SLEEP_ONLY='^(19|20|21|3 )' node tests/e2e/run.mjs sleep`
```
case 20 no sessions polling when it cannot matter failed:
AssertionError [ERR_ASSERTION]: no /status/sessions request while awake
7 !== 0
case 21 in-flight poster fetch when sleep starts failed:
AssertionError [ERR_ASSERTION]: nothing drawn under the veil
1 !== 0
case 19b manual wake: step, then a key press in the same second failed:
page.waitForFunction: Timeout 15000ms exceeded.      (waitAsleep at the end: still awake after 65 s)
case 19a idle clock: step, then a write in the same second failed:
page.waitForFunction: Timeout 15000ms exceeded.      (waitAsleep at the end: never sleeps)
FAIL sleep
```
(Case 3 passed there with the old `>= 2` assertion, as expected.)

## After the fix
Same command: `ok` for case 3, 19a, 19b, 20, 21, `PASS sleep`. Full run, tail:
```
  ok  clock stepped +1 h while asleep, key press in the same second: the manual wake lasts about 60 s, not an hour
  ok  poster download in flight when the window opens: not drawn under the veil; the next wake shows a poster normally
  ok  schedule on, wakeOnPlayback off, idle sleep off, now playing off: no /status/sessions request awake or asleep
  ok  1970 clock stepped to 2026, key press in the same second: idle sleep starts an hour after it, not never
  ok  idle sleep: playback past the original deadline; awake after it stops, asleep one idle hour after the last playback
PASS sleep
real 1m16.729s
```
Other commands: unit `# pass 31 # fail 0` (sleep+engine), `# pass 108 # fail 0` (npm test), `25 precached files OK`, index.html grep count 2, eslint exit 0.

## Notes
- The regression cases cover the applySettings and manualWake (keydown) write sites. The playback-poll and pointermove sites use the same one-line `syncSleepClock()` call but have no dedicated e2e case (the brief named two).
- No mutation runs this round; the pre-fix failures above are the evidence that cases 19a/19b/20/21 bite.
- `git status`: the same 9 staged files as before, nothing unstaged.
