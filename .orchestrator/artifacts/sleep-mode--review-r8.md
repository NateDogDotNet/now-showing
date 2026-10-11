produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: sleep-mode · round: r8 · mode: anchored
**Verdict:** APPROVE

Reviewer: sleep-mode-review-anchored-r8 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T03:05:49Z · Method: anchored full review (risk:high, ui; confirmation round) · Scope: sleep-mode, r8, base e764aee, tree 83658c2 (staged index of /home/user/wt-sleep-mode; `git write-tree` = 83658c2d76…, the same before and after the review)

Criterion 6 attacks: PASS
UI screenshots: PASS

## What I read and ran

**Read:**
- The `sleep-mode` phase section of docs/integration-plan.md.
- R-PROT-1 in docs/spec.md.
- docs/decisions.md (D4, D21, D23–D27).
- The phase record, Step 4 r7 to r8.
- The r6 anchored and cold reviews.
- The staged js/main.js, lines 55–372.
- The staged tests/e2e/sleep.spec.mjs: helpers, case list, cases 8 and 19a–22b.
- tests/e2e/lib.mjs (withApp) and scripts/mock-plex.mjs (grep).
- `git diff 2df5e2d 83658c2`, the r6 tree against the r8 tree. Only js/main.js and the e2e spec changed.

**Ran.** Everything ran in a scratch export of the staged index: `git checkout-index -a --prefix=$D/`, with D made by `mktemp -d` under the session scratchpad and node_modules symlinked. The scratch copy has been deleted. The live worktree was never edited, and its `git status` shows staged entries only.
- `node --test tests/*.test.js`: 108 pass, 0 fail.
- `node scripts/check-precache.mjs`: 25 precached files OK.
- `E2E_PORT=19210 E2E_MOCK_PORT=19211 npm run test:e2e -- sleep`: **PASS**. Every case passed, including 19a, 19b, 20, 21, 22a and 22b.
- **Mutations.** Each was applied with `sed` to scratch js/main.js and run alone with `E2E_SLEEP_ONLY` on ports 19220/19221. All 6 were killed. I restored the original afterwards, and `cmp` against `git show :js/main.js` matched.

| Mutant | Killed by |
|---|---|
| drop `syncSleepClock()` before the poll write (main.js:211) | 22a, waitAsleep timeout |
| drop it before the key/pointerdown write (:273) | 19b, timeout |
| drop it before the pointermove write (:288) | 22b, timeout |
| drop it before the settings-save write (:366) | 19a, timeout |
| C6M1 reverted to `s.sleepEnabled \|\| s.idleSleepHours > 0` | case 3 ("…it is not asked") and case 20 ("no /status/sessions request while awake") |
| C6M3: the `if (!state.asleep)` guard after `fetchImage` forced true | 21 ("nothing drawn under the veil") |

- **Attack spec.** Scratch-only `tests/e2e/attack.spec.mjs`, run on ports 19230–19233. For the DST cases I patched the scratch lib.mjs to pass `timezoneId` through, and used absolute UTC times.
- **Screenshot spec.** Ports 19240/19241, with the pixels counted in PIL.

## Confirmation of D23/D27 items

| Item | Status | Evidence |
|---|---|---|
| C6I1: a clock step never re-shifts a timestamp written after it, at all four write sites | **resolved** | `syncSleepClock()` (main.js:224-233) runs right before each wall-clock write: the poll seeing playback (:211-212), manualWake (:273-274), pointermove (:288-289) and applySettings (:366-367). It also runs at the top of evaluateSleep (:237). Each site has a regression case that steps the clock and then writes inside the same second: 22a, 19b, 22b and 19a. Removing the sync at any one site fails its case (table above). The two r7 survivors are now killed. |
| C6M1: poll only when `(sleepEnabled && wakeOnPlayback) \|\| idleSleepHours > 0` | **resolved** | `playbackMatters` (:181) gates `pollPlayback` (:192), and it gates `intervalMs` (:63) together with `showNowPlaying`. Cases 3 and 20 assert 0 sessions requests awake and asleep, and the mutant is killed. |
| C6M3: a fetch already in flight when sleep starts is not drawn under the veil | **resolved** | tick re-checks `state.asleep` after `fetchImage` (:118). Neither `display.show` nor `engine.shown` runs, and nothing is logged as shown. Case 21 parks the image request across 01:00 and asserts 0 active layers and Poster "—". The mutant is killed. |

Regression check: between r6 and r8, js/main.js changes only in the three items above, and r8 itself changes only the e2e spec. Every earlier case still passes, so nothing regressed.

## Criterion 6 attacks (each ends asserting `__wakeLock` held 1, releases 0)

- **Offline start (A).** Mock down inside the window: asleep. After the mock comes up, play woke it in 3137 ms.
- **Plex down/up mid-movie (B).** The veil came up 16 s after the outage (K11, 3 failures). Plex up with the movie still playing: awake in 5227 ms.
- **NTP 1970 to 2026 at start-up with a touch in the same second (C).** The schedule and idle sleep were both on. Asleep (schedule) right after the step. A tap then woke it for 60.8 s, and play woke it in 5.3 s.
  - **C2:** a +2 h step during a manual wake, then a tap in the same second. Asleep again after 60.6 s, not 2 h.
- **DST, America/New_York.**
  - **D1 spring-forward:** asleep across 01:58 EST to 03:02 EDT, and play woke it in 3.1 s.
  - **D2:** idle 1 h started 01:30 EST. Awake at 58 min, asleep at 61 min (03:31 EDT), so the idle clock uses epoch time and is not shifted by DST.
  - **D3 fall-back, window 22:00–01:30:** the repeated hour sleeps again, as r6 found (declined there, and still harmless).
- **Settings saved asleep / during a manual wake (E).** A save with the schedule kept returns to sleep 60.4 s later. Builder case 8 covers a save with the schedule off.
- **Manual wake expiring with Settings open (E).** The veil returns while the dialog stays open and usable above it (`{"asleep":true,"open":true}`), Escape closes it, and play wakes the display.
- **Double/triple taps (F).** Three taps 120 ms apart on Pause, Settings and Rotate while asleep: Pause not pressed, Settings not open. Play woke it.
- **401 / 403 on /status/sessions (H), with showNowPlaying on.** Asleep in the window while refused. Once sessions return, play woke it in 5.2 s.
- **Result.** In no attack did the veil stay up after playback started, and the wake lock was never lost.

## UI screenshots

- **Files.** `/home/user/plex-poster-app/.orchestrator/artifacts/sleep-mode--shot-r8-1920x1080-asleep.png` (rotation 0) and `…-1080x1920-asleep.png` (rotation 90, rotateUi on). Both were taken asleep, after a mouse move, which does not reveal anything.
- **Pixels.** PIL counts 0 non-black pixels in each, with extrema (0,0) on all channels.
- **Veil.** The box equals the viewport (0,0,1920,1080 and 0,0,1080,1920) and the background is `rgb(0, 0, 0)`. Wake lock 1/0.

## Strengths

- The fix is one helper, `syncSleepClock()`, called before every write. The comment at that helper states the rule, and each site has a test with teeth.
- `playbackMatters` replaces `sleepWatching` in both places, so the poll cadence and the poll gate cannot drift apart.
- The in-flight guard sits where the race is, and it leaves the engine's notion of "shown" untouched.
- r8 is test-only, as D27 asks.

## Issues

### Critical
None.

### Important
None.

### Minor
None.

## Declined to judge

- **Shipped as is (D23–D25, not findings):** C6M2 (Pause keeps the display awake while paused during a movie), C6M4 (no assistive-tech announcement), K18 (a 401/403 with showNowPlaying on leaves no poster) and K15 (wake fade).
- **DST fall-back repeating a window's last local hour:** ruled harmless in r6. Behaviour is unchanged.
- **A cache-retry path in tick:** a cached blob that fails to decode is downloaded again and drawn, and sleep could start during that second download (main.js:124-127). It is the same race as C6M3 but needs a corrupt cache entry as well. It is far narrower, and D23 scoped C6M3 to the first fetch, so I did not rule on it.

## Recommendations

None blocking. The phase can close on this round.

## Assessment

C6I1, C6M1 and C6M3 are resolved as D23 states. All four clock-step write sites now have regression tests that a mutation shows would catch a regression, which closes D27. Nothing regressed between r6 and r8. The compact criterion 6 attack set passed, and both asleep screenshots are fully black.

Files read: docs/integration-plan.md (sleep-mode section), docs/spec.md (R-PROT-1), docs/decisions.md, .orchestrator/phases/sleep-mode.md, .orchestrator/artifacts/sleep-mode--review-r6.md, .orchestrator/artifacts/sleep-mode--review-cold-r6.md, staged js/main.js (55-372), staged tests/e2e/sleep.spec.mjs (parts), tests/e2e/lib.mjs (parts), scripts/mock-plex.mjs (grep), index.html (grep), the r6..r8 diff.

**Verdict:** APPROVE
