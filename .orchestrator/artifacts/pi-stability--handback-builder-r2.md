produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: pi-stability · round: r2
status: complete        failure_class: n/a
paths: js/main.js, tests/e2e/pi-stability.spec.mjs (both re-staged in /home/user/wt-pi-stability, not committed; css/app.css, index.html, sw.js, tests/e2e/helper.spec.mjs are the r1 staged files, unchanged this round)
criteria:
  1. met — `test -f css/app.css && ! grep -n 'backdrop-filter' css/app.css` → exit 0
  2. met — `E2E_PORT=23620 E2E_MOCK_PORT=23621 npm run test:e2e -- pi-stability` → PASS, exit 0 (25 cases, now including 2b x2 and 9c)
  3. met — `npm test` → 293 pass, 0 fail
  4. met — `grep -q 'name="dailyReload"' index.html` → exit 0
  5. met — `grep -q 'no-store' sw.js && node scripts/check-precache.mjs` → "29 precached files OK", exit 0
  full suite: met — `E2E_PORT=23620 E2E_MOCK_PORT=23621 npm run test:e2e` → every spec PASS, no FAIL line, exit 0
  lint: met — `npx eslint -c .orchestrator/artifacts/round--eslint-r1e.config.mjs js/main.js sw.js tests/e2e/pi-stability.spec.mjs tests/e2e/helper.spec.mjs` → no output, exit 0
deviations: (a) Item 1 cannot be pasted "failing on r1": r1 already contains `if (!res.ok)`, so case 2b PASSES on r1 code; its value is that it kills the conductor's mutant (shown below). (b) The 503/404 is served by a small pass-through proxy the spec starts in front of the dedicated app server, not by context.route / page.route: Playwright 1.56 does not route the probe (a controlled page's `cache:'no-store'` fetch falls through sw.js to the browser's network stack; only the worker's install-time fetch reached route(), checked by logging). Chromium also sends no Cache-Control header for `cache:'no-store'`, so the proxy keys on "non-navigation request for /index.html after the flag is set". No new dependency; no file outside Output.
questions: none

Agent: pi-stability-builder-r2 · dispatched: 2026-10-11T06:04:27Z

## What changed (r2 only)

- js/main.js `evaluateSleep`: `if (!asleep && why !== 'manual wake') requestReloadAfterWake();` (K39). A wake that ends sleep (schedule end, playback, idle cleared) has `why === ''` and still asks for the reload. Doc comment on `requestReloadAfterWake` updated. Nothing else touched.
- tests/e2e/pi-stability.spec.mjs:
  - 2b (x2, status 503 and 404): the page is opened through `flakyFront(app)`, a pass-through http proxy to the dedicated app server. After the page is controlled, a poster is shown and the shell is cached, the proxy answers the probe with the status. Asserts: no navigation over 90 simulated s; the proxy saw >= 1 probe (so the test cannot pass vacuously); a logged `Daily reload skipped: the server answered HTTP <status>`; Diagnostics `Daily reload: skipped (the server answered HTTP <status>)`; `lastReload` not written; no pageerror.
  - 9c (K39): fake clock 05:00 asleep (01:00-07:00 schedule), `lastReload` 13 h old. Key press → awake; +30 s: no reload and still awake; +40 s more: asleep again (the 60 s wake ran its course), no reload, `lastReload` untouched; jump to 07:00:05 → exactly one reload, then none; `lastReload` refreshed; no pageerror.
  - imports: `createServer`, `request` from node:http and `freePort` (already exported by lib.mjs, not edited).

## Red / mutant evidence

```
Item 2 (K39), case 9c against r1 code (before the js/main.js change):
case 9c manual wake with lastReload 13 h old -> ... failed:
AssertionError [ERR_ASSERTION]: a manual wake must not reload
2 !== 1
FAIL pi-stability

Item 1, case 2b against r1 code: PASS (the guard exists). Against the conductor's mutant (mktemp clone, `if (!res.ok) why = ...` removed):
case 2b probe answered HTTP 503: ... failed:  AssertionError: probe answered 503: the tab navigated   2 !== 1
case 2b probe answered HTTP 404: ... failed:  AssertionError: probe answered 404: the tab navigated   2 !== 1
FAIL pi-stability

K39 mutant (mktemp clone, `why !== 'manual wake'` removed again), E2E_PI_ONLY='^9':
  ok  wake with lastReload newer than 12 h: no reload
  ok  wake with lastReload older than 12 h: one reload, then none
case 9c ... failed:  AssertionError: a manual wake must not reload   2 !== 1
FAIL pi-stability
```

## Green runs

```
$ E2E_PORT=23620 E2E_MOCK_PORT=23621 npm run test:e2e -- pi-stability   (tail)
  ok  probe answered 404 (1x): no reload; log "4:00:01 AM  Daily reload skipped: the server answered HTTP 404"; Diagnostics "skipped (the server answered HTTP 404)"
  ok  probe answered 503 (1x): no reload; log "4:00:01 AM  Daily reload skipped: the server answered HTTP 503"; Diagnostics "skipped (the server answered HTTP 503)"
  ok  server down at 04:00: no reload; log "4:00:00 AM  Daily reload skipped: the server did not answer"; ...
  ok  wake with lastReload older than 12 h: one reload, then none
  ok  wake with lastReload newer than 12 h: no reload
  ok  manual wake: no reload, 60 s wake ran; schedule end: one reload
  (all other r1 cases ok)
PASS pi-stability          exit 0
$ npm test → # tests 293  # pass 293  # fail 0
$ grep -q 'name="dailyReload"' index.html → exit 0
$ grep -q 'no-store' sw.js && node scripts/check-precache.mjs → 29 precached files OK, exit 0
$ E2E_PORT=23620 E2E_MOCK_PORT=23621 npm run test:e2e   (full)
  PASS brightness / cache-first / content-rating / display-decode / helper / kiosk / metadata / now-playing /
  pi-stability / pixel-shift / rotation / sleep / smoke / status / ui-rotation   exit 0, no FAIL line
$ git status --short
M  css/app.css  M  index.html  M  js/main.js  M  sw.js  M  tests/e2e/helper.spec.mjs  A  tests/e2e/pi-stability.spec.mjs
```

Scratch: the mutation clone (mktemp) was removed. Earlier-round leftovers I could not delete (/tmp/tmp.7qbVtMf7BD, /tmp/claude-0/dbg) are outside the repo.
