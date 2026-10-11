produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: pi-stability · round: r3
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/pi-stability.spec.mjs (r2 files css/app.css, index.html, sw.js, tests/e2e/helper.spec.mjs remain staged, untouched this round)
criteria: 1 met (`test -f css/app.css && ! grep -n backdrop-filter css/app.css` exit 0); 2 met (`E2E_PORT=23620 E2E_MOCK_PORT=23621 npm run test:e2e -- pi-stability` PASS, 30 ok lines); 3 met (`npm test` 293 pass / 0 fail); 4 met (grep exit 0); 5 met (`29 precached files OK`, exit 0); full `npm run test:e2e` EXIT 0, every spec PASS; lint with round--eslint-r1e.config.mjs on js/main.js and the spec: no output (clean)
deviations: none. Test (b) lives in pi-stability.spec.mjs (needs a service worker, which helper.spec blocks).
questions: none

Agent: pi-stability-builder-r3 · dispatched: 2026-10-11T06:40:50Z

## Tests first (new cases 9d, 9e, 9f, 9g in pi-stability.spec.mjs)

Failing on r2:
- 9f (PSC1, manual wake across 04:00): `AssertionError: a manual wake is running: the tab navigated  2 !== 1`
- 9g (PSC2, clock set after boot): `AssertionError: the page had been up for two minutes: the tab navigated  2 !== 1`
- 9d and 9e pass on r2 (they pin existing code), so they were run against mutants of r2 in a mktemp copy (removed afterwards):
  - 9d with the `'a poster is fading in'` line deleted: fails (`staysPut` assertion, the tab navigated while the 8000 ms fade ran)
  - 9e with `|| state.tvWaking` removed: `AssertionError: reloaded 2333 ms after power on, before the TV had finished waking (TV_WAKE_MS 4000)`

## Fix (js/main.js)
- `reloadMustWait()`: returns `'a manual wake is running'` while `Date.now() < state.manualWakeUntil` (PSC1).
- `bootAt` is now `let` and `syncSleepClock()` adds the detected jump to it, as for lastPlaybackAt (PSC2).

## After the fix
`npm run test:e2e -- pi-stability` tail: 
  ok  crossfade 8000 ms across 04:00: the reload came 9812 ms after the draw
  ok  manual wake across 04:00: no reload until the 60 s were over
  ok  helper on: power on, then the reload 7560 ms later, after the first poster
  ok  clock set after boot: the wake after the schedule end does not reload
  ... (all other cases ok) ... PASS pi-stability
Full `npm run test:e2e`: ends `PASS ui-rotation` / `EXIT 0`; no FAIL line.
`npm test`: tests 293, pass 293, fail 0.
