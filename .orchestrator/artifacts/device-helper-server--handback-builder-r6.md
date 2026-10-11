produced_by: orchestrator-builder · model: claude-sonnet-5-5 · effort: high · phase: device-helper-server · round: r6
status: complete        failure_class: n/a
paths: /home/user/wt-device-helper-server/scripts/device-helper.mjs, /home/user/wt-device-helper-server/tests/device-helper.test.js, /home/user/wt-device-helper-server/scripts/serve.mjs (staged, unchanged this round), /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--red-r6.log, /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--mutation-r6.txt, /home/user/plex-poster-app/.orchestrator/artifacts/device-helper-server--handback-builder-r6.md
criteria: 1 met (node --test tests/device-helper.test.js: 50/50, ~4.8 s) · 2 met (npm test: 93/93) · 3 met (exit 0) · 4 met (exit 0) · 5 met (exit 0) · 6 met (exit 0) · eslint with round--eslint-r1e.config.mjs on the 3 files: exit 0 · 7 not attempted (narrated, reviewer's)
deviations: (a) Item 3 (C1) cannot be pasted failing before the code change: the shipped realExecFile already maps a non-zero exit to 502 (the cold reviewer said so), so that test passes against the old code. Its teeth are shown by the mutant `exec-always-success` (below), which it kills. (b) Edits to tests that already existed, forced by the new behaviour (the 504 now arrives before the lock is released): in 'commands are spawned detached…' a 30 ms wait before the final call; in the real-grandchild test, polling instead of an immediate assertion. (c) fakeExec in the test file now returns pid undefined by default (opt-in `pid`): before, it returned 4242 and the default group kill, which ran on the timeout path, would have sent SIGKILL to the real group -4242 if one existed; with item 4 that would have happened after every fake command. (d) `killProcessGroup` is now an exported name of scripts/device-helper.mjs (needed for the tests; the helper's `killGroup` option is unchanged and defaults to it). scripts/serve.mjs not changed this round.
questions: none

Agent: device-helper-server-builder-r6 · dispatched: 2026-10-09T00:14:18Z

## What changed

scripts/device-helper.mjs
- `killProcessGroup(pid, { kill, alive, maxMs = 10000, stepMs = 20, warn = console.warn })` (exported, replaces `defaultKillGroup`): SIGKILL to `-pid` (ESRCH returns at once; pid <= 1 or non-integer is a no-op), then polls `alive(pgid)` until false. Default `alive` = signal 0 on the group, then on Linux a scan of `/proc/<pid>/stat` for members with that pgrp whose state is not `Z`; a group of only zombies counts as gone. Without `/proc`, signal 0 alone decides. After `maxMs` it logs `device helper: process group <pgid> is still alive <maxMs> ms after SIGKILL; releasing the lock` and returns.
- `run()` now resolves `{ result, stdout, gone }`. On timeout it returns at once (so the 504 is sent when the 5 s timer fires) with `gone` = a promise (never rejects) for the group kill-and-wait. On ok and error (item 4 / K8) it kills the group and waits before returning, `gone: null`.
- `unlock(out)`: callers (display and the vcgencmd read in `readTemp`) release `busy` right away when `gone` is null, else when `gone` settles. So the lock is held until the group is gone (or the 10 s bound), and a 504 is not delayed by it.
- Header comment now states exactly this behaviour.
- The /proc regex uses `.match(...)`, not `.exec(`, because plan criterion 3 greps for `\bexec\(`.

tests/device-helper.test.js (7 new tests, 3 edited, imports `after` and `killProcessGroup`)
- `the real executor maps a non-zero exit to 502 …` (C1): stub cec-ctl `exit 3` -> 502, body `{"error":"command failed"}`, lock freed; a missing binary -> 502.
- `after every command, success or failure, its process group is killed …` (K8): stub backgrounds `sleep 30`, exits 0 (-> 200) and 3 (-> 502); the sleep is dead when the response arrives; the lock is free.
- `the 504 is sent when the timeout fires; the lock is kept until the process group is gone` (A1): a gated killGroup; the response must arrive while the gate is closed; 503 while locked; free after release.
- `the lock is held while any group member is alive …` (A1/C2): the exported `killProcessGroup` with an `alive` stub flag through the helper: 504, then 503 while alive, then free; no warning.
- `killProcessGroup signals the whole group, waits while it is alive, …`: kill args `[-777,'SIGKILL']`, does not resolve while alive, ignores pid <= 1 / non-integer, ESRCH polls nothing.
- `killProcessGroup gives up after maxMs, logs a warning naming the pgid, and returns`.
- `a group whose only remaining members are zombies counts as gone`: a real zombie group (`setsid sleep 0.1` whose parent `sleep 60` never reaps it); precondition `kill(-pgid,0)` succeeds; `killProcessGroup` with the real default `alive` returns in < 1.5 s without a warning.
- A2: the real hung-command test uses `sleep 30` (was 300), `{ timeout: 15000 }`, and polls for the kill; an `after()` hook SIGKILLs every pid the tests recorded in `strays`, so a regressed group kill fails within the per-test timeout and cannot keep the process alive.

## RED: new tests failing before the code change

Run against the unchanged scripts/device-helper.mjs (copy in mktemp -d; log: `.orchestrator/artifacts/device-helper-server--red-r6.log`). The raw run fails as a whole, `SyntaxError: The requested module '../scripts/device-helper.mjs' does not provide an export named 'killProcessGroup'`, so for per-test results the copy's import was rewritten to a namespace import (the missing export becomes undefined):

```
ok 37 - a failing command -> 502 and the lock is released
ok 38 - the real executor maps a non-zero exit to 502 with the fixed error body, and frees the lock   (see deviation a)
not ok 39 - after every command, success or failure, its process group is killed before the lock is released   (expected false, actual true: the sleep outlived the command)
not ok 40 - the 504 is sent when the timeout fires; the lock is kept until the process group is gone   (error: 'the response was held back until the group was gone')
not ok 41 - the lock is held while any group member is alive and released when none is   (expected 503, actual 504)
not ok 42 - killProcessGroup signals the whole group, waits while it is alive, and ignores an already-gone group   (TypeError)
not ok 43 - killProcessGroup gives up after maxMs, logs a warning naming the pgid, and returns   (TypeError)
not ok 44 - a group whose only remaining members are zombies counts as gone   (TypeError)
# tests 50  # pass 44  # fail 6
```

## GREEN

```
$ node --test tests/device-helper.test.js     # tests 50  pass 50  fail 0  cancelled 0  duration_ms ~4800 (3 runs: 4854, 4896, 4706; final 4811)
$ npm test                                    # tests 93  pass 93  fail 0  cancelled 0
$ npx eslint -c .orchestrator/artifacts/round--eslint-r1e.config.mjs scripts/device-helper.mjs scripts/serve.mjs tests/device-helper.test.js   -> exit 0
C3 test -f scripts/device-helper.mjs && ! grep -nE "\bexec\(|execSync|shell: *true" scripts/device-helper.mjs   -> exit 0
C4 ! grep -n 'Access-Control-Allow' scripts/device-helper.mjs scripts/serve.mjs                                  -> exit 0
C5 ! grep -niE 'brightness|ddcutil|backlight|vcgencmd display_power' scripts/device-helper.mjs                   -> exit 0
C6 test -z "$(git status --porcelain -- js css index.html sw.js scripts/net.mjs scripts/mock-plex.mjs)"           -> exit 0
git status --short:  A scripts/device-helper.mjs / M scripts/serve.mjs / A tests/device-helper.test.js   (all staged, nothing committed)
```

## Mutants (mktemp -d copy; file restored and `cmp`'d; full output in `device-helper-server--mutation-r6.txt`)

```
no-wait-loop            (while (await alive(pid)) -> while (false))   killed: 41, 42, 43
no-group-kill-after-ok  (K8 removed)                                   killed: 39
hold-504-on-group       (await group before answering a timeout)       killed: 40, 41
exec-always-success     (realExecFile finish(null))                    killed: 38, 39
zombies-count-alive     (drop the Z test)                              killed: 44
kill-pid-not-group      (kill(pid) not kill(-pid))                     killed: 33, 39, 42
silent-give-up          (no warn)                                      killed: 43
unlock-immediately      (lock freed before the group is gone)          killed: 32, 40, 41
```
Each: `# fail` 1 to 3, none timed out the suite.

## Live check

Real `serve.mjs --helper --helper-power cec-ctl` on a free port with a stub `cec-ctl` that forks `sleep 30` and waits: `first: 504 5.014756s` (was 6.88 s in the r4 review, where zombies kept the group visible). No `sleep 30` was left afterwards. The server I started was stopped (pid 3058, checked gone). The busy-check curl in that run printed 000 because the shell variable for the port was lost in my one-liner, so it shows nothing; the 503-while-locked behaviour is covered by the tests above, not by that probe.

## Notes for the conductor

- When a command exits but a background child still holds its stdout pipe, node's `close` event waits for the pipe, so that case ends as a 5 s timeout (504) and the group is then killed. The K8 test uses `>/dev/null` on the background sleep, as in the cold reviewer's probe. Not changed; no new behaviour added.
- Pid reuse: after a normal exit the group kill signals `-pid` for a pid that was a group leader a moment ago. Only members of that group can be hit; the window is the few ms between the child's `close` and the kill.
