Reviewer: e2e-harness-review-anchored-r1 · Model: opus · Dispatched: 2026-10-08T22:12:39Z · Method: anchored code review + architecture/tool-fit review · Scope: e2e-harness, round r1, base 0f1f82e, staged tree 6357fda

## What I read and ran

Read: `docs/integration-plan.md` (Preamble, Conventions 1-13, Tag table, phase 1 `e2e-harness` in full), `docs/decisions.md` D12 and D15, the staged diff (`git -C /home/user/wt-e2e-harness diff --cached`), and for context `scripts/serve.mjs`, `scripts/mock-plex.mjs:38-58`, `sw.js:1-53` and the `wakeLock` use in `js/main.js:366-373`.

Where I ran things: a private worktree made with `mktemp -d` under the session scratchpad (`.../scratchpad/rev.1st6/wt`), created with `git worktree add --detach <d>/wt 0f1f82e` and then `git read-tree -u --reset 6357fda`. `git write-tree` in that worktree printed `6357fda…`, so it held exactly the reviewed tree. I ran `npm ci` there, then every run below with `E2E_PORT=28080 E2E_MOCK_PORT=28401`. All mutations were reverted (`cp ../lib.orig tests/e2e/lib.mjs`, then `git diff --stat` was empty), and the scratch specs were deleted. At the end I removed the worktree (`git worktree remove --force`, `rm -rf`). The live worktree was never modified: its `git write-tree` still prints `6357fda`, and `pgrep serve.mjs` finds no leftover servers.

Results:

| Check | Result |
|---|---|
| C1 `npm test` | `# pass 29`, `# fail 0` |
| C2 `node --check` loop | exit 0 |
| C3 `node scripts/check-precache.mjs` | `23 precached files OK`, exit 0 |
| C4 recursive vendor test | first run fails with `notPrecached: [ 'js/vendor/x.js' ]`; after listing it, `2 precached files OK`; chain exit 0 |
| C5 `npm run test:e2e -- smoke` | all 8 `ok` lines, then `PASS smoke`, in 5.1 s |
| C6, C7, C8, C9, C10 | each exit 0 (C7 prints `package-lock.json` from `ls-files`) |
| Deliberately failing spec (`assert.equal(1,2)` inside `withApp({serveArgs:[]})`) | `FAIL zfail`, runner `exit=1`. Its dedicated port and the shared port both refuse afterwards (`000`). `shot()` with `E2E_SHOTS` wrote `zf.png`. `mock.play('3',{user:'bob'})`, `mock.stats()` and `mock.post('down')` all returned the mock's state JSON |
| `run.mjs` with no args | ran `smoke` and `zfail` in sorted order: `PASS smoke`, `FAIL zfail`, `exit=1` |
| `run.mjs smo` (exact-name check) | `FAIL smo (no such spec: …/smo.spec.mjs)`, `exit=1` |
| Shared `E2E_PORT` already in use, then `E2E_MOCK_PORT` in use | runner prints the serve.mjs EADDRINUSE output, `exit=1` both times |
| EADDRINUSE retry, by mutation: `freePort()` first returns a port another process holds (app port 3 times, mock port 3 times) | every run retried and got fresh ports, spec `exit=0`; reverted |
| `await app.stop()` then an immediate `fetch` | the request failed 10 times out of 10 |
| Global Playwright fallback (D15 note), with `node_modules` moved aside | `PASS smoke` using `/opt/node22/lib/node_modules/playwright` 1.56.1; `node_modules` restored |
| Hung spec (`waitForFunction(() => false, {timeout:0})`) under `timeout 40` | the runner never ends by itself; the outer `timeout` killed it (exit 124) |
| SIGTERM sent to the runner PID while a 15 s spec runs | runner exits 130 and the shared server goes down (`000`). The spec process (pid 15246) and its dedicated server stay alive (`200`) until the spec ends on its own |

Mutation teeth on `lib.mjs` (smoke run after each, then reverted):

| Mutation | Smoke result |
|---|---|
| `pixelShift: true` | FAIL |
| `serviceWorkers` default `'allow'` | FAIL |
| `app.stop` made a no-op | FAIL |
| `plexPoster.whatsNew` not seeded | PASS |
| `dailyReload: true` | PASS |
| wake-lock stub removed | PASS |
| `isMobile` not passed to the context | PASS |
| `viewport` ignored | PASS |

Tool fit (in the worktree):
- Licences: `node_modules/playwright/package.json` and `node_modules/playwright-core/package.json` are both `1.56.1`, `"license": "Apache-2.0"`.
- Size: `du -sh` gives 4.2M for `playwright` and 8.7M for `playwright-core`.
- Browser pin: `playwright-core/browsers.json` names chromium revision `1194` (141.0.7390.37), which matches `/opt/pw-browsers/chromium-1194` and `chromium_headless_shell-1194`.
- `npm ci` printed `added 2 packages, and audited 3 packages … found 0 vulnerabilities`.

Dependency audit: `npm audit --omit=optional` and `npm audit` both print `found 0 vulnerabilities`; the registry was reachable. The lockfile is `lockfileVersion: 3`. Besides the root it has exactly `playwright@1.56.1`, `playwright-core@1.56.1` (Apache-2.0) and `fsevents@2.3.2` (MIT, `optional`, macOS only, Playwright's normal optional dependency). Every entry resolves to `registry.npmjs.org` with a sha512 integrity hash. The root has no `dependencies`.

## 1. Code review

### Strengths
- All ten command criteria pass on the reviewed tree with non-default ports (D12).
- The `withApp` signature matches the Notes exactly: `{settings, viewport, hasTouch, isMobile, clock, serviceWorkers, serveArgs, localStorage}` and `{page, context, app, mock}`, with `app = {url, port, mockPort, argv, stop()}` (`tests/e2e/lib.mjs:105-114`). `settings` may also be a function of `app`, which lets a dedicated server's mock port go into the seed. That is a compatible addition.
- The defaults match the contract:
  - service workers blocked, with `'allow'` opting in;
  - settings seeded through `context.addInitScript` on top of `{pixelShift:false, dailyReload:false}`;
  - the `plexPoster.whatsNew` marker preset. Any value counts, because spec R-UPG-1 treats it as a plain key and the toast shows only when it is unset;
  - the counting wake-lock stub `window.__wakeLock = {held, requests, releases}`;
  - the mock helpers `get`, `post`, `play`, `stop`, `down`, `up`, `stats`. These send query-string parameters, which is what `mock-plex.mjs:47-48` reads. A spec with its own server gets helpers for its own mock port;
  - `shot(page, name)` driven by `E2E_SHOTS`.
- Port probing works as the Notes describe: listen on port 0, read the port, close, spawn. The retry on EADDRINUSE works (shown by mutation), and it does not loop on other startup errors.
- Failures are reported reliably for assertions and for exceptions raised inside `withApp`. The `finally` closes the browser and kills the dedicated child.
- The runner:
  - runs every spec when given no arguments;
  - matches names exactly, and a missing name prints FAIL with a non-zero exit;
  - prints one PASS or FAIL line per spec;
  - runs each spec in its own process, so one spec cannot poison the next;
  - exits non-zero if the shared server cannot start.
- `check-precache.mjs` walks `js/` recursively, allows `./`, supports `--root`, and passes C4 in both directions.
- The mutations show the smoke spec catches real regressions in `pixelShift`, the service-worker default and `stop()`.

### Issues

**Important**

1. **A hung spec hangs the whole run forever, and a runner killed by a signal leaves the running spec, its Chromium and its dedicated server behind.** Class: spec-gap.
   - Location: `tests/e2e/run.mjs` lines 38-41 (spawn and wait with no deadline) and lines 24-25 (on a signal the runner kills only the shared server); `.github/workflows/ci.yml` has no `timeout-minutes`.
   - Evidence: a hung spec run under `timeout 40` was ended only by the outer timeout (exit 124). After SIGTERM to the runner, the spec (pid 15246) and its dedicated server kept serving (`200`).
   - Why it matters: no FAIL line is ever printed for a hang. In CI the job runs until GitHub's 6-hour limit. A conductor that bounds a run with `timeout N npm run test:e2e` leaves orphaned processes holding ports in the worktree. Later phases cannot edit `run.mjs`, so they cannot add a deadline themselves.
   - Why spec-gap: the criteria and Notes say nothing about a spec timeout or about passing signals to the spec process. The change meets them as written.
   - Fix:
     - add a per-spec deadline in `run.mjs` (for example `E2E_SPEC_TIMEOUT`, default 180 s) that kills the spec process (spawned `detached`, then `process.kill(-pid)`) and prints `FAIL <name> (timeout)`;
     - track the current spec child and kill it in the `exit` and signal handlers;
     - optionally add `timeout-minutes: 20` to the CI job.

**Minor**

2. **Some contract defaults later phases rely on are not asserted by smoke.** Class: spec-gap. Criterion 5 lists only certain options, and these are not among them.
   - Evidence: smoke still passes with the `whatsNew` seed removed, with `dailyReload: true`, with the wake-lock stub removed (it checks only that `typeof __wakeLock.requests` is `number`), with `isMobile` dropped and with `viewport` ignored.
   - Fix:
     - assert `localStorage.getItem('plexPoster.whatsNew') !== null` and `dailyReload === false`;
     - assert that `await navigator.wakeLock.request('screen')` bumps `__wakeLock.requests`;
     - check `innerWidth` for a given `viewport`;
     - check a mobile signal for `isMobile`.

3. **The wake-lock stub is less faithful than the real API.** Class: spec-gap; the contract only says "counting stub".
   - Location: `lib.mjs:139-157`.
   - Evidence: the sentinel's `released` stays `false` after `release()`, and `addEventListener` is a no-op, so the `'release'` event never fires.
   - Why it matters: today's app does not depend on either (`js/main.js:366-373` nulls its handle itself). A later spec that checks `sentinel.released` or relies on the release listener would see wrong behaviour, and it could not fix the harness.
   - Fix: make `released` a getter and dispatch `'release'` to the stored listeners.

4. **The CI step order puts the precache check last.**
   - Location: `ci.yml`.
   - Why it matters: when e2e fails, the cheap `check-precache` result is never reported.
   - Fix: run it before the Chromium install. Class: code-bug (cosmetic; C9 still passes either way).

5. **The pass-through check reads the harness's own bookkeeping.**
   - Location: `smoke.spec.mjs:33-35`.
   - Why it matters: `app.spawned` is the harness's record of the argument list, not what the child process received. It is the same array that is spawned, so the risk is low. Reading `/proc/<pid>/cmdline` would make the criterion's phrase "the child was spawned with exactly that list" literally true.
   - Class: spec-gap.

## 2. Architecture / tool fit (criterion 11)

- **Pin:** `"playwright": "1.56.1"` is exact (no caret) in `devDependencies`, and there is no `dependencies` key, so the runtime stays dependency-free (D15; C6 and C7 pass). The lockfile pins `playwright-core@1.56.1` with an integrity hash.
- **Browser match:** 1.56.1's `browsers.json` names chromium `1194`, which is what is preinstalled at `/opt/pw-browsers/chromium-1194`. Local runs need no download.
- **CI:** `npx playwright install --with-deps chromium` runs after `npm ci`, so `npx` resolves the local 1.56.1 binary and installs chromium 1194 (plus headless shell). This matches the pin.
- **Licence:** Apache-2.0 for both packages. That is compatible with the project's MIT licence for a dev-only tool. Nothing ships to users.
- **Size:** about 13 MB of npm packages plus the browser download. That is acceptable for a test-only dependency, and much lighter than `@playwright/test`, which this change rightly does not use. The small custom runner avoids a test framework.
- **Global fallback:** works (shown above). The global copy is also 1.56.1, so the two cannot drift today.
- `--no-sandbox` is always passed. That is needed as root and harmless on CI runners.

Tool fit: APPROVE

## 3. Dependency audit

`npm audit --omit=optional` gives 0 vulnerabilities, and so does `npm audit`. The tree is three packages, all from the npm registry with sha512 hashes, under Apache-2.0 and MIT licences. `fsevents` is optional and macOS-only, and is never installed on Linux or CI. There are no install scripts beyond Playwright's own (Playwright 1.56 does not download a browser on postinstall). Nothing notable.

## Declined to judge

- **Readiness race in `spawnServe`:** `ready` waits only for the mock banner. In theory the app port's `listen` could fail after that banner. In practice the app port's error fires before the dynamically imported mock starts, and both squatting tests failed fast. I saw no failure, and the behaviour depends on `serve.mjs`, which is outside this diff.
- **`pageerror` not failing a spec automatically:** whether the harness should fail on any uncaught page error is a policy choice. The criteria ask only that smoke asserts a clean console, and it does.
- **`check-precache.mjs` edge cases:** it would miscount if a quote appeared inside a comment in the `SHELL` array, and it would flag a stray dotfile under `js/`. Neither occurs in the current `sw.js` or `js/`.

## Recommendations

1. Add the per-spec timeout and the kill of the running spec child in `run.mjs` (issue 1) before later phases depend on the harness, because they cannot edit it. The conductor should rule on this spec-gap.
2. Optionally strengthen smoke for whatsNew, dailyReload, the wake-lock stub, viewport and isMobile (issue 2), and improve the stub's fidelity (issue 3) in the same pass.
3. Move the precache step in CI ahead of the Chromium install (issue 4).

## Assessment

The change meets every command criterion and the `lib.mjs`/`run.mjs` contract in the Notes, item by item. I ran each part, and failures surface reliably for assertions and exceptions. The one Important finding (no spec deadline, orphaned processes after a signal) is a spec-gap: the criteria are silent on it, but the harness cannot be edited later, so the conductor should decide whether to add it now. No code-bug fails a criterion or a decision. Tool fit and the dependency audit are clean.

**Verdict:** APPROVE
