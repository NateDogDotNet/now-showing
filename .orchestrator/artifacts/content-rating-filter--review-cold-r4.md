produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r4 · mode: cold
**Verdict:** CHANGES REQUESTED

Reviewer: content-rating-filter-review-cold-r4 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T05:41:21Z · Method: cold code review · Scope: content-rating-filter, r4, base e9394ec (HEAD), staged tree 71b9b7e

### Critical
None found.

### Important
1. **The post-decode re-check in `showPoster` has no test: removing it leaves every test green** (code-bug: the tests do not guard a safety check).
   - Location: js/main.js:110-114. This is the second `allowedOnScreen` check, after `await display.show(...)`.
   - Evidence: in the scratch copy I replaced `if (!allowedOnScreen(poster)) {` after `display.show` with `if (false) {`. `node tests/e2e/run.mjs content-rating` still passed all 16 cases, and the unit suite has no coverage of main.js. I then reverted the mutation. As a control, removing the *pre*-draw check makes cases 12 and 13 fail ("title 4 (R) was never drawn: 3,2,4,1,6"), and removing the preview limit pin makes case 14 fail. So only this guard has no test.
   - Why it matters: this is the only defence against a limit that is tightened while `img.decode()` is pending. A large poster on a low-end kiosk can take hundreds of milliseconds to decode. Without the check, the above-limit poster gets drawn. It stays up until the queued `forceAfter` tick fetches a replacement, and nothing would notice if the check regressed. The code itself is correct: `display.show` sets `active` synchronously after the decode resolves, and the check runs in the next microtask, before any paint. Only the test is missing.
   - Fix: add a case that holds the decode, not the download. One way: serve the transcode response in two chunks, or as a very large image, and save PG-13 between the chunks. Another: move `showPoster` behind an injectable `display` and unit-test it with a `show()` that resolves only after the test changes the settings.

### Minor
1. **A new limit takes effect only after `await display.apply(...)`** (code-bug).
   - Location: js/main.js:428 runs before js/main.js:453 (`blockPoster`).
   - Evidence: by reading. `applySettings` awaits `display.apply` first, and that calls `loadFrame`, which can wait on `img.decode()` of a custom frame URL with no timeout (js/display.js `loadFrame`). Only after that does it hide a poster that is now above the limit.
   - Why it matters: if one Save both tightens the limit and changes the frame, an R poster can stay on screen for as long as the frame takes to load. That breaks "taken off the screen at once". Draws stay safe in the meantime, because `state.settings` is updated synchronously and `showPoster` reads it.
   - Fix: run the `allowedOnScreen` check and `blockPoster()` right after `state.settings = ...`, before the `await` (skip it when `preview` is set).
2. **A child can pin an above-limit now-playing poster and it then stays up for good** (spec-gap).
   - Location: js/main.js:85-86 and js/main.js:479-484.
   - Evidence: by reading. With `limitNowPlaying: false`, a playing R title is shown (e2e case 5 confirms it). `togglePin` pins `engine.current`, and from then on `allowedOnScreen` exempts it by `staticRatingKey`. When playback ends, the R poster does not leave rotation; it stays pinned.
   - Why it matters: a one-tap control turns a temporary, opt-in exemption into a permanent one. Whether the pin button should be refused for above-limit posters is a product decision. The current rule, "a pinned poster is always shown", does not cover this case.
   - Fix (if wanted): refuse to pin when `!allows(limit, current.contentRating)`, or make the exemption apply only to pins made in Settings.
3. **A corrupt or mistyped stored or imported limit becomes "no limit"** (spec-gap, outside the diff).
   - Location: js/settings.js:76, `oneOf('', 'G', …)` with default `''`.
   - Evidence: by reading. `sanitize` maps any invalid value, such as `'pg-13'` from a hand-edited config.json or import file, to the default `''`. So `allows()` fails closed on a corrupt limit (js/ratings.js), but that branch can never be reached from stored settings. The setting fails open before it gets there.
   - Fix (if wanted): normalise case in the sanitiser, or default an invalid non-empty value to the strictest limit.
4. **One mutation of the now-playing gate survives** (code-bug, test gap, low risk).
   - Location: js/engine.js:79, `s.limitNowPlaying !== false`.
   - Evidence: changing it to `=== true` passes all 205 unit tests.
   - Why it matters: in practice `sanitize` always gives a boolean, so the risk is low. But no test checks the fail-closed default when the flag is missing, which is what the `!== false` form is there for.
   - Fix: add an engine test with the flag `undefined`.
5. **No e2e case uses a server that ignores the filter** (code-bug, test gap, low risk).
   - Evidence: the mock honours `contentRating` strictly (scripts/mock-plex.mjs), so the e2e random-poster cases would pass even without the client-side filter. The unit tests do cover the client-side filter: setting `permitted = () => true` fails 9 engine tests, and removing the cache filter fails 5 cache tests.
   - Fix (optional): add a mock flag that ignores `contentRating`, and run case 1 with it.

### What holds up (verified)
- `allows()` fails closed for unrated, empty and unmapped ratings and for an unknown limit, and returns true only when no limit is set. Mutating it to allow unrated titles fails 10 tests. Mutating it so an unknown limit allows everything fails 1 test.
- The client re-checks every route: random pool (engine filter), now-playing (nulled when blocked), offline cache (`random()` filter plus a `showPoster` re-check), the heal re-download, and a limit change while a tick is running (`forceAfter`; case 15 covers it).
- Entries cached before 2.1, with no stored rating, are excluded. A poster that fails to decode is dropped and is not retried in a loop.
- Live preview keeps the saved limit, and Cancel cannot widen it (case 14 has teeth).
- Asleep: nothing is drawn under the veil, including the heal download (case 9).
- `blockPoster` also clears the alt text and the title card.
- The pool cache key includes the limit.
- The flaky-test risk is low. The timing thresholds are generous (≤1500 ms or <3000 ms against observed 5-1605 ms). The "all titles appear" sampling has a vanishing chance of a false failure.

### Declined to judge
- The country mapping values (gb, de, au, ca, fr, nl rungs) and the choice of rung for each one: this is a product or regulatory ruling. Unmapped values, such as `us/…` prefixes or `X18+`, fail closed, so they cause over-blocking, not exposure.
- The pinned-poster exemption itself: the UI text states it as intended.
- Whether Plex honours a comma-separated `contentRating=` with `gb/12A` values: the server filter is only an optimisation, and the client enforces the limit.

### Read and ran
Files read: `git diff --cached` (all source and test files in the stat), js/ratings.js, js/engine.js, js/main.js (most of it), js/display.js, js/plex.js (pickNowPlaying/toPoster/pool), js/poster-cache.js, js/settings.js (schema and sanitize), js/settings-ui.js (events, read/write), scripts/mock-plex.mjs (diff), package.json, tests/e2e/run.mjs (head), tests/e2e/content-rating.spec.mjs (helpers, case list, timing lines).

Ran, all in a scratch export of the staged index (`mktemp -d` gave /tmp/tmp.mbv3NFgExN; `git checkout-index -a --prefix=`; write-tree checked as 71b9b7e; removed afterwards; the live worktree was not touched):
- `node --test tests/*.test.js`: 205 pass, 0 fail.
- `E2E_PORT=19840 E2E_MOCK_PORT=19841 node tests/e2e/run.mjs content-rating`: all 16 cases PASS.
- Unit mutations, each reverted:
  - engine `permitted` always true: 9 fail
  - now-playing gate `=== true`: 0 fail (survives)
  - cache filter removed: 5 fail
  - unrated allowed: 10 fail
  - unknown limit allows everything: 1 fail
  - cache meta without rating: 5 fail
- E2e mutations (ports 19850/19851), each reverted:
  - post-decode check removed: all pass (survives)
  - preview limit pin removed: case 14 fails
  - pre-draw check removed: cases 12 and 13 fail
