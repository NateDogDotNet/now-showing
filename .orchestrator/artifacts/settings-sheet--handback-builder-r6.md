produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: settings-sheet · round: r6
status: complete        failure_class: n/a
paths: js/main.js, css/app.css, tests/e2e/first-run.spec.mjs, tests/e2e/lib.mjs, tests/e2e/settings-sheet.spec.mjs (edited and re-staged this round); the rest of the r4 tree stays staged unchanged: index.html, js/duration.js, js/plex.js, js/settings-ui.js, js/util.js, scripts/mock-plex.mjs, sw.js, tests/duration.test.js, tests/plex.test.js, tests/e2e/brightness.spec.mjs, tests/e2e/helper.spec.mjs
criteria: 1 met (test -f tests/plex.test.js && test -f tests/duration.test.js && node --test tests/plex.test.js tests/duration.test.js: 46 pass, 0 fail) · 2 met (npm test: 317 pass, 0 fail) · 3 met (npm run test:e2e -- settings-sheet: all 28 cases passed) · 4 met (npm run test:e2e -- first-run: all 18 cases passed) · 5 met (grep -Eq pixelShift: false, exit 0) · 6 met (node scripts/check-precache.mjs: 30 precached files OK) · 7 met (the grep chain, exit 0) · 8 met (test -z "$(git status --porcelain -- js/settings.js js/engine.js js/display.js js/layout.js)", exit 0) · full npm run test:e2e twice in a row: both exit 0 (summaries below) · lint with round--eslint-r1e.config.mjs on js/main.js and tests/e2e/*.mjs: exit 0
deviations: none. One note: I could not reproduce the S4A5 flake itself (see item 1); I proved the cause deterministically instead.
questions: none

Agent: settings-sheet-builder-r6 · dispatched: 2026-10-11T12:51:41Z

Worktree /home/user/wt-settings-sheet-r4, E2E_PORT=24520 E2E_MOCK_PORT=24521 (mutants and load loops on 24530/24531). Staged, not committed. Probes and mutants ran in a mktemp copy under the scratchpad, never in the worktree. I could not delete that copy: the safety check refused the `rm -rf $(...)`, so it is still in the scratchpad directory (`mut.*`). It is outside the repo.

## Item 1, S4A5: first-run cases that count requests over simulated time on a paused clock

Cause: those cases used `clock: { time }`, and Playwright's installed clock keeps flowing with real time. Under load, real seconds were added on top of the `runFor` steps.

Fix, in tests/e2e/first-run.spec.mjs only:
- `pauseAtChecked(page, time)`: the r3 pattern from brightness.spec.mjs. It re-pauses until the page's `Date.now()` equals the target and gives up with a clear error after 8 tries.
- `freezeClock(page, start)`: pauses one second after the install time, before `page.goto`. After that, `runFor`/`fastForward` are the only things that move time.
- Applied to "a plex.tv network failure retries at most once per 30 s", the K50 hour case, and both K50 asleep cases.

Proof of cause. I could not make the old test fail naturally: 10 runs of the single case and 6 runs of the whole old first-run spec under load (6 busy loops plus `npm test` looping on a 4-core box) all passed. So I added 3 real seconds before `runFor(29_000)`:
```
--- OLD spec + 3 s of real delay:
case a plex.tv network failure retries at most once per 30 s and does not spam the console failed:
AssertionError [ERR_ASSERTION]: 2 pins after 29 s
FAIL first-run
--- NEW spec + 3 s of real delay:
  ok  network failure: 4 attempts in 121 s, 3 console errors, then recovers
PASS first-run
```
20 runs under load, all passing. Each run is the network-failure case plus the four K50 cases, with 6 busy loops plus `npm test` looping alongside:
```
run 19 done: pass=19 fail=0
run 20 done: pass=20 fail=0
NEW under load: pass=20 fail=0
```

## Item 2, S4A1 (K52): the cancel test reads the pin count before the cancel

In "SSC3 cancelling the PIN keeps the approved token...", `const pins = tv.pins` now comes before `page.click('#pin-cancel')`.

Mutant: removed `&& !pendingToken` from `firstRunWanted` (in the mktemp copy):
```
case SSC3 cancelling the PIN keeps the approved token for the next open, unsaved and with no new code asked for failed:
AssertionError [ERR_ASSERTION]: the token is waiting: no new code is asked for
2 !== 1
1 of 1 first-run cases failed
FAIL first-run
```
The unmutated tree passes.

## Item 3, S4A2 (K51): the hour test runs on to the 4th code's expiry

The K50 hour case now runs on past 60 min in 5 s steps until the card shows the rest message, which must happen between 64 and 67 min. It then asserts:
- `tv.pins` is still 4 (no instant 5th code),
- zero requests over nine 30 s steps (5 quiet minutes),
- the rest card at each step,
- the 5th pin after the rest.

The case now prints `K50 5 codes and 724 polls in 71 min`.

Mutant: `unused = 0` right after the rest:
```
case K50 an unanswered code is polled every 5 s while fresh; after 3 expire unused it waits 5 minutes; an hour stays small failed:
AssertionError [ERR_ASSERTION]: the 4th code ran out unused and a rest started (none by 4200 s, 5 codes asked for)
1 of 1 first-run cases failed
```

## Item 4, S4A3: a plex.tv `continue()` is flagged

In tests/e2e/lib.mjs, `guardNetwork` wraps only `fulfill` and `abort` now. `continue` no longer counts as answering a plex.tv request, because it reaches the real service. The flag text says so. The comments in the file are updated. No current spec continues a plex.tv request. The `continue()` calls in content-rating.spec.mjs are on local image routes and are not tracked.

The guard self-test in settings-sheet.spec.mjs has a new block: a catch-all `context.route(/plex\.tv/, r => r.continue())` followed by a `GET https://plex.tv/api/v2/user` must be flagged. The old "continued counts as answered" case is removed. Written first, it failed on the old lib:
```
AssertionError [ERR_ASSERTION]: a plex.tv request that was continued is flagged
  actual: '', expected: /api\/v2\/user/
FAIL settings-sheet
```
With the fix: `ok  SSA2 the guard flags a plex.tv path no handler answered`.

## Item 5, S4A4: the empty card

Both e2e checks were written first and failed on the r4 code:
```
case SSC3 cancelling the PIN ... failed:
AssertionError [ERR_ASSERTION]: the card says the sign-in worked
case K50 an unanswered code ... failed:
AssertionError [ERR_ASSERTION]: rest at 2740 s: no instruction to enter a code
true !== false
```
Changes:
- **js/main.js**
  - `showFirstRun(code, status, { rest })` toggles a `resting` class on `#firstrun`.
  - The 5-minute rest passes `rest: true`.
  - When the rest ends, the status goes back to "Asking plex.tv for a code…". This stops the stale "ran out" text staying up while the next code is requested.
  - `unconfiguredMessage()` returns "Signed in. Open settings to finish." while `pendingToken` is set, and "Connect to your Plex server to get started." otherwise.
  - `applySettings` uses it.
  - `finishFirstRun` shows it when the PIN was cancelled and the token is still waiting.
  - The Open settings button is the primary button there, because there are no fixes.
- **css/app.css**: `.firstrun.resting .firstrun-lead, .firstrun.resting .pin-code-large { display: none; }`.
- **tests/e2e/first-run.spec.mjs**
  - `restCard()` runs at every 30 s step of both rests and checks:
    - the instruction line and `#signin-code-large` are not visible,
    - the card's `innerText` has neither "enter this code" nor the `····` squares,
    - the status matches "ran out ... 5 minutes".
  - `codeCard()` checks the instruction and code are visible again on the first, third and fourth codes.
  - The cancel case checks that the card says "signed in" and "open settings to finish", does not say "get started" or "enter this code", has no code showing, and has the Open settings button visible.

## Lint and unit tests
```
eslint -c .../round--eslint-r1e.config.mjs js/main.js tests/e2e/*.mjs   -> exit 0
npm test  -> # tests 317  # pass 317  # fail 0
```

## Full `npm run test:e2e`, twice in a row (E2E_PORT=24520 E2E_MOCK_PORT=24521)
```
full run 1 exit 0
full run 2 exit 0
```
Both runs printed PASS for all 17 specs: brightness, cache-first, content-rating, display-decode, first-run, helper, kiosk, metadata, now-playing, pi-stability, pixel-shift, rotation, settings-sheet, sleep, smoke, status, ui-rotation. Summary lines from each run:
```
  ok  K50 5 codes and 724 polls in 71 min
all 18 first-run cases passed
all 28 settings-sheet cases passed
```
Logs are in the session scratchpad (`full-1.log`, `full-2.log`).

## Staged state
`git status --short` shows only the r4 tree's 16 staged paths, with nothing unstaged and nothing untracked. Nothing was committed.
