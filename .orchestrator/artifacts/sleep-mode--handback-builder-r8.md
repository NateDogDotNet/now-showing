produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: sleep-mode · round: r8
status: complete        failure_class: n/a
paths: tests/e2e/sleep.spec.mjs (re-staged in /home/user/wt-sleep-mode, not committed; the other 8 staged files are unchanged this round)
criteria:
- new case 22a (poll site) fails with the poll mutant, passes without it — met (see below)
- new case 22b (pointer-move site) fails with the move mutant, passes without it — met (see below)
- 1 `node --test tests/sleep.test.js tests/engine.test.js` — met (31 pass, 0 fail)
- 2 `npm test` — met (108 pass, 0 fail)
- 3 `E2E_PORT=18840 E2E_MOCK_PORT=18841 npm run test:e2e -- sleep` — met (PASS sleep, 38 ok lines, real 1m17s of the 180 s E2E_SPEC_TIMEOUT)
- 4 `node scripts/check-precache.mjs` — met (25 precached files OK)
- 5 `grep -c "sleep-veil\|sleepEnabled" index.html` — met (2)
- lint `npx eslint -c .orchestrator/artifacts/round--eslint-r1e.config.mjs js/main.js tests/e2e/sleep.spec.mjs` — met (exit 0)
deviations: none. No app code touched; no new bug exposed. Nothing written to .orchestrator/artifacts except this file.
questions: none

Agent: sleep-mode-builder-r8 · dispatched: 2026-10-09T03:00:15Z

## What changed
tests/e2e/sleep.spec.mjs: two cases under a new `// ---------- r8 ----------` heading, before the runner.

- 22a (poll site). Settings: idleSleepHours 1, sleepEnabled false, showNowPlaying false, clock 2026-01-05T12:00 (plausible). A movie plays. After a few polls, a page.route parks the next `/status/sessions` request. With the request parked, `page.clock.setSystemTime(+2 h)` steps Date but not performance.now(), and nothing fires the 1 s evaluateSleep timer. The route is then released, so the poll that sees the movie stamps `lastPlaybackAt` on the new clock before any timer can see the step. Then `mock.stop()`, `fastForward(59 min)` must be awake, `fastForward(3 min)` must be asleep (idle) within 5 s. With the step re-applied it would sleep at about 3 h, not 1 h.
- 22b (move site). Asleep at 03:00 in the window, key `a` starts a manual wake, `setSystemTime` to 04:00 (+1 h, still inside the window), `page.mouse.move(300, 300)` straight after. Awake at 50 s, asleep again by 65 s (waitAsleep with a 5 s real budget). With the step re-applied the wake would last about 1 h.

## Mutants (temp copy under `mktemp -d`, never the live tree)
Poll mutant: delete `syncSleepClock();` inside `if (state.playing) {` in pollPlayback.
```
== mutant poll
211d210
<     syncSleepClock();
  ok  clock stepped +1 h during a manual wake, pointer move in the same second: the wake ends about 60 s later, not an hour
case 22a idle clock: step, then a poll that sees playback in the same second failed:
page.waitForFunction: Timeout 5000ms exceeded.
    at waitAsleep (.../tests/e2e/sleep.spec.mjs:29:8)
    at .../tests/e2e/sleep.spec.mjs:824:11      (the final waitAsleep: never asleep 62 min after the last playback)
FAIL sleep
```
Move mutant: delete `syncSleepClock();` in the pointermove handler.
```
== mutant move
288d287
<     syncSleepClock();
  ok  clock stepped +2 h, a poll that sees playback in the same second: idle sleep starts an hour after the last playback, not an hour + 2 h
case 22b manual wake: step, then a pointer move in the same second failed:
page.waitForFunction: Timeout 5000ms exceeded.
    at waitAsleep (.../tests/e2e/sleep.spec.mjs:845:9)      (the wake lasts past 65 s)
FAIL sleep
```
Without a mutant (real tree), `E2E_SLEEP_ONLY='^22' ... -- sleep`, six runs in a row: `PASS sleep` x6 (about 6 s each).
```
  ok  clock stepped +1 h during a manual wake, pointer move in the same second: the wake ends about 60 s later, not an hour
  ok  clock stepped +2 h, a poll that sees playback in the same second: idle sleep starts an hour after the last playback, not an hour + 2 h
PASS sleep
```

## Criteria 1-5 and lint, tails
```
# pass 31 / # fail 0        (node --test tests/sleep.test.js tests/engine.test.js)
# pass 108 / # fail 0       (npm test)
  ok  clock stepped +2 h, a poll that sees playback in the same second: idle sleep starts an hour after the last playback, not an hour + 2 h
  ok  clock stepped +1 h during a manual wake, pointer move in the same second: the wake ends about 60 s later, not an hour
  ok  1970 clock stepped to 2026, key press in the same second: idle sleep starts an hour after it, not never
  ok  idle sleep: playback past the original deadline; awake after it stops, asleep one idle hour after the last playback
PASS sleep
real 1m17.144s
25 precached files OK
2                            (grep -c in index.html)
eslint=0
```
`git status --short` afterwards: the same 9 staged files as before (tests/e2e/sleep.spec.mjs re-staged), nothing unstaged.
