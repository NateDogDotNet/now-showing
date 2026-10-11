produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: touch-and-labels · round: r1
status: complete        failure_class: n/a
paths: js/shortcuts.js, tests/shortcuts.test.js, js/main.js, index.html, css/app.css, sw.js, tests/e2e/touch-controls.spec.mjs, js/engine.js, tests/engine.test.js, tests/e2e/first-run.spec.mjs (all staged, nothing committed; also appended Q-tl1..Q-tl3 to /home/user/plex-poster-app/.orchestrator/questions.md)
criteria:
  1. met - test -f tests/shortcuts.test.js && node --test tests/shortcuts.test.js (8 pass, 0 fail)
  2. met - npm test (327 pass, 0 fail)
  3. met - npm run test:e2e -- touch-controls (23 cases pass; also PASS inside the full npm run test:e2e)
  4. met - node scripts/check-precache.mjs (31 precached files OK)
  5. met - grep -q 'id="shortcuts"' index.html
  routed K36: met (touch-controls K36 case) · engine.js K54 hint: met (2 new tests in tests/engine.test.js) · K53: met (first-run.spec K50 case) · S6C1/S6C2: met (first-run.spec; 6 copies in parallel pass)
  full suite: npm run test:e2e -> every one of 18 specs PASS, 0 FAIL, real 15m57s
  lint: eslint with round--eslint-r1e.config.mjs on all touched js/mjs files, exit 0
deviations: (1) native title attributes on the 7 control buttons removed (they would double the new CSS tooltip); the shortcut key now shows inside the tooltip, generated from the table; Pin's Unpin "<title>" text moved to its aria-label (Q-tl3). (2) The R-CTRL-3 "Keyboard shortcuts button in Diagnostics" was not added, the brief names only ? (Q-tl2). (3) K36 exemption also covers the Settings sheet's own box, because tests/e2e/kiosk.spec.mjs (not editable) asserts the sheet itself is not prevented (Q-tl1). (4) The brief's page.tap is page.touchscreen.tap(x, y) at hidden-control positions, since page.tap waits for a hit target that a hidden control does not have; page.tap is used wherever the target is visible.
questions: Q-tl1, Q-tl2, Q-tl3

Agent: touch-and-labels-builder-r1 · dispatched: 2026-10-11T16:33:33Z

## Design as built
- js/shortcuts.js: frozen SHORTCUTS table (r p space o f s d ?, key/action/label), normalizeKey (' ' -> 'space', else lower case), keyMap() (null-prototype), listShortcuts(settings) ([] with disableShortcuts). main.js: KEYS = keyMap(), handler uses normalizeKey; actions.shortcuts opens #shortcuts (rows generated from listShortcuts, each a div[data-shortcut]); dialog is class "sheet pin-sheet shortcuts-sheet", so it rotates with the UI.
- First-tap rule (main.js): document capture pointerdown records swallowTapClick = controls hidden AND not kiosk AND pointerType != 'mouse' AND no dialog[open] AND target in #controls/#stage or is #app. A window capture click swallows it once (only when click.detail > 0, so a keyboard click is never eaten). pointercancel clears it. The empty card's buttons are neither stage nor bar. Sleep's manual-wake swallowing and kiosk code untouched.
- Labels: each button has span.label; controls[data-labels] = controlLabels (set by applyControlLabels at boot and every apply). CSS: auto = label under icon on (hover: none), tooltip above the button on hover/focus-visible on (hover: hover); always = persistent; never = none. Bar flex-wraps, max-width = --vw - 24px; checked at 390x844 and at rotation 90 on 844x390.
- K36: contextmenu in kiosk is prevented unless the target is a text-entry element or #settings itself.
- K54 engine hint: "try turning off \"unwatched only\"" only when unwatchedOnly is on; "raise the limit" only when a limit is set; no parenthesis when neither applies.
- K53: .empty-card:has(.firstrun.resting:not([hidden])) #empty-message {display:none}.
- Noted equivalent mutants (cannot be told apart by any e2e): dropping the dialog[open] guard (a modal dialog's inert surroundings never give the stage/bar as a target), dropping the disableShortcuts guard inside openShortcuts (the keydown handler already returns first), and the mouse exclusion (a mouse press on hidden controls never produces a click on the button, probed). Mutations that did fail the suite: no wasVisible check (3 U12 cases), empty card included in the rule (Open settings case), old dialog[open] contextmenu exemption (K36 case).

## RED (before implementation)
tests/shortcuts.test.js: ERR_MODULE_NOT_FOUND js/shortcuts.js (then, with the table only, 2 failing: main.js KEYS/precache/dialog checks).
tests/engine.test.js: not ok 26 / not ok 27, e.g. actual: 'No posters found in that library (try turning off "unwatched only").' where no such hint was wanted.
first-run (K53): "rest at 2740 s: the general line is hidden  true !== false".
touch-controls with the bug present (js/shortcuts.js stubbed only to let the spec load): 14 of 23 failed, e.g. "the first tap did not settings  true !== false", "the first tap did not rotate  90 !== 0", "K36 on a PIN keypad key  false !== true", all U11 label cases and all U13 dialog cases; the cases that already held pass (Save, Diagnostics Close, Open settings, mouse, sleep, keyboard).

## GREEN outputs
$ node --test tests/shortcuts.test.js        -> # pass 8  # fail 0
$ npm test                                    -> # tests 327  # pass 327  # fail 0
$ node scripts/check-precache.mjs             -> 31 precached files OK
$ npm run test:e2e -- touch-controls          -> 22 ok lines in the first full run (1 case then fixed: details fold opened by script), final: all 23 touch-controls cases passed / PASS touch-controls
$ 6 parallel copies: node tests/e2e/first-run.spec.mjs x6 (each runs its own 4 workers, dedicated servers):
copy 1 exit=0
copy 2 exit=0
copy 3 exit=0
copy 4 exit=0
copy 5 exit=0
copy 6 exit=0
   tail of copy 1: all 18 first-run cases passed (wall 2m00s)
$ E2E_PORT=24720 E2E_MOCK_PORT=24721 npm run test:e2e   (real 15m57s)
PASS brightness
PASS cache-first
PASS content-rating
PASS display-decode
PASS first-run
PASS helper
PASS kiosk
PASS metadata
PASS now-playing
PASS pi-stability
PASS pixel-shift
PASS rotation
PASS settings-sheet
PASS sleep
PASS smoke
PASS status
PASS touch-controls
PASS ui-rotation
$ eslint --no-config-lookup -c round--eslint-r1e.config.mjs js/shortcuts.js js/main.js js/engine.js sw.js tests/shortcuts.test.js tests/engine.test.js tests/e2e/touch-controls.spec.mjs tests/e2e/first-run.spec.mjs -> exit 0

git status --short (all staged, not committed):
M  css/app.css
M  index.html
M  js/engine.js
M  js/main.js
A  js/shortcuts.js
M  sw.js
M  tests/e2e/first-run.spec.mjs
A  tests/e2e/touch-controls.spec.mjs
M  tests/engine.test.js
A  tests/shortcuts.test.js
