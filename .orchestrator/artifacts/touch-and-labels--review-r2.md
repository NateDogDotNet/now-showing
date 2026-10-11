produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: touch-and-labels · round: r2 · mode: anchored
**Verdict:** APPROVE

Reviewer: touch-and-labels-review-anchored-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T17:30:10Z · Method: anchored code review (ui) · Scope: touch-and-labels, r2, base ca4de29, tree 6a96b33 (staged index of /home/user/wt-touch-and-labels)

## What I read and ran

Read: the plan section `### 20. touch-and-labels`; spec R-CTRL-1/2/3, R-ROT-2, R-KIOSK-1; decisions D2, D40 (K36), D43 (K53), D44; the phase record (K54–K57); the full `git diff --cached` (10 files); main.js sleep handlers (l.616–655) and the `#app/#stage/#empty` markup.

Ran everything in scratch copies made with `git archive 6a96b33 | tar -x` into `mktemp -d` dirs under /tmp/claude-0 (removed afterwards; the live worktree's tree id is still 6a96b33 and its index is unchanged):
- `npm test`: 327/327 pass. `node --test tests/shortcuts.test.js`: pass. `node scripts/check-precache.mjs`: "31 precached files OK". `grep -q 'id="shortcuts"' index.html`: exit 0.
- `npm run test:e2e -- touch-controls` (E2E_PORT 24810/24811): all 25 cases pass.
- **Full e2e suite** (E2E_PORT 24820/24821): all 20 specs PASS, `exit=0` (brightness … ui-rotation, including first-run, kiosk, sleep, settings-sheet).
- My own probe scripts (24830–24835) against a mock server: adversarial first-tap cases, a mutation, and the screenshots.

## Probes of the first-tap rule (R-CTRL-2)
| Case | Result |
|---|---|
| Touch tap on Save/Diagnostics Close after the 3.5 s hide (spec) | first tap works |
| Touch tap on `#shortcuts` Close after the controls hid | first tap closes it |
| PIN keypad by touch (PIN set, `s`, wait for idle, tap 2-4-6-8-OK) | Settings opens: no digit eaten |
| Empty card's **Open settings** (spec) | first tap works |
| Mouse move, then click on Settings | opens on the first click |
| Keyboard Tab+Enter (spec), and Enter after a stale touch press | opens: never swallowed |
| Long press on the hidden Pause button (CDP touchStart, 1.2 s, touchEnd) | reveals only (aria-pressed stays false); the next tap toggles it |
| Tap while asleep (spec) | wakes only. `manualWake` stops the pointerdown at window capture, so the new document-capture handler never arms; sleep's own click swallow owns that click |
| Kiosk tap | no reveal, nothing triggered |

Mutation: I dropped `&& e.detail > 0` (main.js click guard) and pressed a synthetic touch `pointerdown` on `#stage` that has no click, then pressed Enter on the focused Settings button. With the mutant, Settings stayed closed. With the original, it opened. So the guard has teeth, but no spec case kills it (see Minor 2). I reverted the mutation, and `git diff --no-index` against the live main.js shows no difference.

## Strengths
- The swallow rule (main.js, new block after `wake()`) follows the hazard note exactly. It records state in the capture phase ahead of `wake()` and checks `!visible`, `!kioskMode`, `pointerType !== 'mouse'`, no `dialog[open]`, and target in `#controls`/`#stage` or `=== #app`. `pointercancel` resets it, and every click clears the flag.
- One table: `KEYS = keyMap()`, and the overlay, the tooltip key hints and the Diagnostics button all read `listShortcuts(state.settings)`. The unit tests pin the exact key→action map, prototype safety, freezing, and that main.js has no second table.
- K36/K55: contextmenu is prevented on the stage, the PIN keypad, `#pin-dots`, `#pin-dialog` and Diagnostics. It is allowed in Settings text fields and on the `#settings` element itself, and kiosk.spec plus touch-controls cover it.
- K56: native `title`s are gone. Pin's "Unpin "<title>"" moved to aria-label, and each label is part of its accessible name (asserted).
- K57: `#diag-shortcuts` opens `#shortcuts` by touch, is hidden with disableShortcuts, and the dialog opens on top of Diagnostics.
- engine.js hint: each piece of advice appears only when it applies, with unit tests for all four combinations.
- K53: `.empty-card:has(.firstrun.resting:not([hidden])) #empty-message {display:none}`. The S6C1 assertions are strict (`isVisible` false, `doesNotMatch`, the line comes back after each rest), and S6C2 only widens a real-time wait from 3 s to 30 s. No assertion was weakened.

## Issues

### Critical
None.

### Important
1. **On the empty-state screen the first tap on the bar still triggers the hidden control (U12 survives there)** (spec-gap). Location: main.js swallow rule `target.closest('#controls, #stage') || target === $('app')`; index.html l.44 `#empty` is a full-screen (`position:absolute; inset:0`) sibling of `#stage` inside `#app`. Evidence (probe, unconfigured display, 390x844 touch): `document.elementFromPoint` under the hidden Rotate button returned `empty`, and after one `touchscreen.tap` the stored `rotation` was 90. Why it matters: first run is the state where a keyboardless touch device is most likely to be used, and one stray tap rotates the display or opens Settings, which is exactly the U12 complaint. Why spec-gap: R-CTRL-2 limits the swallow to "inside #controls (or the bare stage)" and protects "a button in the empty-state card". The bare `#empty` backdrop is neither, so the code meets the text as written. Fix (if the conductor rules it in): add `target === $('empty')` (the backdrop only, never `.empty-card` or its buttons) to the target test, plus an e2e case: empty state, tap the hidden Rotate position, rotation unchanged; Open settings still works on the first tap.

### Minor
1. **`controlLabels` has no control in the Settings sheet** (spec-gap). `grep controlLabels index.html js/settings-ui.js` finds nothing. Only an import or localStorage can reach 'always'/'never'. R-CTRL-1 says "Setting `controlLabels`" and settings-ui.js is not in this phase's Output, so this is not a code-bug. Decide whether a later phase (docs/settings) should expose it.
2. **The keyboard guard `e.detail > 0` has no test that kills it** (code-bug, test only). The keyboard case in touch-controls has no earlier armed press, so the flag is already false. The mutation above shows the guard matters after a touch press with no click (long press into a context menu, a pointerdown with no click). Fix: in the keyboard case, dispatch a touch `pointerdown` on `#stage` before Enter (as in my probe).
3. **The "O" key cap reads like zero** (spec-gap, cosmetic). In `--shot-1920x1080-shortcuts.png` the `ui-monospace` "O" cap is hard to tell from "0". Consider a proportional font for letter caps.
4. **Diagnostics' first focusable button is now "Keyboard shortcuts"** (minor UX, spec-gap). It takes the initial focus ring (screenshot d), so Enter on a remote right after opening Diagnostics opens the overlay. This is harmless and Esc returns.

## UI screenshots
Written to /home/user/plex-poster-app/.orchestrator/artifacts/:
- `touch-and-labels--shot-390x844-touch-labels.png`: the bar wraps to two rows inside the phone. Labels are legible under each icon. Buttons measured 44–73 x 45 px, nothing clipped or overlapping.
- `touch-and-labels--shot-1080x1920-rot90-touch-labels.png`: the bar rotates 90 and sits at the viewer's bottom-right (box 12,1441–75,1908, inside the viewport). Seven labelled buttons fit in one row. The 11 px labels are small on a TV but legible.
- `touch-and-labels--shot-1920x1080-desktop-tooltip.png`: hover shows one tooltip "Rotate (O)" above the bar and no persistent labels.
- `touch-and-labels--shot-1920x1080-shortcuts.png`, `--shot-1080x1920-rot90-shortcuts.png`: 8 rows generated from the table. At rotation 90 the dialog reads upright for the viewer, box 347,770–733,1150, inside the viewport. Esc closed it.
- `touch-and-labels--shot-1920x1080-diagnostics.png`, `--shot-1080x1920-rot90-diagnostics.png`: the Keyboard shortcuts button sits in the footer. Clicking it opened `#shortcuts`.

UI screenshots: PASS

## Declined to judge
- The dialog[open] guard and the mouse exclusion being equivalent mutants: the builder argued it in the phase record. My probes agree (inside a modal the press target is always in the dialog), and the conductor ruled on it.
- Whether 11 px labels are big enough on a 1080p panel viewed from across a room: a product question. They pass legibility in the screenshots.
- Pen input: Playwright cannot emulate it here. By reading the code, `pointerType 'pen'` is treated like touch, as the rule requires.

## Recommendations
Route Important 1 to the conductor as a ruling (extend "bare stage" to the `#empty` backdrop?). If it is accepted, it is a two-line fix plus one e2e case and can travel with Minor 2.

## Assessment
All five plan criteria pass on tree 6a96b33, and the full e2e suite is green. The first-tap rule swallows only what R-CTRL-2 allows. I could not make it eat a tap inside Settings, the shortcuts dialog, the PIN keypad or the empty card's buttons, nor a mouse click, a keyboard Enter or sleep's wake. The routed items (K36/K55, K53, K56, K57, the engine hint, S6C1/S6C2) are done with strict tests. The one meaningful gap, the empty-state backdrop, lies outside the rule as written.

**Verdict:** APPROVE
