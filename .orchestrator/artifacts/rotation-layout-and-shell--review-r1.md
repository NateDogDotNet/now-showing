Reviewer: rotation-layout-and-shell-review-anchored-r1 · Model: opus · Dispatched: 2026-10-08T23:29:21Z · Method: anchored code review + /ux-simulate (real capture) · Scope: rotation-layout-and-shell, round r1, base 33976fe, staged tree 105f766

## What I read and ran

Read: the staged diff (`git -C /home/user/wt-rotation-layout-and-shell diff --cached`: css/app.css, js/display.js, tests/e2e/rotation.spec.mjs, tests/e2e/ui-rotation.spec.mjs); docs/integration-plan.md section 5 (criteria 1-8, Notes); docs/spec.md R-ROT-1, R-ROT-2 and the settings table row for `rotateUi`; docs/decisions.md D2; tests/e2e/lib.mjs, tests/e2e/run.mjs; js/main.js (boot, applySettings, resize listener); js/display.js `layout()`/`apply()`; index.html (controls, dialogs, selects).

Where I ran it: everything ran in throwaway worktrees under `mktemp -d` = `/tmp/claude-0/-home-user/754644a7-1380-52e8-802b-a7514b405070/scratchpad/rv-mgAg/`:
- `tree/` = `git worktree add --detach 33976fe` + `git apply --index` of the staged diff. `git write-tree` there = `105f7662e9b8...`, the reviewed tree.
- `old/` = `3a7b688` with `tests/e2e/` copied in from `tree/` (criterion 8).
- `base/` = `33976fe` (rotation-0 regression comparison).
Ports: E2E_PORT 28731/28741/28761 with mock +1, plus dedicated `serveArgs: []` servers for my own scripts. I removed all three worktrees afterwards. `git worktree list` no longer shows them. The reviewed worktree still has the same staged set and tree `105f766`.

### Criteria results (run in `tree/`)

| # | Command | Result |
|---|---|---|
| 1 | `npm run test:e2e -- rotation` | PASS. 12 cases: 1920x1080, 1080x1920 and 1280x800, each at 0/90/180/270 |
| 2 | `E2E_SHOTS=… npm run test:e2e -- ui-rotation` | PASS. 14 cases, 48 PNGs written |
| 3 | `grep -Eq 'pixelShift: *false' …` | ok |
| 4 | `npm test` | 67 pass, 0 fail |
| 5 | `node scripts/check-precache.mjs` | "24 precached files OK", exit 0 |
| 6 | `grep -q -- '--ui-rotation'` in css and js | ok |
| 7 | `git status --porcelain -- js/settings.js js/engine.js js/plex.js js/main.js sw.js scripts` (live worktree) | empty |
| 8a | `old/` (CSS at 3a7b688) `node tests/e2e/run.mjs rotation` | **FAIL as intended:** `inside viewport: 1920x1080 rotation 90 #stage {"left":116,"top":304,"right":1804,"bottom":1384,…}`. The stage lands 304 px low, which is the F1 bug. |
| 8b | screenshots | see "Criterion 8 screenshots" below |

### Mutation testing (in `tree/`; after each run I reverted with `git checkout -- css js` and `git diff --quiet` confirmed the revert)

| Mutation | Spec | Result |
|---|---|---|
| M1: dock the sheet to the viewer's left (`translate(calc(var(--vw)/-2), …)`) | ui-rotation | FAIL: `settings docked to the viewer's right edge {"gapRight":640…}` |
| M2: no `--vw`/`--vh` swap at 90/270 in display.js | ui-rotation | FAIL (TimeoutError: the controls end up off-screen, so the pin click never lands) |
| M3: ignore `rotateUi` (`uiRotation = settings.rotation`) | ui-rotation | FAIL: `rotation 90 rotateUi off: controls not rotated` |
| M4: drop `rotate()` from `.toast` | ui-rotation | FAIL: `toast angle` |
| M6: controls at the viewer's bottom-left | ui-rotation | FAIL: `controls at the viewer's bottom-right {"gapRight":694…}` |
| M8: drop `translate(-50%,-50%)` from `.stage` | rotation | FAIL: `inside viewport: 1920x1080 rotation 0 #stage {"left":960,…}` |

All six mutations were caught. The tests have teeth.

### Extra probes (my own Playwright scripts, run against `tree/` and `base/` through their `tests/e2e/lib.mjs` `withApp`)
- **Rotation-0 regression against the pre-change base** (the spec's "Rotation 0 layout is unchanged"; the phase's own test only compares rotateUi on with off): I measured `#stage`, `#controls`, `#toast`, `.empty-card`, `.status-pill`, `#settings` and `#diagnostics` at 1920x1080, 1080x1920 and 800x600 in both trees. The output JSON is **byte-identical** between `base/` and `tree/` (for example, the controls at 1920x1080 are `1534,1006,374,62` in both).
- **Reduced motion** (`page.emulateMedia({reducedMotion:'reduce'})`): transition-duration is `0s` for `.stage`, `.controls`, `.empty-card` and `.status-pill`. Without the emulation it is `0.5s` for `.stage`, `0.25s, 0.25s` for `.controls` and `0.5s` for `.empty-card` and `.status-pill`. The transition is kept and reduced motion removes it.
- **No individual `translate` property:** `grep -n "translate:" css/app.css` returns nothing. Every translate is a function inside `transform`.
- **Resize:** js/main.js:390-392 re-runs `display.layout()` on `resize`, so `--vw`/`--vh` follow a window resize. `apply()` calls `layout` in `finally`, so the variables are set even when the frame fails to load (js/display.js:103-107).

## Criterion 8 screenshots

The PNGs I opened with Read. Copies are in `/home/user/plex-poster-app/.orchestrator/artifacts/rotation-layout-and-shell--shot-*.png`:
- `1920x1080-r90-settings`: the sheet runs along the screen's bottom edge, which is the viewer's right edge once the TV is turned. With the image turned 90° the title "Settings", the section headings (Plex connection, What to show, Timing, Frame & layout, Device) and all labels read upright. Save and Cancel sit at the viewer's bottom-right. Nothing is clipped. The Device section continues below the sticky footer, and I scrolled it fully into view (see UX). The backdrop dims the whole screen.
- `1920x1080-r90-controls`: the pill sits at the screen's bottom-left, which is the viewer's bottom-right. Its seven icons are upright for the viewer and nothing is clipped.
- `1920x1080-r90-diagnostics`: docked like Settings. The key/value rows and "Recent events" read upright. Copy and Close are visible and nothing is clipped.
- `1920x1080-r180-settings`: everything is upside down on screen and upright for an inverted panel. The sheet is at the screen's left, which is the viewer's right.
- `1920x1080-r270-settings` and `-r270-controls`: mirror images of the 90 shots. The sheet is at the screen top and the controls at the screen top-right, which is the viewer's bottom-right. Upright, nothing clipped.
- `1080x1920-r90-settings` and `-r90-controls`; `1080x1920-r180-controls`; `1080x1920-r270-settings`: the portrait viewport works the same way. The sheet is 440 px deep and spans the full 1080 px, and the controls sit at the viewer's bottom-right.

Criterion 8 screenshots: PASS

## UX simulation (real capture, 1920x1080, rotation 90, TV turned sideways)

1. **Press S:** Settings opens docked to the viewer's right with full viewer height. The first field is reachable.
2. **Change a value:** I clicked "Random pool" (`randomPoolSize`) and filled in 120. The focus ring and the number spinner are upright (shot `ux-1920x1080-r90-settings-scrolled`).
3. **Scroll:** `mouse.wheel(0, 2000)` over the sheet scrolls `.sheet-body` along the viewer's vertical axis (`sheet-body:155`, its maximum). Device, Export, Import, Clear poster cache and Reset everything all come into view.
4. **Save:** the Save button sits at screen `{x:12,y:994,w:40,h:66}`, 12 px from the physical edges, which is fine for a 44 px-class target. Clicking it closes the sheet and raises the toast "Settings saved.", which reads upright 88 px above the viewer's bottom (shot `ux-1920x1080-r90-empty-toast`).
5. **Press D:** Diagnostics opens docked the same way. Escape closes it.
6. **Empty state:** the card is centred and upright, and its "Open settings" button is readable.

Nothing felt awkward at 1920x1080. On a short landscape viewport, though, the toast clips (Minor 1).

## Strengths
- The F1 fix is exactly the prescribed one (`position:absolute; left/top:50%; transform: translate(-50%,-50%) rotate(...)`) and leaves the `translate` property free for `pixel-shift`.
- One positioning model is used everywhere: anchor at the viewport centre, `transform-origin: 0 0`, `rotate(--ui-rotation)`, then translate to the edge of the viewer's frame. The plan suggested a per-angle `transform-origin`; centring about the viewport centre gives the same docking with less code and is correct at all four angles.
- Rotation 0 is pixel-identical to the base for every shell element, and `rotateUi:false` gives angle 0 everywhere.
- The tests are strong. All six plausible wrong implementations fail them, and `viewerRect()` really checks placement in the viewer's frame rather than only the angle.
- `js/main.js` is untouched. The `rotateUi` read lives in `display.layout()`, as the Notes ask.

## Issues

### Critical
None.

### Important
None.

### Minor

1. **The toast's max-width uses the physical `92vw` instead of the viewer's width, so on a short landscape screen at 90/270 a long toast overflows and clips.**
   - Location: css/app.css:188 (`max-width: min(92vw, 520px);`), which the diff left unchanged next to the new rotated transform at :187.
   - Evidence: at a 844x390 viewport, rotation 90, with a 110-character toast, the toast's `getBoundingClientRect()` is `{"left":88,"top":-16,"right":175.25,"bottom":406}`. That is 16 px off-screen at both ends. Shot: `rotation-layout-and-shell--shot-ux-844x390-r90-toast.png`; the first line is cut at the top edge.
   - Why it matters: R-ROT-2 requires each element's box to lie inside the viewport. Criterion 2 only tests 1920x1080 and 1080x1920, where `min(…, 520px)` hides the bug. Phones or small panels held sideways hit it. The sheet already does this correctly with `min(440px, var(--vw))`.
   - Class: code-bug (fails R-ROT-2's "inside the viewport" outside the criterion's two test viewports).
   - Fix: `max-width: min(calc(var(--vw) * 0.92), 520px);`. Optionally add a short-landscape viewport (for example 844x390) to `ui-rotation.spec.mjs`. The same reasoning applies to `.empty-card { max-width: 420px }` only on viewers narrower than about 440 px, which is not a realistic case.

## Declined to judge
- **Native `<select>` popups and `title` tooltips** (Library, Frame, Poster fit and Rotation selects; control-button tooltips): Chromium draws these in the OS/browser layer and I expect them to appear unrotated on a rotated UI. Headless screenshots do not capture native popups, so I could not verify this. It falls outside the criterion's element list. I suggest it as a V1 hardware-check item rather than a finding.
- **Safe-area insets in the rotated frame:** the controls use `env(safe-area-inset-right/bottom)` for the viewer's right and bottom edges, which at 90° are physically different edges. The target hardware (TV/Pi) reports zero insets, and the spec is silent, so I am not ruling on it.
- **The toast at rotation 180 overlaps the poster's year text** (`1920x1080-r180-settings`): this is the pre-existing 88 px-from-bottom placement carried into the viewer's frame, so it is a product layout choice and not this phase's change.
- **`#status-dot`:** R-ROT-2 defers it to `status-indicator`, so it is not checked here. `.status-pill` does carry the rotation, and its rotation-0 box is unchanged from the base.

## Recommendations
- Apply the one-line toast `max-width` fix (Minor 1). It can ride along in this phase or in `touch-and-labels`.
- Add a V1 checklist line: "open a `<select>` in Settings at rotation 90 and confirm the dropdown is usable."

## Assessment
Every acceptance criterion (1-8) passes when re-run. The F1 regression test fails against the 3a7b688 CSS as required. The UI shell reads upright and stays unclipped at 90/180/270 on both required viewports. Rotation 0 is pixel-identical to the base, the reduced-motion and `translate` constraints are honoured, and the tests catch every mutation I tried. The only defect is a Minor toast-width clip outside the tested viewports. It does not block approval.

**Verdict:** APPROVE
