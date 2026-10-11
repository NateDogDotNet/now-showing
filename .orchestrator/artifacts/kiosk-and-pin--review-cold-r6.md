produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: kiosk-and-pin · round: r6 · mode: cold
**Verdict:** APPROVE

Reviewer: kiosk-and-pin-review-cold-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T23:40:55Z · Method: cold phase review · Scope: kiosk-and-pin, r6, base a78ef50 (HEAD of /home/user/wt-kiosk-and-pin-r4), tree 7a77c7865a3bdecc3f277063efae84537a2074e3 (staged index)

## What I read and ran

- Read: `git diff --cached` (all 9 files), staged `js/kiosk.js` in full, plus the code the diff calls or is called by: `js/main.js` sleep input swallowing (`manualWake`, the click swallow, ~390-435), `renderDiagnostics`/`openDiagnostics`/action dispatch (~625-705), `onReset` (~599), `js/settings-ui.js` `open`/`isOpen` (~330-350), `js/settings.js` SCHEMA PIN/kiosk keys, `NEVER_EXPORT_KEYS`, `sanitize`, `sw.js` fetch handler (config.json bypass, line 62), `index.html` dialog/#app/controls structure, `tests/e2e/kiosk.spec.mjs` lock cases (~460-560) and its KIOSK_ONLY hook.
- Scratch copy: `D=$(mktemp -d)` = /tmp/tmp.PrrQ2IgsAx; `git checkout-index -a --prefix=$D/src/` (exports the staged index, no change to the repo); node_modules symlinked. Removed afterwards. Tree id re-checked after: still 7a77c78, live worktree untouched.
- `node --test tests/*.test.js`: 284 pass, 0 fail.
- `E2E_PORT=23061 E2E_MOCK_PORT=23062 node tests/e2e/run.mjs kiosk smoke`: "all 39 kiosk cases passed", PASS kiosk, PASS smoke.
- Regression: `E2E_PORT=23065 E2E_MOCK_PORT=23066 node tests/e2e/run.mjs status sleep ui-rotation`: PASS status, PASS sleep, PASS ui-rotation.
- Mutation (teeth check): commented out the write-back in `readLock` (`js/kiosk.js:239`, `if (lock.lockedUntil !== stored.lockedUntil) writeLock(lock);`) and ran `KIOSK_ONLY="a day ahead"` on ports 23063/23064: the case failed at kiosk.spec.mjs:488 ("1 of 1 kiosk cases failed"). Reverted; `diff` against the staged blob was clean.

## Attacks tried (all held)

- **Routes to the gated actions without the PIN:** every `data-action="settings"`/`diagnostics`/`refresh` (controls, empty card), the `s`/`d`/`r` keys and first-run boot go through `requestSettings`/`requestDiagnostics` → `requestPin` (main.js:574-585, 693-696, 924). Token reveal, token export, import (gate on the file `change`, not the button) and Reset all `await requestPin()` (settings-ui.js). Import and provisioning cannot plant a PIN: `NEVER_EXPORT_KEYS`, and `pendingAuth` is only set by `write()` from saved settings or by `choosePin`. The live preview pins `kioskMode`, `disableShortcuts` and the PIN fields to `prev` (main.js:516-517). Two requests at once share one `verify()` promise, and `settingsUI.open` guards on `dialog.open`, so a shared `true` cannot double-open. Diagnostics shows no PIN material (it shows only the first 4 characters of the token, as before).
- **Shortening or skipping a lock:** `submit()` checks `lockRemainingMs(readLock())` before it verifies, so a right PIN while locked is refused and nothing is counted (e2e "five wrong PINs" covers this). `busy` blocks a second submit during the `verifyPin` await. After the await, the failure is recorded on a fresh `readLock()`, and `session !== s` drops a result whose prompt was cancelled. JS is single-threaded, so the write-back cannot interleave with a failure. A second tab shares the same storage key and also reads it fresh. A reload keeps the lock (it lives in storage). A far-future value is clamped and written back once, and later reads take `min(stored, now+15)`, so a read never extends the lock (the mutation above shows the test has teeth).
- **A lock that outlasts 15 min:** `recordFailure` caps at `LOCK_MAX_MS`, `writeLock` clamps, `lockRemainingMs` caps. `failures` is capped at 1000, so `2 ** 995` is finite and `min` holds.
- **The cancelled prompt:** `cancelVerify` → `finish(false)` sets `session = null` before `close()`, resolves the shared promise and blurs focus. The `close` listener does nothing (`dialog.open || cancel()` with no session). The next `verify()` opens a new session. e2e "resetPin cancels an open PIN prompt" passes, and Settings then opens without a PIN.
- **contextmenu:** it is prevented only when `kioskMode && !closest('dialog[open]')`. Outside kiosk mode it is untouched. The `user-select`/`touch-action` CSS applies to `#app` only, and the dialogs are siblings of `#app` (index.html:33-52 vs 67/289/302).
- **Sleep swallowing:** `manualWake` is a window capture listener that calls `stopPropagation`, so a swallowed pointerdown or keydown never reaches the document capture listeners for the corner hold or the Enter hold. Auto-repeat Enter never arms. e2e "Enter held through a wake" and "sleep swallowing still holds with the PIN gate" pass.
- **Timers and listeners:** `createPinPrompt` and the hold listeners are installed once at module load. `showControls` clears `idleTimer` before each reveal or wake, and `applyKiosk` clears it on a toggle. `createHold.start` ignores a re-arm while active. The window `blur` ends both holds.
- **config.json:** the SW bypasses `/config.json` (sw.js:62), so a stale cached flag cannot keep resetting or hide a removed flag.

## Strengths

- The lock has no in-memory copy: it is read, clamped and written back on every look. That removes a whole class of stale-state races.
- Every gated route funnels into a single PIN check (`requestPin`).
- The e2e suite is broad (39 cases, including lock clamping across a reload, auto-repeat, the reset race and synthetic clicks) and, judging by the one mutation I ran, has teeth.

### Critical

None.

### Important

None.

### Minor

1. **Kiosk reveal timer hides and inerts the controls while a sheet opened from them is still up** (code-bug, cosmetic). In kiosk mode, do the 3 s corner hold, tap Settings, enter the PIN, and wait more than 15 s with Settings open. `idleTimer` (`revealControls`, main.js:~762) runs `hideControls()`, which sets `#controls.inert = true`. When Settings closes, the browser tries to return focus to the now-inert Settings button and focus falls to `<body>`. Nothing is exposed and nothing gets stuck: the next corner hold works. It is a small focus regression for keyboard or remote users. Possible fix: in kiosk mode, re-arm the timer while `dialog[open]` exists, or restore focus explicitly.
2. **A Settings sheet opened before the boot-time PIN reset can save the old PIN back** (spec-gap, narrow). The PIN is set and `config.json` serves `{"resetPin": true}`. The user presses `s` during the up-to-2.5 s `config.json` wait and types the right PIN before the fetch resolves, so Settings opens with `pendingAuth` = the old hash. The reset then clears the saved PIN, and Save writes `pendingAuth` back (settings-ui.js `read()`), so the PIN is in force again until the next load, which clears it again. Reaching this needs the PIN, so nothing is bypassed. It only makes the reset slightly less certain. Possible fix: have the reset call `settingsUI` to drop `pendingAuth`, or skip the gate during the wait.

## Declined to judge

- In kiosk mode the shortcuts `r`/`p`/`o`/`f`/space stay live unless `disableShortcuts` is on, and the empty-card "Open settings" button stays tappable. Both are behind the PIN where it matters, so this is a product question.
- The token reveal and the token export ask for the PIN again inside a Settings sheet that was already PIN-gated. This is UX, a product question.
- When localStorage is unavailable, the app's memory fallback means a reload clears the lock. The PIN is described as a deterrent, and the storage wrapper is outside the diff.
- A wall clock stepped forward (or an NTP jump on boot) ends a lock early. That requires control of the device, which is out of scope by the stated threat model.

## Recommendations

None blocking. The two Minors can be picked up opportunistically.

## Assessment

I found no route to Settings, Diagnostics, import, reset, the token reveal or the token export without the PIN. I found no way to shorten or skip a lock, or to stretch one past 15 min, through the read/clamp/write-back path. The cancelled-prompt path resolves cleanly and leaves the prompt reusable. The contextmenu, sleep-swallow, live-preview, status and UI-rotation behaviours are intact. Unit tests and the kiosk, smoke, status, sleep and ui-rotation e2e specs pass on the staged tree.

Files read: git diff --cached (css/app.css, index.html, js/kiosk.js, js/main.js, js/settings-ui.js, sw.js, tests/e2e/kiosk.spec.mjs [lines ~460-560 and 1047-1050 only], tests/e2e/smoke.spec.mjs, tests/kiosk.test.js [run, not read]); staged js/kiosk.js; js/main.js (~390-435, 595-612, 625-705); js/settings-ui.js (330-350); js/settings.js (90-140); sw.js (grep config/fetch); index.html (grep structure); package.json; tests/e2e/run.mjs (grep ports).

**Verdict:** APPROVE
