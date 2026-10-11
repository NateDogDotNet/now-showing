produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: sleep-mode · round: r8 · mode: cold
**Verdict:** APPROVE

Reviewer: sleep-mode-review-cold-r8 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T03:05:49Z · Method: cold code review · Scope: sleep-mode, r8, base HEAD e764aee, staged tree 83658c2d76bb891fc625b1b94d106ec824b2df79

### Critical
None.

### Important
None.

### Minor
1. **Awake, a failed playback poll makes a second `/status/sessions` request in the same tick (code-bug, request efficiency).** `pollPlayback()` returns `undefined` on failure (js/main.js, the catch block in pollPlayback). `tick()` then calls `engine.decide({ force, sessions: undefined })`, and with `showNowPlaying` on, `decide` runs `sessions ?? (await client.sessions())` (js/engine.js decide). So on a refused or flaky sessions endpoint, every awake tick sends two requests where one was intended ("one request per tick"). E2E case 15 checks only the success path. Case 11 (a 403) runs with `showNowPlaying: false`, so neither case covers this. Fix: when the poll was attempted and failed, have decide skip now-playing for that tick, e.g. pass `sessions: []` or a "poll failed" flag, or rethrow when `showNowPlaying` is on.
2. **A wake tick can take the place of the forced tick from a settings save (code-bug, narrow race).** Case 12b shows the veil can come back behind an open Settings dialog. The press on Save then wakes the display, and `evaluateSleep()` starts `tick()`. That tick reads `client.sessions()` from the **old** client before `applySettings()` calls `rebuildClient()`. Then `tick({ force: connectionChanged })` at the end of applySettings returns early because `state.busy` is set. As a result, after a server or token change, the first tick uses the old server's sessions with the new engine and runs without `force`. The impact is small: the new engine has `current = null`, so it picks a poster anyway. Fix: in applySettings, run `rebuildClient()` before `evaluateSleep()`, or queue a forced tick when one is dropped while busy.
3. **The idle clock restarts on every page load (spec-gap).** `state.lastPlaybackAt` starts at `Date.now()` when the module loads. The service worker's `controllerchange` handler reloads the page on its own, and a power cycle also reloads it. Either one brings an idle-asleep display back awake for a full N hours, for example in the middle of the night after a deploy. The schedule-based sleep is not affected. Whether the time of the last playback should be stored is a product decision.
4. **`wakeOnPlayback: false` does not stop playback from ending idle sleep (spec-gap).** With idle sleep on, `playbackMatters` keeps polling. A poll that sees playback updates `lastPlaybackAt`, and `decideSleep` then returns awake no matter what `wakeOnPlayback` says. This follows from "N hours without playback", but the checkbox label ("Wake the screen when something starts playing") suggests otherwise. The criteria should say which reading is meant.
5. **When paused, playback is not polled at all (spec-gap).** `evaluateSleep` does not tick while paused, and `schedule()` returns early. While paused, playback cannot wake a schedule sleep. Idle sleep can also black out a paused screen while a movie is playing. Case 16 shows this is deliberate ("the poster must not change under a pause"), but nothing says whether Pause should also stop the sleep logic from seeing playback.

### Declined to judge
- System suspend: `performance.now()` may stop advancing while the host is suspended, so `syncSleepClock` would treat a resume as a forward clock jump and push `lastPlaybackAt` forward. I did not rule on this because the design holds a screen wake lock, which makes host suspend outside the expected operating conditions.
- Log volume while asleep through a long outage: `handleFailure` logs a warning at the poll rate, which is 5 to 20 s instead of the backoff interval. I did not check the size limit of `createLog`, which the diff does not change.
- The wording of the copy and of the Diagnostics rows (a product question).

### Strengths
- `decideSleep` is pure and small. The schedule waits for a plausible clock, but idle sleep does not.
- Clock-step handling compares wall-clock time with `performance.now()`, and the clock is re-synced before every wall-clock timestamp is written. The e2e cases test a step and a write in the same second (19a, 19b, 22a, 22b).
- Nothing is drawn while asleep: decide is skipped, a download already in flight is not drawn (case 21), and the cached-poster fallback in `handleFailure` is gated.
- The sessions result is shared between the poll and decide, and polling happens only when the answer can change the outcome.
- Wake input is handled carefully: presses are swallowed in the capture phase, a click-swallow window protects against blind double taps, and input aimed at an open dialog is never swallowed.
- Up to 3 failed polls in a row keep the last playback state, which is enough to ride out a brief failure without keeping the display awake through an outage.
- DST: the schedule works on local minutes of the day, and idle sleep works on epoch milliseconds, so a DST change cannot register as a clock step.

### Read and ran
- Read: `git diff --cached` (all 9 files), js/schedule.js, js/main.js (tick, schedule, handleFailure, setPaused, applySettings, the input handlers, visibility and online handlers, rebuildClient), js/settings.js (sleep fields), js/settings-ui.js (form events, read and fill), css/app.css (z-index layering), the e2e case list and helpers in tests/e2e/sleep.spec.mjs, and tests/e2e/run.mjs (port variables).
- I exported the staged tree with `git archive` into `mktemp -d` (/tmp/tmp.I8iv7GFUMp) and symlinked playwright from /opt/node-tools into the copy.
  - `node --test tests/*.test.js`: 108 of 108 passed.
  - `E2E_PORT=19311 E2E_MOCK_PORT=19312 node tests/e2e/run.mjs sleep`: PASS, all cases ok.
  - Mutation test: I removed the `syncSleepClock()` call before the `lastPlaybackAt` write in pollPlayback, and replaced the `if (!state.asleep)` guard around `display.show` with `if (true)`. With `E2E_SLEEP_ONLY='^2[12]a?'`, case 21 failed ("nothing drawn under the veil", 1 !== 0) and case 22a failed (timeout). Both tests have teeth. I restored the original file and then deleted the scratch directory.
- The live worktree was not modified: `git write-tree` still gives 83658c2.

Files read: js/main.js, js/engine.js (diff), js/sleep.js, js/schedule.js, js/settings.js (grep), js/settings-ui.js, css/app.css, index.html (diff and grep), sw.js (diff), tests/sleep.test.js, tests/engine.test.js (diff), tests/e2e/sleep.spec.mjs, tests/e2e/run.mjs (head), package.json
