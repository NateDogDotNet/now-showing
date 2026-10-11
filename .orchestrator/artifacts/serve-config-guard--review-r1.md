Reviewer: serve-config-guard-review-anchored-r1 · Model: opus · Dispatched: 2026-10-08T22:10:01Z · Method: anchored code review · Scope: serve-config-guard, round r1, base 0f1f82e, staged tree 0f25e58

## What I read and ran

Read: `docs/integration-plan.md` section "### 4. `serve-config-guard`" (lines 137-158); `docs/spec.md` R-SEC-1 (lines 77-81); `docs/decisions.md` D9 (line 18) and D12 (line 21); the staged diff (`git -C /home/user/wt-serve-config-guard diff --cached`); the full staged `scripts/serve.mjs`; and, for the regression check, `index.html` href/src, the `sw.js` SHELL list, `manifest.webmanifest`, `README.md` and `package.json`.

Where I ran it: I extracted the staged tree with `git archive 0f25e58 | tar -x` into a private `mktemp -d` directory (`/tmp/tmp.ULmzqm6p9b`). The test fixture root was a second `mktemp -d` (`/tmp/tmp.doVAtEcMek`). I ran every server, probe and mutation there, removed both directories at the end, and left the worktree and index untouched. The host has non-loopback IPv4 address 192.0.2.2 and no IPv6 (connecting to `::1` returned EAFNOSUPPORT).

| Criterion | Command | Result |
|---|---|---|
| 1 | `node --test tests/serve.test.js` | 7 tests: pass 7, fail 0, skipped 0 |
| 2 | `npm test` | 36 tests: pass 36, fail 0 |
| 3 | grep chain | ok |
| 4 | `! grep -qiE 'x-forwarded\|forwarded' scripts/serve.mjs scripts/net.mjs` | ok. The comment wording "proxy headers are never consulted" is at `scripts/serve.mjs:13` |
| 5 | `git status --porcelain -- js css index.html sw.js scripts/mock-plex.mjs` (in the worktree) | empty |
| 6 | the LAN tests ran on 192.0.2.2 | `# skipped 0` |

Raw-socket probes against `serve.mjs --host 0.0.0.0 --root <fixture>` (`node:net`, request bytes sent exactly as written):

**config.json from a loopback peer:**

| Request | Result |
|---|---|
| `Host: LOCALHOST:<p>` | 200 |
| `Host: 127.1` | 200 |
| `Host: evil.example@localhost` | 200 |
| `Host: localhost.` | 403 |
| `Host: [::ffff:7f00:1]:<p>` | 403 |
| HTTP/1.0 with no Host | 403 |
| HTTP/1.1 with no Host | 400 (rejected by Node) |
| duplicate Host (`evil.example`, then `localhost`) | 403 |
| `HEAD` | 200, empty body |
| `?x=1` | 200 |
| absolute-form `GET http://localhost/config.json` | 404 |
| connecting to `0.0.0.0` | 200 (the kernel reports the peer as 127.0.0.1, so it really is local) |

**From the LAN address 192.0.2.2:**

| Request | Result |
|---|---|
| `HEAD /config.json` | 403 |
| `POST /config.json` | 403 |
| `/%E0%A4%A` | 404 |
| `/config.json%2f` | 404 |
| `/js/..%2fconfig.json` | 404 |
| `/js/..%5cconfig.json` | 404 |
| `/js/%2e%2e/%2e%2e/etc/passwd` | 404 |
| `/config.json;x` | 404 |
| `/config.json%20` | 404 |
| `*` | 404 |
| a 5000-character path | 404 |
| `/js/` plus 300 characters (ENAMETOOLONG) | 404 |
| `/js/` plus 70000 characters | connection reset (Node header limit) |
| `/js/a.js` over HTTP/1.0 with no Host | 200 |
| `/assets/leak.png`, a symlink to `../config.json` | **200, body contains SECRET** |
| `/assets/rootfs/etc/hostname`, a symlink to `/` | **200** |
| `/js/.env` | 200 |

**App regression check:** the scratch copy of the real repo, served with default host 127.0.0.1 plus `--mock`:
- 200 with correct types for every `sw.js` SHELL entry, `/sw.js`, every manifest icon and screenshot, and every `assets/` path referenced from `index.html`, `js/` and `css/`.
- `/config.json` on loopback: 200.
- The mock server came up (`/identity` returned 401 without a token, which is expected).
- The README sends users only to `http://localhost:8080/`, which still serves the index. It has no relative links to repo files.

**`--root`:** a relative path and a path with a trailing slash both resolve correctly. `--root /` fails closed (everything 404).

**Mutation testing** (scratch copy only; every mutant reverted and checked byte-identical against `git show 0f25e58:<file>`):

| Mutant | Result |
|---|---|
| M1: drop the peer check | killed |
| M2: drop the Host check | killed |
| M3: drop the exact-spelling rule | killed |
| M4: drop the allowlist | killed |
| M6: drop the `::ffff:` handling | killed |
| M7: compare Host including the port | killed (2 tests) |
| M8: prefix-match the Host | killed (2 tests) |
| **M5: take the peer from a forwarded-for header** (word split so criterion 4's grep misses it) | **survived** |
| M9: loose `startsWith('127')` loopback match | survived |
| M10: case-sensitive config.json compare | survived (the allowlist catches it anyway) |
| M11: `DIRS` without trailing slash | survived |

## Strengths

- The allowlist is applied after normalisation (`posix.normalize`, trailing slash stripped, lower-case compare against `/config.json`). On top of that, only the exact raw spelling `/config.json` is ever served, so dot-segment, double-slash, case and percent-encoded variants are 404 even from loopback.
- A malformed percent-encoding throws inside the `try` and becomes 404 (`serve.mjs:75-76`). Missing files and ENAMETOOLONG also become 404, not 500.
- `isLoopback` is strict: anchored dotted-quad, octets ≤ 255, IPv4-mapped prefix handled, `::1`. `isLoopbackHost` uses `new URL('http://' + host).hostname` as the plan requires. Both are fail-closed for non-string or empty input and import without starting a server.
- The header comment carries the reverse-proxy hazard and the exact "proxy headers are never consulted" wording.
- The free-port and retry start-up satisfies D12. The fixture root is a temp dir, so no `config.json` is written into the repo.
- The tests add useful extras beyond the criteria: `/js/../config.json`, `/js/%2e%2e/config.json`, `/config.json%00.js`, the variants from loopback, and `localhost@evil.example`.
- `--mock` is untouched, as the hazard note asks. Nothing the app or README needs is newly 404.

## Issues

### Important

**I1. The X-Forwarded-For assertion has no teeth, and does not test the request criterion 1 names.**
- Class: `code-bug`.
- Location: `tests/serve.test.js:101`.
- Evidence: the assertion is `get('/config.json', { to: lan, headers: { 'X-Forwarded-For': '127.0.0.1' } })`. It sends the default `Host: 192.0.2.2:<port>`, so the Host check alone produces the 403.
- Mutant M5 makes the server take the peer from `x-forwarded-for` before `remoteAddress`. The suite still passed (pass 7, fail 0). Criterion 4's grep is not a backstop either: it only catches the literal word, and a header such as `x-real-ip` would get past both.
- Criterion 1 reads: "loopback GET /config.json with `Host: localhost:<port>` is 200; **the same** from the machine's non-loopback IPv4 address is 403; with `X-Forwarded-For: 127.0.0.1` still 403". The XFF case is meant to be that same Host-localhost request.
- I patched the scratch copy to add `host: \`localhost:${port}\``. The real code then passed 7/7, and M5 was killed (fail 1).
- Why it matters: this is the risk:high boundary, and the test is its regression guard. `device-helper-server` will reuse the same peer logic.
- Fix: add `host: \`localhost:${port}\`` to the XFF assertion. Optionally also send `X-Real-IP: 127.0.0.1` and `Forwarded: for=127.0.0.1` on the same request. The header names may appear in the test file, because criterion 4 greps only `scripts/`.

### Minor

**M-1. Symlinks under allowed directories escape the root.**
- Class: `spec-gap` (the criteria and the hazard notes say nothing about symlinks).
- Location: `serve.mjs:64-67`. `join` and the `startsWith(ROOT + sep)` check are lexical, and `stat` and `readFile` follow links.
- Evidence: from the LAN, a symlink `assets/leak.png -> ../config.json` returned 200 with the token. A symlink `assets/rootfs -> /` served `/etc/hostname`.
- The repo has no symlinks today (`find -type l` found only the worktree's `.orchestrator` link at the root, which the allowlist does not cover), and exploiting this needs local write access. It does still break R-SEC-1's "config.json only to loopback" under a plausible setup, such as a user who links `assets/` to shared media.
- Fix: `realpath` the file and require it to stay under `realpath(ROOT)`. Also refuse it when it equals `realpath(ROOT/config.json)` unless the config branch was taken.

**M-2. Dotfiles under `css/`, `js/` and `assets/` are served.**
- Class: `spec-gap`.
- Evidence: `/js/.env` returned 200 from the LAN.
- R-SEC-1 lists "dotfiles" among the paths that are 404 for every client. D9 and the hazard note allow "everything under" the three directories. The change follows D9, and the two documents disagree.
- Fix, if the conductor wants it: reject any path segment that starts with `.`.

**M-3. Mutants M9 and M11 survive.**
- Class: `spec-gap` (the criteria do not ask for these cases).
- M9 (loose `127` prefix match) is harmless in practice, because the kernel never reports a remote address like `1270.0.0.1`.
- M11 (`DIRS` without trailing slashes) would serve sibling directories such as `/assets-private/x` and `/jsx/`, and no test would notice.
- Fix: add `isLoopback('1270.0.0.1') === false` and a LAN 404 case for a sibling directory such as `/css-x/a.css`.

## Declined to judge

- **Host forms the WHATWG URL parser normalises to an accepted hostname:** `127.1`, `0x7f.1`, `evil.example@localhost`, `[0:0:0:0:0:0:0:1]`. From a loopback peer these are accepted. The plan prescribes this parser, and none of these Host values can come from a DNS-rebinding browser, which sends the attacker's hostname. I see no exposure and will not rule against the prescribed method.
- **HTTP method:** `DELETE /index.html` returns 200, the same as GET. This is pre-existing behaviour outside the criteria, and only allowlisted files are reachable.
- **IPv6 peer path:** this sandbox has no IPv6, so I could not run a real `::1` peer. `isLoopback('::1')` is unit-tested, and the server binds `0.0.0.0` (IPv4) in the tested mode.
- **README note on the reverse-proxy hazard:** the plan defers it to the `docs` phase.
- **A stray process** `node scripts/serve.mjs --host 0.0.0.0 --port 45959 --root /tmp/tmp.8oQC31hJYu` (PID 5103, parent PID 1) was running on the host. It is not mine and I left it alone. The conductor may want to check whether another agent leaked it.

## Recommendations

1. Fix I1 (a one-line test change). Then re-run criterion 1 and confirm that mutant M5 now fails it.
2. Consider the `realpath` containment check (M-1). It is cheap, and `device-helper-server` will inherit this file's patterns.
3. The conductor should rule on the D9 vs R-SEC-1 dotfile wording (M-2).

## Assessment

The implementation itself is sound. Every bypass the brief lists (and several more) came back 404 or 403 from the LAN. The app, `npm start` and `--mock` are unaffected, and criteria 2-6 pass. Criterion 1 also passes, but one of its named assertions (XFF with a loopback Host from the LAN) is not what the test sends. As a result, a server that trusts a forwarded-for header would pass the suite. On a risk:high boundary I do not approve with that guard missing. It is a small test fix, and no implementation change is needed for I1.

**Verdict:** CHANGES REQUESTED
