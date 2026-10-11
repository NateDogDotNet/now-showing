Reviewer: rotation-layout-and-shell-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-08T23:48:24Z · Method: anchored confirmation code review (delta-scoped) · Scope: rotation-layout-and-shell, round r2, base 105f766, staged tree 72d3aa7

Reviewed base: 105f766 (delta-scoped)

## What I read and ran

Read: `git diff 105f766 72d3aa7` (css/app.css:188, tests/e2e/ui-rotation.spec.mjs:162-185); css/app.css:10-16, 180-215 for the `--vw`/`--vh` defaults and the sheet's equivalent; js/display.js:70-81 (where `--vw`/`--vh` are set); tests/e2e/ui-rotation.spec.mjs:1-60, 104 (`inside`); tests/e2e/run.mjs, lib.mjs (`withApp` signature); the r2 brief; my r1 review.

I confirmed with `git write-tree` in the worktree that the staged index is 72d3aa7de63c. That command wrote a tree object to the object store; the working tree and the index did not change. `git status --short` still shows the same four staged paths.

Ran, in a throwaway copy (`mktemp -d` → `/tmp/tmp.z326doCRnG`, filled by `git archive 72d3aa7 | tar -x`, with node_modules symlinked to `/opt/node-tools/node_modules`, and removed afterwards), with E2E_PORT=18760 E2E_MOCK_PORT=18761:
- `node tests/e2e/run.mjs ui-rotation rotation` → `PASS ui-rotation` (all 14 existing cases, plus `ok 844x390 rotation 90 long toast` and `ok 844x390 rotation 270 long toast`) and `PASS rotation` (12 cases). Plan criteria 1-7 still pass.
- Mutation: I reverted css/app.css:188 to `max-width: min(92vw, 520px);` → `FAIL ui-rotation` with `AssertionError: 844x390 rotation 90 long toast: toast inside viewport {"left":88,"top":-16,"right":175.25,"bottom":406}`. That box matches my r1 evidence exactly. I then restored the file from 72d3aa7 and confirmed `0.92` was back.
- Ad-hoc probe spec (my own, in the temp copy only): a long toast at 844x390, 390x844, 640x360, 360x640, 1920x1080 and 1080x1920, each at rotations 0/90/180/270 with rotateUi on. Result: 24 of 24 boxes inside the viewport (`bad 0`). At rotation 0/180, the computed max-width equals the old `92vw` result: 520px wherever 92% of the width is over 520, and 358.8px / 331.2px at the 390 / 360-wide portraits, which is 0.92 x innerWidth. At 90/270 it tracks the viewer's width, for example 844x390 r90 gives 358.8px.
- Fallback: `:root` declares `--vw: 100vw` (css/app.css:14), so if JS never sets it the rule reduces to the old `min(92vw, 520px)`. With the inline `--vw` removed at runtime, the computed max-width was `520px` (844 x 0.92 = 776, so the 520 cap applies), as expected.

## Earlier findings

- r1 Minor 1 (the toast's max-width used the physical `92vw`): **resolved**. css/app.css:188 is now `min(calc(var(--vw) * 0.92), 520px)`, which is the same pattern the sheet uses at :208. The new test catches the regression: the mutation above makes it fail with the r1 box.

## Strengths
- The fix is one line and copies an idiom already in the file. Rotation 0/180 behaviour is unchanged, because `--vw` equals `innerWidth` there (js/display.js:79).
- The new cases go through the real `seedFor`/`settled` path and use the shared `inside` tolerance, so they are consistent with criterion 2's checks.

## Issues

### Critical
None.

### Important
None.

### Minor
None.

## Declined to judge
- The new cases set the toast's text through the DOM instead of raising a real toast. That is enough to test layout. Toast-raising itself is covered by the existing pin-button path in `measure()`, so I am not ruling on it.
- The r1 declined items (native select popups, safe-area insets in the rotated frame, the r180 toast overlapping the year text, `#status-dot`) are outside this delta and were ruled on in r1.

## Recommendations
- None blocking. If short-landscape coverage grows later, the 844x390 viewport could join `VIEWPORTS` so that every element is checked there, not only the toast.

## Assessment
The delta fixes r1 Minor 1 as specified. The added test has teeth: it fails on the old CSS with the exact r1 box. My probe of 0/180, the portrait sizes, the short sizes and the `--vw` fallback found no regressions.

**Verdict:** APPROVE
