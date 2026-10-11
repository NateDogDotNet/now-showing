produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: pixel-shift · round: r1 · mode: anchored
**Verdict:** APPROVE

Reviewer: pixel-shift-review-anchored-r1 · Model: claude-opus-5-5 · Dispatched: 2026-10-10T19:17:22Z · Method: anchored code+UI review · Scope: pixel-shift, r1, base 80d1759, tree 60dfc79 (staged index of /home/user/wt-pixel-shift)

## Read and ran
- Read: plan `### 10. pixel-shift` (docs/integration-plan.md:260-279), spec R-PROT-2 / R-ROT-2, decisions D2 / D6 / D30, phase record `.orchestrator/phases/pixel-shift.md`, `git diff --cached` (6 files), plus js/settings-ui.js (read/preview/submit), js/main.js:491-545 (applySettings), css/app.css:403-405 (reduced-motion block).
- Scratch: `mktemp -d` -> /tmp/tmp.hF0sdg25ZY, populated by `git archive 60dfc79 | tar -x` (the live worktree was not touched; `git status` shows only the builder's staged changes). Removed afterwards.
- `npm test` -> fail 0. `node scripts/check-precache.mjs` -> "26 precached files OK". Criterion 5 one-liner -> exit 0.
- Full e2e, `E2E_PORT=22142 E2E_MOCK_PORT=22143 npm run test:e2e` -> exit 0, every spec PASS (cache-first, content-rating, display-decode, metadata, now-playing, pixel-shift, rotation, sleep, smoke, status, ui-rotation). pixel-shift: 9 distinct positions at 1920x1080 and 1080x1920 x rotation 0/90, reduced motion ok, off ok at both sizes.
- My own probe spec (scratch only, ports 22144/22145), results:
  - Glide: right after a 3-min step, 1 running CSS transition on `translate` (not an instant jump); between steps no animation runs (no drift).
  - Bounds: 1920x1080 step 4 `translate: -16px 16px` -> stage/frame 609,33-1279,1080; rotation 90 `16px 16px` -> 158,33-1795,1080 (offset in screen space). Rotation 180 and 270, 9 steps each at both sizes: stage and frame inside the viewport.
  - Timer re-sync: Save with minutes=1 -> one step per simulated minute (`-16px | -16px -16px | 0px -16px | 16px -16px`). Saving again with the value unchanged -> still exactly one step per minute (`0px | 16px | 16px 16px`): no double interval, no restart. Save with pixelShift unchecked -> `translate: none` and stays none after 5 min. Stage returns to full-bleed (615,0-1305,1080).
  - Fieldset binding: opening Settings fills `pixelShift` checked and `pixelShiftMinutes` 3 from settings. Save persisted `pixelShiftMinutes: 1` (bound by name, settings-ui.js unchanged).
- D30: `git diff --cached --numstat js/display.js` -> 35 added, 1 removed (the import line). DECODE_TIMEOUT_MS and the owner/revoke guards are untouched.

## Strengths
- `translate` is the individual property on `.stage`, composed before the existing `transform: translate(-50%,-50%) rotate()`, so the offset is in screen space at every rotation (probe at rotation 90 confirms). `transition: transform 0.5s ease, translate 1.5s ease-in-out` keeps the rotation transition. The existing `@media (prefers-reduced-motion: reduce) { .stage { transition: none } }` removes the glide.
- The margin is applied only when `pixelShift` is on (`margin: settings.pixelShift ? SHIFT_MARGIN : 0`), and the inline translate is removed when it is off. The pixel-shift room is floored from the real leftover space on the tighter screen axis, so the stage cannot leave the viewport.
- `syncShiftTimer()` runs on every `apply()` (Save, Cancel-revert, live preview from other fields, rotate key). It restarts only when the interval changes, so it neither leaks nor runs twice. `read()` sanitises, so a NaN or out-of-range minutes value cannot reach setInterval.
- The orbit includes the wrap (last [1,-1] to first [0,0]) and is never the same point twice in a row. The unit test asserts the wrap explicitly.
- Nothing touches body.asleep, the status dot, or the progress bar. The bar lives inside `.stage` and simply moves with it. The status, sleep and now-playing specs pass.

## Issues

### Critical
None.

### Important
None.

### Minor
1. **The Display protection fieldset has no live preview** (spec-gap). index.html:218 `<fieldset>` has no `data-live`. Only `Frame & layout` (index.html:165) has it, so ticking `pixelShift` or editing the minutes field does nothing until Save (settings-ui.js:190-196 previews only `[data-live]` targets). Side effect: `read()` collects every field, so an unsaved pixel-shift change does get applied when the user then moves a live layout field such as Rotation. Cancel reverts it correctly. The plan only requires binding by name, and that is met. Whether the margin toggle should preview live is unspecified. Fix if wanted: add `data-live` to the fieldset (the timer already re-syncs on preview apply).
2. **At extreme steps the frame sits flush against the screen edge** (spec-gap, cosmetic). The offset uses the full floored room, e.g. bottom = 1080 at 1920x1080 step 4 and right = 1080 at 1080x1920 rot 90. This is inside the criterion (inside the viewport, nothing clipped). Flagged only so the margin policy is a conscious choice: art can touch the bezel for one 3-minute step.

## Declined to judge
- Chromium >= 104 support on the Pi for the individual `translate` property: a hardware verify item, already routed to real-server-validation-extended.
- The pixel-shift timer keeps stepping while asleep or while the tab is hidden. That is harmless (one style write per N minutes) and sleep is a later phase's concern.
- Upgrade-toast copy for the ~3% smaller stage belongs to the recommended-protection-preset phase.

## Recommendations
- Optionally add `data-live` to the Display protection fieldset (Minor 1).

## Assessment
All 7 plan criteria hold (unit, npm test, pixel-shift e2e, full e2e, criterion-5 one-liner, grep wiring, precache). Every hazard was checked by running it: screen-space translate at all four rotations, a 1.5 s glide with no drift, reduced motion, off means full-bleed, timer re-sync without leak or double-run, D30 intact. The two minor findings are spec questions, not defects.

UI screenshots: PASS. Files: /home/user/plex-poster-app/.orchestrator/artifacts/pixel-shift--shot-{1920x1080,1080x1920}-{on-step1,on-step4,off,rot90-on,settings-fieldset}.png. The margin is a thin black band, unobtrusive. The frame art is never clipped (bounding boxes inside the viewport in every shot). The fieldset is legible at both sizes, with a heading, checkbox, minutes input and helper text.

**Verdict:** APPROVE
