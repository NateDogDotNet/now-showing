produced_by: orchestrator-reviewer · model: claude-opus-5-5 · phase: device-helper-server · round: r7 · lens: anchored
Reviewer: device-helper-server-review-anchored-r7 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T01:31:13Z · Method: anchored code review (risk:high, full; confirmation of D20 scope A6-1, A6-2, C6-3) · Scope: device-helper-server, round r7, worktree HEAD 0914090, staged tree 6dc4191

## What I read and ran

- **Read:** the phase section 15 in docs/integration-plan.md; D8, D18, D20, D21 and D22 in docs/decisions.md; the phase record (stop 4 and the r7 rows); the r6 anchored and cold reviews; the r7 brief. I also read the r6-to-r7 diff (`git diff 8ea1bb1 6dc4191`) and the full staged serve.mjs diff. scripts/device-helper.mjs has not changed since r6. The delta touches only scripts/serve.mjs (+9) and tests/device-helper.test.js, so it stays inside the D20 scope.
- **Tree:** `git write-tree` in /home/user/wt-device-helper-server returned 6dc4191e79f4…, which matches the dispatch. I exported it with `git archive 6dc4191 | tar -x` into `mktemp -d` = /tmp/dhr7.WAEwJU. The repo has no npm dependencies. All runs and mutants were done there. The only thing I ran in the live worktree was criterion 6 (a read-only `git status`).
- **Criteria 1-6 (plan commands, verbatim):** C1 `node --test tests/device-helper.test.js` passed 52/52, exit 0. C2 `npm test` passed 95/95, exit 0. C3, C4 and C5 (the greps) and C6 (`git status --porcelain` empty) all exit 0. Lint with round--eslint-r1e.config.mjs on the three files exits 0.
- **Mutants (mine; each applied to the copy, then the original restored, `cmp` identical):**
  - M1, the never-find mutant `m[1] !== 'Z'` → `false` in groupAlive (device-helper.mjs:51): `not ok 45 - the real liveness check sees a live group member…`, 51 pass / 1 fail. **Killed.**
  - M2, the deadline removed: `if (Date.now() >= deadline)` → `if (false)` (device-helper.mjs:68): `not ok 43` (gives up after maxMs) and `not ok 45`. The run ended at 15.25 s with exit 1. It **fails instead of hanging.** Killed.
  - M3, the value-less check disabled (serve.mjs: the `if (i >= 0 && (!args[i+1] || …))` condition set to `false`): `not ok 52 - integration: a helper value option with no value refuses to start…`. **Killed.**
- **Criterion 7, live:** I put a logging `cec-ctl` stub first on PATH. It logs its argv and any env var matching TOKEN or SECRET. A mode file switches it between exit 0 and hang-with-forked-grandchildren (`(sleep 37 & sleep 37) & sleep 37`). Then I ran `PLEX_TOKEN=SECRET node scripts/serve.mjs --host 0.0.0.0 --port <free> --helper` from the scratch copy, and auto-detect reported `"power":"cec-ctl"`. The server was stopped by its own pid afterwards, and `pgrep -f /tmp/dhr7.WAEwJU` then matched nothing but my own shell.

## Earlier findings (confirmation)

- **A6-1: resolved.** The new test (tests/device-helper.test.js, "the real liveness check sees a live group member…") spawns a real detached `sleep 60`. It calls `killProcessGroup` with no `alive` seam, using a kill wrapper that turns SIGKILL into a no-op and passes signal 0 through, and `maxMs: 300`. It asserts that the wait took ≥290 ms and <3000 ms, that exactly one warning containing `process group <pid> ` was emitted, and that the sleep was still alive at the end. A `t.after` hook SIGKILLs the group, and the pid is also pushed to `strays`. M1 above kills it. After the runs, `ps` showed no `sleep 60` left behind.
- **A6-2: resolved.** "killProcessGroup gives up after maxMs" (formerly :575) now has `{ timeout: 5000 }`, plus a `t.after` that makes `alive` return false so the loop exits on cancel. The builder also added `{ timeout: 5000 }` to the other 8 tests that wait on a timeout, lock or group deadline. M2 shows a regressed deadline now fails the run (exit 1, 15 s) instead of hanging it.
- **C6-3: resolved as D20 states.** Inside the `--helper` block, serve.mjs checks each of `--helper-power`, `--helper-output`, `--helper-wayland-display` and `--helper-xdg-runtime-dir`. If the option is present and the next argument is missing, empty or starts with `--`, it prints `device helper: --<name> needs a value` and exits 1. `opt()` and the other options are untouched. Live probes:
  - `--helper --helper-power --helper-fake` exits 1, "--helper-power needs a value".
  - `--helper --helper-power ''` exits 1.
  - `--helper --helper-power none --helper-output` (last argument) exits 1, "--helper-output needs a value".
  - `--helper --helper-power bogus` still exits 1, "invalid power strategy".
  - `--helper-power --helper-fake` without `--helper` starts (timeout 124). That matches K10 and the existing "--helper-fake alone does not enable the helper".
- **No regression.** device-helper.mjs is byte-identical to r6, so the r6 conductor mutants still apply. All 52 phase tests and all 95 suite tests pass, and the criterion 7 behaviour below matches r6.

## Strengths

- The A6-1 test has teeth in both directions. The lower bound catches a groupAlive that never sees a live member (M1). The deadline assertions and the test timeout catch a wait that never ends (M2). It also cleans up after itself even when the test is cancelled.
- The C6-3 test covers all four options, both forms (followed by a flag, and last argument), and a server that starts anyway. A 4 s SIGKILL timer turns that case into a clear failure message rather than a hang.
- The change stays strictly inside D20: no edits to device-helper.mjs, and no change to how `opt()` parses `--root`, `--port` or `--host`.

## Criterion 7 attacks

Criterion 7 attacks: PASS. Every request went through the real spawn executor in `serve.mjs --host 0.0.0.0 --helper`. "argv+N" is the change in the stub's ARGV line count.

| Attack | Result |
|---|---|
| Hostile body `{"on":"yes"}`, `{"on":1}`, `{}`, `{"__proto__":{"on":false}}`, truncated JSON | 400, argv+0 |
| Injection `{"on":"false; touch …/pwn","output":"$(touch …/pwn2)","power":"wlr-randr"}` | 400, argv+0, no pwn files |
| Injection with a valid `on`: `{"on":true,"output":"x; touch …/pwn3","power":"wlr-randr","argv":["-rf"]}` | 200, ran exactly `-d /dev/cec0 --to 0 --image-view-on`, no pwn3 |
| Missing `X-Poster-Helper`; `X-Poster-Helper: 0` | 403, argv+0 |
| Host `evil.example`, `localhost.evil.com`, `127.0.0.1.nip.io` | 403, argv+0 |
| Non-loopback peer (192.0.2.2) with `Host: localhost` + `X-Forwarded-For: 127.0.0.1`, on display and status | 403, argv+0 |
| Oversized 2 MB body | 413, argv+0 |
| `POST /__helper/brightness`, `GET /__helper/calls` without fake, `GET /__helper/display` | 404, argv+0 |
| Control: `Host: localhost:8080`, valid body | 200, argv+1, `-d /dev/cec0 --to 0 --standby` |
| Hung command with forked grandchildren + 5 concurrent requests 0.5 s in | all 5 concurrent → 503 busy; first → 504 `{"error":"command timed out"}` at 5.007 s; 0 live `sleep 37` afterwards |
| Request about 0 ms after a 504 | 503 busy (the lock is held until the group is gone, as in r6); after 0.02 s, 0 live members; later requests ran again |
| Two more hang cycles | each 504 at about 5.006 s, 0 live `sleep 37` after each |
| Secret leak | 0 TOKEN/SECRET env lines logged across 7 command runs |

## Issues

### Critical

None.

### Important

None.

### Minor

None.

## Declined to judge

- A6-3, A6-4, C6-1, C6-2 and C6-4: D20 ships these as they are, so they are not findings.
- K10 (a value-less helper option is inert without `--helper`) is a conductor ruling that goes to the next stop. I confirmed the behaviour matches it, but did not rule on it.
- `--helper-power=cec-ctl` (the `=` form) is not recognised. With `--helper` it falls through to auto-detect, because `opt()` has never supported `--name=value` for any option. That parsing predates this phase, and D20 says not to change how options parse. So it is outside the diff, and a product question if anyone wants it.

## Recommendations

None required for this phase. The docs phase should keep the `KillMode=control-group` note D20 promises (C6-2).

## Assessment

A6-1, A6-2 and C6-3 are resolved as D20 states. Each is backed by a test that a targeted mutant fails. Criteria 1-6 pass, lint is clean, device-helper.mjs is unchanged, and nothing regressed. The criterion 7 attacks against the real executor ran no unintended command, leaked no secret and left no process behind.

**Verdict:** APPROVE
