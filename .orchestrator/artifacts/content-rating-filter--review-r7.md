produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: content-rating-filter · round: r7 · mode: anchored
**Verdict:** APPROVE

Reviewer: content-rating-filter-review-anchored-r7 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T13:00:30Z · Method: anchored confirmation review (risk:high, full) · Scope: content-rating-filter, r7, base e9394ec, tree 7989149

Criterion 6 attacks: PASS

## What I read and ran
- Read: the plan phase `content-rating-filter` (docs/integration-plan.md), spec R-FILT-1, decisions D5, K5, A8-d, D29 to D34, the Q19 ruling, the phase record, both r6 reviews. Diffs: `git diff --cached` (base to tree) and `git diff a9da765 7989149` (the r6 tree to the r7 tree: js/main.js, js/settings.js, tests/settings.test.js, tests/e2e/content-rating.spec.mjs). Also read main.js `allowedOnScreen`/`blockPoster`/`showPoster`/`togglePin`, settings.js `sanitize`/`load`/`fromImport`, and the settings-ui.js import, Cancel and close handlers.
- Where: `git archive 7989149` extracted into `/tmp/tmp.Pe5nYmhAzL` (mktemp -d), with node_modules symlinked from /home/user/wt-e2e-harness. Removed afterwards. The live worktree was never written to: `git write-tree` still gives 7989149 after the run.
- `npm test`: 206/206 pass.
- `npm run test:e2e -- content-rating`, 2 full runs back to back (ports 20410/20411): both exit 0, all 19 cases pass. **The spec was stable over 2 of 2 full runs.**
- Full `npm run test:e2e` once (ports 20450/20451): all 6 specs pass (cache-first, content-rating, rotation, sleep, smoke, ui-rotation). No regression.
- Mutants, each reverted and checked with diff against the index:
  - M1: the preview stops keeping the saved pin (`next = { ...next, maxContentRating, limitNowPlaying }`). Case 19 FAILS with "dialog open after the import: only titles within PG-13 were drawn: 4,6". **Killed.**
  - M2: an unknown limit maps to `''` again. tests/settings.test.js FAILS (`maxContentRating "X"`, 1 fail). **Killed.**
  - M3 (attack): the mock ignores the `contentRating` parameter (mock-plex.mjs:94 → `const items = MOVIES`). Cases 1, 4, 5, 7, 10 and 19 all pass, and the client-side filter holds.
  - Probe (temporary case 20 in the scratch spec): PG-13 saved with title 4 (R) pinned. 5 refreshes show only title 4, so the pin stays exempt (D5, D32). PASS.
  - Node probe of corrupt limits: `load()` of stored `"PG13"`, `"pg-13"`, `"X"` and `5` gives `PG-13`. `fromImport()` of the same values over a saved `G` gives `PG-13`. `allows('PG13','R')` is false.

## Confirmation of earlier findings
| Finding | Status | Evidence |
|---|---|---|
| C6I1: an imported, unsaved pin was drawn; Cancel left it up | **resolved** | main.js:426-428: the preview keeps the saved `maxContentRating`, `limitNowPlaying`, `staticRatingKey` and `staticTitle`. main.js:434: the on-screen re-check now runs on every apply, previews and Cancel included (the `!preview` guard is gone, as D29 asks). E2e case 19 (import `{"staticRatingKey":"4"}`, 12 refreshes, Cancel, 10 refreshes, nothing saved) passes in both runs, and mutant M1 kills it. |
| A6I1: case 18 flaked on the Q25 race | **resolved** | Case 18's last wait is now `waitForAllowedTitle` (titles 1, 2, 3 or 6). The take-down after the decode is still asserted before it. Stable in 2/2 runs plus the full-suite run. |
| K21/D31: an unknown stored limit turned the filter off | **resolved** | settings.js:77 maps any value outside the six allowed ones to `'PG-13'`. Absent, `undefined` and `null` stay `''` through sanitize's generic rule (settings.js:124). The unit test covers 11 junk values plus absent and null, and mutant M2 kills it. |

On the every-apply re-check: the builder says that once the preview holds the limit, `limitNowPlaying` and the pin, the preview branch cannot change the result. I agree, because `allowedOnScreen` (main.js:82-87) reads only those three settings and the poster. The branch is kept, as D29 asks, and costs nothing.

## Criterion 6 attacks (compact)
| Route | Result | Evidence |
|---|---|---|
| Random | holds | case 1 (50 refreshes, only titles 1, 2, 3, 6), case 2 (R), case 3 (no limit) |
| Offline cache | holds | case 4 (20 offline rotations, title 4 never shown) |
| Now-playing | holds | case 5 (`mock.play(4)` under PG-13: not shown; with `limitNowPlaying:false`: shown) |
| Pre-2.1 cached entry | holds | case 4 ("entries without a stored rating are never shown offline") |
| Pinned (must be allowed) | allowed, as ruled | probe case 20 (only title 4 shown); engine.test.js:308, 316 |
| Plex ignoring the filter | holds | mutant M3, 6 cases pass |
| Limit saved mid-download | holds | cases 12, 13, 16 |
| Limit saved mid-decode | holds | case 18 |
| Limit saved with a frame change | holds | case 17 |
| Offline limit change | holds | cases 10, 11 |
| Preview then Cancel | holds | case 14 |
| Import then Cancel | holds | case 19, mutant M1 |
| Sleep/wake | holds | case 9 (A8-d heal vs sleep). main.js:110 is the only `display.show` call and is wrapped by `showPoster`'s before- and after-decode checks. |
| Corrupt limit in storage | fails closed | node probe: `load()` gives PG-13 |
| Corrupt limit in an import | fails closed | node probe: `fromImport()` gives PG-13 |

## Strengths
- The C6I1 fix is the small, general one: the preview keeps every setting `allowedOnScreen` reads, so no preview can change what is allowed, whatever the dialog holds.
- Each fix in this round has a test that a mutant kills.
- D31 is implemented narrowly. Absent still means no limit, so default installs are unchanged.

### Critical
None.

### Important
None.

### Minor
1. **An explicit `"maxContentRating": null` still means "no limit".** spec-gap. Evidence: `fromImport('{"maxContentRating":null}', {…, maxContentRating:'G'})` returns `''`, and sanitize treats null as absent for every key (settings.js:124). D31 names typos ("PG13") and is silent on JSON null. Exposure is low: a dialog import shows the household toggle off and needs Save, config.json only seeds the first run (where the default is `''` anyway), and stored null needs a hand edit. Fix, only if the owner wants it: treat an explicit null for `maxContentRating` as unknown, which gives PG-13. No change needed to land.

## Declined to judge
- The Q25 display.js race (D30, phase `display-decode-hang`): outside the diff and being fixed in parallel. Case 18's relaxed wait no longer depends on it.
- K24 / D32 (pinning an above-limit poster) and D33 (TV-episode ratings vs the show poster): ruled by the owner, so not reopened.

## Recommendations
- Land once `display-decode-hang` is in, as D30 orders.
- If the owner cares about Minor 1, it is a one-line follow-up in settings.js.

**Verdict:** APPROVE
