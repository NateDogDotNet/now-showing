produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: pi-stability · round: r3 · mode: anchored
**Verdict:** APPROVE

Reviewer: pi-stability-review-anchored-r3 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T06:59:29Z · Method: anchored delta review · Scope: pi-stability, r3, base tree 82fd6a1 (approved r2), tree 283f9f1 (staged index of /home/user/wt-pi-stability)

## What I read and ran
- `git diff 82fd6a1 283f9f1`: only js/main.js (3 lines) and tests/e2e/pi-stability.spec.mjs (+110: cases 9d, 9e, 9f, 9g). Nothing else changed. `git write-tree` in the live worktree still gives 283f9f1 after my runs.
- I read the phase record's Step 7 triage for r2 (PSA1, PSC1, PSC2, K43), the Minors from both r2 reviews, and js/main.js 370-470, 563-582 and 610-650.
- Scratch copy: `git archive 283f9f1` extracted into a `mktemp -d` dir (/tmp/tmp.6j2xDTgBJm, now removed). The live worktree was not touched.
- Determinism: `E2E_PORT=23800 E2E_MOCK_PORT=23801 node tests/e2e/run.mjs pi-stability` ran 3 times. All 3 exited 0 (`PASS pi-stability`). The new cases passed every time:
  - 9d: the reload came 9210, 9001 and 9871 ms after the draw (fade 8000 ms).
  - 9e: the reload came 8349, 7141 and 7836 ms after power-on (TV_WAKE_MS 4000).
  - 9f and 9g: ok in all 3 runs.
  - Note: 9e uses `serveArgs`, so it runs on a dedicated server whose ports lib.mjs `freePort()` gets from the OS. Those ports fall outside 23800-23824, and I cannot change that without editing the harness.
- Mutants: four scratch copies. Each ran its targeted case through `E2E_PI_ONLY`, on ports 23802-23809. Each copy was discarded afterwards.

| Mutant | Case | Result |
|---|---|---|
| delete the `lastDrawAt` crossfade line | 9d | exit 1, `the fade is running at 04:00:01: the tab navigated`, KILLED |
| `state.busy \|\| state.tvWaking` → `state.busy` | 9e | exit 1, `reloaded 1995 ms after power on, before the TV had finished waking (TV_WAKE_MS 4000)`, KILLED |
| delete the `manualWakeUntil` wait | 9f | exit 1, `a manual wake is running: the tab navigated`, KILLED |
| delete `bootAt += jump` | 9g | exit 1, `the page had been up for two minutes: the tab navigated`, KILLED |

## Confirmation of the r2 items
- **PSA1 (anchored r2 Minor 1): resolved.** 9d and 9e each fail when their wait is removed (table above). These are the same two mutants that survived in r2.
- **PSC1 (cold r2 Minor 1): resolved.** `reloadMustWait` now returns 'a manual wake is running' while `Date.now() < state.manualWakeUntil` (main.js:420). 9f shows that no reload happens before 04:00:20, and the mutant shows the case has teeth.
  - Can the wake postpone the reload forever? `manualWakeUntil` is set to now + 60 s only in two places:
    - `manualWake` (main.js:625): it returns early unless the screen is asleep, swallowing, or `sleepWhy === 'manual wake'`.
    - the `pointermove` handler (main.js:640): it only runs while `sleepWhy === 'manual wake'`.
  - So the reload is postponed only while someone is actually pressing keys or moving the pointer within each 60 s, during sleep hours. When the input stops, the reload runs at most 60 s later. That is often after the screen has gone back to sleep, which r2 case S showed is safe (the veil is painted on the first frame).
  - If a manual wake spans the schedule end, `sleepWhy` changes, extensions stop, and the wait is at most the remaining ≤ 60 s.
  - A backward clock jump cannot strand `manualWakeUntil`: it is shifted by the jump (main.js:379).
  - I judge this acceptable. Interrupting someone who is using the screen is the harm K39 meant to avoid, and the reload stays pending (`reloadPending` is not cleared by a wait, main.js:453), so it is delayed, not lost.
- **PSC2 (cold r2 Minor 2): resolved.**
  - `bootAt` is now `let` and is shifted by the detected jump in `syncSleepClock` (main.js:378, 393).
  - 9g covers a boot in 1970 followed by NTP to 2026: no reload when the schedule ends, and the mutant is killed.
  - A backward jump cannot make the 12 h trigger fire early. The trigger tests `Date.now() - bootAt` (main.js:445-446), and both terms move by the same jump, so the uptime it measures stays the real elapsed time whichever way the clock jumps.
  - `requestReloadAfterWake` is called only from `evaluateSleep` (main.js:582), which runs `syncSleepClock()` first (main.js:564). So the shift is always applied before the check.
  - When `lastReload` is stored, `bootAt` is not used at all.

## Strengths
- The code fix is small and targeted. The comments state why each wait exists.
- Each new case asserts the timing itself (fade length, TV_WAKE_MS, the 60 s end, no lastReload), not only that a navigation happened.

### Critical
None.

### Important
None.

### Minor
None new. (K43, the skipped 04:00 reload not being retried that day, was ruled earlier and is not reopened.)

## Declined to judge
- 9e's dedicated server binds OS-chosen ports outside the assigned range. This is harness behaviour (lib.mjs `startDedicated`) that the delta does not touch.
- Whether input during sleep hours should be able to keep postponing the reload is a product question. I give my view above (acceptable) and raise no finding.

## Recommendations
None for this phase.

## Assessment
All three triaged items are fixed. Each fix has a case that fails without it. The new cases passed 3 out of 3 runs, and the delta touches nothing else.

UI screenshots: PASS (r2 shots stand; UI unchanged). The delta changes no CSS, HTML or rendering code, so I took no screenshots.

Files read: git diff 82fd6a1 283f9f1; .orchestrator/phases/pi-stability.md (Step 7 sections, via grep); .orchestrator/artifacts/pi-stability--review-r2.md and --review-cold-r2.md (Minor sections, via grep); js/main.js (360-470, 563-582, 610-650); package.json; tests/e2e/run.mjs (1-40); tests/e2e/lib.mjs (grep); tests/e2e/pi-stability.spec.mjs (grep for E2E_PI_ONLY); run logs in the scratch dir.

**Verdict:** APPROVE
