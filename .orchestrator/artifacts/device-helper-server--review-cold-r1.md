Reviewer: device-helper-server-review-cold-r1 · Model: opus · Dispatched: 2026-10-08T22:44:29Z · Method: cold security review · Scope: device-helper-server, round r1, base 0914090, staged tree f9cf001

## What I read and ran

- Read the patch, plus `scripts/device-helper.mjs`, `scripts/serve.mjs`, `scripts/net.mjs` and `tests/device-helper.test.js` in `/home/user/wt-device-helper-server`. I confirmed that `git write-tree` gives `f9cf00150d8c…` and HEAD is `0914090`.
- I exported the staged tree with `git archive $(git write-tree) | tar -x` into `mktemp -d` at `/tmp/tmp.s3EOpVnjfl/src`. All runs happened there. The live tree was not modified (`git status --short` was the same before and after). I removed the temp dir and killed every process I started afterwards.
- `node --test tests/device-helper.test.js` on Node v22.22.0: 29 pass, 0 fail.
- Real (non-fake) mode: I put a fake `cec-ctl` shell script first on PATH that records argv, env and pid, and sleeps when a flag file exists. I started `serve.mjs --host 0.0.0.0 --helper` on a kernel-assigned port with `PLEX_TOKEN=SECRET` in its environment. I sent curl probes from the loopback address and from the LAN address (192.0.2.2).
- Two scratch harness scripts (`abort.mjs`, `orphan.mjs`) drove `createHelper` with real `execFile`, and with aborted or oversized bodies.
- I ran 9 mutations of `device-helper.mjs` against the test file and reverted each one (I copied the original back and re-ran: 29/29 pass).

## Strengths

- **LAN guard holds.** With `--host 0.0.0.0`, a LAN peer gets 403 on `POST /__helper/display` even when it sends `Host: localhost` and `X-Poster-Helper: 1`. Output: `LAN POST display 403`. The fake binary's call log did not grow.
- **DNS rebinding is blocked.** A loopback peer with `Host: attacker.example:<port>` got 403.
- **Simple requests are blocked.** A form-encoded POST without the custom header got 403.
- **No CORS grant.** `OPTIONS` with `Origin: http://evil.example` and `Access-Control-Request-Headers: x-poster-helper` got 404 with no `Access-Control-*` headers. A browser therefore cannot send the custom header cross-origin.
- **No injection.** The fake binary received exactly `-d /dev/cec0 --to 0 --standby`. Its environment held only `PATH` (plus the `PWD` that sh adds itself), and `PLEX_TOKEN` was not passed to the child. Extra body keys are ignored. Argv is fixed, `shell: false`, and the flag/env values are validated by regex and a `..` check before the server listens.
- **Lock and timeout work with a real child.** While a command hung, a concurrent request got `503 busy`. The hung request got `504` after 5.017 s, and the direct child pid was killed.
- **Body limits hold.** An oversized body (5000 B) and an aborted mid-body request both resolve. Neither runs a command or crashes the server, and there was no unhandled rejection or uncaught exception (harness output: `server sent 413 for oversize`, `server sent 413 for aborted`).
- **Information leak is small.** `status` returns only the strategy name and a temperature. Command stderr and errors are not echoed (the test covers this). `/__helper/calls` exists only in fake mode and is guarded.
- **Most mutations are caught.** Removing the header check (3 fail), the guard (4 fail), the busy release (6 fail), the kill (1 fail), the `..` check (1 fail) or the `timeout` option (2 fail) each breaks a test.

## Issues

### Critical
None.

### Important
None.

### Minor

**M1. A timeout kills only the direct child, so grandchildren are orphaned and pile up while the lock reports idle.**
- Class: code-bug, against the module's own claim "One at a time, 5 s timeout, killed on timeout".
- Location: `scripts/device-helper.mjs:125-131`. Here `child.kill('SIGKILL')` and `execFile`'s `killSignal` target one pid, and the child is not spawned `detached`.
- Evidence: the fake `cec-ctl` was a wrapper script that runs `sleep 30`. With real `execFile` and `timeoutMs: 200`, four sequential calls all returned `504`, and `pgrep -x sleep` then showed `orphaned sleeps: 4`. On the live server the same thing happened with one call: the wrapper pid died, and `9877 sleep 30` was left running.
- Why it matters: the "one at a time" bound only covers the process the helper tracks. If the configured binary is a wrapper script or forks (distro shims, `cec-client` builds that spawn helpers), a local caller can stack one stuck process every 5 s. Reaching this needs a loopback peer with the header, so it is limited to same-origin script or local processes.
- Fix: spawn with `detached: true` and kill the process group (`process.kill(-child.pid, 'SIGKILL')`). Alternatively, keep `busy` set until the child's `close`/`exit` event, not just the timer.

**M2. LAN clients can tell whether the helper is enabled, and whether it is in fake mode.**
- Class: spec-gap.
- Location: `scripts/device-helper.mjs:180-181`. The route-existence 404 is checked before the 403 guard.
- Evidence: a LAN probe to `GET /__helper/status` returned `403` with `--helper`. Without `--helper` the integration test shows 404. `GET /__helper/calls` is 404 in real mode and 403 in fake mode (`calls is 404 without fake mode, and guarded with it`).
- Why it matters: this is a small fingerprint (the box runs the display helper, and possibly in test mode) for any LAN host. No command can be reached through it.
- Fix: for non-loopback peers, answer every `/__helper/*` request with the same status (for example 404) before checking whether the route exists.

**M3. Test gap: an environment leak to the cec strategies would go undetected.**
- Class: code-bug (test weakness).
- Location: `tests/device-helper.test.js:308-326`. The cec-ctl and cec-client tests never assert on `opts.env`, and `make()` injects `env: {}`.
- Evidence: I made this mutation:
  ```
  { ...base, ...cfg.env } : base  ->  { ...base, ...cfg.env } : { ...env, ...base }
  ```
  It forwards the whole server environment (including any Plex token) to `cec-ctl` and `cec-client`. The result was `# pass 29 # fail 0`. I reverted it.
- Why it matters: the runtime is currently correct (my real-mode run showed only PATH), but nothing stops a regression.
- Fix: in the cec tests, pass `env: { PATH: '/x', PLEX_TOKEN: 'SECRET' }` and assert `Object.keys(c.opts.env)` deep-equals `['PATH']`.

**M4. Misleading 413 responses.**
- Class: code-bug (cosmetic).
- Location: `scripts/device-helper.mjs:112-116, 140`.
- Evidence: the oversized request's client got `ECONNRESET`, not the 413, because `req.destroy()` runs before the response is written. An aborted or errored request is also labelled `413 body too large` (harness: `server sent 413 for aborted`).
- Why it matters: it only affects diagnostics. There is no security impact.
- Fix: stop reading on overflow, but send the 413 before destroying (or use `res.end` followed by `req.socket.end`). Map stream errors to 400.

**M5. Fake mode's call log grows without bound.**
- Class: spec-gap.
- Location: `scripts/device-helper.mjs:148`.
- Why it matters: a looping local caller can grow memory without limit when fake mode is used for demos. There is no LAN reach.
- Fix: cap `calls` (for example, keep the last 1000).

## Declined to judge

- **Who on the same machine may call the helper.** Any local process or user can call it, and so can any script on the same origin, including a script injected through XSS in the poster page itself. This is a trust-boundary and product question, and the poster page's rendering is outside this diff.
- **No rate limit on toggling.** A same-origin script can flip CEC power repeatedly, one call at a time. Whether that matters is a product question.
- **Command syntax on real hardware.** Whether `cec-ctl --to 0 --image-view-on`, `cec-client -s -d 1` stdin and `wlr-randr --output … --on/--off` are correct, and the default 1 MB `maxBuffer` against `cec-client` output volume. I could not verify these without hardware, and I did not run real display commands.
- **`--helper-power` given with no value.** `opt()` returns undefined and the helper silently auto-detects instead of refusing (`serve.mjs:29-32`, a pre-existing parser). This is minor UX, outside the security scope.
- **The reverse-proxy hazard.** It is documented in the code comments, and the server has no way to defend against it.

## Recommendations

1. Fix M1: use process-group kill, or hold the lock until the child exits.
2. Add the env assertion from M3 to the cec tests.
3. Consider a uniform response to non-loopback peers (M2), and a cap on the fake call log (M5).

## Assessment

The security core holds, and I tested it from a real LAN address: socket-peer check, loopback Host check, custom header with no CORS grant, fixed argv with no shell, minimal child env, validated flags, body cap, single-flight lock and timeout. I found no way for a LAN client or a cross-origin or rebinding web page to run or influence a command, and no remote crash. The findings are all Minor: orphaned grandchildren after a timeout (reachable only from loopback), a small enabled/fake fingerprint, one test gap and cosmetic status codes. None of them blocks the phase.

Files read: /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--diff-r1.patch, /home/user/wt-device-helper-server/scripts/device-helper.mjs (via patch and temp copy), /home/user/wt-device-helper-server/scripts/serve.mjs, /home/user/wt-device-helper-server/scripts/net.mjs, /home/user/wt-device-helper-server/tests/device-helper.test.js (via patch)

**Verdict:** APPROVE
