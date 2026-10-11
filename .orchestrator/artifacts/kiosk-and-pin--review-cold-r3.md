produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: kiosk-and-pin · round: r3 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: kiosk-and-pin-review-cold-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T22:27:50Z · Method: cold code review · Scope: kiosk-and-pin, r3, base 9263977, tree e8d6016

## What I read and ran

- Read: `git diff --cached` (all 9 files), staged `js/kiosk.js` in full, and the code the change calls or is called by: `js/settings.js` (SCHEMA kiosk keys, `NEVER_EXPORT_KEYS`, `sanitize`, `load`/`save`, `toExport`, `fromImport`), `js/settings-ui.js` `open`/`isOpen`, `js/main.js` sleep swallowing (`manualWake`, lines 394-436), `openDiagnostics`/`renderDiagnostics`, `onReset`, the `[data-action]` click router, `index.html` controls/empty card/diagnostics markup, `package.json`, `tests/e2e/run.mjs` and `lib.mjs` headers, the top of `tests/e2e/kiosk.spec.mjs`.
- Scratch: `mktemp -d` gave `/tmp/tmp.IMShsFIxlo`. I exported the staged index there with `git checkout-index -a --prefix=` and symlinked `node_modules` from `/home/user/wt-e2e-harness`. I deleted the directory afterwards. The live worktree is untouched: `git write-tree` still gives e8d6016, before and after.
- `node --test tests/*.test.js`: 277/277 pass.
- `E2E_PORT=22571 E2E_MOCK_PORT=22572 node tests/e2e/run.mjs kiosk smoke`: all 32 kiosk cases PASS and smoke PASS.
- Fallback SHA-256: compared against `node:crypto` on 355 inputs. These covered every byte length from 0 to 299 (so all the padding boundaries: 55, 56, 63, 64, 119, 120), the NIST "abc" and 448-bit vectors, NUL, and non-ASCII text, including astral-plane characters via UTF-8. I ran it through the fallback, through `sha256()` with no crypto, and through Web Crypto: **0 mismatches**. "abc" gives `ba7816bf…15ad`.
- Mutation: I removed the import gate (`if (!(await requestPin())) return;`) in scratch. The kiosk spec then reported `FAIL import asks for the PIN…`. I reverted it.
- Probe spec (scratch only, ports 22573/22574): this is the reproduction for Important #1.

## Strengths

- Every route to Settings and Diagnostics funnels through `requestSettings`/`requestDiagnostics`. I traced the `s`/`d` keys, every `[data-action]` button including `refresh` with no engine, the empty card and first run. Import is gated on the file arriving, so a scripted `change` event is gated too. Export-with-token, the token reveal and Reset everything are each gated as well. `settingsUI.open` guards against a second open.
- PIN material is in `NEVER_EXPORT_KEYS`, so it is stripped on export and refused on import or provisioning. Diagnostics rows and the log carry no hash or salt.
- `shouldResetPin` is a strict `=== true` on a non-array object. The tests also cover `"true"`, `1`, `false`, a 403 or 500 carrying the flag, and a query string.
- The prompt closes the Escape/late-`close` race correctly. Concurrent `verify()` calls share one question. `choose()` refuses to run while busy.
- `manualWake` runs in the window capture phase and stops propagation before the new document-capture corner listener, so sleep's input swallowing is preserved. The spec covers this.
- The live preview pins `kioskMode`, `disableShortcuts` and the PIN fields to the saved values.

## Critical

None.

## Important

1. **Holding Enter for under a second locks the PIN out: auto-repeat and empty entries count as wrong PINs.** (code-bug)
   - **Location:** the `keydown` handler in `js/kiosk.js` `createPinPrompt` (`else if (e.key === 'Enter' && !onButton) press('ok')`, with no `e.repeat` check), and `submit()`, which runs `verifyPin` and `recordFailure` even when `s.entry === ''`.
   - **Reproduction:**
     1. Load with a PIN set.
     2. Focus `#controls [data-action="settings"]`.
     3. Run `keyboard.down('Enter')` and then eight more `down('Enter')`, which is auto-repeat. That is about 0.3 s of a held key at the default repeat rate.
     4. Result: `pin-dialog open true`, `plexPoster.pinLock = {"failures":5,"lockedUntil":…}`, error "Too many wrong PINs. Try again in 60 s."
     5. Typing the correct `2468` + Enter then gives `settings open false` with the same lock message.
   - **Why it matters:**
     - The first keydown activates the focused button, which opens the dialog and moves focus to `#pin-dots`. Every repeat after that submits an empty PIN.
     - TV remotes and kiosk keyboards routinely send repeats on OK. The empty-card "Open settings" button is focusable in kiosk mode too, so a remote user doing the 3 s Enter-hold reveal while that button has focus locks themselves out.
     - Each further accidental hold doubles the lock, up to 15 min.
     - It also means tapping OK with nothing typed counts as a wrong PIN. The described behaviour is "a lockout after repeated wrong PINs", and an empty entry or a key repeat is not a PIN attempt.
   - **Fix:**
     - Ignore `e.repeat` in the dialog keydown, at least for Enter.
     - In `verify` mode, treat an entry shorter than `PIN_MIN` as "enter your PIN" without calling `recordFailure`.
     - Optionally, ignore an Enter whose keydown began before the dialog opened.
     - Add an e2e case for a held Enter that leaves `pinLock` null.

## Minor

1. **A lock with a far-future `lockedUntil` never expires until the wall clock reaches it, which contradicts its own comment.** (code-bug)
   - **Location:** `lockRemainingMs` in `js/kiosk.js` caps the *reported* remaining time at `LOCK_MAX_MS`, but nothing ever clamps the stored `lockedUntil`. `parseLock` accepts any finite positive value.
   - **Reproduction:** `lockRemainingMs({failures:5,lockedUntil:now+86400000}, now + m*60000)` for m = 0, 16, 60 and 600 min returns `[900000, 900000, 900000, 900000]`.
   - **Why it matters:**
     - `submit()` checks the lock before verifying, so after a clock step backwards (a Pi with a wrong RTC that NTP later corrects) the right PIN is refused for days.
     - The comment says "Capped, so a clock stepped backwards cannot lock for days". The only way out is the `resetPin` flag.
   - **Fix:** in `parseLock`/`lockRemainingMs`, clamp `lockedUntil` to `now + LOCK_MAX_MS`, or treat `lockedUntil - now > LOCK_MAX_MS` as expired, and persist the clamped value.

2. **The PIN reset clears the stored lock, but the prompt keeps the old lock in memory for the rest of that load.** (code-bug)
   - **Location:** `pinPrompt = createPinPrompt(...)` runs at module evaluation and reads `LOCK_KEY` once. `boot()` removes `LOCK_KEY` later and never touches the prompt's `lock`.
   - **Reproduction:**
     1. Store a 5-failure lock.
     2. Serve `{"resetPin": true}` and load. Settings opens without the PIN.
     3. Set a new PIN and Save, then press `s`.
     4. Result: the prompt shows "Too many wrong PINs…" because the in-memory lock is still in force. The failure count also stays high, so the next wrong PIN locks again at the escalated duration.
   - **Why it matters:** only within the same load, since a reload re-reads the cleared storage. It is still the opposite of what the reset is for.
   - **Fix:** create the prompt after the reset runs, or expose `pinPrompt.clearLock()` and call it beside `storage.removeItem(LOCK_KEY)`.

## Declined to judge

- That exporting *without* the token needs no PIN. The change's own description gates only the token export. This is a product question.
- That "Change PIN…" and "Remove PIN" inside an open Settings do not ask for the old PIN again. Settings is already behind the PIN, so this is a design choice.
- How the server limits `config.json` to loopback. That code is outside the diff (`scripts/serve.mjs`), so I did not review it.
- Leaking the token through the password input's DOM value once Settings is open. Reaching it requires the PIN, and the PIN is described as a deterrent only.

## Recommendations

Fix Important #1, which is a one-line `e.repeat` guard plus an empty-entry check, and add its e2e case. Minors 1 and 2 are small and sit in the same lock code, so they are worth doing in the same pass.

## Assessment

The gate is complete: I found no route to Settings, Diagnostics, import, reset, the token reveal or the token export that skips the PIN. The fallback hash is correct and PIN material does not leak. The lockout, however, can be triggered by a single held keypress on the very input devices kiosk mode targets, and the right PIN then fails. That is a correctness problem in the lockout as described.

Files read: `git diff --cached` (css/app.css, index.html, js/kiosk.js, js/main.js, js/settings-ui.js, sw.js, tests/e2e/kiosk.spec.mjs [lines 1-60 plus greps], tests/e2e/smoke.spec.mjs, tests/kiosk.test.js [via the diff stat only]); staged js/kiosk.js; js/settings.js lines 80-200 and `fromImport`; js/settings-ui.js lines 325-360; js/main.js lines 390-440, 596-612, 660-705; index.html (grep of data-action and diag ids); package.json; tests/e2e/run.mjs lines 1-40; tests/e2e/lib.mjs (grep of exports and ports).

**Verdict:** CHANGES REQUESTED
