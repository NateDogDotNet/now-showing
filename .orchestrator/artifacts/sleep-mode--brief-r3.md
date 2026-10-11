# Brief — sleep-mode r3 (re-dispatch 2)

Agent name: sleep-mode-builder-r3 · effort: high · worktree `/home/user/wt-sleep-mode` (r2 staged, tree 77062d2). The r1 and r2 briefs bind; docs/decisions.md D4, D21 (K7, K9) bind. E2E_PORT=18840 E2E_MOCK_PORT=18841. Stage, do not commit. Touch only the phase Outputs (js/sleep.js, tests/sleep.test.js, js/engine.js, tests/engine.test.js, js/main.js, index.html, css/app.css, sw.js, tests/e2e/sleep.spec.mjs).

Fix exactly the r3 items in `.orchestrator/phases/sleep-mode.md` → "Step 7 triage — r2" (the reviews are `artifacts/sleep-mode--review-r2.md` anchored and `artifacts/sleep-mode--review-cold-r2.md` cold). For every item with a test, write the test first and paste it failing on the r2 code.

1. AI1 — swallow clicks until ~800 ms after the LAST pointer press that happened while asleep or during the swallow window (not one click). e2e: touch double tap and triple tap on the Pause button's position while asleep → Pause stays off and `mock.play()` still wakes the display.
2. CI1 + K11 — a failed `/status/sessions` poll (network error, 401, 403, 5xx) is never fatal and never stops rotation; it leaves `state.playing` unchanged and does not refresh `lastPlaybackAt`. e2e: sessions forced to 403 with sleep (idle 1 h) on and now-playing off → posters still rotate; a single failed poll mid-playback does not raise the veil.
3. CI2 + K12 — never swallow a pointer/key event whose target is inside an open `<dialog>`; any pointer/key activity during a manual wake (inside dialogs too) restarts the 60 s. e2e: 70 s of activity in Settings keeps the display awake and a checkbox click toggles.
4. K13 — page load and every settings save restart the idle-sleep clock. e2e (or unit, where the logic lives): enabling idleSleepHours 0→1 after 2 h of no playback does not sleep at once; it sleeps one hour later.
5. K14 — while asleep the playback poll retries no slower than nowPlayingPollSeconds (not the up-to-5-min backoff). e2e: a 3-min Plex outage while asleep, then mock.play() → awake within ~one nowPlayingPollSeconds.
6. CM2/AM5 — one `/status/sessions` request per tick when awake with sleep configured and showNowPlaying on (count with page.on('request')).
7. CM3 — no tick() on a sleep/wake transition while paused.
8. CM1 — e2e: while asleep no cached poster is drawn (must fail if `&& !state.asleep` is removed at the cached-poster guard).
9. CM5 — veil `aria-hidden="true"`; `#app` gets `inert` while asleep (top-layer dialogs stay usable).
Do NOT add a wake fade (K15 is an open product question).

Criteria 1–5 must still pass; paste them. Lint with `/home/user/plex-poster-app/.orchestrator/artifacts/round--eslint-r1e.config.mjs`. Do not write mutation records into .orchestrator/artifacts. If the e2e run gets long, keep each new case's simulated time short with page.clock.

Handback `/home/user/plex-poster-app/.orchestrator/artifacts/sleep-mode--handback-builder-r3.md` — FIRST line `produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: sleep-mode · round: r3`, header fields, blank line, `Agent: sleep-mode-builder-r3 · dispatched: <stamp>`.
