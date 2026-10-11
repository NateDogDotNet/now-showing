produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r8 · mode: anchored
**Verdict:** APPROVE

Reviewer: content-rating-filter-review-anchored-r8 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T14:08:29Z · Method: anchored confirmation review (risk:high, full) · Scope: content-rating-filter, r8, base af55616, tree a1a3b84

Criterion 6 attacks: PASS

## What I read and ran
- Read: the plan phase `content-rating-filter`, spec R-FILT-1, decisions D5, D21 K5, D28 A8-d, D29 to D36, the r7 anchored review, and the r8 builder handback. Diffs: `git diff --cached` (stat) and `git diff 7989149 a1a3b84 -- js/ css/` (r7 tree to r8 tree; the display.js hunk is the `display-decode-hang` base, which is outside this phase). Also read poster-cache.js `put`/`random`, plex.js `toPoster` (lines 99-118), and the main.js keydown guard (main.js:609).
- Where: `git archive a1a3b84` extracted into `/tmp/tmp.Aam1QiviqZ` (mktemp -d), with node_modules symlinked from /home/user/wt-e2e-harness. Removed afterwards. Afterwards `git write-tree` in the live worktree still gives a1a3b84, and nothing is unstaged or untracked.
- `npm test`: 209/209 pass.
- `npm run test:e2e -- content-rating`, 2 full runs (ports 21110/21111): both exit 0, 22/22 cases pass each time. **The spec was stable over 2 of 2 full runs.**
- Full `npm run test:e2e` once (ports 21120/21121): exit 0. All 7 specs pass (cache-first, content-rating, display-decode, rotation, sleep, smoke, ui-rotation). Nothing regressed.
- Mutants, each one reverted and checked with `cmp` against `git show a1a3b84:<file>`:
  - MA: I removed only the `applySettings` call to `cutOutgoing()` (main.js `else cutOutgoing();`) and kept the one in `showPoster`. Case 21 FAILS: "title 4's layer is invisible after the save (opacity 0.395184 after 1012 ms)". **Killed.** The test therefore covers the save path on its own. The builder had removed both calls at once.
  - MB (criterion 6 attack): I made the mock ignore the `contentRating` parameter (`mock-plex.mjs:94` becomes `const items = MOVIES`). The full spec still exits 0, with 22/22 cases passing. The client-side ladder holds on every route the spec covers.
  - The builder's mutants for C7I1 (`read()` takes the pin from `getSettings()`) and C7M2 (the `refreshRating` call is removed) kill cases 20 and 22. I did not repeat them.
- Node probe (in the session scratchpad, now deleted) for the upward re-rate question: `put({ratingKey:'4', contentRating:'PG'})`. Then `allowedValues('PG-13').includes('R')` gives `false`, and `cache.random(undefined,'PG-13')` returns `{ratingKey:'4', contentRating:'PG', source:'cache'}`.

## Confirmation of earlier findings
| Finding | Status | Evidence |
|---|---|---|
| C7I1: Save after an import lost the imported pin | **resolved** | settings-ui.js: `pendingPin` is set by `write()` (when the dialog opens and on import), cleared by Unpin, and used by `read()`. main.js `applySettings` still makes previews use the saved pin, so an unsaved pin is never drawn (D29 kept). Case 20 covers it: import, 8 refreshes, Cancel. The saved pin stays none, only titles 1, 2, 3 and 6 are drawn, and the reopened dialog shows none. Then import and Save: the pin `4` is stored and shown (exempt, D32), and Unpin plus Save clears it. Case 20 passes in 2/2 runs, and the builder's mutant kills it. Key presses inside the dialog are ignored (main.js:609), so the pin cannot change behind an open dialog and be overwritten by `pendingPin`. |
| C7M1: an outgoing above-limit poster finished its fade after a stricter limit was saved | **resolved** | main.js `cutOutgoing()` adds `.cut` to the non-active layers, and css/app.css sets `.poster-layer.cut:not(.active)` to opacity 0 with no transition. It runs on every apply, in the `else` after `blockPoster()`, and after the decode in `showPoster`. `showPoster` clears `.cut` before the next draw. That layer is non-active, so it stays at opacity 0 until its new image is decoded and it becomes active. Clearing `.cut` therefore cannot bring back the old above-limit image. Case 21 passes in 2/2 runs, and mutant MA kills it. |
| C7M2: the stored rating was not refreshed online | **resolved as D35 words it** | poster-cache.js `refreshRating` rewrites only the rating of an existing entry, and writes nothing when the rating already matches. main.js `tick` calls it right after `engine.decide`, so cache hits and posters refused at the draw are covered too. 3 unit tests and e2e case 22 cover it. For upward re-rates, see Minor 1. |

## Criterion 6 attacks (compact)
| Route | Result | Evidence |
|---|---|---|
| Random | holds | cases 1, 2, 3 |
| Offline cache | holds | case 4 (20 offline rotations, title 4 never shown) |
| Now-playing | holds | case 5 (PG-13 hides title 4; `limitNowPlaying:false` shows it) |
| Pre-2.1 cached entry | holds | case 4 ("entries without a stored rating are never shown offline") |
| Pinned (must be allowed) | allowed, as ruled (D5, D32) | case 20(b): title 4 stays up over 3 refreshes |
| Plex ignoring the filter | holds | mutant MB: 22/22 cases pass |
| Limit saved mid-crossfade (new) | holds | case 21, mutant MA |
| Import then Cancel / Save (new) | holds | case 20 |
| Mid-download, mid-decode, frame change, offline change, preview/Cancel, sleep/wake | hold | cases 7 and 9-19, passing in 2/2 runs plus the full-suite run |
| Upward re-rate, then offline | **leaks** (narrow; see Minor 1) | node probe above |

## Strengths
- Each of the three D35 items has a test, and a mutant kills each one. Mutant MA shows that case 21 covers the save path without help from the other call.
- C7I1 is fixed in the dialog alone. The rule that a preview never draws an unsaved pin is untouched.
- `refreshRating` is minimal. It does not re-order entries or write a blob, and it writes nothing when nothing changes.

### Critical
None.

### Important
None.

### Minor
1. **A title re-rated upward in Plex keeps its old, lower cached rating for the offline fallback.** spec-gap.
   - **Ruling: yes, this is a reachable child-safety route, but it is narrow.** It needs all three of these:
     - (a) The title was cached while it carried the lower rating. That happens whenever it was shown online.
     - (b) Plex's rating then goes up. Realistic causes are a metadata-agent refresh, or the owner correcting a mislabelled title, which is the very case a household cares about.
     - (c) The display then falls back to the cache, with Plex down, while the entry is still there.
   - **Evidence:** the probe above. `allowedValues('PG-13')` excludes `R`, so the server-filtered pool never returns the title again. It is never decided, so `refreshRating` never runs for it, and `cache.random(…,'PG-13')` still serves it.
   - **The window can be open-ended.** Entries are evicted only after 100 newer downloads (`DEFAULT_LIMIT = 100`). A household whose allowed library is under about 100 titles may never evict the stale entry.
   - **Why it is a spec-gap and not a code-bug:** D35 asks for a refresh "whenever the poster is seen online", and the change does exactly that. The criteria are silent on titles the filter stops returning.
   - **Why it is not blocking:** the conditions above stack, and the route exists only offline. D35 orders "one more round, then land".
   - **Smallest proportionate fix:** on each successful online pool load while a limit is set, send one batched request for the cached keys, `GET /library/metadata/<k1,k2,…>` (at most 100 keys). Call `refreshRating` for each item it returns, and store `''` for any cached key Plex does not return. An empty rating is skipped under a limit, so this fails closed. That is one request per pool load and needs no schema change. The comma-separated key syntax is **(verify)**, so it should be added as a row in `real-server-validation-extended`.
   - **Do not** treat "missing from the pool" as "re-rated". The pool is a random sample, at most 3x the pool size and capped at 500, so a key can be missing for no reason.
   - **Routing:** I recommend the conductor routes this as a must-fix for a later phase that already edits `js/main.js` and `js/plex.js` (for example `metadata-and-now-playing`), or raises it at the next stop.

## Declined to judge
- **Episode ratings written onto the show's cache entry.** `toPoster` keys an episode by its show (`grandparentRatingKey`, plex.js:112) but uses the episode's own rating (plex.js:118). So when now-playing is drawn with `limitNowPlaying:false`, or an allowed episode is drawn, the episode's rating is stored on the show's entry. `put` already did this in r7. r8's `refreshRating` reaches it slightly more often (on cache hits as well). Whether Plex rates episodes lower than their shows is ruled by D33 (check on the real server, fix only if it happens), so I did not reopen it. If it does happen, the fix belongs with D33's.
- The `js/display.js` changes are the `display-decode-hang` base (D30), outside this diff. The `display-decode` spec passed in the full-suite run.
- D32 (pins exempt) and D36 (an explicit null limit means no limit) are owner rulings, so I did not reopen them.

## Recommendations
- Land, as D35 orders.
- Route Minor 1 (the batched metadata refresh of cached ratings, with a verify row for the comma-key syntax) to a later phase or to the next stop.

**Verdict:** APPROVE
