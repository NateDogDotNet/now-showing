produced_by: orchestrator-reviewer · model: claude-opus-5-5 · effort: low · phase: device-helper-server · round: r4 · mode: cold
**Verdict:** APPROVE

Reviewer: device-helper-server-review-cold-r4 · Model: claude-opus-5-5 · Dispatched: 2026-10-08T23:59:30Z · Method: cold code review · Scope: device-helper-server, r4, base HEAD 0914090f17cad390dc9b81b4b1d8927ca07c110a, staged tree f9da92e522aaeb9599065aee81b286d1f596efcb

## Summary

The helper is reachable only when `--helper` is given. Every route that exists checks three things: the socket peer is loopback, the Host is loopback (hostname only), and the request carries the header `X-Poster-Helper: 1`. It never sends a CORS grant, and an OPTIONS preflight gets a 404. Together these block access from the LAN, CSRF with simple form posts, and DNS rebinding. Nothing from the request body reaches argv: it is fixed per strategy, and the only request input is `on`, a boolean that picks between two hard-coded flags. Children are spawned without a shell, get an env of PATH only (plus the validated compositor variables for wlr-randr), and run detached in their own process group. Only one command runs at a time. On timeout the whole process group is killed. I found no Critical or Important issues. I list three Minor ones: two are gaps where the tests have no teeth, one is a small gap in lifecycle handling.

### Strengths
- Guards are applied on every route that exists, in a fixed order, and proxy headers are never consulted. Removing any one of the peer, Host or header checks fails 3 tests each (mutation results below).
- Config is validated at startup (`check()` with anchored regexes and a `..` segment ban), and bad values make serve.mjs exit non-zero instead of starting in a degraded state.
- The timeout path really kills forked grandchildren. The real-process test (tests/device-helper.test.js:412) proves it, and disabling `killGroup` or `detached: true` makes it fail.
- An oversized body gets a real 413 over the socket, without a reset, at both 2 KB and 200 KB (integration test). The lock is never taken while a body is being read, so a slow body cannot hold the lock.
- Command output and stderr are never echoed back (stderr is ignored; 502 and 504 bodies are fixed strings).

### Critical
None.

### Important
None.

### Minor
1. **The real executor's exit-code handling is untested: a `realExecFile` that always reports success passes the whole suite.** Location: scripts/device-helper.mjs:64. Evidence: I mutated it to `finish(null)` and the result was `# pass 43 # fail 0`. The only 502 test (tests/device-helper.test.js:466) injects a fake execFile. I did confirm the shipped code behaves correctly: in a probe, a real `cec-ctl` that runs `exit 3` gave `[502, {"error":"command failed"}]`. Why it matters: if this mapping regressed, a failed CEC command would report `{"ok":true}` to the kiosk. Class: code-bug (test gap; the behaviour is correct today). Fix: add a real-binary test, in the style of the one at :431, using a fake `cec-ctl` that runs `exit 3` and expects 502.
2. **The wait-until-the-group-is-gone loop in `defaultKillGroup` has no teeth, and it gives up silently after about 2 s.** Location: scripts/device-helper.mjs:41-44. Evidence: changing the loop bound to 0 (kill, then return at once) still gave `# pass 43 # fail 0`, because SIGKILL removes `sleep` before the next command anyway. The loop also returns after 200 x 10 ms even when the group is still alive, for example a process in uninterruptible sleep on `/dev/cec0`. In that case the lock is released, which contradicts the header comment at :14-15 ("the lock is only released once the group is gone"). Class: code-bug (the comment overstates; low practical impact). Fix: either make the comment match, or keep the lock and log when the group survives the grace period, and add a test with an injected `process.kill` stub.
3. **When a command succeeds, any background descendants it left behind survive in the detached group, and the lock is released.** Evidence: a real `cec-ctl` that forked `sleep 30 >/dev/null &` and then exited 0 returned `200` in 11 ms, and afterwards `grandchild after successful exit alive: true`. Only the timeout path kills the group. Why it matters: this is minor because the shipped strategies run fixed system binaries that do not fork, but the one-at-a-time guarantee covers only the direct child. Class: spec-gap (nothing in the code states what should happen to descendants after a clean exit). Fix (optional): call `killGroup(child.pid)` after every exit, ignoring ESRCH.

### Declined to judge
- **The reverse-proxy hazard** (header comment, line 16): it depends on deployment, is documented, and is outside this diff.
- **Same-origin script on the kiosk page:** any script served from the app origin can call the helper by design. Whether the app's own pages are XSS-free is outside this diff.
- **Command syntax:** whether the cec-ctl, cec-client and wlr-randr argv are correct on real hardware is marked "(verify)" in the code and cannot be checked here.
- **Status code for unguarded requests:** a non-loopback client can tell that the helper is enabled (known routes give 403, unknown routes give 404). This is a product choice, and the code documents it (guards apply to "routes that exist").

### Recommendations
Add the real-binary exit-code test (item 1). Fix the comment or the behaviour for item 2. Everything else is optional.

## What I read and ran
- `git diff --cached` in /home/user/wt-device-helper-server, which covers scripts/device-helper.mjs (staged, read in full), the scripts/serve.mjs diff and its `opt()` parser (lines 25-35), and tests/device-helper.test.js (read in full). I also read scripts/net.mjs, which the changed code imports, and package.json for the test command.
- I extracted tree f9da92e into a scratch dir made with `mktemp -d` (`/tmp/tmp.W7gBQK534l`) using `git archive f9da92e | tar -x`, and removed it afterwards. The live worktree was not touched: `git status --short` was unchanged before and after.
- `node --test tests/device-helper.test.js` (Node v22.22.0) gave 43/43 passing. `npm test` gave 86/86 passing.
- I ran 18 mutations of scripts/device-helper.mjs, restoring the original after each and confirming the restore with `cmp`:
  - **Caught (at least one test failed or was cancelled):** each of the three guards removed, `shell: true`, `detached: false`, no killGroup, no `child.kill`, MAX_BODY 4096, the env leaked into children, no lock on vcgencmd, the vcgencmd regex unanchored, no `..` check, the timeout raised to 6 s, and the display lock check removed (12 tests cancelled).
  - **Survived:** the killGroup wait loop removed (item 2), the exit code ignored (item 1), stdout unbounded, and the drain `destroy` removed. The last two are not worth extra tests.
- I ran a probe script with a real fake `cec-ctl` on PATH. It showed that an exit-0 command that forks leaves its grandchild running (item 3), and that an `exit 3` command gives 502.

Files read: scripts/device-helper.mjs (staged), scripts/serve.mjs (staged diff and lines 25-60), tests/device-helper.test.js (staged), scripts/net.mjs, package.json.

**Verdict:** APPROVE
