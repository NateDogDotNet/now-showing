produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: kiosk-and-pin · round: r4
status: complete        failure_class: n/a
paths: js/kiosk.js, js/main.js, css/app.css, tests/kiosk.test.js, tests/e2e/kiosk.spec.mjs (all staged in /home/user/wt-kiosk-and-pin-r4; the other 4 phase files index.html, js/settings-ui.js, sw.js, tests/e2e/smoke.spec.mjs stay staged from r3, unchanged by me)
criteria: 1 met (test -f tests/kiosk.test.js && node --test tests/kiosk.test.js: 31/31) · 2 met (npm test: 279 pass, 0 fail) · 3 met (E2E_PORT=22620 E2E_MOCK_PORT=22621 npm run test:e2e -- kiosk: all 36 kiosk cases passed; full npm run test:e2e exit 0, 211 ok lines, no FAIL) · 4 met (node scripts/check-precache.mjs: 28 precached files OK) · 5 met (grep exit 0) · 6 met (grep exit 0) · 7 narrated (reviewers) · lint met (eslint -c round--eslint-r1e.config.mjs on js/kiosk.js js/main.js js/settings-ui.js sw.js tests/kiosk.test.js tests/e2e/kiosk.spec.mjs tests/e2e/smoke.spec.mjs: exit 0)
deviations: none. Staged, not committed. Approach r4 as briefed (lock stays in the prompt; resetLock() added and called from boot's reset branch). One choice the brief left open: a short or empty entry in verify mode clears the entry and shows "Enter your PIN (4 to 8 digits)." (same pattern as choose mode's "Use 4 to 8 digits.").
questions: none

Agent: kiosk-and-pin-builder-r4 · dispatched: 2026-10-10T22:53:06Z

## Changes (smallest set)
- js/kiosk.js
  - `clampLock(lock, now)` (new export): `lockedUntil` ≤ now + 15 min. `parseLock(raw, now)` applies it when `now` is a finite number (calls without `now` behave as before). The prompt reads the stored lock with `now()` and writes through `clampLock` (KCM1). `recordFailure`'s own `Math.min` cap is untouched, so the r3 lock-uncapped mutant is still killed by the r3 unit case.
  - Dialog keydown: `e.repeat` is ignored (digits, Backspace, Enter; a repeated Enter on a button is `preventDefault`ed so it does not re-click). In verify mode an entry shorter than PIN_MIN is a hint, never `recordFailure` (KCI1).
  - `resetLock()` on the prompt: `lock = noLock()` and `storage.removeItem(LOCK_KEY)` (KAI1).
- js/main.js: boot's reset branch calls `pinPrompt.resetLock()` in place of `storage.removeItem(LOCK_KEY)` (the now-unused `LOCK_KEY` import is removed); the Enter hold arms only on `!e.repeat` (KAM1; the first keydown of a wake is already swallowed at window capture, so a held Enter through a wake never arms it).
- css/app.css: `.pin-box .btn { min-height: 48px; justify-content: center; }` (KAM2; Cancel measured 39.75 px before, 48 px after).
- tests/kiosk.test.js: 2 cases (stored lock 1 day ahead expires 15 min later after `parseLock(raw, now)`; `clampLock`). tests/e2e/kiosk.spec.mjs: 4 cases (held Enter / empty / short / held digit; Cancel 48 px; resetPin session lockout; Enter held through a wake).

## Red on the r3 code (tests first)
Unit, r3 js/kiosk.js: whole file fails to load (`SyntaxError: ... does not provide an export named 'clampLock'`). With the clampLock import removed in a scratch copy, the parseLock case fails on r3 code:
```
not ok 17 - a stored lock a day ahead is clamped to 15 minutes ahead when read, so it expires 15 minutes later
    clamped to now + 15 min   expected: 1900000   actual: 87400000
not ok 18 - clampLock caps a lock ... error: 'clampLock is not defined'
# pass 29  # fail 2
```
E2E, `node tests/e2e/run.mjs kiosk` on the r3 app code (4 of 36 failed):
```
FAIL a held Enter (key auto-repeat) ... AssertionError: a held Enter records no failure
  + actual '{"failures":5,"lockedUntil":1791672952377}'  - expected null
FAIL the PIN dialog Cancel button is at least 48 px tall: Cancel is 39.75 px tall
FAIL after a resetPin load the lockout is cleared for the session ...: one wrong PIN does not lock
FAIL an Enter held through a wake from sleep does not reveal the controls...: a hold that began asleep reveals nothing (true !== false)
4 of 36 kiosk cases failed
```
(The held-digit assertion was added after this run, to separate the e2e from the short-entry guard; see mutants.)

## Green after the fix
```
node --test tests/kiosk.test.js      # tests 31  pass 31  fail 0
npm test                             # tests 279 pass 279 fail 0
npm run test:e2e -- kiosk            # all 36 kiosk cases passed   (exit 0)
node scripts/check-precache.mjs      # 28 precached files OK
npm run test:e2e                     # exit 0; 211 "ok" lines; PASS brightness cache-first content-rating display-decode kiosk metadata now-playing pixel-shift rotation sleep smoke status ui-rotation (+ the per-case PASS lines); no FAIL
npx eslint -c .../round--eslint-r1e.config.mjs <7 staged JS files>   # exit 0
```

## Mutants (scratch copies in mktemp -d; the worktree was never mutated)
| mutant | result |
|---|---|
| drop the dialog `e.repeat` guard | e2e "held Enter" case FAIL (killed; needs the held-digit assertion, since the short-entry guard alone also hides the lockout) |
| drop the short-entry hint (count it as a failure) | e2e FAIL (killed) |
| drop `pinPrompt.resetLock()` in boot | e2e "lockout is cleared" FAIL (killed) |
| drop `!e.repeat` on the Enter hold | e2e "through a wake" FAIL (killed) |
| Cancel min-height 40 px | e2e "Cancel button" FAIL (killed) |
| parseLock ignores `now` | unit case 17 FAIL (killed) |
| clampLock does not clamp | unit cases 17 and 18 FAIL (killed) |

## Stability
The 4 new e2e cases, 12 rounds each (48 runs) with `npm test` running alongside: 0 failures.

## Notes for the conductor
- KAI1's e2e follows the brief: seed PIN + lock (9 failures, 14 min), route config.json to `{"resetPin": true}`, open Settings (no PIN), set a new PIN, Save, `s`, one wrong PIN gives "Wrong PIN. Try again." with `pinLock.failures === 1`, then the new PIN opens Settings.
- The KAM1 e2e pauses the fake clock 1 s ahead once asleep (03:00, kioskMode + sleepEnabled), then sends Enter keydowns (the first wakes and is swallowed, the rest are repeats), runs 3.5 s and asserts the controls stay hidden; a fresh non-repeat 3 s hold afterwards does reveal them (so the check is not vacuous).
- KCM1 has a unit test only (no e2e), as the brief's wording allowed.
