produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: sleep-mode · round: r6
status: complete        failure_class: n/a
paths: tests/e2e/sleep.spec.mjs (staged in /home/user/wt-sleep-mode, not committed)
criteria:
- 1 `node --test tests/sleep.test.js tests/engine.test.js` — met (31 pass, 0 fail)
- 2 `npm test` — met (108 pass, 0 fail)
- 3 `E2E_PORT=18840 E2E_MOCK_PORT=18841 npm run test:e2e -- sleep` — met (PASS sleep, 32 ok lines, 77 s wall of the 180 s E2E_SPEC_TIMEOUT)
- 4 `node scripts/check-precache.mjs` — met (25 precached files OK)
- 5 grep for sleep-veil / sleepEnabled in index.html — met (exit 0)
- dialog-input-swallowed mutant killed by the new assertions — met (see below)
- lint with round--eslint-r1e.config.mjs on tests/e2e/sleep.spec.mjs — met (exit 0)
deviations: none. js/main.js untouched; nothing written to .orchestrator/artifacts except this file.
questions: none

Agent: sleep-mode-builder-r6 · dispatched: 2026-10-09T02:19:06Z

## Change
New case `12b first input in a dialog behind the veil is not swallowed` in tests/e2e/sleep.spec.mjs, placed after case 12. Flow: schedule window, wake with `s`, open Settings with `s`, 62 s quiet so the veil returns behind the open dialog. Then:
1. Pointer: `page.focus('#settings-save')`, real `mouse.down()` on the wakeOnPlayback checkbox as the FIRST input while asleep; `document.activeElement.name` must be `wakeOnPlayback` and the display must be awake. (The mutant's preventDefault on pointerdown suppresses the compatibility mousedown, so focus never moves.)
2. Key: 62 s quiet again (asleep, dialog open), `page.focus(box)` (independent of step 1), then `Escape` as the FIRST input; the dialog must close and the display be awake. (The mutant's preventDefault on keydown cancels the dialog's Escape.)
Case 12 is unchanged.

## Mutant (temp copy in mktemp -d, removed afterwards; mutation: drop `&& !inOpenDialog(e)` in manualWake, js/main.js:260)
```
-  if ((state.asleep || swallowing) && !inOpenDialog(e)) {
+  if ((state.asleep || swallowing)) {
```
With the mutant, final spec (`E2E_SLEEP_ONLY='^12'`):
```
case 12b first input in a dialog behind the veil is not swallowed failed:
AssertionError [ERR_ASSERTION]: the first press on the checkbox behind the veil focuses it
+ actual - expected
+ ''
- 'wakeOnPlayback'
FAIL sleep
```
With the mutant and ONLY the pointer assertion neutralised (temp spec edit) so the Escape part runs on its own:
```
case 12b ... failed:
page.waitForFunction: Timeout 5000ms exceeded.   (dialog did not close on the first Escape)
FAIL sleep
```
Without the mutant (real code), `E2E_SLEEP_ONLY='^12'`:
```
  ok  veil back behind the open dialog: the FIRST press focuses the control under it, and a first Escape closes the dialog
  ok  70 s of pointer activity, ...
  ok  veil back behind the open dialog: the next click and key press in the dialog act
PASS sleep
```
Note: before the fix-up the first draft of 12b failed on real code because the 18 px checkbox sat outside the viewport; added `scrollIntoViewIfNeeded()` before computing the mouse position.

## Full sleep spec on real code
```
... 32 ok lines incl. "veil back behind the open dialog: the FIRST press focuses the control under it, and a first Escape closes the dialog"
PASS sleep
```
git status after: 9 staged files (css/app.css, index.html, js/engine.js, js/main.js, js/sleep.js, sw.js, tests/e2e/sleep.spec.mjs, tests/engine.test.js, tests/sleep.test.js); only the spec changed this round.
