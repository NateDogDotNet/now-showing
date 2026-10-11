produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: kiosk-and-pin · round: r6 · mode: anchored
Reviewer: kiosk-and-pin-review-anchored-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T23:40:55Z · Method: anchored confirmation review · Scope: kiosk-and-pin, r6, delta 256bfa8..7a77c78 plus full staged diff, tree 7a77c7865a3bdecc3f277063efae84537a2074e3 (staged index of /home/user/wt-kiosk-and-pin-r4)

**Verdict:** APPROVE

## What I read and ran

- Read: plan `### 14. kiosk-and-pin` (criterion 7), spec R-KIOSK-1/2, decisions D10/D16, the phase record (Step 7 triage r4: K4I1, K4M1, K4M2; K32–K35; KCI1/KAI1/KAM1/KAM2 definitions), `git diff 256bfa8 7a77c78` (js/kiosk.js, js/main.js, tests), js/kiosk.js:110-145 and 216-360, js/main.js:792-802 and 905-918, js/settings-ui.js:298-315, tests/e2e/kiosk.spec.mjs:1-40 and 250-273.
- Setup: `git archive 7a77c78 | tar -x` into `mktemp -d` under the session scratchpad, node_modules symlinked from the worktree. Each mutation ran in its own copy of that tree. The live worktree was not touched. Afterwards `git write-tree` still gives 7a77c78 and the scratch copies are deleted.
- `npm test`: 284/284 pass. `node --test tests/kiosk.test.js`: 36/36 pass.
- **Full e2e** (`E2E_PORT=23010 E2E_MOCK_PORT=23011 node tests/e2e/run.mjs`): **exit 0**. Every spec PASSed (brightness, cache-first, content-rating, display-decode, kiosk with all its cases, metadata, now-playing, pixel-shift, rotation, sleep, smoke, status, ui-rotation).
- Mutations (each one reverted by throwing away its copy). Ports used: 23020–23047.

| Mutant | Unit result | Kiosk e2e result |
|---|---|---|
| m1 readLock does not clamp (`const lock = stored`) | killed: tests 20, 21, 22 (clock back 1 y in the same page; clock back with the dialog closed; day-ahead pulled in) | killed: "a lock stored a day ahead ends 15 minutes after it was first looked at, and a reload does not restart it" |
| m2 readLock clamps but does not write back | killed: tests 20, 21, 22 | killed: the same day-ahead case |
| m3 contextmenu prevented inside dialogs too | n/a | killed: "the context menu is suppressed on the stage but not inside an open dialog" |
| m4 contextmenu never prevented (line 802 only) | n/a | killed: the same case ("on the stage", false !== true) |
| m5 boot no longer calls `pinPrompt.cancelVerify()` | n/a | killed: "a PIN prompt open while the boot reset clears the PIN is cancelled: nothing counted…" |
| m6 a right PIN accepted while locked | killed: test 20 | killed: "five wrong PINs lock the dialog; the lock survives a reload" |
| m7 failure counted from the lock read before the await, not re-read after it | survives (exit 0) | not run |
| KAI1 revert (`resetLock` no-op) | n/a | killed: "after a resetPin load the lockout is cleared for the session…" |
| KCI1 revert (short entries counted, `e.repeat` not ignored) | n/a | killed: "a held Enter (key auto-repeat)… is never counted as a wrong PIN" |

My first parallel batch shared one tree and gave contaminated results. My first m4 regex also hit the Enter-hold line at main.js:792 instead of the contextmenu line. I threw those runs away and reran each mutant in its own copy. The table shows only the clean reruns.

- Probe (scratch `tests/e2e/probe.spec.mjs`, kiosk + PIN set, fake clock):
  - Keys `s d ? i`, URL `#settings` / `#diagnostics` / `?settings=1`, and 25 Tabs: nothing opened, and no control took focus.
  - A dispatched `.click()` on every `[data-action]`: settings and diagnostics only opened the PIN prompt.
  - `#token-toggle`: the PIN prompt opened, and the field stayed `password`.
  - `#import-file`: nothing happened, because the gate sits on `change` (settings-ui.js:307).
  - 5 wrong PINs, then the right PIN: refused ("Try again in 60 s"), and the stored lock was unchanged.
  - A reload mid-lock, then the right PIN: refused ("59 s"). The lock was not restarted or shortened.
  - +61 s, then the right PIN: Settings opened and the lock key was removed.
  - A contextmenu on a PIN keypad key: not prevented (see Minor 1).

## Confirmations

- **K4I1(a), backward clock step, no reload: resolved.** `readLock()` (kiosk.js:236-241) parses the stored lock, clamps it to `now()+15 min`, and writes it back. It runs in `ask()` and in `submit()` both before and after the `await`. The unit tests for this are 20 and 21, and m1/m2 kill them. The e2e cannot do this case because Playwright's fake clock cannot step backwards, so the unit test is the honest place for it.
- **K4I1(b), far-future value across reloads: resolved.** The clamped value is written back to storage on first read. The e2e reloads at +10 min and asserts the stored `lockedUntil <= seen + 15 min`, then opens Settings at +16 min. m1 and m2 both kill it.
- **K4M1: resolved.** main.js:802 adds `!e.target.closest?.('dialog[open]')`. The e2e checks the stage, the serverUrl and plexToken fields, the sheet, the stage behind an open sheet, and the stage after close. m3 and m4 both kill it.
- **K4M2: resolved.** Boot calls `pinPrompt.cancelVerify()` after the PIN is cleared (main.js:915). If a `verifyPin` was in flight, `session !== s` at kiosk.js:287 stops it being counted or finished true. The e2e asserts the prompt closes, nothing opens, nothing is counted and Settings opens without a PIN. m5 kills it.
- **Can readLock/writeLock shorten or skip a real lockout? No.**
  - `clampLock` only ever lowers `lockedUntil` to `now+15 min`, which is the spec's maximum.
  - A right PIN while locked is refused before `verifyPin` (probe; m6 killed).
  - A reload mid-lock keeps the stored value (probe: same `lockedUntil` and "59 s").
  - The failure write after the `await` re-reads storage, so it builds on the current lock rather than a stale copy.
  - Success removes the key only after a verified PIN while unlocked.
- **Earlier fixes still hold:** KCI1 and KAI1 were reverted and killed above. KAM1 ("an Enter held through a wake from sleep…") and KAM2 ("Cancel button is at least 48 px tall") pass in the full run. The conductor's r4 mutation set, re-run on r6, is also recorded as killed.

## Strengths

- One source of truth. Removing the in-memory lock removes the whole class of stale-copy bugs (KAI1, K4I1a) rather than patching each one.
- `cancelVerify()` is kept separate from `resetLock()`, and the comments say why.
- The tests have teeth: every targeted mutant is killed, most of them by both a unit test and an e2e test.

## Issues

### Critical
None.

### Important
None.

### Minor
1. **The contextmenu exemption also covers `#pin-dialog`, not just the Settings fields.** Location: js/main.js:802. Evidence: the probe dispatched a cancelable contextmenu on `#pin-dialog [data-key="1"]` and got `defaultPrevented === false`. Why it matters: on a touch-only kiosk, a long-press on the PIN keypad now opens the browser's native menu (Reload, Print, Inspect…). That is a route to devtools from the one dialog a child can open without the PIN. D16 accepts devtools as a bypass, so this changes no guarantee, but it reopens a menu that kiosk mode had been hiding. Class: **spec-gap**. The fix matches ruling K4M1 as written ("suppress only outside an open dialog"), and the ruling did not consider the PIN dialog. Fix: exempt only `#settings[open]` (or only text inputs and textareas), and keep suppressing it in `#pin-dialog`. Add one assertion to the existing e2e case.

## Declined to judge

- Stepping the clock *forward* ends a lock early. This is inherent to any wall-clock lockout, needs system access, and falls under D16.
- m7 (counting from the pre-await read) survives. That variant is also acceptable, and the r6 code is the more careful of the two, so it is not a test gap that matters.
- Several tabs sharing one storage: outside the phase's model.

## Recommendations

Optionally narrow the exemption at main.js:802 to the Settings sheet (Minor 1). Nothing else is needed for this phase.

## Assessment

K4I1 (a and b), K4M1 and K4M2 are each fixed, and each has a test that fails without the fix. The readLock/writeLock path cannot shorten or skip a lockout. KCI1, KAI1, KAM1 and KAM2 still hold. Unit tests and the full e2e suite are green.

Criterion 7: PASS
UI screenshots: PASS (r3/r4 shots stand; UI unchanged). The delta has no HTML or CSS changes; the only behaviour change is that the context menu now opens inside dialogs.

**Verdict:** APPROVE
