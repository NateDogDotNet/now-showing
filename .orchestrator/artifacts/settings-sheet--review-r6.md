produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: settings-sheet · round: r6 · mode: anchored
**Verdict:** APPROVE

Reviewer: settings-sheet-review-anchored-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T14:14:20Z · Method: anchored delta review (confirmation of r4 triage S4A1–S4A5) · Scope: settings-sheet, r6, base 6e3ad88, tree 297c7e2

UI screenshots: PASS

## What I read and ran

Read: `git diff 6e3ad88 297c7e2` (5 files: css/app.css, js/main.js, tests/e2e/first-run.spec.mjs, tests/e2e/lib.mjs, tests/e2e/settings-sheet.spec.mjs), the phase record Step 7 triage (S4A1–S4A5, K51, K52), r4 review header/run notes, js/main.js around 1187–1266 in the scratch copy.

Ran: three `mktemp -d` copies made with `git archive | tar -x` (297c7e2 twice: one for the full runs and one for mutations; 6e3ad88 once as the baseline), with node_modules symlinked read-only from the worktree. Ports were 24600–24635. Every mutation was reverted, and `cmp` against the clean copy confirmed it. All copies were removed afterwards. The live index is still `297c7e2` (`git write-tree`).

- `npm test`: 317/317 pass.
- **Full e2e run 1** (`E2E_PORT=24600 E2E_MOCK_PORT=24601 node tests/e2e/run.mjs`): **EXIT 0**, 102 PASS lines, no FAIL, all 17 specs pass, real 17m14s. My mutation, screenshot and stress runs were going at the same time, so this run was under heavy load. Printed `K50 5 codes and 724 polls in 71 min` and `network failure: 4 attempts in 121 s`.
- **Full e2e run 2** (`E2E_PORT=24602 E2E_MOCK_PORT=24603`, nothing else running): **EXIT 0**, 102 PASS, no FAIL, all 17 specs pass, real 15m44s. It printed the same two lines.

## Confirmations

- **S4A5: resolved.** In first-run.spec.mjs the delta removes only the three `clock: { time: new Date(...) }` headers (replaced by named constants with the same values) and moves `const pins = tv.pins` (S4A1). `git diff … | grep '^-[^-]'` lists exactly those 5 lines, so **no assertion was removed or loosened**. The network-failure case's body (bounds `1 + floor(elapsed/30 s)`, `pins 2..4`, error counts) is byte-identical apart from the added `freezeClock` line. `pauseAtChecked` reads `Date.now()` back after pausing and throws rather than loops. Cause test: I inserted `await wait(3000)` (3 real seconds) after the first attempt. On the 6e3ad88 spec the case fails with `AssertionError: 2 pins after 29 s`, the exact r4 failure. On the 297c7e2 spec it passes (`4 attempts in 121 s`). Stress: 3 concurrent processes ran the 7 clock-sensitive cases (`E2E_FIRSTRUN_ONLY='an hour stays small|network failure|asleep|go(es)? to sleep|SSC3'`) alongside full run 1: 21/21 passed.
- **S4A1 (K52): resolved, test bites.** Mutant: dropped `&& !pendingToken` from `firstRunWanted` (main.js:1190). SSC3 fails: `the token is waiting: no new code is asked for — 2 !== 1`.
- **S4A2 (K51): resolved, test bites.** Mutant: `unused = 0;` after the rest (main.js:1240). The K50 hour case fails: `the 4th code ran out unused and a rest started (none by 4200 s, 5 codes asked for)`.
- **S4A3: resolved.** Mutant: put `'continue'` back in the guard's wrapped methods (lib.mjs:77). `guardSelfTest` fails: `a plex.tv request that was continued is flagged`. Unmutated, the self-test passes. Both full runs pass, so every real spec's fulfil/abort routes still count as answered.
- **S4A4: resolved.** Mutant: drop `{ rest: true }`. The hour case fails with `rest at 2740 s: no instruction to enter a code`. Mutant: delete the `if (pendingToken) showEmpty(...)` line (main.js:1266). SSC3 fails with `the card says the sign-in worked`. Every write to the status line goes through `showFirstRun`, which toggles `resting` each time, so the class cannot get stuck on. I took the screenshots by adding `page.screenshot` calls to a scratch copy of the spec, with the viewport set per run:
  - `/home/user/plex-poster-app/.orchestrator/artifacts/settings-sheet--shot-1920x1080-rest-r6.png`, `…-1080x1920-rest-r6.png`: the title, the invitation line, "That code ran out. Asking plex.tv for a new one in 5 minutes…" and Open settings. No "enter this code", no squares.
  - `/home/user/plex-poster-app/.orchestrator/artifacts/settings-sheet--shot-1920x1080-signedin-r6.png`, `…-1080x1920-signedin-r6.png`: "Signed in. Open settings to finish." with the Open settings button and no code. (The controls bar shows because the spec pressed keys earlier.) Nothing is clipped at either size.
- **Nothing else changed:** the diff touches only the five files listed, and every hunk maps to S4A1–S4A5 or the harness comment.

## Strengths

- The clock fix goes at the cause, real time leaking into a flowing fake clock, and a 3-second injection proves it. It does not widen tolerances.
- Each new assertion was shown to fail against its mutant.

## Issues

### Critical
None.

### Important
None.

### Minor
1. **The rest card still shows the generic invitation "Connect to your Plex server to get started." above the rest message.** spec-gap. Location: main.js:1218 sets the card message, and the rest leaves it in place; see the rest-r6 screenshots. The triage wording "shows only the rest message" can be read as covering the whole card. The defect r4 named (an "enter this code:" instruction over placeholder squares) is gone, and the invitation line is the card's standing title text, not a code instruction. Not blocking. If the stricter reading is wanted, swap or hide the invitation line while resting.
2. **One unexplained failure, not reproduced, in my own instrumented run.** Neither class: it is an observation, not a finding against the change. While taking screenshots under heavy concurrent load (full run 1 plus my instrumented spec), one run of the pair `SSC3|an hour stays small` at 1920x1080 reported `1 of 2 first-run cases failed`. I did not capture the message. The 1920x1080 rest screenshot was missing from that run, so the failure was in the hour case before or at the rest screenshot. I could not reproduce it: 1 solo rerun, 3 reruns of the pair, 3 concurrent stress runs of all 7 clock cases (21/21), and the first-run spec in both full runs all passed. My scratch-only `page.screenshot` calls are a possible contributor. I note it so it can be checked again if a full-suite red ever shows up in that case.

## Declined to judge

- Cold r4 Minors (assertClean's fixed 150 ms wait, wrapped handler vs unroute): ruled at triage as a follow-up, so outside this round.
- Copy wording ("Signed in. Open settings to finish."): this is a product question, and the triage allowed "or similar".

## Recommendations

Land. Optionally take up Minor 1 in touch-and-labels if the stricter reading of "only the rest message" is intended.

## Assessment

All five r4 anchored Minors are fixed, each with a test shown to fail against its mutant. No assertion was loosened. Both full e2e runs exit 0, one of them under heavy load.

**Verdict:** APPROVE
