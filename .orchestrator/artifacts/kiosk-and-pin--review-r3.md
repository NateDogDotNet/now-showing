produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: kiosk-and-pin · round: r3 · mode: anchored
**Verdict:** CHANGES REQUESTED

Reviewer: kiosk-and-pin-review-anchored-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T22:27:50Z · Method: anchored code review (risk:high, ui) · Scope: kiosk-and-pin, r3, base 9263977, tree e8d6016

## What I read and ran
- Read: plan `### 14. kiosk-and-pin`, spec R-KIOSK-1/R-KIOSK-2/R-ROT-2, decisions D2/D10/D16/D28 (and K12, the "never swallow input aimed at a dialog" rule), the phase record (K32-K35), the full staged diff (`git diff --cached`), staged `js/kiosk.js` and staged `js/main.js` (sleep swallow, action routing, status dot).
- Scratch: `D=$(mktemp -d)` (`/tmp/tmp.ei4S6PwwK7`), `git archive e8d6016 | tar -x -C $D`. Live worktree untouched (`git write-tree` still e8d6016 after the run). Scratch removed afterwards.
- Criteria 1, 2, 4, 5, 6: `node --test tests/kiosk.test.js` 29/29 pass; `npm test` 277 pass 0 fail; `check-precache` "28 precached files OK"; the criterion 5/6 greps exit 0.
- Criterion 3 and the full suite: `E2E_PORT=22512 E2E_MOCK_PORT=22513 npm run test:e2e`, **exit 0**. All specs PASS, 207 `ok` lines, kiosk 30 cases PASS. An earlier run on 22510/22511 also passed.
- Criterion 7 and the screenshots: my own probe spec `tests/e2e/zzprobe.spec.mjs` (scratch only, ports 22520/22521). Results below.

## Strengths
- One gate. `requestPin()` (main.js) covers Settings, Diagnostics, `refresh` with no engine, the empty card, first run, token reveal, token export, import (gated when the file arrives, so a scripted `change` is gated too) and Reset everything. Every `data-action` goes through `actions`, so a synthetic click lands on the gate.
- The PIN prompt handles the edge cases. A second `verify()` shares the open question. A late `close` from an earlier question is ignored. Attempts made while locked are refused and not counted (K34). The lock shown is capped at 15 min, and r3 has a unit case that kills the lock-uncapped mutant.
- Live preview pins `kioskMode`, `disableShortcuts`, `settingsPinHash` and `settingsPinSalt` to the saved values. The pending PIN is applied only by Save (K35).
- The sleep swallow (window capture, `stopPropagation`) runs before the kiosk hold listeners (document capture). A press that wakes the display therefore never starts a hold, which fits D28/K12.
- The reset flag counts only for `resetPin === true` in a 2xx `config.json`. `grep -rn resetPin js/` shows no other reset path in the client. Nothing in a URL, an import or localStorage can trigger it. sw.js never caches `config.json` (`sw.js:62`).

## Issues

### Critical
None.

### Important
1. **A PIN reset clears the stored lockout but not the in-memory one, so a new PIN set in the reset session is refused for up to 15 min.** Class: code-bug. R-KIOSK-1 PIN recovery says "the stored settingsPinHash, settingsPinSalt **and the lockout** are cleared".
   - Location: `js/main.js`. `createPinPrompt(...)` runs at module top level and reads `plexPoster.pinLock` into the closure variable `lock` (`js/kiosk.js`, `let lock = parseLock(storage.getItem(LOCK_KEY))`). Later, `boot()` runs `storage.removeItem(LOCK_KEY)` when `pinResetFlag` is set. Nothing resets the closure copy.
   - Evidence (probe `lockreset`): seed PIN 2468 and `pinLock={failures:9, lockedUntil:now+14min}`, then route `config.json` to `{"resetPin": true}`. Result: `lock in storage after reset load null`, and Settings opens without a PIN. I set a new PIN 1357 and saved, then pressed `s`, which gave `"pin":true,"err":"Too many wrong PINs. Try again in 14 min."`. Entering the correct new PIN gave the same message, with Settings still closed.
   - Why it matters: the reset flag exists for a household that has locked itself out, and that is exactly the case where the memory lock is set. They set a new PIN and cannot use it until the old lock runs out. On a kiosk with no keyboard they cannot reload either. The first wrong PIN after that relocks at once, because `failures` carries on from 9, not from 0.
   - Test gap: the e2e reset case never checks the lock in a live session, so the suite cannot catch this.
   - Fix: give the prompt a `resetLock()` (sets `lock = noLock()` and removes the key), or have `verify()` re-read `LOCK_KEY` from storage each time. Call it from the reset branch in `boot()`. Add an e2e step: seed a lock, serve the flag, set a new PIN, then check that it opens Settings in the same session.

### Minor
1. **Holding Enter through a wake from sleep can reveal the controls.** Class: spec-gap.
   - Location: main.js. The first keydown is swallowed by `manualWake`. Auto-repeat keydowns after the wake do reach the `enterHold` listener and start the 3 s timer.
   - Evidence: read only, no run. Nothing in the gate depends on it (Settings stays behind the PIN).
   - The spec is silent on a hold that starts while asleep. Fix if wanted: ignore `e.repeat` when arming `enterHold`.
2. **The Cancel button in the PIN dialog is 40 px tall, below the 44-48 px touch target the keypad meets.** Class: spec-gap.
   - Evidence: probe measured `cancel:[79,40]`; keypad keys measured `key5:[94,48]` with an 18.75 px font.
   - Escape and the backdrop are not usable on a touch-only kiosk, so this is the only way out of the dialog.

## Criterion 7: PASS
All runs below were in kiosk mode with PIN 2468 set, using the probe `c7`, plus code reading.
- **Tab ×25:** focus never entered `#controls` (`tab-into-controls false`, `inert:true`).
- **Keyboard:**
  - With `disableShortcuts` false, `s` and `d` (and `r` with no engine) open the PIN dialog. This is covered by the spec and my probe.
  - With `disableShortcuts` true, the keydown handler returns first, which the spec also covers.
  - There is no `?` shortcut in `KEYS`.
- **Synthetic `dispatchEvent` click on the inert `[data-action=settings|diagnostics]`:** `pin:true, settings:false, diag:false`. `refresh` with an engine only ticks.
- **Empty card and first run:** the "Open settings" button is `data-action="settings"` and goes to the gate. A first run with a PIN and no token showed `pin:true, settings:false`. A provisioned `config.json` cannot plant a PIN, because `fromImport` drops `NEVER_EXPORT_KEYS`.
- **Opening the dialog twice:** `s`, `s`, then a synthetic `d`, then a wrong PIN gave "Wrong PIN", with Settings and Diagnostics both closed. Escape closed everything.
- **Escape/close race:** `close()` followed by a synthetic `s` in the same task reopened the dialog with a fresh question. The correct PIN then opened Settings once.
- **Token:** Show asks for the PIN, and Escape leaves the field `password` with Settings still open.
- **Reset everything:** asks for the PIN, and Cancel leaves Settings open with no confirm shown.
- **Import and export:** both asked for the PIN, and PIN material was ignored in both (spec cases PASS).
- **Long press without release (20 s):** the controls show at 3.3 s and hide at 18.8 s, and do not show again. Releasing does nothing more.
- **Lockout bypass by reload:** blocked. The lock is persisted, and the spec case "five wrong PINs lock the dialog; the lock survives a reload" PASSES.
- **resetPin source:** only `config.json` fetched from the same origin by a relative URL. No other client path exists (grep). serve.mjs refuses non-loopback, which is out of this diff and was verified in serve-config-guard.
- The defect is Important 1 above (a lock that survives a reset). It does not let anyone in without the PIN.

## UI screenshots: PASS
Files at `/home/user/plex-poster-app/.orchestrator/artifacts/kiosk-and-pin--shot-{1920x1080,1080x1920}-{kiosk-idle,controls-revealed,pin-dialog-r0,pin-dialog-r90,settings-pin-section}.png`.
- **Idle:** no controls, and no dot because the app is healthy.
- **Revealed by the corner hold:** the controls bar shows at the viewer's bottom-right.
- **PIN dialog at rotation 0:** centred, box inside the viewport.
- **PIN dialog at rotation 90:** transform `matrix(0,1,-1,0,…)`, so the angle is 90. Box `[704,370,1216,710]` at 1920x1080 and `[284,790,796,1130]` at 1080x1920, both inside the viewport. It reads upright for the viewer.
- **Keypad:** keys are 94x48 px with high contrast, and OK is accented. The dot display does not reveal the digits.
- **Deterrent wording:** clear in both places, the Settings Kiosk fieldset ("The PIN is a deterrent, not security … It is never exported.") and the dialog note (`PIN_NOTE`).

## Declined to judge
- The serve.mjs loopback guard: outside this diff, and ruled in serve-config-guard.
- Whether a kiosk with no PIN should let the empty-card button open Settings: a product question. K33 and the spec gate only when a PIN is set.
- A `lockedUntil` far in the future planted in localStorage shows a permanent 15-min lock. That needs devtools, which is within the D16 deterrent scope.

## Recommendations
Fix Important 1 and add its test. Minor 1 and 2 can go to `touch-and-labels` or `settings-sheet`.

## Assessment
Every plan criterion passes, and I found no way past the PIN. One Important code-bug remains against the R-KIOSK-1 recovery text: the in-memory lockout survives a reset.

**Verdict:** CHANGES REQUESTED
