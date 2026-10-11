produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: settings-sheet · round: r2
status: complete        failure_class: n/a
paths: tests/e2e/lib.mjs, tests/e2e/settings-sheet.spec.mjs (r2 edits); staged from r1 and untouched this round: css/app.css, index.html, js/duration.js, js/main.js, js/plex.js, js/settings-ui.js, js/util.js, scripts/mock-plex.mjs, sw.js, tests/duration.test.js, tests/plex.test.js, tests/e2e/first-run.spec.mjs
criteria: 1 met (`test -f tests/plex.test.js && test -f tests/duration.test.js && node --test tests/plex.test.js tests/duration.test.js`, exit 0) · 2 met (`npm test`, exit 0) · 3 met (`npm run test:e2e -- settings-sheet`, 22 cases, exit 0) · 4 met (`npm run test:e2e -- first-run`, 12 cases, exit 0) · 5 met (grep, exit 0) · 6 met (`node scripts/check-precache.mjs`: 30 precached files OK) · 7 met (grep chain, exit 0) · 8 met (`git status --porcelain` probe empty, exit 0) · full `npm run test:e2e` run twice in a row: both exit 0 (102 PASS lines each, no FAIL) · lint (eslint with round--eslint-r1e.config.mjs) on every staged JS file plus lib.mjs: exit 0
deviations: (1) K48's default plex.tv stub is installed only when the seed has no `plexToken` (see Item 2 below for why a blanket stub is not possible). (2) Items 3(a) and 3(b) are NOT fixed, because the fix belongs in brightness.spec.mjs and helper.spec.mjs (outside Output); exact changes are described below. Both specs passed in both full runs and in about 20 standalone runs, so the race stayed latent; I did not catch either failure again (see the evidence limits below).
questions: none

Agent: settings-sheet-builder-r2 · dispatched: 2026-10-11T08:31:54Z

## Item 1 — lint
Removed the unused `const isOpen = …` line from tests/e2e/settings-sheet.spec.mjs (nothing referenced it).
`eslint -c …/round--eslint-r1e.config.mjs <every staged .js/.mjs> tests/e2e/lib.mjs` → exit 0.

## Item 2 — K48 (tests/e2e/lib.mjs)
What `withApp` does now:
- `stubPlexTv(context)`: a `context.route('https://plex.tv/**')` registered before the page exists. POST `/api/v2/pins` → code `STUB`, 900 s, never approved; GET `/api/v2/pins/*` → `authToken: null`; `/api/v2/resources` → `[]`; anything else → 404. Playwright tries the newest route first, so a spec's own `context.route` (first-run, settings-sheet) overrides it. Both specs pass unchanged.
- `guardNetwork(context)`: `context.on('request')` records every http(s) request whose host is not 127.0.0.1 / localhost / [::1], and any plex.tv request when no plex.tv route exists. `context.route` is wrapped only to note that a plex.tv route was installed (default or the spec's). After the callback returns, `guard.assertClean()` throws `the spec reached beyond the local servers (K48): …` listing the requests.
- Guard probe (scratch script, real lib): unconfigured page → clean, card shows `STUB`; configured, nothing external → clean; configured page fetching plex.tv with no route → `FAILS: … POST https://plex.tv/api/v2/pins`; configured + the spec's own plex.tv route → clean; page fetching https://example.com → `FAILS: … GET https://example.com/`.

Why the stub is conditional (found by running the suite): my first version installed the stub for every context. The first full run then failed `pi-stability` (`no-store with the server stopped must reject: {"ok":true,"status":200}` and three "the tab navigated" cases). With HEAD's lib.mjs the same spec passes (checked back to back). Any `context.route` turns on Playwright's request interception, which changes HTTP-cache and service-worker behaviour, and pi-stability (serviceWorkers 'allow') depends on both. A page with a token never reaches plex.tv on load (`firstRunWanted()` requires `!isConfigured`), so a context whose seed has `plexToken` gets no route. Only a token-less seed (smoke, the unconfigured specs) gets the stub; those are the specs that made the real POST. After the change `pi-stability`, `smoke`, `first-run`, `settings-sheet` pass, and so does the full suite.

## Item 3 — root causes of the two full-suite failures
First answer: item 2 does NOT remove them. brightness and helper both seed `plexToken` + `serverUrl` + `libraryKey`, so the page is configured and never starts the plex.tv code flow. The real plex.tv POST was not in those specs. The cause is in Playwright's fake clock (playwright-core 1.56.1, `lib/generated/clockSource.js`), which both specs drive on a flowing clock.

Mechanism: `install({time})` leaves the clock running in real time (`_realTime`), and a background real-time loop calls `_syncRealTime()` + `_runTo()`. `_callFirstTimer` awaits a real `setTimeout` macrotask after every timer callback, so that loop interleaves with the test's own `runFor` / `pauseAt`. `_advanceNow(to)` assigns, it does not take a max, so a stale `to` (or an already-due `timer.callAt`) moves `ticks` and `Date.now()` BACKWARDS.

Evidence, with the limits stated:
- Page with `setInterval(…, 3)`, clock installed at 21:58:30, `pauseAt(21:59:00)`: the paused clock sat at about 21:58:30 (offset −29.7 s) in 25 of 25 tries; with no timers, offset 0 in 25 of 25.
- The real app page (idle machine), 120 × `runFor(250)` + 30 ms wait, with a page-side sampler (setInterval 20 ms + rAF) recording `Date.now()`: it went backwards 128 times, worst 18 ms, in 3739 samples. Under load the amount grows with the real time spent in the macrotask gaps.
- I could NOT reproduce either spec failure in the app: the brightness ramp setup (install 21:58:30, wait for posters, `pauseAt(21:59:00)`) was off-target 0 of 72 times (24 plain, 48 under 8 CPU burners on 4 cores); the helper wake case gave 24 of 24 passes under 8 burners, with `poster − onAt` from 4138 to 4852 ms. So the mechanism is demonstrated and the signatures match, but the two actual failures were not captured again. Treat it as the identified, unproven-in-the-app cause.

(a) brightness `22:01: 1 vs 0.96` (minute-ramp case): ramp-in does `clock: { time: 21:58:30 }` (flowing), then `page.clock.pauseAt(21:59:00)`. If a real-time `_runTo` is in flight when `pauseAt` runs, its closing `_advanceNow(stale)` rewinds the paused clock to about 21:58:3x. Everything after is shifted by the rewound amount (about 30 s here). Then `runFor(60000)` lands on 21:59:3x, so k=0 still reads 1 (correct by luck), and k=1 reads at 22:00:3x, which is still the 22:00 step: `22:01: 1 vs 0.96`. That is exactly the reported message. The app is not at fault: `display.setBrightness` is synchronous and the timer is aligned to the minute boundary.
Fix (brightness.spec.mjs, ramp-in and ramp-out cases; outside my Output): replace the bare `await page.clock.pauseAt(T)` with a checked pause:
```js
async function pauseAtExactly(page, time) {
  for (let i = 0; i < 5; i++) {
    await page.clock.pauseAt(time).catch(() => {}); // "Cannot fast-forward to the past" if it overshot
    await page.waitForTimeout(100); // let any in-flight real-time tick finish
    if ((await page.evaluate(() => Date.now())) === time.getTime()) return;
  }
  assert.fail('the fake clock would not pause at ' + time.toISOString());
}
```
It would be better still for lib.mjs to export it. I did not add it, because the plan names no such helper.

(b) helper `3915 ms vs TV_WAKE_MS 4000` (wake-timing case): `onAt` is `Date.now()` sampled inside the page's `fetch` wrapper at the moment the on:true call is made, on a flowing clock, so it can be a transient value that is AHEAD of the timeline the TV_WAKE_MS timer is counted on. The next timer callback rewinds `ticks` (the 128 backward steps above). `posterAt` is read after a later step. `posterAt − onAt` is then short by that transient lead (tens of ms idle, hundreds under load), while a normal run only has 138–850 ms of slack (fetch latency plus the rest of a 250 ms step). The app is correct: `wakeTv()` starts the 4000 ms timer after the power-on request resolves.
Verification of the fix in a scratch copy: freezing the clock before the wake. With `const t = await page.evaluate(() => Date.now()); await page.clock.pauseAt(t + 500);` placed after the `advanceUntil(… helperCalls …)` line and before `mock.play('3')`, 24 runs under 8 CPU burners gave `poster − onAt` of exactly 4000 or 4250 ms every time, never below 4000. The unfrozen control gave 4138–4852 (no failure, as above). Use `t + 500`, not `t + 1`: with `t + 1` the clock has already moved past it and pauseAt throws "Cannot fast-forward to the past".
Fix (helper.spec.mjs, case 7 and the shared `wakeSequence` cases 12 and 13; outside my Output): add that freeze (via the same checked `pauseAtExactly`, with the target = current time + 500) after `waitAsleep` / the first `helperCalls` wait, before the wake is triggered. The loop already steps with `runFor`, so nothing else changes and the 4000 lower bound becomes exact.

## Item 4 — final runs (worktree /home/user/wt-settings-sheet, E2E_PORT=24020 E2E_MOCK_PORT=24021)
Criteria 1–8, all exit 0 (tails):
```
criterion 1 exit 0   (# todo 0 / # duration_ms 551)
criterion 2 exit 0   (# todo 0 / # duration_ms 6216)
criterion 3 exit 0   all 22 settings-sheet cases passed / PASS settings-sheet
criterion 4 exit 0   all 12 first-run cases passed / PASS first-run
criterion 5 exit 0
criterion 6 exit 0   30 precached files OK
criterion 7 exit 0
criterion 8 exit 0
lint=0
```
Full `npm run test:e2e`, run 1 and run 2 back to back with the final tree:
```
run 1: …  PASS ui-rotation   exit1=0   (102 PASS lines, 0 FAIL)
run 2: …  PASS ui-rotation   exit2=0   (102 PASS lines, 0 FAIL)
```
(An earlier full run with the unconditional stub failed pi-stability, as described in Item 2; it was killed, fixed and the two runs above were started fresh afterwards.)

`git status --short` (everything staged, nothing committed): M css/app.css, M index.html, A js/duration.js, M js/main.js, M js/plex.js, M js/settings-ui.js, M js/util.js, M scripts/mock-plex.mjs, M sw.js, A tests/duration.test.js, A tests/e2e/first-run.spec.mjs, M tests/e2e/lib.mjs, A tests/e2e/settings-sheet.spec.mjs, M tests/plex.test.js.
Scratch probes and the copy of the tree used to verify the helper fix live in /tmp/tmp.gUV09d5pbz and /tmp/tmp.FidpQB97x6 (outside the repo).
