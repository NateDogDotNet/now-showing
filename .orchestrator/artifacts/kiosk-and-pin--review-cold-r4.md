produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: kiosk-and-pin · round: r4 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: kiosk-and-pin-review-cold-r4 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T23:10:53Z · Method: cold phase review · Scope: kiosk-and-pin, r4, base a78ef50, tree 256bfa8

## What I read and ran
- `git diff --cached` in /home/user/wt-kiosk-and-pin-r4 (`git write-tree` = 256bfa8aca7f…). Read staged `js/kiosk.js` in full, the `js/main.js` and `js/settings-ui.js` hunks plus the code they call: the sleep swallow (main.js:394-437), the data-action click and shortcut handlers (main.js:690-717), `renderDiagnostics` (main.js:626-660), `settingsUI.open/isOpen` (settings-ui.js:333-348), and `toExport`/`fromImport`/`NEVER_EXPORT_KEYS` in js/settings.js. I also checked the config.json bypass in sw.js:62.
- Scratch: `mktemp -d` → /tmp/tmp.pK5TC4agQY. Ran `git worktree add --detach … HEAD`, applied the staged diff with `git apply --index` (write-tree matched 256bfa8) and symlinked node_modules.
  - `npm test`: 279 passed, 0 failed.
  - `E2E_PORT=22861 E2E_MOCK_PORT=22862 node tests/e2e/run.mjs kiosk smoke`: "all 36 kiosk cases passed", PASS kiosk, PASS smoke.
  - Probe `probe/clock.mjs`: drives `createPinPrompt` with a fake dialog and an injected `now` (output quoted under Important 1).
  - I removed the worktree and the temp dir afterwards. The live worktree was not touched.

## Strengths
- Every route to Settings and Diagnostics goes through one `requestPin()`: the button, `s`/`d`/`r`, the empty card and first run. The `settingsUI.open` `dialog.open` guard makes the shared-promise double resolve harmless. Import is gated on the file arriving. Reset, the token reveal and an export with secrets each re-ask. `fromImport` and `toExport` drop the PIN keys, and the live preview pins the kiosk and PIN fields to their saved values.
- The prompt state machine holds up against the races I tried. A late `close` is ignored while a newer question is open (`dialog.open || cancel()`). `verify()` after an Escape cancels the stale session first. An Escape during an in-flight hash leaves `session !== s`, so the result is dropped and nothing leaks. `busy` blocks overlapping submits.
- Auto-repeat is preventDefault'ed inside the dialog, and entries shorter than 4 digits never count as attempts. Enter on a keypad button is left to the native click, so OK is not double-submitted. The Enter hold ignores `repeat`. A first press while asleep is stopped by the window-capture `manualWake` before the document-capture hold listeners, so neither hold can arm through a wake.
- `inert` on #controls in kiosk mode keeps Tab out. The corner zone follows `--ui-rotation`, and only a primary pointer that stays within 12 px counts.

## Issues

### Critical
None found.

### Important
1. **The in-memory lockout is never re-clamped, so after the clock steps back a lock lasts until the clock catches up, not 15 min (code-bug).**
   - Location: js/kiosk.js:127 (`lockRemainingMs` caps only the value it reports), :257 and :268 (`ask`/`submit` read `lock` as is). `clampLock` runs only when the stored value is parsed at construction (:228) and when it is written (:282).
   - Reproduction (scratch probe against the staged kiosk.js): `now` = 2030-01-01. Enter 5 wrong PINs, so the lock is `{"failures":5,"lockedUntil":1893456060000}`. Step the clock back one year (an RTC running ahead, then corrected by NTP) and advance 16 min. Then enter the right PIN. Output: `right PIN 16 min after clock step back: still locked: Too many wrong PINs. Try again in 15 min.` The message stays at "15 min" on every attempt until the wall clock reaches `lockedUntil − 15 min`, which here is a year away. Only a page reload clears it, because `parseLock(raw, now)` clamps on load, and a kiosk rarely reloads.
   - Why it matters: the change promises a lock "never longer than 15 min from now even if the stored value says otherwise". Here the owner is locked out of Settings indefinitely, and the message keeps falsely saying 15 min.
   - Fix: re-clamp before every read, e.g. `lock = clampLock(lock, now())` at the top of `ask()` and `submit()`, or make `lockRemainingMs` compute from a clamped copy and write it back. Add a unit test: lock, step `now` back by days, advance 15 min + 1 ms, expect the right PIN to be accepted.

### Minor
1. **In kiosk mode, long-press is blocked inside Settings fields too (code-bug).**
   - Location: js/main.js:801, `document.addEventListener('contextmenu', (e) => state.settings.kioskMode && e.preventDefault())`. The listener has no target filter. Settings and the other dialogs sit outside #app (main.js:372 comment), but they still dispatch through `document`.
   - Reproduction: kiosk on, on a touch device. Enter the PIN, open Settings, then long-press the Plex token or server URL input. No paste/select menu appears because the event's default is prevented.
   - Why it matters: an admin who has already passed the PIN cannot paste a token on a touch kiosk. The stated aim, stopping a long press on the viewer from opening a menu, only needs #app.
   - Fix: `state.settings.kioskMode && !e.target.closest?.('dialog[open]') && e.preventDefault()`, or scope the listener to `$('app')`.
2. **A prompt opened during the boot config.json wait can never succeed if the reset flag then clears the PIN (code-bug).**
   - Location: main.js boot. `readConfigJson()` is awaited for up to 2.5 s (now on every load) before the `resetPin` handling runs, and the `s`/`d` shortcuts and the empty card are already live during that wait.
   - Reproduction: serve config.json `{"resetPin": true}` slowly, with a PIN set. Press `s` within the wait and the PIN dialog opens. When config.json arrives the hash is cleared, so `verifyPin` returns false for every entry (no hash, kiosk.js:105). Each 4-digit try counts as a wrong PIN and adds to the lockout until the user cancels.
   - Fix: after the reset, cancel any open verify, or have `submit()` resolve true when `getAuth().hash` has become empty.

## Declined to judge
- **Clock moved forward ends a lock early; clearing localStorage or a second tab resets or splits the counter.** Anyone who can do these controls the device. The change calls the PIN a deterrent, so I treat these as accepted, not as bypasses.
- **config.json is now fetched on every load with a 2.5 s timeout, instead of only on first run.** This is a boot-latency trade-off the reset flag needs. It is a product choice. The loopback-only serving it relies on is in the server, outside the diff.
- **Diagnostics still shows the first 4 token characters.** This is unchanged by the diff and is now behind the PIN.
- **Remotes that send repeated keydowns without `repeat=true`.** This is device behaviour outside the code. The entry is cleared after each wrong try, so the later OK presses are short entries and do not count.

## Recommendations
Fix Important 1 and add its regression test. Minor 1 is a one-line scope fix, and Minor 2 is cheap to close at the same time.

## Assessment
The gating is complete. I found no route to Settings, Diagnostics, import, reset, the token reveal or the token export without the PIN, and no PIN material in export, logs, Diagnostics or the DOM. Sleep swallowing, the live preview, the status dot and rotation are intact, and the unit and kiosk/smoke e2e suites pass. One stated guarantee fails as written: a lock can outlast 15 min when the clock steps back within a session.

Files read: staged diff (css/app.css, index.html, js/kiosk.js, js/main.js, js/settings-ui.js, sw.js, tests/e2e/smoke.spec.mjs); js/main.js (staged, ranges above); js/settings-ui.js:328-352; js/settings.js:98-114, 190-230; sw.js fetch handler (grep); tests/e2e/run.mjs:1-40; tests/e2e/lib.mjs (port lines via grep); package.json.

**Verdict:** CHANGES REQUESTED
