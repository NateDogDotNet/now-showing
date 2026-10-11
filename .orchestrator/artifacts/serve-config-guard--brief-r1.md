# Brief — serve-config-guard r1

Agent name: serve-config-guard-builder-r1 · phase: serve-config-guard · round: r1

You are the `orchestrator-builder` for exactly one phase of `docs/integration-plan.md`, driven by the integration-orchestrator conductor. Follow your agent definition (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- **Worktree:** `/home/user/wt-serve-config-guard` (branch `orch/serve-config-guard`, based on `0f1f82e`). Work ONLY there. `cd /home/user/wt-serve-config-guard` first; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Ports: (no e2e; every test server on a free port). Any extra server you or a test starts must use a free port (D12).
- Handback: write `/home/user/plex-poster-app/.orchestrator/artifacts/serve-config-guard--handback-builder-r1.md` (absolute path; the worktree has no `.orchestrator/`).
- Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — serve-config-guard r1: where · why it matters · work held · proposed reading`.
- `git add` exactly your Output files in the worktree. **Do not commit.**

## Process
TDD: write tests/serve.test.js first (unit + integration cases listed in criterion 1), watch them fail against the current serve.mjs, then implement scripts/net.mjs and the serve.mjs allowlist. Verification before completion.
This is `risk:high`: an independent cold reviewer will try every bypass in criterion 1 plus IPv6 literal Hosts. Keep the change minimal and readable.

## Binding rulings
`docs/decisions.md` D1–D16 bind (read it). Read `CLAUDE.md` if present (none in this repo), `README.md`, and the code you touch plus two neighbouring files to match idioms (plain ES modules, no build step, `node --test`, comment density like the existing code).

## Hard rules
- Touch only the phase's **Output** paths below. Anything else is scope creep and fails the phase.
- Add no behaviour the plan does not name. A behaviour question goes to questions.md.
- Do not edit the plan, the spec or docs/decisions.md.

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
### 4. `serve-config-guard` — Dev server serves only the app, and config.json only to loopback

- **Goal:** `scripts/serve.mjs --host 0.0.0.0` hands the LAN only the app files and never `config.json` (the Plex token) or repo internals.
- **Findings:** F4 · **Requirements:** R-SEC-1 · **Rulings:** D9
- **Mode:** afk · **Tags:** risk:high · **Blocked by:** none
- **Output:** `scripts/serve.mjs`, `scripts/net.mjs`, `tests/serve.test.js`
- **Acceptance criteria:**
  1. `test -f tests/serve.test.js && node --test tests/serve.test.js`  (the server is spawned on a free port: the test listens on port 0, reads the port, closes and passes it as `--port`, retrying on `EADDRINUSE`, so concurrent worktrees do not collide (D12); unit: `isLoopback` for `127.0.0.1`, `127.1.2.3`, `::1`, `::ffff:127.0.0.1`, `::ffff:192.168.1.5`, `192.168.1.5`, empty, undefined; `isLoopbackHost` for `localhost`, `localhost:8080`, `127.0.0.1:3000`, `[::1]:8080`, `evil.example`, `localhost.evil.com`, empty. Integration: spawns `serve.mjs --host 0.0.0.0 --port <free port> --root <tmp dir containing index.html, sw.js, manifest.webmanifest, css/a.css, js/a.js, assets/a.png, config.json, .orchestrator/x.md, docs/spec.md, package.json, README.md>`: loopback `GET /config.json` with `Host: localhost:<port>` is 200; the same from the machine's non-loopback IPv4 address is 403; with `X-Forwarded-For: 127.0.0.1` still 403; a loopback peer with `Host: evil.example` is refused; from the LAN address `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`, `/css/a.css`, `/js/a.js`, `/assets/a.png` are 200 and `/.orchestrator/x.md`, `/docs/spec.md`, `/package.json`, `/README.md` are 404; `//config.json`, `/./config.json`, `/%63onfig.json`, `/config.json/`, `/CONFIG.JSON` are never 200)
  2. `npm test`
  3. `grep -q 'isLoopback' scripts/serve.mjs && grep -q 'export function isLoopback' scripts/net.mjs && grep -q 'export function isLoopbackHost' scripts/net.mjs`
  4. `test -f scripts/serve.mjs && test -f scripts/net.mjs && ! grep -qiE 'x-forwarded|forwarded' scripts/serve.mjs scripts/net.mjs`  (proxy headers are never consulted)
  5. `test -z "$(git status --porcelain -- js css index.html sw.js scripts/mock-plex.mjs)"`
  6. narrated: run `node --test tests/serve.test.js 2>&1 | grep -E '^# (pass|fail|skipped)'` on a host with a non-loopback IPv4 and confirm the LAN-address tests were not skipped (they skip only when `os.networkInterfaces()` has none). The conductor's host has one (`192.0.2.2` at review time).
- **Notes/hazards:**
  - D9: replace the `BLOCKED` denylist with an allowlist: `/`, `index.html`, `manifest.webmanifest`, `sw.js`, and paths under `css/`, `js/`, `assets/`. `config.json` is served only to a loopback peer whose `Host` hostname is `localhost`, `127.0.0.1` or `[::1]`. Everything else is 404.
  - The Host check compares the **hostname only** and ignores the port (browsers send `localhost:8080`): `new URL('http://' + host).hostname`. Proxy headers are never consulted; say so in a comment worded exactly "proxy headers are never consulted" (the words `forwarded` and `x-forwarded` must not appear anywhere in `scripts/serve.mjs` or `scripts/net.mjs`, comments included, or criterion 4 fails).
  - `isLoopback` and `isLoopbackHost` live in `scripts/net.mjs` so they can be imported without starting a server (`serve.mjs` listens at import time). `device-helper-server` reuses both.
  - Add an optional `--root <dir>` flag (default: repo root) so tests serve a temp directory containing a fake `config.json`; never write a `config.json` into the repo root from a test.
  - Normalise first, check second: decode, resolve `.`/`..`, strip trailing slash, lower-case compare against `/config.json`, then decide.
  - Hazard: a reverse proxy on the same machine makes every client look like loopback. State this in the file header comment (README gets it in `docs`).
  - Hazard: `--mock` binds the mock Plex server to the same `HOST`; it serves no secrets, leave as is.
  - `risk:high`: this is the boundary that keeps the token off the LAN; the independent reviewer tries every bypass in criterion 1 plus an IPv6 literal Host.

## Handback header (first lines of your report, every field filled)
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: serve-config-guard · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
First body line: `Agent: serve-config-guard-builder-r1 · dispatched: <stamp given in your prompt>`. Then each acceptance command with its real output tail.
