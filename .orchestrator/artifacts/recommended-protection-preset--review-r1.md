produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: recommended-protection-preset · round: r1 · mode: anchored
**Verdict:** APPROVE

Reviewer: recommended-protection-preset-review-anchored-r1 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T20:09:11Z · Method: anchored code review (ui, milestone close M2) · Scope: recommended-protection-preset, r1, base e3c81a6, tree 579bda2 (staged index of /home/user/wt-recommended-protection-preset)

## What I read and ran
- Read: `git diff --cached` (6 files); plan §18 (with K59 Output amendment); spec R-PROT-5, R-UPG-1, R-CTRL-1; decisions D4, D5, D6, Q20, D40–D44; phase record (K60, routed items); `.orchestrator/state.md`; `tests/e2e/lib.mjs`, `run.mjs`, the `sleep`/`kiosk`/`pixel-shift` spec helpers; `js/main.js:855-868` (`requestSettings`).
- Scratch: `mktemp -d` under the session scratchpad, filled with `git checkout-index -a --prefix=…` from the worktree index. That export is read-only on the index. Afterwards `git write-tree` still gives 579bda2, `git status` is unchanged, and the scratch dirs were removed.
- `npm test` gave 327/327 pass.
- `npm run test:e2e -- preset` (E2E_PORT 25100/25101) gave 10/10 ok.
- FULL `npm run test:e2e` (25110/25111) passed all 19 specs, exit 0, ~16 min. `node scripts/check-precache.mjs` gave "31 precached files OK", exit 0.
- `test -z "$(git status --porcelain -- js/settings.js sw.js)"` passes (criterion 3).
- Reviewer-only script (`review.spec.mjs` in a second scratch copy, 25120/25121, never in the reviewed tree). It covered the combined scenario and the screenshots.

## Criteria 1–5
1. **Preset list / Cancel / Apply / Save.** Met.
   - `PROTECTION_PRESET` (`js/settings-ui.js` +16-25) holds exactly the 8 keys and values of R-PROT-5. Only `nightDimTarget` has `locked`, which renders as a disabled box (`box.disabled = Boolean(row.locked)`).
   - `applyPreset` writes only ticked listed rows, into form fields, and dispatches `change` so the preview follows. It never calls save. `closePreset` only hides the panel and clears it.
   - The spec asserts each of these: exact row keys, only nightDimTarget disabled, Cancel leaves the form and the stored values unchanged, Apply does not persist, Save persists all 8, an unticked row keeps its value, and `idleSleepHours` 0, `maxContentRating` ('R' and ''), `limitNowPlaying` and the connection are unchanged.
   - The code cannot touch any other key: `field(row.key)` is only reached for preset rows.
2. **Upgrade toast.** Met.
   - `announceWhatsNew()` (main.js, after `wake()` in boot) returns at once if the marker is present. Otherwise it writes the marker, then toasts only when `isConfigured`. This matches K60 (an unconfigured install writes the marker and never sees the toast).
   - The action is `requestSettings({section:'protection'})`. That goes through `requestPin()` (main.js:856), and `open()` scrolls `#protection-fieldset` into view.
   - Tests cover: shown once, not after a reload, Open settings lands at the fieldset, the PIN dialog is opened first when a PIN is set, no toast when unconfigured, and no toast when the marker is present.
3. **js/settings.js and sw.js untouched.** Met (command above).
4. **Full suites + precache.** Met on this tree (above). The merged-tree run remains the conductor's Step 8 seam check.
5. **Protection specs together.** Met. sleep, pixel-shift, kiosk, brightness, helper, content-rating and pi-stability all passed inside the full run.
- **Kiosk PIN gate for the button.** The button lives inside the Settings sheet. Every route to the sheet goes through `requestSettings` → `requestPin`, which `kiosk` tests (passing) already cover. The new toast route is tested separately.
- **K59 smoke change.** `pauseAt('…03:59:40')` is followed by two `Date.now()` reads that must be equal (`assert.equal(p1, p0)`), then `runFor(60000)` and the unchanged strict window `>= 60000 && < 62000`. The assertion is not loosened. There is no retry or loop construct, so it cannot loop. smoke passed in the full run.
- **Control labels wording.** Now 'Auto', 'Always', 'Never (icons only)'. The select's scrollWidth is 367 and clientWidth 367 at both sizes, so nothing clips.

## Strengths
- The preset is data-driven, sits in settings-ui.js (per plan note), and touches only listed keys. Unticking is honoured per row, and the locked row matches Q20.
- The marker is written before the configured check, so a crash or an early reload cannot repeat the toast. A configured upgrade sees the toast exactly once.
- Tests have teeth. The conductor killed all 4 mutants. The tests also assert absence (no other disabled row, other keys unchanged), not only presence.

## Issues

### Critical
(none)

### Important
(none)

### Minor
1. **The toast text differs from R-UPG-1's quoted wording.**
   - Location: `js/main.js` `announceWhatsNew`.
   - What I saw: the code shows "What's new in 2.1: one-tap display protection for always-on screens." R-UPG-1 (spec.md:283) quotes "What's new in 2.1: display protection options".
   - Criterion 2 only requires the `What's new in 2.1` prefix, so the criterion is met. The quoted spec string is not.
   - Class: spec-gap (the acceptance criterion and the spec disagree on how exact the text must be).
   - Fix: align the string, or let the `docs` phase amend R-UPG-1 to the shipped text.
2. **The preset rows show raw enum values for the night-dim target.**
   - Location: `showValue` in `js/settings-ui.js`.
   - What I saw: the row reads "Dim the whole picture: stage … now frame" (see the preset screenshots). The select's own labels are "The whole picture" / "The frame only". It is legible, but it is the only row whose value is an internal token.
   - Class: spec-gap (the criteria are silent on how values are worded).
   - Fix (optional): map `stage`/`frame` to the option text, or drop the value for the locked row.
3. **The "unconfigured" test does not assert that the marker is written.**
   - Location: `tests/e2e/preset.spec.mjs`, case "unconfigured install never shows the toast".
   - What I saw: K60's chosen behaviour is that an unconfigured install writes the marker, so configuring it later never shows the toast. No test pins that down. A change that skips writing on unconfigured boots would pass every test.
   - Class: spec-gap (K60 is a ruling the criteria predate).
   - Fix (optional): assert `localStorage.getItem('plexPoster.whatsNew') !== null` in that case.

Criterion 6: PASS
- (a) **Phase-gate M2.** state.md marks pixel-shift, frame-brightness, sleep-mode, content-rating-filter, kiosk-and-pin, device-helper-server, device-helper-integration and pi-stability as ✅ done. This phase is the exit. Test health on 579bda2: `npm test` 327/327, full e2e 19/19 PASS, precache OK.
  - Doc currency, nothing contradicted: the code matches R-PROT-5 and R-UPG-1 in behaviour. R-CTRL-1 names only the values `auto`/`always`/`never`, which are unchanged.
  - Drift to note for `docs`, not a failure: the README does not yet mention the preset, the toast or any M2 protection feature (R-DOC-* belongs to `docs`), and the toast wording differs (Minor 1).
- (b) **Combined scenario.** Run at rotation 90 in both 1920x1080 and 1080x1920. The seed was sleepEnabled (01:00-07:00), kioskMode, pixelShift (1 min), and nightDim 60 on stage. The fake clock started at 03:00, which is asleep with the veil up.
  - `mock.play('3')` woke the display within the poll and took the veil down. The poster rendered.
  - After 150 s simulated:
    - The stage and poster are inside the viewport. At 1920x1080 the stage box is l156.6 t26.6 r1793.6 b1073.6. At 1080x1920 it is l32.5 t635.4 r1079.5 b1305.4.
    - The stage is shifted (`translate` 15.1px 10.1px / 16px 10.4px).
    - `--ui-rotation` is 90deg.
    - Controls stay hidden (`visible:false`, `inert:true`) after a mouse move, a click and an ArrowRight.
    - Night dim: the stage filter is `brightness(0.6)` and the frame filter is empty, so the dim is not doubled. The display stays awake while playing.
  - The screenshot looked right (rotated poster, dimmed, no veil, no controls).

UI screenshots: PASS
- The files are `/home/user/plex-poster-app/.orchestrator/artifacts/recommended-protection-preset--shot-{1920x1080,1080x1920}-{preset,toast,controllabels,controllabels-never}.png`.
- Preset list: 8 rows, all legible, each label 343px with scrollWidth equal to clientWidth. The disabled stage row is visibly greyed, and the Apply/Cancel buttons and the "Nothing is saved…" note are fully visible at both sizes.
- Toast: the box is 520px, inside the viewport at both sizes, with no overflow (scrollWidth 518 = clientWidth 518). The Open settings button is legible.
- Control labels: "Auto" is fully visible in the closed select, and the options fit (367/367).

## Declined to judge
- **The toast while the display is asleep, or while a modal is open.** The toast can be shown and the marker written while the veil or a modal is up. This is mostly moot, because sleep, kiosk and similar features are new in 2.1 and so off on a 2.0 upgrade. It is product behaviour beyond the criteria.
- **README content.** Owned by the `docs` phase (noted above).

## Recommendations
- Carry Minor 1 to `docs` (amend R-UPG-1 to the shipped text) unless the conductor prefers a one-line string change.
- Minors 2 and 3 are optional follow-ups under D42.

## Assessment
Criteria 1–5 are met and backed by passing tests on this tree, including the full ~16-minute suite. The decisions D4, D5, D6, Q20 and K60 are honoured, and K59 is fixed without weakening the assertion. Criterion 6 passes. M2 can close. No Critical or Important findings.

**Verdict:** APPROVE

Files read: worktree `git diff --cached`; docs/integration-plan.md §18; docs/spec.md (R-PROT-5, R-UPG-1, R-CTRL-1); docs/decisions.md (D4–D6, Q20, D40–D44); .orchestrator/phases/recommended-protection-preset.md; .orchestrator/state.md; tests/e2e/{lib,run,sleep,kiosk,pixel-shift,smoke}.mjs (parts); js/main.js:855-885; index.html:224-313 (parts); the 8 screenshots and one scenario screenshot.
