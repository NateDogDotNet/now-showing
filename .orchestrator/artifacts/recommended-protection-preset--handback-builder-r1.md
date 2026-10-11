produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: recommended-protection-preset · round: r1
status: complete        failure_class: n/a
paths: index.html, css/app.css, js/settings-ui.js, js/main.js, tests/e2e/preset.spec.mjs, tests/e2e/smoke.spec.mjs (all staged in /home/user/wt-recommended-protection-preset, not committed)
criteria:
1. met: `E2E_PORT=25020 E2E_MOCK_PORT=25021 npm run test:e2e -- preset` -> PASS preset (list of 8 keys, stage row untickable, Cancel changes nothing, Apply+Save persists, maxContentRating 'R' and '' kept, limitNowPlaying/idleSleepHours 0/plexToken/serverUrl/libraryKey unchanged, unticked row keeps value)
2. met: same command (toast once, not after reload, Open settings scrolls to Display protection, PIN gate honoured, unconfigured never shows, marker present shows nothing)
3. met: `test -z "$(git status --porcelain -- js/settings.js sw.js)"` -> exit 0
4. met: `npm test` 327 pass / 0 fail; `npm run test:e2e` (full, every spec PASS, exit 0); `node scripts/check-precache.mjs` -> "31 precached files OK" (run as three commands in sequence on the worktree, not the merged tree)
5. met: `npm run test:e2e -- sleep pixel-shift kiosk brightness helper content-rating pi-stability` -> all PASS, exit 0
6. narrated, see below
deviations: none. Control-labels option labels shortened to "Auto" / "Always" / "Never (icons only)" (touch-and-labels r3 item); touch-controls.spec only matches on the select name, still passes.
questions: none (design readings listed under Notes)

Agent: recommended-protection-preset-builder-r1 · dispatched: 2026-10-11T19:15:08Z

## RED then GREEN
Before implementing: `npm run test:e2e -- preset` -> AssertionError at `assert.ok(await page.locator('#preset-btn').isVisible())`, `FAIL preset`.
After: PASS preset (10 ok lines: list/Cancel; Apply+Save with 'R'; with ''; unticked rows; fieldset placement; toast once; Open settings at fieldset; PIN gate; unconfigured; marker present).

## K59 (smoke 'clock install + runFor')
Now `page.clock.pauseAt('2026-01-05T03:59:40')`, two reads asserted equal (checked pause), t0 = that read, runFor(60000), assertion kept (>= 60000 and < 62000). 3 normal smoke runs PASS. Then 20 runs of the same case with all 4 CPUs saturated by busy loops: `pass=20/20 (cpus loaded: 4)`.

## Criterion 6 narrated scenario (observed, scratch script, dedicated server, fake clock, viewport 1080x1920)
Settings: rotation 90, kioskMode on, pixelShift on (1 min), sleep 01:00-07:00, nightDim 60 stage, clock at 03:00.
- At load: asleep true, veil shown, controls hidden, 0 posters, stage transform identity.
- After 70 s simulated asleep: still asleep, veil up, but the stage transform had moved (matrix(0,1,-1,0,-335,-523.5)): the pixel-shift timer keeps running under the veil.
- mock.play('3'): within a few simulated seconds asleep false, veil hidden, 1 active poster, stage keeps the shifted offset; stage box l=32.5 t=625 w=1047 h=670 inside the 1080x1920 viewport (rotated, nothing off screen). Controls stay hidden in kiosk (idle, inert, opacity 0).
Not exercised: real Pi/hardware.

## Notes (readings, no behaviour beyond the plan)
- The confirm list is an inline panel in the Display protection fieldset (#preset-panel), not a second dialog; all 8 keys are listed each with "now X" / "already set"; Apply sets ticked rows via 'change' events so night-dim live preview follows; Cancel/closing the sheet discards.
- Marker `plexPoster.whatsNew` is written ('2.1') on the first boot without it, also when unconfigured (a fresh install is not an upgrade, so it will not show later either). Toast: "What's new in 2.1: one-tap display protection for always-on screens." with Open settings, 20 s; the action calls the normal requestSettings (PIN gate) with section 'protection'.
- Preset constants: `PROTECTION_PRESET` exported from js/settings-ui.js.
- Defaults already have pixelShift/dailyReload true, so the preset only really changes those when a user turned them off.
