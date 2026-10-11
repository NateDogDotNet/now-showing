produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: kiosk-and-pin · round: r4 · mode: anchored
**Verdict:** CHANGES REQUESTED

Reviewer: kiosk-and-pin-review-anchored-r4 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T23:10:53Z · Method: anchored confirmation review · Scope: kiosk-and-pin, r4 (resetLock candidate), base = HEAD of /home/user/wt-kiosk-and-pin-r4 (a78ef50 = 9263977 + the plan commit), tree 256bfa8; delta read from 8371304..256bfa8

## What I read and ran

- Read: the delta `git diff 8371304 256bfa8` (css/app.css, js/kiosk.js, js/main.js, tests/e2e/kiosk.spec.mjs, tests/kiosk.test.js); js/kiosk.js:118-360; js/main.js:570-600, 698-800; plan §14; the phase record (K32-K35, the r3 triage list).
- Scratch setup: `mktemp -d`, then `git worktree add --detach` from HEAD, `git read-tree 256bfa8 && git checkout-index -a -f` (`git write-tree` gives 256bfa8), and a second plain copy for mutations. node_modules was symlinked from the live worktree. Ports were 22810/11 (full run), 22820/21 (targeted runs and mutations), 22830-33 (probes). Afterwards I removed the scratch worktree and directory. The live worktree is unchanged: `git write-tree` there still gives 256bfa8, with 9 staged entries.
- Unit tests: `npm test`: 31 pass, 0 fail.
- Full e2e: `E2E_PORT=22810 E2E_MOCK_PORT=22811 node tests/e2e/run.mjs`: **exit 0**, 95 PASS lines, 0 FAIL.
- Mutation runs: one targeted e2e or unit run per r3 fix, with that fix reverted, then restored. Restoring was checked with `diff -r` against the clean copy. Results are in the table below.
- Probe scripts: my own Playwright probes in the scratch copy covered the screenshots, a far-future lock, reload, short-entry counting, synthetic `data-action` clicks, stacked prompts, and shortcuts with disableShortcuts.

## r3 findings: status

| r3 | Status | Evidence |
|---|---|---|
| KCI1: a held Enter locks you out; short or empty entries count | **resolved** | kiosk.js:271 adds the short-entry guard; kiosk.js:323-327 ignores `e.repeat` in the dialog. The new e2e "a held Enter (key auto-repeat)…" passes. Mutation M1a (repeat filter → `if (false)`) FAILS with "key auto-repeat is ignored in the dialog". Mutation M1b (short guard removed) FAILS with "a hint, not a verdict". Each half of the fix has a test with teeth. |
| KAI1: resetPin load leaves the in-memory lock in place | **resolved** | main.js:910 calls `pinPrompt.resetLock()`, which clears both the in-memory lock and storage (kiosk.js:336-339). The new e2e "after a resetPin load the lockout is cleared…" passes. Mutation M2 (back to `storage.removeItem(...)` only) FAILS with "one wrong PIN does not lock". |
| KCM1: far-future stored lock never expires | **open (partly fixed)** | See Important 1. The read clamp works within one page lifetime: my probe opened Settings after +15 min. It is not persisted, so every reload restarts the 15 min window. Its wiring at the one real call site (kiosk.js:228) also has no test. |
| KAM1: Enter held through a wake reveals the controls | **resolved** | main.js:792 adds `!e.repeat`. The new e2e "an Enter held through a wake…" passes. Mutation M4 (drop `!e.repeat`) FAILS with "a hold that began asleep reveals nothing". |
| KAM2: Cancel below 48 px | **resolved** | app.css:441 sets `.pin-box .btn { min-height: 48px }`. The new e2e passes. Mutation M5 (CSS line removed) FAILS with "Cancel is 39.75 px tall". Measured 48 px at 1920x1080 and 1080x1920, rotations 0 and 90. |

## Strengths

- Each fix is small and local. `resetLock()` keeps the lock state in a single owner, so the stale in-memory copy is gone.
- The short-entry hint cannot be used to probe the PIN. Probe on the keypad:
  - Entries of 1, 2 and 3 digits leave storage `null` and show "Enter your PIN (4 to 8 digits)."
  - `1111` → `{"failures":1}`; `24681357` (8 digits) → 2; typing 9 digits is capped at 8 and counts → 3; `24680` → 4; `9999` → 5, locked for 60 s.
  - While locked, a short entry shows the lock message and does not count (failures stay at 5).
  - While locked, the right PIN is refused.
  - The hint depends only on length, and no valid PIN is shorter than PIN_MIN (`isValidPin`, kiosk.js:22), so the hint gives away nothing.
- The held-Enter test really produces `repeat:true` keydowns. M1a proves this: the held-digit assertion fails without the filter.

## Issues

### Critical
None.

### Important
1. **KCM1 is only half fixed. The clamp is not written back, so each reload restarts the 15-minute lock, and a far-future lock outlives 15 minutes for as long as the page keeps reloading.** (code-bug)
   - Location: kiosk.js:228 `let lock = parseLock(storage.getItem(LOCK_KEY), now());`. The clamped value stays in memory only. Storage keeps the original `lockedUntil` until the next failure or success.
   - Evidence: probe on the Playwright fake clock. Seeded lock `{failures:9, lockedUntil: 2026-06-02T12:00}`; started at 2026-06-01T12:00; reloaded every 10 min:
     ```
     t0               "Too many wrong PINs. Try again in 15 min." {"failures":9,"lockedUntil":1780401600000}
     +10 min, reloaded "…Try again in 15 min." {"failures":9,"lockedUntil":1780401600000}
     +20 / +30 / +40 min, reloaded: the same
     ```
     Without a reload, +15 min works: Settings opened after the right PIN.
   - Test gap: changing kiosk.js:228 to `parseLock(storage.getItem(LOCK_KEY))`, which drops `now()` and brings back exactly the r3 bug, leaves all 31 unit tests and the kiosk e2e green. The new unit tests only exercise `parseLock`/`clampLock` in isolation. The write-side clamp (kiosk.js:282) is also untested, but `recordFailure` already caps at now+15 min, so that clamp is redundant rather than wrong.
   - Why it matters: the r3 triage outcome was "a far-future stored lock expires within 15 min". The natural response to a stuck lock is to reload or power-cycle, which restarts the wait every time. The app also reloads itself on a service-worker update (main.js:854). The owner stays locked out of Settings until the wall clock passes the stored timestamp, or until they deploy `resetPin`. I rate this Important rather than Minor because it is a named r3 finding that this round was asked to confirm, and the confirmation fails. The conductor may downgrade it.
   - Fix (one line plus one test): in `createPinPrompt`, after the parse, write the clamped lock back when it differs, e.g. `if (lock.lockedUntil) storage.setItem(LOCK_KEY, JSON.stringify(lock))`. Then add a test that would fail without it: a unit test with a fake storage, or an e2e that seeds a lock a day ahead, reloads at +10 min and opens Settings with the PIN at +16 min.

### Minor
None new.

## Criterion 7 (redone on tree 256bfa8)

Criterion 7: PASS. Paths tried, on the new tree:

- The full e2e suite exits 0. That includes all existing kiosk gate cases: `s`/`d` with and without disableShortcuts, the Settings button, empty card, first run, Tab into the inert kiosk controls, token toggle/export, import, Reset everything, Escape/close races, and the strict `resetPin === true` cases (false, "true", 1, 403/500 carrying the flag, a query string).
- My own probes, with kioskMode and disableShortcuts both on:
  - Synthetic `document.querySelector('[data-action="settings"|"diagnostics"]').click()` opens the PIN dialog; Settings and Diagnostics stay closed.
  - Two more synthetic requests stacked while the prompt was open, then Escape: Settings, Diagnostics and the PIN dialog all end closed.
  - `s`/`d` with disableShortcuts: no action.
  - Synthetic `#token-toggle` click with the sheet closed opens the PIN dialog; the field stays `type=password`.
- Lockout bypass by reload: none. The lock survives a reload (Important 1 is the opposite problem, a lock that lasts too long).
- Long press without release: the delta ignores repeats in both the dialog and the Enter hold. A keydown/keyup pair is still needed to arm and end the hold, and the KAM1 test covers this.
- Reset path: there is no client route besides `shouldResetPin` (kiosk.js:206, strict `=== true`) at main.js:908. The import path keeps `settingsPinHash/Salt` from the previous settings (main.js:516-517), and `NEVER_EXPORT_KEYS` excludes them from export.
- The delta changes no gate site: `requestPin` / `requestSettings` / `requestDiagnostics` are unchanged.

## UI screenshots

UI screenshots: PASS. Files in /home/user/plex-poster-app/.orchestrator/artifacts/:
- kiosk-and-pin--shot-1920x1080-pin-hint-rot0-r4.png
- kiosk-and-pin--shot-1920x1080-pin-hint-rot90-r4.png
- kiosk-and-pin--shot-1080x1920-pin-hint-rot0-r4.png
- kiosk-and-pin--shot-1080x1920-pin-hint-rot90-r4.png

Each shows the dialog after a 2-digit entry and OK. The hint "Enter your PIN (4 to 8 digits)." is legible, and Cancel measures 48 px along its height axis (79x48 at rotation 0, 48x79 at rotation 90). The dialog is at an exact 0/90 degrees and fully inside the viewport, e.g. box 790,280-1130,800 at 1920x1080.

## Declined to judge

- In both rotation-90 shots the poster frame behind the dialog is tilted a few degrees off 90. This looks like the shell's rotation transition caught mid-animation, since the shots were taken right after load. It belongs to the rotation and shell phase, it is outside this delta, and the brief says the r3 shots stand for everything except the dialog.
- The hint is drawn in the error colour (red). Whether it should be a neutral hint is a product and design question, not a criterion.
- A far-future lock with failures:9 locks for 15 min again after a single wrong PIN once it expires. That follows the K34 schedule as written.

## Recommendations

- Fix Important 1 as described and add a test that fails when the persisted clamp or the `now()` argument at kiosk.js:228 is removed.
- The write-side `clampLock` at kiosk.js:282 can stay as a safeguard. It needs no test of its own once the read-side write-back is tested.

## Assessment

Four of the five r3 findings (KCI1, KAI1, KAM1, KAM2) are fixed, and each has a test that fails without its fix (mutations M1a, M1b, M2, M4 and M5 all go red). Criterion 7 still holds, and the full e2e suite exits 0. KCM1 is fixed only within a single page lifetime: a reload restarts the 15-minute window, and nothing tests the clamp at its real call site. That is a one-line fix plus one test.

**Verdict:** CHANGES REQUESTED
