produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: device-helper-integration · round: r4 · mode: anchored
**Verdict:** APPROVE

Reviewer: device-helper-integration-review-anchored-r4 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T04:42:50Z · Method: anchored delta code review (ui) · Scope: device-helper-integration, r4, base ea19610 (delta against r3 tree 13bf5d4), tree c74124e (staged index of /home/user/wt-device-helper-integration-r4)

## Read and ran

Read: the r3 review; `git diff 13bf5d4 c74124e -- js css tests index.html sw.js` (css/app.css:339, js/main.js:585-592, tests/e2e/helper.spec.mjs:359-436). The rest of the delta is Roadmap.md and docs/*, which come from the base moving to ea19610. I also read js/main.js:583-635 (`applySettings`), the Cancel path in js/settings-ui.js:250-254 (`onPreview(original)`), index.html checkbox markup, and tests/e2e/lib.mjs `withApp`.

Ran. Each scratch copy was made with `mktemp -d` + `git checkout-index -a --prefix=` from the r4 index, with node_modules symlinked. All were removed afterwards. The live worktree was not touched, and `git write-tree` still gives c74124e.
- Full e2e, `E2E_PORT=23500 E2E_MOCK_PORT=23501 npm run test:e2e`: **EXIT 0**. Every spec passed: brightness, cache-first, content-rating, display-decode, helper, kiosk, metadata, now-playing, pixel-shift, rotation, sleep, smoke, status, ui-rotation.
- JS mutant (`deviceHelper` removed again from both preview lines), helper spec on ports 23510-23515:
  - Case 10a fails at helper.spec.mjs:387: "condition not met within 10000 simulated ms", meaning no power on after Save.
  - With 10a disabled (`if (0)`), case 10b fails at helper.spec.mjs:415, meaning no probe after Save.
  - Cases 1-9 still pass.
- CSS mutant (`flex: none` removed): case 11 fails with `actual: 13, expected: 18`.
- Scratch `probe.spec.mjs` on the fixed tree (ports 23530/23531) and on the CSS mutant (ports 23532/23533). It covers Cancel, every checkbox's width at both sizes, and the screenshots.

## Confirmations

1. **DHI1: resolved.** Case 10a runs this sequence: asleep with the TV off, untick, move Frame brightness (an `input` event on a live control), Save. Helper calls are `[["display",false],["display",true]]`. They stay unchanged through a wake (`mock.play`) and a second sleep, with no further `/__helper/` request. The case passes on the fix and fails on the mutant.
2. **DHI2: resolved.** Case 10b runs: helper off, tick, move a live control. That makes no helper request (asserted). Save probes, and Diagnostics shows the "CPU temperature" row. It passes on the fix and fails on the mutant.
3. **DHM1: resolved.** Width, height and x of every Settings checkbox, with all `details` opened:
   - Fixed tree, both sizes: all 18x18 (limitNowPlaying is 0x0 because it sits in the collapsed household block, the same as in the mutant).
   - Mutant, both sizes: deviceHelper 13.08, wakeOnPlayback 17.84, all others 18.
   - So `flex: none` changes only those two boxes, and both are now correct. No x position moved, and no other checkbox changed (export-secrets stays 18 at x 1708.5 / 868.5).
   - In both screenshots the box sits top-aligned beside the two-line label, which reads well.
4. **Each new test fails without its fix:** confirmed for 10a, 10b and 11 (see Ran).
5. **The rest of the delta and Cancel: clean.** The code delta is only the three hunks listed. The comment at js/main.js:588 matches the change. Cancel calls `onPreview(original)`, which takes the preview branch, keeps the saved `deviceHelper` and returns before any helper logic. Measured:
   - C1: asleep with the TV off and the helper on; untick, move a live control, Cancel. 0 helper requests, calls stay `[["display",false]]`, the stored value is `true`, and the box is ticked on reopen. At the next wake the saved setting is still in force: `[["display",false],["display",true]]`, no errors.
   - C2: awake with the helper off; tick, move a live control, Cancel. 0 helper requests, stored `false`, box unticked on reopen, no CPU row in Diagnostics, no errors.

## Strengths

- The fix is one line that reuses the existing rule for keys a preview never changes (kiosk, PIN, rating limit). So Save is the only thing that toggles the helper, and Cancel has nothing to undo. One change closes both r3 Important findings.
- The tests use a real `input` event on a `data-live` control, which is the exact path r3 reproduced, and 10a also checks that no further helper call is made through a wake and a second sleep.

## Issues

### Critical
(none)

### Important
(none)

### Minor
(none new.) r3 Minor 2 and Minor 3 (spec-gap) are unchanged and were not part of this round's scope. Their status is accepted/open as the conductor ruled.

## Declined to judge

- Roadmap.md and docs/* changes in the diff come from the base moving to ea19610 (docs-only commits). They are outside this phase's code.
- The r3 "Declined to judge" items (server lock vs client retry, sw.js VERSION, the off-after-wake race, status-dot freshness) were not re-examined. They are outside the delta.

## Recommendations

None blocking.

UI screenshots: PASS. In the r4 Settings sheet the deviceHelper checkbox is the same size as the others and top-aligned with its two-line label, and the help text is legible at both sizes:
- /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--shot-1920x1080-settings-r4.png
- /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--shot-1080x1920-settings-r4.png

## Assessment

Both r3 Important findings and r3 Minor 1 are fixed and tested. Every new test fails on its mutant. Cancel restores the saved state with no helper call, and the full e2e suite is green.

**Verdict:** APPROVE
