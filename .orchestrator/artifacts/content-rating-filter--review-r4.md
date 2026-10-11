produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r4 · mode: anchored
**Verdict:** APPROVE

Reviewer: content-rating-filter-review-anchored-r4 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T05:41:21Z · Method: anchored full confirmation review (risk:high, ui) · Scope: content-rating-filter, r4, base e9394ec, tree 71b9b7e541b65bb0136236d431b0c58ea5e1c6f6 (staged index of /home/user/wt-content-rating-filter)

Criterion 6 attacks: PASS
Q25: confirmed. Chromium leaves `img.decode()` pending forever when `src` is removed before the image has loaded. In the app this stops rotation until a reload: my refresh presses, spaced about crossfadeMs + 200 ms apart, hung it after 17 presses (crossfadeMs 0) and after 60 presses (crossfadeMs 1200). It is rare in the field and safe for children (see Q25 below).

## What I read and ran

Read: the plan section `content-rating-filter` (docs/integration-plan.md:319), spec R-FILT-1 (docs/spec.md:232-244), the phase record (K19, K20, K22, K23, and the cold r4 findings C4I1 and C4M1-5), and the r3 anchored and cold reviews. In the diff (`git diff --cached`) I read js/main.js, js/settings-ui.js, js/engine.js and js/ratings.js. I also read js/main.js applySettings, tick and settingsUI wiring, js/settings-ui.js:185-262 (events, Cancel, import, Reset layout), js/settings.js:76-77 and fromImport, js/display.js:101-150 (show), cases 1-16 of tests/e2e/content-rating.spec.mjs, tests/e2e/lib.mjs withApp, and scripts/mock-plex.mjs:85-100.

Ran everything in a scratch copy `D=$(mktemp -d)` = /tmp/tmp.cfAqnM5szo, made with `git archive 71b9b7e | tar -x`. Playwright is the global install. Ports were 19710-19761. The scratch copy has been removed. `git write-tree` in the worktree still gives 71b9b7e, and nothing was written to the live tree or the index.
- `npm test`: 205 pass, 0 fail.
- Full `content-rating` e2e, twice, at the default 4-way parallelism: all 16 cases pass both times. Case 7 passed both times, as did cases 4 and 10, which r4 had noted as flaky.
- Mutations, each reverted and checked with grep (count 0):
  - Dropped `if (force && state.busy) state.forceAfter = true;`. Case 15 fails: "an allowed poster followed the running tick at once (on screen: 1, 5063 ms)". Cases 14 and 16 still pass, so case 15 is the test that has teeth for this.
  - Removed the preview override line in applySettings. Case 14 fails: "dialog open: only titles within PG-13 were drawn: 1,2,3,4,5,6,7,8".
  - Mock ignores the filter (`const ratings = null` at mock-plex.mjs:93). Cases 1, 2, 4, 5, 10, 12, 14, 15 and 16 all pass.
- My own attack spec, scratch only (`review-attacks.spec.mjs`, with a MutationObserver recording every active layer):
  - A. Import via Settings, then Cancel. PG-13 is saved, and the imported file has `{maxContentRating:'', limitNowPlaying:false, posterFit:'contain'}`. The form toggle shows off. 40 refreshes with the dialog open drew [1,2,3,6], and 10 more after Cancel also drew only [1,2,3,6]. The stored limit is still PG-13. PASS.
  - B. Pinned poster. Title 4 is pinned, then PG-13 is saved. It stays up after the save and after a reload (exempt, as D5 requires). After unpinning, 15 refreshes drew [1,2,3,6]. PASS.
  - C. Sleep and wake. Title 4 is up, the clock moves into the 01:00-02:00 window (body has `asleep`), then PG-13 is saved. Right after the save title 6 is up. From the save through the wake, only [3,6] were drawn. PASS. To run this I shortened the window to 01:00-02:00, because the pre-existing `reg.update` interval in main.js throws under the harness's blocked service worker once fake time passes 6 h. That code predates this phase and is outside the diff.
  - D. "Reset layout" (which calls `onPreview(read())`) with the household toggle unticked and not saved. 30 refreshes drew [1,2,3,6]. PASS.
- Corrupt limit (node, js/ratings.js). For `'PG13'`, `'pg-13'`, `'x'`, `0`, `false`, `'NC17'` and `' PG-13'`, both `allows(l,'G')` and `allows(l,'PG-13')` are false and `allowedValues(l)` is empty. Under PG-13, unrated values (`''`, undefined, `NR`, `us/PG`) are all refused.
- Q25 probes: a standalone Chromium page, then a scratch `q25.spec.mjs` against the app (below).

## Earlier findings: status

| Finding | Status | Evidence |
|---|---|---|
| r3 cold Important CCI1: live preview bypasses the saved limit | **resolved** | js/main.js applySettings: `if (preview) next = { ...next, maxContentRating: prev.maxContentRating, limitNowPlaying: prev.limitNowPlaying }`. Every caller of `onPreview` (data-live input/change, Reset layout, import, Cancel's `onPreview(original)`) goes through this line. Case 14 passes, and it fails when the line is removed. My attacks A (import + Cancel) and D (Reset layout) draw only allowed titles. Cancel has nothing to undo for the limit because the limit never left its saved value. |
| r3 cold Minor CCM1: case 7 flaky under parallelism | **resolved** | Case 7 now runs `waitForTitle(page, 4)` before its assertion. It passed in both full parallel runs. |
| r3 anchored recommendation: a limit saved during a running tick loses its forced tick | **resolved** | `state.forceAfter` is set in applySettings when `force && state.busy`, and the `finally` of tick runs `tick({force:true})`. In case 15 the poster comes back in about 100 ms; with the line removed it takes 5063 ms and the case fails. On top of that, `decide()` forces whenever `body.poster-blocked` is set. |

## Route-by-route (criterion 6)

| Route | Result | Evidence |
|---|---|---|
| Random | blocked | engine `permitted()` filters the pool; case 1 (50 picks: 1,2,3,6) |
| Offline cache | blocked | `cache.random(…, maxContentRating)`; case 4 (20 offline rotations) |
| Now-playing | blocked (allowed only with `limitNowPlaying:false`) | case 5 |
| Pre-2.1 cache entry (no rating) | blocked | case 4, second part |
| Pinned | allowed (exempt), as required | attack B, including reload and unpin |
| Plex ignoring the filter | blocked | mock mutation: 9 cases pass |
| Limit saved during an in-flight download | blocked | cases 12, 13, 16 (also with the mock ignoring the filter) |
| Offline limit change | blocked at once | cases 10 and 11 (gone in 1-6 ms) |
| Preview, then Cancel | the limit is never previewed | case 14; attack D |
| Import via Settings | the limit is never previewed; only Save stores it | attack A |
| Sleep/wake | blocked | attack C |
| Corrupt limit | fails closed at the engine | node run above. js/settings.js mapping a bad stored value to `''` is K21, an owner question, and is not a finding here. |

## Strengths
- The CCI1 fix is a single line at the one entry point, so no preview path can carry a limit. Save is the only way to change it, and Save goes through the guarded path (blockPoster plus a forced tick, queued if a tick is busy).
- The new e2e cases 14-16 are discriminating. Each one fails under the mutation it targets.
- The client-side guarantee holds with the server filter switched off, across the new cases too.

## Critical
None.

## Important
None.

## Minor
None. The cold r4 findings (C4I1 = K22, C4M1 to C4M5) are already recorded in the phase record, so I have not repeated them. I found nothing new on top of them.

## Q25 (context only, routed to `pixel-shift` under K23, not a finding against this phase)
- **Real.** A standalone Chromium probe gave these results:
  - `src` removed from an img while a slow URL loads: `decode()` is still pending after 4000 ms.
  - A blob URL with `src` removed at 0 ms or 1 ms: still pending after 4000 ms.
  - `src` removed at 5 ms or 20 ms (after the blob has loaded): the decode resolves (about 85 ms).
  - `src` replaced rather than removed: the promise rejects with EncodingError.

  So the hang needs the cleanup timer (js/display.js show, `prev.removeAttribute('src')` after crossfadeMs + 200 ms) to fire in the few milliseconds between the next draw's `next.src = url` and that image finishing its load. In the app (scratch q25.spec, refresh presses spaced crossfadeMs + 200 ± 40 ms apart, decode instrumented), one `decode()` never settled after 17 presses (crossfadeMs 0) and after 60 presses (crossfadeMs 1200). After that, 8 more refreshes left the same poster up, so rotation had stopped.
- **Field likelihood: low.** It needs two draws within crossfadeMs + 200 ms (1.4 s by default) and a timer that lands inside a load window of a few milliseconds. Unattended rotation, at minutes per poster, never does this. Rapid manual refreshes, a now-playing change straight after a draw, or this phase's queued forced tick (forceAfter) right after an in-flight draw can. A slow Pi, where loading a large blob takes longer, widens the window. This phase raises the chance only marginally: forceAfter fires only on a limit save during a running tick, and a refused draw draws nothing, so it arms no timer. The one exception is the K22 post-decode refusal, which is itself vanishingly rare.
- **Child safety is unaffected.** While a tick is stuck, applySettings still runs `blockPoster()` on an above-limit poster (that does not depend on `state.busy`), and the queued forced tick never runs, so the screen stays blank, which fails closed. If the stuck decode ever settled, showPoster's post-decode check would still apply. The cost is availability (a frozen display), so K23's must-fix routing is sound. If CI flakes, the fix should move up, as K23 already says.

## Declined to judge
- K21 (js/settings.js maps an unknown stored limit to `''`): an owner question outside the Output, per the dispatch.
- C4M1 to C4M5 and C4I1: already raised by cold r4 and recorded. I did not re-rule on them.
- The pre-existing `reg.update` TypeError under the harness's blocked service worker after 6 h of fake time (js/main.js service-worker registration, unchanged by this diff): it is outside the diff and has no effect on the child-safety routes.

## Recommendations
- When Q25 is fixed in `pixel-shift`, add a regression test that re-runs case 15 or 16 back to back, since those cases produce the closely spaced draws that trigger it.

## Assessment
The three r3 items are resolved, and each fix is pinned by an e2e case that fails when its fix is removed. Every criterion-6 route either blocks the title or, for a pinned poster, exempts it, including with Plex ignoring the filter, an import, a preview followed by Cancel, and sleep/wake. Q25 is real but rare, fails closed on safety, and is correctly routed.

**Verdict:** APPROVE

Files read: /home/user/plex-poster-app/docs/integration-plan.md (phase section), /home/user/plex-poster-app/docs/spec.md (R-FILT-1), /home/user/plex-poster-app/.orchestrator/phases/content-rating-filter.md, /home/user/plex-poster-app/.orchestrator/artifacts/content-rating-filter--review-r3.md, --review-cold-r3.md, the staged diff, js/main.js, js/settings-ui.js, js/settings.js (lines 59, 76-77, 206-221), js/display.js (95-160), tests/e2e/content-rating.spec.mjs, tests/e2e/lib.mjs, tests/e2e/run.mjs, scripts/mock-plex.mjs (85-100), index.html (control buttons).
