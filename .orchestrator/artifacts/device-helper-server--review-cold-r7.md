produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: device-helper-server · round: r7 · mode: cold
**Verdict:** APPROVE

Reviewer: device-helper-server-review-cold-r7 · Model: claude-opus-5-5 · Dispatched: 2026-10-09T01:31:13Z · Method: cold code review · Scope: device-helper-server, r7, base HEAD 0914090f17cad390dc9b81b4b1d8927ca07c110a, staged tree 6dc4191e79f4a0b99ad6034808959d986030d83d

## Strengths
- Reachability. Every route has three guards: the socket peer must be loopback, the Host header must be loopback (this blocks DNS rebinding), and the request must carry `X-Poster-Helper: 1`. The custom header forces a CORS preflight, and the helper never grants CORS, so a cross-origin page cannot call it. Proxy headers are ignored. Mutating out the header check or the Host check makes 3 tests fail each.
- What it executes. The only input from the network is a boolean `on`. Each strategy runs a fixed argv with `shell: false`. The child env is PATH only, plus the validated WAYLAND_DISPLAY and XDG_RUNTIME_DIR for wlr-randr. Startup values are checked against regexes: no leading `-`, no `..`, absolute directories only. serve.mjs refuses to start when a value option is present without a value.
- Lifecycle. Each child runs in its own detached process group. One lock covers both display and vcgencmd. After every command the whole group gets SIGKILL, and the lock is held until no non-zombie member is left, up to 10 s, then a warning. The `/proc/<pid>/stat` parse uses a greedy `\(.*\)`, so a `)` inside a comm name cannot break it. On timeout the 504 goes out at once. Body size is capped, and on overflow the body is drained so the client still gets its 413.
- The tests have teeth (results below). A mutant that makes a handler hang fails in about 0.3 s ("Promise resolution is still pending", rc=1) instead of hanging. Integration children are killed in `finally`/`after`.

## Issues

### Critical
(none)

### Important
(none)

### Minor
1. **A command that exits 0 but leaves a background child holding stdout gets a 504 after the full timeout.** code-bug. `scripts/device-helper.mjs:93` decides the result on `'close'`, which waits for every stdio holder, not on `'exit'`. Reproduced with a fake `cec-ctl` doing `sleep 31 & exit 0`: the response was `{"error":"command timed out"} 504 5.015505s`. The grandchild was then killed correctly, with nothing left over. The real tools (cec-ctl, wlr-randr) are not known to do this, so the impact is low. Fix: take the exit code from `'exit'`, then kill the group. Or keep using `'close'` but give stdout a short grace period after exit.
2. **A command that is running when the server stops outlives the server.** spec-gap. The `detached: true` that makes group-kill work also takes the child out of the server's process group, and there is no exit or signal handler that kills it. Reproduced: with a fake `cec-ctl` that runs `exec sleep 30`, I sent SIGTERM to serve.mjs mid-command. The server exited and `sleep 30` (pid 21308, pgid 21308) was still running; I killed it myself. A truly hung cec-client would stay forever, and after a restart it could run alongside a new command, so the one-at-a-time rule no longer holds. systemd `KillMode=control-group` would cover this, but the code doesn't depend on that. Fix: track the live pgid and SIGKILL `-pgid` on `exit`/SIGINT/SIGTERM.
3. **A non-loopback peer can list which helper routes exist and whether fake mode is on.** spec-gap. `handle()` returns 404 for unknown routes before it runs the guard (`device-helper.mjs:274-275`). So a LAN client (with `--host 0.0.0.0`) gets 403 or 404 depending on whether a route exists, which shows whether `--helper` and `--helper-fake` are on. It only leaks information, nothing runs. The order is not pinned by any test: swapping the guard and the known-route check leaves all 52 tests passing. Fix (optional): run the guard first for anything under `/__helper`, or accept the current order and add a test for it.

## Declined to judge
- Whether the cec-ctl and cec-client argv and stdin work on a real Pi (for example, whether cec-ctl needs a logical address configured first). That needs hardware, and the code itself marks it "(verify)".
- That other local users and same-origin app script can reach the helper. This follows from the loopback-only design, and the code notes the reverse-proxy hazard.
- That `readBody` has no deadline of its own. The lock isn't held while the body is read, and Node's server `requestTimeout` limits the socket, so I did not count it as an issue.
- That a pgid could be reused after the 10 s give-up. Rare, and the warning names the pgid.

## Recommendations
Fix item 1 when convenient. Decide on item 2 (a shutdown hook, or document that systemd handles it). Item 3 is optional.

## What I read and ran
- I made a scratch copy of the staged index with `git checkout-index -a --prefix=<mktemp -d under the session scratchpad>/src/` (Node v22.22.0). Everything ran there. I removed the directory afterwards and killed only my own `sleep 30` survivor. `git status` in the live worktree still shows only the three staged files.
- `node --test tests/device-helper.test.js`: 52 pass, 0 fail, 5.7 s.
- Mutations, each reverted after its run. Each list entry is the mutant, then failing tests out of 52:
  - remove the header guard: 3
  - remove the Host guard: 3
  - `shell: true`: 1
  - `detached: false`: 2
  - remove the busy check on display: 4
  - remove the busy check on vcgencmd: 1
  - treat zombies as alive: 1
  - skip the group kill after a successful command: 1
  - await the group before sending the 504: 1 fail, 1 cancelled
  - pass the full env to children: 4
  - drop the `..` check: 2
  - release the lock immediately: 3
  - no body limit: 2
  - accept any defined value for `on`: 2
  - display handler never resolves: suite aborts fast
  - status handler never resolves: 36 cancelled, rc=1, 0.3 s
  - silent 404: suite aborts fast
  - guard before route check: survives, 0 fail (Minor 3)
- Real server runs: `serve.mjs --helper --helper-power cec-ctl` with fake binaries on PATH. They checked the concurrent `busy` 503, the 504 timing (Minor 1) and the orphan after SIGTERM (Minor 2).

Files read: `git diff --cached` (scripts/device-helper.mjs, scripts/serve.mjs, tests/device-helper.test.js); staged scripts/device-helper.mjs (full); staged scripts/serve.mjs (opt(), request handler, listen); scripts/net.mjs (imported); package.json (test script / engine); grep of the test file for test names and timeouts.

**Verdict:** APPROVE
