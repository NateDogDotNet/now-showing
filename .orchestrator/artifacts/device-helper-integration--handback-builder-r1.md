produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: medium · phase: device-helper-integration · round: r1
status: complete        failure_class: n/a
paths: js/helper.js, tests/helper.test.js, js/main.js, index.html, css/app.css, sw.js, tests/e2e/helper.spec.mjs (all staged, not committed, in /home/user/wt-device-helper-integration); .orchestrator/questions.md (appended Q-dhi1)
criteria:
1. met: `test -f tests/helper.test.js && node --test tests/helper.test.js` -> 9 tests, 9 pass (first run before js/helper.js existed: 1 fail, module not found)
2. met: `npm test` -> tests 293, pass 293, fail 0
3. met: `E2E_PORT=23120 E2E_MOCK_PORT=23121 npm run test:e2e -- helper` -> PASS helper (7 ok lines; before implementation it failed at the missing "CPU temperature" row); full `npm run test:e2e` exit 0, every spec PASS including smoke and sleep
4. met: `node scripts/check-precache.mjs` -> "29 precached files OK"
5. met: `grep -q 'name="deviceHelper"' index.html && test -f js/helper.js && ! grep -niE 'brightness' js/helper.js` -> exit 0
deviations: none from the brief. Interpretation: with deviceHelper off the page makes NO /__helper/ request at all (not even the boot probe); probes run at boot, when Settings opens, and when Save switches the setting on, only while the setting is on. The e2e spec ignores console errors located at /__helper/ and /config.json (Chromium logs 404 fetches itself). TV_WAKE_MS = 4000 (verify on hardware).
questions: Q-dhi1

Agent: device-helper-integration-builder-r1 · dispatched: 2026-10-11T02:30:33Z

## Design
- js/helper.js: createHelper({fetchImpl, log}) -> probe(), status(), power(on), `available`; relative `__helper/...` URLs, `X-Poster-Helper: 1`, no throws, one log line per kind until a success re-arms it.
- js/main.js: probeHelper(); sleep -> power off after two animation frames with body.asleep set (once per state change, serialized queue); wake -> power on, wait TV_WAKE_MS, then tick (tick is held off by state.tvWaking; a failed power call never blocks); Diagnostics row `CPU temperature: 42.5 °C (thermal_zone0)`, refreshed every 5 s only while the dialog is open (cleared on `close`).
- index.html: `name="deviceHelper"` checkbox + help text in Display protection. sw.js: js/helper.js in SHELL, `/__helper/` pass-through. css/app.css: one `code` rule.

## Command output tails
node --test tests/helper.test.js: # tests 9 / # pass 9 / # fail 0
npm test: # tests 293 / # pass 293 / # fail 0
node tests/e2e/run.mjs helper:
  ok  Diagnostics: CPU temperature: 42.5 °C (thermal_zone0)
  ok  asleep: one power off, after the veil is up, no repeat
  ok  wake: power on, then the poster fetch
  ok  power calls failing: the display still wakes and fetches the poster
  ok  deviceHelper:false: no /__helper/ request, no console error
  ok  no helper: one probe, then silence, no console error
  ok  temperature refreshes only while Diagnostics is open
  PASS helper
npm run test:e2e: exit=0, all PASS lines (brightness ... helper, kiosk, metadata, now-playing, pixel-shift, rotation, sleep, smoke, status, ui-rotation)
git status --short: M css/app.css, M index.html, A js/helper.js, M js/main.js, M sw.js, A tests/e2e/helper.spec.mjs, A tests/helper.test.js
