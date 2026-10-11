# Brief — pi-stability r1

Agent name: pi-stability-builder-r1 · phase: pi-stability · round: r1 · effort: high

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-pi-stability` (branch `orch/pi-stability` from `e1b7f07`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/pi-stability--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — pi-stability r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=23620 E2E_MOCK_PORT=23621. TDD: write tests/e2e/pi-stability.spec.mjs (every case in criterion 2; seed `pixelShift: false`; service workers allowed in this spec only) first; watch it fail and paste the failure; then implement in css/app.css, js/main.js, index.html and sw.js.
Design constraints (R-PROT-3, R-PROT-4, D6, plan notes):
- Remove `backdrop-filter` from css/app.css (criterion 1; one rule today, l.~296 `.sheet`); replace with a slightly more opaque panel (~.98); keep the cheap `::backdrop` darkening.
- sw.js: a request with `request.cache === 'no-store'` goes straight to the network (no caches.match fallback); navigations and other same-origin GETs stay cache-backed. Precache list unchanged, VERSION not bumped.
- Daily reload (dailyReload/dailyReloadTime already in js/settings.js — do not edit it): at dailyReloadTime (local, only with a plausible clock) and on the first wake from sleep when `plexPoster.lastReload` (a plain localStorage key) is older than 12 h. Reload ONLY when `navigator.serviceWorker.controller` is set AND `fetch('index.html',{cache:'no-store'})` resolves ok just before; otherwise skip and log the reason. Never while Settings or Diagnostics is open (retry after close), never mid-fade (wait for state.busy to clear). Write `plexPoster.lastReload` BEFORE reloading; refuse a second reload within 10 min. After a reload settings persist and `paused` is cleared. Add a `name="dailyReload"` checkbox (and the time) to Settings.
- `overscroll-behavior: none` on html and body.
- Diagnostics: `Daily reload: active` or `skipped (<reason>)`, `Secure context: yes|no`, `Service worker: controlling|none`.
Carried must-fixes (deadline: this phase; the gate refuses without them):
- K16 (D24): the service-worker update timer in js/main.js (`setInterval(() => reg.update()…, 6 h)`, l.~951) throws under a fake clock at simulated +6 h — find out why (e.g. a synchronous throw from reg.update() when the registration is gone, or an unhandled rejection) and make it never throw; add an e2e case that runs the fake clock past +6 h with no pageerror.
- C8M3 (D28): an automatic reload (daily reload or a service-worker update reload) must NOT restart the idle-sleep clock — carry `lastPlaybackAt` across the reload (e.g. sessionStorage written just before reloading, read once at boot; a normal fresh load still starts a fresh clock). e2e: idle sleep set, playback ended N minutes ago, daily reload → the remaining idle time is unchanged.
- DHM2 (K38, Output now includes tests/e2e/helper.spec.mjs): add two cases there with deviceHelper on — manual wake (a key press while asleep) and schedule-end wake — each showing power on, then TV_WAKE_MS, then the poster fetch. Test-only; do not change js/helper.js.
Run criteria 1–5 and the full `npm run test:e2e` (it takes about 10 min; run it once at the end), and paste outputs.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Full process (D42): anchored + cold reviews will attack the reload guard (stranded display, loops, reload with the host down, mid-fade, dialogs open) and the sw.js no-store path.
- Do not touch js/settings.js, js/sleep.js, js/helper.js, js/kiosk.js, scripts/serve.mjs or scripts/device-helper.mjs.

## Conventions every phase follows (verbatim from the plan)
1. **Output is a whitelist.** A phase may create or modify only its `Output` paths. The plan file and `.orchestrator/` are never Output. A parenthetical after a path is a condition, not part of the path.
2. **Acceptance criteria are shell commands run from the repo root; exit 0 is a pass.** An item starting `narrated:` is not a command: it names what a human or reviewer checks, and scores as narrated.
3. **Concurrent phases run in separate git worktrees with their own ports (D12).** Each worktree sets its own `E2E_PORT` and `E2E_MOCK_PORT`, so e2e runs do not collide and a worktree's `git status` shows only that phase's edits. Every server a test spawns (unit, integration or e2e) listens on a free port probed at run time, never a fixed one, apart from the shared e2e server's `E2E_PORT`/`E2E_MOCK_PORT`, because every worktree runs `npm test`. Scope probes are therefore valid per worktree. A scope probe is `test -z "$(git status --porcelain -- <paths>)"`: unlike `git diff HEAD` it also sees untracked new files. The conductor's reconcile step is the cross-check.
4. **Negative checks and unit-test lists are guarded.** `! grep … F` passes when `F` is missing, and `node --test a b` silently skips a missing path when another path exists, so every negative grep is written `test -f F && ! grep … F` and every `node --test` criterion is prefixed with `test -f` for each test file it names.
5. **New files under `js/` go into `SHELL` in `sw.js` in the phase that creates them**, which therefore lists `sw.js` in Output. `VERSION` is bumped **once**, in `release-bump` (spec R-REL-1; D16): the rationale is clean releases, not that per-phase bumps would reload clients (any `sw.js` edit already triggers a service-worker update).
6. **Output overlap is a scheduling constraint, not a dependency.** Many UI phases edit `index.html`, `css/app.css`, `js/main.js`, `js/display.js`, `js/settings-ui.js` and `scripts/mock-plex.mjs`. Two phases whose Output lists share a path must not run concurrently even when neither blocks the other. The *Concurrency* section lists only Output-disjoint sets.
7. **Pixel shift is on by default, so geometry specs run without it.** `tests/e2e/lib.mjs` (built in `e2e-harness`) seeds `pixelShift:false`, `dailyReload:false` and the `plexPoster.whatsNew` marker by default; a spec that tests those features sets them explicitly. Every spec that measures stage geometry also names `pixelShift: false` in its own settings.
8. **The e2e `mock` helper is generic** (`mock.get(action)`, `mock.post(action, params)` call `/__mock/<action>`), so later phases add mock endpoints without editing `tests/e2e/lib.mjs`.
9. **(verify)** marks a Plex parameter, Chromium flag or hardware command that could not be exercised in the authoring environment; each is carried into `docs/validation/`.
10. **Settings keys are added once** (`settings-and-schedule-core`); feature phases add controls (bound by `name`) and consume keys, and do not edit `js/settings.js`.
11. **Plan edits commit separately** from phase output. `Findings: —` means the phase delivers no source finding directly (an enabler, or documentation of shipped work).
12. **No gate phases.** The r1 milestone gates are gone. The phase that closes each milestone (named in the *Milestones* table) carries the full-suite criteria (`npm test`, `npm run test:e2e`, `node scripts/check-precache.mjs`), and the conductor runs `/phase-gate` on it at Step 7. `release-bump` carries the release checks (D11).
13. **The run ends with a push to the working branch only (D13).** A pull request or merge happens only when the owner asks, so no phase is tagged `publish`.

## The phase (verbatim from the plan)
### 17. `pi-stability` — Remove backdrop blur, guarded daily self-reload, overscroll backstop

- **Goal:** Cut GPU load on the settings sheet, shed Chromium memory growth with a daily reload that cannot strand a display, and add the in-page swipe-back backstop.
- **Findings:** E9, E10 · **Requirements:** R-PROT-3, R-PROT-4, R-TOPO-1 · **Rulings:** D6
- **Mode:** afk · **Tags:** ui · **Blocked by:** `sleep-mode`, `settings-and-schedule-core`
- **Output:** `css/app.css`, `js/main.js`, `index.html`, `sw.js`, `tests/e2e/pi-stability.spec.mjs`, `tests/e2e/helper.spec.mjs` (K38: the two helper wake cases routed here from device-helper-integration DHM2)
- **Acceptance criteria:**
  1. `test -f css/app.css && ! grep -n 'backdrop-filter' css/app.css`
  2. `npm run test:e2e -- pi-stability`  (service workers allowed, fake clock 03:59:30 with `dailyReload:true`, `dailyReloadTime:'04:00'`, page controlled by the service worker and the mock up: a reload happens at 04:00 (navigation counter kept in `sessionStorage`); with the **app server** unreachable at 04:00 (the spec runs with `serveArgs: []`, which gives it a dedicated server, and calls `app.stop()` before 04:00; never `mock.down()`, which stops only the Plex mock and does not touch the probe) no reload and a logged skip reason; with the server stopped, `fetch('index.html',{cache:'no-store'})` from the controlled page rejects, and with it running the same call resolves `ok`, while an ordinary `fetch('index.html')` and a reload still succeed from the cached shell; with service workers blocked (no controller) no reload and a logged skip; no reload while Settings or Diagnostics is open (it retries after close); `dailyReload:false` -> none; a fake clock at 1970 -> none; on wake from sleep with `plexPoster.lastReload` older than 12 h -> one reload, with it newer -> none; a second reload within 10 minutes is refused; after a reload settings persist and `paused` is cleared; `html` and `body` compute `overscroll-behavior: none`; Diagnostics shows `Daily reload: active` or `skipped (...)`, `Secure context: yes|no` and `Service worker: controlling|none`)
  3. `npm test`
  4. `grep -q 'name="dailyReload"' index.html`
  5. `grep -q 'no-store' sw.js && node scripts/check-precache.mjs`  (the service worker special-cases `no-store`; the precache list is still consistent)
- **Notes/hazards:**
  - `sw.js` is Output here: its fetch handler must send requests with `request.cache === 'no-store'` to the network (bypassing `caches.match`), otherwise the shell cache answers the probe and it can never fail. The `no-store` request is the only exception; navigations and ordinary same-origin GETs stay cache-backed. Precache is unchanged (no new `js/` file), so `VERSION` is not bumped.
  - D6 guard: reload only when `navigator.serviceWorker.controller` is set **and** a `fetch('index.html',{cache:'no-store'})` probe succeeds just before reloading; otherwise skip and log. On an http LAN origin there is no service worker, so the default-on setting is effectively off there; a reload with the host down would otherwise leave a dead browser error page that nothing reloads.
  - Tablet note (for `docs`): in a browser tab a reload drops Fullscreen API state (needs a user gesture); installed PWAs and `--kiosk` Chromium are unaffected.
  - Merged because both are Pi-stability fixes sharing one pre-flight and evidence run. Replace the blur with a slightly more opaque `--panel` (about .98); `::backdrop` darkening stays (cheap).
  - Guard against reload loops: write `plexPoster.lastReload` (a plain key, not a setting) before reloading and refuse a second reload within 10 minutes. Never reload mid-fade; wait for `state.busy` to clear.
  - `overscroll-behavior: none` on `html, body` is the backstop for the Chromium flag, which is reported not to stop swipe-back on every touch build (R-DOC-4).

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: pi-stability · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: pi-stability-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
