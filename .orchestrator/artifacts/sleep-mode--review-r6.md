produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: sleep-mode · round: r6 · mode: anchored
**Verdict:** APPROVE

Reviewer: sleep-mode-review-anchored-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T02:25:32Z · Method: anchored full review (risk:high, ui) · Scope: sleep-mode, r6, base e764aee, tree 2df5e2d (staged index of /home/user/wt-sleep-mode; `git write-tree` = 2df5e2db19…)

Criterion 6 attacks: PASS
UI screenshots: PASS

## What I read and ran

Read: the `sleep-mode` phase section in docs/integration-plan.md, R-PROT-1 in docs/spec.md, D4/D21 (K7, K9) in docs/decisions.md, the phase record from "Step 7 triage — r2" to the end (K11 AMENDED, K12-K14, Branch pick, Step 4 r6), and `git diff --cached` for js/, css/, index.html and sw.js, plus parts of tests/e2e/sleep.spec.mjs, tests/e2e/lib.mjs, scripts/mock-plex.mjs and js/plex.js. I did not reread the r2 reviews in full. The triage summarises their findings, and I checked each one below against code and tests.

Ran, all in a scratch export of the staged index (`git checkout-index -a --prefix=$D/`, D = mktemp -d under the session scratchpad, node_modules symlinked to /home/user/wt-e2e-harness/node_modules, playwright 1.56.1). The live worktree was not modified.
- `node --test tests/*.test.js`: 108 pass, 0 fail. `node scripts/check-precache.mjs`: 25 precached files OK.
- `E2E_PORT=19010 E2E_MOCK_PORT=19011 npm run test:e2e -- sleep`: **PASS**, all 33 checks ok.
- My own attack spec `tests/e2e/attack.spec.mjs`, in scratch only (E2E_PORT=19020, E2E_MOCK_PORT=19021). To get DST cases I patched the scratch copy of lib.mjs so it passes `timezoneId` through. Results are below.
- One experiment in js/main.js (scratch only), reverted afterwards. `cmp` against `git show :js/main.js` confirmed the revert.

## Confirmation of r2 findings routed to r3

| r2 item | Status | Evidence |
|---|---|---|
| AI1 multi-tap click-through | resolved | e2e case 10 ok. My attack G: 4 taps at 250 ms on Pause, Settings and Diagnostics while asleep left `{"p":"false","s":false,"d":false}`, and play then woke the display. main.js:255-288 |
| CI1 failed poll fatal while awake | resolved (sleep's poll) | main.js:196-202: the awake path only logs. Case 11 (403, now playing off) ok: 5 posters in 48 s, no error. See Declined to judge for showNowPlaying on |
| AM2 / K11 AMENDED | resolved | main.js:197 sets `playing=false` on the 3rd consecutive failure (so playing is kept through at most 2, which is within "at most 3"). Only a successful poll writes lastPlaybackAt (main.js:206). The asleep throw goes to handleFailure, which only shortens the retry (main.js:171) and draws nothing while asleep (main.js:160). Cases 11b, 11c ("every poll failing 61 min: idle sleep still starts") and 11d (veil up 61 470 ms after the outage starts, poll 20 s, lock 1/0) ok. Conductor mutant stale-playing-never-expires was killed |
| CI2 / K12 dialog input | resolved | Cases 12 and 12b ok (the first press focuses, the first Escape closes). The r4-label survivor dialog-input-swallowed was killed in r6 (phase record) |
| CM4 / AM3 / K13 | resolved | main.js:349. Case 13 ok: awake at the save and at 58 min, asleep an hour after the save |
| AM1 / K14 | resolved | main.js:171. Case 14 ok: awake 5047 ms after Plex returned from a 3 min outage |
| CM2 / AM5 one request per tick | resolved | Case 15: 10 requests in 10 ticks |
| CM3 no tick while paused | resolved | main.js:241. Case 16 ok |
| CM1 cached poster while asleep | resolved | Case 17 ok |
| CM5 veil semantics | resolved | index.html `aria-hidden="true"`, main.js `#app.inert`. Case 18 ok |
| AM4 wake fade | not judged | K15 is an open owner question |

## Criterion 6 attacks (wake lock `held === 1`, `releases === 0` asserted at the end of each)

- **Offline start:** builder case 7 ok. **Plex down then up during a movie:** case 11d ok. **Plex down then up while asleep:** case 14 ok. **Plex hanging, while asleep** (requests never answered, 2 hung, then Plex answers and plays): awake after 5058 ms.
- **Clock steps:** clock -3 h out of the window gives awake, +3 h back gives asleep, and play wakes it in 3069 ms. The 1970 clock and a later jump (cases 9a, 9b) are ok. **DST** (America/New_York): across spring-forward 01:58 EST to 03:02 EDT the display stayed asleep and play woke it in 4056 ms. On fall-back with window 22:00-01:30 the sequence is `01:29=Z 01:30=a 01:00=Z 01:30=a` (the repeated hour sleeps again, see Declined), and play still woke it. **NTP step followed by a key press:** see Minor 1. The display stays lit, the veil is not stuck.
- **Settings saved while asleep:** case 8 ok. My case F (saved during a manual wake with sleepStart 02:00): asleep again after 70 s, play woke it in 7073 ms.
- **Double and triple taps:** case 10 plus my case G, above.
- **Manual wake expiring with Settings open:** cases 12 and 12b (pointer and key) ok.
- **Pause interplay:** pressing `p` during a manual wake pauses, and the veil returns after 65 s. Playing while paused keeps the veil (as ruled in K9). Waking and pressing `p` again resumes; playback then woke the display and it was still awake 120 s later. Case 16 ok.
- **Refused /status/sessions:** 403 case 11 ok. 401 with now playing on and the window opening: asleep, and after sessions return plus play it woke in 6044 ms.
- In no attack did the veil stay up after playback started, and in no attack was the wake lock released.

## UI screenshots

Written to /home/user/plex-poster-app/.orchestrator/artifacts/:
- `sleep-mode--shot-r6-{1920x1080,1080x1920}[-rot90]-asleep.png`
- `sleep-mode--shot-r6-{1920x1080,1080x1920}[-rot90]-diagnostics-asleep.png`

The rot90 shots use rotation 90 with rotateUi on. I counted pixels with PIL:
- **Asleep:** 0 non-black pixels in all 4 shots.
- **Diagnostics while asleep:** 0 non-black pixels outside the dialog box in all 4 shots.
- **Veil box:** equals the viewport in every case (0,0,1920,1080 and 0,0,1080,1920).
- **Rotated Diagnostics:** the transform is `matrix(0,1,-1,0,…)` and the sheet sits inside the viewport. It shows "Sleep: asleep (schedule)" and "Wake lock: held".

## Strengths

- `decideSleep` is pure and small, and every wake path goes through it.
- The wake lock is never touched (D4).
- The poll-failure counter is minimal and reset on success.
- The e2e suite is broad and was mutation-checked by the conductor for every r3 item.

## Issues

### Critical
None.

### Important
None.

### Minor
1. **A clock step followed within 1 s by a key press, a settings save or a poll that sees playback adds the step to the new timestamp** (code-bug).
   - **Location:** main.js:259 (also :206, :349) together with main.js:216-222.
   - **What happens:** the new value is written from the post-step `Date.now()`. Then `evaluateSleep()` detects the step and adds it again, through `manualWakeUntil += jump` and `lastPlaybackAt += jump`.
   - **Evidence:** asleep at 02:00:03, `setSystemTime(+3 h)`, then a key press. The display was still awake ("awake (manual wake)") at +75 s and stayed awake until the window ended (still awake at 09:01, the end of a 4 h search). The manual wake should last 60 s. A key press 2 s after the step behaves correctly.
   - **Root cause confirmed:** I added a leading `evaluateSleep()` call to `manualWake` in scratch, and the manual wake then lasted 2 simulated minutes (60 s steps). I reverted the change.
   - **Why it matters:** this is the "stuck manual wake" that the change's own comment (main.js:213-214) sets out to prevent. One press after an NTP correction can leave the panel lit for the rest of the night. It needs a sub-second coincidence, and the veil never gets stuck the other way. A wrong `lastPlaybackAt` heals at the next poll that sees playback.
   - **Fix:** absorb the clock step before any timestamp is written. Split the jump correction into a `syncSleepClock()` and call it first in `manualWake`, the pointermove handler, `pollPlayback` and `applySettings`.

## Declined to judge

- **401/403 from /status/sessions with showNowPlaying on (the default):** no poster is shown, and Last error reads "Plex rejected the token (unauthorised)". The failure comes from `engine.decide()`'s own now-playing fetch, which is pre-existing base behaviour and outside the sleep poll that CI1 and K11 cover. A side effect: on a failed poll, decide() makes a second sessions request that tick. Worth a note for metadata-and-now-playing.
- **DST fall-back repeats a local hour:** a window ending inside it (e.g. 01:30) sleeps again for the repeated hour. This is consistent with local-time semantics, harmless, and playback still wakes the display.
- **Already ruled or tracked elsewhere:**
  - K9: Pause stops playback-wake.
  - K15: wake fade.
  - K16: SW timer under a fake clock.
  - Pre-existing showEmpty under the veil.
  - Hardware wake lock and labwc (validation).

## Recommendations

- If the owner or conductor routes Minor 1, it is a small, local fix. An e2e case should go with it: step the clock, then press a key within the same second, and assert the display is asleep again after 61 s.

## Assessment

Every r2 item routed to r3 is resolved with evidence, and K11-amended holds as written. In none of the criterion-6 attacks did the veil stay up after playback or the wake lock get lost. The screenshots are black edge to edge at both sizes and at both rotations. The one issue is a Minor code-bug: a sub-second race after a clock step that keeps the display lit, never black. The phase record says to stop on any code-bug, so whether this race triggers that stop is the conductor's call.

Files read: docs/integration-plan.md (sleep-mode section), docs/spec.md (R-PROT-1), docs/decisions.md (D4, D21), .orchestrator/phases/sleep-mode.md (r2 triage onward), staged diff, tests/e2e/sleep.spec.mjs (parts), tests/e2e/lib.mjs (parts), scripts/mock-plex.mjs (parts), js/plex.js (grep), js/schedule.js (head), one screenshot.

**Verdict:** APPROVE
