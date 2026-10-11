produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: touch-and-labels · round: r3
status: complete        failure_class: n/a
paths: index.html, js/main.js, tests/e2e/touch-controls.spec.mjs (r3 edits, staged); r1/r2 staged set unchanged: css/app.css, js/engine.js, js/shortcuts.js, sw.js, tests/e2e/first-run.spec.mjs, tests/engine.test.js, tests/shortcuts.test.js
criteria: 1 met (node --test tests/shortcuts.test.js: 8 pass) · 2 met (npm test: 327 pass, 0 fail) · 3 met (npm run test:e2e -- touch-controls: all 31 cases passed) · 4 met (check-precache: 31 precached files OK) · 5 met (grep -q 'id="shortcuts"' index.html rc=0) · full npm run test:e2e: rc=1 because ONE spec, smoke, failed on a clock assertion ("advanced 59995ms", smoke.spec.mjs:64) under full-suite load; the other 101 spec PASS lines are green and smoke re-run alone PASSES (see below) · lint (round--eslint-r1e.config.mjs on js tests): rc=0, no output
deviations: TLM2 test passes on r2 code (the e2e.detail>0 guard already exists; the case pins it). I proved it has teeth with a mutation instead (below). TLM4 fix is the `autofocus` attribute on #diag-copy.
questions: none

Agent: touch-and-labels-builder-r3 · dispatched: 2026-10-11T17:50:44Z

## Tests first, failing on r2 code
```
case K58 unconfigured display: a touch tap on the #empty backdrop ... failed:
AssertionError: the first tap did not rotate   90 !== 0
case TLM1 Settings has a Control labels select ... failed:
AssertionError: Expected values to be strictly deep-equal: actual [] expected ['auto','always','never']
case TLM3 the O key cap in the shortcuts dialog cannot be read as a zero failed:
a lower-case o, not a capital that looks like 0   'O' !== 'o'
case TLM4 opening Diagnostics does not put first focus on the Keyboard shortcuts button failed (1920x1080):
AssertionError: the shortcuts button does not take the initial focus
  ok  TLM2 keyboard Enter after an orphaned touch press acts      (passes on r2: guard already present)
  ok  K58 Open settings first tap                                  (passes on r2: must keep passing)
```
TLM2 mutation (scratch copy in mktemp -d, `swallowTapClick && e.detail > 0` -> `swallowTapClick`):
```
case TLM2 ... failed: AssertionError: timed out waiting for Enter on the focused Settings button
1 of 1 touch-controls cases failed
```
The original code passes it, so the case kills the mutant.

## Implementation
- js/main.js: the first-tap target test also accepts `target === $('empty')` (the backdrop only; the card, its text and buttons are not it). Dialog key caps: single letters show lower-case, the `o` cap has `aria-label="letter O"`. The tooltip hint "Rotate (O)" is unchanged.
- index.html: a "Control labels" select (`name="controlLabels"`: auto / always / never) after Rotation in Settings; `autofocus` on #diag-copy so Diagnostics' first focus is Copy, not the new Keyboard shortcuts button (at 1920x1080 and 390x844 that was the first focus before the button existed; at 1280x720 the scrollable body took it before, now Copy does).
- js/settings.js and js/settings-ui.js untouched (the select is read and written by name).

## Results
```
npm run test:e2e -- touch-controls: all 31 touch-controls cases passed / PASS touch-controls
  (new: ok K58 empty backdrop: first tap reveals only, second tap rotates; ok K58 Open settings first tap;
   ok TLM1 Control labels select: Always shows labels on desktop; ok TLM2 ...; ok TLM3 O cap shows o with a "letter O" label;
   ok TLM4 Diagnostics first focus: diag-copy)
node --test tests/shortcuts.test.js: # pass 8  # fail 0
npm test: # tests 327  # pass 327  # fail 0
node scripts/check-precache.mjs: 31 precached files OK
grep -q 'id="shortcuts"' index.html: rc=0
eslint -c round--eslint-r1e.config.mjs js tests: rc=0
full npm run test:e2e (E2E_PORT=24720 E2E_MOCK_PORT=24721), log /home/user/.full-e2e-tl-r3.log:
  102 PASS lines, 1 FAIL line: "FAIL smoke" - AssertionError: advanced 59995ms (tests/e2e/smoke.spec.mjs:64), rc=1
  (not a file this phase touches; the run's last line was PASS ui-rotation)
npm run test:e2e -- smoke (re-run alone): PASS smoke
```
The smoke failure looks like a load-sensitive clock-advance tolerance, not related to this diff, but I did not investigate it further; the conductor should re-run the full suite and judge.

Everything is staged, nothing committed.
