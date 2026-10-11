# Brief — e2e-harness r1

Agent name: e2e-harness-builder-r1 · phase: e2e-harness · round: r1

You are the `orchestrator-builder` for exactly one phase of `docs/integration-plan.md`, driven by the integration-orchestrator conductor. Follow your agent definition (`~/.claude/agents/orchestrator-builder.md`).

## Where you work
- **Worktree:** `/home/user/wt-e2e-harness` (branch `orch/e2e-harness`, based on `0f1f82e`). Work ONLY there. `cd /home/user/wt-e2e-harness` first; never touch `/home/user/plex-poster-app` except the two `.orchestrator` paths below.
- Ports: E2E_PORT=18080 E2E_MOCK_PORT=18401. Any extra server you or a test starts must use a free port (D12).
- Handback: write `/home/user/plex-poster-app/.orchestrator/artifacts/e2e-harness--handback-builder-r1.md` (absolute path; the worktree has no `.orchestrator/`).
- Questions: append to `/home/user/plex-poster-app/.orchestrator/questions.md` as `Q<n> — e2e-harness r1: where · why it matters · work held · proposed reading`.
- `git add` exactly your Output files in the worktree. **Do not commit.**

## Process
verification before completion (run every acceptance command yourself and paste the output). Use TDD where it applies (write smoke.spec assertions first, watch them fail, then build lib.mjs/run.mjs).
Run `npm install --save-dev --save-exact playwright@1.56.1` in the worktree to produce package-lock.json (network goes through the agent proxy; if the registry download fails, report it as blocked/transient instead of hand-writing a lockfile). Do not run `playwright install` (Chromium is preinstalled at /opt/pw-browsers).

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
### 1. `e2e-harness` — Browser test harness against the mock server

- **Goal:** Add a committed Playwright harness (`npm run test:e2e`) that drives `scripts/serve.mjs --mock`, plus a recursive precache consistency script.
- **Findings:** — (enabler for F1, F2, F3, F5 and every later browser criterion) · **Requirements:** R-REL-1 · **Rulings:** D12, D15
- **Mode:** afk · **Tags:** architecture · **Blocked by:** none
- **Output:** `package.json`, `package-lock.json`, `tests/e2e/run.mjs`, `tests/e2e/lib.mjs`, `tests/e2e/smoke.spec.mjs`, `scripts/check-precache.mjs`, `.github/workflows/ci.yml`
- **Acceptance criteria:**
  1. `npm test`
  2. `for f in tests/e2e/*.mjs scripts/check-precache.mjs; do node --check "$f" || exit 1; done`
  3. `node scripts/check-precache.mjs`
  4. `d=$(mktemp -d) && mkdir -p "$d/js/vendor" && touch "$d/index.html" "$d/js/vendor/x.js" && printf "const SHELL = [\n  'index.html',\n];\n" > "$d/sw.js" && ! node scripts/check-precache.mjs --root "$d" && printf "const SHELL = [\n  'index.html',\n  'js/vendor/x.js',\n];\n" > "$d/sw.js" && node scripts/check-precache.mjs --root "$d"`  (the check is recursive: a nested `js/vendor/x.js` that is not in `SHELL` fails, and passes once listed)
  5. `npm run test:e2e -- smoke`  (spec `smoke.spec.mjs`: seeds settings `{plexToken:'demo-token', serverUrl:'http://127.0.0.1:<mock port>', libraryKey:'1'}`, loads `/`, waits for a poster layer with `naturalWidth > 0`, asserts no console errors; plus one assertion per option later phases rely on, because those phases cannot edit the harness: **`serveArgs: []`** starts a dedicated `serve.mjs --mock` child on its own free ports (different from `E2E_PORT`/`E2E_MOCK_PORT`), `app.url` serves the app, and after `app.stop()` a request to `app.url` fails; **`serveArgs: ['--helper','--helper-fake']`** is passed through to that child (`app.argv` contains `--helper` and `--helper-fake` after `--mock`, and the child was spawned with exactly that list); **`serviceWorkers`**: by default `navigator.serviceWorker.getRegistrations()` is empty, with `serviceWorkers: 'allow'` a registration exists and `navigator.serviceWorker.controller` is set after one reload; **`clock`**: with `clock: { time: '2026-01-05T03:59:30' }` `new Date().getFullYear()` is 2026 and `page.clock.runFor(60000)` advances `Date` by a minute; **`hasTouch`**: `true` gives `navigator.maxTouchPoints > 0` and the default does not; **`localStorage`**: `{ 'plexPoster.lastReload': '123' }` is readable as `'123'` by the first script on the page, and the settings seed shows `pixelShift === false` in `plexPoster.settings`)
  6. `node -e "const p=require('./package.json'); if (p.dependencies || !p.devDependencies || p.devDependencies.playwright!=='1.56.1' || !p.scripts['test:e2e']) process.exit(1)"`  (runtime stays dependency-free, Playwright pinned, D15)
  7. `node -e "const l=require('./package-lock.json'); if (!l.packages || !l.packages['node_modules/playwright'] || (l.packages[''].dependencies && Object.keys(l.packages[''].dependencies).length)) process.exit(1)" && git ls-files --error-unmatch package-lock.json`  (the lockfile is committed or staged, so CI `npm ci` works)
  8. `grep -Eq 'pixelShift: *false' tests/e2e/lib.mjs && grep -Eq 'dailyReload: *false' tests/e2e/lib.mjs && grep -q 'plexPoster.whatsNew' tests/e2e/lib.mjs`  (convention 7)
  9. `grep -q 'npm ci' .github/workflows/ci.yml && grep -q 'playwright install' .github/workflows/ci.yml && grep -q 'test:e2e' .github/workflows/ci.yml && grep -q 'check-precache' .github/workflows/ci.yml && test -f .github/workflows/ci.yml && ! grep -q 'readdirSync' .github/workflows/ci.yml`  (CI installs from the lockfile, installs Chromium, runs the e2e suite and the recursive check instead of the old inline one)
  10. `test -z "$(git status --porcelain -- js css index.html sw.js scripts/serve.mjs scripts/mock-plex.mjs)"`  (no app or server code changed)
  11. narrated: `/tool-fit review` of the Playwright devDependency (version pin, size, licence) and `dependency-audit` on the lockfile (the `architecture` tag routes this).
- **Notes/hazards:**
  - D15: Playwright is a devDependency and `package-lock.json` is mandatory Output (r1's "only if npm install runs" made CI `npm ci` fail). `tests/e2e/lib.mjs` still falls back to the global install when the local one is absent (`createRequire(`${execSync('npm root -g')}/`)('playwright')`, found at `/opt/node22/lib/node_modules/playwright` in this environment); a bare ESM `import 'playwright'` does not find the global copy.
  - `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is set; Chromium build `chromium-1194`. Launch with `--no-sandbox` when running as root.
  - `run.mjs [spec-name ...]` runs `tests/e2e/<name>.spec.mjs` exactly (no substring matching), starts one shared `serve.mjs --mock` child on `E2E_PORT` (default 18080) / `E2E_MOCK_PORT` (default 18401), kills it on exit, exits non-zero on any failure, prints one PASS/FAIL line per spec. Concurrent worktrees pick different ports through those variables (D12). A spec that passes `serveArgs` (even `[]`) gets an additional dedicated child `serve.mjs --mock --port <free> --mock-port <free> ...serveArgs`, on ports the harness probes for (listen on port 0, read the port, close, then spawn; retry on `EADDRINUSE`), killed when the callback returns; `app.stop()` kills it early, and the `mock` helper of that spec talks to its mock port.
  - `lib.mjs` contract used by all later specs: `withApp({ settings, viewport, hasTouch, isMobile, clock, serviceWorkers, serveArgs, localStorage }, async ({ page, context, app, mock }) => {})`, where `app = { url, port, mockPort, argv, stop() }`. Defaults: service workers blocked (`serviceWorkers: 'allow'` opts in for offline/SW specs), settings seeded through `addInitScript` into `localStorage['plexPoster.settings']` on top of `{pixelShift:false, dailyReload:false}`, `plexPoster.whatsNew` pre-set so the upgrade toast never interferes, `navigator.wakeLock` replaced by a counting stub (`window.__wakeLock = {held, requests, releases}`), generic mock helpers `mock.get(action)`, `mock.post(action, params)` plus `mock.play(ratingKey, params)`, `mock.stop()`, `mock.down()`, `mock.up()`, `mock.stats()`; `E2E_SHOTS=<dir>` makes `shot(page, name)` write PNGs.
  - `check-precache.mjs [--root <dir>]` parses `SHELL` from `<root>/sw.js`, walks `<root>/js` recursively, and fails on a missing entry or an unlisted file. `./` is allowed in `SHELL` without a file.
  - Fake time: use Playwright `page.clock.install({ time })` / `runFor` (available in 1.45+).
  - Hazard: the app registers a service worker and calls `requestFullscreen`/`wakeLock`; none work meaningfully in headless Chromium, hence the stub and the default `serviceWorkers: 'block'`.

## Handback header (first lines of your report, every field filled)
```
produced_by: orchestrator-builder · model: <model> · effort: <level> · phase: e2e-harness · round: r1
status: complete | blocked | failed        failure_class: <transient|deterministic|capability|ambiguity|n/a>
paths: <every path created, edited or staged>
criteria: <one line per acceptance criterion — met / not met / not attempted, with the command you ran>
deviations: <or none>
questions: <ids or none>
```
First body line: `Agent: e2e-harness-builder-r1 · dispatched: <stamp given in your prompt>`. Then each acceptance command with its real output tail.
