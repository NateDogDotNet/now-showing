## Security scan — now-showing (plex-poster-app), 2026-10-14

Run by conductor-2 for `release-bump` criterion 8 (close-time reviews), on the release worktree `/home/nathan/wt-release-bump` (fdcf53d plus the staged release-bump files: version 2.1.0, README, Roadmap, `tests/e2e/release.spec.mjs`). The pattern bank is `secscan.py scan` (`.orchestrator/`-relative scratch outputs `secscan-scan.json`, `secscan-scan-mjs.json`); the rollup block below is `secscan.py rollup --findings`.

**Scope:** whole-repo — the 35 files the pattern bank sees (`js/*.js`, `sw.js`, `tests/*.test.js`) plus every tracked `.mjs` under `scripts/` and `tests/e2e/`, `index.html`, `manifest.webmanifest`, `package.json`, `.github/workflows/ci.yml`, `.gitignore` (read or grepped by hand: the pattern bank does not open `.mjs`, `--scope "**/*.mjs"` scanned 0 files). The tracked `.orchestrator/` trail (phase records, briefs, evidence, 19 validation driver `.mjs` files) is covered by the branch security review `purge-git-history--security-review-r1.md` (secrets and data exposure; the drivers talk only to localhost, plex.tv and the saved server) and is listed as excluded from the pattern bank below.
**Scope source:** default whole-repo
**Severity filter:** all
**Language(s) detected:** JavaScript (browser ES modules, no build step) + Node 20 (`scripts/*.mjs`, tests). No other manifest.
**Dependency audit tool:** `npm audit` (ran; lockfile v3) | no ecosystem without coverage.

### Coverage ledger
**Files examined: 35/35** (pattern bank, from `scan.files`): `js/backoff.js`, `js/brightness.js`, `js/display.js`, `js/duration.js`, `js/engine.js`, `js/frames.js`, `js/helper.js`, `js/kiosk.js`, `js/layout.js`, `js/main.js`, `js/plex.js`, `js/poster-cache.js`, `js/ratings.js`, `js/schedule.js`, `js/settings-ui.js`, `js/settings.js`, `js/shortcuts.js`, `js/sleep.js`, `js/util.js`, `sw.js`, `tests/brightness.test.js`, `tests/device-helper.test.js`, `tests/duration.test.js`, `tests/engine.test.js`, `tests/helper.test.js`, `tests/kiosk.test.js`, `tests/layout.test.js`, `tests/plex.test.js`, `tests/poster-cache.test.js`, `tests/ratings.test.js`, `tests/schedule.test.js`, `tests/serve.test.js`, `tests/settings.test.js`, `tests/shortcuts.test.js`, `tests/sleep.test.js` — categories 1, 2, 3, 4, 6, 9 by grep (pattern bank); 7 and 8 by read of the sinks named below.
- `js/kiosk.js` — crypto: finding (INFO, line 91); PIN hash is SHA-256 over `salt:pin` (read, line 95).
- `js/util.js` — crypto: finding (INFO, line 47).
- `js/poster-cache.js:110` — `Math.random()` is a shuffle of the offline pool, not a token: cleared (read).
- `js/settings.js` — input validation: every numeric setting is clamped by `num(min,max)`/`strictNum`, enums by `oneOf`, an unknown `maxContentRating` becomes PG-13 (read, lines 52–110); `fromImport` validates the export format and version (tests/settings.test.js:94).
- `js/*.js` — DOM injection: `grep -n "innerHTML\|insertAdjacentHTML\|outerHTML\|document.write" js/*.js` → no hits (textContent/DOM APIs only).
- `tests/*.test.js` — path traversal candidates are 28 relative `../js/...` import specifiers and one fixture `waylandDisplay: '../x'` (tests/device-helper.test.js:371) that tests the helper's rejection of a relative socket path: cleared (read).
- `scripts/serve.mjs` — path traversal (read, lines 88–106): decode once, `posix.normalize`, `join(ROOT, path)`, `startsWith(ROOT + sep)`, `realpath` compared with `relative(REAL_ROOT, real)`, dotfile and allowlist check (`isAppPath`), `config.json` only to a loopback peer with a loopback Host (lines 15–16); binds 127.0.0.1 by default (line 35). Secrets/data: serves only the allowlist. Cleared.
- `scripts/device-helper.mjs` — code injection (read): commands are `spawn(file, args, { shell: false, detached: true })` with fixed argv arrays (lines 13, 87, 194); option values are validated by `check()` (lines 119–120: a Wayland display is a bare name or an absolute socket path, a runtime dir an absolute dir). Input validation: `MAX_BODY = 1024` (line 28), 413 over it (line 230), `JSON.parse` guarded (line 234), `MAX_STDOUT` on command output (line 91). Auth: loopback peer + loopback Host + `X-Poster-Helper: 1` on every route (line 151): finding (INFO, line 19, the documented reverse-proxy hazard).
- `scripts/net.mjs` — `isLoopback`/`isLoopbackHost` helpers (read, line 9: 127/8 regex, plus ::1 and localhost per its tests). Cleared.
- `scripts/mock-plex.mjs`, `scripts/check-precache.mjs` — test/tooling: no exec/eval/dynamic require; `readFileSync` of fixed repo paths (grep). Cleared.
- `tests/e2e/lib.mjs`, `tests/e2e/run.mjs` — test harness: `spawn(process.execPath, [SERVE, ...argv])` and `execSync('npm root -g')` with fixed strings (grep, lines 27, 121; run.mjs:51). Not shipped. Cleared.
- `tests/e2e/*.spec.mjs` (21 files, including the new `release.spec.mjs`) — tests only; `release.spec.mjs` read: it seeds a `shell-2.0.0` cache and wraps `navigator.serviceWorker.register` inside the test page only. Cleared.
- `index.html`, `manifest.webmanifest`, `sw.js` — secrets: none (grep); `sw.js` caches only the `SHELL` allowlist and never Plex traffic (read, header comment). Cleared.
- `package.json`, `package-lock.json`, `.github/workflows/ci.yml` — dependencies: see below. `.gitignore` — `config.json` (the token file) and `node_modules/` excluded (lines 2, 4); no `.env*` tracked (`git ls-files | grep -i '^\.env'` → none).

**Not examined / excluded:** `.orchestrator/**` (tracked audit trail: 19 validation driver `.mjs` files, evidence JSON, Markdown records) — outside the pattern bank's file set; covered for secrets/data exposure and for what the drivers connect to by `purge-git-history--security-review-r1.md` (one Medium, the owner's name in a profile path, masked in 9507326 and 84cf765; nothing else). `docs/**` (Markdown) — covered by that review and by `release-bump--scrub-pii-*-r1.md`. `node_modules/` — not tracked, not scanned. `assets/**` — images.

### Summary
| Category | Status | Findings |
|---|---|---|
| Deserialization | PASS | 0 |
| SQL injection | PASS | 0 |
| Code injection | PASS | 0 |
| Path traversal | PASS | 0 |
| Dependencies | PASS | 0 |
| Secrets / data exposure | PASS | 0 |
| Input validation | PASS | 0 |
| Auth / authz | PASS | 1 |
| Cryptographic hygiene | PASS | 2 |

### Findings

**Auth / authz** (1)
- [INFO] `scripts/device-helper.mjs:19` — The helper's guard is loopback peer + loopback Host + X-Poster-Helper header (line 151). A reverse proxy on the same machine would make every client look like loopback; the code comment and the README ('Never put a reverse proxy in front of serve.mjs') document it. Operator-controlled condition, documented: INFO.

**Cryptographic hygiene** (2)
- [INFO] `js/kiosk.js:91` — randomSalt() falls back to Math.random() for the PIN salt when crypto.getRandomValues is absent. Every supported browser has getRandomValues, so the branch is dead in production (the PIN is a deterrent, README 'Kiosk'); defence in depth: throw instead of falling back.
- [INFO] `js/util.js:47` — clientId() falls back to Date.now()+Math.random() when crypto.randomUUID is absent. The value is the X-Plex-Client-Identifier, an identifier, not a secret; randomUUID is tried first. No change needed.

**Reconciled:** ✅ table↔body tie out by construction · total 3

(SQL injection is PASS rather than PASS (n/a) because the pattern bank ran over the 35 files and returned the category empty; there is no database in the project.)

### What was verified clean
1. **Deserialization** — pattern bank empty over 35 files; no `node-serialize`/`unserialize`; `JSON.parse` sites: helper body (≤1 KiB, try/catch, device-helper.mjs:234), settings import (`fromImport` validates format/version/keys, js/settings.js), localStorage reads of the app's own JSON (js/settings.js, js/util.js). No YAML/pickle equivalents.
2. **SQL injection** — no database, no query strings (pattern bank empty).
3. **Code injection** — pattern bank empty; no `eval`/`Function`/`vm`; `spawn` with `shell:false` and fixed argv (device-helper.mjs:87, 194; tests/e2e/run.mjs:51, lib.mjs:121); `execSync('npm root -g')` fixed string (lib.mjs:27, test harness); no dynamic `import()` of user input (lib.mjs:25 imports the literal 'playwright').
4. **Path traversal** — 29 candidates cleared (all relative import specifiers in tests plus one negative fixture); serve.mjs's normalise-join-realpath-allowlist chain read (lines 88–106); helper option paths validated (device-helper.mjs:119–120); no archive extraction; no symlink-following writes (serve.mjs only reads under REAL_ROOT).
5. **Dependencies** — `secscan deps`: manifests {npm: package.json}; `npm audit` total 0 (crit 0 / high 0 / mod 0, `metadata.vulnerabilities` authoritative), so the Dependencies N of 0 equals the tool's advisory count; lockfile present (v3) and the one dep pinned exactly (`"playwright": "1.56.1"`); imported-but-undeclared: the tool lists `node:assert, node:child_process, node:crypto, node:fs, node:http, node:os, node:path, node:stream, node:test` — all Node core modules with the `node:` prefix, not packages, so not findings (adjudicated); reachability: playwright is dev-only and imported only by the e2e harness (tests/e2e/lib.mjs:25), no runtime import of anything; licence Apache-2.0 vs project MIT OK; typosquat none (`depaudit typosquat` → no close match) — details in `release-bump--dependency-audit-r1.md`.
6. **Secrets / data exposure** — pattern bank empty over 35 files; tracked-file sweep (AWS keys, private keys, `X-Plex-Token` values, api_key/secret/password literals) over everything except `.orchestrator/` and the lockfile → no hits; `.gitignore` excludes `config.json` and `node_modules/`; no `.env*` tracked; the app's logs print no token (js/plex.js masks nothing because it never logs the header; the helper logs commands, not bodies); `.orchestrator/` and `docs/` covered by the branch security review and scrub-pii (name exposure fixed at HEAD).
7. **Input validation** — settings clamped (js/settings.js `num`/`strictNum`/`oneOf`); helper body limit 1 KiB with 413 (device-helper.mjs:28, 230), stdout cap (line 91), per-command timeout and SIGKILL (line 194); serve.mjs serves static GETs from an allowlist only (no uploads, no bodies); numeric query inputs: none; Plex responses are parsed with field checks in `toPoster` (js/plex.js).
8. **Auth / authz** — the page itself has no accounts (a static PWA holding the owner's Plex token in localStorage behind an optional PIN); the helper's three guards on every route (device-helper.mjs:151) and the `config.json` loopback rule (serve.mjs:15–16) read; no cookies/sessions/JWT (nothing to flag); CSRF: the helper requires a custom header, which forces a CORS preflight that a cross-origin page cannot pass (line 10). One INFO (documented reverse-proxy hazard).
9. **Cryptographic hygiene** — PIN hash SHA-256 with a per-PIN 16-byte salt from `crypto.getRandomValues` (js/kiosk.js:88–95); two INFO fallbacks above; no MD5/SHA-1, no hand-rolled primitives, no hardcoded IVs.

### Attack surface assessment
Now Showing is a static browser app plus a small Node static server. The assets at risk are the owner's Plex token (localStorage of the display, or `config.json` beside the server) and the household content limit. Exposure is local: `serve.mjs` binds loopback by default and serves an allowlist; the opt-in device helper accepts loopback-only requests with a custom header and runs fixed commands; the page talks only to plex.tv and the chosen Plex server over https. The realistic threats are physical (a USB keyboard and DevTools on a kiosk, which the README's policy section addresses), a shared display without the PIN, and the documented reverse-proxy misconfiguration. Nothing in this scan is remotely reachable by an untrusted party.

### Recommendations (prioritized)
1. (2.1.x) `js/kiosk.js:91`: throw when `crypto.getRandomValues` is missing instead of falling back to `Math.random()`, so a hypothetical insecure context cannot produce a weak PIN salt silently.
2. Keep the README's "never put a reverse proxy in front of serve.mjs" warning when the Multiple-displays coordinator (Roadmap, D57) adds a second listener; it widens the same loopback assumption.
3. Bump playwright to 1.64.1 after the release (dependency audit, MEDIUM outdated).
