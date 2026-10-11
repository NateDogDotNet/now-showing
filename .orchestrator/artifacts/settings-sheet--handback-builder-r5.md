produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: settings-sheet · round: r5
status: complete        failure_class: n/a
paths: js/duration.js, js/main.js, js/settings-ui.js, tests/duration.test.js, tests/e2e/first-run.spec.mjs, tests/e2e/settings-sheet.spec.mjs, tests/e2e/lib.mjs (edited this round and re-staged). The rest of the staged index is the r3 tree, unchanged: css/app.css, index.html, js/plex.js, js/util.js, scripts/mock-plex.mjs, sw.js, tests/plex.test.js, tests/e2e/brightness.spec.mjs, tests/e2e/helper.spec.mjs. Worktree /home/user/wt-settings-sheet-r5, branch orch/settings-sheet-r5, tree after staging d01f48c508505840192abda519b4be8611893f14. Nothing committed.
criteria:
 1 met: `test -f tests/plex.test.js && test -f tests/duration.test.js && node --test tests/plex.test.js tests/duration.test.js` -> 46 tests, 46 pass, 0 fail
 2 met: `npm test` -> 317 tests, 317 pass, 0 fail
 3 met: `npm run test:e2e -- settings-sheet` (run as part of the full suite, and the SSC/SSA2/U2 subset alone) -> PASS settings-sheet
 4 met: `npm run test:e2e -- first-run` (run as part of the full suite, and alone: "all 20 first-run cases passed", 61 s) -> PASS first-run
 5 met: `grep -Eq 'pixelShift: *false' tests/e2e/settings-sheet.spec.mjs tests/e2e/first-run.spec.mjs` -> exit 0
 6 met: `node scripts/check-precache.mjs` -> "30 precached files OK"
 7 met: the criterion 7 grep chain -> exit 0
 8 met: `test -z "$(git status --porcelain -- js/settings.js js/engine.js js/display.js js/layout.js)"` -> exit 0
 full `npm run test:e2e` once at the end: exit 0, all 17 specs PASS (brightness cache-first content-rating display-decode first-run helper kiosk metadata now-playing pi-stability pixel-shift rotation settings-sheet sleep smoke status ui-rotation), 102 PASS lines in total
 lint: eslint --no-config-lookup -c round--eslint-r1e.config.mjs on the 15 Output JS files (list below) -> exit 0, no output; `node --check` on each -> clean; `git diff --cached --check` -> clean
 per item (each was RED on the r3 code first, see below): SSC1 met, SSC2 met, SSC3 met (by the stop-the-flow approach), SSC4 met, K50/SSC5 met, SSA2 met
deviations: (1) K50 rest text: the brief gives no wording for what the card shows during the 5 minute rest, so the status line reads "No code was entered. A new one comes in 5 minutes…" and the code block shows "····". This is new user-visible text. (2) pinSignIn's poll interval is one constant (PIN_POLL_MS in js/settings-ui.js), so the Settings sheet's own sign-in code is also polled every 5 s now, not only the card's. The 3-codes-then-rest rule is in the card's flow only (the sheet's own flow is one code per press). (3) SSA2: per the brief a handler that fulfils or continues counts as routed. I also count abort(), because an aborted request never leaves the machine. A handler that only calls route.fallback() does not count. A `continue()` of a plex.tv request does reach the real service and still counts as routed, as the brief says; if you want that flagged too, it is a one-word change in tests/e2e/lib.mjs (drop 'continue' from the list). (4) SSC3 follows the r5 approach, so a code the person approves in the instant between the prompt opening and the abort is not delivered (the poll answer is dropped). The card shows a fresh code when the prompt closes without opening Settings. I did not keep the old token pending (that is the r4 approach). (5) Existing tests changed because the behaviour they pin changed, all inside Output: the unit test and the U2 "stored 10 s" case (0.2 -> 0.17, SSC4), and the first-run case "code on the card" (waits for the first 5 s poll, not 2.5 s).
 Out-of-Output observation, no change made: js/engine.js builds the empty-library message with the hint `try turning off "unwatched only"` even when the switch is already off (limit G, every title R). So the message text still mentions "unwatched only" while the button is correctly absent. The SSC2 test therefore checks the buttons, not the text.
questions: none

Agent: settings-sheet-builder-r5 · dispatched: 2026-10-11T11:19:50Z

## What changed (all inside the phase Output)

- js/main.js
  - SSC1: `runFix('unwatched')` is now async and `await requestPin()` first. It applies `unwatchedOnly: false` only on a true. The empty card and the toast both call runFix, so both are gated.
  - SSC2: `fixesFor` drops the `unwatched` fix unless `state.settings.unwatchedOnly` is on.
  - SSC3: `requestPin()` is now a function that counts open PIN questions (`pinPrompts`). It calls `syncFirstRun()` when a prompt opens, and again (setTimeout 0, so a right PIN opens Settings first) when it closes. `firstRunWanted()` is false while `pinPrompts > 0`. The card's code flow therefore stops the moment any PIN prompt opens (the same way it already stops when Settings opens) and restarts with a fresh code when the prompt closes without Settings opening.
  - K50: `firstRunWanted()` is also false while `state.asleep`; `evaluateSleep()` calls `syncFirstRun()` when the asleep state flips (stops polling on sleep, a fresh code on wake). `runFirstRun` counts codes that expired unapproved. After 3 in a row it shows the rest text and sleeps 5 minutes (abortable), then counts from 0 again.
- js/settings-ui.js: `PIN_POLL_MS` 2000 -> 5000.
- js/duration.js: `formatMinutes` shows up to 2 decimals, trailing zeros dropped (15 s -> "0.25", 10 s -> "0.17"). 0.01 min is 0.6 s, so retyping what is shown always gives back the same whole seconds.
- tests/e2e/lib.mjs (SSA2): `guardNetwork` wraps `context.route` and `page.route` (the page is wrapped in withApp). The wrapper notes when a handler calls `fulfill`, `continue` or `abort` on a request. plex.tv requests are recorded from the `request` event, and `assertClean()` (now async, with a 100 ms grace for a request that has not reached its handler) flags any plex.tv request nobody answered, naming it. Non-local, non-plex.tv hosts are still flagged unconditionally.
- Tests: tests/duration.test.js, tests/e2e/settings-sheet.spec.mjs, tests/e2e/first-run.spec.mjs (new cases below).

## New cases

settings-sheet.spec.mjs: SSC1 x3 (card with wrong then right PIN; Cancel; toast reached with the fake clock past the engine's 30 minute pool life), SSC2, SSC4, SSA2 x3 (unrouted path flagged while another plex.tv path is routed; fallback-only handler flagged; fulfilled request clean; the offline page fetch means even the unrouted probe cannot leave the machine), and the U2 "stored 10 s" case now expects 0.17.
first-run.spec.mjs: SSC3 x3 (no poll and no new pin while a PIN prompt is open even with the approval released; Cancel -> fresh code -> approve -> PIN -> Settings filled in and tested; approval with no prompt open -> PIN -> Settings filled in), K50 x5 (5 s cadence: 12 polls in 60 s of fake time; 3 codes then a 5 minute rest then the 4th; one hour: 4 codes and 659 polls; asleep -> silent, waking -> fresh code; boots asleep -> no pin until awake). The fake-clock helpers use fastForward for the 4 to 6 hour jumps (runFor made the page run 1 s checks 21,600 times and took 295 s).

## RED on the r3 code (before any app change; tests were written first)

Unit (`node --test tests/duration.test.js`): `# pass 7 / # fail 3`
```
not ok 7 - formatMinutes shows whole minutes plainly and fractions to at most two decimals, trailing zeros dropped   expected '0.25' actual '0.3'
not ok 8 - formatMinutes shows exactly what will be saved: retyping it gives the same seconds, for every storable value   expected 10 actual 12
not ok 9 - formatMinutes: a quarter minute does not drift to 0.3 (0.25 -> 0.3 -> 18 s)   expected '0.25' actual '0.3'
```
settings-sheet (E2E_SHEET_ONLY='SSC|SSA2|U2 a stored 10'): `8 of 9 settings-sheet cases failed` (the 9th, "a fulfilled plex.tv request is clean", is the positive control and passes on both)
```
U2 stored 10 s:        '0.2' !== '0.17'
SSC4:                  a stored 15 s opens as 0.25, not 0.3 -- '0.3' !== '0.25'
SSC2:                  only Open settings -- actual has 'Turn off "unwatched only"' as well
SSA2 unrouted path:    Missing expected rejection: the unrouted path is named
SSA2 fallback:         Missing expected rejection.
SSC1 card:             page.waitForFunction: Timeout 5000ms exceeded (the PIN dialog never opened; the setting was saved without it)
SSC1 cancel:           page.waitForFunction: Timeout 5000ms exceeded (same)
SSC1 toast:            page.waitForFunction: Timeout 5000ms exceeded (same)
```
first-run (E2E_FIRSTRUN_ONLY='SSC3|K50|approved while no prompt'): `7 of 8 first-run cases failed` (the 8th, "approved with no prompt open", passes on r3 and stays as a regression guard)
```
K50 5 s cadence:        23 polls in 60 s (5 s apart is 12)
SSC3 prompt open:       nothing asks plex.tv about the code while the PIN prompt is open -- 1 !== 0   (an approval could land mid-prompt)
SSC3 cancel:            timed out waiting for a fresh code once the prompt is gone
K50 boots asleep:       no code request while asleep -- 1 !== 0
K50 3 codes then rest:  no fourth code yet -- 8 !== 3
K50 asleep:             no polls while asleep -- 254 !== 17
K50 one hour:           1435 polls in an hour (the 2 s cadence made about 1,800)
```

## GREEN, final tree

```
== c1  # tests 46  # pass 46  # fail 0
== c2  # tests 317 # pass 317 # fail 0
== c5  exit=0
== c6  30 precached files OK
== c7  exit=0
== c8  exit=0
settings-sheet subset (SSC|SSA2|U2): all 13 settings-sheet cases passed
  ok  SSC4 0.25 minutes <-> 15 s, no drift
  ok  SSC1 card: unwatched fix asks for the PIN; wrong keeps true, right sets false
  ok  SSC1 cancel keeps unwatchedOnly
  ok  SSC1 toast: unwatched fix asks for the PIN
  ok  SSC2 no unwatched fix when unwatchedOnly is off
  ok  SSA2 an unrouted plex.tv path is flagged although another plex.tv path is routed
  ok  SSA2 fallback() is not routing
  ok  SSA2 a fulfilled plex.tv request passes
first-run alone: all 20 first-run cases passed   (61 s)
  ok  SSC3 no poll while the PIN prompt is open; the right PIN opens Settings
  ok  SSC3 cancel -> fresh code -> approve -> PIN -> Settings pre-filled
  ok  approval -> PIN -> Settings pre-filled
  ok  K50 12 polls in 60 s
  ok  K50 3 codes, then a 5 minute rest, then the 4th
  ok  K50 one hour: 4 codes, 659 polls
  ok  K50 asleep: silent; awake: a fresh code
  ok  K50 booted asleep: no pin until awake
full `E2E_PORT=24320 E2E_MOCK_PORT=24321 npm run test:e2e`: e2e exit=0
  PASS brightness  PASS cache-first  PASS content-rating  PASS display-decode  PASS first-run  PASS helper  PASS kiosk  PASS metadata
  PASS now-playing  PASS pi-stability  PASS pixel-shift  PASS rotation  PASS settings-sheet  PASS sleep  PASS smoke  PASS status  PASS ui-rotation
lint: eslint --no-config-lookup -c .../round--eslint-r1e.config.mjs js/duration.js js/main.js js/plex.js js/settings-ui.js js/util.js scripts/mock-plex.mjs sw.js tests/duration.test.js tests/e2e/brightness.spec.mjs tests/e2e/first-run.spec.mjs tests/e2e/helper.spec.mjs tests/e2e/lib.mjs tests/e2e/settings-sheet.spec.mjs tests/plex.test.js  -> exit 0
```

## Notes for the verifier

- The first full run of this round failed first-run on the 180 s per-spec timeout (329 s): the "asleep, then 07:00" case used `clock.runFor(6 h)`. I replaced the two long jumps with `clock.fastForward` (that case went 295 s -> 11 s) and re-ran the whole suite from scratch; the numbers above are from the second, complete run. The one-hour K50 case is now the longest at about 46 s alone, so the spec as a whole runs in about 61 s.
- Ports used: E2E_PORT=24320 E2E_MOCK_PORT=24321 for everything; dedicated per-case servers use probed free ports as before.
- No token or PIN is logged: the new code only counts prompts and reads existing state.
- Raw outputs of the RED and GREEN runs are in the session scratchpad (red-sheet.txt, red-firstrun.txt, red-unit.txt, criteria.txt, full-e2e.txt under /tmp/claude-0/-home-user/754644a7-1380-52e8-802b-a7514b405070/scratchpad/).
