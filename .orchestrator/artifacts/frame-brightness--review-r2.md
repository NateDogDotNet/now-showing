produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: frame-brightness · round: r2 · mode: anchored
**Verdict:** APPROVE

Reviewer: frame-brightness-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T19:57:26Z · Method: anchored phase review (ui) · Scope: frame-brightness, r2, base 1b31344, tree 305fa4a (staged index of /home/user/wt-frame-brightness)

## What I read and ran
- Read: plan `### 11. frame-brightness` (docs/integration-plan.md:281-299), spec R-FRM-4 / R-PROT-4 / R-PROT-6, decisions D6 / D8, K30 (state.md:66), phase record `.orchestrator/phases/frame-brightness.md`, `git diff --cached` (index.html, js/brightness.js, js/display.js, js/main.js, sw.js, both tests), js/main.js:330-390, 500-560, 715-791, js/settings-ui.js:58-67, 185-222, css/app.css:30-130.
- Ran in a scratch copy: `mktemp -d` -> /tmp/tmp.4WZCc4t2pG, filled with `git archive 305fa4a | tar -x` (the index was never touched), `npm ci`. Removed afterwards. Live worktree status and `git write-tree` (305fa4a) unchanged after the review.
  - `TZ=America/New_York node --test tests/brightness.test.js` -> 13/13 pass. `npm test` -> 248/248 pass.
  - `node scripts/check-precache.mjs` -> "27 precached files OK". Criterion 5 grep on css/app.css -> no match (exit 0).
  - Full e2e suite `E2E_PORT=22341 E2E_MOCK_PORT=22342 npm run test:e2e` -> exit 0, no FAIL lines. `PASS brightness`, 12 cases including the frame->stage->frame switch.
  - A probe script for `effectiveBrightness` edge cases (output below).
  - A mutation: I removed the visibilitychange `evaluateBrightness()` line and ran `npm run test:e2e -- brightness` on ports 22345/22346. The spec still passed. Reverted, and `cmp` shows the file matches the live worktree.
  - Screenshots via a scratch Playwright script against `serve.mjs --mock` on ports 22343/22344, with a fake clock and pixel shift on.

Probe output (TZ=America/New_York; level 60, 22:00-07:00):
```
21:59 1 | 22:00 1 | 22:01 0.96 | 22:05 0.8 | 22:09 0.64 | 22:10 0.6 | 23:00 0.6 | 00:00 0.6
06:49 0.6 | 06:50 0.6 | 06:51 0.64 | 06:59 0.96 | 07:00 1 | 22:00:59 1 (one step per whole minute)
start==end 1 | 22:00-22:08 @22:04 0.84 (short window peaks below level) | 1970 clock 1
manual 50 + night 0.5 (min) | bad hhmm 1 | level 5 -> 0.1 (clamped)
DST fall-back 01:30 first and second occurrence (01:00-03:00) 0.6 / 0.6
```

## Criteria and hazards
| Item | Result | Evidence |
|---|---|---|
| AC1 unit (ramps, midnight, short window, min, nightDim:false, implausible clock, DST NY) | pass | 13/13 under TZ=America/New_York; probe above |
| AC2 `npm test` | pass | 248/248 |
| AC3 e2e brightness | pass | PASS brightness: noon none, 23:00 0.6 on #frame only, fb 50 -> 0.5, layers/#poster-box/#stage none under frame, stage target, minute-by-minute ramp in and out with no change between ticks |
| AC4 precache | pass | sw.js adds js/brightness.js; check-precache OK |
| AC5 no transition or will-change on filter | pass | grep clean; display.js sets inline `filter` only |
| Filter on #frame or #stage only, the other cleared | pass | display.js `setBrightness`: `dim.style.filter = value; clear.style.filter = ''`. The r1 no-clear mutant is killed by the new e2e case (phase record) |
| Exactly one timer, minute-aligned | pass | main.js:384-390. `evaluateBrightness` is the only writer of `brightnessTimer` and always calls `clearTimeout` before `setTimeout(…, 60000 - now % 60000)`, so settings applies, visibilitychange and jumps cannot double it |
| Clock jump | pass | The check sits inside `syncSleepClock` (main.js:351), so every caller (evaluateSleep 1 s, the apply path, input handlers) re-evaluates on a step of more than 2 min. The e2e test "clock jump re-evaluates" passes |
| TDZ of `BRIGHTNESS_JUMP_MS` / `brightnessTimer` | pass | The only top-level statement before main.js:380 is `setInterval(evaluateSleep, 1000)` (line 376). Its first callback runs after module evaluation finishes. There is no top-level await, and `boot()` is at line 791. The full suite boots cleanly |
| Re-evaluate on preview, Save, Cancel | pass | `applySettings` calls `evaluateBrightness()` (main.js:517). Cancel goes through `dialog close -> onPreview(original)` (settings-ui.js:218-221). Covered by the e2e "live preview and Save" case (Cancel returns to none) |
| Sleep, pixel shift, now-playing bar | pass | The veil (index.html:287) is outside #stage and is unaffected; e2e "asleep: the veil is intact". `filter` on #stage composes with `translate`/`transform`. No `position: fixed` descendants inside #stage (css 43-128), so the containing block that `filter` creates moves nothing. The progress bar, title card and player label sit inside #poster-box and are dimmed with the whole picture under target `stage`, as D6 intends |
| Accepted deviations | honoured | css/app.css unchanged; nested `<div data-live>` (K30 stays with settings-sheet); jump detection reuses syncSleepClock |

## Strengths
- `nightLevel` counts wall-clock minutes of the local day, which makes it minute-stepped, safe across midnight and safe on DST in a single expression. Windows shorter than 20 minutes peak below the level without a special case.
- The timer is minimal and cannot leak: `clearTimeout` runs before every re-arm.
- The r2 test closes the double-dim hole, and the full suite is green.

## Issues

### Critical
None.

### Important
None.

### Minor
1. **The visibilitychange re-evaluation is untested.** Location: main.js:723. I deleted the line and `npm run test:e2e -- brightness` still passed (mutant survived; reverted). The code is correct as read, and timers still re-arm on wake. A regression here would only show as up to one stale minute after a tab is restored. Class: **spec-gap**. AC3 does not list visibilitychange, although the hazard notes do. Fix: add one e2e case that hides the page, moves the clock to 23:00 and fires `visibilitychange`, then asserts brightness(0.6) before the next minute tick.
2. **The Frame brightness slider shows no current value, and its hint wraps.** Location: index.html (the new `frameBrightness` range). The 1920x1080 and 1080x1920 settings shots show "10-100" with "%" wrapped onto a second line, and no readout. The layout sliders in the same sheet show a live `<output data-for>` value ("100%"). A user cannot see the level they set. Class: **spec-gap** (no criterion covers it). Fix: add `<output data-for="frameBrightness">`. Note that `syncDependent` (settings-ui.js:65) formats every output except `posterScale` with a sign, so give frameBrightness the unsigned format too. Then drop the "10-100 %" hint.
3. **The ramp in is skipped when nightDimStart falls in a spring-forward gap.** Location: js/brightness.js `nightLevel`. Take a start of 02:00-02:59 on a spring-forward night. Local time goes from 01:59 to 03:00, `sinceStart` jumps from 0 to 60 or more, and the level drops from 1 to full dim in one step. The probe gives 0.6 at 03:05 for a 02:00-04:00 window. The default of 22:00 and any start outside 02:00-02:59 are unaffected. Class: **spec-gap**. R-FRM-4 says "never a jump", but the AC1 DST case does not cover a start inside the gap. Fix, if wanted: ramp on elapsed real minutes since the window was entered. Otherwise accept it as an edge case.

## UI
UI screenshots: PASS
- `frame-brightness--shot-{1920x1080,1080x1920}-day.png`: no filter anywhere (computed `none` on #frame, #stage, #poster-box and the layers).
- `...-night-frame.png`: the marquee and bulbs are visibly dimmed and the poster is not. Computed: frame=brightness(0.6), stage/poster-box/layers=none. The dim reads as intended: the frame recedes and the poster keeps full contrast.
- `...-night-stage.png`: the whole picture is dimmed, title text included. stage=brightness(0.6), frame=none (no double dim).
- `...-settings.png`: the new controls sit under Display protection after the pixel-shift help text. They follow the same From/Until pattern as the Sleep fieldset and are legible at both sizes, with one help paragraph. Grouping is sensible. The only gap is Minor 2.
All are in /home/user/plex-poster-app/.orchestrator/artifacts/.

## Declined to judge
- `backdrop-filter: blur(8px)` at css/app.css:296: R-PROT-4 removes it in `pi-stability`. It is outside this diff.
- Whether the Display protection fieldset should be fully live (K30): ruled earlier and owned by settings-sheet. This phase's nested `data-live` is an accepted deviation.
- The label wording "Dim: The frame only / The whole picture": a product copy question.
- A clock step of less than 2 min leaves the level up to one tick stale before the minute timer catches up. This is by design (the threshold) and harmless.

## Recommendations
Fold Minors 1-2 into a later polish pass or into `settings-sheet`. Minor 3 is for the owner to accept or schedule.

## Assessment
All five criteria pass on my own runs, and every listed hazard checks out in the code or in a run: target isolation, no transition, a single minute-aligned timer, the ramp math, min(), re-evaluation triggers, TDZ ordering, and the interaction with sleep, pixel shift and now-playing. The full e2e suite is green. The remaining items are test and UX gaps, not defects against the criteria.

**Verdict:** APPROVE
