produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r6 · mode: anchored
**Verdict:** CHANGES REQUESTED

Reviewer: content-rating-filter-review-anchored-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T06:43:28Z · Method: anchored confirmation review (risk:high, full) · Scope: content-rating-filter, r6, base e9394ec, tree a9da765

Criterion 6 attacks: PASS

## What I read and ran
Read: plan phase 13 (`content-rating-filter`), spec R-FILT-1, decisions D5 / D21 K5 / D28 A8-d, questions.md Q19 and Q25, phase record (K19-K24), and the staged diff (`git diff --cached`) of js/main.js, engine.js, ratings.js, poster-cache.js, plex.js, settings-ui.js, index.html, css/app.css, sw.js, plus e2e cases 4, 5, 9, 17, 18 and the engine unit test for an absent limitNowPlaying.

Where it ran: a scratch copy at `mktemp -d` → /tmp/crf-r6-JuPy, populated with `git checkout-index -a --prefix=` from the live index. That reads the index and does not write it. `git rev-parse HEAD^{tree}` in the scratch copy = a9da765b0afc…, the reviewed tree. Ports were 20010-20061. Afterwards I deleted the scratch copy and checked that the live `git write-tree` still gives a9da765.
- `npm test`: pass 206, fail 0. `node scripts/check-precache.mjs`: 26 files OK.
- `npm run test:e2e -- content-rating`, full spec with the default 4 workers: **6 runs, 4 pass and 2 fail. Both failures are case 18** (see Important 1). Case 18 alone (`E2E_CONTENT_ONLY='^18 '`): 6 of 6 pass.

## Earlier findings routed to r6 (status)
- **C4I1, the post-decode re-check has no test: resolved.** Case 18 parks `HTMLImageElement.decode` for title 4 after the pre-draw check, saves PG-13, then releases the decode. Mutation: I deleted the re-check after `display.show` in `showPoster` (main.js:110-114) and ran case 18. It failed with `title 4 was taken down after its decode (on screen: 4)`. Reverted.
- **C4M1, block before the frame load: resolved.** main.js now calls `blockPoster()` before `await display.apply` (applySettings, around main.js:427-431). Mutation: I moved the block after `display.apply` and ran case 17. It failed with `title 4 (R) is off the screen while the frame is still loading (on screen: 4)`. Reverted.
- **C4M4, absent limitNowPlaying: resolved.** Mutation: `s.limitNowPlaying !== false` → `=== true` in engine.js. `node --test tests/engine.test.js` gave pass 34, fail 1 (the new absent/undefined test). Reverted.
- **No regressions.** Cases 1-17 passed in every full run. Earlier mutants had been killed by the conductor; the three above I re-ran myself.

## Criterion 6 attack set (compact)
| Route | How | Result |
|---|---|---|
| Random | cases 1-3 (50 picks under PG-13: only 1, 2, 3, 6; the request lists gb/12) | pass |
| Plex ignores the filter | mock-plex.mjs:94 changed in scratch to `const items = MOVIES`, then the full spec run | all 18 cases pass: the client filter holds |
| Offline cache | case 4 (20 offline rotations under PG-13 never show 4) | pass |
| Pre-2.1 cache entry | case 4, second half (entries with no rating are skipped, empty card shown) | pass |
| Now-playing | case 5; my scratch attack B: R playing with limitNowPlaying off, then Save turns it on | R gone within 300 ms of Save; 10 refreshes after that only show 1, 2, 3, 6 |
| Pinned (must be allowed) | scratch attack A: `staticRatingKey:'4'` under PG-13, 5 refreshes | title 4 shown every time (exempt, as D5 says) |
| Limit saved mid-download | cases 12, 13, 16 | pass |
| Limit saved mid-decode | case 18 (and the mutation above) | the guarantee holds; the test is flaky, see Important 1 |
| Limit saved with a frame change | case 17 (and the mutation above) | pass |
| Offline limit change | cases 10, 11 | pass |
| Preview then Cancel | case 14; code: `preview` forces the saved limit (main.js:425), and Cancel goes through `onPreview(original)` | pass |
| Sleep/wake | scratch attack C: PG-13, clock 00:59, sleeps at 01:00 (veil visible), a key press wakes it, then 8 refreshes | only 1, 2, 3, 6 shown |
| Corrupt limit | `allows()` fails closed for an unknown limit (ratings.js, unit-tested). But `sanitize({maxContentRating:'PG13'})` and `'pg-13'` both return `''` (checked with node) | known K21, owner question; declined |

In the Important 1 failure the screen showed title 3, which is allowed. No route showed an above-limit or unrated poster.

### Critical
None.

### Important
1. **Case 18 flakes in the full spec, so criterion 3 (`npm run test:e2e -- content-rating`) fails about 1 run in 3 under its default parallelism.** Class: code-bug (test in Output; the criterion fails intermittently as written). Location: tests/e2e/content-rating.spec.mjs, case 18, the final `await waitForTitle(page, titleNo(parked[0]))` (about line 731).
   - **Evidence:** Two of six full runs failed with `title 6 did not come up within 10000 ms (on screen: 3)`. Case 18 alone passed 6 of 6.
   - **Cause (instrumented):** the Q25 race in js/display.js. To show it, I added a counter in scratch to display.js's revoke timer, counting `prev.src !== old`, meaning a newer draw is using that layer. The failing run reported `q25=3`. Instrumentation reverted. The sequence:
     1. Title 4's draw starts the `crossfadeMs + 200` revoke timer on the other layer.
     2. The forced tick puts its replacement (title 6) onto that layer and parks at decode.
     3. The timer fires and removes the layer's `src`.
     4. The released decode then fails. The tick falls back to `handleFailure`, which shows an allowed cached poster (3), not 6.
   - **Why it matters:** child safety is intact. But the phase's own acceptance command is unreliable on CI. The new case is more exposed than the ~1 in 12 the record attributes to Q25. K23 says the display.js fix moves up if CI flakes.
   - **Fix (either one):**
     - (a) Test-only, and it does not weaken the guarantee being tested (the post-decode take-down is already asserted before this line): replace the last `waitForTitle(parked[0])` with a wait for any allowed title [1, 2, 3, 6].
     - (b) Apply K23's display.js guard now, which is outside this phase's Output, so it is the conductor's call.

### Minor
None new.

## Declined to judge
- C4M2 / K24 (pinning an above-limit now-playing poster while limitNowPlaying is off) and K21 (settings.js maps an invalid limit to `''`, fail-open): these are owner questions already raised, and settings.js is outside Output.
- Q25 display.js fix: routed to `pixel-shift` by K23 and outside the diff. It is cited above only as the cause of Important 1.

## Recommendations
- Take fix (a) as a correction. The re-dispatch cap is reached, and the change is one line in a test file.
- Record that the content-rating spec is **not** stable over 2 full runs here: 1 of my first 2 runs failed, and 2 of 6 overall. Consider listing it under K23's "if CI flakes" trigger.

## Assessment
All three r6 items are fixed and each has a test that fails without the fix (my own mutations). Nothing regressed, and every criterion 6 route holds, including a Plex server that ignores the filter. The guarantee is sound. The one blocker is test reliability: new case 18 races the known display.js revoke timer and fails about a third of full-spec runs, so criterion 3 is not dependable as written.

**Verdict:** CHANGES REQUESTED
