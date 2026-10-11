# Brief — device-helper-integration r1

Agent name: device-helper-integration-builder-r1 · phase: device-helper-integration · round: r1 · effort: medium

You are the `orchestrator-builder` for exactly this phase (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- Worktree `/home/user/wt-device-helper-integration` (branch `orch/device-helper-integration` from `1550ccb`). Work ONLY there; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Every server a test starts uses a free port; for the e2e suite set your own `E2E_PORT`/`E2E_MOCK_PORT` (D12).
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-integration--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — device-helper-integration r1: where · why it matters · work held · proposed reading`.
- `git add` your Output files only. Do not commit.

## Process
Use E2E_PORT=23120 E2E_MOCK_PORT=23121. TDD: write tests/helper.test.js (every case in criterion 1, with a fake fetch) and tests/e2e/helper.spec.mjs (every case in criterion 3; harness `serveArgs: ['--helper','--helper-fake']`, seed `pixelShift: false`; read `GET /__helper/calls` with the `X-Poster-Helper: 1` header through `context.request`) first; watch both fail and paste the failures; then implement.
Design constraints (R-HELP-2, D8, plan notes; the server side is landed — read the route list at the top of scripts/device-helper.mjs and do not edit it or scripts/serve.mjs):
- js/helper.js: `createHelper({ fetchImpl, log })` with `probe()` (GET /__helper/status; 404, network error or bad JSON → `available:false`, no throw, no console error), `power(on)` (POST /__helper/display `{on}`), `status()`; every request sends `X-Poster-Helper: 1` and is same-origin relative (`__helper/...`), so no CORS is involved; a failure is logged once per kind, not on every tick. No brightness anything (criterion 5).
- `deviceHelper` (already in js/settings.js, default false — do not edit settings.js) gates everything: off, or no helper found → after the single boot probe the page makes no `/__helper/` request at all and logs no console error. Probe once at boot and again when Settings opens; never poll, except the Diagnostics CPU temperature, which refreshes only while Diagnostics is open (stop the timer on close).
- Sleep (js/main.js evaluateSleep): power OFF only after the veil is up (body.asleep set and painted — e.g. after a requestAnimationFrame); on wake, power ON first, wait a named constant for the TV to wake (e.g. `TV_WAKE_MS`, marked (verify) for hardware; the V1-E22 checklist row measures it), THEN the poster fetch/tick. Wake-on-playback, schedule end and manual wake all take this path. A failed power call never blocks waking or the poster fetch. Don't double-call power on repeated evaluateSleep runs (only on state change).
- Diagnostics shows `CPU temperature: <n> °C` (and the temperature source) when deviceHelper is on and the helper reports tempC; nothing when off. Add a `name="deviceHelper"` checkbox to Settings (the Display protection fieldset is fine) with short help text saying it only works when the app is served by `serve.mjs --helper` on the device itself.
- Precache js/helper.js in sw.js; the service worker must never cache `/__helper/` responses (check sw.js's fetch handler and add a pass-through if needed).
Run criteria 1–5 and the full `npm run test:e2e`; paste outputs.

## Binding rulings
`docs/decisions.md` (every entry binds: D1–D19). Conductor rulings at the end of `.orchestrator/questions.md`. Read the code you touch plus two neighbouring files and match their idioms (plain ES modules, no build step, `node --test`, the e2e `withApp` contract in `tests/e2e/lib.mjs`, which you must not edit).

## Hard rules
- Touch only the phase's Output paths. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name; a behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.
- Do not touch js/settings.js, js/sleep.js, js/kiosk.js, scripts/serve.mjs or scripts/device-helper.mjs.

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
### 16. `device-helper-integration` — Use the helper from the app and show CPU temperature

- **Goal:** Optional page-side client for the helper: power off in sleep, power on at wake, CPU temperature in Diagnostics.
- **Findings:** E6, E9 · **Requirements:** R-HELP-2 · **Rulings:** D8
- **Mode:** afk · **Tags:** ui · **Blocked by:** `device-helper-server`, `sleep-mode`
- **Output:** `js/helper.js`, `tests/helper.test.js`, `js/main.js`, `index.html`, `css/app.css`, `sw.js`, `tests/e2e/helper.spec.mjs`
- **Acceptance criteria:**
  1. `test -f tests/helper.test.js && node --test tests/helper.test.js`  (fake `fetch`: 404 or network error -> `available:false` and no throw; every request carries `X-Poster-Helper: 1`; `power(false)` posts `{on:false}`; failures are logged once, not every tick)
  2. `npm test`
  3. `npm run test:e2e -- helper`  (harness `serveArgs: ['--helper','--helper-fake']`: with `deviceHelper:true` Diagnostics shows `CPU temperature` with the fake value; entering sleep makes `GET /__helper/calls` (read with the `X-Poster-Helper: 1` header through `context.request`) show power off after the veil is up, then power on at wake before the poster fetch; with `deviceHelper:false` or without `--helper` the page makes no `/__helper/` request after the initial probe and logs no console error)
  4. `node scripts/check-precache.mjs`
  5. `grep -q 'name="deviceHelper"' index.html && test -f js/helper.js && ! grep -niE 'brightness' js/helper.js`
- **Notes/hazards:**
  - E9 here is the CPU-temperature half (the `backdrop-filter` half is in `pi-stability`). Probe once at boot and when Settings opens; never poll in a loop except the Diagnostics temperature, which refreshes only while that dialog is open.
  - `deviceHelper` default false: a page that silently runs commands on the device must be an explicit opt-in even on loopback.
  - Power off must happen after the veil is up, and power on before the poster fetch on wake, with a short delay for the TV to wake (a named constant, **(verify)** on hardware). A power cycle can renegotiate the display and hide the page, delaying wake-on-playback through timer throttling: a V1-extended row checks it.

## Handback (write it before you return)
The file's FIRST line is the `produced_by:` line — nothing above it:
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: device-helper-integration · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
Then a blank line, `Agent: device-helper-integration-builder-r1 · dispatched: <stamp from your prompt>`, then each acceptance command with its real output tail.
