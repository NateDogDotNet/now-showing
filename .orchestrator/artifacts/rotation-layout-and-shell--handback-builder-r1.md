produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: rotation-layout-and-shell · round: r1
status: complete        failure_class: n/a
paths: css/app.css, js/display.js, tests/e2e/rotation.spec.mjs, tests/e2e/ui-rotation.spec.mjs (all in /home/user/wt-rotation-layout-and-shell, staged, not committed; index.html unchanged because nothing needed editing)
criteria:
1. met: `E2E_PORT=18610 E2E_MOCK_PORT=18611 npm run test:e2e -- rotation` -> PASS rotation (12 viewport x rotation cases)
2. met: `... npm run test:e2e -- ui-rotation` -> PASS ui-rotation (rotateUi on 90/180/270, off 90/180/270, rotation 0 on == off, at 1920x1080 and 1080x1920)
3. met: `grep -Eq 'pixelShift: *false' tests/e2e/rotation.spec.mjs tests/e2e/ui-rotation.spec.mjs` exit 0
4. met: `npm test` -> 67 pass, 0 fail
5. met: `node scripts/check-precache.mjs` -> "24 precached files OK"
6. met: grep of `--ui-rotation` in css/app.css and js/display.js exit 0
7. met: scope probe on js/settings.js js/engine.js js/plex.js js/main.js sw.js scripts exit 0
8. narrated: red proof pasted below; screenshots generated with E2E_SHOTS (rotation-90 settings viewed: upright when turned, docked to the viewer's right edge, nothing clipped). I ran the spec against the original CSS in this same worktree before the fix rather than a throwaway worktree of 3a7b688.
deviations: none beyond: the red run was against the unmodified CSS in this worktree (base 33976fe), not a 3a7b688 worktree. `.controls`/`.status-pill` gained `width: max-content` (needed because left:50% would otherwise shrink-to-fit at half the viewport). `.app` gained `overflow:hidden`. The status pill is also rotated (D2 names status) and docks to the viewer's top-left. The ui-rotation spec unhides `#empty` directly and fixes the toast text (the pin toast names a random poster); the toast is raised by clicking the real pin button.
questions: none

Agent: rotation-layout-and-shell-builder-r1 · dispatched: 2026-10-08T23:05:45Z

## Red run (original CSS, criterion 1 at 1920x1080 / rotation 90)
```
  ok  1920x1080 rotation 0
AssertionError [ERR_ASSERTION]: inside viewport: 1920x1080 rotation 90 #stage {"left":116,"top":304,"right":1804,"bottom":1384,"width":1688,"height":1080}
FAIL rotation
AssertionError [ERR_ASSERTION]: 1920x1080 rotation 90 rotateUi on: controls angle
0 !== 90
FAIL ui-rotation
```
(stage bottom 1384 > viewport 1080: F1 reproduced.)

## Green run
```
PASS rotation
PASS ui-rotation
```
(Both with 12 and 13 `ok` lines respectively.) `npm test`: tests 67, pass 67, fail 0. check-precache: `24 precached files OK`.

## Design
- `.stage`: absolute, left/top 50%, `translate(-50%,-50%) rotate(var(--rotation))`, transition kept; reduced-motion override extended to `.empty-card` and `.status-pill`.
- `display.layout()` sets `--ui-rotation` (0 when `rotateUi` false) and `--vw`/`--vh` (screen size in the viewer's frame; swapped at 90/270) on `<html>`.
- Controls, toast, status pill, `.empty-card` and both `.sheet` dialogs rotate with `--ui-rotation`; each is anchored at the viewport centre with `transform-origin: 0 0` and moved to its viewer-frame corner/edge inside the rotated frame. Dialogs lay out as `min(440px,--vw) x --vh` and dock to the viewer's right edge; the backdrop stays full-screen. No `translate` property is used.
