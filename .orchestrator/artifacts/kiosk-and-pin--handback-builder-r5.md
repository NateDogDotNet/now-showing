produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: kiosk-and-pin · round: r5
status: complete        failure_class: n/a
paths: css/app.css, index.html, js/kiosk.js, js/main.js, js/settings-ui.js, sw.js, tests/e2e/kiosk.spec.mjs, tests/e2e/smoke.spec.mjs, tests/kiosk.test.js (all in /home/user/wt-kiosk-and-pin-r5, staged, not committed; this round edited js/kiosk.js, js/main.js, css/app.css, tests/kiosk.test.js, tests/e2e/kiosk.spec.mjs; the others are the r3 tree as staged)
criteria:
  1. met: `test -f tests/kiosk.test.js && node --test tests/kiosk.test.js` -> 31 pass, 0 fail
  2. met: `npm test` -> 279 pass, 0 fail
  3. met: `E2E_PORT=22720 E2E_MOCK_PORT=22721 npm run test:e2e -- kiosk` -> "all 37 kiosk cases passed" (was 32 in r3; +5 new e2e cases); full `npm run test:e2e` exit 0, 0 FAIL lines, 212 ok lines, every spec PASS
  4. met: `node scripts/check-precache.mjs` -> 28 precached files OK
  5. met: `grep -q 'name="kioskMode"' index.html && grep -q 'id="pin-dialog"' index.html` exit 0
  6. met: `grep -q 'deterrent' index.html js/kiosk.js` exit 0
  7. narrated (reviewers)
  lint: `npx eslint -c .../round--eslint-r1e.config.mjs js/kiosk.js js/main.js tests/kiosk.test.js tests/e2e/kiosk.spec.mjs` exit 0, no output
deviations: (a) No module-level fallback variable for the lock: `safeStorage()` already falls back to an in-memory Map when localStorage is unavailable, so the prompt reads and writes only `storage` and keeps no copy at all. (b) `parseLock(raw, now = Date.now())` takes `now` (default Date.now()); new exported `clampLock(lock, now)`. (c) A far-future lock is written back clamped when read (readLock), otherwise clamping against the current clock on every read would slide the lock on forever. (d) RED for the unit tests was shown with a one-line identity `clampLock` stub appended to the r3 js/kiosk.js (without it the import itself fails), then removed. (e) js/kiosk.js's header comment now says "the clock is passed in, parseLock's default `now` aside".
questions: none

Agent: kiosk-and-pin-builder-r5 · dispatched: 2026-10-10T22:53:06Z

## What changed (round r5)
- js/kiosk.js: createPinPrompt keeps no lock copy. `readLock()` = parseLock(storage) with the clamp, written back if it was clamped; `writeLock()` clamps on write. `ask()`, `submit()` (before and after verify) read through it; success removes the key; a wrong PIN writes `recordFailure(readLock())`. The reset branch in boot() already only clears storage (js/main.js untouched there). KCI1: dialog keydown returns early on `e.repeat` (preventDefault for Enter/digits/Backspace repeats); in verify mode an entry shorter than PIN_MIN (after the lock check) is answered with "Enter your PIN (4 to 8 digits)." and never reaches recordFailure. KCM1: `clampLock`, parseLock clamp.
- js/main.js (KAM1): the Enter hold arms only on `!e.repeat`; the sleep wake's first keydown never reaches the document listener (window-capture stopPropagation), repeats no longer arm it.
- css/app.css (KAM2): `.pin-box #pin-cancel { min-height: 48px; }`.

## Tests first, on the r3 code (RED)
Unit (identity clampLock stub on r3 kiosk.js):
```
not ok 17 - a stored lock more than 15 minutes ahead is clamped when read ...   error: 'clamped to now + 15 min'  expected: true actual: false
not ok 18 - clampLock caps lockedUntil at now + 15 min for what is written ...  expected: 1900000 actual: 87400000
# pass 29  # fail 2
```
E2E on r3 (KIOSK_ONLY=<case>, E2E_PORT=22720):
```
held Enter x9:         + '{"failures":5,"lockedUntil":1791672948374}'  - null   (kiosk.spec.mjs:517)
short entry x6:        AssertionError: Too many wrong PINs. Try again in 60 s.
day-ahead stored lock: stored lock is at most 15 min ahead (86398846)
resetPin lockout (KAI1): + 'Too many wrong PINs. Try again in 14 min.'  - ''
Enter held through wake: the held Enter that woke the display is not a reveal   true !== false
Cancel height (KAM2):  Cancel is at least 48 px tall (40)
```
## GREEN on the r5 code
```
node --test tests/kiosk.test.js   -> tests 31 / pass 31 / fail 0
each of the six cases above       -> PASS (KIOSK_ONLY run)
npm test                          -> tests 279 / pass 279 / fail 0
npm run test:e2e -- kiosk         -> all 37 kiosk cases passed / PASS kiosk
npm run test:e2e (full)           -> exit 0; 0 FAIL; PASS smoke, sleep, rotation, status, ui-rotation, pixel-shift, now-playing, metadata, kiosk ...
node scripts/check-precache.mjs   -> 28 precached files OK
eslint (round--eslint-r1e)        -> exit 0
```
Mutation (scratch mktemp clone, deleted): removing the readLock write-back line makes `a stored lock a day ahead...` FAIL ("stored lock is at most 15 min ahead (86399625)").

## New cases
- unit: parseLock clamp (a day ahead expires 15 min later; later read judged against later clock; near lock untouched); clampLock.
- e2e: held Enter x9 on the focused Settings button (no pinLock, correct PIN opens Settings); empty OK and 12 x6 give a hint, no failure; stored lock a day ahead shows <=15 min and is rewritten <=15 min ahead; resetPin with seeded 9 failures / 14 min lock: Settings opens without a PIN, new PIN set and saved, `s` + new PIN opens Settings in the same session, one wrong PIN gives failures 1, lockedUntil 0; Enter held through a sleep wake does not reveal, a fresh hold does; PIN Cancel offsetHeight >= 48 (in the keypad case).
