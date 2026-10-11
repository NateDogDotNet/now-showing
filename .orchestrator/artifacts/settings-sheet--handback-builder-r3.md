produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: settings-sheet · round: r3
status: complete        failure_class: n/a
paths: tests/e2e/brightness.spec.mjs, tests/e2e/helper.spec.mjs (edited r3, staged); staged from r1/r2 and untouched this round: css/app.css, index.html, js/duration.js, js/main.js, js/plex.js, js/settings-ui.js, js/util.js, scripts/mock-plex.mjs, sw.js, tests/duration.test.js, tests/plex.test.js, tests/e2e/first-run.spec.mjs, tests/e2e/settings-sheet.spec.mjs, tests/e2e/lib.mjs
criteria: 1 met (test -f ... && node --test tests/plex.test.js tests/duration.test.js, exit 0) · 2 met (npm test, exit 0) · 3 met (npm run test:e2e -- settings-sheet, 22 cases, exit 0) · 4 met (npm run test:e2e -- first-run, 12 cases, exit 0) · 5 met (grep, exit 0) · 6 met (check-precache: 30 precached files OK) · 7 met (grep chain, exit 0) · 8 met (git status --porcelain probe empty, exit 0) · full npm run test:e2e twice: exit 0 and exit 0, 102 PASS lines and 0 FAIL each · lint (eslint, round--eslint-r1e.config.mjs, brightness+helper+lib+all staged js): exit 0 · 20 consecutive runs of `npm run test:e2e -- brightness helper` under load: 20/20 pass
deviations: (1) In helper.spec.mjs the freeze is a helper `freezeClock(page)` called at three sites (case 7 before `mock.play('3')`, case 12 before the key press, case 13 before `wakeSequence`) rather than inside `wakeSequence`: in case 12 the wake is triggered by the key press, which comes before `wakeSequence`, so a freeze inside it would be after the wake. (2) The first attempt at the full-suite runs was killed by my own too-short background timeout (95 PASS lines, no FAIL, mid-suite); I restarted both runs from scratch and the numbers below are from those. (3) Task output notes "exit 144" on two of my shell commands; that was my own `pkill -f` matching the shell, not a test result.
questions: none

Agent: settings-sheet-builder-r3 · dispatched: 2026-10-11T09:41:32Z

## Changes (git diff --cached --stat for the two files: brightness +18/-2, helper +19)
- brightness.spec.mjs: new `pauseAtChecked(page, time, tries = 8)`. It calls `page.clock.pauseAt(time)` (an overshoot error is swallowed), waits 100 ms, reads the page's `Date.now()`, and returns when it equals `time.getTime()`. After 8 tries it throws `the fake clock would not pause at <iso> after 8 tries (last read <iso>)`. The ramp-in (21:59:00) and ramp-out (06:49:00) cases use it in place of the bare `pauseAt`. Ramp values and assertions are unchanged.
- helper.spec.mjs: new `freezeClock(page, tries = 8)`. Each try reads `Date.now()`, pauses at that plus 500, waits 100 ms, and checks the page reads exactly the target; it throws after 8 tries. It is called after the asleep wait and the first `helperCalls` wait in case 7 (before the wake is triggered by `mock.play`), in case 12 (before the key press), and in case 13 (before `wakeSequence`). TV_WAKE_MS stays a minimum (`>= 4000`) and the upper bound is untouched.

## Runs
Single run of both specs after the edit: PASS brightness, PASS helper; poster-after-power-on was 4000 ms (case 7), 4000 ms (case 12), 4108 ms (case 13).

20 consecutive runs under load (6 busy-loop CPU burners plus `npm test` looping the whole time, E2E_PORT=24020 E2E_MOCK_PORT=24021), each `npm run test:e2e -- brightness helper`:
```
passes 20/20
```
Criteria 1-8 (each exit 0):
```
[criterion 1] exit 0   [npm test] exit 0 (# todo 0)   settings-sheet: all 22 settings-sheet cases passed / PASS settings-sheet
first-run: all 12 first-run cases passed / PASS first-run   check-precache: 30 precached files OK
c5 0   c7 0   c8 0   lint 0
```
Full `npm run test:e2e`, back to back:
```
exit1=0   102 PASS lines, 0 FAIL
exit2=0   102 PASS lines, 0 FAIL
```
`git status --short`: all 16 paths staged (M/A), none committed, no unstaged or untracked entries.
