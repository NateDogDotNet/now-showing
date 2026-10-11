produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: device-helper-server · round: r6 · mode: cold
**Verdict:** APPROVE

Reviewer: device-helper-server-review-cold-r6 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T00:27:29Z · Method: cold code review · Scope: device-helper-server, r6, HEAD 0914090, tree 8ea1bb1 (staged diff)

### Strengths
- Reachability: the routes exist only with `--helper`. Every route checks three things: the socket peer is loopback (`isLoopback`), the Host header is a loopback hostname (which blocks DNS rebinding), and the request carries `X-Poster-Helper: 1`. A cross-origin page script cannot send that header without a preflight. OPTIONS gets a 404 and no CORS grant, and serve.mjs sends no `Access-Control-*` header anywhere (grep found nothing). Proxy headers are ignored.
- Execution: `spawn` runs with `shell:false` and fixed argv tables. Only `output` (`NAME` regex, which cannot start with `-`) and the Wayland env values (`NAME`/`DIR`, `..` rejected) come from the operator, and all of them are checked at startup. The child env is PATH only, plus WAYLAND_DISPLAY/XDG_RUNTIME_DIR for wlr-randr.
- Lifecycle: every child is spawned detached in its own process group. The whole group gets SIGKILL after every command, success or failure. The lock is kept until no non-zombie member is left, and waits at most 10 s before logging a warning. Stdout is capped at 64 KiB, and the body limit is 1 KiB, with a drain timer so the client still receives its 413. The lock is taken only after the body has been read and checked, so a slow body cannot hold it.
- Tests have teeth. Each mutation below broke at least one test, and each was reverted afterwards.
  - M1: removed the post-success `killGroup`. Test 39 failed.
  - M2: set `detached:false`. Tests 33 and 39 failed.
  - M3: dropped the Host guard. Tests 13, 29 and 45 failed.
  - M4: zombies counted as alive. Test 44 failed.
  - M5: lock released at once on timeout. Tests 32, 40 and 41 failed.

### Critical
None.

### Important
None.

### Minor
1. **A child that calls `setsid` (or double-forks into a new session) escapes the group kill.** Location: scripts/device-helper.mjs:57-74, `killProcessGroup` kills by pgid only. This is inherent to the design. The commands are fixed system binaries, so the risk is low. My probe (a cec-ctl stub running `setsid sleep 31 &`) returned 200 in 67 ms, but it did not show a surviving process, so it was inconclusive. Class: spec-gap. Fix: none required. If you want it covered, a cgroup or `prctl(PR_SET_CHILD_SUBREAPER)` would do it. Otherwise, document the limit.
2. **serve.mjs has no SIGTERM/SIGINT handler.** If the server is stopped while a command is running, the detached group is never killed or awaited. grep found no signal handling in serve.mjs. Commands are short, so the impact is small. Class: spec-gap. Fix: optionally, on exit, kill the pgid of the command in flight.
3. **`opt()` treats a flag value that starts with `--` as missing.** For example, `--helper-power --helper-fake` silently falls back to auto-detect instead of refusing to start (serve.mjs `opt`, lines 29-32; this is existing code). Class: spec-gap. Fix: when a `--helper-*` flag is present without a value, refuse to start.
4. **Small pid-reuse window in the post-success kill.** By the time `kill(-pid)` runs, the leader has already been reaped. If the group is empty and the pid has been reused by a new group leader, the wrong group would be signalled. This is very unlikely with sequential pid allocation. Class: code-bug (theoretical). Fix: none required.

### Declined to judge
- Any local process or user can switch the display. That is the loopback trust model, and the header comment names the reverse-proxy hazard. This is a product decision.
- Whether the cec-ctl, cec-client and wlr-randr argv is correct on real hardware. The code marks it "(verify)", and I cannot test it here.
- Treating EPERM from `kill(-pgid,0)` as "gone", which only matters for setuid children. None of the fixed binaries is setuid in a normal install.

### Recommendations
None of the Minor items blocks this round. Item 3 is the cheapest one to fix.

### Assessment
The change is a well-guarded loopback helper with no shell, validated inputs, one command at a time, timeouts, and a group kill that is enforced and waited for. The tests catch the wrong implementations I tried. Approve.

### What I read and ran
- Read: `git diff --cached` in /home/user/wt-device-helper-server (scripts/device-helper.mjs, scripts/serve.mjs, tests/device-helper.test.js, test names only), scripts/net.mjs (imported), the serve.mjs header, opt and listen code, and the package.json scripts.
- Ran, in a scratch worktree `/tmp/tmp.vm08J95ar1/wt` (mktemp -d, detached at HEAD, staged diff applied):
  - `node --test tests/*.test.js`: 93 of 93 passed.
  - Mutations M1 to M5 above, each followed by `node --test tests/device-helper.test.js` and a revert; the final `diff` confirmed the file was restored.
  - A probe script driving `createHelper` with stub cec-ctl and cec-client binaries on a private PATH. A stub that leaves a backgrounded `sleep` returned 200, and the backgrounded process was killed: no `sleep 30` was left. The `setsid` probe is item 1.
  - Afterwards I removed the worktree and the temp directory. The live tree was untouched: `git status` shows only the staged files.

Files read: scripts/device-helper.mjs, scripts/serve.mjs, tests/device-helper.test.js, scripts/net.mjs, package.json (all from /home/user/wt-device-helper-server, staged versions)
