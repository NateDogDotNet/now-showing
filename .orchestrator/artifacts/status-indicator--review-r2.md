produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: status-indicator · round: r2 · mode: anchored
**Verdict:** APPROVE

Reviewer: status-indicator-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T17:52:20Z · Method: anchored phase review (tag ui) · Scope: status-indicator, r2, base 51d8ff3, tree ac21449

## Read and ran
- Read: plan `### 7. status-indicator` (docs/integration-plan.md:200-215), spec R-STAT-1 / R-ROT-2 (docs/spec.md:50-62), decisions D2, D6, D28, phase record `.orchestrator/phases/status-indicator.md`, `git diff --cached` in /home/user/wt-status-indicator (css/app.css, index.html, js/main.js, tests/e2e/status.spec.mjs). Context: js/main.js:352-375 (evaluateSleep), js/display.js:92-98 (`--ui-rotation`, `--vw`), css/app.css:195-271.
- Scratch: `mktemp -d` -> /tmp/tmp.XE81AfCtTb; `git worktree add --detach … 51d8ff3` then `git read-tree -u --reset ac21449` (write-tree = ac21449, confirmed). Removed afterwards. The live worktree is unchanged (write-tree still ac21449, same 4 staged paths).
- Full e2e: `E2E_PORT=21610 E2E_MOCK_PORT=21611 node tests/e2e/run.mjs` exited 0. Every spec passed: cache-first, content-rating (22 cases), display-decode, metadata, now-playing, rotation, sleep, smoke, status (7 cases), ui-rotation. `npm test` reported fail 0.
- Mutations (ports 21620-21641, each reverted with `git checkout`): see Minor 1 and 2.
- Probe (scratch spec, deleted): asleep + mock down + idle. The dot's computed `visibility` is `hidden` with the real CSS and `visible` with the `body.asleep .status-dot` rule removed. So the code hides the dot while asleep.
- Screenshots (scratch spec, ports 21650/21651) were written to `.orchestrator/artifacts/status-indicator--shot-{1920x1080,1080x1920}-{dot,pill,rot90,rot90-pill}.png`. Geometry was logged for every corner.

## Criteria and hazards
- AC1 `npm run test:e2e -- status`: PASS, 7/7. Each sub-claim is in the spec file: pill hidden and dot visible while idle; dot 6x6, opacity 0.35; wake shows "retrying in"; healthy idle shows neither; 0 MutationObserver records over 3 s; fake clock +5 min, 4 distinct corners, all inside the viewport; `off` hides the dot; rotation 90 gives angle 90.
- AC2 `pixelShift: false` is in seed(). AC3 `npm test` passes. AC4 `id="status-dot"` is at index.html:55. AC5 is exit 0 per the r2 evidence; precache is unaffected because no new files are served.
- No second idle timer: visibility uses only `body.idle`, set and cleared in `wake()` (main.js:666-678). CSS `body.idle .status-pill` and `body:not(.idle) .status-dot`.
- The 1 s re-render stops while hidden: `updateStatus` returns before touching `#status` when idle (main.js:446). It catches up on wake through `if (wasIdle) updateStatus()` and hands off on idle through `updateStatus()` in the idle timeout. `pill.textContent` is written only when the text changes.
- Dot: 6 px, opacity 0.35, `--muted` colour. Shown only when `statusText()` is non-empty and `statusIndicator === 'dot'`. Own `setInterval` at 5 min, stepping `data-corner` by one with no transition, independent of pixel shift. The start corner is clock-derived, so a daily reload does not pin it. Every rect measured 12 px inside the edges at both sizes and both rotations. It follows `--ui-rotation`: at rotation 90 the matrix is (0,1,-1,0) and all four corners stay inside the viewport. Never still for hours: it steps every 5 min. Hidden while asleep: css/app.css:244, confirmed by the probe.

## Strengths
- Small change that reuses the existing state. The pill/dot handoff is explicit at both edges of the idle transition.
- The corner test walks all four corners on a fake clock and checks the viewport bounds each time.
- The clock-seeded start corner adds burn-in protection across reloads.

## Issues

### Critical
None.

### Important
None.

### Minor
1. **The "asleep hides the dot" case has no teeth.** Class: code-bug (a test that does not check what its name says). Location: tests/e2e/status.spec.mjs, case `asleep hides the dot`. Evidence: the case boots healthy, and a healthy app already hides the dot (`dot.hidden = true`). With `body.asleep .status-dot` removed from css/app.css:244, `run.mjs status` still printed `ok  asleep: no dot` / `PASS status`. My asleep + mock-down probe showed the rule does matter: `visible` without it, `hidden` with it. Why it matters: D28 behaviour has no real regression guard. Fix: in that case call `mock.down()` after `asleep`, wait for `body.idle` and `!#status-dot.hidden`, then assert the dot is not visible. This needs `serveArgs: []`, which `statusCase` already sets.
2. **The wake catch-up is not tested.** Class: code-bug (test strength only; the behaviour is correct). Evidence: with `if (wasIdle) updateStatus();` deleted from `wake()`, all 7 status cases still pass, because the test waits 600 ms and the 1 s interval refreshes the pill anyway. Without the line, a woken pill can show stale text, or appear late, for up to 1 s. Fix (optional): assert the pill text right after the `controls.visible` wait, with no 600 ms sleep.
3. **The 1 s interval still fires while hidden.** Class: spec-gap. R-STAT-1 says the `setInterval(updateStatus)` "runs only while the pill is visible". The interval keeps ticking and computes `statusText()` to drive `dot.hidden`, but it returns before touching `#status`. That meets the measurable criterion (0 mutations) and the plan hazard (no re-render). A cheap per-second check of state is the simplest way to show or hide the dot when going offline while idle. The spec wording is stricter than its own criterion. If the literal reading is wanted, the fix is to start and stop the interval in `wake()` and the idle timeout, and to update the dot from the offline/pause transitions. I don't think that is worth doing.

## UI review
- (a) Dot, controls hidden. At 1920x1080 it sits at (1902,1062); at 1080x1920 at (1062,1902). 6x6 grey at 0.35: barely visible against black, but findable in a corner. It is outside the frame art in both orientations: the frame spans x 616-1304 landscape and y ~118-1800 portrait.
- (b) Pill, controls woken. It sits top-left at 12/12 and reads "Can't reach Plex · showing cached posters · retrying in 12s" in the accent colour on the dark panel. Legible. The controls are bottom-right and do not overlap it. The dot is hidden while the controls show. Corner 2 shares the controls' area, but the two are never visible together.
- (c) Rotation 90 with rotateUi on. The pill reads upright at the viewer's top-left (physical top-right); the controls are at the viewer's bottom-right. The dot matrix is rotated 90 and all four corners stay inside the viewport, 12 px from the edges.

UI screenshots: PASS

## Declined to judge
- Safe-area insets under rotation: `env(safe-area-inset-left)` is applied in the viewer's frame, not the physical frame. The pill from the shell phase does the same. This is outside the diff's new behaviour and has no effect on a Pi (insets are 0).
- Whether 6 px at 0.35 is too faint across a room is a product question. It meets the R-STAT-1 limits.

## Recommendations
Fix Minor 1 the next time this spec file is touched. A second builder round is not needed for it.

## Assessment
All five acceptance criteria pass and every plan hazard holds in the code. The full e2e suite is green, the conductor's mutants stand, and the screenshots meet the UI checks. The remaining items concern test strength and spec wording.

**Verdict:** APPROVE
