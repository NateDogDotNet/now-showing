produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: settings-sheet · round: r4 · mode: anchored
**Verdict:** APPROVE

Reviewer: settings-sheet-review-anchored-r4 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T12:28:22Z · Method: anchored delta code+UI review (confirmation round) · Scope: settings-sheet, r4, delta from tree 0cf21d2 to tree 6e3ad88 (staged index of /home/user/wt-settings-sheet-r4, HEAD 05fb079)

## What I read and ran

Read: both r3 reviews (headlines and the items being confirmed); the phase record Step 7 triage (SSC1–SSC5, SSA2) and the r4/r5/pick notes; `.orchestrator/questions.md` Q-ss5; the K50/K51/K52 entries in `.orchestrator/state.md`; `git diff 0cf21d2 6e3ad88 -- js css tests index.html sw.js scripts` (js/duration.js, js/main.js, js/settings-ui.js, tests/duration.test.js, tests/e2e/lib.mjs, first-run.spec.mjs, settings-sheet.spec.mjs); js/kiosk.js `verify()` (lines 345–362); `pinSignIn` and `open()` in js/settings-ui.js.

Ran, all in `mktemp -d` copies made with `git archive 6e3ad88 | tar -x` (node_modules symlinked from the worktree, read-only). Both copies were removed afterwards. The live worktree index is still 6e3ad88 (`git write-tree`):
- `npm test`: 317/317 pass.
- Full e2e `E2E_PORT=24400 E2E_MOCK_PORT=24401 node tests/e2e/run.mjs`: **exit 1**. Every spec passed except first-run, where 1 of 18 cases failed: the pre-existing, unchanged case "a plex.tv network failure retries at most once per 30 s…" (`AssertionError: 2 pins after 29 s`, first-run.spec.mjs:196). I reran it alone 3 times (pass) and reran the whole first-run spec 2 times (18/18 pass both times). It is a flake, see Minor 5. The run printed `K50 4 codes and 658 polls in 60 min`.
- Mutations: each was applied with a script and run against the targeted cases on ports 24404/24405. After each, js/ was restored from the archive and `diff -r` against the worktree came back clean. Results are in the table.
- Screenshots: serve.mjs `--mock` on 24410/24411, with a plex.tv route giving `expiresIn: 1`, so the 5 s floor gives 3 dead codes in about 15 s. Captured at both sizes once the rest message showed.

| Item | Mutation | Test(s) | Result |
|---|---|---|---|
| SSC1 | `runFix('unwatched')` without `requestPin()` | settings-sheet `^SSC1` (card, cancel, toast) | 3/3 fail (`pinIs` timeout) — **killed** |
| SSC2 | drop the `FIX_APPLIES` filter | settings-sheet `^SSC2` | 1/2 fail `no fix that cannot help` — **killed** |
| SSC3 | restore r3 `requestSettings`/`finishFirstRun` (token passed as option, no pendingToken) | first-run `^SSC3` | 3/3 fail — **killed** |
| K52 | drop `&& !pendingToken` from `firstRunWanted` | first-run `^SSC3` | 3/3 **pass — survives** (Minor 1) |
| K50 poll | `PIN_POLL_MS = 2000` | `^K50 an unanswered` | fail `twelve polls in the first minute` — **killed** |
| K50 rest | delete the 5-min `sleep` | `^K50 an unanswered` | fail `no request while it rests, at 2740 s` — **killed** |
| K50 asleep | drop `!state.asleep` | both asleep cases | 2/2 fail — **killed** |
| K51 | `unused = 0` after the rest (count restarts) | `^K50 an unanswered` | **pass — survives** (Minor 2) |
| SSC4 | restore one-decimal `formatMinutes` | tests/duration.test.js | 3 tests fail — **killed** |
| SSA2 | mark every plex.tv request answered (r3 behaviour) | guard self-test, extracted from settings-sheet.spec.mjs into a scratch file | fail `the unrouted /api/v2/resources is flagged` — **killed** |
| SSA2 | count `route.fallback()` as answered | same | fail on `/api\/v2\/user/` — **killed** |

## Earlier findings: status

- **SSC1: resolved.** main.js:685 `if (id === 'unwatched' && (await requestPin())) return applySettings(...)`. The e2e covers the empty card and the toast with a wrong PIN, the right PIN and Cancel. The mutation is killed.
- **SSC2: resolved.** main.js:674–678 `FIX_APPLIES.unwatched = s => s.unwatchedOnly`. Both directions are tested and the mutation is killed.
- **SSC3: resolved for the loss bug.** The token sits in module-local `pendingToken` (main.js:1187). The first `requestSettings` that gets past `requestPin()` takes it (main.js:853–862). kiosk.js `verify()` returns `session.shared` while a verify is up, so a prompt opened by `s` or the button and the approval's own request share one answer. When the prompt resolves, the second continuation finds `settingsUI.isOpen` and only acts on the open sheet. `open({token})` prefers the token over `signIn` (settings-ui.js:473–486). It is never saved without the PIN and never asked for again after a cancel. The approved-during-prompt cases (`s` and Open settings) and the cancel-then-reopen case kill the r3-restore mutation. The "never replaced by a newer code" part of K52 is implemented but not pinned by a test (Minor 1).
- **SSC4: resolved.** formatMinutes gives the shortest text, up to 3 decimals, that `secondsFromMinutes` turns back into the same seconds. It is checked by a unit test that walks every whole second from MIN to MAX, a typed-value stability test and an e2e test (0.25 → 15 s, 2.55 → 153 s, retyped). It does not show the exact value: 10 s shows as `0.17`, which is 10.2 s and saves 10. It is "what will be saved" in the round-trip sense, which is what the SSC4 fix allowed ("up to 2 decimals, or '15 s'").
- **SSC5 / K50: resolved.** `PIN_POLL_MS = 5000` (settings-ui.js:13), a rest after `FIRST_RUN_FRESH_CODES = 3` unused codes, `firstRunWanted` false while asleep, and `syncFirstRun()` called from `evaluateSleep` (main.js:581), which aborts a running flow. All three are covered by mutations that the tests kill.
- **K51: implemented as ruled, not tested** (Minor 2). `unused` is never reset inside `runFirstRun`, so every unused code after the third is followed by a 5-minute rest until the flow restarts.
- **SSA2: resolved.** lib.mjs `guardNetwork` wraps every route handler and treats a plex.tv request as answered only when `fulfill`, `continue` or `abort` is called on its Route. A bare `fallback()` does not count. The full suite produces no false positives, and both mutations are killed. One gap remains in the ruling itself (Minor 3).

**Hourly count.** With a 900 s code lifetime (the mock's), the first hour is 4 codes and 658 polls, as the suite printed. After that each cycle is a 15-min code plus a 5-min rest, so 3 codes and 540 polls an hour, about 543 requests. That is roughly 70 % below the old ~1,800/h, and about one request every 6.6 s on average, none while asleep. I judge that reasonable for an unattended display. plex.tv publishes no limit for this endpoint, so it cannot be checked against one.

**Pending token leak check.** I found no leak:
- DOM: before the PIN it is only in a JS variable. After the PIN it goes into the sheet's `plexToken` field, which is `type=password` (the e2e asserts this).
- Logs: only `'Sign-in code approved'`. The e2e asserts `user-token-123` never reaches the console.
- Storage: none. `grep` finds no storage write in the delta, and the e2e asserts `plexToken` stays absent until Save.
- Diagnostics or window: `pendingToken` is not on `state` or `window`.
- Reload: memory only, so a reload drops it and starts a new code. pinSignIn keeps no pin id anywhere, so nothing left after a reload can claim the token around the PIN.

## Strengths
- The design is small and clear. One variable and one choke point (`requestSettings`) handle every route to Settings, and the shared-prompt behaviour comes from the existing `verify()` sharing instead of new coordination.
- The SSC4 property test covers all 86,391 schema values.
- The SSA2 guard self-test runs at spec load, so a regression in the guard fails the suite.
- The K50 test checks requests in every 5 s step, the rest window and the hourly total under a fake clock.

## Issues

### Critical
None.

### Important
None.

### Minor
1. **K52's "a newer code cannot replace a pending token" is not pinned by a test.** *code-bug (test without teeth).* first-run.spec.mjs, the "SSC3 cancelling the PIN…" case, reads `const pins = tv.pins` after the cancel, `pinIs(false)`, `settingsOpen` and a `localStorage` evaluate. With `&& !pendingToken` removed, the new `POST /pins` fires as soon as the cancel lands, before the baseline is read, so the test passes (mutation survives, 3/3). I moved `const pins = tv.pins;` above `page.click('#pin-cancel')` in the scratch copy: the mutation then fails with `the token is waiting: no new code is asked for`, and the unmutated tree passes. Why it matters: without the guard, a newer code appears while a token waits, and approving it overwrites `pendingToken`. That is exactly the K52 decision. **Fix:** take the baseline before the cancel click (a one-line move).
2. **K51 (the count stays spent) has no test.** *code-bug (test without teeth).* The K50 hour test stops at 60 min, which is during the 4th code. The 4th code would expire at about 65 min, so the test never reaches the point where K51 differs from a restarting count. Mutation `unused = 0` after the rest passes (`K50 4 codes and 658 polls in 60 min`). **Fix:** run the fake clock on to about 66 min and assert no `POST /pins` for 5 minutes after the 4th code runs out.
3. **The SSA2 guard counts a bare `route.continue()` on plex.tv as answered, but that request reaches the real plex.tv.** *spec-gap.* The ruling said "fulfils or continues", and lib.mjs follows it: `['fulfill', 'continue', 'abort']`. No current spec continues a plex.tv request; the `continue()` calls in content-rating.spec.mjs are on local image routes. A future catch-all `context.route('**/*', r => r.continue())` would let plex.tv through unflagged. **Fix:** count `continue` only when it is given a `url` override pointing at a local host, or treat a plex.tv `continue()` as outside.
4. **Card copy while waiting.** *spec-gap (K50/K52 are silent on the card's wording).*
   - During the 5-minute rest the card still reads "On any device, go to plex.tv/link and enter this code:" above four placeholder squares, with the rest line below (both screenshots). It asks the viewer to enter a code that is not there.
   - After a cancelled PIN with a token pending, `finishFirstRun` hides `#firstrun` and the card falls back to "Connect to your Plex server to get started." It gives no hint that the phone approval worked and only Settings is left. I traced this in code (main.js:1255–1258) and did not screenshot it.

   **Fix:** a product call on wording. For example, hide the instruction line during the rest, and say "Signed in — open Settings to finish" while a token is pending.
5. **The full e2e run failed once on a pre-existing timing-sensitive case.** *code-bug (test robustness), outside the delta and not blocking.* "a plex.tv network failure retries at most once per 30 s…" installs a fake clock that keeps running in real time. Under full-suite load, real wall time added to `runFor(29_000)` reached the 30 s retry (`2 pins after 29 s`). It passed 5 of 5 times on rerun. The delta adds 6 first-run cases to the 4-worker pool, which likely makes this flake more frequent. **Fix:** `page.clock.pauseAt` or `install` followed by a pause before `runFor`, or allow one extra attempt.

## Declined to judge
- r4 against r5. The pick is ruled (`settings-sheet--pick-r5.json`).
- The race where Settings is opened (no PIN) in the instant a code is approved. The flow is aborted and the in-flight token dropped (main.js:1229 `if (ctl.signal.aborted) return`). The user is in the sheet and can sign in there, and SSC3 as ruled covers only the PIN-prompt case.
- Whether ~543 requests/h needs to go lower. That is a product and owner call under K50 and K51 (listed at the next stop).
- The engine.js empty-library hint from r5. It is routed to touch-and-labels.

## Recommendations
- Fix Minors 1 and 2 before the merge if a round is cheap. Each is a few lines and makes K51 and K52 provable.
- List Minors 3 and 4 with K50–K52 at the next stop.

## Assessment
Every r3 item the conductor routed (SSC1, SSC2, SSC3, SSC4, SSC5/K50, SSA2) is fixed as ruled. Each has a test that fails without its fix, except two rulings that are implemented but not pinned (K51, and K52's no-replacement clause). The pending token cannot leak and cannot get around the PIN, including across a reload. The rest-message card renders legibly and inside the frame at both 1920x1080 and 1080x1920. The only things wrong are the wording of the instruction line during the rest (Minor 4) and the one flake in the full e2e run, which is outside the delta. No Critical or Important issues.

UI screenshots: PASS (settings-sheet--shot-1920x1080-rest-r4.png, settings-sheet--shot-1080x1920-rest-r4.png)

**Verdict:** APPROVE
