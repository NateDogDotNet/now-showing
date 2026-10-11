produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: sleep-mode · round: r1
status: complete        failure_class: n/a
paths: js/sleep.js, tests/sleep.test.js, js/engine.js, tests/engine.test.js, js/main.js, index.html, css/app.css, sw.js, tests/e2e/sleep.spec.mjs (all staged in /home/user/wt-sleep-mode, not committed); also appended Q-sm1..Q-sm3 to /home/user/plex-poster-app/.orchestrator/questions.md
criteria:
 1. met — test -f tests/sleep.test.js && test -f tests/engine.test.js && node --test tests/sleep.test.js tests/engine.test.js (27 pass, 0 fail)
 2. met — npm test (104 pass, 0 fail)
 3. met — E2E_PORT=18840 E2E_MOCK_PORT=18841 npm run test:e2e -- sleep (PASS sleep, 17 checks); full `npm run test:e2e` also PASS (cache-first, rotation, sleep, smoke, ui-rotation)
 4. met — node scripts/check-precache.mjs ("25 precached files OK")
 5. met — grep -q 'id="sleep-veil"' index.html && grep -q 'name="sleepEnabled"' index.html (rc=0)
 6. narrated (not mine to score); my own attempts at the criterion-6 states are in the e2e spec: offline start, clock change (1970 -> 2026, and into/out of the window), settings saved while asleep, playback stop inside the window
deviations: none from the brief. Notes: (a) "veil hidden within one nowPlayingPollSeconds" is asserted as <= poll + 1 s simulated (observed 5038-5078 ms with a 5 s poll; the extra ms is the fetch round trip, because the fake clock does not wait for real I/O). (b) idle sleep is independent of sleepEnabled (its own key, 0 = off). (c) Diagnostics shows `Sleep: awake` with no parenthetical when nothing holds the display awake; `(manual wake)` while a manual wake is holding off a sleep.
questions: Q-sm1 (wakeOnPlayback:false vs idle sleep), Q-sm2 (Pause while asleep cannot poll), Q-sm3 (top-layer dialogs render above the veil). All built on the proposed reading; none blocks.

Agent: sleep-mode-builder-r1 · dispatched: 2026-10-09T00:00:30Z

## Design summary
- `js/sleep.js`: pure `decideSleep({now, settings, lastPlaybackAt, playingNow, manualWakeUntil, clockOk})` -> `{asleep, why}` (spec signature), plus `MANUAL_WAKE_MS = 60000`. Uses `inWindow` from `js/schedule.js` (schedule needs `clockOk`; idle does not).
- `js/engine.js`: `playing()` = `pickNowPlaying(await client.sessions(), getSettings())` (honours username/includeEpisodes, ignores showNowPlaying, no art, records nothing).
- `js/main.js`: `evaluateSleep()` (1 s interval, plus on settings apply, boot, poll results) toggles `#sleep-veil` and body class `asleep`; never touches the wake lock. `tick()` calls `pollPlayback()` first (only when sleepEnabled / idleSleepHours / asleep), and skips `engine.decide`, image fetch and `display.show` while asleep; `handleFailure` skips the cached-poster fallback while asleep and clears `playing`. A window-capture `pointerdown`/`keydown` listener wakes for 60 s and stops the event; a following click is swallowed for 800 ms. Clock steps are detected by comparing Date with performance.now deltas and shifting `lastPlaybackAt`/`manualWakeUntil`, so NTP arriving does not read as hours of idleness. Diagnostics rows `Sleep` and `Local time` (+ ` — Clock not set`).
- `index.html`: `#sleep-veil`, a Sleep fieldset (sleepEnabled, sleepStart, sleepEnd, idleSleepHours, wakeOnPlayback; bound by `name`, settings-ui.js untouched). `css/app.css`: opaque `#000` veil at z-index 100; controls/status/toast `visibility:hidden` under `body.asleep`. `sw.js`: `js/sleep.js` added to SHELL (VERSION not bumped).

## Pre-implementation failures (RED)
Unit/engine, before js/sleep.js and engine.playing() existed:
```
not ok 8 - playing() returns the session without fetching art or touching the pool   (TypeError)
not ok 9 - playing() returns null when nothing is playing                             (TypeError)
not ok 10 - playing() works with showNowPlaying off                                  (TypeError)
not ok 11 - playing() honours username and includeEpisodes                           (TypeError)
not ok 12 - playing() propagates a connection error                                  (TypeError)
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/user/wt-sleep-mode/js/sleep.js' imported from /home/user/wt-sleep-mode/tests/sleep.test.js
not ok 2 - tests/sleep.test.js
# tests 13  # pass 7  # fail 6
```
E2E, before wiring main.js / index.html / css / sw.js:
```
> node tests/e2e/run.mjs sleep
page.waitForFunction: Timeout 15000ms exceeded.
    at waitAsleep (/home/user/wt-sleep-mode/tests/e2e/sleep.spec.mjs:24:8)
    at /home/user/wt-sleep-mode/tests/e2e/sleep.spec.mjs:71:9
FAIL sleep
```

## Mutation probes (in mktemp copies, not the live tree)
- Disabling the clock-step shift (`if (false)` for the jump block) -> `FAIL sleep` (clock-jump idle case caught).
- Letting `engine.decide` run while asleep -> `FAIL sleep` (no-poster-while-asleep case caught).

## Acceptance output tails
```
== c1  node --test tests/sleep.test.js tests/engine.test.js
# tests 27  # pass 27  # fail 0
== c2  npm test
# tests 104  # pass 104  # fail 0
== c3  E2E_PORT=18840 E2E_MOCK_PORT=18841 npm run test:e2e -- sleep
  ok  asleep: #sleep-veil visible, opaque black, full screen; controls hidden
  ok  wake lock held === 1 and releases unchanged while asleep
  ok  no /photo/:/transcode request while asleep; 4 session polls
  ok  Diagnostics: Sleep: asleep (schedule), local time shown
  ok  mock.play(): veil hidden after 5038 ms (<= one poll), poster shown
  ok  playback stops inside the window -> asleep again; wake lock never released
  ok  wakeOnPlayback:false: veil stays up while playing during the window
  ok  window opens during playback: stays awake, sleeps when playback stops
  ok  idle sleep: awake at 59 min, asleep at 61 min without playback; Sleep: asleep (idle)
  ok  idle sleep: playback wakes the display and it stays awake
  ok  key press: wakes (Settings not opened), awake until 60 s, then asleep again
  ok  pointer press on the veil wakes without activating the control under it
  ok  offline start inside the window: veil up; after Plex returns, playback wakes it and shows the poster
  ok  settings saved (schedule off) after a manual wake: stays awake past 60 s, wake lock untouched
  ok  1970 clock inside the window: does not sleep; Diagnostics says Clock not set
  ok  clock set into the window -> asleep (schedule)
  ok  1970 clock: idle sleep still works, and a clock jump does not trigger it early
PASS sleep
== c4  node scripts/check-precache.mjs   -> 25 precached files OK
== c5  grep ... index.html               -> rc=0
== full e2e: PASS cache-first, PASS rotation, PASS sleep, PASS smoke, PASS ui-rotation
git status --short: M css/app.css, M index.html, M js/engine.js, M js/main.js, A js/sleep.js, M sw.js, A tests/e2e/sleep.spec.mjs, M tests/engine.test.js, A tests/sleep.test.js
```
