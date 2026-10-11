Reviewer: serve-config-guard-review-cold-r1 · Model: opus · Dispatched: 2026-10-08T22:10:01Z · Method: cold security review · Scope: serve-config-guard, round r1, base 0f1f82e, staged tree 0f25e58

## What I read and ran

- Confirmed the reviewed tree: `git cat-file -t 0f25e58` gives `tree`. `git diff-index --cached 0f25e58` is empty, so the index matches the tree. `git diff --cached 0f1f82e` is byte-identical to the patch file.
- Exported the tree with `git archive 0f25e58 | tar -x -C $(mktemp -d)` into `/tmp/tmp.KLtSte3nQI`. Every server and mutation run below happened there, on ports the kernel assigned (`listen(0)`). The probe fixture root was a second `mktemp -d` (`/tmp/tmp.8oQC31hJYu`) holding `config.json` containing `SECRET`, `js/a.js`, a symlink `js/link.json -> ../config.json`, a symlink `assets/rootfs -> /`, and a FIFO `js/fifo.js`. I started the server with `--host 0.0.0.0 --root <fixture>`. LAN-peer requests went to the host's non-internal address 192.0.2.2. Loopback requests went to 127.0.0.1.
- I removed both temp dirs and killed both servers afterwards. `git status --short` in `/home/user/wt-serve-config-guard` is unchanged (`A scripts/net.mjs`, `M scripts/serve.mjs`, `A tests/serve.test.js`).
- Test runs: `node --test tests/serve.test.js` gives 7/7 pass with 0 skipped (a LAN interface exists here). `node --test tests/*.test.js` gives 36/36 pass. Node v22.22.0.

## Strengths

- **Allowlist instead of blocklist** (`scripts/serve.mjs:46-47, 62`). A path outside `FILES`/`DIRS` is 404 whatever the encoding. That closes whole bug classes at once: Windows trailing-dot and ADS names, case-insensitive filesystems, `.git`, `docs`, `package.json`.
- **Decode, normalise, then check, in that order** (`:52-55`). Malformed `%` throws and the catch returns 404. NUL and backslash are rejected. Absolute-form and `*` request targets fail the `startsWith('/')` check. Every probe returned 404: `/js/%2e%2e/config.json`, `/js/..%2fconfig.json`, `/js/%2e%2e%5cconfig.json`, `/js/%E0%A4%A`, `GET http://localhost/config.json`, `GET *`.
- **config.json is served only under narrow conditions** (`:56-59`). Every case/dot/slash variant is 404 even from loopback. The exact path is 403 unless the socket peer is loopback **and** Host is a loopback name. Probe results:
  - DNS-rebinding Hosts get 403: `rebind.attacker.com`, `localhost.`.
  - A missing Host (HTTP/1.0) gets 403.
  - A LAN peer sending `Host: localhost` plus `X-Forwarded-For: 127.0.0.1` and `X-Real-IP: 127.0.0.1` gets 403.
  - With duplicate Host headers Node keeps the first one, so a rebinding page cannot slip a second `Host: localhost` past the check. The order `rebind`, then `localhost` gives 403.
- The 403 is returned before `stat`, so it does not reveal whether the file exists.
- **No hang from special files.** `isFile()` sends a FIFO to 404 straight away. A 20 KB URL gets Node's 431. Errors land in the catch, and I found no crash path.
- **The main guards are tested.** Mutations M1 (drop the Host check), M2 (drop the exact-spelling check) and M3 (drop the peer check) each make a test fail (see below).

## Issues

### Important

**I1. The test for "proxy headers are never consulted" cannot catch the regression it is meant to catch.**
- Location: `tests/serve.test.js` line 98: `get('/config.json', { to: lan, headers: { 'X-Forwarded-For': '127.0.0.1' } })`.
- Evidence: I applied mutation M4, replacing `isLoopback(req.socket.remoteAddress)` with `isLoopback(req.headers['x-forwarded-for'] || req.socket.remoteAddress)`. The suite then passes 7/7. The reason is that the test leaves Host at its default, `192.0.2.2:<port>`, so `isLoopbackHost` rejects the request and it gets 403 whatever happens to the peer check. Against the same mutant:
  - LAN peer with `Host: localhost` and `X-Forwarded-For: 127.0.0.1` gets **200 with the token**.
  - The test's own request, with the LAN Host, gets 403.

  Unmutated, the `Host: localhost` + XFF request gets 403. I reverted the mutation and confirmed it with `diff -q`.
- Why it matters: trusting XFF is the classic way this guard breaks, and the source comment at `serve.mjs:13` promises it never happens. Someone "adding proxy support" later would pass CI and leak the credential to the LAN.
- Class: code-bug (the test does not pin a property the change itself asserts).
- Fix: send `host: \`localhost:${port}\`` together with the XFF header (and also `X-Real-IP` and `Forwarded: for=127.0.0.1`), and assert 403.

### Minor

**M1. Symlinks inside allowlisted directories are followed, so the allowlist and the config.json guard can be bypassed.**
- Location: `serve.mjs:64-67`. The containment check (`file.startsWith(ROOT + sep)`) works on the path string only, and `stat`/`readFile` then follow links.
- Evidence: from LAN peer 192.0.2.2, `GET /js/link.json` (a link to `../config.json`) returned **200 with the token**, and `GET /assets/rootfs/etc/passwd` returned **200 with `/etc/passwd`**.
- Why it matters: a remote client cannot create the link, so this needs a symlink already present under `css/`, `js/` or `assets/`. Linking `assets/` to a media folder is a plausible thing for a kiosk owner to do. It contradicts the header comment's "everything else is 404".
- Class: spec-gap. The criteria are presumably silent on symlinks, and I have not seen them.
- Fix: `realpath(file)`, then require the result to start with `realpath(ROOT) + sep` and not equal `realpath(ROOT/config.json)` unless the config branch was taken. Alternatively, open with `O_NOFOLLOW` or use `lstat`, if symlinks are never wanted. Add a test that uses a symlink in the fixture.

**M2. Cross-origin requests from a browser on the same machine to 127.0.0.1 get the token with status 200. Only the browser's same-origin policy keeps the page from reading it.**
- Evidence: `curl -si -H 'Origin: https://evil.example' http://127.0.0.1:<port>/config.json` returns `200`, `Content-Type: application/json`, and no `Access-Control-Allow-Origin`. A raw request with `Origin: https://evil.example`, `Sec-Fetch-Site: cross-site` and `Sec-Fetch-Mode: no-cors` also gets 200 with the token.
- Why it matters: I found no read primitive today. There is no ACAO header, a JSON object is not valid script, and ORB blocks JSON in no-cors mode. Still, the server sends the secret to requests it can tell are cross-site, and there is no `X-Content-Type-Options: nosniff` as a backstop.
- Class: spec-gap (defense in depth the criteria evidently do not require).
- Fix: for `/config.json`, return 403 when `Sec-Fetch-Site` is present and is not `same-origin`/`none`, or when `Origin` is present and not loopback. Add `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` to that response.

**M3. The LAN-peer tests skip silently on hosts without a non-internal IPv4 interface.**
- Location: `tests/serve.test.js` lines 24, 87, 112 (`{ skip: !lan }`).
- Why it matters: on such a CI runner or container, every non-loopback-peer test is skipped. That includes the only test with teeth for M3 above (dropping the peer check). The run still shows green.
- Class: code-bug (test robustness).
- Fix: when no LAN address exists, fail, or at least `console.warn` loudly. Alternatively, unit-test the request handler with a stubbed `req.socket.remoteAddress` so the peer check is always exercised.

**M4. The allowlist's prefix semantics are untested.**
- Evidence: mutation M6 (`DIRS = ['/css','/js','/assets']`, which would also serve `/jsbackup/`, `/css-old/` and so on) passes 7/7. The unmutated server correctly returns 404 for `/jsbackup/a.txt`. Mutation M7 (variant spellings return 403 instead of 404) also passes, because the variant tests assert only `!== 200`. Both mutations reverted.
- Class: code-bug (test weakness).
- Fix: add a sibling-prefix path such as `/jsx/a.js` to the 404 list, and assert exact statuses.

## Declined to judge

- **Whether a loopback Host should be required for config.json at all.** For example, a kiosk browser on another device reaching the app over the LAN can never get its config. That is a product question.
- **`--root` accepting any directory.** It is operator-controlled, not remotely reachable. With `--root /` the server returns 404 for everything, because `ROOT + sep` becomes `//`. That fails closed, so I am not ruling on it.
- **Pre-existing, unchanged behaviour:**
  - Any `*sw.js` under `/js/` gets `Service-Worker-Allowed: /` (`serve.mjs:72`).
  - Every HTTP method is answered like GET.
  - `--mock` binds the mock Plex server to `HOST`.
- **Local non-browser processes reading the token over loopback.** Anything running on the machine already has filesystem access to it.
- **`isLoopbackHost('evil@localhost')` returns true** (probe gave 200 from loopback). Browsers never send userinfo in Host, and a client that can send it is already a loopback peer, so it is not exploitable.

## Recommendations

1. Fix I1 (one-line test change). Then re-run mutation M4 and confirm the test fails.
2. Add `realpath` containment (M1), plus the cheap `Sec-Fetch-Site`/`nosniff`/`no-store` hardening on the config.json response (M2).
3. Make the LAN tests fail loudly instead of skipping (M3), and tighten the status assertions (M4).

## Assessment

I found no remote path to `config.json` or to files outside the app in the code as written. That covers path traversal, encoding, case, dot-segment, header spoofing, DNS rebinding and duplicate-Host tricks, and I found no crash or hang. The one exception, the symlink bypass, needs a link that is already on disk. The test suite is the weaker part. The regression test for proxy-header trust has no teeth: an XFF-trusting mutant passes all 7 tests and leaks the token to a LAN client. That is cheap to fix and it guards a property the change states outright, so I am requesting changes.

Files read: /home/user/plex-poster-app/.orchestrator/artifacts/serve-config-guard--diff-r1.patch, /home/user/wt-serve-config-guard/scripts/serve.mjs, /home/user/wt-serve-config-guard/package.json, /home/user/wt-serve-config-guard/.gitignore (via cat; scripts/net.mjs and tests/serve.test.js read in full via the patch; directory listings of the worktree, scripts/ and tests/)

**Verdict:** CHANGES REQUESTED
