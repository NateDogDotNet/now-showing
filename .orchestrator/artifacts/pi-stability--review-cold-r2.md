produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: pi-stability · round: r2 · mode: cold
**Verdict:** APPROVE

Reviewer: pi-stability-review-cold-r2 · Model: claude-opus-5-5 · Dispatched: 2026-10-11T06:24:11Z · Method: cold code review · Scope: pi-stability, r2, HEAD e1b7f07, tree 82fd6a1 (staged index of /home/user/wt-pi-stability)

## What I read and ran

- Read: `git diff --cached` (css/app.css, index.html, js/main.js, sw.js, both specs), and the code it calls or is called by: js/main.js (syncSleepClock, helper/wakeTv/powerOffAfterVeil, evaluateSleep, wake, boot, registerServiceWorker), sw.js fetch handler (lines 40-80), js/sleep.js decideSleep header, js/settings.js defaults (`dailyReload: true`, `dailyReloadTime: '04:00'`), tests/e2e/pi-stability.spec.mjs helpers and runner, package.json, tests/e2e/lib.mjs port lines. I also grepped for other `no-store` callers: js/helper.js:25 (`/__helper/`) and main.js:1111 (`config.json`). The SW already sends both straight to the network, so the new no-store branch changes nothing for them.
- Scratch: `git checkout-index -a --prefix=/tmp/tmp.S8CRtSpu98/src/` from the staged index, with node_modules symlinked. The live worktree was never edited: `git write-tree` still gives 82fd6a1 and status is unchanged. Scratch removed afterwards.
- `npm test` gave 293/293 pass.
- `E2E_PORT=23761 E2E_MOCK_PORT=23762 npm run test:e2e -- pi-stability helper` gave PASS pi-stability (25 checks) and PASS helper (16 checks).
- Mutations in scratch, both reverted by deleting the scratch dir:
  - (a) Removed `if (request.cache === 'no-store') return;` from sw.js. Case 3 then fails with "no-store with the server stopped must reject: {ok:true,status:200}".
  - (b) Removed the `why !== 'manual wake'` guard in evaluateSleep. Case 9c then fails with "a manual wake must not reload 2 !== 1".
  - Both tests have teeth.
- Two repro cases (ZZ, ZY) were added to the scratch copy of the spec only. They are described below.

## Strengths

- Loop guard is sound:
  - The stamp is written and read back before `location.reload()`.
  - Reloads less than 10 minutes apart are refused.
  - After a scheduled reload, a fresh page arms with `reloadDay = today`, so the time it just passed does not re-trigger.
  - After a wake reload, a fresh page has a recent stamp, and evaluateSleep only calls `requestReloadAfterWake` on a transition.
  - A backward clock (`age < 0`) cannot loop because both triggers need a forward edge.
- After the probe the code re-checks the blockers and waits (dialog, busy, fade), so a Settings dialog opened during the probe is respected.
- The SW no-store branch sits after the navigate branch, so offline navigation still falls back to the cached shell (case 3 proves it). Nothing the browser starts on its own is sent with `cache: 'no-store'`.
- Carry key: it is removed on first read, lives 2 minutes, rejects a future `at`, and caps `lastPlaybackAt` at `now`. A normal load restarts the idle clock (14c).
- Unset clock: `reloadArmed` resets while the clock is implausible, so the jump to a real time does not read as 04:00 passing (8b).
- One `setInterval` at module scope; no listener is added per tick or per reload.
- Helper and brightness paths are untouched by the diff, and the helper spec passes. After an automatic reload while asleep, probeHelper re-sends power-off, which is harmless for a TV that is already off.

## Critical

None.

## Important

None.

## Minor

1. **A scheduled reload that comes due during a manual wake cuts that wake short.** (code-bug: it breaks the code's own K39 rationale at main.js:580, "a manual wake would lose its 60 s to the reload". It could also be called a spec-gap, because the claim lists dialog, loading, fading and TV-waking as the wait conditions and does not list manual wake.)
   - Location: js/main.js `reloadMustWait()` (around line 415). It has no check on `state.manualWakeUntil` or on `state.sleepWhy === 'manual wake'`.
   - Reproduction (scratch case ZZ):
     - Settings: `sleepSeed()` (asleep by schedule), clock 03:59:20, `lastReload` 24 h old.
     - Press a key at 03:59:21: manual wake, poster shown.
     - Advance 50 s.
     - Output: `navs=2 asleep=true`. Diagnostics log: `4:00:02 AM Asleep (schedule)`.
     - The 60 s wake that should run to 04:00:21 ended at about 04:00:01, because `manualWakeUntil` is not carried across the reload.
   - Why it matters: a person who taps the dark screen in the minute before the reload time loses the screen about 20 s later. This happens at most once a day and never strands the display.
   - Fix: return `'a manual wake is running'` from `reloadMustWait()` while `Date.now() < state.manualWakeUntil`. The reload stays pending and runs once the wake ends.

2. **`bootAt` is taken from the wall clock before NTP sets it, so the first non-manual wake after a boot with no RTC reloads right away.** (code-bug: the reload fires at the wrong time after a clock jump.)
   - Location: js/main.js `const bootAt = Date.now()` and `requestReloadAfterWake()`. With no stored `lastReload` it falls back to `bootAt`. `syncSleepClock()` shifts `lastPlaybackAt` and `manualWakeUntil` by a detected jump but does not shift `bootAt`.
   - Reproduction (scratch case ZY):
     - Settings: `sleepSeed()`, clock 1970-01-01 06:58, no `lastReload`.
     - Page load, then `page.clock.setSystemTime('2026-01-05T06:59')`, which moves the wall clock without moving performance.now, as NTP would. The page sleeps by schedule.
     - Jump to 07:00:05, the schedule end.
     - Output: `navs=2 lastReload=1767596410291` (07:00:10). The page had been up about 2 minutes, not 12 h.
   - Why it matters: one extra reload per power-cycle at the next schedule-end or playback wake. It does not loop, because the stamp is then written from a plausible clock. Low impact, but it is exactly the clock-jump case the guard is meant to cover.
   - Fix: add the detected jump to `bootAt` in `syncSleepClock()`, or set `bootAt` lazily the first time `isPlausibleClock` is true.

## Declined to judge

- Server returning 5xx between a successful probe and the reload navigation: the SW navigate branch (pre-existing, outside the diff) passes a 5xx response through instead of falling back. The window is milliseconds after an OK probe, and that branch was not changed.
- `AbortSignal.timeout?.()`: on a browser without it, a hung probe would leave `reloadChecking` true for the life of the page. Kiosk Chromium has had the API since version 103. This is a platform-support question.
- Two reloads in one day when the user moves `dailyReloadTime` later after today's reload has run: the user changed the setting, so this is a product question.
- Carry left in sessionStorage by a reload that never completes, then read by a manual load within 2 minutes: the effect is that the idle clock is kept instead of restarted. That is benign and needs a crash in a narrow window.

## Recommendations

Fix Minor 1 (one line in `reloadMustWait`) and Minor 2 (shift `bootAt` by the jump), each with a spec case modelled on ZZ and ZY above. Neither blocks approval: neither can strand the display or cause a loop.

## Assessment

The change does what it claims. Every stranding and loop path I attacked is closed and covered by a test that fails under mutation:
- no SW control
- probe 404, 503 or no answer
- unset clock
- dialog, busy or fade
- gap guard
- manual-wake trigger
- SW update reload
- update timer without a registration

The two remaining issues are timing edge cases that each cost at most one superfluous or ill-timed reload.

Files read: `git diff --cached` of /home/user/wt-pi-stability; js/main.js (excerpts 360-620, 960-990, 1080-1185); sw.js 40-80; js/sleep.js (grep); js/settings.js (grep); js/helper.js, js/brightness.js, js/display.js (grep lines only); tests/e2e/pi-stability.spec.mjs (helpers, cases 9c and 10, runner); tests/e2e/lib.mjs and run.mjs (port grep); package.json. Directory listing of .orchestrator/artifacts (names only, no files opened).

**Verdict:** APPROVE
