# Brief — device-helper-server r1

Agent name: device-helper-server-builder-r1 · phase: device-helper-server · round: r1 · effort: high (risk:high)

You are the `orchestrator-builder` for exactly this phase. Follow `~/.claude/agents/orchestrator-builder.md`.

## Where you work
- Worktree `/home/user/wt-device-helper-server` (branch `orch/device-helper-server`, based on `0914090`, which already contains `scripts/net.mjs` with `isLoopback`/`isLoopbackHost` and the allowlisting `scripts/serve.mjs` from `serve-config-guard`). Work ONLY there.
- Every server a test starts uses a free port (listen on 0, read, close, pass as --port; retry on EADDRINUSE) — D12.
- Handback: `/home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--handback-builder-r1.md`. Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md`.
- `git add` your Output files only. Do not commit.

## Process
TDD: write `tests/device-helper.test.js` first (every case in criterion 1, with an injected fake `execFile` and a fake thermal file path), watch it fail, then implement `scripts/device-helper.mjs` and wire `--helper*` flags into `scripts/serve.mjs`. Verification before completion: run criteria 1–6 and paste outputs.
Read `scripts/serve.mjs`, `scripts/net.mjs` and `tests/serve.test.js` first and match their idioms; keep every protection `serve-config-guard` added (allowlist, loopback-only config.json, tests in tests/serve.test.js must still pass — they run in `npm test`).
This is `risk:high` (it runs commands on the device): an anchored and a cold reviewer will try hostile bodies, spoofed headers, rebinding Hosts, CSRF simple requests (text/plain POST without the custom header), concurrent requests, a hung command, and argument injection via `--helper-output` / env values. execFile with fixed argv arrays only, never a shell; validate `--helper-output` and the env values; 5 s timeout + kill; one command at a time.

## Binding rulings
`docs/decisions.md` D1–D16 (D8 helper scope: screen power + temperature only, no brightness; D9 loopback/Host rules; D12 free ports).

## Hard rules
Touch only Output. Add no behaviour the plan does not name (questions go to questions.md). Do not edit plan/spec/decisions.

## Conventions every phase follows (verbatim)
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

## The phase (verbatim)
### 15. `device-helper-server` — Loopback device helper for screen power and temperature

- **Goal:** Add an opt-in `--helper` mode that lets the page switch display power and read CPU temperature on a Pi.
- **Findings:** E6 · **Requirements:** R-HELP-1 · **Rulings:** D8, D9
- **Mode:** afk · **Tags:** risk:high · **Blocked by:** `serve-config-guard`
- **Output:** `scripts/device-helper.mjs`, `scripts/serve.mjs`, `tests/device-helper.test.js`
- **Acceptance criteria:**
  1. `test -f tests/device-helper.test.js && node --test tests/device-helper.test.js`  (with an injected fake `execFile`: `POST /__helper/display {on:false}` runs exactly the chosen strategy's argv (`cec-ctl -d /dev/cec0 --to 0 --standby`, `cec-client` with `standby 0` on stdin, or `wlr-randr --output <name> --off`) and `{on:true}` the matching on argv; the `wlr-randr` call receives an `env` containing `WAYLAND_DISPLAY` and `XDG_RUNTIME_DIR` from the flags or the helper's environment and nothing else secret; a non-boolean `on` (`'yes'`, `1`, missing) -> 400 and no command; non-loopback peer, missing `X-Poster-Helper: 1`, hostile `Host` (`evil.example`, `localhost.evil.com`) -> 403 and no command, while `Host: localhost:8080` is accepted; `X-Forwarded-For: 127.0.0.1` from a non-loopback peer is still 403; `GET /__helper/status` lists the detected power strategy or `null` and `tempC` parsed from `thermal_zone0`; `POST /__helper/brightness` -> 404; `--helper-fake` records calls and returns canned data, and exposes the recorded calls as `GET /__helper/calls` (a JSON array of `{ action, on, at }`, oldest first) **in fake mode only**: without `--helper-fake` that route is 404, and with it the same loopback, Host and `X-Poster-Helper: 1` guards apply; integration: `serve.mjs --helper --helper-fake` spawned on a free port answers `status` 200 with the header and 403 without, `calls` lists a `display` call after a `POST /__helper/display` and is 404 when started with `--helper` alone)
  2. `npm test`
  3. `test -f scripts/device-helper.mjs && ! grep -nE "\bexec\(|execSync|shell: *true" scripts/device-helper.mjs`  (`execFile` with fixed argument arrays only, never a shell)
  4. `test -f scripts/device-helper.mjs && test -f scripts/serve.mjs && ! grep -n 'Access-Control-Allow' scripts/device-helper.mjs scripts/serve.mjs`  (no CORS grant)
  5. `test -f scripts/device-helper.mjs && ! grep -niE 'brightness|ddcutil|backlight|vcgencmd display_power' scripts/device-helper.mjs`  (brightness is dropped, D8)
  6. `test -z "$(git status --porcelain -- js css index.html sw.js scripts/net.mjs scripts/mock-plex.mjs)"`
  7. narrated: independent reviewer (risk:high; this phase runs commands on the device) tries to run a command with a hostile body, a spoofed header and a rebinding Host.
- **Notes/hazards:**
  - D8: scope is screen power (HDMI-CEC via `cec-ctl`/`cec-client`; output off/on via `wlr-randr` with the compositor environment passed through) and CPU temperature. Brightness control is dropped. Loopback-only and opt-in.
  - Reuses `isLoopback` and `isLoopbackHost` (hostname-only Host check) from `scripts/net.mjs`; never reads proxy headers.
  - Without `--helper` the routes do not exist (404), so nothing changes for existing users. Flags: `--helper-power cec-ctl|cec-client|wlr-randr|none`, `--helper-output <name>`, `--helper-wayland-display <name>`, `--helper-xdg-runtime-dir <dir>`; default is auto-detect by probing for the binaries, reported by `status`.
  - All command syntax is **(verify)** and cannot be exercised here: `cec-ctl` needs `/dev/cec0` and the `video` group; `cec-client -s -d 1` with `on 0` / `standby 0`; `wlr-randr --output HDMI-A-1 --off|--on`. `real-server-validation-extended` has optional rows for each, plus "window still full-screen after power off/on".
  - Every command gets a 5 s timeout and runs one at a time (a lock), so a hung `cec-client` cannot stack processes; kill on timeout.
  - CSRF: the custom header forces a CORS preflight that is never granted; that is why `Access-Control-Allow-*` must not appear.

## Handback header
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: device-helper-server · round: r1
status: complete | blocked | failed        failure_class: <...>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
First body line: `Agent: device-helper-server-builder-r1 · dispatched: <stamp>`.
