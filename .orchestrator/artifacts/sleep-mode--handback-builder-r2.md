produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: sleep-mode · round: r2
status: complete        failure_class: n/a
paths: tests/e2e/sleep.spec.mjs (staged; the r1 files remain staged and unchanged: css/app.css index.html js/engine.js js/main.js js/sleep.js sw.js tests/engine.test.js tests/sleep.test.js)
criteria:
  1. met — test -f tests/sleep.test.js && test -f tests/engine.test.js && node --test tests/sleep.test.js tests/engine.test.js (27 pass, 0 fail)
  2. met — npm test (104 pass, 0 fail)
  3. met — E2E_PORT=18840 E2E_MOCK_PORT=18841 npm run test:e2e -- sleep (19 ok, PASS sleep; includes the 2 new cases)
  4. met — node scripts/check-precache.mjs (25 precached files OK)
  5. met — grep -q 'id="sleep-veil"' index.html && grep -q 'name="sleepEnabled"' index.html (exit 0)
  6. narrated (reviewer), not attempted by the builder
  New: tap-through mutant killed; playback-not-recorded mutant killed (evidence below).
deviations: none. js/main.js untouched: neither new test exposed a real bug.
questions: none

Agent: sleep-mode-builder-r2 · dispatched: 2026-10-09T00:18:08Z

## What I added (tests/e2e/sleep.spec.mjs only)

1. Case "6b" (after the key-press / mouse case): context `hasTouch: true`, asleep inside the window. A style tag makes `.controls` tappable (opacity 1, pointer-events auto), then `page.touchscreen.tap` at the centre of the settings button. Asserts: veil lifted, Settings dialog not open after 500 ms, still awake. Then waits 900 ms (past the 800 ms swallow timer) and taps again: Settings now opens, so the swallow is for one click only.
   Why touch: the existing mouse case passes with the mutant because a mouse click is targeted from the press and release nodes and the common ancestor is not the button. A touch tap is hit-tested when the finger lifts, after the veil is gone, so it reaches the control. Only touch exercises `swallowClick`.
2. Case "5b" (after the idle-sleep cases): `sleepEnabled:false, idleSleepHours:1`, outside any window. Run 50 simulated min with no playback, `mock.play('5')`, poster shown, play 15 more minutes (to about 66 min, past the original deadline), `mock.stop()`, 3 polls later assert awake (no `asleep` class). Then 50 min more: still awake. Then 12 min more: asleep, Diagnostics `Sleep: asleep (idle)`. So it sleeps one idle hour after the last playback poll, not one hour after boot.

## Mutants (run in `mktemp -d` copies made with tar, `.git` and `node_modules` excluded; live tree untouched)

Mutant 1, tap-through: `state.swallowClick = true;` replaced by `;` in the copy's js/main.js (diff confirmed, line 227).
Result with the mutant: `FAIL sleep`. Tail of the output:
```
    at file:///tmp/tmp.2dwCAwpjwY/tests/e2e/sleep.spec.mjs:228:10
    at async withApp (.../tests/e2e/lib.mjs:171:12)
    at async .../sleep.spec.mjs:215:1 {
  actual: true,
  expected: false,
  operator: 'strictEqual',
Node.js v22.22.0
FAIL sleep
```
Line 228 is `assert.equal(... getElementById('settings').open, false, 'the tap did not open Settings')`. I saw only this tail (piped through `tail -14`), not the assertion message line.
Result without the mutant: `ok  touch tap on the veil wakes; the control under the finger is not activated (one click swallowed, the next works)`.

Mutant 2, playback-not-recorded: `if (state.playing) state.lastPlaybackAt = Date.now();` replaced by `;` (diff confirmed, line 183).
Result with the mutant: the earlier idle cases still pass, then:
```
  ok  idle sleep: awake at 59 min, asleep at 61 min without playback; Sleep: asleep (idle)
  ok  idle sleep: playback wakes the display and it stays awake
AssertionError [ERR_ASSERTION]: awake right after playback ends (idle counts from the last playback)
true !== false
    at file:///tmp/tmp.ByboQRoWGR/tests/e2e/sleep.spec.mjs:206:10
FAIL sleep
```
Result without the mutant: `ok  idle sleep: playback past the original deadline; awake after it stops, asleep one idle hour after the last playback`.

## Full e2e run, unmutated (E2E_PORT=18840 E2E_MOCK_PORT=18841; about 2.5 min, same duration with and without my polling-step change)
```
  ok  asleep: #sleep-veil visible, opaque black, full screen; controls hidden
  ok  wake lock held === 1 and releases unchanged while asleep
  ok  no /photo/:/transcode request while asleep; 4 session polls
  ok  Diagnostics: Sleep: asleep (schedule), local time shown
  ok  mock.play(): veil hidden after 5075 ms (<= one poll), poster shown
  ok  playback stops inside the window -> asleep again; wake lock never released
  ok  wakeOnPlayback:false: veil stays up while playing during the window
  ok  window opens during playback: stays awake, sleeps when playback stops
  ok  idle sleep: awake at 59 min, asleep at 61 min without playback; Sleep: asleep (idle)
  ok  idle sleep: playback wakes the display and it stays awake
  ok  idle sleep: playback past the original deadline; awake after it stops, asleep one idle hour after the last playback
  ok  key press: wakes (Settings not opened), awake until 60 s, then asleep again
  ok  pointer press on the veil wakes without activating the control under it
  ok  touch tap on the veil wakes; the control under the finger is not activated (one click swallowed, the next works)
  ok  offline start inside the window: veil up; after Plex returns, playback wakes it and shows the poster
  ok  settings saved (schedule off) after a manual wake: stays awake past 60 s, wake lock untouched
  ok  1970 clock inside the window: does not sleep; Diagnostics says Clock not set
  ok  clock set into the window -> asleep (schedule)
  ok  1970 clock: idle sleep still works, and a clock jump does not trigger it early
PASS sleep
```

## Other criteria
```
node --test tests/sleep.test.js tests/engine.test.js -> # tests 27 # pass 27 # fail 0
npm test -> # tests 104 # pass 104 # fail 0
node scripts/check-precache.mjs -> 25 precached files OK
git status --short: M css/app.css, M index.html, M js/engine.js, M js/main.js, A js/sleep.js, M sw.js, A tests/e2e/sleep.spec.mjs, M tests/engine.test.js, A tests/sleep.test.js
```
Nothing committed.
