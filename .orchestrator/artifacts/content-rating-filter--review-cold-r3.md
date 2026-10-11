produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r3 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: content-rating-filter-review-cold-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T04:24:25Z · Method: cold diff review · Scope: content-rating-filter, r3, base e9394ec, tree a59b8b3

### Critical

None.

### Important

1. **Live preview gets around a saved limit, and the poster it lets through stays up after Cancel** (code-bug)
   - **Where:** js/settings-ui.js `read()` now sets `s.maxContentRating` from the household toggle. The form's `input`/`change` handlers call `onPreview(read())` for any `[data-live]` control (the "Frame & layout" fieldset, index.html:162). Settings import also calls `onPreview(s)`. js/main.js `applySettings(..., {preview:true})` sets `state.settings = next` and then returns early. That early return skips the new `blockPoster()` check and the forced tick.
   - **Effect:** Suppose the household toggle is unchecked in the dialog but not saved, and a layout control is touched. While the dialog is open, every tick and rotation runs with `maxContentRating: ''`, so posters above the limit and unrated posters are drawn behind the dialog. On Cancel, `onPreview(original)` puts the limit back through the same preview path. Nothing re-checks the poster on screen and nothing forces a tick, so the poster stays up until the next rotation (default 300 s). All this time the stored limit is still PG-13. The same thing happens when a settings file without a limit is imported and the dialog is then cancelled.
   - **Evidence:** I ran a scratch probe with the e2e harness (`withApp`, PG-13 seeded, rotateSeconds 10). It opened Settings, unchecked `#household-toggle`, changed `posterFit` and waited. Output: `stored limit during dialog: PG-13` / `drawn while dialog open: [ 6, 8 ] above-limit on screen: 8` / `after Cancel, stored limit PG-13 on screen: 8`. Title 8 is the mock's unrated title.
   - **Why it matters:** The limit is saved, yet an unrated poster is drawn, and it stays up after Settings is closed with nothing saved. That breaks the "never shown" guarantee.
   - **Fix:** Two parts. First, in `onPreview`, keep `maxContentRating` and `limitNowPlaying` from the persisted settings (only layout keys should preview). Alternatively, keep the limit fields out of the preview merge. Second, make the preview path in `applySettings` also run `if (display.currentPoster && !allowedOnScreen(display.currentPoster)) blockPoster()` and force a tick when the limit fields change, so a revert takes effect at once. Add an e2e case for this route (preview, then Cancel).

### Minor

1. **E2E case 7 is flaky under the spec's 4-way parallelism** (code-bug, in the test)
   - **What I saw:** The full `content-rating` run failed once: `title 4 (R) is on screen  2 !== 4` at content-rating.spec.mjs:242. Run alone (`E2E_CONTENT_ONLY='^7 '`), it passed 3 times out of 3.
   - **Cause:** `sampleUntil` reads the active alt only 250 ms after the refresh click. Under load the tick finishes later, so the sampled title and the title on screen differ by the time of the assertion.
   - **Product impact:** None.
   - **Fix:** After the loop, wait until the active alt is title 4 (or loop until it is) before asserting.

### Strengths

- `allows()` fails closed for unrated, unmapped and non-string ratings, and for a corrupt limit value. The engine filters every pool item and the now-playing title with it, whatever the server returned. The server-side `contentRating` filter is only an optimisation.
- `cache.random` filters on the stored rating. Entries cached before ratings were stored have no rating and are excluded while a limit is set.
- `showPoster` checks before the draw and again after the decode. The re-check runs in the same microtask continuation as the layer swap, so the poster has no frame on screen in between. Both the heal path and the offline path go through it. Asleep, nothing is drawn.
- Saving a limit, online or offline, blocks a poster that is now over the limit at once (`body.poster-blocked`, no fade) and forces a replacement.
- Mapping spot-check: the US ladder is sensible, the TV-Y7 to PG and TV-14 to PG-13 pairings are standard, and the country rows are plausible. Anything unlisted fails closed.

### Declined to judge

- **Pinned poster bypasses the limit** (`allowedOnScreen`, engine static path): this is a stated design decision ("A pinned poster is always shown"), so it is a product question. Offline, a pinned poster above the limit is still not served from the cache, which fails closed.
- **`limitNowPlaying: false` lets an above-limit now-playing title show:** this is an explicit user option.
- **Ratings with a `us/` prefix, or values like `TV-Y7-FV` and `NR`:** these are hidden under any limit. That fails closed, so it is a usability question rather than a safety one, and it depends on the exact strings Plex returns, which I could not verify here.
- **Whether Plex accepts the comma-list `contentRating=` syntax:** this is outside what I can check, and it does not matter for safety because the client check is the guarantee.

### Recommendations

Fix Important 1 and add the preview-then-Cancel e2e case. Then the only open item is the flaky test.

### What I read and ran

- **Read:** `git diff --cached` (all files) in /home/user/wt-content-rating-filter; js/display.js (show/setTitle); js/settings.js (defaults and validation for `maxContentRating`/`limitNowPlaying`/`rotateSeconds`); js/engine.js and js/main.js around the changed code (tick, handleFailure, applySettings, togglePin, diagnostics); js/settings-ui.js events (preview/cancel/import); index.html (the data-live fieldset); tests/e2e/content-rating.spec.mjs (case list and cases 1, 6, 7, 13); tests/e2e/run.mjs and tests/e2e/lib.mjs (`withApp`); package.json.
- **Ran:** everything in a scratch git worktree at /tmp/tmp.djXlHM5uBq/wt (HEAD plus the staged diff applied; `git write-tree` = a59b8b3). The worktree has since been removed. The live tree and index are unchanged (write-tree is still a59b8b3).
  - `npm test`: 205 tests, all pass.
  - E2E `content-rating` (ports 19611/19612): every case passed except case 7, which failed once (Minor 1). Case 7 alone passed 3 times out of 3.
  - Mutations, each reverted afterwards:
    - `allows()` lets unrated through: 10 unit tests fail.
    - A corrupt limit allows everything: 1 unit test fails.
    - The now-playing limit line removed: 4 unit tests fail.
    - Both `allowedOnScreen` checks removed from `showPoster`: e2e cases 12 and 13 fail.
  - Preview probe (ports 19621/19622): the evidence for Important 1. The probe file was deleted.

Files read: js/display.js, js/settings.js, js/engine.js, js/main.js, js/settings-ui.js, js/ratings.js, js/plex.js, js/poster-cache.js, index.html, scripts/mock-plex.mjs, css/app.css, sw.js (via diff), tests/e2e/content-rating.spec.mjs, tests/e2e/run.mjs, tests/e2e/lib.mjs, package.json.

**Verdict:** CHANGES REQUESTED
