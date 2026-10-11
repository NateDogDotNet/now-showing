produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: sleep-mode · round: r3
status: complete        failure_class: n/a
paths: js/main.js, js/engine.js, index.html, tests/engine.test.js, tests/e2e/sleep.spec.mjs (all edited and staged); css/app.css, js/sleep.js, sw.js, tests/sleep.test.js (r1/r2, still staged, not touched in r3)
criteria:
  1. met — test -f tests/sleep.test.js && test -f tests/engine.test.js && node --test tests/sleep.test.js tests/engine.test.js (31 tests, 31 pass, 0 fail)
  2. met — npm test (108 tests, 108 pass, 0 fail)
  3. met — E2E_PORT=18840 E2E_MOCK_PORT=18841 npm run test:e2e -- sleep (31 ok lines, PASS sleep, 1m17s; run twice, same result)
  4. met — node scripts/check-precache.mjs (25 precached files OK)
  5. met — grep -q 'id="sleep-veil"' index.html && grep -q 'name="sleepEnabled"' index.html (exit 0)
  6. narrated (reviewer), not attempted by the builder
  Also: full `npm run test:e2e` PASS cache-first rotation sleep smoke ui-rotation; eslint (round--eslint-r1e.config.mjs) + node --check on every staged JS file exit 0; git diff --cached --check exit 0; unstaged/untracked: none.
deviations: (1) tests/e2e/sleep.spec.mjs is restructured: the 11 r1/r2 case bodies are unchanged but each is now registered with sleepCase() against its own dedicated mock (serveArgs: []) and the cases run 4 at a time. Reason: the r2 spec already took 152 s sequentially and run.mjs kills a spec at 180 s; with the 9 new cases it would time out. Now 77 s. Optional knobs E2E_SLEEP_WORKERS and E2E_SLEEP_ONLY (a regex on case names) exist for local runs. (2) Three readings I took that the brief did not spell out are listed under "Judgement calls" below. No wake fade added (K15).
questions: none appended (the three judgement calls are small; the conductor can overrule any of them)

Agent: sleep-mode-builder-r3 · dispatched: 2026-10-09T01:33:11Z

## What changed (r3 items)

js/main.js
1. AI1: `state.swallowClick` + one-shot click listener replaced by `state.swallowUntil` (performance.now()). A pointerdown while asleep, or while inside the swallow window, is swallowed (stopPropagation + preventDefault) and sets swallowUntil = now + 800 ms. The click listener swallows every click until swallowUntil. A third tap is covered because the second tap extended the window.
2. CI1 + K11: `pollPlayback()` now calls `client.sessions()` itself inside try/catch. Awake, a failure is logged once (state.pollFailing) and the tick carries on to `engine.decide()`; `state.playing` and `lastPlaybackAt` are untouched. Asleep, the error is rethrown to `handleFailure` (the only way a tick can fail while asleep). `handleFailure` no longer sets `state.playing = false`.
3. CI2 + K12: `inOpenDialog(e)` (`e.target.closest('dialog[open]')`): events aimed at an open dialog are never swallowed (pointerdown, keydown, click). During a manual wake (`sleepWhy === 'manual wake'`) any pointerdown, keydown, or pointermove sets manualWakeUntil = now + 60 s again, in dialogs too.
4. K13: `applySettings` (every non-preview call, i.e. every save) sets `state.lastPlaybackAt = Date.now()`. Page load already starts it at module load.
5. K14: `handleFailure` schedules `min(retry, nowPlayingPollSeconds * 1000)` while `state.asleep` (covers both the backoff and the 5-minute fatal delay).
6. CM2/AM5: `tick()` passes the sessions it fetched to `engine.decide({ force, sessions })`.
7. CM3: the transition tick is `if (!state.busy && !state.paused) tick()`.
8. CM5: `$('app').inert = asleep` in the transition block.
js/engine.js: `playing(sessions)` and `decide({ force, sessions })` take an already-fetched sessions array (`sessions ?? await client.sessions()`); without it they behave as before.
index.html: `#sleep-veil` gets `aria-hidden="true"`.
CM1 needed no code: the guard `&& !state.asleep` was already there; the missing piece was a test.

## Judgement calls (small readings; please confirm or overrule)
- A pointerdown/keydown aimed at an open dialog while the display is ASLEEP wakes it (starts the 60 s) but is not swallowed. Reading: K12 "any pointer/key activity ... (inside dialogs too)" and CI2 "never swallow" together.
- `pointermove` counts as "pointer activity" for restarting a manual wake (never wakes a sleeping display by itself, never swallowed). A mouse that jitters on a kiosk would therefore keep a manual wake going.
- K11 consequence: with Plex down for good after a movie ended, `state.playing` stays true and the display stays awake until Plex answers (the ruling says leave it unchanged). A failed poll while asleep is rethrown to handleFailure so Diagnostics shows the error and the retry runs at the poll rate; awake it is only a log line.

## Tests written first, failing on the r2 code
Unit (tests/engine.test.js, 4 new; r2 engine.js):
```
not ok 13 - playing(sessions) uses the sessions it is given and fetches nothing
not ok 14 - decide({ sessions }) shows the given now-playing session without a second sessions request
not ok 15 - decide({ sessions: [] }) means nothing is playing: rotation, and still no sessions request
ok 16 - decide() without sessions still fetches them itself
# pass 13   # fail 3
```
E2E: the final spec run against r2 js/main.js, js/engine.js and index.html (git show 77062d2:...) in a mktemp copy:
```
case 10 ... failed: AssertionError: 2 taps left Pause off   'true' !== 'false'
case 11 sessions 403 does not stop rotation failed: page.waitForFunction: Timeout 15000ms exceeded (no poster ever shown)
case 11b ... failed: veil came up after 4500 ms of failed polls
case 11c ... failed: page.waitForFunction: Timeout 15000ms exceeded (no poster ever shown)
case 12 Settings stays usable failed: awake 61 s into the pointer activity in Settings
case 13 enabling idle sleep restarts the clock failed: saving idleSleepHours=1 does not black the screen at once
case 14 playback wake after an outage failed: condition not met within 60000 simulated ms
case 15 one sessions request per tick failed: 20 sessions requests in ten ticks
case 16 no tick on a transition while paused failed: no request when the display went to sleep while paused
case 18 veil semantics failed: Expected values to be strictly deep-equal (hidden: null)
FAIL sleep
```
Case 17 (CM1) passes on r2 by design (the guard exists); its teeth are shown by the mutant below. (My first draft of case 12 passed on r2 because a swallowed key re-woke the display; I rewrote it to assert awake on every simulated second, pointer-only for 70 s and then key-only for 70 s.)

## Mutants (each in its own mktemp copy of the worktree; only the matching cases run via E2E_SLEEP_ONLY; nothing written to artifacts)
| mutant | killed by |
|---|---|
| swallowing := false (no swallow window for later taps) | case 10: 3 taps left Pause off |
| window not extended by taps made inside it | case 10: 3 taps left Pause off |
| pollPlayback always rethrows (CI1) | case 11 FAIL |
| failed poll sets playing=false (K11) | case 11b: veil came up after 5500 ms of failed polls |
| failed poll refreshes lastPlaybackAt (K11) | case 11c FAIL |
| inOpenDialog := false (CI2) | case 12 (click behind the returned veil not swallowed) and case 18 (dialog click) |
| no key restart of the manual wake (K12) | case 12: awake 59 s into the key activity |
| no pointermove restart (K12) | case 12: awake 60 s into the pointer activity |
| applySettings does not reset lastPlaybackAt (K13) | case 13: saving idleSleepHours=1 blacks the screen at once |
| no cap on the asleep retry (K14) | case 14: not awake within 60000 simulated ms |
| decide() called without sessions (CM2) | case 15: 20 sessions requests in ten ticks |
| tick() on transition without !state.paused (CM3) | case 16 |
| `&& !state.asleep` removed at the cached-poster guard (CM1) | case 17: nothing was drawn ... while asleep |
| no `inert` on #app (CM5) | case 18 |
| no aria-hidden on the veil (CM5) | case 18 |
All with the same unmutated code passing (31 ok).

## Final command output tails
```
node --test tests/sleep.test.js tests/engine.test.js   -> # tests 31  # pass 31  # fail 0
npm test                                               -> # tests 108 # pass 108 # fail 0
node scripts/check-precache.mjs                        -> 25 precached files OK
E2E_PORT=18840 E2E_MOCK_PORT=18841 npm run test:e2e -- sleep   (x2)
  ok  3 min outage while asleep, then mock.play(): awake 1039 ms after Plex returned
  ok  awake, sleep configured, now playing on: 10 sessions requests in 10 ticks (one each)
  ok  paused: sleeping and waking make no sessions or image request
  ok  veil aria-hidden="true"; #app inert while asleep and not after; a dialog above the veil takes clicks
  ok  idleSleepHours 0 -> 1 saved after 2 h: awake at save and at 58 min, asleep (idle) an hour after the save
  PASS sleep      (real 1m17s)
npm run test:e2e (all specs) -> PASS cache-first, rotation, sleep, smoke, ui-rotation
eslint -c round--eslint-r1e.config.mjs <staged js> + node --check -> exit 0
```
Note for the conductor: the clock tests for K13/11c use `page.clock.fastForward` (a jump that fires each due timer once; Date and performance.now advance together, so the clock-step compensation does not trigger). The r1/r2 idle cases still use `runFor` and are the long pole of the run (about 75 s).
