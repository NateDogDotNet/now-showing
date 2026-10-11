Reviewer: device-helper-server-review-anchored-r4 · Model: claude-opus-5-5 · Dispatched: 2026-10-08T23:59:30Z · Method: anchored code review (risk:high, full) · Scope: device-helper-server, round r4, base 33976fe (prompt) / worktree HEAD 0914090, staged tree f9da92e

## What I read and ran

Read: `docs/integration-plan.md` section 15 (criteria 1-7, Notes); `docs/spec.md` R-HELP-1, R-HELP-2, R-SEC-1; `docs/decisions.md` (D8, D9, D18); `.orchestrator/questions.md` Q-dhs1, Q-dhs2 and the conductor rulings; the K2 ruling and r1 triage in `.orchestrator/phases/device-helper-server.md`; the r1 anchored and cold reviews; `git diff --cached` in `/home/user/wt-device-helper-server` (`scripts/device-helper.mjs`, `scripts/serve.mjs`, `tests/device-helper.test.js`); `scripts/net.mjs`.

**Base note.** The prompt names base 33976fe. The worktree HEAD is 0914090, and `git diff --cached` is relative to 0914090. 0914090 is an ancestor of 33976fe, which adds four commits (e2e harness, decisions, validation checklists, settings keys). I applied the staged patch to a `git archive 33976fe` export: `git apply --check` was clean, `npm test` passed 110/110, and `check-precache` passed. The phase is therefore fine on either base.

Where I ran things: `git archive f9da92e` extracted into a `mktemp -d` directory under the session scratchpad, plus a second copy there for mutants and a third (33976fe + staged patch) for the base check. Every port came from `listen(0)`. Afterwards I removed the directory and stopped every server I started. `git status --short` and `git write-tree` in the live worktree still give `f9da92e…` with the same three staged files. Node v22.22.0.

- **Criteria 1-6:** `node --test tests/device-helper.test.js` passed 43/43 and `npm test` passed 86/86. The C3, C4 and C5 greps found nothing and the C6 porcelain check is empty, which is what each requires. **All pass.**
- **Criterion 7, live:** I put logging stubs for `cec-ctl`, `cec-client`, `wlr-randr` and `vcgencmd` first on PATH. Each stub logs its argv and full env, and can hang with a forked grandchild (`sleep 30 & sleep 30`). I started `serve.mjs --host 0.0.0.0 --helper` (auto-detect picked cec-ctl) with `PLEX_TOKEN=SECRET` in the environment, then ran the probes below. Results are in the Criterion 7 line.
- **Mutants:** 21 of my own, beyond the conductor's set. Each was applied to the copy, the test file was run, and the original was restored (the script compared the file to the original afterwards: `restored: True`; the second copy also matched the staged blob by `cmp`). Results are in the Strengths and Minor sections.

Criterion 7 attacks: PASS. Here is what I ran. All requests went to the real spawn-based executor, and none of the attacks below ran a command (stub log ARGV count 0) unless noted.
- **Hostile bodies, 400 and no command:** `{"on":"false; reboot"}`, `"yes"`, `1`, `null`, missing `on`, `[true]`, `{"__proto__":{"on":true}}`, a duplicate key ending in `"x"`, `"--help"`, a nested object, form-encoded, empty, and BOM-prefixed JSON.
- **Missing or spoofed header, 403:** no header, `X-Poster-Helper: 0`, a doubled header (`1, 1`), and a cross-site `text/plain` simple POST with `Origin: http://evil.example`.
- **Spoofed or rebinding Host, 403:** `evil.example:P`, `localhost.evil.com`, `localhost@evil.com`, `127.0.0.1.nip.io`, `evil.example#@localhost`, `localhost:P@evil.com`, an empty Host, `[::ffff:127.0.0.1]`, `localhost.`, and HTTP/1.0 with no Host.
- **Non-loopback peer, 403:** from 192.0.2.2 for display and status, including with `X-Forwarded-For`, `Forwarded` and `X-Real-IP` set to 127.0.0.1. Also curl `--interface 192.0.2.2` to 127.0.0.1.
- **CORS:** an `OPTIONS` preflight with Origin and `Access-Control-Request-Headers: x-poster-helper` got 404 with no `Access-Control-*` header.
- **Routes and paths, 404:** `brightness`; `calls` without fake mode; `/__helper`; `/__helper/`; `status/`; `//display`; `%64isplay`; `display;x`. With `--path-as-is`: `/__helper/../index.html`, `/__helper/../config.json`, `/__helper/./display`, `display/..`. Also `/%5f_helper/status`, absolute-form `POST http://localhost/__helper/display`, and the wrong methods GET, PUT and HEAD. The one control request that legitimately ran a command was `display?x=1` (200).
- **Overlong bodies:** 1025 B, 2 KB, 200 KB and 10 MB bodies each got a real **413** with a JSON body over the socket (no reset). A 1022 B valid body got 200. A raw socket that claimed 100 KB and kept trickling data got `HTTP/1.1 413` and then had its connection closed (BrokenPipe after 0.2 s). Status returned 200 afterwards.
- **Concurrent and hung (stub hangs with a forked grandchild):**
  - The first POST got 504 with SIGKILL at 5 s, and the response arrived at 6.9 s (see Minor 1).
  - Five concurrent POSTs got an immediate 503 each.
  - `status` while busy reported `temperature:null` and ran no second command.
  - The process group was gone afterwards. My `sleep 30` count went 1 to 3 to 1; the remaining process was pre-existing and not mine.
  - Three more timeouts left no growth.
  - With the hang removed, the next command got 200.
- **Argument and env injection through real spawn:** each of these exits 1 before listening:
  - `--helper-output` values `-x`, `HDMI-A-1;id`, `a/../b`, `HDMI A`, `HDMI\nX`, and `--off` (which `opt()` drops, so the output is required)
  - `--helper-wayland-display` values `../wayland-0` and `/run/../etc/x`
  - `--helper-xdg-runtime-dir` values `relative` and `/run/user/1000 x`
  - `--helper-power` values `bash`, `__proto__`, `cec-ctl ` (trailing space) and `toString`
  - env `WAYLAND_DISPLAY='x;id'` and env `XDG_RUNTIME_DIR=/run/user/1000/../../../etc`
- **Exact argv and env as received by the stubs:**
  - cec-ctl: `-d /dev/cec0 --to 0 --standby`, env `PATH` only (plus the `PWD` that sh adds itself).
  - cec-client: `-s -d 1`, stdin `standby 0` / `on 0`.
  - wlr-randr, run with `PLEX_TOKEN`, `DBUS_SESSION_BUS_ADDRESS`, `HOME` and an absolute `WAYLAND_DISPLAY=/run/user/1000/wayland-1` in the environment: `--output HDMI-A-1 --off` / `--on`, env `PATH`, `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR` and nothing else.
  - wlr-randr with no compositor env: 503 and no command.
  - vcgencmd fallback: `measure_temp`, env `PATH` only, giving `{"power":"cec-ctl","temperature":"vcgencmd","tempC":51.2}`.
- **Fake mode** (`--host 0.0.0.0 --helper --helper-fake`, with a cec-ctl stub on PATH):
  - status returned `{"power":"fake","temperature":"thermal_zone0","tempC":42.5}`.
  - After 105 POSTs, `calls` had length 100, oldest first, sorted.
  - `calls` with no header, from the LAN, or with Host `evil.example` got 403.
  - No stub ran.
- **Allowlist unchanged** (from the LAN): `/index.html` 200, `/config.json` 403, `/package.json`, `/docs/spec.md` and `/scripts/device-helper.mjs` 404.

## r1 findings: status

Anchored r1:
1. **Oversized body gets a reset, not 413**: **resolved.** `device-helper.mjs:186-193` drains, then sends 413 with `Connection: close` and destroys after `DRAIN_MS`. Live: 413 for 1025 B through 10 MB. The integration test "an oversized body gets a real 413 over the socket" kills the `413-destroy-first` mutant.
2. **Fake status reports the host-detected strategy**: **resolved.** `:95` skips probing in fake mode and `:221` reports `power ?? 'fake'`. Live: `"power":"fake"` with cec-ctl on PATH. Each guard alone is an equivalent mutant (both survive alone), and reverting both together is killed by test 27.
3. **No CEC child env assertion**: **resolved.** The test "cec-ctl and cec-client children get PATH only" kills `cec-full-env` (2 fail).
4. **vcgencmd fallback and `temperature` key missing**: **resolved** per K2. `readTemp` (`:172-185`) uses thermal_zone0 first, then `vcgencmd measure_temp` with an anchored regex, under the lock. `status` returns `{power, temperature, tempC}`, and `temperature` names the source. Live output is shown above. Mutants `vcgencmd-regex-loose`, `vcgencmd-no-lock` and `thermal-no-div` were all killed.
5. **Absolute WAYLAND_DISPLAY refused**: **resolved.** `check(…, NAME, DIR)` at `:89` and `:108`. Live: `/run/user/1000/wayland-1` accepted and passed through, `/run/../etc/x` refused. `wd-no-abs` was killed.

Cold r1:
- **M1, grandchildren orphaned on timeout**: **resolved.** Spawn is `detached: true`, the group is killed and waited for (`:37-45`, `:153-156`), and the lock is held until then. Live: no surviving group members after 4 timeouts. Mutants `no-await-killgroup` was killed, and `killgroup-pos-pid` was detected but hung the suite (see Recommendations).
- **M2, LAN fingerprint**: **accepted** (conductor dismissed it at r1 triage). Still present by design: route check before guard at `:236`. My `guard-before-route` mutant survives, which is expected because no test pins the order.
- **M3, CEC env test gap**: **resolved** (as anchored 3).
- **M4, misleading 413**: **resolved.** An aborted read is now 400 ("a body that errors mid-read is a 400, not a 413").
- **M5, unbounded call log**: **resolved.** Capped at 100 (`:204`). Live: 105 POSTs left 100 entries, and `no-call-cap` was killed.

## Strengths

- **Guard order and no proxy headers.** The guard is peer, then Host, then header, applied before any body read. It never reads proxy headers, and every spoof above was refused from a real LAN address.
- **Inputs never reach argv.** The body selects only a boolean; argv is fixed per strategy; spawn has `shell: false`. Every flag or env value that reaches argv or env is regex-validated, rejects `..` segments and cannot start with `-`, and the helper fails closed at startup.
- **Child env is an allowlist.** The child gets `PATH` only, plus the two compositor variables for wlr-randr; vcgencmd is included in this. It was verified on real processes with secrets present in the parent.
- **Lock and timeout are tight.** The one-command lock covers display and vcgencmd. The lock is taken synchronously after the checks, so there is no await gap. The process-group kill closes cold M1 and was verified with a real forked grandchild.
- **413 path drains first.** It sends the response and closes the connection, so clients get a real 413 and the server stays healthy.
- **Tests have teeth.** 18 of my 21 mutants were killed outright. Of the 3 survivors, 2 are equivalent mutants (killed in combination) and 1 is the accepted cold M2 ordering. A 4th mutant (`killgroup-pos-pid`) was detected, but the suite hung for more than 280 s before failing. The real-executor tests (no shell, literal argv, PATH-only env, grandchild kill) close the r3 `shell-true-spawn` survivor.
- **Stays inside the Output list.** The phase touches exactly the three Output files and leaves serve-config-guard's behaviour unchanged.

## Issues

### Critical
None.

### Important
None.

### Minor

1. **The 504 can arrive about 2 s after the 5 s timeout, because zombie grandchildren keep the process group "alive".**
   - Location: `scripts/device-helper.mjs:42` (`process.kill(-pid, 0)` in the 200 × 10 ms wait loop) together with `:155`.
   - Evidence: the hung stub's `sleep` children got SIGKILL at 5 s and were reparented to PID 1 (`process_api` in this container). `ps` showed them as `Z` in pgid 17359 at every sample from 5.7 s to 6.9 s. `kill(-pgid, 0)` succeeds on zombies, so the loop runs its full 2 s cap, and curl measured `504 6.88 s` (twice).
   - Why it matters: the Note says "Every command gets a 5 s timeout". The command is killed on time, so the safety property holds and nothing leaks; only the response and the lock release are late. Under systemd as PID 1 on a Pi, zombies are reaped promptly, so the delay should be about 0. The delay is bounded at 2 s in any case.
   - Class: code-bug (Notes "5 s timeout"), low impact and environment-dependent.
   - Fix (optional): in the wait loop, treat the group as gone once no member in `/proc/*/stat` with that pgid is in a non-`Z` state. Or accept the bound and make the comment at `:13-15` say that release waits up to 2 s more.

2. **A regressed group kill hangs the test suite instead of failing fast.**
   - Location: `tests/device-helper.test.js:415` (`sleep 300 &` in the real grandchild test).
   - Evidence: the `killgroup-pos-pid` mutant (`process.kill(-pid…)` changed to `process.kill(pid…)`) made `node --test` run past my 280 s cap. The grandchild holds the stdout pipe open for 300 s, so the test file process cannot exit. The phase record shows the same symptom for no-flag-validation at r3.
   - Why it matters: the regression is still detected, but slowly. It costs CI time and can trip mutation-run caps.
   - Class: spec-gap (the criteria say nothing about suite duration).
   - Fix: use `sleep 30`, and add an `after()` hook that kills the recorded grandchild pid.

## Declined to judge

- **No Origin check.** A non-browser loopback client with the right header and Host is accepted whatever its `Origin`. Browsers cannot send the custom header cross-origin without the preflight, which is never granted, and that is the design in R-HELP-1. An Origin check would only add defence in depth, which is a product call.
- **`X-Poster-Helper: 1 ` (trailing space) is accepted.** Node strips header whitespace before the code sees it, so this is correct HTTP and not a bypass.
- **vcgencmd can hold the lock.** On a host without thermal_zone0, a `status` poll whose vcgencmd hangs holds the lock for up to 5 s (plus Minor 1), and a display command gets 503 busy in that window. This follows the "one at a time" Note. Whether phase 16 should retry is for that phase.
- **Route existence is visible to LAN peers (cold M2).** The conductor ruled on this at r1.
- **`Host: 0x7f000001` and other numeric forms are accepted** by `isLoopbackHost`. That function is in `scripts/net.mjs`, outside the diff and ruled in serve-config-guard.
- **Real hardware behaviour.** Real CEC and wlr-randr syntax, cec-ctl on = `--image-view-on`, and the vcgencmd output format on real firmware are all "(verify)" under Q-dhs1 and extended validation.
- **README documentation** (R-HELP-1). README is not in this phase's Output list.

## Recommendations

Neither Minor blocks the phase. If the builder touches the code again: make the group-kill wait ignore zombies (Minor 1), and shorten the grandchild's `sleep` in the test, with cleanup (Minor 2). The conductor should note that the reviewed diff is relative to 0914090, not 33976fe; it rebases cleanly and stays green on 33976fe.

## Assessment

Every criterion passes and every r1 finding is resolved or was already accepted. The criterion 7 attacks covered hostile bodies, spoofed headers, Host and Origin values, LAN peers with proxy headers, overlong and trickled bodies, concurrent and hung commands with forked grandchildren, and argv and env injection through the real spawn executor. None of them ran a command, leaked env or left a process behind. Two Minor findings remain: a bounded late 504 caused by zombie reaping in this container, and a slow-failing test.

**Verdict:** APPROVE
