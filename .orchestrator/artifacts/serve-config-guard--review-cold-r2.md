Reviewer: serve-config-guard-review-cold-r2 · Model: opus · Dispatched: 2026-10-08T22:18:23Z · Method: cold security review, confirmation round (full scope) · Scope: serve-config-guard, round r2, base 0f1f82e, staged tree 9af4938

## What I read and ran

- **Tree check.** `git cat-file -t 9af4938` returns `tree`. `git diff-index --cached 9af4938` prints nothing, so the index matches the tree. `git diff --cached 0f1f82e | diff -q - <diff-r2.patch>` reports no difference, so the patch file is the staged change. `git write-tree` returns `9af4938f…` both before and after my work. `git status --short` is unchanged: `A scripts/net.mjs`, `M scripts/serve.mjs`, `A tests/serve.test.js`.
- **Where I ran things.** I exported the tree with `git archive 9af4938 | tar -x` into `mktemp -d` = `/tmp/tmp.WzelFS3KFI`. Every run, probe and mutation happened there.
- **Probe fixture.** I built it in a second `mktemp -d`, `/tmp/tmp.38k2VnHalI`. It contains `config.json` (`SECRET`), `index.html` and `js/a.js`, plus these special entries:
  - symlinks `js/link.json -> ../config.json`, `assets/rootfs -> /`, `assets/up -> ..`, `assets/d -> ../js`, and `assets/loop -> loop`
  - a FIFO `js/fifo.js`
  - a directory `js/sub`
- **Server setup.** I started the server with `--host 0.0.0.0 --root <fixture>` on a port the kernel assigned (`listen(0)`, port 42429). LAN-peer requests went to the host's non-internal IPv4 address, 192.0.2.2. Loopback requests went to 127.0.0.1.
- **Cleanup.** I killed all servers (`pgrep -af serve.mjs` finds none) and removed both temp dirs.
- **Tests.** Node v22.22.0. `node --test tests/serve.test.js` gives 10/10 pass with 0 skipped. `node --test tests/*.test.js` gives 39/39 pass.

## Status of r1 findings

| r1 | Status | Evidence |
|---|---|---|
| **I1** The XFF test had no teeth | **resolved** | `tests/serve.test.js:102-104` now sends `Host: localhost:<port>` with the XFF header from the LAN peer. I re-applied r1 mutation M4 (`isLoopback(req.headers['x-forwarded-for'] \|\| req.socket.remoteAddress)`). The suite now fails: 9 pass, 1 fail, with `not ok 5 - config.json path variants are never 200 for a non-loopback peer`. Reverted. A live probe from the LAN peer with `Host: localhost`, `X-Forwarded-For`, `Forwarded: for=` and `X-Real-IP` all set to 127.0.0.1 gets **403**. |
| **M1** Symlinks bypassed the allowlist and the config guard | **resolved** | `serve.mjs:71-73` now runs `realpath` and re-checks the result against `REAL_ROOT` and `isAppPath`. Probes from the LAN peer give 404 for `/js/link.json`, `/assets/rootfs/etc/passwd`, `/assets/up/config.json`, `/assets/up/assets/up/config.json` and `/assets/loop` (ELOOP). From loopback, `/js/link.json` and `/assets/up/config.json` are also 404. A legitimate in-root link still works: `/assets/d/a.js` gives 200. Tested: removing line 73 makes a test fail (9 pass, 1 fail), and so does neutering `isAppPath(rel)`. |
| **M2** Cross-site requests to 127.0.0.1 get the token with 200 | **open** (spec-gap, Minor) | `curl -D - -H 'Origin: https://evil.example' -H 'Sec-Fetch-Site: cross-site' -H 'Sec-Fetch-Mode: no-cors' http://127.0.0.1:42429/config.json` returns `200`, `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-cache`. There is no ACAO header, so I still found no way for a page to read the response. There is also still no `nosniff`, no `no-store`, and no rejection based on Sec-Fetch-Site. |
| **M3** LAN tests skip silently | **open** (code-bug, Minor) | `{ skip: !lan }` is unchanged, and it now covers 5 of the 10 tests. I preloaded a module that makes `os.networkInterfaces()` return loopback only. Results: unmutated, 5 pass and 5 skipped. **The I1 mutant (trust XFF) passes 5/0. The peer-check-removed mutant passes 5/0.** The run is green both times. So the I1 fix only has teeth on hosts that have a LAN address. |
| **M4** Prefix semantics and inexact status assertions untested | **resolved** | A new test at `:128-131` covers `/assets-private/x.png` and `/jsx/a.js`. Mutating `DIRS` to drop the trailing slash makes it fail (9 pass, 1 fail). The variant test now asserts exact 403/404. Removing the `raw !== '/config.json'` exact-spelling check makes 2 tests fail. All mutations reverted. |

## Strengths

- **Defence in layers, and each layer is now tested.** The string allowlist (`:49-50, 66`), the string containment check (`:69`) and the realpath re-check (`:71-73`) each catch something on their own. Mutation results (all reverted, verified with `diff -q`):

  | Mutation | Result |
  |---|---|
  | Drop the Host check | 1 test fails |
  | Drop the peer check | 1 test fails |
  | Drop the exact-spelling check | 2 tests fail |
  | Drop the dotfile clause | 1 test fails |
  | Drop the realpath re-check | 1 test fails |
  | Drop `isAppPath(rel)` | 1 test fails |
  | Drop the `DIRS` trailing slash | 1 test fails |

- **Remote crash and hang surface: none found.**
  - Malformed percent-encoding is 404: `/js/%E0%A4%A` and `/%`.
  - Encoded traversal is 404: `/js/..%2f..%2fconfig.json`.
  - An encoded `?` in the path is 404: `/config.json%3Fx`.
  - A missing file is 404, because `realpath` raises ENOENT and the catch at `:83` handles it.
  - A directory (`/js/sub`) and a FIFO (`/js/fifo.js`) are both 404 at once.
  - A 20 KB URL gets 431 from Node. A path of 3000 segments is 404.
  - The server still answers 200 on `/` after all of the probes above.
- **DNS rebinding and Host tricks are refused**, all with 403 from loopback: `rebind.attacker.com`, `localhost.` and `[::ffff:127.0.0.1]`.
- **The proxy-header comment at `serve.mjs:13` is now backed by a test with teeth**, at least on hosts with a LAN address (see M3).

## Issues

### Critical
None.

### Important
None.

### Minor

**N1. No test covers the `isFile()` guard. Without it, a FIFO or device node under an app directory lets a LAN client hang the server.**
- Location: `scripts/serve.mjs:74`. No test in `tests/serve.test.js` exercises it.
- Evidence: mutation T10 deletes line 74, and the suite still passes 10/10. I then ran the mutant on the fixture and sent four concurrent `GET /js/fifo.js` from 192.0.2.2. After that, `GET /index.html` returned `000` (timed out after 3 s). The blocked `readFile` calls had used up the libuv threadpool. On the unmutated server, the same four requests each got 404, and `/index.html` then gave 200. Mutation reverted, confirmed with `diff -q`.
- Why it matters: the code is correct today, but the guard is the only thing standing between a remote client and a whole-server DoS. A later refactor could drop it and CI would stay green. The precondition is a special file under `css/`, `js/` or `assets/`, which is unlikely but possible, so this is Minor.
- Class: code-bug (test weakness).
- Fix: add `mkfifo` (skip on win32) or a directory such as `js/sub` to the fixture, and assert 404 within a short timeout.

**M3 (carried, open).** See the status table. Fix: drop `skip: !lan` and fail with a clear message when no non-internal IPv4 address exists. Alternatively, make the peer check testable without a LAN address: export the handler, or add a test-only `--trust-peer` override, so that the peer test always runs.

**M2 (carried, open, spec-gap).** See the status table. Fix: for `/config.json`, return 403 when `Sec-Fetch-Site` is present and is not `same-origin` or `none`. Add `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` to that response.

## Declined to judge

- **`isLoopbackHost` accepts numeric Host forms.** `Host: 2130706433` and `Host: 127.1` from a loopback peer both get 200. The cause is that the WHATWG URL parser normalises them to `127.0.0.1`. A browser only sends such a Host when the page's own origin is that numeric loopback address, so a rebinding page cannot produce it. Not exploitable. It is the same category as r1's `evil@localhost` note.
- **The `rel.startsWith('/..')` check (`:73`) has no test of its own.** Mutation T4 removes it and the suite still passes. For non-config paths it is redundant, because `isAppPath(rel)` already rejects `/..` paths. For `/config.json` it only stops serving a config.json that is a symlink leaving the root, to a client that already passes the loopback checks. Whether that should be allowed is a product question.
- **The NUL check (`:57`) has no test.** Node's fs APIs throw on NUL themselves, and the catch turns that into 404, so the check is belt-and-braces.
- **TOCTOU between `realpath(file)` and `stat`/`readFile(file)`.** Swapping a symlink between those calls needs local write access to the served tree, which already gives access to config.json.
- **Out of the diff, as in r1:** `Service-Worker-Allowed` on any `*sw.js`, every HTTP method being treated as GET, and `--mock` binding to `HOST`.
- **Whether config.json should require a loopback Host at all.** Product question, as in r1.

## Recommendations

1. Fix M3 so the peer and XFF tests cannot skip themselves into a green run. This matters most, because the I1 fix depends on it.
2. Add a FIFO or directory case to the fixture (N1).
3. Optionally, add the M2 response hardening.

## Assessment

r1's Important finding (I1) is resolved, and so are the symlink bypass (M1) and the allowlist test gaps (M4). I re-attacked the whole diff:
- traversal, encoding, case and dot-segment variants
- symlinks out of the root, back to the root, and in loops
- dotfiles, FIFOs and directories
- proxy-header and Host spoofing, and DNS rebinding
- malformed and oversized URLs

None of these reached config.json or a file outside the app files from a LAN peer or a rebinding page. None crashed or hung the server. What remains are Minor test-robustness gaps (M3, N1) and one spec-gap hardening item (M2). None of them is a defect in the shipped behaviour.

Files read: /home/user/plex-poster-app/.orchestrator/artifacts/serve-config-guard--diff-r2.patch, /home/user/plex-poster-app/.orchestrator/artifacts/serve-config-guard--review-cold-r1.md, scripts/serve.mjs (exported copy of tree 9af4938, lines 40-100; the rest via the patch); scripts/net.mjs and tests/serve.test.js read in full via the patch; directory listings of scripts/ and tests/

**Verdict:** APPROVE
