produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: kiosk-and-pin · round: r6
status: complete        failure_class: n/a
paths: js/kiosk.js, js/main.js, tests/kiosk.test.js, tests/e2e/kiosk.spec.mjs (all four edited and staged in /home/user/wt-kiosk-and-pin-r4; the other five staged r4 files, css/app.css index.html js/settings-ui.js sw.js tests/e2e/smoke.spec.mjs, are untouched this round; .orchestrator/artifacts/kiosk-and-pin--handback-builder-r6.md is this report)
criteria: 1 met (test -f tests/kiosk.test.js && node --test tests/kiosk.test.js: 36 pass, 0 fail, exit 0) · 2 met (npm test: 284 pass, 0 fail) · 3 met (E2E_PORT=22920 E2E_MOCK_PORT=22921 npm run test:e2e -- kiosk: all 39 kiosk cases passed, exit 0; full npm run test:e2e exit 0, 13 specs PASS, 214 ok lines, 0 FAIL) · 4 met (node scripts/check-precache.mjs: 28 precached files OK) · 5 met (grep exit 0) · 6 met (grep exit 0) · 7 narrated (reviewers) · lint met (npx eslint -c round--eslint-r1e.config.mjs on js/kiosk.js js/main.js js/settings-ui.js sw.js tests/kiosk.test.js tests/e2e/kiosk.spec.mjs tests/e2e/smoke.spec.mjs: exit 0) · r6 items K4I1, K4M1, K4M2 met, each test red on the r4 code first and each with a killing mutation (below)
deviations: (1) K4M2 adds a small method `cancelVerify()` to the PIN prompt rather than folding the cancel into `resetLock()`; the brief says resetLock() stays as "clears storage", so the cancel is its own call after the PIN is cleared. (2) K4I1(a) is a unit test on createPinPrompt (stand-in dialog, injected now()), not an e2e; (b) is e2e. (3) After a clock step back, the lock is "first looked at" when the dialog is next opened or an attempt is made (the read), and ends 15 min after that look; with no look in between, the first look after the step is the one that starts the 15 min. This is the r5 readLock design the brief names. (4) readLock is written as parseLock (unclamped) then clampLock against now() then write-back when it differs, which is the same behaviour as the r5 candidate's but with one parse.
questions: none

Agent: kiosk-and-pin-builder-r6 · dispatched: 2026-10-10T23:22:51Z

## What changed

js/kiosk.js (createPinPrompt)
- The in-memory `let lock` is gone. `readLock()` reads `plexPoster.pinLock` through `parseLock`, clamps it with `clampLock(stored, now())` and writes the clamped value back when it differs. `writeLock()` writes a lock clamped.
- `ask()` and `submit()` call `readLock()`; a wrong PIN is `recordFailure(readLock(), now())` then `writeLock()`; a right PIN removes the key.
- `resetLock()` now only clears storage (nothing in memory). New `cancelVerify()` ends an open verify with false and counts nothing.

js/main.js
- Boot reset branch: after the PIN is cleared from settings, `pinPrompt.cancelVerify()`.
- contextmenu: `state.settings.kioskMode && !e.target.closest?.('dialog[open]') && e.preventDefault()`.

Tests added (nothing locked from earlier rounds was edited; only new cases were added)
- tests/kiosk.test.js: 5 new unit cases on createPinPrompt with a stand-in dialog and injected clock: (a) 5 wrong PINs, clock back 1 year, +16 min, right PIN accepted in the same page; (a2) same with the dialog closed and reopened between; a stored lock 1 day ahead is written back clamped and a reload every 10 min never moves its end; a wrong PIN after a lock was cleared counts from zero (guard, passes on r4 too); cancelVerify.
- tests/e2e/kiosk.spec.mjs: 3 new cases: lock stored 1 day ahead, reload at +10 min (still locked, end did not slide), Settings opens with the PIN at +16 min; contextmenu not prevented in the open Settings sheet (serverUrl field, token field, the sheet) but prevented on the stage, before and after; PIN prompt open during a gated config.json wait, `{"resetPin": true}` released, prompt gone, `pinLock` null, `s` opens Settings with no PIN dialog.

## Red on the r4 code (tests written first, run before any source edit)

Unit, `node --test tests/kiosk.test.js` on r4 js/kiosk.js: pass 32, fail 4:
```
not ok 20 - five wrong PINs, the clock stepped back a year: the right PIN is accepted 16 minutes later, in the same page
    accepted 16 min later, not when the old clock catches up (Too many wrong PINs. Try again in 15 min.)
not ok 21 - the clock stepped back a year with the dialog closed in between: ...
not ok 22 - a lock stored a day ahead is pulled in and written back when the prompt reads it, so it does not slide on
not ok 24 - cancelVerify ends an open PIN question with false and counts nothing
# pass 32   # fail 4
```
E2E on r4 code (E2E_PORT=22920 E2E_MOCK_PORT=22921 KIOSK_ONLY=<name> node tests/e2e/run.mjs kiosk):
```
FAIL a lock stored a day ahead ends 15 minutes after it was first looked at ...
AssertionError [ERR_ASSERTION]: the stored value was pulled in when first read
FAIL kioskMode: the context menu is suppressed on the stage but not inside an open dialog (long-press paste in Settings)
AssertionError [ERR_ASSERTION]: in a Settings field
FAIL a PIN prompt open while the boot reset clears the PIN is cancelled: nothing counted, ...
  (timeout in waitPin(page, false): the prompt is still open after the reset, kiosk.spec.mjs "waitPin" line)
```

## Green after the change

```
node --test tests/kiosk.test.js        -> # tests 36  # pass 36  # fail 0
npm test                               -> # tests 284 # pass 284 # fail 0
node scripts/check-precache.mjs        -> 28 precached files OK
grep -q 'name="kioskMode"' index.html && grep -q 'id="pin-dialog"' index.html   -> exit 0
grep -q 'deterrent' index.html js/kiosk.js                                       -> exit 0
npx eslint -c .../round--eslint-r1e.config.mjs <7 JS files>                      -> exit 0
E2E_PORT=22920 E2E_MOCK_PORT=22921 npm run test:e2e -- kiosk -> all 39 kiosk cases passed / PASS kiosk
E2E_PORT=22920 E2E_MOCK_PORT=22921 npm run test:e2e           -> exit 0; PASS brightness cache-first content-rating display-decode
   kiosk metadata now-playing pixel-shift rotation sleep smoke status ui-rotation; 214 "ok" lines; 0 FAIL
```

## Mutations (in a mktemp -d copy of the staged tree, node_modules symlinked; the live tree was never mutated; the copy was removed)

| mutation | unit | e2e |
|---|---|---|
| read site: `clampLock(stored, now())` -> `stored` (the now() clamp removed) | 3 fail (20, 21, 22) | "a lock stored a day ahead" FAIL: the stored value was pulled in when first read |
| read-site write-back removed | 3 fail (20, 21, 22) | same case FAIL |
| contextmenu: the `dialog[open]` test removed | 0 | contextmenu case FAIL: in a Settings field |
| main.js `pinPrompt.cancelVerify()` removed | 0 | "a PIN prompt open while the boot reset" FAIL |

Raw output: `/tmp/claude-0/-home-user/754644a7-1380-52e8-802b-a7514b405070/scratchpad/mutations.txt`.

## State

`git status --short` in /home/user/wt-kiosk-and-pin-r4: the same nine staged entries as r4 (css/app.css, index.html, js/kiosk.js, js/main.js, js/settings-ui.js, sw.js, tests/e2e/kiosk.spec.mjs, tests/e2e/smoke.spec.mjs, tests/kiosk.test.js); no unstaged changes; tree `git write-tree` = 7a77c7865a3bdecc3f277063efae84537a2074e3. Nothing committed. No questions appended.

## Declined / not done

- No e2e for K4I1(a) (clock back 1 year): the Playwright fake clock cannot pause backwards, and the unit test drives the real createPinPrompt with an injected now(), which is where the stale copy lived.
- Clock stepped back with no look at the lock until 16+ min later: the first look then starts a 15 min window (see deviation 3). Not changed, not named in the brief.
