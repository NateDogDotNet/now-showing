produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: settings-sheet · round: r4 · mode: cold
**Verdict:** APPROVE

Reviewer: settings-sheet-review-cold-r4 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T12:28:22Z · Method: cold delta review · Scope: settings-sheet, r4, base 0cf21d2, tree 6e3ad88 (staged index of /home/user/wt-settings-sheet-r4)

## What I read and ran

- Delta: `git diff 0cf21d2 6e3ad88 -- js css tests index.html sw.js scripts` (js/duration.js, js/main.js, js/settings-ui.js, tests/duration.test.js, tests/e2e/{first-run,settings-sheet}.spec.mjs, tests/e2e/lib.mjs).
- Code the delta calls or that calls it, read at 6e3ad88: main.js `requestPin`/`requestSettings`/first-run block (≈833-870, 1176-1260, 1295-1320); settings-ui.js `signIn`/`open` (264-300, 465-495); kiosk.js `createPinPrompt` doc and `verify()` (216-221, 327-362); lib.mjs `stubPlexTv`, `withApp` (40-60, 172-245).
- Scratch copy: `mktemp -d` → /tmp/tmp.4fUAyii8uH, `git archive 6e3ad88 | tar -x`, node_modules symlinked. Removed afterwards. The live worktree was not touched.
- `npm test`: 317/317 pass.
- `E2E_PORT=24461 E2E_MOCK_PORT=24462 npm run test:e2e -- settings-sheet first-run kiosk`: settings-sheet 28/28, first-run 18/18, kiosk 39/39 pass.
- Mutation runs, each in its own copy of the scratch tree (ports 24472-24491), all thrown away afterwards:
  - I dropped `await requestPin()` from `runFix('unwatched')`. Result: settings-sheet FAIL (3 of 28).
  - I dropped `!state.asleep` from `firstRunWanted`. Result: first-run FAIL ("nothing asked of plex.tv while asleep", "no code is asked for while asleep").
  - I disabled the 3-code rest (`if (false)`). Result: first-run FAIL ("no request while it rests, at 2740 s").
  - I made the harness guard count a request as answered when a route merely matches it (the old behaviour). Result: settings-sheet FAIL (the unrouted `/api/v2/user` is not flagged).

## Strengths

- `requestSettings` now checks the PIN first and only reads `pendingToken` after the PIN passes. Each route to Settings goes through this, so the token reaches `settingsUI.open` only after the PIN or when no PIN is set. The `verify()` sharing ("a second verify() while one is open shares it", kiosk.js:221/355) makes the race safe. The prompt owner resumes first, takes the token and opens the sheet. The `finishFirstRun` request then sees `isOpen` and does nothing.
- The token is held only in memory. It is never logged (`log.info('Sign-in code approved')` only), never written to storage or the URL, and it is gone after a reload. Pressing Cancel leaves it pending, and the flow stays stopped because `!pendingToken` is part of `firstRunWanted`. When the sheet that took it closes, the `close` → `syncFirstRun` path restarts the code flow.
- `evaluateSleep` sets `state.asleep` before it calls `syncFirstRun`, so falling asleep aborts the flow, including a 5-minute rest. Waking restarts it.
- `formatMinutes` is checked against every whole second in [MIN_SECONDS, MAX_SECONDS] for round-trip stability. Typed values are checked for stability too.
- The harness guard now records answers per request, by wrapping fulfill/continue/abort. A `fallback()` that reaches no other handler is correctly left unanswered. Every new behaviour has tests that fail when the code is mutated (see above).

## Issues

### Critical
None.

### Important
None.

### Minor

1. **After the first rest, every later unused code triggers another 5-minute rest.** (spec-gap)
   - Location: main.js `runFirstRun`, `if (++unused >= FIRST_RUN_FRESH_CODES)`. `unused` is never reset after the rest.
   - Reproduction (read at 6e3ad88:js/main.js ≈1231-1235): with the default 900 s code life, codes 1-3 expire and the flow rests 5 min. Code 4 expires and `unused` is 4, which is ≥3, so it rests again. Codes 5, 6 and so on behave the same way. The pattern is 45 min of codes, then a rest after each 15-min code.
   - This holds down plex.tv load, so it is not wrong. But "rests 5 minutes after 3 unused codes" could also mean "3 more codes, then rest". The criteria do not say which is meant.
   - Fix if the other reading is wanted: `unused = 0` after the sleep.

2. **`assertClean()` waits a fixed 150 ms, so a slow async route handler can be flagged falsely.** (code-bug, harness only)
   - Location: lib.mjs `assertClean`, `setTimeout(resolve, 150)`.
   - Reproduction (from reading the code): a spec route handler that does `await new Promise(r => setTimeout(r, 500)); route.fulfill(...)`, for a plex.tv request made just before the callback returns, is reported as "no route answered it".
   - In the other direction, a request that starts after the 150 ms wait is never checked.
   - None of the current specs hits either case, since all three suites pass.
   - Fix: also record requests whose handler has been entered, and await those handlers' completion before checking. Or document the limit.

3. **The wrapped `route()` handler no longer matches `unroute(url, handler)`.** (code-bug, harness only, latent)
   - Location: lib.mjs `watch`. The wrapped arrow function is registered in place of the spec's `handler`.
   - Reproduction (from reading the code): `context.route(u, h); context.unroute(u, h)` would leave `h`'s wrapper installed.
   - `grep -rn unroute tests` finds no callers today, so this is latent.
   - Fix: keep a handler-to-wrapper map and wrap `unroute` to match.

## Declined to judge

- **No on-screen hint that a sign-in is waiting.** When a PIN prompt is cancelled with a token pending, the empty card's code panel stays hidden. The display shows only "Connect to your Plex server to get started." Nothing says that a sign-in is waiting for Settings. Whether to show such a hint is a product question.
- **The sheet's own sign-in keeps polling while asleep.** When the Settings sheet is open on an asleep display, its own `signIn()` polling continues. The delta's claim is limited to the unconfigured display's card flow. The sheet's polling is outside the delta.
- **Diagnostics and Settings can both open from one shared PIN answer.** If a Diagnostics PIN prompt is open when a code is approved, the shared answer opens Diagnostics and then Settings with the token. Both are behind the PIN, so nothing leaks. Which one should end up in front is a UX question.

## Recommendations

None of the items above needs to block the merge. Decide what item 1 should mean and write it down. Fix item 2 if specs start using slow route handlers.

## Assessment

I found no way to run the unwatched fix or use the pending token without the PIN, and no path where the token leaks. The code flow restarts after the token is used or dropped (on sheet close), and stays stopped while the token is pending. Polling stops while asleep and rests as described. The minutes field round-trips for every whole second in range. The harness guard catches requests that are unrouted or only passed on with `fallback()`, and tests break when each of these is mutated.

Files read: the delta above; js/main.js, js/settings-ui.js, js/kiosk.js, tests/e2e/lib.mjs at 6e3ad88 (ranges listed); package.json (scripts).

**Verdict:** APPROVE
