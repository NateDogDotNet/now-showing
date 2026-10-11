produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: settings-sheet · round: r6 · mode: cold
**Verdict:** APPROVE

Reviewer: settings-sheet-review-cold-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T14:14:20Z · Method: cold delta review · Scope: settings-sheet, r6, base 6e3ad88 (tree), tree 297c7e2 (staged index of /home/user/wt-settings-sheet-r4)

## What I read and ran

- Read: `git diff 6e3ad88 297c7e2` (css/app.css, js/main.js, tests/e2e/first-run.spec.mjs, tests/e2e/lib.mjs, tests/e2e/settings-sheet.spec.mjs). Code the delta calls or is called by, at 297c7e2: js/main.js 685-700 (showEmpty), 810-870 (applySettings tail, requestPin, requestSettings), 990-1005 (actions, click handler), 1170-1268 (first-run flow); index.html 44-56 (empty card); first-run.spec.mjs 60-75, 396-440, 540-560 (helpers, runner); lib.mjs 174, 240 (clock install).
- Ran, in a scratch extraction `mktemp -d` -> /tmp/tmp.tBOKKkGgYQ (`git archive 297c7e2 | tar -x`, node_modules copied), removed afterwards. Live index re-checked: `git write-tree` = 297c7e2..., untouched.
  - `npm test`: 317 pass, 0 fail.
  - `E2E_PORT=24651 E2E_MOCK_PORT=24652 npm run test:e2e -- first-run settings-sheet`, twice: both exit 0 (18/18 first-run, 28/28 settings-sheet; "K50 5 codes and 724 polls in 71 min").
  - Mutation runs (each in its own copy, ports 24660-24681), all reverted by deleting the copies:
    - M1 drop `{ rest: true }` -> FAIL "rest at 2740 s: no instruction to enter a code". Teeth.
    - M2 drop `if (pendingToken) showEmpty(...)` in finishFirstRun -> FAIL "the card says the sign-in worked". Teeth.
    - M3 drop the post-rest `showFirstRun('', 'Asking plex.tv for a code…')` -> PASS. No teeth (Minor 1).
    - M4 put `'continue'` back into the guard's answered methods -> settings-sheet FAIL "a plex.tv request that was continued is flagged". Teeth.
    - M5 `unused = 0` after the rest -> FAIL "the 4th code ran out unused and a rest started (none by 4200 s, 5 codes asked for)". Teeth (K51 extension).
    - M6 remove `&& !pendingToken` from firstRunWanted (flow restarts behind a cancelled prompt) -> FAIL "the token is waiting: no new code is asked for". Teeth (baseline-before-cancel reorder).
  - Load probe: six unmutated copies of `first-run` concurrently (ports 24684-24695): 5 pass, 1 fails "timed out waiting for a request at 1745 s" in K50 (Minor 2).

## Strengths

- The new card states are correct on every path I traced: `resting` is set only on the rest message and cleared by every other `showFirstRun` call (onCode, failure, start, post-rest); `syncFirstRun` hides `#firstrun` when the flow stops, so no stale rest state survives a restart; the post-sleep `if (ctl.signal.aborted) return` keeps an aborted flow from repainting.
- "Signed in. Open settings to finish." is shown only when `pendingToken` is still set after `requestSettings()` returns, i.e. the PIN was cancelled; a successful open clears `pendingToken` first (main.js:860-861), so the message cannot appear over an open sheet. The text never includes the token.
- The Open settings button goes `actions.settings -> requestSettings() -> requestPin()` (main.js:993, 852-853): no PIN bypass.
- `applySettings` now uses the same `unconfiguredMessage()`, so a later settings apply while a token waits does not revert the card to the invitation.
- The frozen clock is checked (`pauseAtChecked` re-reads `Date.now()` and throws rather than loops); K50 counts are then driven only by `runFor`. The tests did not weaken any assertion; they added them, and five of six mutations are caught.
- The guard change is the right direction (continue() to plex.tv is a real outbound request), its self-test covers it, and no existing spec relied on continue() to plex.tv (both suites green).

## Issues

### Critical
None.

### Important
None.

### Minor

1. **The post-rest "Asking plex.tv for a code…" reset is untested** (code-bug in test coverage, behaviour itself correct). js/main.js:1241. Reproduction: delete that line, run `npm run test:e2e -- first-run` -> all 18 pass (M3 above). Why it matters: without it, if the pin request after a rest hangs or is slow, the card keeps saying "…new one in 5 minutes…" with the code hidden, which is the "stuck" state this line exists to prevent; nothing pins it. Fix: in K50, after the rest ends, hold the pin reply (or check before `until(() => tv.pins === 4)` returns the code) and assert `#firstrun-status` no longer matches /5 minutes/ and the `resting` class is off.

2. **K50 still flakes under heavy load, via a real-time 3 s wait the clock freeze does not cover** (spec-gap; the helper is outside the changed lines but the delta lengthened the case by about 20 simulated minutes). first-run.spec.mjs `freshUntil`: `await until(() => requests() > before, ..., 3000)` uses wall-clock. Reproduction: run `npm run test:e2e -- first-run` in six copies concurrently (24 browsers): one failed with "timed out waiting for a request at 1745 s" on the unmutated tree; a second instance appeared in a mutant run where the mutation could not affect K50 ("at 1260 s"). Serial runs pass. Why it matters: the delta's stated aim is that load cannot affect this test; it no longer affects the counts, but it can still fail the case. Fix: raise that timeout (e.g. 15 s) since time is frozen and a longer wait cannot change counts, or wait on `page.waitForFunction`/a request event instead.

## Declined to judge

- During the rest, `#empty-message` still reads "Connect to your Plex server to get started." above the rest status, with the Open settings button. The CSS comment says only the status line shows within `#firstrun`; whether the card-level invitation should also hide is a product question, and restCard deliberately does not test it.
- "Can't reach plex.tv. Trying again soon…" still shows the lead and the `····` squares (not resting). Unchanged by the delta; outside scope.
- The SSC3 test asserts the Open settings button is visible but continues via the `s` key, not a click. Both go through the same `actions.settings`, so I did not count this as a gap.

## Recommendations

Fix Minor 1 with one assertion in K50; lengthen the 3 s real-time wait in `freshUntil` for Minor 2. Neither blocks.

## Assessment

The delta does what it claims. The new card states appear and clear correctly, do not leak the token, and do not bypass the PIN. The frozen clock makes the counts independent of real time. The reordered and extended tests fail when the behaviour they pin is removed (5 of 5 targeted mutations). The guard now flags continue() to plex.tv and still passes legitimate fulfil and abort routes. Two minor test-quality gaps remain.

Files read: git diff 6e3ad88 297c7e2; js/main.js (297c7e2) lines 685-700, 810-870, 990-1015, 1170-1268; index.html (297c7e2) 44-56; tests/e2e/first-run.spec.mjs 60-75, 396-440, 540-560; tests/e2e/lib.mjs (grep for clock, lines 3/174/240); tests/e2e/run.mjs (grep for ports/argv); package.json; mutant and run logs in the scratch dir.

**Verdict:** APPROVE
