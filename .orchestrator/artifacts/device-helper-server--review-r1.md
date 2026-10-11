Reviewer: device-helper-server-review-anchored-r1 · Model: opus · Dispatched: 2026-10-08T22:44:29Z · Method: anchored code review · Scope: device-helper-server, round r1, base 0914090, staged tree f9cf001

## What I read and ran

Read: `docs/integration-plan.md` section 15 (criteria 1-7, Notes); `docs/spec.md` R-HELP-1 and R-SEC-1; `docs/decisions.md` (grep for D8/D9/D12); `.orchestrator/questions.md` Q-dhs1/Q-dhs2 and the rulings; `git diff --cached` in `/home/user/wt-device-helper-server` (`scripts/device-helper.mjs`, `scripts/serve.mjs`, `tests/device-helper.test.js`); `scripts/net.mjs`.

Ran: I extracted tree `f9cf001` with `git archive | tar` into a `mktemp -d` directory under the session scratchpad. Everything below ran there, on ports that `listen(0)` reported free. Afterwards I removed the directory. `git status` and `git write-tree` in the reviewed worktree still give `f9cf001` with nothing changed. Node v22.22.0.

- Criteria 1-6: `node --test tests/device-helper.test.js` passed 29/29. `npm test` passed 72/72. `tests/serve.test.js` passed 14/14. The C3, C4 and C5 greps found nothing, which is what they require. The C6 porcelain check is empty. **All pass.**
- Criterion 7, live: I put stub `cec-ctl`, `cec-client` (`exec sleep 30`) and `wlr-randr` scripts on PATH. Each stub logs its argv and full env. I started `serve.mjs --host 0.0.0.0 --helper` with `PLEX_TOKEN=SECRET` in the environment.
  - Hostile bodies all got 400 and ran no command: `{"on":"false; reboot"}`, a duplicate key ending in `"x"`, and `{"__proto__":{"on":true}}`.
  - A cross-site simple request (text/plain POST, `Origin: http://evil.example`, no custom header) got **403**.
  - Rebinding and hostile Hosts got **403**: `evil.example:P`, `localhost.evil.com`, `localhost@evil.com`, `127.0.0.1.nip.io`. A doubled `X-Poster-Helper` header (`1, 1`) also got 403.
  - From the LAN address 192.0.2.2, with `X-Forwarded-For: 127.0.0.1` and `Forwarded: for=127.0.0.1`, the request got **403**.
  - An OPTIONS preflight got 404 with no `Access-Control-*` header.
  - `POST /__helper/brightness` got 404. `/__helper/calls` without fake mode got 404.
  - Path escapes all got 404, and none served a file: `/__helper/../index.html`, `/__helper/%2e%2e/config.json`, `/__helper/../scripts/device-helper.mjs`, `/%5f_helper/status`.
  - The stub log shows the exact argv: `-d /dev/cec0 --to 0 --standby` and `--image-view-on`. The cec env was `PATH` only, plus the `PWD` that sh adds itself. There was no `PLEX_TOKEN`.
  - With `--helper-power wlr-randr --helper-output HDMI-A-1` and `PLEX_TOKEN`, `HOME` and `DBUS_SESSION_BUS_ADDRESS` set: argv was `--output HDMI-A-1 --off` and env was `PATH`, `WAYLAND_DISPLAY=wayland-0`, `XDG_RUNTIME_DIR=/run/user/1000`, nothing else.
- Hung command and concurrency (`--helper-power cec-client`, stub sleeps 30 s): the first POST returned **504 after 5.009 s**. Two concurrent POSTs fired while it ran got an immediate **503 busy**. `pgrep -xc sleep` counted 1 process during the run and 0 after. The next command ran normally, so the lock was released.
- Hostile flags and env: each of these exits 1 with a message before listening.
  - `--helper-output -x`, `a/../b`, `HDMI-A-1;id`
  - `--helper-output --off`, which `opt()` drops, so the helper refuses to start without an output
  - `--helper-power bash`, `__proto__`, `constructor`
  - `--helper-xdg-runtime-dir /run/../etc`
  - env `WAYLAND_DISPLAY='x;id'`
- Fake mode on `--host 0.0.0.0`: `/__helper/calls` from the LAN address got 403. The allowlist is unchanged: `/package.json`, `/docs/spec.md` and `/.orchestrator/x.md` got 404 from the LAN, `/config.json` from the LAN got 403, and `/index.html` got 200.
- Mutation testing: 26 mutants. I applied each with an exact-string replace, ran `tests/device-helper.test.js`, then restored the file from a `.bak` copy. **25 were killed.** The killed set covered:
  - the header, Host and peer guards removed, or the peer read from XFF
  - the lock removed or never released, the kill removed, the timeout set to 10 s or dropped from execFile
  - truthy `on` accepted
  - calls served outside fake mode or unguarded, a brightness route added
  - on/off argv swapped, the cec-client `-d 1` dropped
  - wlr-randr allowed without an output, the full env passed to wlr-randr, `shell: true`
  - fake mode falling through to run the command, calls stored newest first
  - raw temperature returned, a leading `-` allowed in names
  - in serve.mjs: the helper hook removed, `--helper-fake` alone enabling the helper, fake mode forced on
  - **Survived:** passing the full `process.env` to `cec-ctl`/`cec-client` (`base` → `{ ...env }`). See Minor 3.

## Strengths

- Guards come first and in the stated order (peer, then Host, then header), before the body is read. Unknown routes and wrong methods get 404 before the guard, so a route's existence leaks nothing that matters. `X-Forwarded-For`/`Forwarded` are never read (`device-helper.mjs:93-94`).
- No shell anywhere. Argv is fixed per strategy (`device-helper.mjs:31-35`). User input only picks a boolean, and flag values are checked by regex at startup. A name can never start with `-`, which blocks option injection into `wlr-randr --output`.
- Child env is built from an allowlist (`PATH`, plus the two Wayland vars for wlr-randr) instead of filtering `process.env` down. This goes beyond what the criterion asks for cec.
- Timeout is two-layered: execFile's `timeout`/`killSignal: SIGKILL` plus its own timer that kills the child and releases the lock. Verified live: 504 at 5 s, no orphaned process.
- The helper hook sits in front of the allowlist and only consumes paths that literally start with `/__helper/`, and it never touches the filesystem except the fixed thermal path. serve-config-guard's suite is still green and its live behaviour is unchanged.
- Tests are strong. 25/26 mutants are killed, and the integration tests spawn on free ports (D12).

## Issues

### Critical
None.

### Important
None.

### Minor

1. **An oversized body gets a connection reset, not the ruled 413.**
   - Location: `scripts/device-helper.mjs:109` (`ok(null); req.destroy?.();`) and the test at `tests/device-helper.test.js` "an oversized body is refused".
   - Evidence: live POSTs with 2000 B and 200 KB bodies both gave `curl` http_code `000`, exit 56 (connection reset). The server stays up (`status` returns 200 afterwards) and no command runs. The unit test passes only because its mock `res` records `writeHead(413)` with no real socket behind it.
   - Why it matters: Q-dhs2 rules 413 for an oversized body, and a client sees a network error instead. The safety property (no command runs) holds.
   - Class: code-bug (the Q-dhs2 ruling as written), low impact.
   - Fix: stop buffering and send 413 with `Connection: close` before destroying the request. Or keep reading and discard the rest up to a cap, then respond. Add an integration assertion over a real socket.

2. **Fake-mode status reports the strategy auto-detected on the host, not `'fake'`.**
   - Location: `device-helper.mjs:62-69` together with `:162` (`power: strategy ?? 'fake'`).
   - Evidence: `serve.mjs --helper --helper-fake` with a `cec-ctl` on PATH returned `{"power":"cec-ctl","tempC":42.5}`.
   - Why it matters: Q-dhs2 rules `{power:'fake'|flag, tempC:42.5}`, meaning the explicit flag or `'fake'`. Auto-detect probes the real PATH even in fake mode, so the canned status depends on the machine. Phase 16's e2e reads this status, so it could differ between a dev box and a Pi.
   - Class: code-bug (Q-dhs2).
   - Fix: in fake mode, skip probing and use `power ?? 'fake'`. Add a test that fake mode with `which: () => true` reports `'fake'`.

3. **No test asserts the cec-ctl/cec-client child env.**
   - Location: `tests/device-helper.test.js`, the cec-ctl and cec-client tests.
   - Evidence: the `full-env-cec` mutant (`: base });` → `: { ...env } });`) passed 29/29. It would leak `PLEX_TOKEN` etc. to the CEC tools.
   - Why it matters: today's code is right (verified live: `PATH` only), but a regression would go unnoticed. Criterion 1 only demands the env check for wlr-randr.
   - Class: spec-gap (criterion silent on the CEC env). The test is still worth adding.
   - Fix: assert `Object.keys(c.opts.env)` equals `['PATH']` in the CEC tests, with a secret present in `env`.

4. **The `vcgencmd measure_temp` fallback in R-HELP-1 is not implemented, and `status` has no `temperature` key.**
   - Location: `device-helper.mjs:96-101` (thermal_zone0 only) and `:163`.
   - Evidence: `grep -n "vcgencmd\|temperature" scripts/device-helper.mjs` matches only a comment. R-HELP-1 says "`vcgencmd measure_temp` as fallback" and "`GET /__helper/status` returns `{power, temperature, tempC}`".
   - Why it matters: criterion 1 asks only for `tempC` from `thermal_zone0`. Q-dhs2 rules the fake shape as `{power, tempC}`, and the code matches both. R-HELP-1 as written asks for more, and the plan never defines `temperature`. On a Pi, thermal_zone0 is the normal source, so the practical impact is small.
   - Class: spec-gap (the plan criterion and ruling disagree with R-HELP-1). The conductor should either rule the fallback and `temperature` out, or send them back.
   - Fix: if kept, run `vcgencmd measure_temp` through execFile with a timeout when the thermal read fails, parse `temp=NN.N'C`, and define or drop `temperature` in the spec.

5. **An absolute `WAYLAND_DISPLAY` is refused.**
   - Location: `device-helper.mjs:26`, `:59`, `:78` (NAME regex).
   - Evidence: `--helper-wayland-display /run/user/1000/wayland-0` gave `device helper: invalid wayland display`, exit 1.
   - Why it matters: libwayland accepts an absolute socket path in `WAYLAND_DISPLAY`. A user whose session exports one cannot use the wlr-randr strategy. It fails closed at startup with a clear message, so the failure is safe.
   - Class: spec-gap (the spec says nothing about the value format). Command syntax is "(verify)" on hardware.
   - Fix (optional): accept either NAME or the DIR pattern for WAYLAND_DISPLAY.

## Declined to judge

- `Host: 0x7f000001` (and other numeric forms) is accepted, because `new URL()` normalises it to `127.0.0.1`. This lives in `isLoopbackHost` in `scripts/net.mjs`, which is outside this diff and was ruled in serve-config-guard. A browser sends the canonical form, and rebinding needs a DNS name, which is refused, so I see no exploit.
- No body-read timeout (slowloris). Reading the body happens before the lock is taken, so it cannot block commands. The route is loopback-only and guarded. Hardening is a product call.
- Exact CEC/wlr-randr syntax and the cec-ctl on = `--image-view-on` mapping are "(verify)", ruled under Q-dhs1, and need hardware.
- README documentation (R-HELP-1 "Documented in the README"): README is not in this phase's Output list.
- With a reverse proxy on the same machine, every client looks like loopback. The code comment acknowledges this, and it is inherent to D9.

## Recommendations

Fix Minor 1 and 2 to match Q-dhs2 (small, local changes), and add the CEC env assertion (Minor 3). Have the conductor rule on R-HELP-1's vcgencmd fallback and `temperature` key (Minor 4). None of these lets a command run without authorisation.

## Assessment

Every criterion passes. In the risk:high probes, a hostile body, a spoofed header, a rebinding Host, a cross-site simple request, concurrent requests, a hung command and hostile flag and env values all failed to run a command or leak env. The timeout and lock behave as specified on real processes, and serve-config-guard is unaffected. The tests have teeth: 25/26 mutants are killed. The remaining findings are Minor: two deviations from the Q-dhs2 ruling in edge behaviour, one test gap, and two spec-gaps for the conductor.

**Verdict:** APPROVE
