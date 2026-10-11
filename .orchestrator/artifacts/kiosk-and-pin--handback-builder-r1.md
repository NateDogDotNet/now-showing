produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: kiosk-and-pin · round: r1
status: complete        failure_class: n/a
paths: js/kiosk.js, tests/kiosk.test.js, js/main.js, js/settings-ui.js, index.html, css/app.css, sw.js, tests/e2e/kiosk.spec.mjs (all staged in /home/user/wt-kiosk-and-pin, not committed); also appended Q-kp1..Q-kp4 to /home/user/plex-poster-app/.orchestrator/questions.md and wrote this file
criteria:
  1. met — `test -f tests/kiosk.test.js && node --test tests/kiosk.test.js` -> 28 pass, 0 fail, exit 0
  2. met — `npm test` -> 276 pass, 0 fail
  3. met for the named command — `E2E_PORT=22420 E2E_MOCK_PORT=22421 npm run test:e2e -- kiosk` -> "all 32 kiosk cases passed", `PASS kiosk`, exit 0 (passed 12 consecutive runs, ~14 s each; one case flaked once in ~25 loaded mutation runs, see notes). NOT MET at suite level: the full `npm run test:e2e` has ONE failure, `smoke` (console-error check), caused by the plan's "fetch config.json on every load" (Q-kp1). Every other spec passes.
  4. met — `node scripts/check-precache.mjs` -> "28 precached files OK", exit 0
  5. met — `grep -q 'name="kioskMode"' index.html && grep -q 'id="pin-dialog"' index.html` -> exit 0
  6. met — `grep -q 'deterrent' index.html js/kiosk.js` -> exit 0 (index.html 1 hit, js/kiosk.js 2 hits)
  7. narrated (reviewer) — not run by me; see "Attack surface" below for the paths I closed
deviations: (a) smoke.spec.mjs fails in the full e2e run because the every-load config.json fetch logs a 404 console error when no config.json exists; I did not touch smoke.spec.mjs (outside Output) and raised Q-kp1. (b) One post-RED edit to tests/kiosk.test.js: I removed an `undefined` entry from the "fallback hasher used" crypto list because a default parameter turns `undefined` into the real crypto, so it could not exercise the fallback; the `{}`, `{subtle: undefined}`, `{subtle: {}}` and `null` entries do. (c) The skill `superpowers:verification-before-completion` is not installed in this session ("Unknown skill"); I did the verification by hand (fresh runs of every criterion below plus 7 mutation probes). (d) Added `dialog[open]` instead of `dialog` in main.js's shortcut guard (see notes). (e) Added body.kiosk CSS (`touch-action: none` on #app only) and a kiosk-only `contextmenu` preventDefault so a long press cannot cancel the hold; unverifiable on real touch hardware (verify).
questions: Q-kp1, Q-kp2, Q-kp3, Q-kp4 (all in .orchestrator/questions.md; none held work)

Agent: kiosk-and-pin-builder-r1 · dispatched: 2026-10-10T20:30:33Z

## What was built
- `js/kiosk.js` (new, in SHELL): pure `sha256Fallback`, `sha256` (Web Crypto when `crypto.subtle` exists, fallback otherwise or if digest throws), `randomSalt`, `hashPin`/`createPinAuth`/`verifyPin` (salted: SHA-256 of `salt:pin`, constant-time compare), lockout (`noLock`, `recordFailure`, `recordSuccess`, `lockRemainingMs`, `parseLock`), `cornerZone(rotation, viewport)` + `inZone`, `createHold` (cancels on > 12 px from the start point or early end; second start ignored for key auto-repeat), `shouldResetPin`, `PIN_NOTE` (contains "deterrent"), and `createPinPrompt` (the only DOM part; drives `#pin-dialog`; verify() / choose()).
- `js/main.js`: one gate. `requestPin()` -> `requestSettings()` / `requestDiagnostics()`; the `s` and `d` keys, every `data-action` click (controls, empty-card button, refresh with no engine), first-run open all call them. `settingsUI` receives `requestPin` and `choosePin`. Kiosk: `applyKiosk`, `showControls`/`hideControls`, `revealControls` (hard 15 s), pointer hold (pointerdown/move/up/cancel, zone from `--ui-rotation`), Enter hold (keydown start, keyup/blur end, independent of `disableShortcuts`). `disableShortcuts` returns early from the key handler. `config.json` is now read on EVERY load (2.5 s timeout); first-run provisioning is unchanged; `{"resetPin": true}` clears `settingsPinHash`/`settingsPinSalt` (saved only when a PIN exists) and `plexPoster.pinLock`, logs a warning, and Diagnostics shows `PIN reset: PIN reset flag present — remove "resetPin" from config.json`. The live preview no longer applies kioskMode, disableShortcuts or the PIN fields.
- `js/settings-ui.js`: token toggle, token export, import (gated when the file arrives, so a scripted `change` is gated) and Reset everything ask `requestPin()`; the token re-hides on close and on open; Set/Change/Remove PIN buttons keep a pending PIN that Save applies (Cancel undoes it); import never changes it. js/settings.js untouched (NEVER_EXPORT_KEYS verified by the e2e export/import cases).
- `index.html`: `#pin-dialog` (class `sheet pin-sheet`, keypad of `<button data-key>`), Kiosk fieldset with `name="kioskMode"`, `name="disableShortcuts"`, PIN status/buttons and the deterrent text. `css/app.css`: `.pin-sheet` centred and rotated with `--ui-rotation` like the other dialogs, 48 px keys, `body.kiosk #app` touch rules. `sw.js`: `js/kiosk.js` added to SHELL (VERSION not bumped, per convention 5).

## Attack surface (criterion 7 prep)
- Keyboard `s`/`d`, Settings/Diagnostics buttons, synthetic `.click()` and dispatched click events on `[data-action]`, the empty-card button, concurrent requests (share one dialog): all asked for the PIN in e2e. Tab never reaches `#controls` in kiosk (inert). A long press without release reveals the controls after 3 s but opens nothing (no PIN bypass). URL tricks (`?resetPin=true`, `#resetPin`) do nothing; only a 2xx `config.json` whose JSON has `resetPin === true` resets (403/500 carrying the flag, `"true"`, 1, arrays and junk do not).
- Lock state survives a reload (`plexPoster.pinLock`); not a security boundary (D16), said in the UI.
- Not covered by me (and not claimed): the server's refusal of `config.json` to non-loopback origins is `serve-config-guard`'s.

## Notes for the conductor
- RED (before js/kiosk.js existed): `node --test tests/kiosk.test.js` -> `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/user/wt-kiosk-and-pin/js/kiosk.js'`, `# fail 1`; `npm run test:e2e -- kiosk` -> same `ERR_MODULE_NOT_FOUND` from tests/e2e/kiosk.spec.mjs, `FAIL kiosk`. (Both fail at import, not on individual assertions; the e2e spec's per-case failures were seen while the implementation was incomplete, e.g. a PIN-dialog race and test-bug fixes described below.)
- Mutation probes in a `mktemp -d` copy (all killed by the e2e spec): requestPin always true (many cases fail); import gate removed (`import asks for the PIN...`); kiosk `wake()` not skipped (7+ cases); token not re-hidden on close (`#token-toggle...`); reset flag only on first run (2 cases); `disableShortcuts` ignored (`disableShortcuts ignores...`); controls not made inert (kiosk cases). The live worktree was not mutated.
- Races found and fixed along the way: (1) an Escape-closed PIN dialog whose `close` event had not fired yet made the next request reuse the dead question (kiosk.js `verify()`/`choose()` now settle it; the `close` handler ignores a late event while a new dialog is open); (2) focus left on a keypad button was remembered by the next modal (Settings) and, after Save, key events targeted a button inside the closed sheet (kiosk.js `finish()` blurs it; main.js's shortcut guard now uses `dialog[open]`).
- Timing in the e2e spec: reveal/hold cases pause Playwright's fake clock (`page.clock.pauseAt`) so 3 s / 15 s are exact and fast; the whole spec runs in ~14 s with 4 cases side by side (`KIOSK_POOL`, `KIOSK_ONLY=<substring>` select cases when debugging).
- One flake seen once in ~25 loaded runs: `kioskMode: turning it on in Settings hides the controls...` failed in a mutation run (cause not found; it passed 6/6 alone and in 12 full runs). I widened its one 3 s wait to 10 s afterwards.
- Behaviour choices that the plan leaves open are in Q-kp2..Q-kp4 (resetPin semantics, lockout cadence, 4-8 digit PIN, per-use token/import/reset prompts, hard 15 s reveal, 2.5 s config fetch timeout).
- Boot now awaits the config.json fetch (<= 2.5 s) before the first poster on every load; `applyKiosk()` and `evaluateSleep()` run before the await so the controls are hidden and the veil is up first.

## Commands and output tails
```
$ cd /home/user/wt-kiosk-and-pin && git status --short
M  css/app.css
M  index.html
A  js/kiosk.js
M  js/main.js
M  js/settings-ui.js
M  sw.js
A  tests/e2e/kiosk.spec.mjs
A  tests/kiosk.test.js

$ test -f tests/kiosk.test.js && node --test tests/kiosk.test.js | tail -8
# tests 28
# suites 0
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
exit=0

$ npm test | tail -8
# tests 276
# pass 276
# fail 0

$ E2E_PORT=22420 E2E_MOCK_PORT=22421 npm run test:e2e -- kiosk | tail -3
  ok  no PIN reset without {"resetPin": true} from a 2xx config.json
PASS the PIN stays without a true flag: {resetPin:false}, "true", 1, a 403 or 500 carrying the flag, a query string
all 32 kiosk cases passed
PASS kiosk          (exit 0; 33 PASS lines = 32 cases + the spec)

$ node scripts/check-precache.mjs
28 precached files OK

$ grep -q 'name="kioskMode"' index.html && grep -q 'id="pin-dialog"' index.html ; echo $?   -> 0
$ grep -q 'deterrent' index.html js/kiosk.js ; echo $?                                    -> 0

$ E2E_PORT=22420 E2E_MOCK_PORT=22421 npm run test:e2e      (full suite, one run, before the last test-only edit)
PASS brightness, cache-first, content-rating, display-decode, kiosk, metadata, now-playing, pixel-shift, rotation, sleep, status, ui-rotation
FAIL smoke
  actual: [ 'Failed to load resource: the server responded with a status of 404 (Not Found)' ]   expected: []   (tests/e2e/smoke.spec.mjs:16)
```
