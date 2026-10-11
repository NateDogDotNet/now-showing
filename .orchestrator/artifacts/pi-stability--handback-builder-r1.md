produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: pi-stability · round: r1
status: complete        failure_class: n/a
paths: css/app.css, js/main.js, index.html, sw.js, tests/e2e/pi-stability.spec.mjs, tests/e2e/helper.spec.mjs (all staged in /home/user/wt-pi-stability, not committed); also appended Q-ps1..Q-ps4 to /home/user/plex-poster-app/.orchestrator/questions.md
criteria:
  1. met — `test -f css/app.css && ! grep -n 'backdrop-filter' css/app.css` → exit 0
  2. met — `E2E_PORT=23620 E2E_MOCK_PORT=23621 npm run test:e2e -- pi-stability` → PASS (3 consecutive runs, ~23 s each, plus the final run below)
  3. met — `npm test` → 293 pass, 0 fail
  4. met — `grep -q 'name="dailyReload"' index.html` → exit 0
  5. met — `grep -q 'no-store' sw.js && node scripts/check-precache.mjs` → "29 precached files OK", exit 0
  full suite: met — `E2E_PORT=23620 E2E_MOCK_PORT=23621 npm run test:e2e` → every spec PASS, no FAIL line (13m07s), including pi-stability, helper (now with the two DHM2 cases), sleep, smoke, kiosk, content-rating
deviations: none from the brief. Readings built on are in questions Q-ps1..Q-ps4 (manual-wake reload, no-lastReload baseline, extra waits for crossfade / TV wake / any open dialog, --panel .98 applies everywhere and the Diagnostics "Service worker" row text changed). Leftover scratch I could not delete (rm refused by the safety check): /tmp/tmp.7qbVtMf7BD (mutation clone) and /tmp/claude-0/dbg (debug scripts). Both are outside the repo.
questions: Q-ps1, Q-ps2, Q-ps3, Q-ps4

Agent: pi-stability-builder-r1 · dispatched: 2026-10-11T05:17:50Z

## What changed

- css/app.css: `backdrop-filter` removed from `.sheet` (no rule uses it now); `--panel` .94 → .98; `overscroll-behavior: none` on `html, body`; `::backdrop` darkening untouched.
- sw.js: after the navigation branch, `if (request.cache === 'no-store') return;` so a no-store request goes to the network with no `caches.match`. Navigations keep their cached-shell fallback; other same-origin GETs stay cache-first. SHELL and VERSION unchanged.
- index.html: `name="dailyReload"` checkbox, `name="dailyReloadTime"` time input and a help line in the Display protection fieldset (bound by name; js/settings.js untouched).
- js/main.js:
  - Daily reload section. A 1 s `dailyReloadTick` notices `dailyReloadTime` passing (never one that had already passed when the page loaded or the clock was set). A wake from sleep with `plexPoster.lastReload` older than 12 h also asks for a reload (`requestReloadAfterWake`, called from `evaluateSleep`).
  - `runDailyReload` guards:
    - Setting on, plausible clock, persistent storage, and `navigator.serviceWorker.controller` set; otherwise it skips and logs `Daily reload skipped: <reason>`.
    - It waits (stays pending) while any `dialog[open]`, `state.busy`, `state.tvWaking`, or within `crossfadeMs + 250` ms of the last draw.
    - It refuses a reload under 10 min after `lastReload`.
    - It probes `fetch('index.html', {cache:'no-store'})` with a 5 s abort. A failed probe skips with a reason.
    - It re-checks the waits after the probe, writes `lastReload` and reads it back, then reloads.
  - `reloadAutomatically()` writes `{lastPlaybackAt, at}` to sessionStorage, then reloads. The daily reload and the service-worker `controllerchange` reload both use it. `takeCarriedPlayback()` reads it once at module start (valid for 2 min), and `applySettings` takes `restartIdle: false` at boot only when something was carried. A normal load or a Save still restarts the idle clock (K13).
  - Diagnostics rows: `Service worker: controlling|none`, `Secure context: yes|no`, `Daily reload: active | skipped (<reason>)`.
  - K16 root cause: with service workers blocked, Playwright's `register()` resolves with `undefined`, so the 6 h timer did `undefined.update()` and threw `TypeError: Cannot read properties of undefined (reading 'update')` out of the fake clock's `fastForward` / `runFor` at +6 h. Fix: `if (!reg) return;` plus a try/catch around `reg.update().catch(...)` inside the timer.
- tests/e2e/pi-stability.spec.mjs (new; every case has its own dedicated server, `serveArgs: []`, service workers allowed except where a case blocks them, `pixelShift: false`; 4 cases run side by side to fit the 180 s limit; covers every criterion-2 case plus K16 and C8M3):
  - 1 reload at 04:00 (navigation counter in sessionStorage), `lastReload` written, no loop, settings persist, `paused` cleared
  - 2 app server stopped (`app.stop()`) → no reload, logged skip, Diagnostics `skipped (...)`
  - 3 no-store rejects with the server stopped and resolves ok with it running; ordinary `fetch('index.html')`, `fetch('js/util.js')` and `page.reload()` still succeed from the cache
  - 4 service workers blocked → no reload, logged skip, `Service worker: none`
  - 5 Diagnostics rows, plus `Secure context: no` via an `isSecureContext` override
  - 6a/6b Settings / Diagnostics open → none until closed, then one
  - 7 a held poster download across 04:00 (busy) → none until released
  - 8a `dailyReload:false`, 8b clock at 1970 → none
  - 9a/9b wake with `lastReload` 13 h / 1 h old
  - 10a/10b `lastReload` 5 / 11 min old
  - 11 `overscroll-behavior` computed `none` on html and body
  - 12 Settings controls persist through Save
  - 13a/13b K16 (+6 h 1 min, blocked / allowed), no pageerror
  - 14a/14b/14c C8M3: daily reload and the service-worker update reload keep the remaining idle time (asleep ~04:50, not ~05:00); a normal reload restarts the clock (K13)
- tests/e2e/helper.spec.mjs (DHM2/K38): cases 12 (key press while asleep) and 13 (schedule end 07:00) with `deviceHelper` on. Each asserts the call order `display off, display on, poster` and that the poster fetch lands 4000..6250 ms after the power-on request.

## Red phase (spec written first, run against the unmodified app) — tails

```
$ E2E_PORT=23620 E2E_MOCK_PORT=23621 E2E_PI_WORKERS=… npm run test:e2e -- pi-stability     (before any app change)
case 3 no-store reaches the network; …  AssertionError: no-store with the server stopped must reject: {"ok":true,"status":200}
case 5 Diagnostics: Daily reload active…  + actual undefined / - expected 'active'
case 5b Secure context no                  undefined !== 'no'
case 1 reload at 04:00; …                  no reload within 60000 simulated ms (navigations 1)
case 4 no service worker control …         + 'not active' / - 'none'
case 2 app server stopped before 04:00 …   a skip reason is logged: ["4:00:30 AM  Could not reach Plex (network or CORS error)."…
case 6a / 6b                               no reload within 20000 simulated ms (navigations 1)
case 9a wake … 13 h old                    no reload within 40000 simulated ms (navigations 1)
case 7 … busy                              no reload within 30000 simulated ms (navigations 1)
case 11 html and body …                    { body: 'auto/auto', html: 'auto/auto' } vs none/none
case 12 Settings has dailyReload …         0 !== 1
case 13a K16 …                             clock.fastForward: TypeError: Cannot read properties of undefined (reading 'update')
                                               at http://127.0.0.1:…/js/main.js:951:29
case 10a lastReload 5 min ago              refusal logged: ["3:59:30 AM  Showing \"The Grand Marquee\" (rotation)"]
case 14a / 14b                             no reload within … simulated ms (navigations 1)
FAIL pi-stability
```

## Green runs

```
$ (criterion 1) test -f css/app.css && ! grep -n 'backdrop-filter' css/app.css          → exit 0
$ E2E_PORT=23620 E2E_MOCK_PORT=23621 npm run test:e2e -- pi-stability                    (tail)
  ok  no-store rejects with the server stopped, resolves ok with it running; ordinary fetch and reload served from the cache
  ok  Diagnostics: Daily reload: active · Secure context: yes · Service worker: controlling
  ok  Diagnostics: Secure context: no · Service worker: none · Daily reload: skipped (...)
  ok  reload at 04:00 (31265 ms after 03:59:30), lastReload written, paused cleared, settings persisted, no loop
  ok  no controller: no reload; log "4:00:00 AM  Daily reload skipped: no service worker controls this page (it needs https or localhost)"
  ok  server down at 04:00: no reload; log "4:00:00 AM  Daily reload skipped: the server did not answer"; Diagnostics "skipped (the server did not answer)"
  ok  Settings open at 04:00: no reload; one after Cancel
  ok  Diagnostics open at 04:00: no reload; one after close
  ok  04:00 passes with a poster download in flight: no reload until it finishes, then one
  ok  dailyReload:false: no reload
  ok  clock at 1970: no reload
  ok  wake with lastReload older than 12 h: one reload, then none
  ok  html and body: overscroll-behavior none
  ok  wake with lastReload newer than 12 h: no reload
  ok  lastReload 11 minutes ago: the reload happens
  ok  Settings: dailyReload checkbox and time, persisted by Save
  ok  second reload within 10 minutes refused; log "4:00:00 AM  Daily reload skipped: the last reload was less than 10 minutes ago"
  ok  +6 h 1 min of fake clock, service workers blocked: reg.update() called 0x (0 rejected), no pageerror
  ok  +6 h 1 min of fake clock, service workers allowed: reg.update() called 1x (0 rejected), no pageerror
  ok  daily reload at 04:00: idle sleep still begins about an hour after the movie (~04:50), not an hour after the reload
  ok  service-worker update reload: the idle clock carries across (asleep ~04:50)
  ok  a normal reload restarts the idle clock (K13)
PASS pi-stability                                                                         → exit 0
$ npm test → # tests 293  # pass 293  # fail 0
$ grep -q 'name="dailyReload"' index.html → exit 0
$ grep -q 'no-store' sw.js && node scripts/check-precache.mjs → 29 precached files OK, exit 0
$ E2E_PORT=23620 E2E_MOCK_PORT=23621 npm run test:e2e    (full, 13m07s)
  PASS brightness / cache-first / content-rating / display-decode / helper / kiosk / metadata / now-playing /
  pi-stability / pixel-shift / rotation / sleep / smoke / status / ui-rotation   (no FAIL line)
  helper additions: ok manual wake (key press): power on, then the poster fetch 4466 ms later
                    ok schedule-end wake (07:00): power on, then the poster fetch 4340 ms later
$ git status --short
M  css/app.css   M  index.html   M  js/main.js   M  sw.js   M  tests/e2e/helper.spec.mjs   A  tests/e2e/pi-stability.spec.mjs
```

## Mutation probes (in a mktemp clone, one at a time; baseline passed first)

```
M1 TV_WAKE_MS = 0                        helper-dhm2 (cases 12, 13 only): AssertionError: poster 536 ms after power on, before TV_WAKE_MS
M2 no carry (lastPlaybackAt: Date.now()) 14a and 14b fail: asleep at 04:55 should be true; Sleep "awake"
M3 sw.js no-store branch removed         case 3: no-store with the server stopped must reject: {"ok":true,"status":200}
M4 controller check removed              case 4: no controller: the tab navigated
M5 10-minute gap removed                 case 10a: a reload 5 minutes ago: the tab navigated
M6 open-dialog wait removed              case 6a/6b: a dialog is open at 04:00: the tab navigated
M7 busy wait removed                     case 7: the poster download is held: the tab navigated
M9 wake trigger removed                  case 9a: no reload within 40000 simulated ms
M10 probe result ignored                 case 2: server down at 04:00: the tab navigated
M11 lastReload not written               case 1: no reload within 60000 simulated ms (loop guard read-back fails, reload skipped)
```

## Notes for the reviewers

- Test-race learned (fixed in the spec): the `load` event comes before `boot()` has finished its first `await`, so a fake-clock jump straight after a reload can be taken as the load time. The idle-clock cases wait for a shown poster before jumping.
- The 6 h `setInterval` fires only once under `fastForward`; `runFor` over hours takes ~0.5 s real per simulated minute here, so the K16 and C8M3 cases use `fastForward` + a short `runFor`.
- Q-ps1 is the one UX edge to rule on: a reload triggered by a manual wake (key press) after a 12 h+ gap drops the 60 s manual wake.
