produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: settings-sheet · round: r4
status: complete        failure_class: n/a
paths: js/main.js, js/settings-ui.js, js/duration.js, tests/duration.test.js, tests/e2e/lib.mjs, tests/e2e/first-run.spec.mjs, tests/e2e/settings-sheet.spec.mjs (r4 edits, all staged); the other nine staged r3 files are unchanged by r4: css/app.css, index.html, js/plex.js, js/util.js, scripts/mock-plex.mjs, sw.js, tests/plex.test.js, tests/e2e/brightness.spec.mjs, tests/e2e/helper.spec.mjs. Outside the worktree: /home/user/plex-poster-app/.orchestrator/questions.md (appended Q-ss5, Q-ss6).
criteria: 1 met (test -f tests/plex.test.js tests/duration.test.js && node --test tests/plex.test.js tests/duration.test.js: 46 pass, 0 fail) · 2 met (npm test: 317 pass, 0 fail) · 3 met (settings-sheet PASS inside the full e2e run) · 4 met (first-run PASS inside the full e2e run) · 5 met (grep pixelShift: false) · 6 met (node scripts/check-precache.mjs: 30 precached files OK) · 7 met (the grep chain, exit 0) · 8 met (git status --porcelain on settings.js engine.js display.js layout.js is empty) · full `npm run test:e2e` with E2E_PORT=24220 E2E_MOCK_PORT=24221, run once: all 17 specs PASS, 0 FAIL lines (the r5 builder's e2e run was going at the same time on 24320/24321, so it ran under extra load) · lint with round--eslint-r1e.config.mjs on every staged .js/.mjs file: exit 0
deviations: (1) SSC4 changed an r3 assertion in my own spec: the case "U2 a stored 10 s shows 0.2 minutes" now expects 0.17 and a retype of it, because 0.2 minutes saves 12 s, not 10 (the very drift SSC4 names). (2) K50 reading and the pending-token reading are proposals, filed as Q-ss5 and Q-ss6; the work was built on them (details below). (3) The poll step PIN_POLL_MS goes from 2 s to 5 s in the shared pinSignIn, so the Settings sheet's own Sign in with Plex polls every 5 s too, not only the card. (4) first-run "code on the card" case now waits for the first poll (up to 8 s) instead of a fixed 2.5 s, because the first poll is now 5 s after the code. (5) The guard counts route.abort() as answered as well as fulfil and continue, because an aborted plex.tv request never reaches the service (first-run uses abort to simulate an outage). (6) `superpowers:verification-before-completion` is not in the skill list of this environment; I verified by running every command below and by mutation.
questions: Q-ss5, Q-ss6

Agent: settings-sheet-builder-r4 · dispatched: 2026-10-11T11:19:50Z

## What changed, per item (tests first, each pasted failing on the r3 code)

Red runs were taken by putting the r3 staged file back for the run (`git show :js/main.js`, `:js/settings-ui.js`, `:js/duration.js`) and restoring the r4 file straight after (`cmp` identical).

### 1. SSC1 — the "Turn off unwatched only" fix is behind the PIN
Code: `runFix('unwatched')` in js/main.js is now `if (id === 'unwatched' && (await requestPin())) return applySettings({ ...state.settings, unwatchedOnly: false })`.
Tests (settings-sheet.spec.mjs): PIN set, `unwatchedOnly` true, `/__mock/empty`. Empty card: press the fix, the PIN dialog opens and nothing is saved; a wrong PIN keeps the dialog up and `unwatchedOnly` true; the right PIN saves false and a poster comes back. Cancel keeps true. The toast variant (a playing title keeps a poster on screen, playback stops, manual refresh finds an empty pool) does the same.
Red on r3 (`E2E_SHEET_ONLY=SSC npm run test:e2e -- settings-sheet`):
```
case SSC1 with a PIN set, the empty card's unwatched fix asks for it: wrong keeps the setting, right turns it off failed:
page.waitForFunction: Timeout 5000ms exceeded.        (waiting for #pin-dialog to open)
case SSC1 cancelling the PIN leaves the setting alone failed:
page.waitForFunction: Timeout 5000ms exceeded.
case SSC1 the toast's unwatched fix is behind the PIN too failed:
page.waitForFunction: Timeout 5000ms exceeded.
```
Green: `ok SSC1 empty card fix behind the PIN`, `ok SSC1 cancel keeps unwatchedOnly`, `ok SSC1 toast fix behind the PIN`.

### 2. SSC2 — offered only when unwatchedOnly is on
Code: `FIX_APPLIES = { unwatched: (s) => s.unwatchedOnly }`; `fixesFor` filters by it, so the card, the toast and the test result all read the same rule.
Tests: limit G, titles 1-8 rated R, `unwatchedOnly` false: the card's buttons are exactly `['Open settings']`. With `unwatchedOnly` true and the same limit the fix is still offered.
Red on r3:
```
case SSC2 everything above the limit with "unwatched only" off: the card does not offer the unwatched fix failed:
AssertionError [ERR_ASSERTION]: no fix that cannot help
+   'Turn off "unwatched only"',
    'Open settings'
```

### 3. SSC3 — an approved first-run token is kept pending (approach r4)
Code (js/main.js): `pendingToken`. `finishFirstRun` sets it and calls `requestSettings()`. `requestSettings` re-checks `settingsUI.isOpen` after the PIN (a second request that shared the prompt just acts on the open sheet) and otherwise takes `pendingToken` into `settingsUI.open({ ...options, token })`. A cancelled PIN leaves it set. `firstRunWanted()` is false while a token is pending, so the card's code flow stays stopped and no newer token can replace the waiting one. The token never reaches the sheet, so never storage, without the PIN.
Tests (first-run.spec.mjs): PIN set, unconfigured, plex.tv routed with a `hold` switch.
- Press `s`, the prompt opens; release the hold so the card's code is approved while the prompt is up; wait for the "Sign-in code approved" log; enter the PIN. Settings opens, the connection test passes, and the server list was asked with `X-Plex-Token=user-token-123` (the plex.tv route records it). Nothing saved before Save; after Save the stored token is the server's.
- Same through the card's Open settings button.
- Cancel the PIN: Settings stays closed, nothing is saved, no new pin is requested for 1.5 s, and the next `s` plus PIN opens Settings continuing from the approved token; the token is in no console line.
Red on r3: all three failed. The first two at the test-result wait (the sheet opened with a plain "Sign in with Plex" and no token), the third likewise:
```
case SSC3 a code approved while the PIN prompt is open: the right PIN opens Settings filled in with it failed:
page.waitForFunction: Timeout 15000ms exceeded.
    at .../first-run.spec.mjs:297:14
```
Green: `ok SSC3 approved during the prompt -> PIN -> Settings filled in`, `ok SSC3 Open settings variant`, `ok SSC3 cancel keeps the token pending; the next open has it`.
Note: the sheet's token field ends up holding the server's own access token once discovery finishes, so "pre-filled" is proved by the plex.tv resources request carrying the approved token, not by reading the field.

### 4. SSC4 — the Custom field shows what is saved
Code (js/duration.js): `formatMinutes` returns the shortest text of 0 to 3 decimals whose seconds (`round(minutes * 60)`) equal the value to be saved: 15 s is `0.25`, 153 s is `2.55`, 10 s is `0.17`, 150 s is `2.5`, 420 s is `7`.
Tests: unit — `formatMinutes(15) === '0.25'`, and for every whole second from 10 to 86400 the shown text types back to the same seconds (and is at most 8 characters); typed values `0.25 2.55 0.3 0.17 -3 0.01 2.5555 1e1 1440 99999` are stable on a second read. E2E: type 0.25, Tab, the field says 0.25, Save stores 15, reopen shows 0.25, retype saves 15; 2.55 saves 153.
Red on r3 (unit): `not ok 7 ... expected '0.25' actual '0.3'`, `not ok 8 ... expected 10 actual 12`, `not ok 9 ... expected 15 actual 18`. Red on r3 (e2e): `AssertionError: no rounding to 0.3`.

### 5. SSC5 / K50 — plex.tv cadence
Code: `PIN_POLL_MS` 2000 to 5000 (js/settings-ui.js). In js/main.js `runFirstRun` counts codes in a row that expired unused; from the third, it shows "That code ran out. Asking plex.tv for a new one in 5 minutes…" and sleeps 5 minutes (abortable) before the next request. `firstRunWanted()` also requires `!state.asleep`, and `evaluateSleep()` calls `syncFirstRun()` when the sleep state flips, so falling asleep aborts the flow (no polls, no code request) and waking starts a fresh one.
Tests (first-run.spec.mjs, Playwright fake clock, plex.tv routed, code life 900 s, never approved): 12 polls in the first minute; every 5 s step is one request (two only on the step where a code runs out and its replacement is asked for); pin 3 appears after about 30 min; after the third code runs out nothing is requested for 9 x 30 s; the next code comes after the 5 minute rest; the hour ends with `<= 700` requests. Asleep case: schedule 01:00 to 07:00, clock 03:00, 10 minutes of fake time with 0 pins and 0 polls, then a fast-forward past 07:00 gives one pin and a code. A code already on screen stops being polled when the clock crosses into the sleep window.
Result: `ok K50 4 codes and 659 polls in 60 min` (r3 shape: about 1,800 an hour).
Red on r3: `twelve polls in the first minute`, `no code is asked for while asleep`, `nothing asked of plex.tv while asleep`.

### 6. SSA2 — the K48 guard
Code (tests/e2e/lib.mjs): `guardNetwork` is now exported. It wraps `context.route` (and `page.route` for pages made later) so the Route object records when a handler calls `fulfill`, `continue` or `abort`; every plex.tv request is kept and `assertClean()` (now async, with a 150 ms drain, awaited in `withApp`) flags the ones nothing answered, plus any non-local host as before. A route whose pattern merely mentions plex.tv, or whose handler only calls `route.fallback()` with nobody behind it, proves nothing.
Tests: `guardSelfTest()` at the top of the settings-sheet run uses a fake context: a context that routes only `/api/v2/pins` gets `GET https://plex.tv/api/v2/resources` flagged and `/pins` not; a `fallback()`-only route is flagged; fulfil, continue and abort are answered; a local host passes; `example.com` is flagged. `ok SSA2 the guard flags a plex.tv path no handler answered`.
Real-browser demonstration (throwaway spec in a `mktemp -d` copy; it makes one `fetch` to plex.tv that has no route, which the sandbox cannot complete): a token-carrying context routes only `https://plex.tv/api/v2/pins`.
```
--- r3 lib.mjs
PROBE: spec passed (guard did NOT flag the unrouted /api/v2/resources)
--- r4 lib.mjs
PROBE: spec failed: the spec reached beyond the local servers (K48):
  GET https://plex.tv/api/v2/resources?X-Plex-Token=x (plex.tv, no route answered it)
```

## Commands and real output tails

```
$ node --test tests/plex.test.js tests/duration.test.js | grep -E '^# (tests|pass|fail)'
# tests 46   # pass 46   # fail 0
$ npm test | tail
# tests 317   # pass 317   # fail 0   # cancelled 0   # skipped 0
$ node scripts/check-precache.mjs
30 precached files OK
$ eslint -c round--eslint-r1e.config.mjs $(git diff --cached --name-only | grep -E '\.m?js$')   -> exit 0
$ E2E_PORT=24220 E2E_MOCK_PORT=24221 npm run test:e2e      (once, full)
PASS brightness  PASS cache-first  PASS content-rating  PASS display-decode  PASS first-run  PASS helper  PASS kiosk
PASS metadata  PASS now-playing  PASS pi-stability  PASS pixel-shift  PASS rotation  PASS settings-sheet  PASS sleep
PASS smoke  PASS status  PASS ui-rotation        (no FAIL line; PASS ui-rotation is the last line)
```
The spec-level lines the new cases printed in that run: `ok SSC3 approved during the prompt -> PIN -> Settings filled in`, `ok SSC3 Open settings variant`, `ok SSC3 cancel keeps the token pending; the next open has it`, `ok K50 falling asleep stops the polling`, `ok K50 asleep: no requests; awake: a code`, `ok K50 4 codes and 659 polls in 60 min`, `ok SSA2 the guard flags a plex.tv path no handler answered`, `ok SSC4 0.25 -> 15 s, 2.55 -> 153 s, no drift`, `ok SSC1 empty card fix behind the PIN`, `ok SSC1 cancel keeps unwatchedOnly`, `ok SSC1 toast fix behind the PIN`, `ok SSC2 no unwatched fix with unwatchedOnly off`, `ok SSC2 fix offered with unwatchedOnly on`.

## Mutations (copy in `mktemp -d`, ports 24222/24223, copy removed afterwards; the worktree was never mutated)
- unwatched fix without `requestPin()`: 3 of 3 SSC1 cases fail.
- `fixesFor` without the unwatched filter: the SSC2 limit case fails.
- `const token = null` in `requestSettings` (token never taken): 3 of 3 SSC3 cases fail.
- no rest after 3 codes (`++unused >= 1e9`): the K50 hour case fails.
- no `syncFirstRun()` in `evaluateSleep`: "a code on screen stops being polled" fails.
- guard marking every plex.tv request answered: `guardSelfTest` fails (`actual: null, expected: true`).

## Readings to rule on (in .orchestrator/questions.md)
- Q-ss5: K50's "after 3 codes expire unapproved, wait 5 min" is built so the count stays spent until the flow restarts (Settings opened and closed, a wake from sleep, a page load): after the third unused code every further unused code is followed by a 5 minute rest. If the count should restart after each rest, it is a one-line change (reset `unused` to 0 after the sleep); the request volume is then a little higher in steady state (three codes per cycle, about 660 requests an hour, against about 540).
- Q-ss6: while an approved token waits for a PIN-gated open, the card's code flow stays stopped and the card shows its plain "Connect to your Plex server to get started." with Open settings. The other choice (restart the flow, let a newer token replace the waiting one) would drop a token, which the approach forbids.

## Not done / out of scope
- No behaviour was added beyond the six items plus the one status line shown during the K50 rest.
- Real-server behaviour of `totalSize` and real plex.tv were not exercised (no network here); both stay (verify) as before.
