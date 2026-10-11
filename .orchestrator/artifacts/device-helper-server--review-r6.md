produced_by: orchestrator-reviewer · model: claude-opus-5-5 · phase: device-helper-server · round: r6 · lens: anchored
Reviewer: device-helper-server-review-anchored-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T00:27:29Z · Method: anchored code review (risk:high, full; confirmation of r4 triage A1/C2, A2, C1, C3/K8) · Scope: device-helper-server, round r6, worktree HEAD 0914090, staged tree 8ea1bb1

## What I read and ran

Read: `docs/integration-plan.md` §15 (criteria 1-7, Notes); `docs/spec.md` R-HELP-1; `docs/decisions.md` D8, D18; the conductor rulings at the end of `.orchestrator/questions.md`; `.orchestrator/phases/device-helper-server.md` (the "Step 7 triage — r4" section and K8); `artifacts/device-helper-server--review-r4.md` and `--review-cold-r4.md`; `--brief-r6.md`; `git diff --cached` in `/home/user/wt-device-helper-server` (`scripts/device-helper.mjs`, `scripts/serve.mjs`, `tests/device-helper.test.js`).

Where I ran things:
- I extracted `git archive 8ea1bb1` into a `mktemp -d` directory under the session scratchpad (`dhs-r6.XXXX`), plus a second copy there for mutants.
- Ports were free ports from the OS. Node was v22.22.0.
- I stopped the one server I started (by its PID file) and removed the directory. Afterwards no process matched my temp dir.
- The live worktree is unchanged: `git write-tree` = 8ea1bb1…, the same three staged files, HEAD 0914090.
- Leftover zombie `sleep`s (pgid 3515) remain. They came from my stubs and were reparented to this container's PID 1 (`process_api`), which does not reap them. They run nothing.

- **Criteria 1-6:** `node --test tests/device-helper.test.js` passed 50/50 in 4.8 s, and `npm test` passed 93/93. The C3 grep, the C4 `Access-Control-Allow` grep and the C5 brightness grep found nothing. The C6 porcelain check was empty. **All pass.**
- **Criterion 7, live:** I put a logging stub for `cec-ctl` and `cec-client` first on PATH. It logs its argv and env, and its mode file switches it between: exit 0; exit 3; hang with a forked grandchild (`sleep 31 & sleep 31`); background a child with stdout redirected; background a child that inherits stdout; and `setsid` a child. Then I ran `PLEX_TOKEN=SECRET serve.mjs --host 0.0.0.0 --helper`. Auto-detect picked cec-ctl.
- **Mutants:** 6 of my own (listed under Strengths and Minor). Each was applied to the copy, the test file was run, and the original was restored (`cmp` = identical).

## Confirmation of the r4 findings

- **A1/C2: resolved.**
  - The 504 now arrives at the timeout: live, a hung POST got `504 {"error":"command timed out"}` at **5.01 s** in four out of four runs (r4: 6.9 s).
  - The lock is held until the group is gone: live, the busy replies continued for 46, 53 and 98 ms after the 504, then the next command ran.
  - A zombie-only group counts as gone: live, the killed grandchildren stayed as zombies (`ps`: `3520 3515 Z sleep`, `3521 3515 Z sleep`) and the lock was still released.
  - The bounded wait ends with a warning: I ran the real `groupAlive` with a no-op SIGKILL on a live detached `sleep`. It waited for the cap and logged `device helper: process group 5778 is still alive 300 ms after SIGKILL; releasing the lock`.
  - The header comment at `scripts/device-helper.mjs:13-18` says exactly this.
  - Tests: :526 (504 not held; lock held by the gate), :542 (lock held while `alive` is true), :575 (warning names the pgid), :585 (a real zombie-only group is gone in under 1.5 s).
- **A2: resolved.** The hung-command test (:418) forks `sleep 30` and has `{ timeout: 15000 }`. (Minor 2 below is a different test with the same gap.)
- **C1: resolved.** :499 runs a real stub that exits 3 and gets `502 {"error":"command failed"}`; the lock is released, and a missing binary also gets 502. Live, the exit-3 mode gave `502 … {"error":"command failed"}` in 0.01 s.
- **C3/K8: resolved.** `run()` (`scripts/device-helper.mjs:189`) awaits `killGroup` on success and on failure before resolving, so the lock is released afterwards. Live:
  - A stub that backgrounds `sleep 32 >/dev/null &` and exits 0 got 200, and no `sleep 32` was left.
  - A stub that does `setsid sleep 34 &` got 200 and left nothing behind either. setsid escapes the group, so the stub's own death took it.
  - The exit-3 case also left nothing behind.
  - Test :509 covers exit 0 and exit 3.

## Strengths

- Timeout and lock are cleanly separated. `run()` resolves with `gone`, a promise that never rejects (`.catch(() => {})`), and `unlock` (`:203`) flips `busy` only when it settles. `killProcessGroup` is bounded by `maxMs`, so the lock cannot be held forever by the real code.
- `killProcessGroup` refuses `pid <= 1` and non-integers. Test :556 runs undefined, null, 0, 1, -5, 1.5, NaN and '9' through it. This guards against `kill(-1)` and `kill(0)` from the exported seam.
- The `/proc/<pid>/stat` parse (`:50`) uses a greedy `\(.*\)`. It anchors on the last `) `, so a `comm` containing parentheses or spaces cannot shift the state, ppid or pgrp fields; no field after `comm` can contain `)`.
- Reviewer mutants killed:
  - Drop the warning call: 1 failed.
  - Make the 504 await the group wait: 2 failed.
  - Remove the direct `child.kill` before the group kill: 1 failed.
  - Remove the status/vcgencmd lock check: 1 failed.
  - Ignore the deadline: killed only by a hang (Minor 2).

Criterion 7 attacks: PASS. All attacks went to the real spawn executor through `serve.mjs`. The stub's ARGV count went up by 0 for every attack below except the marked controls.
- **Hostile bodies → 400:** `{"on":"false; reboot"}`, `"yes"`, `1`, `null`, `{}`, `[true]`, `{"__proto__":{"on":true}}`, a duplicate key ending `"x"`, `"--help"`, a nested object, `"$(reboot)"`, `[false]`, a bare `true`, form-encoded, empty, and a BOM prefix.
- **Missing or spoofed header → 403:** no header, `X-Poster-Helper: 0`, `true`, and a `text/plain` POST with `Origin: http://evil.example`.
- **Spoofed or rebinding Host → 403:** `evil.example`, `evil.example:P`, `localhost.evil.com`, `localhost@evil.com`, `127.0.0.1.nip.io`, `localhost:P@evil.com`, empty, `[::ffff:127.0.0.1]`, `localhost.`, `evil.example#@localhost`, and HTTP/1.0 with no Host.
- **Non-loopback peer (192.0.2.2) → 403:** display and status, also with `X-Forwarded-For`, `Forwarded` and `X-Real-IP` set to 127.0.0.1.
- **OPTIONS preflight:** 404 with no CORS header.
- **Routes and methods → 404:** `brightness`; `calls` (not fake mode); `/__helper`; `/__helper/`; `display/`; `//__helper/display`; `%64isplay`; `../config.json`; `./display`; `/%5f_helper/display`; GET, PUT and HEAD.
- **Oversized bodies:** 1025 B, 2 KB, 200 KB and 10 MB (curl) each got **413** with the JSON body. 1024 B at the limit got 200 (control, 1 command). Status was 200 afterwards.
- **Concurrent and hung (forked grandchild):**
  - The hung POST got 504 at 5.01 s, with 2 `sleep 31` processes while it hung.
  - Five concurrent POSTs got 503 each, all within 0.01 s.
  - `status` while busy was 200 with `temperature:null`.
  - No `sleep 31` was running 0.01 s after the 504.
  - Three more timeouts left nothing running.
  - After the hang, the next command got 200 (control).
- **Argument and env injection:** each of these exits 1 before listening:
  - `--helper-power sh`
  - `--helper-output --help`
  - `--helper-output 'HDMI-A-1;reboot'`
  - `--helper-wayland-display ../../x`
  - `--helper-xdg-runtime-dir /run/../etc`
  - `XDG_RUNTIME_DIR='/run/user/0 x'`
  - wlr-randr with no output
- **Child argv and env:** every logged argv was exactly `-d /dev/cec0 --to 0 --standby|--image-view-on`. The child env was PATH only (plus PWD, which the `sh` stub sets itself), and `SECRET` appeared 0 times in the log.

## Issues

### Critical
None.

### Important
None.

### Minor

1. **No test checks that the real `groupAlive` sees a live member. Remove that detection and the lock is released silently while a member is alive.**
   - **Class:** spec-gap (test-side). The brief allowed the alive seam for item 1, and the seam tests do cover the wait loop.
   - **Location:** `scripts/device-helper.mjs:51`; tests :542, :575 and :585.
   - **Evidence:** my mutant `Number(m[2]) === pgid` → `… && false` passed **50/50**. With that mutant, `groupAlive` returns false whenever `/proc` is readable. The zombie test (:585) checks only the "gone" direction, and :542/:575 replace `alive` with a stub.
   - **Why it matters:** the case this exists for is a member stuck in uninterruptible sleep (state `D`), such as a CEC ioctl that SIGKILL cannot end. The ruling says that case must end with a warning after 10 s, never silently. A regression there would be invisible.
   - **Fix:** add a test that spawns a real detached `sleep` and calls `killProcessGroup(pid, { kill: (p, s) => s === 0 ? process.kill(p, 0) : undefined, maxMs: 200, warn })` with the default `alive`. Assert one warning, then SIGKILL the group. I ran exactly this against the unmutated code and got one warning after 358 ms.

2. **The test "killProcessGroup gives up after maxMs" has no per-test timeout, so a regressed deadline hangs `npm test` instead of failing it.**
   - **Class:** spec-gap (test-side; same family as A2).
   - **Location:** `tests/device-helper.test.js:575`.
   - **Evidence:** I replaced `if (Date.now() >= deadline)` with `if (false)`. A plain run produced no result within my 120 s cap. With `--test-timeout=20000` it gave `# pass 42 … # cancelled 1`.
   - **Fix:** add `{ timeout: 5000 }` to that test.

3. **A command that exits 0 but leaves a background child holding its stdout is reported as `504 command timed out` after 5 s.**
   - **Class:** spec-gap. The plan and rulings do not define when a command has ended. The code follows Node `execFile` semantics, finishing on `close` (`:93`), which waits for stdio to close.
   - **Evidence:** live, my `bginherit` stub mode (`sleep 33 & exit 0`) got `(504, 5.0 s, {"error":"command timed out"})`. K8 still holds: the group was killed and no `sleep 33` was left. Test :509 redirects the background child's output (`>/dev/null 2>&1`), so it never exercises this path.
   - **Why it matters:** the response code is wrong and the lock is held for 5 s. No supported tool (cec-ctl, cec-client, wlr-randr) is known to do this. Confirming that is a (verify) row on hardware.
   - **Fix, if wanted:** on `exit`, kill the group, which closes the pipe, then finish on `close`.

4. **On success or failure the HTTP response waits for the group wait, up to 10 s, while the timeout path answers at once.**
   - **Class:** spec-gap.
   - **Location:** `scripts/device-helper.mjs:189`.
   - **Why it matters:** this matters only when a member survives SIGKILL. The brief's "do not hold the response" applied to the timeout path only. K8 requires the wait before the lock is released, not before the answer. A client could still wait about 10 s for a 200.
   - **Fix, if wanted:** answer at once and release the lock through `gone`, the same way as the timeout path.

## Declined to judge

- **`/proc` scan cost:** one full scan takes about 44 ms for 108 processes in this container. It runs only while a killed group still answers signal 0 (live members or unreaped zombies), at most every 20 ms plus the scan time, for at most 10 s per command. That is acceptable, but Pi numbers are a hardware question.
- **PID-reuse race on the pgid between reap and `kill(-pgid)`:** Linux keeps a pid allocated while it is a live pgid. Reuse also needs a new process to become the leader of a group with that pid within milliseconds. Not ruled on.
- **The exported `killProcessGroup` seam:** it is a module export, not an HTTP route, and it refuses `pid <= 1`. No issue.
- **Earlier rulings, not re-ruled:** reverse-proxy hazard, hardware command syntax, and 403-vs-404 fingerprinting (r4 triage); the cold-r1 M2 guard order.

## Recommendations

Minor 1 and 2 are two small additions to the test file (one test, one `{ timeout }`). Minor 3 and 4 are optional hardening for a later phase or the hardware validation row.

## Assessment

Every r4 finding is resolved, and each fix was checked live against the real spawn executor:
- The 504 arrives at 5.01 s.
- The lock is held until the group is gone, and a zombie-only group counts as gone.
- The bounded wait ends with a named warning.
- A real non-zero exit gives 502.
- K8 holds: the group is killed after success and after failure.

Criteria 1-6 pass and the criterion 7 attacks pass. What remains is two test-side gaps and two behaviours the rulings do not cover. All four are Minor spec-gaps; there is no code-bug.

**Verdict:** APPROVE
