produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: settings-sheet · round: r3 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: settings-sheet-review-cold-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T11:00:34Z · Method: cold code review · Scope: settings-sheet, r3, base 1df3be15e382aaf4032378e9d95d50689566a44e, tree 0cf21d206b38a62f41bc3bd7fe8964d768730992 (staged index of /home/user/wt-settings-sheet)

## What I read and ran

- `git diff --cached` in full (all 16 files), plus the code it calls or that calls it: js/main.js (rebuildClient, requestDiagnostics, handleFailure), js/engine.js:140-156 (the `empty` error), js/settings-ui.js write/read/close handler, js/kiosk.js verify() (shared-prompt behaviour), tests/e2e/lib.mjs makeMock, tests/e2e/run.mjs spec selection, the seed helpers in kiosk.spec.mjs and settings-sheet.spec.mjs.
- Scratch copy: `git checkout-index -a --prefix=$(mktemp -d)/` gave /tmp/tmp.PmfGtyN67a, with node_modules symlinked read-only. Removed afterwards. Live tree checked after: `write-tree` still 0cf21d2, and the status is the same 16 staged files.
- `npm test`: 315 pass, 0 fail.
- `E2E_PORT=24161 E2E_MOCK_PORT=24162 npm run test:e2e -- settings-sheet first-run kiosk`, run twice: settings-sheet 22/22, first-run 12/12, kiosk 39/39 both times.
- A throwaway repro spec (tests/e2e/zrepro.spec.mjs, scratch only, deleted) on ports 24163/24164. Its output is quoted below.
- A node probe of js/duration.js round trips.

## Strengths

- Token and PIN hygiene in the new paths is sound. createPin/checkPin URLs carry only the client id. The first-run log lines are `Could not get a sign-in code from plex.tv: <msg>` (logged once per outage) and `Sign-in code approved`. No token goes to the DOM except the existing plexToken field. A token the empty card earns reaches Settings only through `requestSettings` → `requestPin` (main.js finishFirstRun), so a PIN-protected display does not save it without the PIN.
- Stale-poll protection holds. pinSignIn checks `signal.aborted` after createPin and before `onCode`, and after every sleep. runFirstRun checks the signal before it shows a failure or calls finishFirstRun. syncFirstRun aborts on Settings open (requestSettings) and restarts on dialog `close`. The Settings flow is cancelled on close (settings-ui.js:377). A minimum code life of 5 s and back-off (polls up to 30 s, createPin 30 s→5 min) rule out a tight loop.
- Lazy counts cannot block the verdict. `loadCounts` runs after `setResult`, each count has an 8 s timeout and swallows errors, and `countRun` discards late answers after a rebuild or close.
- The live-preview change (main.js applySettings) pins pixelShift/pixelShiftMinutes/dailyReload/dailyReloadTime to `prev` along with the existing kiosk/limit keys. Cancel replays `original` through the same path, so nothing leaks.
- rebuildClient moving ahead of evaluateSleep is safe: rebuildClient (main.js:82-95) only builds objects and does not tick.
- Harness changes fail loudly rather than masking. The guard throws after a successful spec. A token-seeded spec that ends up at plex.tv is unstubbed and gets flagged. `pauseAtChecked`/`freezeClock` are bounded and throw on exhaustion.

## Issues

### Critical

None.

### Important

1. **The "Turn off unwatched only" fix changes a saved setting without the settings PIN (kiosk bypass).** code-bug
   - Location: js/main.js `runFix`: `if (id === 'unwatched') return applySettings({ ...state.settings, unwatchedOnly: false });`. The other fixes go through requestSettings/requestDiagnostics, which call `requestPin()`. This one calls applySettings directly and persists.
   - Reproduction (scratch e2e): seed `{ unwatchedOnly: true, kioskMode: true, settingsPinHash/Salt for '2468' }`, POST `/__mock/empty`, load, then click `#empty-actions button`. Output: `before true` / `after false open dialogs: []`. localStorage now has `unwatchedOnly: false` and no PIN prompt was shown. The same button sits in the toast after a failed manual refresh (handleFailure `notify`), so anyone at the TV can do it.
   - Why it matters: everywhere else in the app a persisted settings change is PIN-gated (Save, import, Reset, token reveal). This is the one path that is not.
   - Fix: `if (id === 'unwatched') return requestPin().then((ok) => ok && applySettings(...))`, or route it through `requestSettings` with the box unticked for Save. Add a kiosk case with a PIN set.

### Minor

1. **The "Turn off unwatched only" button is offered when unwatched-only is already off.** code-bug
   - Location: main.js `FIXES_BY_KIND.empty = ['unwatched']` is applied to every `kind: 'empty'` error. engine.js:151-153 raises that error for any empty pool, including one emptied by the household limit.
   - Reproduction (scratch e2e): seed `{ unwatchedOnly: false, maxContentRating: 'G' }` and rate titles 1-8 as `R` via `/__mock/rate`. The empty card shows `No posters found in that library at or below G (...)` with buttons `["Turn off \"unwatched only\""]`. Pressing it saves the same value and nothing changes.
   - Fix: have `fixesFor` take the settings into account (offer `unwatched` only when `state.settings.unwatchedOnly`), or offer "Open settings" for the limit case.

2. **An approved first-run token is silently dropped when Settings is opened (or its PIN prompt is up) at the same moment.** code-bug
   - Location: main.js finishFirstRun → `requestSettings({ token })`. When `settingsUI.isOpen` is true, requestSettings ignores `options.token` (it handles only signIn/test). `settingsUI.open` also returns early on `dialog.open`. kiosk.js:353-355 shares one verify() between concurrent callers.
   - Reproduction (from reading the code, not run): an unconfigured display with a PIN set shows the code. The user presses "Open settings", and the PIN prompt opens while the card's flow keeps polling (firstRunWanted is still true because the sheet is not open). The code is approved during the prompt. Both requestSettings calls await the same verify(), the button's call opens the sheet first, and the `{ token }` call reaches `open()` with `dialog.open` already true. The approval is lost and the sheet shows a plain "Sign in with Plex" button.
   - Fix: stop the card's flow when a Settings request starts, not only once the sheet is open. Or, in requestSettings when the sheet is open, forward `options.token` (`settingsUI.signInWith(token)`).

3. **The Custom minutes field does not show what will be saved.** code-bug
   - Location: settings-ui.js `rotateMinutes` `change` handler ("shows what will be saved") with duration.js formatMinutes (rounds to 0.1 min).
   - Reproduction (node): `0.25 -> 15 s, field shows 0.3 -> retyped 18`; `2.55 -> 153 s, shows 2.6 -> 156`; `-3 -> 10 s, shows 0.2 -> 12`. Retyping the displayed value changes the setting.
   - Fix: show whole seconds when the value is not a whole number of tenths of a minute, or round `secondsFromMinutes` to 6 s steps so the two agree.

4. **An unconfigured display polls plex.tv every 2 s indefinitely.** spec-gap
   - Location: settings-ui.js pinSignIn (`PIN_POLL_MS = 2000`) with runFirstRun looping on expiry and no cap.
   - Reproduction (arithmetic from the constants): a 15-minute code means 450 polls plus 1 createPin, then repeat. That is about 1,800 plex.tv requests an hour (about 43k a day) from any display left unconfigured, asleep or not.
   - Fix (needs a product decision): slow the poll after the first few codes go unused, or pause while the display sleeps or the page is hidden.

## Declined to judge

- How the 'diagnostics' fix behaves inside the open Settings sheet: it asks for the PIN again even though the sheet is already unlocked (requestDiagnostics → requestPin). Whether that is wanted is a product question, so I did not rule on it.
- Whether a real Plex server returns `totalSize` for `X-Plex-Container-Size=0`. The code's own comment says "verify against a real server", and I cannot check that here.
- The guard ignores requests made from service workers. Contexts block service workers by default, so I judged this outside the practical risk.

## Recommendations

Fix Important 1 and add a PIN-set kiosk case for each fix button. Minors 1-3 are small. Minor 4 should go to the conductor as a product question.

## Assessment

The sign-in flow, race handling, counts, preview pinning and harness are well built, and every test passes. One error action writes a persisted setting without the kiosk PIN, which is the kind of bypass this phase was asked to avoid.

Files read: git diff --cached (all files); js/main.js (rebuildClient, requestDiagnostics, handleFailure region); js/engine.js:140-156; js/settings-ui.js:72-122, 360-380; js/kiosk.js verify region; js/plex.js PLEX_TV line; tests/e2e/lib.mjs makeMock/withApp; tests/e2e/run.mjs header; tests/e2e/kiosk.spec.mjs:8-30; tests/e2e/settings-sheet.spec.mjs:1-40, 336-349; package.json scripts.

**Verdict:** CHANGES REQUESTED
