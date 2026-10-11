produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: settings-sheet · round: r3 · mode: anchored
**Verdict:** APPROVE

Reviewer: settings-sheet-review-anchored-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T11:00:34Z · Method: anchored code+UI review · Scope: settings-sheet, r3, base 1df3be1, tree 0cf21d2 (staged index of /home/user/wt-settings-sheet)

## What I read and ran

Read: plan §19 (docs/integration-plan.md l.444-466); spec R-FIRST-1, R-SET-1..4, R-SET-6 (docs/spec.md l.98-130); decisions D3, D28, D38, D40; phase record .orchestrator/phases/settings-sheet.md; the full staged diff (`git diff --cached`, 16 files): all app code (css, index.html, js/duration.js, main.js, plex.js, settings-ui.js, util.js, mock-plex.mjs, sw.js), lib.mjs, brightness/helper diffs, first-run.spec.mjs in full, settings-sheet.spec.mjs cases U14, toast, C8M2.

Ran. Scratch copy: `mktemp -d` → /tmp/tmp.jZ3RD7N9hm, filled from the staged index with `git checkout-index -a --prefix=` (read-only on the repo). Removed afterwards. Live tree checked after: `git write-tree` still 0cf21d2, nothing new in porcelain.
- `node --test tests/plex.test.js tests/duration.test.js`: 44 pass, 0 fail. `npm test`: 315 pass. `node scripts/check-precache.mjs`: "30 precached files OK".
- **Full e2e** (`E2E_PORT=24100 E2E_MOCK_PORT=24101 npm run test:e2e`): **exit=0**, 102 PASS lines, all 17 specs PASS (brightness, cache-first, content-rating, display-decode, first-run, helper, kiosk, metadata, now-playing, pi-stability, pixel-shift, rotation, settings-sheet, sleep, smoke, status, ui-rotation). My screenshot script ran on 24110/24111 at the same time, so the clock-sensitive specs also passed under extra load.
- My own review spec (copy 2, ports 24110/24111, deleted afterwards) did these:
  - It took the 10 screenshots.
  - PIN gate: unconfigured, PIN set, code approved → `#pin-dialog` opened and `#settings` did not. Cancelling the PIN left Settings closed, and the card went back to showing a code (`firstrunHidden=false`).
  - Token: the approved token `user-token-xyz` is in no console line and not in localStorage.
  - K48 guard: a `fetch('https://example.com/x')` made `withApp` throw "the spec reached beyond the local servers (K48)". An unrouted `https://plex.tv/api/v2/user` from a configured context (one with a token) also threw. An unconfigured context with no route of its own got the default stub (code `STUB`) and did not throw.
- Mutations (copy 2, `js/main.js`; restored after each, and `cmp` against the live file was identical):
  - `FIRST_RUN_RETRY_MS = 2_000`: first-run failed with "AssertionError: 4 pins after 29 s". **Killed.**
  - Deleted `syncFirstRun()` from `requestSettings`: first-run failed with "timed out waiting for a fresh code after the sheet closes". **Killed.**
  - The conductor's r2 kills (C8M2 no-rebuild-before-wake, K30 preview-applies-pixelshift) still stand: no app code changed in r3.

## Criteria and decisions checked

- **R-SET-1 connected card.** `renderConnection` (settings-ui.js) hides `#signin-controls` until Change. The screenshot shows "Connected to Mock Plex · Movies [Change]". When unconfigured, `connectionOpen = !isConfigured(s)` shows sign-in, and `#first-run-hint` follows `isConfigured`. K47 (manual fold reachable without Change) is honoured.
- **R-SET-4 lazy counts.** `loadCounts` runs after `setResult(✓…)` and is never awaited. `libraryCount` swallows every error and returns null. `countRun` drops counts that arrive late. The screenshot shows "Movies · 8 titles". The spec covers both the 500 case and a stalled count.
- **R-SET-2 minute presets.** A hidden `rotateSeconds` field is still what gets stored, and `rotatePreset`/`rotateMinutes` sit outside the schema. `presetFor`, `secondsFromMinutes` (clamps 10..86400; anything that is not a number returns the previous value) and `formatMinutes` are unit-tested. A stored 420 opens as Custom showing 7, and a stored 10 is not rewritten by an unrelated save. The label reads "Change poster every" with no "seconds".
- **R-SET-3 Advanced.** `details#advanced` holds the three fields, and `open()` sets `.open = false`.
- **R-SET-6 one table.** `FIXES`/`FIXES_BY_KIND`/`fixesFor`/`runFix` live in main.js. Three places read the table: `showEmpty` (empty card), `handleFailure` with `notify` (toast, K45 manual refresh only) and `setResult` through the injected `fixesFor` (test result). `toast()` now takes `actions[]`, and the old `action` shorthand is kept.
- **D3 / R-FIRST-1 first run.**
  - Start: `syncFirstRun` begins only after `bootSettled` (so config.json has had its say), only while unconfigured, and only while Settings is closed (K46). The old `requestSettings({firstRun:true})` at boot is removed.
  - Code: shown at `clamp(64px,12vmin,112px)`; it measured 112 px at both screen sizes.
  - Expiry: the code refreshes using plex.tv's `expiresIn` timed on `performance.now()`, with a 5 s floor so a pin cannot loop.
  - Backoff: 30 s doubling to 5 min, with one log line per outage. A failed poll backs off to 30 s.
  - Approval: `requestSettings({token})` goes through `requestPin()` (PIN gate confirmed by my run). The sheet picks up at "Signed in", and nothing saves until the user presses Save (K44).
- **C8M2.** `rebuildClient()` now runs before `evaluateSleep()` in `applySettings` (main.js, diff hunk @@ -747). The spec case shows the old server got 0 requests after Save, and the r2 mutation kill stands.
- **C8M1 / D38.** `#household-help` names both exceptions (an owner-saved pin, and the playing title when "Apply the limit…" is off). It is visible in the 1920x1080 connected screenshot.
- **K30.** In preview mode, `pixelShift`, `pixelShiftMinutes`, `dailyReload` and `dailyReloadTime` are taken from `prev`. Brightness stays live.
- **K31.** `<output data-for="frameBrightness">` shows an unsigned "100%", and the hint uses the `nowrap` class. In the 1080x1920 shot, "10–100 %" sits on one line beside the slider.
- **Token handling.**
  - The plex.tv code flow logs only "Sign-in code approved" and error messages.
  - The token goes only into the existing `plexToken` field, which is a password field (the first-run spec checks `type="password"`). The spec also checks that no token appears in the console or in outerHTML, and my run confirmed none in the console or localStorage.
  - Settings, "Sign in again" and the approval route all go through `requestSettings` → `requestPin`.
- **Harness, K48/K49.**
  - The guard fails on an outside host and on an unrouted plex.tv (both run above).
  - `pauseAtChecked` and `freezeClock` are bounded at 8 tries, then throw a clear error, so they cannot loop forever.
  - The brightness changes only replace `pauseAt` with a checked pause. The helper changes only add a freeze before the wake. No assertion in either spec was changed or loosened.

## Strengths

- One `pinSignIn` is shared by the sheet and the card. It times the code's life on the monotonic clock, refuses a pin reply with no code, and cannot become a hot loop. Each of these has its own e2e case.
- The fix table really is single-sourced, and all three surfaces are covered by e2e.
- The K48 guard fails loudly instead of quietly allowing traffic out, and an unconfigured context gets the stub by default.

## Issues

### Critical
None.

### Important
None.

### Minor
1. **The empty card's "Turn off \"unwatched only\"" saves a setting without the kiosk PIN.**
   - Location: `runFix('unwatched')` → `applySettings({...state.settings, unwatchedOnly:false})` (js/main.js, the R-SET-6 block).
   - Evidence: the code path does not call `requestPin()`. Every other route that changes settings goes through it.
   - Why it matters: the setting is not a protective one, and R-SET-6 asks for exactly this behaviour. Still, on a kiosk with a PIN, anyone standing at the display can change a saved setting.
   - Class: **spec-gap** (R-SET-6 does not say whether a fix button should be behind the PIN).
   - Fix: either rule that this is acceptable, or gate it with `requestPin()` when a PIN is set.
2. **The K48 guard treats every plex.tv path as routed once any route pattern mentions plex.tv.**
   - Location: `guardNetwork` in tests/e2e/lib.mjs (`if (String(url).includes(STUB_HOST)) plexTvRouted = true`).
   - Why it matters: a future configured-context spec that routes only `**/plex.tv/api/v2/pins` (or calls `route.continue()` on plex.tv) would let other plex.tv requests reach the real service without being flagged. No current spec does this (grep shows only the full `https://plex.tv/**` route in first-run and settings-sheet), and the unrouted case does fail today (I ran it).
   - Class: **code-bug** (minor; this weakens the K48 promise of failing "an unrouted plex.tv").
   - Fix: record unhandled plex.tv requests per request, for example with a lowest-priority catch-all `context.route('https://plex.tv/**')` that fails the spec, or by checking `req.failure()`/`response.fromServiceWorker` instead of using a flag.

## Declined to judge

- **A token approved on the card is thrown away if the PIN prompt is then cancelled, and a fresh code follows.** That is a product choice that fits K44 and the kiosk gate; I am not ruling on it.
- **Every open and close of Settings on an unconfigured display requests a new pin.** This is K46 as ruled.
- **Whether `totalSize` with `X-Plex-Container-Size=0` works on a real server.** It is marked (verify) and belongs to the extended validation.
- **The cold-lens concerns.** These belong to the parallel cold reviewer.

## UI

Screenshots, all in /home/user/plex-poster-app/.orchestrator/artifacts/:
- `settings-sheet--shot-{1920x1080,1080x1920}-connected.png`
- `settings-sheet--shot-{1920x1080,1080x1920}-presets-advanced.png`
- `settings-sheet--shot-{1920x1080,1080x1920}-error-empty-card.png`
- `settings-sheet--shot-{1920x1080,1080x1920}-firstrun.png`
- `settings-sheet--shot-{1920x1080,1080x1920}-firstrun-rot90.png`

What they show:
- **First-run code:** 112 px bold monospace in the accent colour, about 360x123 px. It can be read across a room, and Settings is not open.
- **Rotation 90:** the card and code are turned with the stage (the measured box swaps to 123x362) and read upright for a display rotated 90°.
- **Error card:** "Could not reach Plex…" with Diagnostics and Test connection as primary buttons above a secondary "Open settings".
- **Presets:** the buttons are 38 px tall and the selected one is highlighted. Advanced lists its three fields.
- **Overlap check:** a bounding-box check on each state's elements found no overlaps.

UI screenshots: PASS

## Recommendations

- Rule on Minor 1 (PIN on fix buttons) at the next stop. Minor 2 can be folded into any later harness touch.

## Assessment

- Every acceptance criterion holds when run, and the full suite is green once under load.
- The carried must-fixes (C8M2, C8M1/D38, K30, K31) and the rulings K44-K49 are honoured.
- The r3 test-only clock fixes are bounded and loosen nothing.
- No issue blocks.

**Verdict:** APPROVE
